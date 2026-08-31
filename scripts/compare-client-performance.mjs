import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const beforePath = resolve(root, process.argv[2] ?? "handoff/performance/goal10-before.json");
const afterPath = resolve(root, process.argv[3] ?? "handoff/performance/goal10-after.json");
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));

const metrics = [
  ["clientJsDecodedBytes", "客户端 JS", "bytes"],
  ["documentDecodedBytes", "HTML", "bytes"],
  ["rscDecodedBytes", "RSC/页面数据", "bytes"],
  ["initialDataParseApproxMs", "解析/执行近似", "ms"],
  ["firstInteractiveMs", "首次可交互", "ms"],
  ["jsHeapUsedBytes", "JS Heap", "bytes"],
];

function delta(beforeValue, afterValue) {
  if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) return null;
  return {
    before: beforeValue,
    after: afterValue,
    absolute: afterValue - beforeValue,
    percent: beforeValue === 0 ? null : ((afterValue - beforeValue) / beforeValue) * 100,
  };
}

const routes = after.routes.map((afterRoute) => {
  const beforeRoute = before.routes.find((route) => route.key === afterRoute.key);
  if (!beforeRoute) throw new Error(`before 报告缺少路由：${afterRoute.key}`);
  return {
    key: afterRoute.key,
    label: afterRoute.label,
    path: afterRoute.path,
    metrics: Object.fromEntries(metrics.map(([key]) => [
      key,
      delta(beforeRoute.median[key], afterRoute.median[key]),
    ])),
    fullEventChunkBefore: beforeRoute.median.fullEventChunkLoaded,
    fullEventChunkAfter: afterRoute.median.fullEventChunkLoaded,
  };
});

const comparison = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  before: { path: beforePath, buildId: before.environment.buildId, generatedAt: before.generatedAt },
  after: { path: afterPath, buildId: after.environment.buildId, generatedAt: after.generatedAt },
  routes,
  interactions: {
    searchResponseMs: delta(before.interactions.searchResponseMs, after.interactions.searchResponseMs),
    searchInteractionDataBytes: delta(before.interactions.searchInteractionDataBytes, after.interactions.searchInteractionDataBytes),
    filterResponseMs: delta(before.interactions.filterResponseMs, after.interactions.filterResponseMs),
    mapInitializationMs: delta(before.interactions.mapInitializationMs, after.interactions.mapInitializationMs),
  },
  fullEventBundle: {
    beforeChunks: before.bundleEvidence.chunks,
    beforeRoutes: before.bundleEvidence.routes,
    afterChunks: after.bundleEvidence.chunks,
    afterRoutes: after.bundleEvidence.routes,
  },
};

function bytes(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(2)} MB`
    : `${(value / 1024).toFixed(1)} KB`;
}

function number(value, unit) {
  if (!Number.isFinite(value)) return "—";
  return unit === "bytes" ? bytes(value) : `${value.toFixed(1)} ms`;
}

function percent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const lines = [
  "# Goal 10 客户端性能 before / after",
  "",
  `生成时间：${comparison.generatedAt}`,
  "",
  `- before 构建：${comparison.before.buildId}`,
  `- after 构建：${comparison.after.buildId}`,
  "- 同一脚本、同一台机器、同一浏览器、每路由 3 个禁用缓存的新上下文，表内取中位数。",
  "- 负百分比表示下降；RSC 包含测量窗口内的 Next 路由数据请求。",
  "",
  "| 路由 | 客户端 JS | 解析/执行近似 | 首次可交互 | JS Heap | 完整 Event chunk |",
  "|---|---:|---:|---:|---:|:---:|",
];

for (const route of routes) {
  const cell = (key, unit) => {
    const item = route.metrics[key];
    return `${number(item.before, unit)} → ${number(item.after, unit)}（${percent(item.percent)}）`;
  };
  lines.push(`| ${route.label} \`${route.path}\` | ${cell("clientJsDecodedBytes", "bytes")} | ${cell("initialDataParseApproxMs", "ms")} | ${cell("firstInteractiveMs", "ms")} | ${cell("jsHeapUsedBytes", "bytes")} | ${route.fullEventChunkBefore ? "是" : "否"} → ${route.fullEventChunkAfter ? "是" : "否"} |`);
}

lines.push(
  "",
  "## 页面数据与交互",
  "",
  "| 路由 | HTML | RSC/页面数据 |",
  "|---|---:|---:|",
);
for (const route of routes) {
  const html = route.metrics.documentDecodedBytes;
  const rsc = route.metrics.rscDecodedBytes;
  lines.push(`| ${route.label} | ${bytes(html.before)} → ${bytes(html.after)}（${percent(html.percent)}） | ${bytes(rsc.before)} → ${bytes(rsc.after)}（${percent(rsc.percent)}） |`);
}

const interactionLine = (label, item, unit) => `- ${label}：${number(item.before, unit)} → ${number(item.after, unit)}（${percent(item.percent)}）`;
lines.push(
  "",
  interactionLine("搜索首次结果", comparison.interactions.searchResponseMs, "ms"),
  interactionLine("搜索按需数据", comparison.interactions.searchInteractionDataBytes, "bytes"),
  interactionLine("筛选响应", comparison.interactions.filterResponseMs, "ms"),
  interactionLine("地图初始化", comparison.interactions.mapInitializationMs, "ms"),
  "",
  "## Bundle 结论",
  "",
  `- before：${before.bundleEvidence.chunks.length} 个完整 Event chunk，进入 ${before.bundleEvidence.routes.length} 个目标路由。`,
  `- after：${after.bundleEvidence.chunks.length} 个完整 Event chunk，进入 ${after.bundleEvidence.routes.length} 个目标路由。`,
  "- 权威 Event 数据仍只有 `src/data/events.json`；客户端摘要与搜索索引均由构建脚本生成并做陈旧检查。",
  "",
);

const jsonPath = resolve(root, "handoff/performance/goal10-comparison.json");
const markdownPath = resolve(root, "handoff/performance/goal10-comparison.md");
await writeFile(jsonPath, `${JSON.stringify(comparison, null, 2)}\n`);
await writeFile(markdownPath, `${lines.join("\n")}\n`);
console.log(`性能对比已写入：${markdownPath}`);
