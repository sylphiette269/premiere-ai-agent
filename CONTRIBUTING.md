# 参与说明

## 适用范围

这个仓库是一个 monorepo。

- 根目录层面的改动，应该服务于顶层工作流编排、工作区工具、共享文档或 CI
- 包级改动，应尽量留在各自包的职责边界内
- 除非设计上确实更合理，否则不要为了省事把多个包的逻辑硬拷到一起

## 本地开发

在仓库根目录执行：

```bash
npm install
npm run build
npm test
```

常用的包级命令：

```bash
npm run build --workspace packages/premiere-mcp
npm run test --workspace packages/premiere-mcp
npm run build --workspace packages/audio-beat-mcp
npm run build --workspace packages/video-research-mcp
```

## 改动规则

- 优先做小而可审查的改动
- 根仓文档与各包文档要保持同步
- 除非需求明确要求变更，否则尽量保持当前运行时契约不变
- 只要改到 Premiere bridge 行为，就同时核对代码和文档

## Pull Request 建议

如果你要提交 Pull Request，描述里至少应写清：

- 改了什么
- 怎么验证的
- 后续还要补什么
- 当前已知限制是什么
