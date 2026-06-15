import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const rootDir = process.cwd();
const publicShareDir = path.join(rootDir, "public", "s");
const obsoletePublicShareDir = path.join(rootDir, "public", "share");
const siteUrl = "https://theaicompass.io";
const shareDescription = "Take the quiz and state your own stance.";
const imageWidth = 1200;
const imageHeight = 630;
const insetX = 66;
const insetY = 58;
const colors = {
  background: { r: 255, g: 255, b: 255, a: 255 },
  quadrant: { r: 184, g: 184, b: 184, a: 255 },
  line: { r: 184, g: 184, b: 184, a: 255 },
};
const shareResults = [
  {
    alias: "a7k3",
    resultSlug: "convinced-supportive",
    quadrant: "topRight",
    title:
      "I'm Convinced of Progress, Supportive of Acceleration. Where do you stand?",
  },
  {
    alias: "m92q",
    resultSlug: "convinced-critical",
    quadrant: "topLeft",
    title:
      "I'm Convinced of Progress, Critical of Acceleration. Where do you stand?",
  },
  {
    alias: "r4vx",
    resultSlug: "unconvinced-supportive",
    quadrant: "bottomRight",
    title:
      "I'm Unconvinced of Progress, Supportive of Acceleration. Where do you stand?",
  },
  {
    alias: "t8pb",
    resultSlug: "unconvinced-critical",
    quadrant: "bottomLeft",
    title:
      "I'm Unconvinced of Progress, Critical of Acceleration. Where do you stand?",
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

function createPreviewPng(quadrant) {
  const pixels = Buffer.alloc(imageWidth * imageHeight * 4, 255);
  const plotWidth = imageWidth - insetX * 2;
  const plotHeight = imageHeight - insetY * 2;
  const centerX = insetX + plotWidth / 2;
  const centerY = insetY + plotHeight / 2;
  const quadrantRects = {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: centerX, y: insetY },
    bottomLeft: { x: insetX, y: centerY },
    bottomRight: { x: centerX, y: centerY },
  };
  const highlightRect = quadrantRects[quadrant];

  fillRect(pixels, 0, 0, imageWidth, imageHeight, colors.background);
  if (highlightRect) {
    fillRect(
      pixels,
      highlightRect.x,
      highlightRect.y,
      plotWidth / 2,
      plotHeight / 2,
      colors.quadrant,
    );
  }
  fillRect(pixels, insetX, insetY, plotWidth, 2, colors.line);
  fillRect(pixels, insetX, insetY + plotHeight - 2, plotWidth, 2, colors.line);
  fillRect(pixels, insetX, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, insetX + plotWidth - 2, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, centerX - 1, insetY, 2, plotHeight, colors.line);
  fillRect(pixels, insetX, centerY - 1, plotWidth, 2, colors.line);

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

function createSharePage({ alias, title: resultTitle }) {
  const pageUrl = `${siteUrl}/s/${alias}`;
  const imageUrl = `${siteUrl}/s/${alias}.png`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(resultTitle)}</title>
    <meta name="description" content="${escapeHtml(shareDescription)}" />
    <link rel="canonical" href="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:site_name" content="AI Compass" />
    <meta property="og:title" content="${escapeHtml(resultTitle)}" />
    <meta property="og:description" content="${escapeHtml(shareDescription)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${imageWidth}" />
    <meta property="og:image:height" content="${imageHeight}" />
    <meta property="og:image:alt" content="A minimalist AI Compass result preview with the matching quadrant highlighted." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${pageUrl}" />
    <meta name="twitter:title" content="${escapeHtml(resultTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(shareDescription)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="A minimalist AI Compass result preview with the matching quadrant highlighted." />
    <script>
      window.location.replace("/");
    </script>
  </head>
  <body>
    <noscript><a href="/">Open The AI Compass</a></noscript>
  </body>
</html>
`;
}

fs.rmSync(obsoletePublicShareDir, { recursive: true, force: true });
fs.mkdirSync(publicShareDir, { recursive: true });
for (const result of shareResults) {
  fs.writeFileSync(
    path.join(publicShareDir, `${result.alias}.png`),
    createPreviewPng(result.quadrant),
  );
  const routeDir = path.join(publicShareDir, result.alias);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), createSharePage(result));
}

console.log(`Generated ${shareResults.length} share preview routes.`);
