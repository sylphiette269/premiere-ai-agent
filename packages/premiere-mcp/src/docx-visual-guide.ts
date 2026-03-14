import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

export interface VisualGuideImage {
  relationshipId: string;
  target: string;
  filename: string;
  paragraphIndex: number;
}

export interface VisualGuideContinuation {
  paragraphIndex: number;
  text: string;
}

export interface VisualGuideStep {
  number: number;
  text: string;
  rawText: string;
  paragraphIndex: number;
  continuations: VisualGuideContinuation[];
  images: VisualGuideImage[];
  visualDependencies: string[];
  mentionedEffects: string[];
  mentionedShortcuts: string[];
  mentionedTransitions: string[];
}

export interface ParsedVisualGuide {
  title: string;
  intro: string[];
  steps: VisualGuideStep[];
  unassignedImages: VisualGuideImage[];
}

export interface VisualGuideTransitionPlan {
  preferredClipTransition: string | null;
  clipTransitionEvidenceSteps: number[];
  keyframeEasingSteps: number[];
  applyAsDefaultTransitionToAll: boolean;
  reorderSuggested: boolean;
  avoidDefaultCrossDissolve: boolean;
}

export interface VisualGuideEffectPlan {
  globalClipEffects: string[];
  optionalClipEffects: string[];
  effectEvidenceSteps: Record<string, number[]>;
  copyToAllClipEvidenceSteps: number[];
}

export interface GenerateVisualGuideMarkdownOptions {
  sourceDocxPath: string;
  assetMarkdownBasePath: string;
}

export interface ConvertDocxToMarkdownOptions {
  docxPath: string;
  markdownPath: string;
  assetsDir?: string;
}

export interface ConvertDocxToMarkdownResult {
  markdownPath: string;
  assetsDir: string;
  stepCount: number;
  imageCount: number;
  unresolvedVisualStepCount: number;
}

interface ParsedParagraph {
  index: number;
  text: string;
  images: VisualGuideImage[];
}

const STEP_PREFIX_PATTERN = /^(\d+)\s*[、,.;，。]\s*(.+)$/u;
const VISUAL_DEPENDENCY_PATTERNS = [
  /参数如图所示[:：]?/iu,
  /参数如下[:：]?/iu,
  /如图所示[:：]?/iu,
  /如图[:：]?/iu,
  /如下[:：]?/iu,
  /settings shown in the screenshot/iu,
  /see screenshot/iu,
  /as shown/iu,
  /shown in the screenshot/iu,
];
const TRANSITION_KEYWORDS = ["转场", "过渡", "transition"];
const COPY_TO_ALL_KEYWORDS = [
  "复制到其他素材",
  "所有素材",
  "其他素材",
  "复制到所有",
  "copy",
  "all other clips",
  "all clips",
];

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchStepPrefix(value: string): RegExpMatchArray | null {
  return normalizeWhitespace(value).match(STEP_PREFIX_PATTERN);
}

function extractQuotedTerms(value: string): string[] {
  const terms = new Set<string>();
  const pattern = /["'“”‘’鈥溾€橀仯鍏抽敭鍙疯瘝闈?]([^"'“”‘’]+?)["'“”‘’]/gu;

  for (const match of value.matchAll(pattern)) {
    const candidate = normalizeWhitespace(match[1] ?? "");
    if (candidate) {
      terms.add(candidate);
    }
  }

  return [...terms];
}

function extractShortcutTerms(value: string): string[] {
  const shortcuts = new Set<string>();
  const matches = value.matchAll(
    /(?:CTRL|ALT|SHIFT|CMD|OPTION)(?:\s*\+\s*(?:CTRL|ALT|SHIFT|CMD|OPTION|[A-Z]))+/gi,
  );

  for (const match of matches) {
    const candidate = normalizeWhitespace(match[0] ?? "")
      .toUpperCase()
      .replace(/\s*\+\s*/g, "+");
    if (candidate) {
      shortcuts.add(candidate);
    }
  }

  return [...shortcuts];
}

