import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRawEvidenceStore } from "./raw-evidence-store.mjs";
import {
  canonicalizeTicketUrl,
  classifyTicketUrl,
  getRefreshPriority,
  recognizeTicketProvider,
  ticketOfferId,
} from "./ticket-offer-lib.mjs";
import { matchTicketObservation } from "./event-match.mjs";
import { parseTicketPage } from "./ticket-page-parser.mjs";
import { nextCheckAt, parseRetryAfter, retryDelayMs, shouldRetryStatus } from "./fetch-policy.mjs";
import { isAccessRestricted } from "./frontier-access-policy.mjs";
import {
  DEFAULT_BATCH_LIMIT,
  renderRefreshMarkdown,
  selectFrontierJobs,
} from "./ticket-refresh-core.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const FRONTIER_PATH = resolve(ROOT, "src/data/ingest/link-frontier.json");
const OBSERVATIONS_PATH = resolve(ROOT, "src/data/ingest/ticket-offer-observations.json");
const RAW_MANIFEST_PATH = resolve(ROOT, "src/data/ingest/ticket-frontier-raw-manifest.json");
const RUN_REPORT_PATH = resolve(ROOT, "src/data/ingest/ticket-refresh-last.json");
const RUN_REPORT_MARKDOWN_PATH = resolve(ROOT, "src/data/ingest/ticket-refresh-last.md");
const RAW_ROOT = resolve(ROOT, "src/data/ingest/raw");
const USER_AGENT = "EnseiTechoTicketFrontier/0.1 (+low-frequency public official-page checker)";
const MAX_ATTEMPTS = 3;
const HOST_INTERVAL_MS = Math.max(500, Number(process.env.TICKET_FRONTIER_HOST_INTERVAL_MS ?? 800));
const TIMEOUT_MS = Math.max(5_000, Number(process.env.TICKET_FRONTIER_TIMEOUT_MS ?? 25_000));
const hostNextAt = new Map();

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForHost(url) {
  const hostname = new URL(url).hostname;
  const remaining = (hostNextAt.get(hostname) ?? 0) - Date.now();
  if (remaining > 0) await wait(remaining);
  hostNextAt.set(hostname, Date.now() + HOST_INTERVAL_MS);
}

function sourceFor(candidate, entry) {
  return candidate.sources?.find((source) => source.sourceId === entry.sourceId)?.sourceUrl
    ?? candidate.sources?.[0]?.sourceUrl
    ?? null;
}

function frontierSeed(approved) {
  const byUrl = new Map();
  for (const candidate of approved) {
    for (const entry of candidate.sourceChain ?? []) {
      if ((entry.fetchStatus ?? entry.status) !== "not_checked" || !entry.url) continue;
      const canonical = canonicalizeTicketUrl(entry.url);
      const identity = canonical ?? String(entry.url);
      const current = byUrl.get(identity) ?? {
        url: canonical ?? String(entry.url),
        role: entry.role ?? "unknown",
        discoveredFrom: sourceFor(candidate, entry),
        hintedEventId: candidate.id,
        hintedEventIds: [],
        status: "pending",
        attemptCount: 0,
        nextCheckAt: null,
        lastHttpStatus: null,
        urlKind: classifyTicketUrl(entry.url),
        provider: recognizeTicketProvider(entry.url).key,
        lastCheckedAt: null,
        lastError: null,
      };
      current.hintedEventIds.push(candidate.id);
      if (current.role !== "ticket_detail" && entry.role === "ticket_detail") current.role = "ticket_detail";
      byUrl.set(identity, current);
    }
  }
  for (const job of byUrl.values()) {
    job.hintedEventIds = [...new Set(job.hintedEventIds)];
    if (!canonicalizeTicketUrl(job.url) || /\/cdn-cgi\/l\/email-protection/iu.test(job.url)) {
      job.status = "blocked";
      job.lastError = "不是可访问的 HTTP(S) 官方页面";
    } else if (["support", "refund"].includes(job.urlKind)) {
      job.status = "invalid";
      job.nextCheckAt = null;
      job.lastError = `URL 类型为 ${job.urlKind}，不是有效购票页`;
    } else if (job.urlKind === "search") {
      job.status = "deferred";
      job.nextCheckAt = nextCheckAt(7 * 24 * 60 * 60 * 1000);
      job.lastError = "URL 类型为 search，不作为具体购票页抓取";
    } else if (/^(?:x\.com|twitter\.com|www\.instagram\.com)$/u.test(new URL(job.url).hostname)) {
      job.status = "blocked";
      job.nextCheckAt = null;
      job.lastError = "社交平台页面不进入自动二轮抓取";
    }
  }
  return [...byUrl.values()].sort((left, right) =>
    Number(right.role === "ticket_detail") - Number(left.role === "ticket_detail") || left.url.localeCompare(right.url));
}

