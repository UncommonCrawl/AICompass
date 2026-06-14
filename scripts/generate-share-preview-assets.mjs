import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const rootDir = process.cwd();
const publicShareDir = path.join(rootDir, "public", "share");
const title = "The AI Compass: State Your Stance";
const siteUrl = "https://theaicompass.io";
const imageWidth = 1200;
const imageHeight = 630;
const insetX = 66;
const insetY = 58;
const markerSize = 28;
const colors = {
  background: { r: 255, g: 255, b: 255, a: 255 },
  line: { r: 184, g: 184, b: 184, a: 255 },
  marker: { r: 0, g: 0, b: 0, a: 255 },
};
const shareResults = [
  {
    slug: "convinced-critical",
    x: -0.62,
    y: 0.42,
    description:
      "I'm Convinced of Progress, Critical of Acceleration. Where do you stand?",
  },
  {
    slug: "convinced-supportive",
    x: 0.62,
    y: 0.42,
    description:
      "I'm Convinced of Progress, Supportive of Acceleration. Where do you stand?",
  },
  {
    slug: "unconvinced-critical",
    x: -0.62,
    y: -0.42,
    description:
      "I'm Unconvinced of Progress, Critical of Acceleration. Where do you stand?",
  },
  {
    slug: "unconvinced-supportive",
    x: 0.62,
    y: -0.42,
    description:
      "I'm Unconvinced of Progress, Supportive of Acceleration. Where do you stand?",
  },
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) return;
  const index = (y * imageWidth + x) * 4;
  pixels[index] = color.r;
  pixels[index + 1] = color.g;
  pixels[index + 2] = color.b;
  pixels[index + 3] = color.a;
}

function fillRect(pixels, x, y, width, height, color) {
  const startX = Math.max(0, Math.round(x));
  const startY = Math.max(0, Math.round(y));
  const endX = Math.min(imageWidth, Math.round(x + width));
  const endY = Math.min(imageHeight, Math.round(y + height));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPixel(pixels, px, py, color);
    }
  }
}

function createPreviewPng(x, y) {
  const pixels = Buffer.alloc(imageWidth * imageHeight * 4, 255);
  const plotWidth = imageWidth - insetX * 2;
  const plotHeight = imageHeight - insetY * 2;
  const centerX = insetX + plotWidth / 2;
  const centerY = insetY + plotHeight / 2;
  const clampedX = Math.max(-1, Math.min(1, x));
  const clampedY = Math.max(-1, Math.min(1, y));
  const markerX = centerX + clampedX * (plotWidth / 2) - markerSize / 2;
  const markerY = centerY - clampedY * (plotHeight / 2) - markerSize / 2;

  fillRect(pixels, 0, 0, imageWidth, imageHeight, colors.background);
  fillRect(pixels, insetX, insetY, plotWidth, 2, colors.line);
  fillRect(pixels, insetX, insetY + plotHeight - 2, plotWidth, 2, colors.line);
  fillRect(pixels, insetX, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, insetX + plotWidth - 2, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, centerX - 1, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, insetX, centerY - 1, plotWidth, 2, colors.line);
  fillRect(pixels, markerX, markerY, markerSize, markerSize, colors.marker);

  const rawRows = Buffer.alloc((imageWidth * 4 + 1) * imageHeight);
  for (let row = 0; row < imageHeight; row += 1) {
    const sourceStart = row * imageWidth * 4;
    const targetStart = row * (imageWidth * 4 + 1);
    rawRows[targetStart] = 0;
    pixels.copy(
      rawRows,
      targetStart + 1,
      sourceStart,
      sourceStart + imageWidth * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imageWidth, 0);
  ihdr.writeUInt32BE(imageHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(rawRows)),
    createPngChunk("IEND"),
  ]);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createSharePage({ slug, description }) {
  const pageUrl = `${siteUrl}/share/${slug}`;
  const imageUrl = `${siteUrl}/share/${slug}.png`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:site_name" content="AI Compass" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${imageWidth}" />
    <meta property="og:image:height" content="${imageHeight}" />
    <meta property="og:image:alt" content="A minimalist AI Compass result preview with one black marker on the compass." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${pageUrl}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="A minimalist AI Compass result preview with one black marker on the compass." />
    <script>
      window.setTimeout(() => {
        window.location.replace("${siteUrl}/");
      }, 1200);
    </script>
  </head>
  <body>
    <a href="${siteUrl}/">Continue to The AI Compass</a>
  </body>
</html>
`;
}

fs.mkdirSync(publicShareDir, { recursive: true });
for (const result of shareResults) {
  fs.writeFileSync(
    path.join(publicShareDir, `${result.slug}.png`),
    createPreviewPng(result.x, result.y),
  );
  const routeDir = path.join(publicShareDir, result.slug);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), createSharePage(result));
}

console.log(`Generated ${shareResults.length} share preview routes.`);
