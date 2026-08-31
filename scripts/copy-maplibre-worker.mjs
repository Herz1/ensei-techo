import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const assets = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

for (const asset of assets) {
  const source = fileURLToPath(
    new URL(`../node_modules/maplibre-gl/dist/${asset}`, import.meta.url),
  );
  const target = fileURLToPath(
    new URL(`../public/vendor/${asset}`, import.meta.url),
  );
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

console.log("MapLibre worker 及共享模块已同步到 public/vendor。");
