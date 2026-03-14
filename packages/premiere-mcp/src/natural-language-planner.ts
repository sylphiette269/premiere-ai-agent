import type { MediaFolderManifest } from "./media-folder-manifest.js";

export interface NaturalLanguageRequest {
  prompt: string;
  mediaManifestPath?: string;
  maxDurationSec?: number;
}

export interface NLParsedIntent {
  targetDurationSec: number;
  pacingStyle: string;
  visualStyle: string;
  transitionPreference: string;
  colorMood: string;
  hasVoiceover: boolean;
  hasMusic: boolean;
  textOverlayStyle: string;
  rawPrompt: string;
}

export interface NLAssemblyPlan {
  intent: NLParsedIntent;
  sequenceName: string;
  clipDuration: number;
  transitionName: string | null;
  motionStyle: string;
  assetCount: number;
  warnings: string[];
}

const DURATION_SECONDS_PATTERN = /(\d+(?:\.\d+)?)\s*(?:秒|s|sec|secs)/i;
const DURATION_MINUTES_PATTERN = /(\d+(?:\.\d+)?)\s*(?:分|min|mins|minute|minutes)/i;

function containsKeyword(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword));
}

function extractTargetDurationSec(prompt: string, fallback: number): number {
  const minuteMatch = prompt.match(DURATION_MINUTES_PATTERN);
  if (minuteMatch) {
    return Math.round(Number.parseFloat(minuteMatch[1] ?? "0") * 60);
  }

  const secondMatch = prompt.match(DURATION_SECONDS_PATTERN);
  if (secondMatch) {
    return Math.round(Number.parseFloat(secondMatch[1] ?? "0"));
  }

  return fallback;
}

function removeKnownPatterns(prompt: string): string {
  let residual = prompt;
  const replacements = [
    DURATION_SECONDS_PATTERN,
    DURATION_MINUTES_PATTERN,
    /快节奏|快|fast|quick/gi,
    /慢节奏|慢|slow|relaxed/gi,
    /干净转场|干净|clean|simple|简洁/gi,
    /动感转场|动感|dynamic|炫/gi,
    /无转场|无|none/gi,
    /暖色调|暖|warm|橙|橘|金/gi,
    /冷色调|冷|cool|蓝|青/gi,
    /旁白|voiceover|解说/gi,
    /背景音乐|背景音|音乐|music|bgm/gi,
    /字幕|subtitle|text/gi,
  ];

  for (const pattern of replacements) {
    residual = residual.replace(pattern, " ");
  }

  return residual
    .replace(/[，,。.!！?？、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countVisualAssets(manifest?: MediaFolderManifest): number {
  if (!manifest) {
    return 0;
  }

  return manifest.assets.filter((asset) => asset.category === "video" || asset.category === "image").length;
}

function detectExplicitTransitionName(prompt: string): string | null {
  const normalizedPrompt = prompt.toLowerCase();
  if (containsKeyword(normalizedPrompt, ["cross dissolve", "交叉溶解", "叠化"])) {
    return "Cross Dissolve";
  }
  if (containsKeyword(normalizedPrompt, ["cube spin", "立方体旋转"])) {
    return "Cube Spin";
  }
  return null;
}

function detectExplicitMotionStyle(prompt: string): string {
  const normalizedPrompt = prompt.toLowerCase();
  if (containsKeyword(normalizedPrompt, ["push in", "push-in", "zoom in", "推近", "推进"])) {
    return "push_in";
  }
  if (containsKeyword(normalizedPrompt, ["pull out", "pull-out", "zoom out", "拉远"])) {
    return "pull_out";
  }
  if (containsKeyword(normalizedPrompt, ["alternate zoom", "交替缩放", "交替推拉"])) {
    return "alternate";
  }
  return "none";
}

export function parseNaturalLanguageRequest(req: NaturalLanguageRequest): NLParsedIntent {
  const rawPrompt = req.prompt ?? "";
  const prompt = rawPrompt.trim();
  const normalizedPrompt = prompt.toLowerCase();
  const defaultDuration = req.maxDurationSec ?? 60;

  const targetDurationSec = extractTargetDurationSec(prompt, defaultDuration);
  const pacingStyle = containsKeyword(normalizedPrompt, ["快节奏", "快", "fast", "quick"])
    ? "fast"
    : containsKeyword(normalizedPrompt, ["慢节奏", "慢", "slow", "relaxed"])
      ? "slow"
      : "medium";
  const transitionPreference = containsKeyword(normalizedPrompt, ["干净", "clean", "simple", "简洁"])
    ? "clean"
    : containsKeyword(normalizedPrompt, ["动感", "dynamic", "炫"])
      ? "dynamic"
      : containsKeyword(normalizedPrompt, ["无转场", "none"])
        ? "none"
        : "auto";
  const colorMood = containsKeyword(normalizedPrompt, ["暖", "warm", "橙", "橘", "金"])
    ? "warm"
    : containsKeyword(normalizedPrompt, ["冷", "cool", "蓝", "青"])
      ? "cool"
      : "auto";
  const hasVoiceover = containsKeyword(normalizedPrompt, ["旁白", "voiceover", "解说"]);
  const hasMusic = containsKeyword(normalizedPrompt, ["音乐", "music", "bgm", "背景音", "背景音乐"]);
  const textOverlayStyle = containsKeyword(normalizedPrompt, ["字幕", "subtitle", "text"])
    ? "minimal"
    : "none";
  const visualStyle = prompt
    ? removeKnownPatterns(prompt) || "auto"
    : "auto";

  return {
    targetDurationSec,
    pacingStyle,
    visualStyle,
    transitionPreference,
    colorMood,
    hasVoiceover,
    hasMusic,
    textOverlayStyle,
    rawPrompt,
  };
}

export function buildNLAssemblyPlan(
  intent: NLParsedIntent,
  manifest?: MediaFolderManifest,
): NLAssemblyPlan {
  const manifestAssetCount = countVisualAssets(manifest);
  const assetCount = manifestAssetCount > 0
    ? manifestAssetCount
    : Math.max(1, Math.round(intent.targetDurationSec / (intent.pacingStyle === "fast" ? 2.5 : intent.pacingStyle === "slow" ? 5 : 4)));
  const clipDuration = Number((intent.targetDurationSec / assetCount).toFixed(3));
  const transitionName = detectExplicitTransitionName(intent.rawPrompt);
  const motionStyle = detectExplicitMotionStyle(intent.rawPrompt);
  const warnings: string[] = [];

  if (manifest && manifestAssetCount === 0) {
    warnings.push("The supplied media manifest does not contain visual assets yet.");
  }
  if (intent.visualStyle === "auto") {
    warnings.push("The request relies mostly on generic pacing keywords and may still need style-specific refinement.");
  }
  if (intent.transitionPreference !== "none" && intent.transitionPreference !== "auto" && transitionName === null) {
    warnings.push("Generic transition adjectives were detected without a concrete Premiere transition name, so automatic clip transitions remain disabled.");
  }
  if (motionStyle === "none" && intent.pacingStyle !== "medium") {
    warnings.push("Generic pacing words do not imply a concrete keyframe animation, so automatic motion remains disabled until a named move is requested.");
  }

  return {
    intent,
    sequenceName: "AI Prompt Assembly",
    clipDuration,
    transitionName,
    motionStyle,
    assetCount,
    warnings,
  };
}
