(function (global) {
  "use strict";

  var POLL_INTERVAL = 5000;
  var _timer = null;

  function getBridgeDir() {
    return (global.__PR_MCP_BRIDGE_DIR__ || "C:/pr-mcp-cmd")
      .replace(/[\/]+$/, "");
  }

  function readPluginsJson(callback) {
    var csInterface = new CSInterface();
    var path = getBridgeDir() + "/plugins.json";
    var script = [
      "(function(){",
      "  try {",
      "    var f = new File(" + JSON.stringify(path) + ");",
      "    if (!f.exists) return JSON.stringify({plugins:[]});",
      "    f.open('r'); var s = f.read(); f.close();",
      "    return s;",
      "  } catch(e) { return JSON.stringify({plugins:[]}); }",
      "})()"
    ].join("");
    csInterface.evalScript(script, function (result) {
      try { callback(JSON.parse(result).plugins || []); }
      catch (_) { callback([]); }
    });
  }

  function writePluginsJson(plugins, callback) {
    var csInterface = new CSInterface();
    var path = getBridgeDir() + "/plugins.json";
    var content = JSON.stringify({ plugins: plugins || [] });
    var script = [
      "(function(){",
      "  try {",
      "    var f = new File(" + JSON.stringify(path) + ");",
      "    f.encoding = 'UTF-8';",
      "    if (!f.open('w')) return 'error';",
      "    f.write(" + JSON.stringify(content) + ");",
      "    f.close();",
      "    return 'ok';",
      "  } catch(e) { return 'error'; }",
      "})()"
    ].join("");
    csInterface.evalScript(script, function (result) {
      callback(result === "ok");
    });
  }

  function renderPlugins(plugins) {
    var list = document.getElementById("pluginList");
    var badge = document.getElementById("pluginCount");
    if (!list) return;
    if (badge) {
      badge.textContent = plugins.length + " 个插件";
    }
    if (plugins.length === 0) {
      list.innerHTML = '<div class="note">暂无已注册插件。</div>';
      return;
    }
    list.innerHTML = plugins.map(function (p) {
      var color = p.enabled ? "var(--success)" : "var(--ink-faint)";
      var label = p.enabled ? "已启用" : "已禁用";
      var toggleLabel = p.enabled ? "停用" : "启用";
      var nextEnabled = p.enabled ? "false" : "true";
      return [
        '<div style="display:flex;align-items:center;justify-content:space-between;',
        'padding:10px 12px;border-radius:14px;border:1px solid rgba(17,15,11,0.08);',
        'background:rgba(255,255,255,0.72);">',
        '<div>',
        '<div style="font-size:12px;font-weight:700;color:var(--ink);">' + escHtml(p.name) + '</div>',
        '<div style="font-size:10px;font-family:var(--mono);color:var(--ink-faint);margin-top:2px;">',
        escHtml(p.id) + ' v' + escHtml(p.version) + '</div>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:8px;">',
        '<span style="font-size:10px;font-weight:700;color:' + color + ';',
        'background:rgba(0,0,0,0.04);padding:4px 10px;border-radius:999px;">',
        label + '</span>',
        '<button type="button" onclick="pluginRegistryUI.setEnabled(\'' +
        escJsString(p.id) + '\',' + nextEnabled + ')" ',
        'style="border:0;border-radius:999px;padding:6px 10px;font-size:10px;',
        'font-weight:700;cursor:pointer;background:var(--accent);color:#fff;">',
        toggleLabel + '</button>',
        '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escJsString(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function clonePluginWithEnabled(plugin, enabled) {
    var nextPlugin = {};
    Object.keys(plugin || {}).forEach(function (key) {
      nextPlugin[key] = plugin[key];
    });
    nextPlugin.enabled = enabled;
    return nextPlugin;
  }

  function setPluginEnabled(id, enabled, callback) {
    readPluginsJson(function (plugins) {
      var found = false;
      var nextPlugins = plugins.map(function (plugin) {
        if (plugin.id !== id) {
          return plugin;
        }
        found = true;
        return clonePluginWithEnabled(plugin, enabled);
      });

      if (!found) {
        if (callback) callback(false);
        return;
      }

      writePluginsJson(nextPlugins, function (ok) {
        if (ok) {
          renderPlugins(nextPlugins);
        }
        if (callback) callback(ok);
      });
    });
  }

  function pollPlugins() {
    readPluginsJson(renderPlugins);
  }

  function startPluginPolling() {
    pollPlugins();
    if (_timer) {
      clearInterval(_timer);
    }
    _timer = setInterval(pollPlugins, POLL_INTERVAL);
  }

  global.pluginRegistryUI = {
    start: startPluginPolling,
    refresh: pollPlugins,
    setEnabled: setPluginEnabled
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
