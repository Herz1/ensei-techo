import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import { basename, resolve } from "node:path";
import { chromium } from "playwright-core";
import { OFFLINE_TILE_PNG } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVENT_ID = "evt_e912cb05373a12af9141c910";
const EVENT_TITLE = "森本爵ONEMANLIVE ～Palindrome～";
const TRIP_ID = "trip-goal-10-performance";
const TRIP_NAME = "Goal 10 性能测量远征";
const NOW = "2026-08-31T04:00:00.000Z";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const label = argument("label", "before");
const runs = Math.max(1, Number(argument("runs", "3")) || 3);
const baseUrl = argument("base-url", "http://127.0.0.1:3733").replace(/\/$/u, "");
const testPort = new URL(baseUrl).port || "3733";
const outputDir = resolve(ROOT, argument("output-dir", "handoff/performance"));

const routes = [
  { key: "home", label: "首页", path: "/" },
  { key: "events", label: "演出列表", path: "/events" },
  { key: "eventDetail", label: "演出详情", path: `/events/${EVENT_ID}` },
  { key: "map", label: "地图", path: "/map" },
  { key: "me", label: "我的", path: "/me" },
  { key: "tripDetail", label: "远征详情", path: `/trips/${TRIP_ID}` },
];

const EMPTY_READINESS = {
  eligibility: "unknown",
  account: "unknown",
  phoneDevice: "unknown",
  ticketApp: "unknown",
  identityDocument: "unknown",
  payment: "unknown",
  companion: "unknown",
  distribution: "unknown",
};

const seed = {
  preferences: {
    version: 1,
    setupStatus: "completed",
    homePrefecture: "tokyo",
    origin: "上海虹桥",
    currency: "JPY",
    timeZone: "Asia/Shanghai",
    updatedAt: NOW,
  },
  plans: {
    version: 2,
    plans: [{
      eventId: EVENT_ID,
      intent: "committed",
      tripStatus: "planning",
      applications: [{
        id: "application-goal-10-performance",
        eventId: EVENT_ID,
        label: "性能测量申请",
        provider: "其他官方渠道",
        status: "applied",
        readiness: EMPTY_READINESS,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      manualTasks: [],
      createdAt: NOW,
      updatedAt: NOW,
    }],
  },
  trips: {
    version: 2,
    trips: [{
      id: TRIP_ID,
      name: TRIP_NAME,
      startDate: "2026-09-04",
      endDate: "2026-09-05",
      origin: "上海虹桥",
      eventIds: [EVENT_ID],
      budgetItems: [{ id: "budget-ticket", category: "ticket", label: "票款", amountJpy: 20000 }],
      checklist: [{ id: "check-performance", label: "确认电子票", done: false }],
      customItems: [],
      travelLegs: [],
      eventEndOverrides: {},
      bufferMinutes: 90,
      ignoredConflictKeys: [],
      createdAt: NOW,
      updatedAt: NOW,
    }],
  },
};

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // 继续寻找本机浏览器。
  }
}
if (!executablePath) {
  throw new Error("未找到 Chrome/Edge。可通过 CHROME_PATH 指定浏览器可执行文件。");
}

const eventsPath = resolve(ROOT, "src/data/events.json");
const eventsRaw = await readFile(eventsPath, "utf8");
const authoritativeEvents = JSON.parse(eventsRaw);
if (authoritativeEvents.find((event) => event.id === EVENT_ID)?.titleJa !== EVENT_TITLE) {
  throw new Error(`固定 Event ${EVENT_ID} 已变化，无法保持 before/after 可比性。`);
}

let server = null;
let serverOutput = "";

async function appReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok && (await response.text()).includes("远征手账");
  } catch {
    return false;
  }
}

