# GitHub Release 中文模板

> 使用方法：复制本模板到 GitHub Release 编辑页，替换占位内容。  
> 原则：中文优先、只写真实变化、不要把未验证内容写成“已完成”。

## 版本概览

- 版本号：`vX.Y.Z`
- 发布时间：`YYYY-MM-DD`
- 版本类型：`功能版 / 修复版 / 整理版`
- 推荐对象：`首次安装 / 已有用户升级 / 特定工作流用户`

## 这一版解决了什么

用一小段话说明：

- 这版主要解决了什么问题
- 谁最适合升级
- 它属于新功能、修复，还是发布整理

## 主要变化

### 根仓变化

- [ ] 根仓 README / 文档整理
- [ ] 工作流编排层变化
- [ ] CI / 工作区脚本变化

### packages/premiere-mcp

- [ ] Premiere MCP 相关变化 1
- [ ] Premiere MCP 相关变化 2

### packages/audio-beat-mcp

- [ ] 音频节拍相关变化

### packages/video-research-mcp

- [ ] 视频研究相关变化

### 文档与发布整理

- [ ] README 是否更新
- [ ] CHANGELOG 是否更新
- [ ] 相关说明文档是否同步

## 使用或升级方式

### 首次安装

```bash
npm install
npm run build
npm test
```

### 已有环境升级

```bash
git pull
npm install
npm run build
```

如本版涉及 MCP 配置、CEP、桥接目录、额外依赖，请在这里补充额外步骤。

## 建议验证

```bash
npm run build
npm test
```

如果当前版本存在环境限制，也在这里明确写出，不要省略。

## 已知限制

- 限制 1
- 限制 2

## 备注

- 如这一版主要是公开发布整理，应明确写出“这是发布整理版，不等于新增全部底层能力”
- 如引用了参考仓、外部实现或迁移来源，也在这里说明
