(function (global) {
  "use strict";

  var core = global.__PR_MCP_PANEL_CORE__;
  var scripts = global.__PR_MCP_PANEL_SCRIPTS__;
  var runtimeApi = global.__PR_MCP_PANEL_RUNTIME__;

  if (!core || !scripts || !runtimeApi) {
    throw new Error("panel.js requires panel-core.js, panel-scripts.js, and panel-runtime.js");
  }

  global.__PR_MCP_PANEL__ = {
    PANEL_VERSION: core.VERSION,
    VERSION: core.VERSION,
    quoteJsString: core.quoteEs,
    buildWriteFileScript: core.writeScript,
    buildReadCommandScript: scripts.buildReadCommandScript,
    buildChooseProjectScript: scripts.buildChooseProjectScript,
    readCommandFile: core.readFs,
    buildActionScript: scripts.buildActionScript,
    buildScript: scripts.buildScript,
    createPanelRuntime: runtimeApi.createPanelRuntime,
    createVisiblePanelController: runtimeApi.createVisiblePanelController,
    createRuntime: runtimeApi.createRuntime,
    createController: runtimeApi.createController,
    normPath: core.normPath,
    quoteEs: core.quoteEs,
    getReadyStatus: core.readyMsg,
    shouldPollExtension: core.shouldPoll,
    getCompanionExtensionToOpen: core.companionOf,
    shouldPoll: core.shouldPoll,
    readyMsg: core.readyMsg,
  };

  if (typeof global.CSInterface !== "function" || !global.document) {
    return;
  }

  var cs = new global.CSInterface();
  var extId = typeof cs.getExtensionID === "function" ? cs.getExtensionID() : "";
  var ui = (typeof global.bridgeUi === "object" && global.bridgeUi) || null;
  var fs = core.getFs(global);
  var companion = core.companionOf(extId);

  var runtime = runtimeApi.createRuntime({
    cs: cs,
    fs: fs,
    extId: extId,
    g: global,
    setTimer: function (fn, ms) { return global.setTimeout(fn, ms); },
    clearTimer: function (handle) { return global.clearTimeout(handle); },
    onStatus: function (message) {
      var node = global.document.getElementById("status");
      var display = core.localStatus(message);
      if (node) {
        node.textContent = display;
      }
      if (!ui) {
        return;
      }

      var isError = message.indexOf("error:") === 0;
      var isStopped = message === "stopped";
      ui.log(display, isError ? "error" : isStopped ? "warning" : "info");

      if (isStopped) {
        ui.setBridgeStatus(false, "已停止");
      } else if (message.indexOf("ready") !== -1 || message.indexOf("done:") === 0 || message.indexOf("running:") === 0) {
        ui.setBridgeStatus(true, "已连接");
      } else if (isError) {
        ui.setBridgeStatus(true, "已连接（异常）");
      }
    },
  });

  var controller = runtimeApi.createVisiblePanelController({
    cs: cs,
    fs: fs,
    ui: ui,
    extensionId: extId,
    requestWorker: function () {
      if (companion && typeof cs.requestOpenExtension === "function") {
        cs.requestOpenExtension(companion, "");
      }
    },
    setTimer: function (fn, ms) { return global.setTimeout(fn, ms); },
    clearTimer: function (handle) { return global.clearTimeout(handle); },
  });

  if (ui) {
    var control = core.readControl(fs, core.CONTROL_FILE);
    ui.setBridgeStatus(control.enabled !== false, control.enabled === false ? "已停止" : "已连接");
    ui.setMetaDir(core.BRIDGE_DIR);
    ui.setMetaMode("CEP 运行时");
  }

  var inputDir = global.document.getElementById("inputBridgeDir");
  if (inputDir) {
    inputDir.value = core.BRIDGE_DIR;
  }

  global.panelUiStartBridge = function () {
    if (ui) {
      ui.log("桥接启动请求已发送", "info");
    }
    controller.startBridge();
  };
  global.panelUiStopBridge = function () {
    controller.stopBridge();
  };
  global.panelUiChooseProject = function () {
    controller.chooseProject();
  };
  global.panelUiOnFileChosen = function (input) {
    var file = input && input.files && input.files[0];
    controller.onFileChosen(file);
  };
  global.panelUiOpenProject = function () {
    controller.openProject();
  };
  global.panelUiClearLog = function () {
    if (ui) {
      ui.clearLog();
    }
  };
  global.panelUiSaveConfig = function () {
    var input = global.document.getElementById("inputBridgeDir");
    var value = input ? input.value.replace(/^\s+|\s+$/g, "") : "";
    if (!value) {
      if (ui) {
        ui.log("桥接目录不能为空", "warning");
      }
      return;
    }
    try {
      global.localStorage.setItem("pr_mcp_bridge_dir", value);
    } catch (_) {}
    if (ui) {
      ui.setMetaDir(value);
      ui.log("桥接目录已保存：" + value + "。重新加载面板后生效。", "info");
    }
  };
  global.panelUiTestConnection = function () {
    if (ui) {
      ui.log("正在测试 Premiere 连接...", "info");
    }
    cs.evalScript(
      "(function(){try{return JSON.stringify({ok:true,appVersion:app.version});}catch(e){return JSON.stringify({ok:false,error:String(e)});}})();",
      function (raw) {
        try {
          var result = JSON.parse(raw);
          if (result && result.ok) {
            if (ui) {
              ui.setPremiereStatus(true, "Premiere Pro 已连接 · " + (result.appVersion || ""));
              ui.log("Premiere 检测成功：" + raw, "info");
            }
          } else if (ui) {
            ui.setPremiereStatus(false, "Premiere Pro 连接异常");
            ui.log("Premiere 返回错误：" + raw, "error");
          }
        } catch (_) {
          if (ui) {
            ui.setPremiereStatus(false, "Premiere Pro 无响应");
            ui.log("Premiere 无响应：" + String(raw), "warning");
          }
        }
      },
    );
  };

  if (companion && typeof cs.requestOpenExtension === "function") {
    cs.requestOpenExtension(companion, "");
  }

  cs.evalScript(
    "(function(){try{var p=app.project&&app.project.path?String(app.project.path):'';return JSON.stringify({ok:true,path:p});}catch(e){return JSON.stringify({ok:false});}})();",
    function (raw) {
      try {
        var response = JSON.parse(raw);
        if (response && response.ok && response.path) {
          controller.setPath(response.path);
          if (ui) {
            ui.log("已自动识别当前项目：" + response.path, "info");
          }
        }
      } catch (_) {}
    },
  );

  if (core.shouldPoll(extId)) {
    runtime.start();
    return;
  }

  var statusNode = global.document.getElementById("status");
  var readyMessage = core.localStatus(core.readyMsg(extId, core.VERSION));
  if (statusNode) {
    statusNode.textContent = readyMessage;
  }
  if (ui) {
    ui.log(readyMessage, "info");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