if (!await appReady()) {
  const nextBin = resolve(ROOT, "node_modules/next/dist/bin/next");
  await access(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn(process.execPath, [nextBin, "start", "-p", testPort], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });
  for (let attempt = 0; attempt < 40 && !await appReady(); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    if (server.exitCode !== null) {
      throw new Error(`生产服务器启动失败：\n${serverOutput}`);
    }
  }
  if (!await appReady()) {
    throw new Error(`生产服务器 20 秒内未就绪：\n${serverOutput}`);
  }
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? round(finite[middle])
    : round((finite[middle - 1] + finite[middle]) / 2);
}

function bytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map((item) => [item.name, item.value]));
}

async function waitForRoute(page, route) {
  if (route.key === "home") {
    await page.getByRole("heading", { name: "先完成眼前的动作" }).waitFor({ timeout: 30_000 });
  } else if (route.key === "events") {
    await page.getByText(/\d+ 场结果/u).filter({ visible: true }).first().waitFor({ timeout: 30_000 });
  } else if (route.key === "eventDetail") {
    await page.getByRole("heading", { name: EVENT_TITLE }).waitFor({ timeout: 30_000 });
  } else if (route.key === "map") {
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="map-runtime-status"]');
      return status?.getAttribute("data-map-ready") === "true"
        && Number(status.getAttribute("data-heat-rendered")) > 0
        && Number(status.getAttribute("data-venue-rendered")) > 0;
    }, undefined, { timeout: 30_000 });
  } else if (route.key === "me") {
    await page.getByRole("heading", { name: /^我的/u }).waitFor({ timeout: 30_000 });
  } else if (route.key === "tripDetail") {
    await page.getByRole("heading", { name: TRIP_NAME }).waitFor({ timeout: 30_000 });
  }
}

async function browserResources(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    return {
      navigation: navigation ? {
        name: navigation.name,
        redirectCount: navigation.redirectCount,
        redirectDuration: navigation.redirectEnd - navigation.redirectStart,
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize,
        decodedBodySize: navigation.decodedBodySize,
      } : null,
      resources,
    };
  });
}

const chunkInspectionCache = new Map();

async function inspectFullEventChunks(resourceEntries) {
  const found = [];
  for (const entry of resourceEntries) {
    const url = new URL(entry.name);
    if (!url.pathname.startsWith("/_next/static/chunks/") || !url.pathname.endsWith(".js")) continue;
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/_next\//u, ""));
    const diskPath = resolve(ROOT, ".next", relativePath);
    let inspection = chunkInspectionCache.get(diskPath);
    if (!inspection) {
      try {
        const content = await readFile(diskPath, "utf8");
        const details = await stat(diskPath);
        inspection = {
          file: basename(diskPath),
          bytes: details.size,
          hasFixedEvent: content.includes(EVENT_ID),
          hasTruthFields: content.includes("fieldProvenance") && content.includes("verification"),
        };
      } catch {
        inspection = null;
      }
      chunkInspectionCache.set(diskPath, inspection);
    }
    if (inspection?.hasFixedEvent && inspection.hasTruthFields) found.push(inspection);
  }
  return found;
}

function summarizeResources(snapshot) {
  const scripts = snapshot.resources.filter((entry) => {
    const pathname = new URL(entry.name).pathname;
    return pathname.startsWith("/_next/static/chunks/") && pathname.endsWith(".js");
  });
  const rsc = snapshot.resources.filter((entry) => new URL(entry.name).searchParams.has("_rsc"));
  const sum = (entries, field) => entries.reduce((total, entry) => total + (entry[field] || 0), 0);
  return {
    clientJsTransferBytes: sum(scripts, "transferSize"),
    clientJsEncodedBytes: sum(scripts, "encodedBodySize"),
    clientJsDecodedBytes: sum(scripts, "decodedBodySize"),
    documentTransferBytes: snapshot.navigation?.transferSize ?? 0,
    documentEncodedBytes: snapshot.navigation?.encodedBodySize ?? 0,
    documentDecodedBytes: snapshot.navigation?.decodedBodySize ?? 0,
    rscTransferBytes: sum(rsc, "transferSize"),
    rscEncodedBytes: sum(rsc, "encodedBodySize"),
    rscDecodedBytes: sum(rsc, "decodedBodySize"),
    rscRequestCount: rsc.length,
    scriptCount: scripts.length,
    scripts: scripts.map((entry) => ({
      file: basename(new URL(entry.name).pathname),
      transferBytes: entry.transferSize,
      decodedBytes: entry.decodedBodySize,
      durationMs: round(entry.duration),
    })).sort((left, right) => right.decodedBytes - left.decodedBytes),
  };
}