function mergeFrontier(seed, previous) {
  const previousByUrl = new Map((previous?.jobs ?? previous ?? []).map((job) => [job.url, job]));
  return seed.map((job) => {
    const old = previousByUrl.get(job.url);
    if (!old) return job;
    const merged = {
      ...job,
      ...old,
      hintedEventIds: [...new Set([...(job.hintedEventIds ?? []), ...(old.hintedEventIds ?? [])])],
      role: job.role === "ticket_detail" ? job.role : old.role,
      urlKind: job.urlKind,
      provider: job.provider,
    };
    if (["blocked", "deferred", "invalid"].includes(job.status)) {
      merged.status = job.status;
      merged.lastError = job.lastError;
      merged.nextCheckAt = job.status === "deferred"
        ? (old.status === "deferred" && old.nextCheckAt ? old.nextCheckAt : job.nextCheckAt)
        : null;
    }
    if (old.status === "done" && /页面未找到与来源链事件相符/iu.test(old.lastError ?? "")) {
      merged.status = "unmatched";
      merged.unmatchedReason = old.unmatchedReason ?? "page_information_insufficient";
    }
    if (old.status === "deferred"
      && old.lastHttpStatus >= 400
      && old.lastHttpStatus < 500
      && ![401, 403].includes(old.lastHttpStatus)) {
      merged.status = "invalid";
      merged.nextCheckAt = null;
      merged.lastError = old.lastError ?? `HTTP ${old.lastHttpStatus} 不再有效`;
    }
    return merged;
  });
}

function eventDaysFromNow(event, nowMs) {
  if (!event?.date) return null;
  const eventMs = Date.parse(`${event.date}T00:00:00+09:00`);
  if (!Number.isFinite(eventMs)) return null;
  return Math.floor((eventMs - nowMs) / 86_400_000);
}

function jobPriority(job, events, nowMs = Date.now()) {
  const contexts = (job.hintedEventIds ?? [])
    .map((id) => events.find((event) => event.id === id))
    .filter(Boolean);
  if (job.urlKind === "event_detail") return 0;
  if (contexts.some((event) => (event.ticketOffers ?? []).some((offer) => {
    if (offer.saleStatus === "open") return true;
    return [offer.endAt, offer.paymentDeadline]
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .some((at) => Number.isFinite(at) && at >= nowMs && at - nowMs <= 86_400_000);
  }))) return 0;
  if (contexts.some((event) => (event.phases ?? []).some((phase) => {
    const startMs = Date.parse(`${phase.start}T00:00:00+09:00`);
    return Number.isFinite(startMs) && startMs >= nowMs && startMs - nowMs <= 7 * 86_400_000;
  }))) return 1;
  if (contexts.some((event) => (event.ticketOffers ?? []).some((offer) => {
    const startMs = offer.startAt ? Date.parse(offer.startAt) : Number.NaN;
    return Number.isFinite(startMs) && startMs >= nowMs && startMs - nowMs <= 7 * 86_400_000;
  }))) return 1;
  if (contexts.some((event) => {
    const days = eventDaysFromNow(event, nowMs);
    return days !== null && days >= 0 && days <= 30;
  })) return 1;
  if (contexts.some((event) => {
    const families = new Set((event.verification?.sources ?? []).map((source) => source.type ?? "unknown"));
    if ((event.ticketOffers ?? []).some((offer) => !offer.derivedFromLegacy)) families.add("ticket");
    return families.size <= 1;
  })) return 1;
  if (contexts.some((event) => (eventDaysFromNow(event, nowMs) ?? -1) >= 0)) return 2;
  return 3;
}

