# Premiere MCP Project Standards

`premiere-mcp/` 是当前工作区里的唯一交付目录。这个文档定义项目内的文档规范、代码格式规范、验证基线和 Git 提交流程，避免“实现、测试、文档、操作习惯”四套口径继续漂移。

## 1. 交付边界

- 最终交付和可回退提交都落在 `premiere-mcp/`
- `Adobe_Premiere_Pro_MCP/` 只作为参考源，不是输出目录
- 修改时优先保持低冲突，只整理本次触达的文件，不做脏工作区上的全仓重排

## 2. 文档规范

以下事实变化时，必须同步更新：

- `README.md`
- `../../CLAUDE.md`
- `../../ROADMAP.md`
- `../../VISION.md`
- `../../SKILLS-PLAN.md`

同步规则：

- tools / resources / prompts 数量必须以代码或测试结果为准，不能猜
- bridge 模式、命令 envelope、安装脚本、恢复脚本变化时，要同步更新说明
- 仓库内 skills 变化时，要同步更新技能列表和使用边界
- 项目说明默认使用简体中文；只有明确面向外部英文读者时才保留英文主述

## 3. 代码格式规范

### TypeScript / JavaScript / MJS

- 缩进：`2` 空格
- 引号：优先单引号
- 结尾：保留分号
- 多行对象、数组、参数列表：保留 trailing comma
- 导出：优先命名导出，减少隐式默认导出
- 文件命名：延续现有语义化命名，不做无意义缩写

### Python

- 缩进：`4` 空格
- 遵循 PEP 8
- 优先 `snake_case`
- 保持 CLI 和库函数分离，便于单测

### 通用约束

- 文件编码统一为 `UTF-8`
- 换行统一为 `LF`
- 保留文件末尾换行
- 只在逻辑不明显处添加简短中文注释
- 不在已有脏工作区上做大范围自动重排，只整理本次触达文件

## 4. 格式配置落点

项目级格式配置文件：

- `.gitattributes`
- `.editorconfig`
- `.prettierrc.json`
- `.prettierignore`

这些文件负责把“约定”落成“可执行基线”。即使本地没有格式化工具，编辑器也应能遵守基础缩进、换行和编码规则。

## 5. 验证基线

交付前至少运行：

```bash
npm run build
npm run test:jest -- --runInBand
node --test --import tsx test/**/*.test.ts
```

如果改动涉及 `python/` 音频分析链，还要补跑：

```bash
.\.venv-audio-test\Scripts\python -m pytest python\tests
```

说明：

- 可以按改动范围缩小测试集，但最终结论必须基于新鲜验证
- 不能把旧一次通过结果当成当前结论

## 6. Git 规范

- 只 `git add` 本次修改的文件
- 不把 unrelated dirty changes 混进同一个提交
- 一个提交只表达一个明确主题
- 提交前先验证，再提交
- 如果工作区存在高冲突改动，优先新增文件或做最小增量补丁
