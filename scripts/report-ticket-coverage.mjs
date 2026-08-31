import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyTicketUrl } from "./ticket-offer-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value?.events ?? value?.candidates ?? value?.items ?? [];
}

function countBy(values, keyOf) {
  return values.reduce((counts, value) => {
    const key = keyOf(value) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sourceFamily(type = "") {
  if (type.includes("artist")) return "artist";
  if (type.includes("venue")) return "venue";
  if (type.includes("promoter")) return "promoter";
  if (type.includes("ticket")) return "ticket";
  if (type.includes("api")) return "structured_api";
  return type || "unknown";
}

function uniqueDiscoveredUrls(candidates) {
  const urls = new Map();
  for (const candidate of candidates) {
    for (const entry of candidate.sourceChain ?? candidate.sources?.sourceChain ?? []) {
      if (!entry.url) continue;
      const status = entry.fetchStatus ?? entry.status ?? "unknown";
      if (status !== "not_checked") continue;
      if (!urls.has(entry.url)) {
        urls.set(entry.url, {
          url: entry.url,
          status: "pending",
          hintedEventId: candidate.id ?? candidate.eventId ?? null,
        });
      }
    }
  }
  return [...urls.values()];
}

function dateDiffDays(left, right) {
  return Math.floor((left.getTime() - right.getTime()) / 86_400_000);
}

function freshnessBucket(verifiedAt, now) {
  if (!verifiedAt) return "unknown";
  const ageMs = now.getTime() - Date.parse(verifiedAt);
  if (!Number.isFinite(ageMs) || ageMs < 86_400_000) return "<24h";
  if (ageMs < 3 * 86_400_000) return "1-3d";
  if (ageMs < 7 * 86_400_000) return "3-7d";
  return ">7d";
}

const today = process.env.TICKET_REPORT_TODAY ?? new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
}).format(new Date());
const generatedAt = new Date().toISOString();
const candidates = asArray(await readJson("src/data/ingest/candidates.json", []));
const approved = asArray(await readJson("src/data/ingest/approved.json", []));
const events = asArray(await readJson("src/data/events.json", []));
const frontierFile = await readJson("src/data/ingest/link-frontier.json", null);
const baselineReport = await readJson("src/data/ingest/ticket-coverage-baseline.json", null);
const frontier = frontierFile?.jobs ?? frontierFile ?? uniqueDiscoveredUrls(approved);
const offers = events.flatMap((event) =>
  (event.ticketOffers ?? []).map((offer) => ({ ...offer, eventId: offer.eventId ?? event.id })),
);
const futureEvents = events.filter((event) => event.date >= today);
const futureEventIds = new Set(futureEvents.map((event) => event.id));
const futureOffers = offers.filter((offer) => futureEventIds.has(offer.eventId));
const legacyUrls = events.flatMap((event) => [
  ...(event.ticketLinks ?? []).map((link) => ({ eventId: event.id, url: link.url })),
  ...(event.phases ?? []).filter((phase) => phase.url).map((phase) => ({ eventId: event.id, url: phase.url })),
]);
const uniqueLegacyUrls = [...new Map(legacyUrls.map((entry) => [entry.url, entry])).values()];
const now = new Date(generatedAt);
const freshness = countBy(offers, (offer) => {
  if (!offer.lastVerifiedAt) return "unknown";
  const age = dateDiffDays(now, new Date(offer.lastVerifiedAt));
  if (age <= 7) return "fresh_7d";
  if (age <= 30) return "aging_30d";
  return "stale_over_30d";
});
const freshnessBuckets = countBy(offers, (offer) => freshnessBucket(offer.lastVerifiedAt, now));
const duplicateOfferKeys = offers.length - new Set(offers.map((offer) => `${offer.eventId}|${offer.id}`)).size;
const duplicateFrontierUrls = frontier.length - new Set(frontier.map((job) => job.url)).size;

const report = {
  schemaVersion: 1,
  generatedAt,
  today,
  counts: {
    candidates: candidates.length,
    approvedCandidates: approved.length,
    publishedEvents: events.length,
    publishedFutureEvents: futureEvents.length,
    eventsWithOffers: new Set(offers.map((offer) => offer.eventId)).size,
    futureEventsWithOffers: new Set(futureOffers.map((offer) => offer.eventId)).size,
    offers: offers.length,
    concreteOfferUrls: offers.filter((offer) => classifyTicketUrl(offer.url) === "event_detail").length,
    eventsWithConcreteOfferUrl: new Set(offers.filter((offer) => classifyTicketUrl(offer.url) === "event_detail").map((offer) => offer.eventId)).size,
    eventsWithAtLeastTwoSourceFamilies: events.filter((event) => {
      const families = new Set((event.verification?.sources ?? []).map((source) => sourceFamily(source.type)));
      if ((event.ticketOffers ?? []).some((offer) => !offer.derivedFromLegacy)) families.add("ticket");
      return families.size >= 2;
    }).length,
    offersWithOpenStatus: offers.filter((offer) => offer.saleStatus === "open").length,
    offersWithEndAt: offers.filter((offer) => Boolean(offer.endAt)).length,
    offersWithResultAt: offers.filter((offer) => Boolean(offer.resultAt)).length,
    offersWithPaymentDeadline: offers.filter((offer) => Boolean(offer.paymentDeadline)).length,
    offersWithKnownInventory: offers.filter((offer) => offer.inventoryStatus && offer.inventoryStatus !== "unknown").length,
    eventsWithLegacyTicketReferences: new Set(legacyUrls.map((entry) => entry.eventId)).size,
    uniqueLegacyTicketUrls: uniqueLegacyUrls.length,
  },
  offerSaleStatuses: countBy(offers, (offer) => offer.saleStatus),
  offerInventoryStatuses: countBy(offers, (offer) => offer.inventoryStatus),
  offerUrlClassifications: countBy(offers, (offer) => classifyTicketUrl(offer.url)),
  legacyUrlClassifications: countBy(uniqueLegacyUrls, (entry) => classifyTicketUrl(entry.url)),
  freshness,
  freshnessBuckets,
  frontierStatuses: countBy(frontier, (job) => job.status),
  unmatchedReasons: countBy(frontier.filter((job) => job.status === "unmatched"), (job) => job.unmatchedReason),
  integrity: {
    duplicateOfferKeys,
    duplicateFrontierUrls,
  },
  anomalies: {
    blocked: frontier.filter((job) => job.status === "blocked").slice(0, 10).map((job) => ({ url: job.url, httpStatus: job.lastHttpStatus ?? null, reason: job.lastError ?? null })),
    failedOrDeferred: frontier.filter((job) => job.status === "deferred" && job.lastHttpStatus).slice(0, 10).map((job) => ({ url: job.url, httpStatus: job.lastHttpStatus, reason: job.lastError ?? null, nextCheckAt: job.nextCheckAt ?? null })),
    invalid: frontier.filter((job) => job.status === "invalid").slice(0, 10).map((job) => ({ url: job.url, httpStatus: job.lastHttpStatus ?? null, reason: job.lastError ?? null })),
    nonConcreteLegacyUrls: uniqueLegacyUrls.filter((entry) => classifyTicketUrl(entry.url) !== "event_detail").slice(0, 10).map((entry) => ({ url: entry.url, classification: classifyTicketUrl(entry.url) })),
    staleOffers: offers.filter((offer) => offer.lastVerifiedAt && dateDiffDays(now, new Date(offer.lastVerifiedAt)) > 30).slice(0, 10).map((offer) => ({ eventId: offer.eventId, url: offer.url, lastVerifiedAt: offer.lastVerifiedAt })),
  },
  eventIds: events.map((event) => event.id).sort(),
};

if (baselineReport) {
  const comparison = {};
  for (const [key, after] of Object.entries(report.counts)) {
    const before = baselineReport.counts?.[key] ?? 0;
    comparison[key] = { before, after, delta: after - before };
  }
  report.comparison = comparison;
  report.eventIdsUnchanged = JSON.stringify(report.eventIds) === JSON.stringify(baselineReport.eventIds);
}

const output = `${JSON.stringify(report, null, 2)}\n`;
const writeIndex = process.argv.indexOf("--write");
if (writeIndex >= 0) {
  const target = process.argv[writeIndex + 1];
  if (!target) throw new Error("--write 需要目标路径");
  await writeFile(resolve(ROOT, target), output, "utf8");
}
const markdownIndex = process.argv.indexOf("--markdown");
if (markdownIndex >= 0) {
  const target = process.argv[markdownIndex + 1];
  if (!target) throw new Error("--markdown 需要目标路径");
  const rows = Object.entries(report.comparison ?? {}).map(([key, value]) =>
    `| ${key} | ${value.before} | ${value.after} | ${value.delta >= 0 ? "+" : ""}${value.delta} |`,
  );
  const markdown = [
    "# TicketOffer 覆盖率报告",
    "",
    `生成时间：${generatedAt}`,
    `统计日期（JST）：${today}`,
    `Event ID 保持不变：${report.eventIdsUnchanged ? "是" : "否"}`,
    "",
    "| 指标 | 修改前 | 当前 | 变化 |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    "",
    "## URL 分类",
    "",
    `- TicketOffer：${JSON.stringify(report.offerUrlClassifications)}`,
    `- 旧购票引用：${JSON.stringify(report.legacyUrlClassifications)}`,
    "",
    "## Frontier",
    "",
    `- 状态：${JSON.stringify(report.frontierStatuses)}`,
    `- 新鲜度：${JSON.stringify(report.freshness)}`,
    "",
    "## 异常样例",
    "",
    "```json",
    JSON.stringify(report.anomalies, null, 2),
    "```",
    "",
  ].join("\n");
  await writeFile(resolve(ROOT, target), markdown, "utf8");
}
process.stdout.write(output);