function isTransitionLikeTerm(value: string): boolean {
  const lower = value.toLowerCase();
  return TRANSITION_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function extractTransitionTerms(value: string): string[] {
  const transitions = new Set<string>();

  for (const quoted of extractQuotedTerms(value)) {
    if (isTransitionLikeTerm(quoted)) {
      transitions.add(quoted);
    }
  }

  if (isTransitionLikeTerm(value)) {
    if (value.includes("转场") || value.includes("杞満")) {
      transitions.add(value.includes("转场") ? "转场" : "杞満");
    }
    if (value.includes("过渡") || value.includes("杩囨浮")) {
      transitions.add(value.includes("过渡") ? "过渡" : "杩囨浮");
    }
  }

  return [...transitions];
}

function detectVisualDependencies(value: string): string[] {
  const matches: Array<{ start: number; end: number; text: string }> = [];

  for (const pattern of VISUAL_DEPENDENCY_PATTERNS) {
    const match = value.match(pattern);
    if (!match || match.index === undefined) {
      continue;
    }

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: normalizeWhitespace(match[0]),
    });
  }

  matches.sort((left, right) => {
    const lengthDelta = right.text.length - left.text.length;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }

    return left.start - right.start;
  });

  const accepted: Array<{ start: number; end: number; text: string }> = [];
  for (const candidate of matches) {
    const covered = accepted.some((entry) =>
      candidate.start >= entry.start && candidate.end <= entry.end,
    );
    if (!covered) {
      accepted.push(candidate);
    }
  }

  accepted.sort((left, right) => left.start - right.start);

  return accepted.map((entry) => entry.text);
}

function parseParagraphs(documentXml: string, relationships: Record<string, string>): ParsedParagraph[] {
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [];

  return paragraphs.map((paragraphXml, index) => {
    const text = normalizeWhitespace(
      [...paragraphXml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXmlEntities(match[1] ?? ""))
        .join(""),
    );

    const images = [...paragraphXml.matchAll(/r:embed="([^"]+)"/g)].map((match) => {
      const relationshipId = match[1] ?? "";
      const target = relationships[relationshipId] ?? "";
      return {
        relationshipId,
        target,
        filename: path.posix.basename(target || relationshipId),
        paragraphIndex: index,
      };
    });

    return {
      index,
      text,
      images,
    };
  });
}

function buildStep(number: number, text: string, rawText: string, paragraphIndex: number): VisualGuideStep {
  const normalizedText = normalizeWhitespace(text);
  return {
    number,
    text: normalizedText,
    rawText: normalizeWhitespace(rawText),
    paragraphIndex,
    continuations: [],
    images: [],
    visualDependencies: detectVisualDependencies(normalizedText),
    mentionedEffects: extractQuotedTerms(normalizedText),
    mentionedShortcuts: extractShortcutTerms(normalizedText),
    mentionedTransitions: extractTransitionTerms(normalizedText),
  };
}

function appendStepText(step: VisualGuideStep, text: string, paragraphIndex: number): void {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return;
  }

  step.continuations.push({
    paragraphIndex,
    text: normalizedText,
  });

  for (const dependency of detectVisualDependencies(normalizedText)) {
    if (!step.visualDependencies.includes(dependency)) {
      step.visualDependencies.push(dependency);
    }
  }

  for (const effect of extractQuotedTerms(normalizedText)) {
    if (!step.mentionedEffects.includes(effect)) {
      step.mentionedEffects.push(effect);
    }
  }

  for (const shortcut of extractShortcutTerms(normalizedText)) {
    if (!step.mentionedShortcuts.includes(shortcut)) {
      step.mentionedShortcuts.push(shortcut);
    }
  }

  for (const transition of extractTransitionTerms(normalizedText)) {
    if (!step.mentionedTransitions.includes(transition)) {
      step.mentionedTransitions.push(transition);
    }
  }
}

function toPosixRelativeMarkdownPath(basePath: string, filename: string): string {
  return `${basePath.replace(/\\/g, "/").replace(/\/$/, "")}/${filename}`;
}

function flattenStepText(step: VisualGuideStep): string {
  return normalizeWhitespace([
    step.text,
    ...step.continuations.map((entry) => entry.text),
  ].join(" "));
}

function isKeyframeEasingStep(text: string): boolean {
  const lower = text.toLowerCase();
  const keyframeLike =
    text.includes("关键帧") ||
    text.includes("鍏抽敭甯?") ||
    lower.includes("keyframe");
  const easingLike =
    text.includes("贝塞尔") ||
    text.includes("更自然") ||
    text.includes("曲线") ||
    lower.includes("bezier") ||
    lower.includes("ease");

  return keyframeLike && easingLike;
}

