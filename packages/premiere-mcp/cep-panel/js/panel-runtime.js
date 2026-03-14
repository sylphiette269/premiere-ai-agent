(function (global) {
  "use strict";

  var core = global.__PR_MCP_PANEL_CORE__;
  var scripts = global.__PR_MCP_PANEL_SCRIPTS__;

  if (!core || !scripts) {
    throw new Error("panel-runtime.js requires panel-core.js and panel-scripts.js");
  }

  function createRuntime(opts) {
    var cs = opts.cs;
    var fs = opts.fs || core.getFs(opts.g || global);
    var onStatus = opts.onStatus || function () {};
    var setTimer = opts.setTimer || function (fn, delayMs) { return global.setTimeout(fn, delayMs); };
    var clearTimer = opts.clearTimer || function (handle) { if (handle != null && global.clearTimeout) global.clearTimeout(handle); };

    function appendLog(message) {
      cs.evalScript(core.writeScript(core.LOG_FILE, new Date().toISOString() + " " + message + "\n", true));
    }

    function emit(result, rspFile) {
      appendLog("write_result " + core.safeJson(result));
      core.writeResult(cs, result, rspFile || core.RESULT_FILE);
    }

    function publishStatus() {
      cs.evalScript(
        core.writeScript(
          core.STATUS_FILE,
          core.safeJson(core.bridgeStatus(fs, opts.extId, core.VERSION)),
          false,
        ),
      );
    }

    function evalWithTimeout(label, script, callback) {
      var settled = false;
      var handle = setTimer(function () {
        if (settled) {
          return;
        }
        settled = true;
        appendLog(label + " timeout");
        callback("EvalScript timeout.");
      }, 30000);

      try {
        cs.evalScript(script, function (result) {
          if (settled) {
            return;
          }
          settled = true;
          clearTimer(handle);
          appendLog(label + " " + String(result));
          callback(result);
        });
      } catch (error) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(handle);
        appendLog(label + " threw " + String(error));
        callback("EvalScript threw: " + String(error));
      }
    }

    function parseJsonResult(raw) {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }

    function emitParsedResult(parsed, cmd, rspFile) {
      emit(parsed, rspFile);
      if (parsed && parsed.ok === false) {
        onStatus("error: " + String(parsed.error || cmd.action || "script_error"));
      } else {
        onStatus("done: " + String(cmd.action || "raw_script"));
      }
    }

    function createSequenceModes(cmd, support) {
      var hasMediaPath = !!(cmd && cmd.params && cmd.params.mediaPath);
      var avoidCreateNewSequence = !(
        cmd &&
        cmd.params &&
        cmd.params.avoidCreateNewSequence === false
      );
      var modes = [];

      function allow(flagName) {
        if (!support || typeof support[flagName] !== "boolean") {
          return true;
        }
        return support[flagName];
      }

      if (hasMediaPath && allow("hasProjectCreateNewSequenceFromClips")) {
        modes.push("createNewSequenceFromClips");
      }
      if (allow("hasQeProjectNewSequence")) {
        modes.push("qe.project.newSequence");
      }
      if (!avoidCreateNewSequence && allow("hasProjectCreateNewSequence")) {
        modes.push("createNewSequence");
      }
      if (allow("hasProjectNewSequence")) {
        modes.push("newSequence");
      }

      return modes;
    }

    function runCreateSequenceAttempts(cmd, rspFile, support) {
      var presetPath = support && typeof support.presetPath === "string"
        ? String(support.presetPath)
        : "";
      var modes = createSequenceModes(cmd, support);
      var cursor = 0;

      function scheduleCreateSequenceConfirm(fn, delayMs) {
        var fired = false;

        function runOnce() {
          if (fired) {
            return;
          }
          fired = true;
          fn();
        }

        var handle = setTimer(runOnce, delayMs);
        if (!fired && handle == null) {
          runOnce();
        }
      }

      function nextAttempt(lastRaw) {
        if (cursor >= modes.length) {
          emit(
            {
              ok: false,
              error: "script_error",
              details: String(lastRaw || "create_sequence_attempts_exhausted"),
              id: cmd.id,
            },
            rspFile,
          );
          onStatus("error: script_error");
          return;
        }

        var mode = modes[cursor++];
        var attemptScript = scripts.buildCreateSequenceAttemptScript(cmd, mode, presetPath);
        appendLog("dispatch create_sequence attempt " + mode);
        evalWithTimeout("create_sequence attempt " + mode, attemptScript, function () {
          var confirmScript = scripts.buildCreateSequenceConfirmScript(cmd, mode, presetPath);
          var confirmDelay = (mode === "newSequence" || mode === "qe.project.newSequence") ? 5000 : 0;
          scheduleCreateSequenceConfirm(function () {
            if (mode === "newSequence" || mode === "qe.project.newSequence") {
              try { cs.evalScript("app.executeCommand(app.findMenuCommandId('OK'));"); } catch(_) {}
            }
            evalWithTimeout("create_sequence confirm " + mode, confirmScript, function (confirmRaw) {
              var confirmParsed = parseJsonResult(confirmRaw);
              if (!confirmParsed) {
                nextAttempt(confirmRaw);
                return;
              }
              if (confirmParsed.ok === true) {
                emitParsedResult(confirmParsed, cmd, rspFile);
                return;
              }
              if (
                confirmParsed.error === "created_sequence_not_found" ||
                confirmParsed.error === "sequence_not_activated"
              ) {
                nextAttempt(confirmRaw);
                return;
              }
              emitParsedResult(confirmParsed, cmd, rspFile);
            });
          }, confirmDelay);
        });
      }

      nextAttempt("");
    }

    function executeCreateSequence(cmd, rspFile) {
      var supportScript = scripts.buildCreateSequenceSupportScript(cmd);
      appendLog("dispatch create_sequence support");
      evalWithTimeout("create_sequence support", supportScript, function (supportRaw) {
        var supportParsed = parseJsonResult(supportRaw);
        if (supportParsed && supportParsed.ok === true) {
          runCreateSequenceAttempts(cmd, rspFile, supportParsed);
          return;
        }

        var directScript = scripts.buildActionScript(cmd);
        appendLog("dispatch create_sequence direct");
        evalWithTimeout("create_sequence direct", directScript, function (directRaw) {
          var directParsed = parseJsonResult(directRaw);
          if (directParsed) {
            emitParsedResult(directParsed, cmd, rspFile);
            return;
          }
          runCreateSequenceAttempts(cmd, rspFile, supportParsed);
        });
      });
    }

    function dispatch(cmd, rspFile) {
      if (core.isRawScript(cmd)) {
        appendLog("dispatch raw_script");
        evalWithTimeout("raw_script", String(cmd.script), function (raw) {
          try {
            emit(JSON.parse(raw), rspFile);
            onStatus("done: raw_script");
          } catch (_) {
            emit({ ok: false, error: "script_error", details: String(raw), id: cmd.id }, rspFile);
            onStatus("error: script_error");
          }
        });
        return;
      }

      if (cmd && cmd.action === "create_sequence") {
        executeCreateSequence(cmd, rspFile);
        return;
      }

      var script;
      try {
        script = scripts.buildActionScript(cmd);
      } catch (error) {
        emit(
          {
            ok: false,
            error: "build_script_failed",
            details: String(error),
            id: cmd.id || "",
          },
          rspFile,
        );
        onStatus("error: build_script_failed");
        return;
      }

      appendLog("dispatch " + cmd.action);
      evalWithTimeout("result " + cmd.action, script, function (raw) {
        try {
          emitParsedResult(JSON.parse(raw), cmd, rspFile);
        } catch (_) {
          emit({ ok: false, error: "script_error", details: String(raw), id: cmd.id }, rspFile);
          onStatus("error: script_error");
        }
      });
    }

    function handleCmd(content, rspFile) {
      if (!content || content === "undefined" || !content.replace(/^\s+|\s+$/g, "")) {
        return;
      }
      if (content === "__open_failed__") {
        emit({ ok: false, error: "command_read_failed", details: "open_failed", id: "" }, rspFile);
        onStatus("error: command_read_failed");
        return;
      }
      if (String(content).indexOf("__read_failed__:") === 0) {
        emit({ ok: false, error: "command_read_failed", details: content.slice(16), id: "" }, rspFile);
        onStatus("error: command_read_failed");
        return;
      }

      appendLog("cmd_raw " + String(content));

      var cmd;
      try {
        cmd = JSON.parse(content);
      } catch (error) {
        emit({ ok: false, error: "parse_error", details: String(error), id: "" }, rspFile);
        onStatus("error: parse_error");
        return;
      }

      if (core.isExpired(cmd)) {
        emit(
          { ok: false, error: "command_expired", expired: true, id: cmd.id || "" },
          rspFile || core.rspPath(cmd.id),
        );
        onStatus("error: command_expired");
        return;
      }

      onStatus("running: " + (core.isRawScript(cmd) ? "raw_script" : cmd.action));
      dispatch(cmd, rspFile || core.rspPath(cmd.id));
    }

    function poll() {
      if (fs) {
        var control = core.readControl(fs, core.CONTROL_FILE);
        if (control.enabled === false) {
          onStatus("stopped");
          setTimer(poll, 500);
          return;
        }
        var next = core.nextCmd(fs, core.BRIDGE_DIR, core.CMD_FILE);
        handleCmd(next.content, next.rspFile);
        setTimer(poll, 500);
        return;
      }

      cs.evalScript(core.readScript(core.CMD_FILE), function (content) {
        handleCmd(content, core.RESULT_FILE);
        setTimer(poll, 500);
      });
    }

    function start() {
      publishStatus();
      appendLog("started version=" + core.VERSION + " ext=" + String(opts.extId || ""));
      onStatus(core.readyMsg(opts.extId, core.VERSION));
      poll();
    }

    return {
      start: start,
      poll: poll,
      dispatch: dispatch,
      executeCmd: dispatch,
      emit: emit,
      appendLog: appendLog,
    };
  }

  function createController(opts) {
    var cs = opts.cs;
    var ui = opts.ui || null;
    var fs = opts.fs || core.getFs(opts.g || global);
    var setTimer = opts.setTimer || function (fn, delayMs) {
      return global.setTimeout ? global.setTimeout(fn, delayMs) : null;
    };
    var clearTimer = opts.clearTimer || function (handle) {
      if (handle != null && global.clearTimeout) {
        global.clearTimeout(handle);
      }
    };
    var selectedPath = "";
    var extensionId = String(opts.extensionId || opts.extId || "");
    var logSyncHandle = null;
    var logSnapshot = "";
    var logSize = -1;

    function log(message, level) {
      if (ui && typeof ui.log === "function") {
        ui.log(message, level || "info");
      }
    }

    function truncateText(value, maxLength) {
      var text = String(value || "");
      var limit = maxLength || 220;
      if (text.length <= limit) {
        return text;
      }
      return text.substring(0, limit - 3) + "...";
    }

    function splitLines(text) {
      return String(text || "")
        .split(/\r?\n/)
        .filter(function (line) { return !!line; });
    }

    function summarizeBridgePayload(eventName, payload) {
      var parsed = null;

      try {
        parsed = JSON.parse(payload);
      } catch (_) {}

      if (!parsed) {
        return {
          level: payload.indexOf("success\":false") !== -1 ? "error" : "info",
          message: truncateText(eventName + ": " + payload),
        };
      }

      if (parsed.success === false || parsed.ok === false) {
        return {
          level: "error",
          message: truncateText(eventName + ": " + String(parsed.error || parsed.message || "执行失败")),
        };
      }

      if (parsed.message) {
        return {
          level: "info",
          message: truncateText(eventName + ": " + String(parsed.message)),
        };
      }

      if (parsed.effectName) {
        return {
          level: "info",
          message: truncateText(eventName + ": effect " + String(parsed.effectName)),
        };
      }

      if (parsed.transitionName) {
        return {
          level: "info",
          message: truncateText(eventName + ": transition " + String(parsed.transitionName)),
        };
      }

      return {
        level: "info",
        message: truncateText(eventName + ": " + core.safeJson(parsed)),
      };
    }

    function formatBridgeLogLine(line) {
      var trimmed = String(line || "").replace(/\r/g, "").replace(/^\s+|\s+$/g, "");
      var match;
      var eventName;
      var payload;

      if (!trimmed) {
        return null;
      }

      match = /^\S+\s+(\S+)\s*(.*)$/.exec(trimmed);
      eventName = match ? match[1] : "";
      payload = match ? String(match[2] || "") : trimmed;

      if (eventName === "cmd_raw") {
        return null;
      }

      if (eventName === "dispatch") {
        return {
          level: "info",
          message: truncateText("dispatch " + payload),
        };
      }

      if (eventName === "raw_script" || eventName === "write_result") {
        return summarizeBridgePayload(eventName, payload);
      }

      if (
        eventName === "error:" ||
        payload.indexOf("command_expired") !== -1 ||
        payload.indexOf(" timeout") !== -1
      ) {
        return {
          level: "error",
          message: truncateText(eventName === "error:" ? payload : eventName + " " + payload),
        };
      }

      return {
        level: "info",
        message: truncateText(match ? eventName + (payload ? ": " + payload : "") : trimmed),
      };
    }

    function readBridgeLogText() {
      if (!fs || typeof fs.existsSync !== "function" || typeof fs.readFileSync !== "function") {
        return null;
      }

      if (!fs.existsSync(core.LOG_FILE)) {
        logSnapshot = "";
        logSize = -1;
        return "";
      }

      try {
        if (typeof fs.statSync === "function") {
          var nextSize = fs.statSync(core.LOG_FILE).size;
          if (nextSize === logSize && logSnapshot) {
            return null;
          }
          logSize = nextSize;
        }
        return String(fs.readFileSync(core.LOG_FILE, "utf8") || "");
      } catch (_) {
        return "";
      }
    }

    function extractBridgeLogDelta(nextText) {
      var lines;
      var delta;

      if (nextText === null) {
        return [];
      }

      if (!logSnapshot) {
        logSnapshot = nextText;
        lines = splitLines(nextText);
        return lines.slice(-12);
      }

      if (nextText === logSnapshot) {
        return [];
      }

      if (nextText.indexOf(logSnapshot) === 0) {
        delta = nextText.substring(logSnapshot.length);
      } else {
        delta = nextText;
      }

      logSnapshot = nextText;
      return splitLines(delta);
    }

    function syncBridgeLog() {
      var nextText = readBridgeLogText();
      var lines = extractBridgeLogDelta(nextText);
      var index;
      var entry;

      for (index = 0; index < lines.length; index++) {
        entry = formatBridgeLogLine(lines[index]);
        if (!entry) {
          continue;
        }
        log(entry.message, entry.level);
      }

      logSyncHandle = setTimer(syncBridgeLog, 1000);
    }

    function startLogSync() {
      if (logSyncHandle != null) {
        return;
      }
      syncBridgeLog();
    }

    function stopLogSync() {
      if (logSyncHandle != null) {
        clearTimer(logSyncHandle);
        logSyncHandle = null;
      }
    }

    function setPath(value) {
      selectedPath = core.normPath(value || "");
      if (ui && typeof ui.setProjectPath === "function") {
        ui.setProjectPath(selectedPath);
      }
    }

    function activatePanel() {
      if (!extensionId || !cs || typeof cs.requestOpenExtension !== "function") {
        return;
      }
      try {
        cs.requestOpenExtension(extensionId, "");
      } catch (_) {}
    }

    function continueChooseProject() {
      if (triggerHtmlProjectPicker()) {
        return;
      }

      if (!cs || typeof cs.evalScript !== "function") {
        log("project_picker_unavailable", "error");
        return;
      }

      log("html_picker_unavailable_fallback_extendscript", "warning");
      cs.evalScript(scripts.buildChooseProjectScript(), function (raw) {
        var response;
        try {
          response = JSON.parse(raw);
        } catch (_) {}

        if (response && response.ok && response.path) {
          setPath(response.path);
          log("project_selected: " + response.path);
        } else if (response && response.cancelled) {
          log("project_selection_cancelled", "warning");
        } else {
          log("project_selection_failed: " + String(raw), "error");
        }
      });
    }

    function bringHostToFront(next) {
      if (!cs || typeof cs.evalScript !== "function" || !scripts || typeof scripts.buildBringHostToFrontScript !== "function") {
        next();
        return;
      }

      var settled = false;

      function runNext() {
        if (settled) {
          return;
        }
        settled = true;
        next();
      }

      try {
        cs.evalScript(scripts.buildBringHostToFrontScript(), function () {
          runNext();
        });
      } catch (_) {
        runNext();
      }
    }

    function triggerHtmlProjectPicker() {
      var input = global.document && global.document.getElementById("projectFileInput");
      if (!input) {
        return false;
      }
      input.value = "";
      try {
        if (typeof global.focus === "function") {
          global.focus();
        }
      } catch (_) {}
      try {
        if (typeof input.focus === "function") {
          input.focus();
        }
      } catch (_) {}
      if (typeof input.click === "function") {
        input.click();
        return true;
      }
      return false;
    }

    function chooseProject() {
      activatePanel();
      bringHostToFront(function () {
        continueChooseProject();
      });
    }

    function onFileChosen(file) {
      if (!file) {
        return;
      }
      var path = core.normPath(file.path || file.name || "");
      if (path) {
        setPath(path);
        log("已选择项目：" + path);
      }
    }

    function openProject() {
      if (!selectedPath) {
        log("请先选择 .prproj 项目文件", "warning");
        return;
      }

      cs.evalScript(
        scripts.buildActionScript({
          id: "panel-open-" + Date.now(),
          action: "open_project",
          params: { path: selectedPath },
        }),
        function (raw) {
          var response;
          try {
            response = JSON.parse(raw);
          } catch (_) {}

          if (response && response.ok) {
            setPath(response.projectPath || selectedPath);
            if (ui && typeof ui.setPremiereStatus === "function") {
              ui.setPremiereStatus(true, "项目已在 Premiere 中打开");
            }
            log("项目已打开：" + (response.projectPath || selectedPath));
          } else {
            if (ui && typeof ui.setPremiereStatus === "function") {
              ui.setPremiereStatus(false, "Premiere 打开失败");
            }
            log("打开项目失败：" + String(raw), "error");
          }
        },
      );
    }

    function startBridge() {
      if (typeof opts.writeBridgeControl === "function") {
        opts.writeBridgeControl(true);
      } else {
        core.writeControl(cs, opts.fs, true, opts.extId, core.CONTROL_FILE);
      }
      if (typeof opts.requestWorker === "function") {
        opts.requestWorker();
      }
      if (ui && typeof ui.setBridgeStatus === "function") {
        ui.setBridgeStatus(true, "已连接");
      }
      log("桥接已启动");
    }

    function stopBridge() {
      if (typeof opts.writeBridgeControl === "function") {
        opts.writeBridgeControl(false);
      } else {
        core.writeControl(cs, opts.fs, false, opts.extId, core.CONTROL_FILE);
      }
      if (ui && typeof ui.setBridgeStatus === "function") {
        ui.setBridgeStatus(false, "已停止");
      }
      log("桥接已停止", "warning");
    }

    return {
      chooseProject: chooseProject,
      onFileChosen: onFileChosen,
      openProject: openProject,
      setPath: setPath,
      startBridge: startBridge,
      stopBridge: stopBridge,
      startLogSync: startLogSync,
      stopLogSync: stopLogSync,
    };
  }

  function createPanelRuntime(opts) {
    return createRuntime({
      cs: opts.cs,
      fs: opts.bridgeFs,
      extId: opts.extensionId || "",
      g: global,
      onStatus: typeof opts.updateStatus === "function" ? opts.updateStatus : function () {},
      setTimer: opts.setTimer || function (fn, ms) { return global.setTimeout(fn, ms); },
      clearTimer: opts.clearTimer || function (handle) { if (handle != null && global.clearTimeout) global.clearTimeout(handle); },
    });
  }

  function createVisiblePanelController(opts) {
    var controller = createController({
      cs: opts.cs,
      fs: opts.fs,
      ui: opts.ui,
      writeBridgeControl: opts.writeBridgeControl,
      extensionId: opts.extensionId,
      setTimer: opts.setTimer,
      clearTimer: opts.clearTimer,
    });

    if (!core.shouldPoll(opts.extensionId || "")) {
      controller.startLogSync();
    }

    return controller;
  }

  global.__PR_MCP_PANEL_RUNTIME__ = {
    createRuntime: createRuntime,
    createController: createController,
    createPanelRuntime: createPanelRuntime,
    createVisiblePanelController: createVisiblePanelController,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
