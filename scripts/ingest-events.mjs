import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIngestReport,
  normalizeName,
  normalizeAndMerge,
} from "./event-ingest-lib.mjs";
import { createOfficialSourceAdapters } from "./adapters/official-sources.mjs";
import { createKArenaSourceAdapter } from "./adapters/k-arena-source.mjs";
import { createOsakaJoHallSourceAdapter } from "./adapters/osaka-johall-source.mjs";
import { createSaitamaArenaSourceAdapter } from "./adapters/saitama-arena-source.mjs";
import { createBudokanSogoSourceAdapter } from "./adapters/budokan-sogo-source.mjs";
import { createTokyoDomeSourceAdapter } from "./adapters/tokyo-dome-source.mjs";
import { createIgArenaSourceAdapter } from "./adapters/ig-arena-source.mjs";
import { createPayPayDomeSourceAdapter } from "./adapters/paypay-dome-source.mjs";
import { createMarineMesseASourceAdapter } from "./adapters/marine-messe-a-source.mjs";
import { createVantelinDomeSourceAdapter } from "./adapters/vantelin-dome-source.mjs";
import { createKyoceraDomeSourceAdapter } from "./adapters/kyocera-dome-source.mjs";
import { createAriakeArenaSourceAdapter } from "./adapters/ariake-arena-source.mjs";
import { createTokyoGardenTheaterSourceAdapter } from "./adapters/tokyo-garden-theater-source.mjs";
import { createKurokoKunHallSourceAdapter } from "./adapters/kuroko-kun-hall-source.mjs";
import { createPremistDomeSourceAdapter } from "./adapters/premist-dome-source.mjs";
import { createXebioArenaSendaiSourceAdapter } from "./adapters/xebio-arena-sendai-source.mjs";
import { createWorldMemorialHallSourceAdapter } from "./adapters/world-memorial-hall-source.mjs";
import { createAnabukiArenaKagawaSourceAdapter } from "./adapters/anabuki-arena-kagawa-source.mjs";
import { createSundomeFukuiSourceAdapter } from "./adapters/sundome-fukui-source.mjs";
import { createRawEvidenceStore } from "./raw-evidence-store.mjs";
import {
  nextCheckAt,
  parseRetryAfter,
  retryDelayMs,
  shouldRetryStatus,
} from "./fetch-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const ingestDir = path.join(dataDir, "ingest");
const userAgent = "EnseiTechoEventIngest/0.1 (+local low-frequency public schedule collector)";
const timeoutMs = Number(process.env.EVENT_INGEST_TIMEOUT_MS || 25_000);
const monthCount = Math.min(12, Math.max(1, Number(process.env.EVENT_INGEST_MONTHS || 4)));
const maxTicketmasterPages = Math.min(
  10,
  Math.max(1, Number(process.env.EVENT_INGEST_MAX_PAGES || 5)),
);
const hostNextRequestAt = new Map();
const hostRequestTail = new Map();
const hostIntervalMs = Math.max(
  0,
  Number(process.env.EVENT_INGEST_HOST_INTERVAL_MS || 600),
);

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHostSlot(url) {
  const hostname = new URL(url).hostname;
  const previous = hostRequestTail.get(hostname) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  hostRequestTail.set(hostname, previous.then(() => current));
  await previous;
  const remaining = (hostNextRequestAt.get(hostname) ?? 0) - Date.now();
  if (remaining > 0) await wait(remaining);
  hostNextRequestAt.set(hostname, Date.now() + hostIntervalMs);
  release();
}

