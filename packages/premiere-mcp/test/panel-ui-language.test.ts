import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("index.html prefers Chinese interface copy and includes a subtle signature", async () => {
  const html = await readFile(
    path.join(process.cwd(), "cep-panel", "index.html"),
    "utf8",
  );

  assert.match(html, /先想镜头，<br>再下指令。/);
  assert.match(html, /命令桥接 \/ 编辑运行时/);
  assert.match(html, /实时队列/);
  assert.match(html, /桥接输出/);
  assert.match(html, /sylphiette269/);
});

test("panel runtime source localizes visible status text to Chinese", async () => {
  const bridgeUi = await readFile(
    path.join(process.cwd(), "cep-panel", "js", "bridge-ui.js"),
    "utf8",
  );
  const panelScript = await readFile(
    path.join(process.cwd(), "cep-panel", "js", "panel.js"),
    "utf8",
  );

  assert.match(bridgeUi, /已连接/);
  assert.match(bridgeUi, /已停止/);
  assert.match(bridgeUi, /CEP 运行时/);
  assert.match(bridgeUi, /队列为空/);

  assert.match(panelScript, /桥接启动请求已发送/);
  assert.match(panelScript, /桥接目录不能为空/);
  assert.match(panelScript, /正在测试 Premiere 连接/);
  assert.match(panelScript, /已自动识别当前项目/);
});
