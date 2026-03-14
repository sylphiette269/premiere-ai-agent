(function (global) {
  "use strict";

  // Edit this file if the CEP bridge directory should differ from the default.
  if (
    typeof global.__PR_MCP_BRIDGE_DIR__ !== "string" ||
    !String(global.__PR_MCP_BRIDGE_DIR__).replace(/^\s+|\s+$/g, "")
  ) {
    global.__PR_MCP_BRIDGE_DIR__ = "C:/pr-mcp-cmd";
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
