import { promises as fs } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

export interface DemoAsset {
  name: string;
  path: string;
}

type Pixel = [number, number, number];
type PixelShader = (x: number, y: number, width: number, height: number) => Pixel;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lerp(from: number, to: number, amount: number): number {
  return from + ((to - from) * amount);
}

function smoothPulse(center: number, width: number, sample: number): number {
  const distance = Math.abs(sample - center);
  if (distance >= width) {
    return 0;
  }
  const normalized = 1 - (distance / width);
  return normalized * normalized * (3 - (2 * normalized));
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(chunks: Uint8Array[]): number {
  let value = 0xffffffff;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      value = (CRC_TABLE[(value ^ chunk[index]!) & 0xff] ?? 0) ^ (value >>> 8);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const kind = Buffer.from(type, 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32([kind, data]), 0);
  return Buffer.concat([size, kind, data, checksum]);
}

function buildPng(width: number, height: number, shader: PixelShader): Buffer {
  const stride = (width * 3) + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = shader(x, y, width, height);
      const pixelStart = rowStart + 1 + (x * 3);
      raw[pixelStart] = clampByte(r);
      raw[pixelStart + 1] = clampByte(g);
      raw[pixelStart + 2] = clampByte(b);
    }
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function focusShader(x: number, y: number, width: number, height: number): Pixel {
  const horizontal = x / Math.max(1, width - 1);
  const vertical = y / Math.max(1, height - 1);
  const horizonBand = smoothPulse(height * 0.38, height * 0.09, y);
  const centerBand = smoothPulse(width * 0.5, width * 0.18, x);
  const vignette = Math.sqrt(((horizontal - 0.5) ** 2) + ((vertical - 0.48) ** 2));

  const base = lerp(10, 34, 1 - Math.min(1, vignette * 1.5));
  const glow = (horizonBand * 42) + (centerBand * 18);
  return [base + glow, base + glow, base + 6 + (glow * 0.8)];
}

function precisionShader(x: number, y: number, width: number, height: number): Pixel {
  const left = width * 0.26;
  const right = width * 0.74;
  const top = height * 0.22;
  const bottom = height * 0.78;
  const inside = x > left && x < right && y > top && y < bottom;
  const frameDistance = Math.min(
    Math.abs(x - left),
    Math.abs(x - right),
    Math.abs(y - top),
    Math.abs(y - bottom),
  );
  const gradient = lerp(14, 36, (x / Math.max(1, width - 1)) * 0.6 + (y / Math.max(1, height - 1)) * 0.4);
  const borderLift = inside ? Math.max(0, 76 - (frameDistance * 12)) : 0;
  return [gradient + borderLift, gradient + (borderLift * 0.95), gradient + 10];
}

function finishShader(x: number, y: number, width: number, height: number): Pixel {
  const nx = (x - (width / 2)) / (width * 0.5);
  const ny = (y - (height * 0.53)) / (height * 0.22);
  const ellipse = (nx * nx) + (ny * ny);
  const underline = smoothPulse(height * 0.56, height * 0.03, y) * smoothPulse(width * 0.5, width * 0.28, x);
  const centerGlow = ellipse < 1 ? (1 - ellipse) * 60 : 0;
  const base = lerp(6, 20, 1 - Math.min(1, Math.abs(nx)));
  return [base + centerGlow + (underline * 24), base + centerGlow, base + 8 + (underline * 18)];
}

const DEMO_SCENES: Array<{ name: string; shader: PixelShader }> = [
  { name: '01_focus.png', shader: focusShader },
  { name: '02_precision.png', shader: precisionShader },
  { name: '03_finish.png', shader: finishShader },
];

export async function createMotionDemoAssets(assetDir: string, width = 1920, height = 1080): Promise<DemoAsset[]> {
  await fs.mkdir(assetDir, { recursive: true });

  const assets = await Promise.all(
    DEMO_SCENES.map(async ({ name, shader }) => {
      const filePath = join(assetDir, name);
      await fs.writeFile(filePath, buildPng(width, height, shader));
      return { name, path: filePath };
    }),
  );

  return assets;
}
