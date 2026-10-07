import { attachSourceHealth, buildSourceHealthSnapshot } from "./source-health.mjs";

/** A report describes a recorded batch, never an inferred current collection. */
export function buildReportedSourceHealth(report, manifest, previousSnapshot = null) {
  if (!Array.isArray(report?.sources) || !Array.isArray(manifest?.entries)) {
    throw new Error("采集报告 sources 或原始清单 entries 无效");
  }
  const warnings = [];
  const keys = report.collectionWindow?.months ?? [];
  if (!Array.isArray(keys) || keys.some((key) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(key))) {
    throw new Error("采集窗口月份无效，不能推断来源健康");
  }
  if (!keys.length) warnings.push("历史批次未记录采集窗口；不采用当日窗口或休馆预期");
  const batchId = report.batchId ?? manifest.batchId ?? report.generatedAt ?? null;
  const matching = report.batchId
    ? report.batchId === manifest.batchId
    : Boolean(report.generatedAt && report.generatedAt === manifest.generatedAt);
  if (!matching) warnings.push("报告与原始清单批次不匹配；不能用其他批次证据背书");
  const health = attachSourceHealth({
    sourceResults: report.sources,
    rawEntries: matching ? manifest.entries : [],
    previousSnapshot,
    batchId,
    months: keys.map((key) => { const [year, month] = key.split("-").map(Number); return { year, month }; }),
  });
  return {
    summary: health.summary,
    warnings,
    snapshot: buildSourceHealthSnapshot({
      batchId,
      generatedAt: report.generatedAt ?? null,
      collectionWindow: { from: report.collectionWindow?.from ?? null, months: keys },
      sources: health.sources,
    }),
  };
}
