import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildLegacyTicketOffers, canonicalizeTicketUrl, classifyTicketUrl, normalizeTicketOfferSaleStatus } from "./ticket-offer-lib.mjs";
import { buildPublishDiff, renderPublishMarkdown } from "./ticket-publish-guard.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVENTS_PATH = resolve(ROOT, "src/data/events.json");
const REPORT_PATH = resolve(ROOT, "src/data/ingest/ticket-publish-last.json");
const REPORT_MARKDOWN_PATH = resolve(ROOT, "src/data/ingest/ticket-publish-last.md");

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function ids(values) {
  return values.map((item) => item.id).sort();
}

const apply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
if (apply && explicitDryRun) throw new Error("--apply 与 --dry-run 不能同时使用");
const mode = apply ? "apply" : "dry-run";

const events = await readJson("src/data/events.json", []);
const approved = await readJson("src/data/ingest/approved.json", []);
const baseline = await readJson("src/data/ingest/ticket-coverage-baseline.json", null);
const observationsFile = await readJson("src/data/ingest/ticket-offer-observations.json", []);
const frontierFile = await readJson("src/data/ingest/link-frontier.json", null);
const observations = observationsFile.observations ?? observationsFile;
const frontierJobs = frontierFile?.jobs ?? frontierFile ?? [];
// blocked/deferred 不是失效证据，必须保留上一次确认过的 Offer。
const invalidFrontierUrls = new Set(
  frontierJobs
    .filter((job) => job.status === "invalid")
    .flatMap((job) => [job.url, job.finalUrl])
    .map((url) => canonicalizeTicketUrl(url))
    .filter(Boolean),
);
const approvedById = new Map(approved.map((candidate) => [candidate.id, candidate]));
const observationsByEvent = new Map();
const now = new Date();
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);

for (const observation of observations) {
  if (observation.matchLevel !== "confirmed") continue;
  if (observation.manualReviewRequired) continue;
  if (["support", "refund"].includes(observation.offer?.urlKind ?? observation.urlKind)) continue;
  const value = observation.offer ?? observation;
  if (invalidFrontierUrls.has(canonicalizeTicketUrl(value.url))) continue;
  const urlKind = classifyTicketUrl(value.url);
  const list = observationsByEvent.get(observation.eventId) ?? [];
  list.push({
    ...value,
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
  });
  observationsByEvent.set(observation.eventId, list);
}

const published = events.map((event) => {
  const candidate = approvedById.get(event.id);
  const derived = buildLegacyTicketOffers({
    eventId: event.id,
    phases: event.phases.map((phase) => ({
      ...phase,
      status: phase.end < today ? "closed" : phase.start <= today ? "open" : "upcoming",
    })),
    ticketLinks: event.ticketLinks,
    eligibility: event.eligibility,
    lastVerifiedAt: event.verification.checkedAt,
    explicitSoldOut: candidate?.statusHint === "sold_out",
  });
  const merged = new Map(
    derived
      .filter((offer) => !invalidFrontierUrls.has(canonicalizeTicketUrl(offer.url)))
      .map((offer) => [offer.id, normalizeTicketOfferSaleStatus(offer, now)]),
  );
  for (const offer of event.ticketOffers ?? []) {
    if (offer.derivedFromLegacy || invalidFrontierUrls.has(canonicalizeTicketUrl(offer.url))) continue;
    merged.set(offer.id, normalizeTicketOfferSaleStatus(offer, now));
  }
  for (const offer of observationsByEvent.get(event.id) ?? []) {
    merged.set(offer.id, normalizeTicketOfferSaleStatus(offer, now));
  }
  return {
    ...event,
    eventStatus: event.eventStatus ?? (event.date < today ? "completed" : "scheduled"),
    ticketOffers: [...merged.values()],
  };
});

const diff = buildPublishDiff(events, published, frontierJobs);
if (baseline?.eventIds && JSON.stringify(ids(events)) !== JSON.stringify(baseline.eventIds)) {
  diff.blockers.unshift({ code: "baseline_event_ids_changed", reason: "当前 Event ID 集合与 Goal 5 baseline 不一致" });
  diff.safe = false;
}
const proposedDataChanged = JSON.stringify(events) !== JSON.stringify(published);
const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  mode,
  status: diff.safe ? (apply ? (proposedDataChanged ? "published" : "no_change") : "dry_run") : "blocked",
  proposedDataChanged,
  formalDataChanged: apply && diff.safe && proposedDataChanged,
  diff,
  failures: diff.blockers.map((blocker) => ({
    url: blocker.url ?? null,
    eventIds: blocker.eventId ? [blocker.eventId] : blocker.key?.includes("|") ? [blocker.key.split("|")[0]] : [],
    step: "publish",
    reason: blocker.reason,
    requiresManual: true,
    nextCheckAt: null,
    nextAction: "人工核对证据后重新运行 dry-run",
  })),
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(REPORT_MARKDOWN_PATH, renderPublishMarkdown(report), "utf8");

console.log(`TicketOffer 发布模式：${mode}；候选变化：${proposedDataChanged ? "是" : "否"}；Event ${diff.before.eventCount}→${diff.after.eventCount}；Offer ${diff.before.offerCount}→${diff.after.offerCount}；event_detail URL ${diff.before.detailUrlCount}→${diff.after.detailUrlCount}。`);
console.log(`来源家族：${diff.before.sourceFamilies.join(", ") || "无"} → ${diff.after.sourceFamilies.join(", ") || "无"}；saleStatus 变化 ${diff.saleStatusChanges.length}；inventoryStatus 变化 ${diff.inventoryStatusChanges.length}；未知计数变化 ${diff.unknownCountChanges.length}。`);

if (!diff.safe) {
  for (const failure of report.failures) {
    console.error(`FAIL URL=${failure.url ?? "未关联"} | Event=${failure.eventIds.join(", ") || "未关联"} | step=publish | reason=${failure.reason} | manual=是 | next=${failure.nextAction}`);
  }
  console.error(`发布已阻断；报告：${REPORT_PATH}`);
  process.exitCode = 1;
} else if (apply && proposedDataChanged) {
  if (JSON.stringify(ids(published)) !== JSON.stringify(ids(events))) throw new Error("TicketOffer 发布改变了 Event ID；已中止");
  await writeFile(EVENTS_PATH, `${JSON.stringify(published, null, 2)}\n`, "utf8");
  const written = JSON.parse(await readFile(EVENTS_PATH, "utf8"));
  if (JSON.stringify(ids(written)) !== JSON.stringify(ids(events))) throw new Error("写入后 Event ID 校验失败");
  console.log(`TicketOffer 已发布：${published.reduce((sum, event) => sum + event.ticketOffers.length, 0)} 条；Event ID 保持 ${published.length} 条不变。`);
} else {
  console.log(`${mode === "dry-run" ? "dry-run 完成，未写正式数据" : "正式数据无需写入"}；报告：${REPORT_PATH}`);
}
