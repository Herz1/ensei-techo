import { canonicalizeTicketUrl } from "./ticket-offer-lib.mjs";

const DETAIL_DOWNGRADES = new Set(["generic_provider", "search", "support", "refund", "unknown"]);
const OFFER_FACT_FIELDS = [
  "saleStatus",
  "inventoryStatus",
  "startAt",
  "endAt",
  "resultAt",
  "paymentDeadline",
  "requiresJapanesePhone",
  "identityCheck",
  "ticketApp",
  "membershipRequirement",
  "regionRestriction",
  "phoneVerification",
  "companionRestriction",
  "ticketDistribution",
  "ticketDisplayAt",
  "providerEventId",
];

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function offerKey(eventId, offer) {
  return `${eventId}|${offer.id}`;
}

function urlKey(eventId, offer) {
  return `${eventId}|${canonicalizeTicketUrl(offer.url) ?? offer.url}`;
}

function isUnknown(value) {
  return value === null || value === undefined || value === "" || value === "unknown";
}

function isVerifiedOffer(offer) {
  return offer?.matchLevel === "confirmed"
    && Boolean(offer.lastVerifiedAt)
    && Number.isFinite(Date.parse(offer.lastVerifiedAt));
}

function isValidOffer(offer) {
  return offer?.urlKind === "event_detail" && isVerifiedOffer(offer);
}

function sourceFamily(sourceType) {
  const value = String(sourceType ?? "unknown");
  if (value.startsWith("artist")) return "artist";
  if (value.startsWith("venue")) return "venue";
  if (value.startsWith("promoter") || value.startsWith("organizer")) return "promoter";
  if (value.startsWith("ticket") || value.startsWith("playguide")) return "ticket";
  if (value.includes("api")) return "api";
  return value;
}

function eventOffers(events) {
  return events.flatMap((event) => (event.ticketOffers ?? []).map((offer) => ({ event, offer })));
}