function classifyUnmatchedReason(parsedByEvent, matchResults) {
  if (matchResults.some((result) => result.reason === "ambiguous_same_day_venue")) return "day_night_ambiguity";
  if (matchResults.some((result) => result.level === "probable")) return "multiple_candidates";
  const metadata = parsedByEvent.map(({ parsed }) => parsed.metadata).find(Boolean) ?? {};
  if (!metadata.date && !metadata.venueName) return "page_information_insufficient";
  if (!metadata.date) return "date_mismatch";
  if (!metadata.venueName) return "venue_mismatch";
  if (!metadata.artistNames?.length) return "artist_insufficient";
  if (matchResults.some((result) => result.reason === "insufficient_evidence")) return "no_existing_event";
  return "other";
}

async function fetchJob(job, rawStore, events) {
  let lastError = null;
  let activeStep = "fetch";
  let fetchSucceeded = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    job.attemptCount += 1;
    activeStep = "fetch";
    await waitForHost(job.url);
    try {
      const response = await fetch(job.url, {
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : null;
      const delay = response.status === 429 ? retryDelayMs(attempt, retryAfterMs) : null;
      await rawStore.captureResponse(response, {
        sourceId: `frontier-${job.provider}`,
        adapterId: "ticket-link-frontier",
        sourceRole: job.role,
        parserIds: ["ticket-offer-jsonld", "ticket-offer-structured", "ticket-offer-provider", "ticket-offer-dom"],
        parserVersion: "1",
        requestedUrl: job.url,
        attempt,
        retryAfterMs,
        nextCheckAt: delay === null ? null : nextCheckAt(delay),
      });
      job.lastHttpStatus = response.status;
      job.lastCheckedAt = new Date().toISOString();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.httpStatus = response.status;
        error.retryAfterMs = retryAfterMs;
        throw error;
      }
      fetchSucceeded = true;
      const html = await response.text();
      const finalUrl = response.url || job.url;
      job.finalUrl = canonicalizeTicketUrl(finalUrl) ?? finalUrl;
      if (isAccessRestricted(html, finalUrl)) {
        const error = new Error("页面需要登录或人机验证，停止自动访问");
        error.httpStatus = 403;
        throw error;
      }
      let finalHostname = "";
      try {
        finalHostname = new URL(finalUrl).hostname;
      } catch {
        // response.url should be absolute, but keep the fetch path defensive.
      }
      if (finalHostname === "sorry.pia.jp" || /sorry\.pia\.jp|ページが見つかりません|お探しのページ.*見つかりません/iu.test(html)) {
        const error = new Error("官方页面跳转到不可用的占位页");
        error.httpStatus = 410;
        throw error;
      }
      activeStep = "parse";
      const parsedByEvent = job.hintedEventIds.map((hintedEventId) => {
        const context = events.find((event) => event.id === hintedEventId) ?? null;
        return {
          hintedEventId,
          parsed: parseTicketPage(html, finalUrl, job.lastCheckedAt, context),
        };
      });
      const observations = [];
      const matchResults = [];
      activeStep = "match";
      for (const { hintedEventId, parsed } of parsedByEvent) {
        if (!parsed.contextMatched) continue;
        const match = matchTicketObservation(parsed.metadata, events);
        matchResults.push(match);
        if (match.level !== "confirmed" || match.eventId !== hintedEventId) continue;
        const offer = {
          id: ticketOfferId(hintedEventId, parsed.offerBase.provider, parsed.offerBase.providerEventId, parsed.offerBase.url),
          eventId: hintedEventId,
          ...parsed.offerBase,
          matchLevel: "confirmed",
        };
        observations.push({ eventId: hintedEventId, matchLevel: match.level, matchReason: match.reason, matchScore: match.score, parserUsed: parsed.parserUsed, offer });
      }
      await rawStore.recordParserResult({
        sourceId: `frontier-${job.provider}`,
        url: job.url,
        parserId: "ticket-offer-context",
        status: "success",
        outputCount: observations.length,
      });
      job.status = observations.length ? "done" : "unmatched";
      const refreshPriority = getRefreshPriority(
        observations[0]?.offer ?? { saleStatus: "unknown", startAt: null },
        new Date(job.lastCheckedAt),
      );
      const refreshDelay = refreshPriority === "high"
        ? 6 * 60 * 60 * 1000
        : refreshPriority === "medium"
          ? 48 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
      job.nextCheckAt = nextCheckAt(refreshDelay, Date.parse(job.lastCheckedAt));
      job.lastError = observations.length ? null : "页面未找到与来源链事件相符的日期和场馆";
      job.unmatchedReason = observations.length ? null : classifyUnmatchedReason(parsedByEvent, matchResults);
      return {
        observations,
        replacePrevious: true,
        replaceUrls: [job.url, finalUrl],
        outcome: {
          url: job.url,
          eventIds: job.hintedEventIds ?? [],
          step: "match",
          result: observations.length ? "matched" : "unmatched",
          reason: observations.length
            ? `确认 ${observations.length} 条 Event/Offer 匹配`
            : `${job.lastError}（${job.unmatchedReason}）`,
          requiresManual: !observations.length,
          nextCheckAt: job.nextCheckAt,
          nextAction: observations.length ? "按刷新优先级复查" : "人工核对页面与候选 Event",
          httpStatus: job.lastHttpStatus,
          fetchSucceeded,
          validMatchCount: observations.length,
          unmatchedReason: job.unmatchedReason,
        },
      };
    } catch (error) {
      lastError = error;
      const status = error?.httpStatus ?? null;
      const retryable = activeStep === "fetch" && (status === null || shouldRetryStatus(status));
      if (attempt < MAX_ATTEMPTS && retryable) {
        const delay = retryDelayMs(attempt, error?.retryAfterMs);
        job.nextCheckAt = nextCheckAt(delay);
        await wait(delay);
        continue;
      }
      if (status === 401 || status === 403) job.status = "blocked";
      else if (status >= 400 && status < 500) job.status = "invalid";
      else job.status = "deferred";
      const delay = status === 429
        ? retryDelayMs(attempt, error?.retryAfterMs)
        : 24 * 60 * 60 * 1000;
      job.nextCheckAt = job.status === "deferred" ? nextCheckAt(delay) : null;
      job.lastError = error instanceof Error ? error.message : String(error);
      job.unmatchedReason = null;
      if (status === null) {
        await rawStore.captureFailure(error, {
          sourceId: `frontier-${job.provider}`,
          adapterId: "ticket-link-frontier",
          sourceRole: job.role,
          parserIds: ["ticket-offer-dom"],
          parserVersion: "1",
          requestedUrl: job.url,
          attempt,
          nextCheckAt: job.nextCheckAt,
        });
      }
      break;
    }
  }
  if (!lastError) job.lastError = "未执行";
  return {
    observations: [],
    // blocked/deferred 不是链接失效证据，不能因此删除上次有效观察。
    replacePrevious: job.status === "invalid",
    replaceUrls: [job.url],
    outcome: {
      url: job.url,
      eventIds: job.hintedEventIds ?? [],
      step: activeStep,
      result: job.status,
      reason: job.lastError,
      requiresManual: job.status === "blocked" || activeStep !== "fetch",
      nextCheckAt: job.nextCheckAt,
      nextAction: job.status === "invalid"
        ? "链接已失效，不自动重试"
        : job.status === "blocked"
          ? "人工确认访问限制；不尝试登录或验证码"
          : "等待 nextCheckAt 后重试",
      httpStatus: job.lastHttpStatus,
      fetchSucceeded,
      validMatchCount: 0,
      unmatchedReason: null,
    },
  };
}