async function measureRoute(browser, route, iteration) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  await context.addInitScript(({ seeded, eventId }) => {
    localStorage.setItem("ensei-user-preferences", JSON.stringify(seeded.preferences));
    localStorage.setItem("ensei-event-plans", JSON.stringify(seeded.plans));
    localStorage.setItem("ensei-event-plans-migrated-v2", "true");
    localStorage.setItem("ensei-trip-plans", JSON.stringify(seeded.trips));
    localStorage.setItem("ensei-trip-plans-migrated-v2", "true");
    localStorage.setItem("ensei-follows", "[]");
    localStorage.setItem("ensei-wants", JSON.stringify([eventId]));
    window.__goal10Performance = { jsonParses: [], longTasks: [] };
    const originalParse = JSON.parse;
    JSON.parse = function measuredJsonParse(value, ...args) {
      const startedAt = performance.now();
      try {
        return originalParse.call(this, value, ...args);
      } finally {
        const duration = performance.now() - startedAt;
        window.__goal10Performance.jsonParses.push({
          at: startedAt,
          duration,
          characters: typeof value === "string" ? value.length : 0,
        });
      }
    };
    try {
      new PerformanceObserver((list) => {
        window.__goal10Performance.longTasks.push(...list.getEntries().map((entry) => ({
          startTime: entry.startTime,
          duration: entry.duration,
        })));
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // 浏览器不支持 Long Tasks 时仍保留 CDP ScriptDuration。
    }
  }, { seeded: seed, eventId: EVENT_ID });
  await context.route("**/*", async (routeRequest) => {
    const requestUrl = new URL(routeRequest.request().url());
    if (requestUrl.origin === new URL(baseUrl).origin || ["data:", "blob:"].includes(requestUrl.protocol)) {
      await routeRequest.continue();
    } else if (requestUrl.pathname.endsWith(".png")) {
      await routeRequest.fulfill({ status: 200, contentType: "image/png", body: OFFLINE_TILE_PNG });
    } else {
      await routeRequest.abort("blockedbyclient");
    }
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Performance.enable");

  try {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForRoute(page, route);
    const routeReadyMs = await page.evaluate(() => performance.now());
    const mapInitializationMs = route.key === "map" ? routeReadyMs : null;
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.evaluate(() => new Promise((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
    }));

    const initialSnapshot = await browserResources(page);
    const resourceSummary = summarizeResources(initialSnapshot);
    const fullEventChunks = await inspectFullEventChunks(initialSnapshot.resources);
    const cdpMetrics = metricMap(await cdp.send("Performance.getMetrics"));
    const heap = await cdp.send("Runtime.getHeapUsage");
    const dom = await cdp.send("Memory.getDOMCounters");
    const parseMetrics = await page.evaluate(() => window.__goal10Performance);
    const largeJsonParses = parseMetrics.jsonParses.filter((item) => item.characters >= 1024);
    const instrumentedJsonParseMs = largeJsonParses.reduce((sum, item) => sum + item.duration, 0);
    const startupLongTaskMs = Math.max(0, ...parseMetrics.longTasks
      .filter((item) => item.startTime <= routeReadyMs)
      .map((item) => item.duration));

    const searchTrigger = page.getByRole("button", { name: "搜索", exact: true });
    await searchTrigger.waitFor({ state: "visible", timeout: 30_000 });
    const searchInteractionStartedAt = route.key === "home"
      ? await page.evaluate(() => performance.now())
      : null;
    await searchTrigger.click();
    const searchDialog = page.getByRole("dialog", { name: "全站搜索" });
    await searchDialog.waitFor({ state: "visible", timeout: 30_000 });
    const firstInteractiveMs = await page.evaluate(() => performance.now());

    let searchResponseMs = null;
    let searchInteractionDataBytes = null;
    const searchInput = page.getByLabel("搜索艺人、场地或演出");
    if (route.key === "home") {
      const searchStartedAt = await page.evaluate(() => performance.now());
      await searchInput.fill("森本爵");
      await page.locator(`[data-event-id="${EVENT_ID}"]`).waitFor({ state: "visible", timeout: 30_000 });
      searchResponseMs = (await page.evaluate(() => performance.now())) - searchStartedAt;
      const afterSearch = await browserResources(page);
      searchInteractionDataBytes = afterSearch.resources
        .filter((entry) => entry.startTime >= searchInteractionStartedAt)
        .reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0);
    }
    await searchInput.press("Escape");
    await searchDialog.waitFor({ state: "detached", timeout: 30_000 });

    let filterResponseMs = null;
    let filterResultCount = null;
    if (route.key === "events") {
      const filterStartedAt = await page.evaluate(() => performance.now());
      await page.getByLabel("售票阶段").selectOption("open");
      await page.waitForFunction(() => new URL(location.href).searchParams.get("sale") === "open");
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)));
      filterResponseMs = (await page.evaluate(() => performance.now())) - filterStartedAt;
      filterResultCount = await page.getByText(/\d+ 场结果/u).filter({ visible: true }).first().innerText();
    }

    return {
      iteration,
      finalUrl: page.url(),
      routeReadyMs: round(routeReadyMs),
      firstInteractiveMs: round(firstInteractiveMs),
      searchResponseMs: round(searchResponseMs),
      searchInteractionDataBytes,
      filterResponseMs: round(filterResponseMs),
      filterResultCount,
      mapInitializationMs: round(mapInitializationMs),
      domContentLoadedMs: round(initialSnapshot.navigation?.domContentLoadedMs),
      loadMs: round(initialSnapshot.navigation?.loadMs),
      instrumentedJsonParseMs: round(instrumentedJsonParseMs),
      startupScriptEvaluationMs: round((cdpMetrics.ScriptDuration ?? 0) * 1000),
      initialDataParseApproxMs: round((cdpMetrics.ScriptDuration ?? 0) * 1000),
      startupLongestTaskMs: round(startupLongTaskMs),
      jsHeapUsedBytes: round(heap.usedSize, 0),
      jsHeapTotalBytes: round(heap.totalSize, 0),
      embedderHeapUsedBytes: round(heap.embedderHeapUsedSize, 0),
      documents: dom.documents,
      nodes: dom.nodes,
      pageErrors,
      fullEventChunkLoaded: fullEventChunks.length > 0,
      fullEventChunks,
      ...resourceSummary,
    };
  } finally {
    await context.close();
  }
}