export function snapshotTicketState(events) {
  const offers = eventOffers(events);
  const offerByKey = Object.fromEntries(offers.map(({ event, offer }) => [offerKey(event.id, offer), offer]));
  const eventById = Object.fromEntries(events.map((event) => [event.id, event]));
  const detailByUrl = Object.fromEntries(
    offers
      .filter(({ offer }) => offer.urlKind === "event_detail")
      .map(({ event, offer }) => [urlKey(event.id, offer), offer]),
  );
  const unknownCounts = Object.fromEntries(OFFER_FACT_FIELDS.map((field) => [
    field,
    offers.filter(({ offer }) => isUnknown(offer[field])).length,
  ]));
  return {
    eventIds: unique(events.map((event) => event.id)),
    offerKeys: unique(Object.keys(offerByKey)),
    detailUrlKeys: unique(Object.keys(detailByUrl)),
    sourceFamilies: unique([
      ...events.flatMap((event) => (event.verification?.sources ?? []).map((source) => sourceFamily(source.type))),
      ...offers.map(({ offer }) => `ticket:${offer.provider ?? "other"}`),
    ]),
    saleStatus: Object.fromEntries(offers.map(({ event, offer }) => [offerKey(event.id, offer), offer.saleStatus])),
    inventoryStatus: Object.fromEntries(offers.map(({ event, offer }) => [offerKey(event.id, offer), offer.inventoryStatus])),
    unknownCounts,
    offerByKey,
    detailByUrl,
    eventById,
  };
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function changedValues(before, after) {
  const changes = [];
  for (const key of unique([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) changes.push({ key, before: before[key] ?? null, after: after[key] ?? null });
  }
  return changes;
}

function retirementEvidence(offer, frontierJobs) {
  const urls = new Set([offer.url, offer.sourceUrl].map((value) => canonicalizeTicketUrl(value)).filter(Boolean));
  const verifiedAt = Number.isFinite(Date.parse(offer.lastVerifiedAt)) ? Date.parse(offer.lastVerifiedAt) : 0;
  return frontierJobs.find((job) => {
    const jobUrls = [job.url, job.finalUrl].map((value) => canonicalizeTicketUrl(value)).filter(Boolean);
    const checkedAt = Date.parse(job.lastCheckedAt ?? "");
    return job.status === "invalid"
      && jobUrls.some((value) => urls.has(value))
      && Number.isFinite(checkedAt)
      && checkedAt >= verifiedAt
      && Boolean(job.lastError);
  }) ?? null;
}

export function buildPublishDiff(beforeEvents, afterEvents, frontierJobs = []) {
  const before = snapshotTicketState(beforeEvents);
  const after = snapshotTicketState(afterEvents);
  const eventIds = {
    added: difference(after.eventIds, before.eventIds),
    removed: difference(before.eventIds, after.eventIds),
  };
  const offerKeys = {
    added: difference(after.offerKeys, before.offerKeys),
    removed: difference(before.offerKeys, after.offerKeys),
  };
  const eventDetailUrls = {
    added: difference(after.detailUrlKeys, before.detailUrlKeys),
    removed: difference(before.detailUrlKeys, after.detailUrlKeys),
  };
  const sourceFamilies = {
    added: difference(after.sourceFamilies, before.sourceFamilies),
    removed: difference(before.sourceFamilies, after.sourceFamilies),
  };
  const validRemoved = offerKeys.removed
    .map((key) => ({ key, offer: before.offerByKey[key] }))
    .filter(({ offer }) => isValidOffer(offer))
    .map((item) => ({ ...item, evidence: retirementEvidence(item.offer, frontierJobs) }));
  const blockers = [];

  if (eventIds.added.length || eventIds.removed.length) {
    blockers.push({ code: "event_ids_changed", reason: `Event ID 集合改变：新增 ${eventIds.added.length}，删除 ${eventIds.removed.length}` });
  }
  for (const item of validRemoved.filter(({ evidence }) => !evidence)) {
    blockers.push({ code: "valid_offer_removed_without_evidence", key: item.key, url: item.offer.url, reason: "有效 Offer 缺少失效证据，拒绝删除" });
  }

  for (const removedKey of eventDetailUrls.removed) {
    const eventId = removedKey.slice(0, removedKey.indexOf("|"));
    const downgrade = after.offerKeys
      .map((key) => after.offerByKey[key])
      .find((offer) => offer?.eventId === eventId && DETAIL_DOWNGRADES.has(offer.urlKind));
    if (downgrade) {
      blockers.push({
        code: "detail_url_downgraded",
        key: removedKey,
        url: downgrade.url,
        reason: `具体场次 URL 被 ${downgrade.urlKind} 链接替换`,
      });
    }
  }

  for (const eventId of before.eventIds.filter((id) => after.eventById[id])) {
    const beforeEvent = before.eventById[eventId];
    const afterEvent = after.eventById[eventId];
    if (beforeEvent.status !== "sold_out" && afterEvent.status === "sold_out") {
      const soldOutOffers = (afterEvent.ticketOffers ?? []).filter((offer) => offer.inventoryStatus === "sold_out");
      if (soldOutOffers.length <= 1) {
        blockers.push({
          code: "single_offer_promoted_to_event_sold_out",
          eventId,
          reason: "单一渠道的 sold_out 不能提升成整个 Event 已售罄",
        });
      }
    }
  }

  for (const key of after.offerKeys) {
    const next = after.offerByKey[key];
    const previous = before.offerByKey[key];
    if (!previous) continue;
    const filled = OFFER_FACT_FIELDS.filter((field) => isUnknown(previous[field]) && !isUnknown(next[field]));
    if (filled.length && !isVerifiedOffer(next)) {
      blockers.push({
        code: "unverified_fields_became_known",
        key,
        fields: filled,
        reason: `未核验字段被填成明确值：${filled.join(", ")}`,
      });
    }
  }

  return {
    before: {
      eventCount: before.eventIds.length,
      offerCount: before.offerKeys.length,
      detailUrlCount: before.detailUrlKeys.length,
      sourceFamilies: before.sourceFamilies,
      unknownCounts: before.unknownCounts,
    },
    after: {
      eventCount: after.eventIds.length,
      offerCount: after.offerKeys.length,
      detailUrlCount: after.detailUrlKeys.length,
      sourceFamilies: after.sourceFamilies,
      unknownCounts: after.unknownCounts,
    },
    eventIds,
    offerKeys,
    eventDetailUrls,
    sourceFamilies,
    saleStatusChanges: changedValues(before.saleStatus, after.saleStatus),
    inventoryStatusChanges: changedValues(before.inventoryStatus, after.inventoryStatus),
    unknownCountChanges: changedValues(before.unknownCounts, after.unknownCounts),
    validRemoved: validRemoved.map(({ key, offer, evidence }) => ({
      key,
      url: offer.url,
      evidenced: Boolean(evidence),
      evidence: evidence ? { status: evidence.status, lastCheckedAt: evidence.lastCheckedAt, reason: evidence.lastError } : null,
    })),
    blockers,
    safe: blockers.length === 0,
  };
}

export function renderPublishMarkdown(report) {
  const { diff } = report;
  const lines = [
    "# TicketOffer 发布差异报告",
    "",
    `时间：${report.generatedAt}`,
    `模式：${report.mode}`,
    `结果：${report.status}`,
    `正式数据发生变化：${report.formalDataChanged ? "是" : "否"}`,
    "",
    "## 固定比较",
    "",
    "| 项目 | 发布前 | 发布后 | 变化 |",
    "| --- | ---: | ---: | --- |",
    `| Event ID | ${diff.before.eventCount} | ${diff.after.eventCount} | +${diff.eventIds.added.length} / -${diff.eventIds.removed.length} |`,
    `| TicketOffer key | ${diff.before.offerCount} | ${diff.after.offerCount} | +${diff.offerKeys.added.length} / -${diff.offerKeys.removed.length} |`,
    `| event_detail URL | ${diff.before.detailUrlCount} | ${diff.after.detailUrlCount} | +${diff.eventDetailUrls.added.length} / -${diff.eventDetailUrls.removed.length} |`,
    `| saleStatus 变化 |  |  | ${diff.saleStatusChanges.length} |`,
    `| inventoryStatus 变化 |  |  | ${diff.inventoryStatusChanges.length} |`,
    `| 未知字段计数变化 |  |  | ${diff.unknownCountChanges.length} |`,
    `| 有效数据删除/替换 |  |  | ${diff.validRemoved.length} |`,
    "",
    `来源家族（前）：${diff.before.sourceFamilies.join("、") || "无"}`,
    `来源家族（后）：${diff.after.sourceFamilies.join("、") || "无"}`,
    "",
    "## 阻断项",
    "",
  ];
  if (diff.blockers.length === 0) lines.push("- 无。", "");
  else for (const blocker of diff.blockers) lines.push(`- ${blocker.code}：${blocker.reason}${blocker.url ? `（${blocker.url}）` : ""}`);
  return `${lines.join("\n")}\n`;
}