async function fetchResponse(url, options = {}, evidenceContext, rawStore) {
  const mayReuse =
    process.env.EVENT_INGEST_FORCE_REFRESH !== "1" &&
    evidenceContext.sourceRole !== "ticket_detail";
  if (mayReuse) {
    const cached = await rawStore.reuseFreshResponse(
      {
        ...evidenceContext,
        requestedUrl: url,
      },
      24 * 60 * 60 * 1000,
    );
    if (cached) {
      return {
        cachedBody: cached.body,
        response: null,
      };
    }
    const cachedFailure = await rawStore.reuseFreshFailure(
      {
        ...evidenceContext,
        requestedUrl: url,
      },
      6 * 60 * 60 * 1000,
    );
    if (cachedFailure) {
      const error = new Error(
        cachedFailure.httpStatus
          ? `HTTP ${cachedFailure.httpStatus} ${cachedFailure.httpStatusText ?? ""}`.trim()
          : cachedFailure.parserErrors?.[0] ?? "cached fetch failure",
      );
      error.httpStatus = cachedFailure.httpStatus;
      throw error;
    }
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await waitForHostSlot(url);
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: options.accept || "text/html,application/json;q=0.9,*/*;q=0.8",
          "User-Agent": userAgent,
          ...options.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const retryAfterMs = response.status === 429
        ? parseRetryAfter(response.headers.get("retry-after"))
        : null;
      const retryDelay = response.status === 429
        ? retryDelayMs(attempt, retryAfterMs)
        : null;
      await rawStore.captureResponse(response, {
        ...evidenceContext,
        requestedUrl: url,
        attempt,
        retryAfterMs,
        nextCheckAt: retryDelay === null ? null : nextCheckAt(retryDelay),
      });
      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status} ${response.statusText}`,
        );
        error.httpStatus = response.status;
        error.retryAfterMs = retryAfterMs;
        throw error;
      }
      return { response, cachedBody: null };
    } catch (error) {
      lastError = error;
      if (attempt < 3 && (!error.httpStatus || shouldRetryStatus(error.httpStatus))) {
        const delay = retryDelayMs(attempt, error.retryAfterMs);
        if (error.httpStatus === 429) {
          const hostname = new URL(url).hostname;
          hostNextRequestAt.set(hostname, Math.max(hostNextRequestAt.get(hostname) ?? 0, Date.now() + delay));
        }
        await wait(delay);
      } else if (
        !rawStore.entries.some(
          (entry) =>
            entry.sourceId === evidenceContext.sourceId &&
            entry.requestedUrl === String(url) &&
            entry.attempt === attempt,
        )
      ) {
        await rawStore.captureFailure(error, {
          ...evidenceContext,
          requestedUrl: url,
          attempt,
          nextCheckAt: nextCheckAt(retryDelayMs(attempt, error.retryAfterMs)),
        });
      }
      if (error.httpStatus && !shouldRetryStatus(error.httpStatus)) break;
    }
  }
  throw lastError;
}

async function fetchText(url, options, evidenceContext, rawStore) {
  const result = await fetchResponse(
    url,
    options,
    evidenceContext,
    rawStore,
  );
  return result.cachedBody
    ? result.cachedBody.toString("utf8")
    : result.response.text();
}

async function fetchJson(url, options, evidenceContext, rawStore) {
  const result = await fetchResponse(
    url,
    options,
    evidenceContext,
    rawStore,
  );
  return result.cachedBody
    ? JSON.parse(result.cachedBody.toString("utf8"))
    : result.response.json();
}

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

async function runAdapter(adapter, rawStore) {
  const { definition } = adapter;
  const startedAt = new Date().toISOString();
  const evidenceBase = {
    sourceId: definition.id,
    adapterId: definition.id,
    sourceRole: definition.role,
    parserIds: definition.parserIds ?? [],
    parserVersion: definition.parserVersion ?? "1",
  };
  const wrapFetch = (fetcher) => (url, options = {}) => {
    const requestOptions = { ...options };
    const evidenceRole = requestOptions.evidenceRole;
    delete requestOptions.evidenceRole;
    delete requestOptions.parserId;
    return fetcher(
      url,
      requestOptions,
      {
        ...evidenceBase,
        sourceRole: evidenceRole ?? evidenceBase.sourceRole,
      },
      rawStore,
    );
  };
  try {
    const outcome = await adapter.collect({
      fetchJson: wrapFetch(fetchJson),
      fetchText: wrapFetch(fetchText),
      recordParserResult: (result) =>
        rawStore.recordParserResult({
          sourceId: definition.id,
          ...result,
        }),
      getRawEvidence: (url) =>
        rawStore.getEvidence(definition.id, url),
    });
    const records = outcome.records ?? [];
    return {
      records,
      result: {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        parserIds: definition.parserIds ?? [],
        status: outcome.skipped ? "skipped" : "ok",
        startedAt,
        finishedAt: new Date().toISOString(),
        recordCount: records.length,
        reason: outcome.reason,
      },
    };
  } catch (error) {
    return {
      records: [],
      result: {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        recordCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const batchId = generatedAt.replace(/[:.]/g, "-");
  const today = process.env.EVENT_INGEST_FROM || todayJst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("EVENT_INGEST_FROM 必须是 YYYY-MM-DD");
  }
  const months = monthsFrom(today, monthCount);
  const [baseArtists, ingestedArtists] = await Promise.all([
    readJson(path.join(dataDir, "artists.json")),
    readJson(path.join(dataDir, "artists-ingested.json"), []),
  ]);
  const artists = [...baseArtists, ...ingestedArtists];
  const [baseVenues, ingestedVenues] = await Promise.all([
    readJson(path.join(dataDir, "venues.json")),
    readJson(path.join(dataDir, "venues-ingested.json"), []),
  ]);
  const venues = [...baseVenues, ...ingestedVenues];
  const reviews = await readJson(path.join(ingestDir, "reviews.json"), {
    approved: [],
    rejected: [],
  });

  const adapterContext = {
    today,
    months,
    monthCount,
    maxTicketmasterPages,
    generatedAt,
    env: process.env,
    normalizeName,
    knownArtistNames: new Set(
      artists.flatMap((artist) => [
        artist.nameJa,
        artist.nameZh,
        artist.romaji,
        artist.kana,
        ...(artist.aliases ?? []),
      ]).filter(Boolean).map(normalizeName),
    ),
  };
  const adapters = [
    ...createOfficialSourceAdapters(adapterContext),
    createKArenaSourceAdapter(adapterContext),
    createOsakaJoHallSourceAdapter(adapterContext),
    createSaitamaArenaSourceAdapter(adapterContext),
    createBudokanSogoSourceAdapter(adapterContext),
    createTokyoDomeSourceAdapter(adapterContext),
    createIgArenaSourceAdapter(adapterContext),
    createPayPayDomeSourceAdapter(adapterContext),
    createMarineMesseASourceAdapter(adapterContext),
    createVantelinDomeSourceAdapter(adapterContext),
    createKyoceraDomeSourceAdapter(adapterContext),
    createAriakeArenaSourceAdapter(adapterContext),
    createTokyoGardenTheaterSourceAdapter(adapterContext),
    createKurokoKunHallSourceAdapter(adapterContext),
    createPremistDomeSourceAdapter(adapterContext),
    createXebioArenaSendaiSourceAdapter(adapterContext),
    createWorldMemorialHallSourceAdapter(adapterContext),
    createAnabukiArenaKagawaSourceAdapter(adapterContext),
    createSundomeFukuiSourceAdapter(adapterContext),
  ];
  const rawStore = createRawEvidenceStore({
    rawRoot: path.join(ingestDir, "raw"),
    batchId,
    fetchedAt: generatedAt,
  });
  await rawStore.loadPreviousManifest(
    path.join(ingestDir, "raw-manifest.json"),
  );
  const collected = await Promise.all(
    adapters.map((adapter) => runAdapter(adapter, rawStore)),
  );
  const sourceResults = collected.map((item) => item.result);
  if (!sourceResults.some((result) => result.status === "ok")) {
    throw new Error("所有采集源均失败；保留现有候选文件，不写入空结果");
  }

  const collectedRecords = collected.flatMap((item) => item.records);
  const records = collectedRecords.filter((record) => record.date >= today);
  const candidates = normalizeAndMerge(records, artists, venues, reviews);
  const approved = candidates.filter((candidate) => candidate.reviewState === "approved");
  const report = buildIngestReport(candidates, sourceResults, reviews, generatedAt);

  await mkdir(ingestDir, { recursive: true });
  await rawStore.writeManifest(path.join(ingestDir, "raw-manifest.json"));
  await Promise.all([
    writeFile(
      path.join(ingestDir, "candidates.json"),
      `${JSON.stringify(candidates, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(ingestDir, "approved.json"),
      `${JSON.stringify(approved, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(ingestDir, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
  ]);

  console.log(
    `采集完成：${collectedRecords.length} 条来源记录，过滤起始日前记录后 ${records.length} 条 → ${candidates.length} 条候选`,
  );
  console.log(`可审核 ${report.summary.readyForReview} 条，已批准 ${approved.length} 条`);
  for (const result of sourceResults) {
    const suffix = result.error || result.reason || `${result.recordCount} 条`;
    console.log(`- [${result.status}] ${result.name}: ${suffix}`);
  }
  console.log(`报告：${path.relative(projectDir, path.join(ingestDir, "report.json"))}`);
}

main().catch((error) => {
  console.error(`演出采集失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});