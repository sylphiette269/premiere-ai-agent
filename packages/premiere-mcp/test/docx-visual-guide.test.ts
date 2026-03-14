import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import JSZip from "jszip";

import {
  convertDocxToMarkdown,
  extractEffectPlan,
  extractTransitionPlan,
  generateVisualGuideMarkdown,
  parseDocxRelationshipsXml,
  parseVisualGuideFromXml,
} from "../src/docx-visual-guide.js";

test("parseDocxRelationshipsXml maps image relationship ids to media targets", () => {
  const relationships = parseDocxRelationshipsXml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  assert.deepEqual(relationships, {
    rId4: "media/image1.png",
    rId5: "media/image2.png",
  });
});

test("parseVisualGuideFromXml binds numbered steps, continuation text, and following image paragraphs", () => {
  const guide = parseVisualGuideFromXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>相片效果制作</w:t></w:r></w:p>
    <w:p><w:r><w:t>1、新建序列，参数如图所示</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId4"/></w:drawing></w:r></w:p>
    <w:p><w:r><w:t>再把序列命名为 Demo</w:t></w:r></w:p>
    <w:p><w:r><w:t>2、添加立体旋转过渡</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>
  </w:body>
</w:document>`,
    {
      rId4: "media/image1.png",
      rId5: "media/image2.png",
    },
  );

  assert.equal(guide.title, "相片效果制作");
  assert.equal(guide.steps.length, 2);
  assert.equal(guide.steps[0]?.number, 1);
  assert.equal(guide.steps[0]?.text, "新建序列，参数如图所示");
  assert.deepEqual(
    guide.steps[0]?.continuations.map((entry) => entry.text),
    ["再把序列命名为 Demo"],
  );
  assert.deepEqual(
    guide.steps[0]?.images.map((image) => image.target),
    ["media/image1.png"],
  );
  assert.equal(guide.steps[0]?.visualDependencies.length, 1);
  assert.equal(guide.steps[1]?.number, 2);
  assert.deepEqual(
    guide.steps[1]?.images.map((image) => image.target),
    ["media/image2.png"],
  );
});

test("generateVisualGuideMarkdown emits AI-readable sections and unresolved visual markers", () => {
  const guide = parseVisualGuideFromXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>效果文档</w:t></w:r></w:p>
    <w:p><w:r><w:t>1、新建序列，参数如图所示</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId4"/></w:drawing></w:r></w:p>
  </w:body>
</w:document>`,
    { rId4: "media/image1.png" },
  );

  const markdown = generateVisualGuideMarkdown(guide, {
    sourceDocxPath: "E:/下载/效果文档.docx",
    assetMarkdownBasePath: "./效果文档.assets",
  });

  assert.match(markdown, /^---[\s\S]*source_docx:/);
  assert.match(markdown, /# 效果文档/);
  assert.match(markdown, /## Step 1/);
  assert.match(markdown, /- 原始步骤：新建序列，参数如图所示/);
  assert.match(markdown, /- 未解析视觉依赖：参数如图所示/);
  assert.match(markdown, /!\[Step 1 - Image 1\]\(\.\/效果文档\.assets\/image1\.png\)/);
});

test("parseVisualGuideFromXml keeps full shortcut combinations and de-duplicates overlapping visual markers", () => {
  const guide = parseVisualGuideFromXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>复杂步骤</w:t></w:r></w:p>
    <w:p><w:r><w:t>1、按ctrl+alt+V，并查看参数如下：</w:t></w:r></w:p>
  </w:body>
</w:document>`,
    {},
  );

  assert.deepEqual(guide.steps[0]?.mentionedShortcuts, ["CTRL+ALT+V"]);
  assert.deepEqual(guide.steps[0]?.visualDependencies, ["参数如下："]);
});

test("extractTransitionPlan separates clip transitions from keyframe easing and batch-apply intent", () => {
  const guide = {
    title: "转场测试",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 11,
        text: "对关键帧进行处理为贝塞尔曲线，让过渡得更自然。",
        rawText: "对关键帧进行处理为贝塞尔曲线，让过渡得更自然。",
        paragraphIndex: 10,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: ["过渡"],
      },
      {
        number: 13,
        text: "为素材之间添加些转场效果。使用立体旋转过渡。",
        rawText: "为素材之间添加些转场效果。使用立体旋转过渡。",
        paragraphIndex: 12,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: ["转场", "过渡"],
      },
      {
        number: 14,
        text: "将转场一次性全放到其他素材中的方法是先右键点击，将弹出“将所选过渡为默认过渡”点击。",
        rawText: "将转场一次性全放到其他素材中的方法是先右键点击，将弹出“将所选过渡为默认过渡”点击。",
        paragraphIndex: 13,
        continuations: [{ paragraphIndex: 14, text: "再把素材选择，按CTRL+D，应用到所有的素材中。" }],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["将所选过渡为默认过渡"],
        mentionedShortcuts: ["CTRL+D"],
        mentionedTransitions: ["将所选过渡为默认过渡", "转场", "过渡"],
      },
    ],
  };

  const plan = extractTransitionPlan(guide);

  assert.deepEqual(plan, {
    preferredClipTransition: "立体旋转过渡",
    clipTransitionEvidenceSteps: [13, 14],
    keyframeEasingSteps: [11],
    applyAsDefaultTransitionToAll: true,
    reorderSuggested: false,
    avoidDefaultCrossDissolve: true,
  });
});

test("generateVisualGuideMarkdown adds a transition guidance section for AI", () => {
  const guide = {
    title: "转场输出测试",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 13,
        text: "为素材之间添加些转场效果。使用立体旋转过渡。",
        rawText: "为素材之间添加些转场效果。使用立体旋转过渡。",
        paragraphIndex: 12,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: [],
        mentionedShortcuts: [],
        mentionedTransitions: ["转场", "过渡"],
      },
      {
        number: 14,
        text: "将转场一次性全放到其他素材中的方法是先右键点击，将弹出“将所选过渡为默认过渡”点击。",
        rawText: "将转场一次性全放到其他素材中的方法是先右键点击，将弹出“将所选过渡为默认过渡”点击。",
        paragraphIndex: 13,
        continuations: [{ paragraphIndex: 14, text: "再把素材选择，按CTRL+D，应用到所有的素材中。" }],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["将所选过渡为默认过渡"],
        mentionedShortcuts: ["CTRL+D"],
        mentionedTransitions: ["将所选过渡为默认过渡", "转场", "过渡"],
      },
    ],
  };

  const markdown = generateVisualGuideMarkdown(guide, {
    sourceDocxPath: "E:/下载/demo.docx",
    assetMarkdownBasePath: "./demo.assets",
  });

  assert.match(markdown, /## 转场执行建议/);
  assert.match(markdown, /明确指定的素材转场：立体旋转过渡/);
  assert.match(markdown, /批量应用默认转场：是/);
  assert.match(markdown, /没有明确指定时，不要自动回退到 Cross Dissolve/);
});

test("convertDocxToMarkdown writes markdown and extracts embedded images from a synthetic docx", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "premiere-docx-guide-"));
  const inputPath = path.join(tmpRoot, "sample.docx");
  const outputPath = path.join(tmpRoot, "sample.md");
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>图文教程</w:t></w:r></w:p>
    <w:p><w:r><w:t>1、新建序列，参数如图所示</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:blip r:embed="rId4"/></w:drawing></w:r></w:p>
    <w:p><w:r><w:t>2、添加高斯模糊</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
  );
  zip.file("word/media/image1.png", Buffer.from("png-data"));

  await zip.generateAsync({ type: "nodebuffer" }).then(async (buffer) => {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(inputPath, buffer));
  });

  const result = await convertDocxToMarkdown({
    docxPath: inputPath,
    markdownPath: outputPath,
  });

  const markdown = await readFile(outputPath, "utf8");
  const imageStats = await stat(path.join(tmpRoot, "sample.assets", "image1.png"));

  assert.equal(result.stepCount, 2);
  assert.equal(result.imageCount, 1);
  assert.match(markdown, /# 图文教程/);
  assert.match(markdown, /## Step 1/);
  assert.match(markdown, /!\[Step 1 - Image 1\]\(\.\/sample\.assets\/image1\.png\)/);
  assert.equal(imageStats.isFile(), true);
});

test("extractEffectPlan promotes copied guide effects into a global clip effect plan", () => {
  const guide = {
    title: "Effect Planning",
    intro: [],
    unassignedImages: [],
    steps: [
      {
        number: 5,
        text: "Add 'Gaussian Blur' to the first clip.",
        rawText: "Add 'Gaussian Blur' to the first clip.",
        paragraphIndex: 4,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["Gaussian Blur"],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
      {
        number: 6,
        text: "Copy 'Gaussian Blur' to all other clips with CTRL+ALT+V.",
        rawText: "Copy 'Gaussian Blur' to all other clips with CTRL+ALT+V.",
        paragraphIndex: 5,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["Gaussian Blur"],
        mentionedShortcuts: ["CTRL+ALT+V"],
        mentionedTransitions: [],
      },
      {
        number: 10,
        text: "Add 'Basic 3D' animation to the clip.",
        rawText: "Add 'Basic 3D' animation to the clip.",
        paragraphIndex: 9,
        continuations: [],
        images: [],
        visualDependencies: [],
        mentionedEffects: ["Basic 3D"],
        mentionedShortcuts: [],
        mentionedTransitions: [],
      },
    ],
  };

  const plan = extractEffectPlan(guide);

  assert.deepEqual(plan.globalClipEffects, ["Gaussian Blur"]);
  assert.deepEqual(plan.optionalClipEffects, ["Basic 3D"]);
  assert.deepEqual(plan.copyToAllClipEvidenceSteps, [6]);
});
