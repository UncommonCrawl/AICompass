import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");

const staticAppRoutes = [
  { route: "dashboard", noindex: true },
];

function withRobotsNoindex(html) {
  if (html.includes('name="robots"')) {
    return html.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      '<meta name="robots" content="noindex, nofollow" />',
    );
  }

  return html.replace(
    /(<meta\s+name="viewport"[^>]*>\s*)/i,
    '$1\n    <meta name="robots" content="noindex, nofollow" />\n    ',
  );
}

if (!fs.existsSync(indexPath)) {
  throw new Error("Missing dist/index.html. Run this script after vite build.");
}

const indexHtml = fs.readFileSync(indexPath, "utf8");

for (const { route, noindex } of staticAppRoutes) {
  const routeDir = path.join(distDir, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(
    path.join(routeDir, "index.html"),
    noindex ? withRobotsNoindex(indexHtml) : indexHtml,
  );
}

console.log(
  `Prepared static app routes: ${staticAppRoutes
    .map(({ route }) => route)
    .join(", ")}`,
);
