import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type MediaAssetCategory =
  | "video"
  | "image"
  | "audio"
  | "document"
  | "project"
  | "other";

export interface MediaFolderAsset {
  absolutePath: string;
  relativePath: string;
  basename: string;
  extension: string;
  category: MediaAssetCategory;
  sizeBytes: number;
}

export interface MediaFolderManifest {
  sourceRoot: string;
  generatedAt: string;
  mediaPolicy: "reference-only";
  totalFiles: number;
  countsByCategory: Record<MediaAssetCategory, number>;
  assets: MediaFolderAsset[];
}

export interface WriteMediaFolderPlanOptions {
  inputDir: string;
  markdownPath: string;
  jsonPath?: string;
}

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".avi",
  ".mxf",
  ".mkv",
  ".webm",
  ".wmv",
]);

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".webp",
]);

const AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".aac",
  ".m4a",
  ".flac",
  ".aif",
  ".aiff",
  ".ogg",
]);

const DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".md",
  ".pdf",
  ".txt",
  ".rtf",
]);

const PROJECT_EXTENSIONS = new Set([
  ".prproj",
  ".aep",
  ".aepx",
]);

function normalizeForManifest(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function createEmptyCategoryCounts(): Record<MediaAssetCategory, number> {
  return {
    video: 0,
    image: 0,
    audio: 0,
    document: 0,
    project: 0,
    other: 0,
  };
}

function categorizeExtension(extension: string): MediaAssetCategory {
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }

  if (PROJECT_EXTENSIONS.has(extension)) {
    return "project";
  }

  return "other";
}

async function collectAssets(
  sourceRoot: string,
  currentDir: string,
  assets: MediaFolderAsset[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectAssets(sourceRoot, absolutePath, assets);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStats = await stat(absolutePath);
    const relativePath = normalizeForManifest(path.relative(sourceRoot, absolutePath));
    const extension = path.extname(entry.name).toLowerCase();

    assets.push({
      absolutePath,
      relativePath,
      basename: entry.name,
      extension,
      category: categorizeExtension(extension),
      sizeBytes: fileStats.size,
    });
  }
}

export async function scanMediaFolder(inputDir: string): Promise<MediaFolderManifest> {
  const sourceRoot = path.resolve(inputDir);
  const assets: MediaFolderAsset[] = [];

  await collectAssets(sourceRoot, sourceRoot, assets);
  assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const countsByCategory = createEmptyCategoryCounts();
  for (const asset of assets) {
    countsByCategory[asset.category] += 1;
  }

  return {
    sourceRoot,
    generatedAt: new Date().toISOString(),
    mediaPolicy: "reference-only",
    totalFiles: assets.length,
    countsByCategory,
    assets,
  };
}

function formatCountLine(
  label: string,
  value: number,
): string {
  return `- ${label}: ${value}`;
}

export function generateMediaFolderMarkdown(manifest: MediaFolderManifest): string {
  const lines = [
    "---",
    `source-root: ${manifest.sourceRoot}`,
    `generated-at: ${manifest.generatedAt}`,
    `media-policy: ${manifest.mediaPolicy}`,
    `total-files: ${manifest.totalFiles}`,
    "---",
    "",
    "# Source Folder Manifest",
    "",
    "## AI Rules",
    "",
    "- Use original absolute paths from this manifest.",
    "- Do not copy, duplicate, stage, or relocate source media into project folders unless the user explicitly asks for that.",
    "- Organize assets in Premiere with bins, sequence placement, and metadata instead of filesystem copies.",
    "",
    "## Counts",
    "",
    formatCountLine("Video", manifest.countsByCategory.video),
    formatCountLine("Image", manifest.countsByCategory.image),
    formatCountLine("Audio", manifest.countsByCategory.audio),
    formatCountLine("Document", manifest.countsByCategory.document),
    formatCountLine("Project", manifest.countsByCategory.project),
    formatCountLine("Other", manifest.countsByCategory.other),
    "",
    "## Assets",
    "",
  ];

  for (const asset of manifest.assets) {
    lines.push(`### ${asset.relativePath}`);
    lines.push(`- Category: ${asset.category}`);
    lines.push(`- Absolute Path: ${asset.absolutePath}`);
    lines.push(`- Size Bytes: ${asset.sizeBytes}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeMediaFolderPlan(
  options: WriteMediaFolderPlanOptions,
): Promise<{
  manifest: MediaFolderManifest;
  markdownPath: string;
  jsonPath?: string;
}> {
  const manifest = await scanMediaFolder(options.inputDir);
  const markdownPath = path.resolve(options.markdownPath);
  const jsonPath = options.jsonPath ? path.resolve(options.jsonPath) : undefined;
  const markdown = generateMediaFolderMarkdown(manifest);

  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, markdown, "utf8");

  if (jsonPath) {
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  return {
    manifest,
    markdownPath,
    jsonPath,
  };
}
