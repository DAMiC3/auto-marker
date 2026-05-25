// Generates icon-192.png and icon-512.png in /public using sharp (bundled with Next.js)
// Run once: node scripts/gen-icons.mjs
import sharp from "../node_modules/sharp/lib/index.js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir  = path.join(__dirname, "..", "public");

function makeSvg(size) {
  const r  = Math.round(size * 0.18);
  const cx = size / 2;
  const cy = size / 2;
  const sw = Math.round(size * 0.085);

  // Checkmark points (relative to icon centre)
  const s  = size * 0.5;
  const ox = cx - s / 2;
  const oy = cy - s / 2;

  const x1 = ox + s * 0.15,  y1 = oy + s * 0.52;
  const x2 = ox + s * 0.42,  y2 = oy + s * 0.78;
  const x3 = ox + s * 0.85,  y3 = oy + s * 0.25;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#4F46E5"/>
  <polyline points="${x1},${y1} ${x2},${y2} ${x3},${y3}"
    fill="none" stroke="#FFFFFF" stroke-width="${sw}"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

for (const size of [192, 512]) {
  const svg = Buffer.from(makeSvg(size));
  const png = await sharp(svg).png().toBuffer();
  writeFileSync(path.join(publicDir, `icon-${size}.png`), png);
  console.log(`✓ icon-${size}.png`);
}
