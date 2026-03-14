(function (global) {
  "use strict";

  var VERSION = "20260311";
  var DEFAULT_DIR = "C:/pr-mcp-cmd";

  function resolveDir(g) {
    var value = "";

    if (g && typeof g.__PR_MCP_BRIDGE_DIR__ === "string") {
      value = String(g.__PR_MCP_BRIDGE_DIR__);
    }

    if (!value || !value.replace(/^\s+|\s+$/g, "")) {
      try {
        var stored = g && g.localStorage && g.localStorage.getItem("pr_mcp_bridge_dir");
        if (stored) {
          value = String(stored);
        }
      } catch (_) {}
    }

    value = value.replace(/^\s+|\s+$/g, "");
    return stripSlash(value || DEFAULT_DIR);
  }

  function stripSlash(value) {
    var normalized = String(value || "").split("\\").join("/");
    while (normalized.length && normalized.charAt(normalized.length - 1) === "/") {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  function normPath(value) {
    return String(value || "").split("\\").join("/");
  }

  function asciiJson(value) {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, function (char) {
      return "\\u" + ("0000" + char.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function safeJson(value) {
    try {
      return asciiJson(value);
    } catch (error) {
      return asciiJson({ ok: false, error: "stringify_error", details: String(error) });
    }
  }

  function quoteEs(value) {
    return asciiJson(String(value));
  }

  function buildPaths(bridgeDir) {
    var dir = stripSlash(bridgeDir);

    function bridgePath(name) {
      return dir + "/" + String(name);
    }

    return {
      BRIDGE_DIR: dir,
      CMD_FILE: bridgePath("cmd.json"),
      RESULT_FILE: bridgePath("result.json"),
      STATUS_FILE: bridgePath("bridge-status.json"),
      LOG_FILE: bridgePath("panel.log"),
      CONTROL_FILE: bridgePath("bridge-control.json"),
      bridgePath: bridgePath,
      rspPath: function rspPath(id) {
        return bridgePath("response-" + String(id || "") + ".json");
      },
    };
  }

  function readFs(fs, filePath) {
    if (!fs || typeof fs.existsSync !== "function") {
      return "";
    }
    if (!fs.existsSync(filePath)) {
      return "";
    }
    try {
      var content = fs.readFileSync(filePath, "utf8");
      fs.unlinkSync(filePath);
      return String(content || "");
    } catch (error) {
      return "__read_failed__:" + String(error);
    }
  }

  function nextCmd(fs, dir, legacyFile) {
    var rootDir = stripSlash(dir);

    function joinPath(name) {
      return rootDir + "/" + String(name);
    }

    if (fs && typeof fs.readdirSync === "function") {
      try {
        var entries = fs.readdirSync(rootDir) || [];
        var commands = [];
        for (var index = 0; index < entries.length; index++) {
          if (/^(command|cmd)-.*\.json$/.test(String(entries[index]))) {
            commands.push(String(entries[index]));
          }
        }
        commands.sort();
        if (commands.length) {
          var name = commands[0];
          var commandPath = joinPath(name);
          var responsePath = joinPath(
            name.indexOf("command-") === 0
              ? name.replace(/^command-/, "response-")
              : name.replace(/^cmd-/, "rsp-"),
          );
          try {
            var payload = fs.readFileSync(commandPath, "utf8");
            fs.unlinkSync(commandPath);
            return { content: String(payload || ""), rspFile: responsePath };
          } catch (error) {
            return { content: "__read_failed__:" + String(error), rspFile: responsePath };
          }
        }
      } catch (_) {}
    }

    return { content: readFs(fs, legacyFile), rspFile: joinPath("result.json") };
  }

  function getFs(g) {
    if (!g) {
      return null;
    }
    if (g.__PR_MCP_BRIDGE_FS__) {
      return g.__PR_MCP_BRIDGE_FS__;
    }

    var loaders = [
      function loadFromCepNode() { return g.cep_node && g.cep_node.require("fs"); },
      function loadFromWindowCepNode() { return g.window && g.window.cep_node && g.window.cep_node.require("fs"); },
      function loadFromRequire() { return g.require("fs"); },
    ];

    for (var index = 0; index < loaders.length; index++) {
      try {
        var moduleRef = loaders[index]();
        if (moduleRef) {
          return moduleRef;
        }
      } catch (_) {}
    }

    return null;
  }

  function writeScript(filePath, text, append) {
    var mode = append ? "a" : "w";
    return "(function(){var f=new File(" + quoteEs(filePath) + ");f.encoding='UTF-8';" +
      "if(!f.open('" + mode + "')) return 'open_failed';f.write(" + quoteEs(text) + ");f.close();return 'ok';})()";
  }

  function readScript(filePath) {
    return "(function(){var f=new File(" + quoteEs(filePath) + ");if(!f.exists) return '';" +
      "f.encoding='UTF-8';if(!f.open('r')) return '__open_failed__';var c=f.read();f.close();f.remove();return c;})()";
  }

  function writeResult(cs, obj, rspFile) {
    cs.evalScript(writeScript(rspFile, safeJson(obj), false));
  }

  function bridgeStatus(fs, extId, version) {
    return {
      panelVersion: String(version || VERSION),
      bridgeFsAvailable: !!fs,
      bridgeMode: fs ? "per-request" : "legacy",
      extensionId: String(extId || ""),
    };
  }

  function readControl(fs, controlFile) {
    if (!fs || typeof fs.existsSync !== "function") {
      return { enabled: true };
    }
    if (!fs.existsSync(controlFile)) {
      return { enabled: true };
    }
    try {
      var parsed = JSON.parse(String(fs.readFileSync(controlFile, "utf8") || "{}"));
      if (typeof parsed.enabled === "boolean") {
        return parsed;
      }
    } catch (_) {}
    return { enabled: true };
  }

  function writeControl(cs, fs, enabled, extId, controlFile) {
    var payload = safeJson({
      enabled: !!enabled,
      source: "panel",
      extensionId: String(extId || ""),
      updatedAt: new Date().toISOString(),
    });

    try {
      if (fs && typeof fs.mkdirSync === "function") {
        fs.mkdirSync(stripSlash(controlFile).replace(/\/[^/]+$/, ""), { recursive: true });
      }
      if (fs && typeof fs.writeFileSync === "function") {
        fs.writeFileSync(controlFile, payload, "utf8");
        return;
      }
    } catch (_) {}

    cs.evalScript(writeScript(controlFile, payload, false));
  }

  function isExpired(cmd) {
    if (!cmd || typeof cmd.script !== "string") {
      return false;
    }
    var expiresAt = String(cmd.expiresAt || "").replace(/^\s+|\s+$/g, "");
    if (!expiresAt) {
      return false;
    }
    var timestamp = Date.parse(expiresAt);
    return isFinite(timestamp) && timestamp < Date.now();
  }

  function isRawScript(cmd) {
    return !!cmd && typeof cmd.script === "string" && cmd.script.trim() !== "";
  }

  function readyMsg(extId, version) {
    return "ready v" + String(version || VERSION) + " " + String(extId || "");
  }

  function companionOf(extId) {
    return extId === "com.pr.mcp.panel.main" ? "com.pr.mcp.panel.hidden" : "";
  }

  function shouldPoll(extId) {
    return extId === "com.pr.mcp.panel.hidden";
  }

  function localLabel(status) {
    var labels = {
      raw_script: "原始脚本",
      create_sequence: "创建序列",
      open_project: "打开项目",
      get_project_info: "读取项目信息",
      import_media: "导入媒体",
      add_clip_to_timeline: "加入时间线",
      parse_error: "解析失败",
      script_error: "脚本错误",
      command_expired: "命令已过期",
      command_read_failed: "读取命令失败",
      build_script_failed: "脚本构建失败",
    };
    return labels[String(status || "")] || String(status || "");
  }

  function localStatus(message) {
    var text = String(message || "");
    if (!text) {
      return "";
    }
    if (text === "stopped") {
      return "已停止";
    }
    if (text.indexOf("ready v") === 0) {
      return text.replace(/^ready\b/, "就绪");
    }
    if (text.indexOf("running:") === 0) {
      return "执行中：" + localLabel(text.slice(8).replace(/^\s+|\s+$/g, ""));
    }
    if (text.indexOf("done:") === 0) {
      return "已完成：" + localLabel(text.slice(5).replace(/^\s+|\s+$/g, ""));
    }
    if (text.indexOf("error:") === 0) {
      return "错误：" + localLabel(text.slice(6).replace(/^\s+|\s+$/g, ""));
    }
    return text;
  }

  var bridgeDir = resolveDir(global);
  var paths = buildPaths(bridgeDir);

  global.__PR_MCP_PANEL_CORE__ = {
    VERSION: VERSION,
    DEFAULT_DIR: DEFAULT_DIR,
    BRIDGE_DIR: paths.BRIDGE_DIR,
    CMD_FILE: paths.CMD_FILE,
    RESULT_FILE: paths.RESULT_FILE,
    STATUS_FILE: paths.STATUS_FILE,
    LOG_FILE: paths.LOG_FILE,
    CONTROL_FILE: paths.CONTROL_FILE,
    resolveDir: resolveDir,
    stripSlash: stripSlash,
    normPath: normPath,
    asciiJson: asciiJson,
    safeJson: safeJson,
    quoteEs: quoteEs,
    bridgePath: paths.bridgePath,
    rspPath: paths.rspPath,
    buildPaths: buildPaths,
    readFs: readFs,
    nextCmd: nextCmd,
    getFs: getFs,
    writeScript: writeScript,
    readScript: readScript,
    writeResult: writeResult,
    bridgeStatus: bridgeStatus,
    readControl: readControl,
    writeControl: writeControl,
    isExpired: isExpired,
    isRawScript: isRawScript,
    readyMsg: readyMsg,
    companionOf: companionOf,
    shouldPoll: shouldPoll,
    localLabel: localLabel,
    localStatus: localStatus,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
