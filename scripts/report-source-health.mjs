import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachSourceHealth,
  buildSourceHealthSnapshot,
} from "./source-health.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const ingestDir = path.join(projectDir, "src", "data", "ingest");
const reportFile = path.join(ingestDir, "report.json");
const manifestFile = path.join(ingestDir, "raw-manifest.json");
const snapshotFile = path.join(ingestDir, "source-health.json");

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

function todayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function monthsFrom(date, count) {
  const [year, month] = date.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(Date.UTC(year, month - 1 + index, 1));
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
    };
  });
}

async function main() {
  const report = await readJson(reportFile);
  const manifest = await readJson(manifestFile);
  const previousSnapshot = await readJson(snapshotFile, null);
  if (!Array.isArray(report.sources)) {
    throw new Error("ingest/report.json 缺少 sources，无法生成 Source Health");
  }
  if (!Array.isArray(manifest.entries)) {
    throw new Error("ingest/raw-manifest.json 缺少 entries，无法生成 Source Health");
  }

  const today = process.env.EVENT_INGEST_FROM || todayJst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("EVENT_INGEST_FROM 必须是 YYYY-MM-DD");
  }
  const monthCount = Math.min(
    12,
    Math.max(1, Number(process.env.EVENT_INGEST_MONTHS || 4)),
  );
  const months = monthsFrom(today, monthCount);
  const health = attachSourceHealth({
    sourceResults: report.sources,
    rawEntries: manifest.entries,
    previousSnapshot,
    months,
  });
  const collectionWindow = {
    from: today,
    months: health.collectionWindow.months,
  };

  const nextReport = {
    ...report,
    collectionWindow,
    sourceHealthSummary: health.summary,
    sources: health.sources,
  };
  const snapshot = buildSourceHealthSnapshot({
    generatedAt: report.generatedAt ?? manifest.generatedAt ?? new Date().toISOString(),
    collectionWindow,
    sources: health.sources,
  });

  await Promise.all([
    writeFile(reportFile, `${JSON.stringify(nextReport, null, 2)}\n`, "utf8"),
    writeFile(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
  ]);

  const actionable = health.sources.filter((source) => source.health.actionable);
  console.log(
    `Source Health: ${health.sources.length} sources, ${actionable.length} actionable`,
  );
  for (const source of health.sources) {
    const suffix = source.health.reasons.length
      ? ` (${source.health.reasons.join(", ")})`
      : "";
    console.log(
      `- [${source.health.state}] ${source.name}: ${source.recordCount ?? 0} records${suffix}`,
    );
  }
}

main().catch((error) => {
  console.error(`Source Health 生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