const approved = await readJson(resolve(ROOT, "src/data/ingest/approved.json"), []);
const events = await readJson(resolve(ROOT, "src/data/events.json"), []);
const venues = await readJson(resolve(ROOT, "src/data/venues.json"), []);
const ingestedVenues = await readJson(resolve(ROOT, "src/data/venues-ingested.json"), []);
const artists = await readJson(resolve(ROOT, "src/data/artists.json"), []);
const ingestedArtists = await readJson(resolve(ROOT, "src/data/artists-ingested.json"), []);
const venueById = new Map([...venues, ...ingestedVenues].map((venue) => [venue.id, venue]));
const artistById = new Map([...artists, ...ingestedArtists].map((artist) => [artist.id, artist]));
const matchEvents = events.map((event) => ({
  ...event,
  venueName: venueById.get(event.venueId)?.nameJa ?? event.venueId,
  artistNames: event.artistIds.map((id) => artistById.get(id)?.nameJa).filter(Boolean),
}));
const previousFrontier = await readJson(FRONTIER_PATH, null);
const jobs = mergeFrontier(frontierSeed(approved), previousFrontier);
for (const job of jobs) {
  if (job.status === "done" && !job.nextCheckAt && job.lastCheckedAt) {
    job.nextCheckAt = nextCheckAt(48 * 60 * 60 * 1000, Date.parse(job.lastCheckedAt));
  }
}
function optionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
    else if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
  }
  return values;
}