function routeMedian(samples) {
  const numericFields = [
    "routeReadyMs",
    "firstInteractiveMs",
    "searchResponseMs",
    "searchInteractionDataBytes",
    "filterResponseMs",
    "mapInitializationMs",
    "domContentLoadedMs",
    "loadMs",
    "instrumentedJsonParseMs",
    "startupScriptEvaluationMs",
    "initialDataParseApproxMs",
    "startupLongestTaskMs",
    "jsHeapUsedBytes",
    "jsHeapTotalBytes",
    "embedderHeapUsedBytes",
    "documents",
    "nodes",
    "clientJsTransferBytes",
    "clientJsEncodedBytes",
    "clientJsDecodedBytes",
    "documentTransferBytes",
    "documentEncodedBytes",
    "documentDecodedBytes",
    "rscTransferBytes",
    "rscEncodedBytes",
    "rscDecodedBytes",
    "rscRequestCount",
    "scriptCount",
  ];
  const result = Object.fromEntries(numericFields.map((field) => [
    field,
    median(samples.map((sample) => sample[field])),
  ]));
  result.fullEventChunkLoaded = samples.some((sample) => sample.fullEventChunkLoaded);
  result.fullEventChunks = [...new Map(samples.flatMap((sample) => sample.fullEventChunks)
    .map((chunk) => [chunk.file, chunk])).values()];
  result.pageErrors = [...new Set(samples.flatMap((sample) => sample.pageErrors))];
  result.filterResultCount = samples.find((sample) => sample.filterResultCount)?.filterResultCount ?? null;
  result.largestScripts = samples[0]?.scripts.slice(0, 8) ?? [];
  return result;
}