function extractNamedClipTransition(text: string): string | null {
  const directMatch = text.match(/(?:使用|浣跨敤|use)\s*([^，。；、"“”']+?(?:转场|过渡|杞満|杩囨浮|transition))/iu);
  if (directMatch?.[1]) {
    return normalizeWhitespace(
      directMatch[1]
        .replace(/\btransition\b/giu, "")
        .replace(/\beffect\b/giu, ""),
    );
  }

  for (const quoted of extractQuotedTerms(text)) {
    if (isTransitionLikeTerm(quoted)) {
      return normalizeWhitespace(
        quoted
          .replace(/\btransition\b/giu, "")
          .replace(/\beffect\b/giu, ""),
      );
    }
  }

  return null;
}

function isCopyToAllEffectStep(step: VisualGuideStep, text: string): boolean {
  const lower = text.toLowerCase();
  return (
    step.mentionedShortcuts.includes("CTRL+ALT+V") ||
    COPY_TO_ALL_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))
  );
}

function isTransitionLikeEffect(value: string): boolean {
  return isTransitionLikeTerm(value);
}

export function extractTransitionPlan(
  guide: ParsedVisualGuide,
): VisualGuideTransitionPlan {
  const clipTransitionEvidenceSteps = new Set<number>();
  const keyframeEasingSteps = new Set<number>();
  let preferredClipTransition: string | null = null;
  let applyAsDefaultTransitionToAll = false;
  let reorderSuggested = false;

  for (const step of guide.steps) {
    const text = flattenStepText(step);
    const lower = text.toLowerCase();

    if (isKeyframeEasingStep(text)) {
      keyframeEasingSteps.add(step.number);
      continue;
    }

    const namedTransition = extractNamedClipTransition(text);
    if (
      namedTransition &&
      (text.includes("素材之间") ||
        text.includes("绱犳潗涔嬮棿") ||
        text.includes("转场效果") ||
        text.includes("杞満鏁堟灉") ||
        text.includes("添加") ||
        text.includes("娣诲姞") ||
        lower.includes("between clips"))
    ) {
      preferredClipTransition = preferredClipTransition ?? namedTransition;
      clipTransitionEvidenceSteps.add(step.number);
    }

    if (
      text.includes("默认过渡") ||
      text.includes("榛樿杩囨浮") ||
      (text.includes("CTRL+D") &&
        (text.includes("所有") ||
          text.includes("鎵€鏈?") ||
          lower.includes("all")))
    ) {
      applyAsDefaultTransitionToAll = true;
      clipTransitionEvidenceSteps.add(step.number);
    }

    if (
      text.includes("转场顺序") ||
      text.includes("杞満椤哄簭") ||
      lower.includes("transition order")
    ) {
      reorderSuggested = true;
      clipTransitionEvidenceSteps.add(step.number);
    }
  }

  return {
    preferredClipTransition,
    clipTransitionEvidenceSteps: [...clipTransitionEvidenceSteps],
    keyframeEasingSteps: [...keyframeEasingSteps],
    applyAsDefaultTransitionToAll,
    reorderSuggested,
    avoidDefaultCrossDissolve: preferredClipTransition !== null || applyAsDefaultTransitionToAll,
  };
}

export function extractEffectPlan(
  guide: ParsedVisualGuide,
): VisualGuideEffectPlan {
  const globalClipEffects = new Set<string>();
  const optionalClipEffects = new Set<string>();
  const effectEvidenceSteps = new Map<string, Set<number>>();
  const copyToAllClipEvidenceSteps = new Set<number>();
  const seenEffects: string[] = [];

  for (const step of guide.steps) {
    const text = flattenStepText(step);
    const stepEffects = step.mentionedEffects.filter((effect) => !isTransitionLikeEffect(effect));
    const copyToAll = isCopyToAllEffectStep(step, text);

    for (const effect of stepEffects) {
      if (!effectEvidenceSteps.has(effect)) {
        effectEvidenceSteps.set(effect, new Set<number>());
      }
      effectEvidenceSteps.get(effect)?.add(step.number);
      optionalClipEffects.add(effect);
      if (!seenEffects.includes(effect)) {
        seenEffects.push(effect);
      }
    }

    if (!copyToAll) {
      continue;
    }

    copyToAllClipEvidenceSteps.add(step.number);
    const promotedEffects = stepEffects.length > 0 ? stepEffects : seenEffects;
    for (const effect of promotedEffects) {
      globalClipEffects.add(effect);
      optionalClipEffects.delete(effect);
    }
  }

  const serializedEvidence: Record<string, number[]> = {};
  for (const [effect, steps] of effectEvidenceSteps.entries()) {
    serializedEvidence[effect] = [...steps];
  }

  return {
    globalClipEffects: [...globalClipEffects],
    optionalClipEffects: [...optionalClipEffects],
    effectEvidenceSteps: serializedEvidence,
    copyToAllClipEvidenceSteps: [...copyToAllClipEvidenceSteps],
  };
}

export function parseDocxRelationshipsXml(relationshipsXml: string): Record<string, string> {
  const relationships: Record<string, string> = {};

  for (const match of relationshipsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bType="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) {
    const id = match[1] ?? "";
    const type = match[2] ?? "";
    const target = match[3] ?? "";
    if (type.includes("/image") && id && target) {
      relationships[id] = target;
    }
  }

  return relationships;
}

export function parseVisualGuideFromXml(
  documentXml: string,
  relationships: Record<string, string>,
): ParsedVisualGuide {
  const paragraphs = parseParagraphs(documentXml, relationships);
  const steps: VisualGuideStep[] = [];
  const intro: string[] = [];
  const unassignedImages: VisualGuideImage[] = [];
  let currentStep: VisualGuideStep | null = null;

  for (const paragraph of paragraphs) {
    const stepMatch = matchStepPrefix(paragraph.text);
    if (stepMatch) {
      const step = buildStep(
        Number(stepMatch[1]),
        stepMatch[2] ?? paragraph.text,
        paragraph.text,
        paragraph.index,
      );
      step.images.push(...paragraph.images);
      steps.push(step);
      currentStep = step;
      continue;
    }

    if (currentStep) {
      if (paragraph.text) {
        appendStepText(currentStep, paragraph.text, paragraph.index);
      }
      if (paragraph.images.length > 0) {
        currentStep.images.push(...paragraph.images);
      }
      continue;
    }

    if (paragraph.text) {
      intro.push(paragraph.text);
    }
    if (paragraph.images.length > 0) {
      unassignedImages.push(...paragraph.images);
    }
  }

  const [titleCandidate, ...restIntro] = intro;

  return {
    title: titleCandidate || "未命名图文教程",
    intro: restIntro,
    steps,
    unassignedImages,
  };
}

export function generateVisualGuideMarkdown(
  guide: ParsedVisualGuide,
  options: GenerateVisualGuideMarkdownOptions,
): string {
  const unresolvedStepNumbers = guide.steps
    .filter((step) => step.visualDependencies.length > 0)
    .map((step) => step.number);
  const transitionPlan = extractTransitionPlan(guide);
  const effectPlan = extractEffectPlan(guide);

  const lines: string[] = [
    "---",
    `source_docx: ${JSON.stringify(options.sourceDocxPath)}`,
    `title: ${JSON.stringify(guide.title)}`,
    `step_count: ${guide.steps.length}`,
    `image_count: ${guide.steps.reduce((sum, step) => sum + step.images.length, 0) + guide.unassignedImages.length}`,
    `unresolved_visual_steps: [${unresolvedStepNumbers.join(", ")}]`,
    "---",
    "",
    `# ${guide.title}`,
    "",
    "## AI 使用约束",
    "",
    "- 只执行文档里明确写出的操作。",
    "- 遇到“如图所示”“参数如下”这类描述时，不要自动脑补缺失参数。",
    "- 截图只作为证据和待确认信息来源，不能直接假定具体数值。",
    "",
  ];

  if (guide.intro.length > 0) {
    lines.push("## 文档前言", "");
    for (const entry of guide.intro) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  lines.push("## 转场执行建议", "");
  lines.push(`- 明确指定的素材转场：${transitionPlan.preferredClipTransition ?? "无"}`);
  lines.push(`- 批量应用默认转场：${transitionPlan.applyAsDefaultTransitionToAll ? "是" : "否"}`);
  lines.push(`- 可调整转场顺序：${transitionPlan.reorderSuggested ? "是" : "否"}`);
  lines.push(
    `- 关键帧缓动步骤：${transitionPlan.keyframeEasingSteps.length > 0 ? `Step ${transitionPlan.keyframeEasingSteps.join("、Step ")}` : "无"}`,
  );
  lines.push(
    `- 素材转场证据步骤：${transitionPlan.clipTransitionEvidenceSteps.length > 0 ? `Step ${transitionPlan.clipTransitionEvidenceSteps.join("、Step ")}` : "无"}`,
  );
  lines.push("- 没有明确指定时，不要自动回退到 Cross Dissolve。");
  lines.push("");

  lines.push("## 效果执行建议", "");
  lines.push(
    `- 建议全局应用的效果：${effectPlan.globalClipEffects.length > 0 ? effectPlan.globalClipEffects.join("、") : "无"}`,
  );
  lines.push(
    `- 仅提及但未确认全局复制的效果：${effectPlan.optionalClipEffects.length > 0 ? effectPlan.optionalClipEffects.join("、") : "无"}`,
  );
  lines.push(
    `- 效果复制证据步骤：${effectPlan.copyToAllClipEvidenceSteps.length > 0 ? `Step ${effectPlan.copyToAllClipEvidenceSteps.join("、Step ")}` : "无"}`,
  );
  lines.push("");

  lines.push("## 结构化步骤", "");

  for (const step of guide.steps) {
    lines.push(`## Step ${step.number}`, "");
    lines.push(`- 原始步骤：${step.text}`);

    if (step.continuations.length > 0) {
      lines.push("- 补充说明：");
      for (const continuation of step.continuations) {
        lines.push(`  - ${continuation.text}`);
      }
    }

    if (step.mentionedEffects.length > 0) {
      lines.push(`- 提及效果：${step.mentionedEffects.join("、")}`);
    }

    if (step.mentionedShortcuts.length > 0) {
      lines.push(`- 提及快捷键：${step.mentionedShortcuts.join("、")}`);
    }

    if (step.mentionedTransitions.length > 0) {
      lines.push(`- 提及转场：${step.mentionedTransitions.join("、")}`);
    }

    if (step.visualDependencies.length > 0) {
      lines.push(`- 未解析视觉依赖：${step.visualDependencies.join("、")}`);
    } else {
      lines.push("- 未解析视觉依赖：无");
    }

    if (step.images.length > 0) {
      lines.push("- 截图证据：");
      step.images.forEach((image, index) => {
        lines.push(
          `  - ![Step ${step.number} - Image ${index + 1}](${toPosixRelativeMarkdownPath(options.assetMarkdownBasePath, image.filename)})`,
        );
      });
    } else {
      lines.push("- 截图证据：无");
    }

    lines.push("");
  }

  if (guide.unassignedImages.length > 0) {
    lines.push("## 未绑定截图", "");
    guide.unassignedImages.forEach((image, index) => {
      lines.push(`- ![Unassigned Image ${index + 1}](${toPosixRelativeMarkdownPath(options.assetMarkdownBasePath, image.filename)})`);
    });
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function convertDocxToMarkdown(
  options: ConvertDocxToMarkdownOptions,
): Promise<ConvertDocxToMarkdownResult> {
  const docxBuffer = await readFile(options.docxPath);
  const zip = await JSZip.loadAsync(docxBuffer);
  const guide = await parseVisualGuideFromDocx(options.docxPath, zip);

  const assetsDir =
    options.assetsDir ??
    path.join(
      path.dirname(options.markdownPath),
      `${path.basename(options.markdownPath, path.extname(options.markdownPath))}.assets`,
    );
  const assetMarkdownBasePath = `./${path.basename(assetsDir)}`;

  await mkdir(path.dirname(options.markdownPath), { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const uniqueTargets = new Map<string, string>();
  for (const image of [...guide.unassignedImages, ...guide.steps.flatMap((step) => step.images)]) {
    if (!image.target) {
      continue;
    }
    uniqueTargets.set(image.target, image.filename);
  }

  for (const [target, filename] of uniqueTargets) {
    const zipEntry = zip.file(`word/${target.replace(/^\/+/, "")}`);
    if (!zipEntry) {
      continue;
    }
    const buffer = await zipEntry.async("nodebuffer");
    await writeFile(path.join(assetsDir, filename), buffer);
  }

  const markdown = generateVisualGuideMarkdown(guide, {
    sourceDocxPath: options.docxPath,
    assetMarkdownBasePath,
  });

  await writeFile(options.markdownPath, markdown, "utf8");

  return {
    markdownPath: options.markdownPath,
    assetsDir,
    stepCount: guide.steps.length,
    imageCount: uniqueTargets.size,
    unresolvedVisualStepCount: guide.steps.filter(
      (step) => step.visualDependencies.length > 0,
    ).length,
  };
}

export async function parseVisualGuideFromDocx(
  docxPath: string,
  preloadedZip?: JSZip,
): Promise<ParsedVisualGuide> {
  const zip = preloadedZip ?? (await JSZip.loadAsync(await readFile(docxPath)));
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error(`DOCX document.xml not found: ${docxPath}`);
  }

  const relationshipsXml =
    (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const relationships = parseDocxRelationshipsXml(relationshipsXml);

  return parseVisualGuideFromXml(documentXml, relationships);
}
