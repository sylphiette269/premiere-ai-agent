(function (global) {
  "use strict";

  var MAX_QUEUE_DISPLAY = 5;
  var MAX_LOG_ENTRIES = 200;
  var _logCount = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function setBridgeStatus(connected, text) {
    var dot = el("bridgeStatusDot");
    var txt = el("bridgeStatusText");
    var sub = el("statusSubtitle");
    if (dot) {
      dot.className = "dot " + (connected ? "on" : "off");
    }
    if (txt) {
      txt.textContent = text || (connected ? "已连接" : "已停止");
    }
    if (sub) {
      sub.textContent = connected
        ? "桥接轮询已启用"
        : "桥接已暂停，不会处理 MCP 命令";
    }
    var btnStart = el("btnStart");
    var btnStop = el("btnStop");
    if (btnStart) {
      btnStart.disabled = !!connected;
    }
    if (btnStop) {
      btnStop.disabled = !connected;
    }
  }

  function setPremiereStatus(connected, text) {
    var dot = el("premiereStatusDot");
    var txt = el("premiereStatusText");
    if (dot) {
      dot.className = "dot " + (connected ? "on" : "off");
    }
    if (txt) {
      txt.textContent = text || (connected ? "已连接 Premiere Pro" : "未检测到 Premiere Pro");
    }
  }

  function setMetaDir(dirPath) {
    var node = el("tagDir");
    if (node) {
      node.textContent = dirPath || "C:/pr-mcp-cmd";
    }
  }

  function setMetaMode(mode) {
    var node = el("tagMode");
    if (node) {
      node.textContent = mode || "CEP 运行时";
    }
  }

  function setProjectPath(projectPath) {
    var input = el("projectPathInput");
    if (input) {
      input.value = projectPath || "";
    }
  }

  function getProjectPath() {
    var input = el("projectPathInput");
    if (!input) {
      return "";
    }
    return String(input.value || "");
  }

  function renderQueue(queue) {
    var container = el("commandQueue");
    if (!container) {
      return;
    }
    if (!queue || queue.length === 0) {
      container.innerHTML = '<div class="q-item"><span class="q-lbl">队列为空</span></div>';
      return;
    }
    var slice = queue.slice(-MAX_QUEUE_DISPLAY);
    var html = "";
    for (var i = 0; i < slice.length; i++) {
      var cmd = slice[i];
      var status = String(cmd.status || "pending");
      html += '<div class="q-item">';
      html += '<span class="q-lbl">' + _escHtml(_displayQueueLabel(cmd.label || cmd.id || "")) + "</span>";
      html += '<span class="q-chip ' + _chipClass(status) + '">' + _escHtml(_displayQueueStatus(status)) + "</span>";
      html += "</div>";
    }
    container.innerHTML = html;
  }

  function log(message, level) {
    level = level || "info";
    var container = el("logContainer");
    if (!container) {
      return;
    }
    _logCount += 1;
    if (_logCount > MAX_LOG_ENTRIES) {
      var entries = container.querySelectorAll(".log-line");
      if (entries.length > 0) {
        container.removeChild(entries[0]);
      }
    }
    var div = document.createElement("div");
    div.className = "log-line " + level;
    div.textContent = "[" + _timestamp() + "] " + String(message || "");
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function clearLog() {
    var container = el("logContainer");
    if (container) {
      container.innerHTML = '<div class="log-line info">日志已清空。</div>';
      _logCount = 1;
    }
  }

  function _timestamp() {
    var d = new Date();
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function _chipClass(status) {
    if (status === "completed" || status === "done") {
      return "chip-d";
    }
    if (status === "failed" || status === "error") {
      return "chip-f";
    }
    if (status === "executing" || status === "running") {
      return "chip-r";
    }
    return "chip-w";
  }

  function _displayQueueStatus(status) {
    if (status === "completed" || status === "done") {
      return "已完成";
    }
    if (status === "failed" || status === "error") {
      return "失败";
    }
    if (status === "executing" || status === "running") {
      return "执行中";
    }
    return "等待中";
  }

  function _displayQueueLabel(label) {
    var normalized = String(label || "");
    if (normalized === "raw_script") {
      return "原始脚本";
    }
    if (normalized === "create_sequence") {
      return "创建序列";
    }
    if (normalized === "open_project") {
      return "打开项目";
    }
    if (normalized === "get_project_info") {
      return "读取项目信息";
    }
    if (normalized === "import_media") {
      return "导入媒体";
    }
    if (normalized === "add_clip_to_timeline") {
      return "加入时间线";
    }
    return normalized;
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  global.bridgeUi = {
    clearLog: clearLog,
    getProjectPath: getProjectPath,
    log: log,
    renderQueue: renderQueue,
    setBridgeStatus: setBridgeStatus,
    setMetaDir: setMetaDir,
    setMetaMode: setMetaMode,
    setPremiereStatus: setPremiereStatus,
    setProjectPath: setProjectPath,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
