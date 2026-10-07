import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReportedSourceHealth } from "./source-health-report.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input-dir");
const ingestDir = resolve(inputIndex >= 0 ? args[inputIndex + 1] : fileURLToPath(new URL("../src/data/ingest/", import.meta.url)));
async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(resolve(ingestDir, name), "utf8")); }
  catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}

try {
  const report = await readJson("report.json");
  const manifest = await readJson("raw-manifest.json");
  const previous = await readJson("source-health.json", null);
  const { snapshot, summary, warnings } = buildReportedSourceHealth(report, manifest, previous);
  console.log(JSON.stringify({ mode: args.includes("--write") ? "write" : "dry-run", ...snapshot, summary, warnings }, null, 2));
  if (args.includes("--write")) {
    await writeFile(resolve(ingestDir, "source-health.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  }
} catch (error) {
  console.error(`Source Health 生成失败：${error.message}`);
  process.exitCode = 1;
}
