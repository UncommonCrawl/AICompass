import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");

const staticAppRoutes = ["admin"];

if (!fs.existsSync(indexPath)) {
  throw new Error("Missing dist/index.html. Run this script after vite build.");
}

for (const route of staticAppRoutes) {
  const routeDir = path.join(distDir, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.copyFileSync(indexPath, path.join(routeDir, "index.html"));
}

console.log(`Prepared static app routes: ${staticAppRoutes.join(", ")}`);
