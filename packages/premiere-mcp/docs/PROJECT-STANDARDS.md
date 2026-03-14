# Premiere MCP Project Standards

`packages/premiere-mcp/` 是 `premiere-mcp-for-claude-code-codex` monorepo 里的 Premiere 执行包。
这个文档定义它的文档规范、代码格式规范、验证基线和提交规则，避免包内实现与根仓说明继续漂移。

## 1. 交付边界

- 当前包目录固定是 `packages/premiere-mcp/`
- `audio-beat-mcp` 和 `video-research-mcp` 是并列 package，不属于本包内部实现
- `Adobe_Premiere_Pro_MCP/` 只作为参考来源，不是输出目标
- 修改时优先做低冲突、可回滚的增量调整

## 2. 文档规则

以下事实变化时，需要同步更新：

- `packages/premiere-mcp/README.md`
- 根目录 `CONTRIBUTING.md`
- 根目录 `README.md`

同步规则：

- tools / resources / prompts 数量以代码或测试结果为准
- bridge 模式、命令 envelope、安装脚本、恢复脚本变化时，要同步文档
- 项目内 skills 变化时，要同步 skill 列表和边界说明
- 默认中文优先；确实需要面向外部英文读者时再补英文摘要

## 3. 代码格式

### TypeScript / JavaScript / MJS

- 缩进：`2` 空格
- 引号：优先单引号
- 结尾：保留分号
- 多行对象、数组、参数列表保留 trailing comma
- 优先命名导出
- 文件命名保持语义化，不做无意义缩写

### Python

- 缩进：`4` 空格
- 遵循 `PEP 8`
- 优先 `snake_case`
- 保持 CLI 与库函数可分离，便于单测

### 通用约束

- 文件编码统一 `UTF-8`
- 保留文件末尾换行
- 只在逻辑不明显处补简短中文注释
- 不在已知脏工作区上做全仓无差别重排

## 4. 格式配置落点

项目格式配置文件：

- `.gitattributes`
- `.editorconfig`
- `.prettierrc.json`
- `.prettierignore`

这些文件负责把“约定”落成“可执行基线”。

## 5. 验证基线

交付前至少运行：

```bash
npm run build
npm test
```

如果改动涉及 `python/` 音频分析链，额外跑：

```bash
.\.venv-audio-test\Scripts\python -m pytest python\tests
```

说明：

- 可以按改动范围缩小测试集
- 但最终结论必须基于新鲜验证，而不是沿用旧结果

## 6. Git 规则

- 只 `git add` 本次改动文件
- 不把 unrelated changes 混进同一提交
- 一个提交只表达一个主旨
- 先验证，再提交
