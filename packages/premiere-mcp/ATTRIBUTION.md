# 说明来源

`packages/premiere-mcp/` 是 `Premiere MCP 剪辑助手` monorepo 里的 Premiere 执行层。

## 参考来源

这个包里的部分 bridge 和 MCP 集成思路，参考过以下公开项目：

- `Adobe_Premiere_Pro_MCP`
  - 仓库：<https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP>
  - 许可证：MIT

感谢原作者把相关实现公开出来。它曾经帮助我梳理 bridge 和 MCP 集成的起步思路。

后续这个包已经按本仓库自己的运行形态、CEP bridge、测试套件、工作流设计和项目专用工具重新整理。

## 第三方运行文件

- `cep-panel/js/CSInterface.js`
  - 版权头：Adobe Systems Incorporated
  - 这个文件不视为本包原创代码
  - 具体使用条款请以文件头部说明为准