function markdown(report) {
  const lines = [
    `# Goal 10 客户端性能基线：${report.label}`,
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 环境与方法",
    "",
    `- 机器：${report.environment.os} · ${report.environment.cpu} · ${report.environment.logicalCores} 逻辑核 · ${report.environment.totalMemoryGb} GB RAM`,
    `- 浏览器：${report.environment.browser}（headless，1440×900）`,
    `- Node：${report.environment.node}；生产构建 ID：${report.environment.buildId}`,
    `- 每条路由：${report.environment.runs} 个全新浏览器上下文，禁用 HTTP 缓存，取中位数。`,
    "- 外部网络全部拦截；地图 PNG 底图返回内存透明瓦片，业务 GeoJSON、热度和场馆点仍从本地生产站点加载。",
    "- 客户端 JS、HTML 与 RSC 取 Resource Timing 的 decodedBodySize；RSC 是带 `_rsc` 参数的首屏请求，HTML 内嵌 Flight 数据计入 document。",
    "- `首次数据解析`以 Chrome CDP 的首屏 ScriptDuration 作为可重复近似值；另单列实际 JSON.parse（≥1 KB）耗时。当前 JSON 模块会编译为 JS 字面量，因此不会完整落入 JSON.parse 计时。",
    "- `首次可交互`是从 navigationStart 到点击全站搜索按钮后模态框确实打开；搜索、筛选和地图均等待可见结果或运行时 ready 标记。",
    "- 内存是 route ready 后 Runtime.getHeapUsage 的 usedSize 近似值，不代表操作系统工作集。",
    "",
    `权威源：src/data/events.json，${report.sourceData.eventCount} 场，${bytes(report.sourceData.eventsJsonBytes)}。`,
    "",
    "## 路由中位数",
    "",
    "| 路由 | 客户端 JS（解码） | HTML | RSC | 首次数据解析/执行近似 | JSON.parse ≥1KB | 首次可交互 | JS Heap | 完整 Event chunk |",
    "|---|---:|---:|---:|---:|---:|---:|---:|:---:|",
  ];
  for (const route of report.routes) {
    const value = route.median;
    lines.push(`| ${route.label} \`${route.path}\` | ${bytes(value.clientJsDecodedBytes)} | ${bytes(value.documentDecodedBytes)} | ${bytes(value.rscDecodedBytes)} | ${value.initialDataParseApproxMs ?? "—"} ms | ${value.instrumentedJsonParseMs ?? "—"} ms | ${value.firstInteractiveMs ?? "—"} ms | ${bytes(value.jsHeapUsedBytes)} | ${value.fullEventChunkLoaded ? "是" : "否"} |`);
  }
  lines.push(
    "",
    "## 首次交互",
    "",
    `- 搜索首次结果：首页 ${report.interactions.searchResponseMs ?? "—"} ms；交互期间新增数据 ${bytes(report.interactions.searchInteractionDataBytes)}。`,
    `- 演出筛选：${report.interactions.filterResponseMs ?? "—"} ms（${report.interactions.filterResultCount ?? "结果未记录"}）。`,
    `- 地图初始化：${report.interactions.mapInitializationMs ?? "—"} ms（等待至少一个热度区域和一个场馆／聚合点）。`,
    "",
    "## Bundle 证据",
    "",
    `固定 Event ID 与真实性字段共同命中的客户端 chunk：${report.bundleEvidence.chunks.length ? report.bundleEvidence.chunks.map((chunk) => `\`${chunk.file}\` ${bytes(chunk.bytes)}`).join("、") : "无"}。`,
    "",
    `加载该完整 Event chunk 的路由：${report.bundleEvidence.routes.length ? report.bundleEvidence.routes.join("、") : "无"}。`,
    "",
    "原始样本及逐个 chunk 见同目录 JSON。",
    "",
  );
  return lines.join("\n");
}

let browser = null;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--use-angle=swiftshader",
      "--enable-webgl",
    ],
  });
  const measuredRoutes = [];
  for (const route of routes) {
    const samples = [];
    for (let iteration = 1; iteration <= runs; iteration += 1) {
      const sample = await measureRoute(browser, route, iteration);
      samples.push(sample);
      console.log(`${route.label} ${iteration}/${runs}: JS ${bytes(sample.clientJsDecodedBytes)} · 交互 ${sample.firstInteractiveMs} ms · Heap ${bytes(sample.jsHeapUsedBytes)}`);
    }
    measuredRoutes.push({ ...route, samples, median: routeMedian(samples) });
  }

  const buildId = (await readFile(resolve(ROOT, ".next/BUILD_ID"), "utf8")).trim();
  const cpu = os.cpus()[0]?.model?.trim() ?? "unknown";
  const chunks = [...new Map(measuredRoutes.flatMap((route) => route.median.fullEventChunks)
    .map((chunk) => [chunk.file, chunk])).values()];
  const report = {
    schemaVersion: 1,
    label,
    generatedAt: new Date().toISOString(),
    environment: {
      os: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu,
      logicalCores: os.cpus().length,
      totalMemoryGb: round(os.totalmem() / 1024 / 1024 / 1024, 1),
      browser: await browser.version(),
      browserExecutable: executablePath,
      node: process.version,
      viewport: { width: 1440, height: 900 },
      runs,
      buildId,
      baseUrl,
      cache: "disabled per fresh context",
      externalNetwork: "blocked; PNG map tiles fulfilled with an in-memory 1x1 transparent image",
    },
    method: {
      clientBytes: "PerformanceResourceTiming decodedBodySize; unique fresh context per sample",
      pageData: "document decodedBodySize plus resources whose URL contains _rsc",
      initialDataParse: "CDP Performance.ScriptDuration at route-ready as a stable parse/evaluate proxy; JSON.parse >=1KB separately instrumented",
      firstInteractive: "navigationStart to click-driven global search dialog visible",
      search: `fill 森本爵 to visible [data-event-id=${EVENT_ID}]`,
      filter: "select 售票阶段=open to URL state committed and next animation frame",
      map: "navigationStart to data-map-ready=true with heatRendered>0 and venueRendered>0",
      memory: "Runtime.getHeapUsage usedSize at route-ready",
    },
    sourceData: {
      path: "src/data/events.json",
      eventCount: authoritativeEvents.length,
      eventsJsonBytes: Buffer.byteLength(eventsRaw),
    },
    routes: measuredRoutes,
    interactions: {
      searchResponseMs: measuredRoutes.find((route) => route.key === "home").median.searchResponseMs,
      searchInteractionDataBytes: measuredRoutes.find((route) => route.key === "home").median.searchInteractionDataBytes,
      filterResponseMs: measuredRoutes.find((route) => route.key === "events").median.filterResponseMs,
      filterResultCount: measuredRoutes.find((route) => route.key === "events").median.filterResultCount,
      mapInitializationMs: measuredRoutes.find((route) => route.key === "map").median.mapInitializationMs,
    },
    bundleEvidence: {
      signature: `${EVENT_ID} + fieldProvenance + verification`,
      chunks,
      routes: measuredRoutes.filter((route) => route.median.fullEventChunkLoaded).map((route) => route.path),
    },
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, `goal10-${label}.json`);
  const markdownPath = resolve(outputDir, `goal10-${label}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown(report), "utf8");
  console.log(`性能报告已写入：${jsonPath}`);
  console.log(`性能摘要已写入：${markdownPath}`);
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolveWait) => server.once("exit", resolveWait));
  }
}