function integerOption(name, fallback) {
  const raw = optionValues(name).at(-1);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} 必须是整数`);
  return value;
}

const shouldFetch = process.argv.includes("--fetch");
const allRoles = process.argv.includes("--all-roles");
const strictExplicitEvents = process.argv.includes("--strict-events");
const includeCheckedExplicit = process.argv.includes("--include-checked");
const apply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
if (apply && explicitDryRun) throw new Error("--apply 与 --dry-run 不能同时使用");
if (apply && !shouldFetch) throw new Error("--apply 必须与 --fetch 一起使用，避免误写正式观察数据");
const dryRun = !apply;
const explicitUrls = optionValues("--url");
const explicitEventIds = [
  ...optionValues("--event-id"),
  ...optionValues("--event"),
];
const explicitEventSet = new Set(explicitEventIds);
const pendingLimit = integerOption("--pending-limit", 0);
const limit = integerOption("--limit", DEFAULT_BATCH_LIMIT);
const fetchedAt = new Date().toISOString();
const batchId = `ticket-frontier-${fetchedAt.replace(/[:.]/gu, "-")}`;
const newObservations = [];
const replacedUrls = new Set();
const outcomes = [];
const selection = selectFrontierJobs({
  jobs: jobs.sort((left, right) =>
    jobPriority(left, matchEvents) - jobPriority(right, matchEvents)
    || Number(right.role === "ticket_detail") - Number(left.role === "ticket_detail")
    || left.url.localeCompare(right.url)),
  explicitUrls,
  explicitEventIds,
  pendingLimit,
  batchLimit: limit,
  allRoles,
  strictExplicitEvents,
  includeCheckedExplicit,
});
const selectedReportItems = selection.selected.map(({ job, reasons }) => ({
  url: job.url,
  status: job.status,
  reasons,
  eventIds: [...new Set([job.hintedEventId, ...(job.hintedEventIds ?? [])].filter(Boolean))]
    .filter((eventId) => !strictExplicitEvents || explicitEventSet.has(eventId)),
}));

console.log(`Ticket refresh 模式：${dryRun ? "dry-run（不抓取、不写正式数据）" : "apply（抓取并更新观察数据）"}`);
console.log(`默认范围：${selection.policy.defaultScope}；pending：${selection.policy.pendingSelection}；批次上限：${selection.policy.batchLimit}。`);
console.log(`实际选择：${selection.selected.length} 个；当前 frontier：${JSON.stringify(selection.statusCounts)}。`);
for (const { job, reasons } of selection.selected) {
  console.log(`SELECT ${job.url} | ${job.status} | ${reasons.join("、")} | Event: ${(job.hintedEventIds ?? [job.hintedEventId]).filter(Boolean).join(", ") || "未关联"}`);
}
for (const item of selection.omittedByBatchLimit) {
  console.log(`OMIT ${item.url} | 超过本批次上限 ${limit} | ${item.reasons.join("、")}`);
}

if (shouldFetch && apply && selection.selected.length > 0) {
  const rawStore = createRawEvidenceStore({ rawRoot: RAW_ROOT, batchId, fetchedAt });
  await rawStore.loadPreviousManifest(RAW_MANIFEST_PATH);
  for (const { job } of selection.selected) {
    const originalEventIds = [...new Set([job.hintedEventId, ...(job.hintedEventIds ?? [])].filter(Boolean))];
    const scopedEventIds = strictExplicitEvents
      ? originalEventIds.filter((eventId) => explicitEventSet.has(eventId))
      : originalEventIds;
    const scopedJob = strictExplicitEvents
      ? { ...job, hintedEventId: scopedEventIds[0] ?? null, hintedEventIds: scopedEventIds }
      : job;
    const result = await fetchJob(scopedJob, rawStore, matchEvents);
    if (strictExplicitEvents) {
      for (const key of ["status", "attemptCount", "nextCheckAt", "lastHttpStatus", "lastCheckedAt", "lastError", "finalUrl", "unmatchedReason"]) {
        job[key] = scopedJob[key] ?? null;
      }
    }
    outcomes.push(result.outcome);
    newObservations.push(...result.observations);
    if (result.replacePrevious) {
      for (const value of result.replaceUrls ?? [job.url]) {
        const canonical = canonicalizeTicketUrl(value);
        if (canonical) replacedUrls.add(canonical);
      }
    }
  }
  await rawStore.writeManifest(RAW_MANIFEST_PATH);
}

const previousObservationsFile = await readJson(OBSERVATIONS_PATH, { observations: [] });
function normalizeObservation(item) {
  if (!item.offer) return item;
  const urlKind = classifyTicketUrl(item.offer.url);
  return {
    ...item,
    offer: {
      ...item.offer,
      urlKind,
      ...(urlKind === "event_detail" ? {} : {
        saleStatus: "unknown",
        inventoryStatus: "unknown",
        startAt: null,
        endAt: null,
        resultAt: null,
        paymentDeadline: null,
        membershipRequirement: null,
        regionRestriction: null,
        phoneVerification: null,
        companionRestriction: null,
        ticketDistribution: null,
        ticketDisplayAt: null,
      }),
    },
  };
}
const previousObservations = (previousObservationsFile.observations ?? previousObservationsFile)
  .map(normalizeObservation)
  .filter((item) => item.offer && !["support", "refund"].includes(item.offer.urlKind))
  .filter((item) => !replacedUrls.has(canonicalizeTicketUrl(item.offer.url)));
const observationMap = new Map(previousObservations.map((item) => [`${item.eventId}|${item.offer.id}`, item]));
for (const observation of newObservations.map(normalizeObservation)) observationMap.set(`${observation.eventId}|${observation.offer.id}`, observation);
const generatedAt = new Date().toISOString();
const nextObservations = [...observationMap.values()];
const observationDataChanged = JSON.stringify(previousObservations) !== JSON.stringify(nextObservations);
if (apply) {
  await writeFile(FRONTIER_PATH, `${JSON.stringify({ schemaVersion: 1, generatedAt, jobs }, null, 2)}\n`, "utf8");
  await writeFile(OBSERVATIONS_PATH, `${JSON.stringify({ schemaVersion: 1, generatedAt, observations: nextObservations }, null, 2)}\n`, "utf8");
}

const statuses = jobs.reduce((counts, job) => ({ ...counts, [job.status]: (counts[job.status] ?? 0) + 1 }), {});
const ambiguousReasons = new Set(["day_night_ambiguity", "multiple_candidates"]);
const report = {
  schemaVersion: 1,
  runId: batchId,
  generatedAt,
  mode: dryRun ? "dry-run" : "apply",
  selection: {
    policy: selection.policy,
    selected: selectedReportItems,
    omittedByBatchLimit: selection.omittedByBatchLimit,
  },
  counts: {
    selected: selection.selected.length,
    fetchSucceeded: outcomes.filter((item) => item.fetchSucceeded).length,
    validMatches: outcomes.reduce((count, item) => count + (item.validMatchCount ?? 0), 0),
    invalid: outcomes.filter((item) => item.result === "invalid").length,
    ambiguous: outcomes.filter((item) => ambiguousReasons.has(item.unmatchedReason)).length,
    blocked: outcomes.filter((item) => item.result === "blocked").length,
    deferred: outcomes.filter((item) => item.result === "deferred").length,
    manualReview: outcomes.filter((item) => item.requiresManual).length,
  },
  outcomes,
  observationDataChanged: apply && observationDataChanged,
  formalDataChanged: false,
  publish: {
    status: "not_run",
    reason: "本脚本仅维护 frontier/观察数据；需另行运行发布命令并通过发布保护。",
  },
};
await writeFile(RUN_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(RUN_REPORT_MARKDOWN_PATH, renderRefreshMarkdown(report), "utf8");

for (const item of outcomes.filter((outcome) => outcome.result !== "matched")) {
  console.log(`FAIL URL=${item.url} | Event=${item.eventIds.join(", ") || "未关联"} | step=${item.step} | reason=${item.reason} | manual=${item.requiresManual ? "是" : "否"} | next=${item.nextCheckAt ?? item.nextAction ?? "不自动重试"}`);
}
console.log(`Link Frontier：${jobs.length} 个唯一 URL；${JSON.stringify(statuses)}；有效匹配 ${report.counts.validMatches}；观察数据变化 ${report.observationDataChanged ? "是" : "否"}；正式数据变化：否。`);
console.log(`运行报告：${RUN_REPORT_PATH}`);
