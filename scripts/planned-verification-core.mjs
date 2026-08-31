import { canonicalizeTicketUrl } from "./ticket-offer-lib.mjs";

export const MAX_PLANNED_EVENTS = 10;

export const PLANNED_VERIFICATION_FIELDS = [
  { id: "officialEventDetail", label: "官方演出详情" },
  { id: "officialTicketPage", label: "官方票务具体场次页" },
  { id: "visibleSalePhase", label: "当前可见申请阶段" },
  { id: "eligibility", label: "资格条件" },
  { id: "membershipRequirement", label: "会员／账号要求" },
  { id: "phoneRegion", label: "手机号／地区限制" },
  { id: "ticketApp", label: "电子票 App" },
  { id: "identityCheck", label: "本人确认" },
  { id: "companionDistribution", label: "同行者／票券分配" },
  { id: "applicationWindow", label: "申请开始／截止" },
  { id: "resultAt", label: "结果公布时间" },
  { id: "paymentDeadline", label: "付款期限" },
  { id: "ticketDisplayAt", label: "票券显示／下载时间" },
  { id: "lastVerifiedAt", label: "最近核验时间" },
];

export const CONFLICT_FACT_FIELDS = [
  "startAt",
  "endAt",
  "resultAt",
  "paymentDeadline",
  "eligibility",
  "requiresJapanesePhone",
  "identityCheck",
  "ticketApp",
  "membershipRequirement",
  "regionRestriction",
  "phoneVerification",
  "companionRestriction",
  "ticketDistribution",
  "ticketDisplayAt",
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isUnknown(value) {
  return value === null
    || value === undefined
    || value === ""
    || value === "unknown"
    || (Array.isArray(value) && value.length === 0);
}

function comparable(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

function inputEventIds(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" ? [item] : item?.eventId ? [item.eventId] : []);
  }
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.eventIds)) return value.eventIds;
  if (Array.isArray(value.events)) return value.events.flatMap((item) => typeof item === "string" ? [item] : item?.eventId ? [item.eventId] : []);
  return [];
}

export function selectPlannedEventIds({ explicitEventIds = [], input = null, limit = MAX_PLANNED_EVENTS, knownEventIds = [] }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLANNED_EVENTS) {
    throw new Error(`--limit 必须是 1-${MAX_PLANNED_EVENTS} 的整数`);
  }
  const eventIds = unique([...explicitEventIds, ...inputEventIds(input)].map((value) => String(value ?? "").trim()));
  if (eventIds.length === 0) throw new Error("必须通过 --event-id 或 --input 显式提供 Event ID");
  if (eventIds.length > limit) throw new Error(`本次选择 ${eventIds.length} 个 Event，超过 --limit ${limit}`);
  const known = new Set(knownEventIds);
  const unknown = eventIds.filter((eventId) => !known.has(eventId));
  if (unknown.length) throw new Error(`Event ID 不存在：${unknown.join(", ")}`);
  return eventIds;
}

function knownOffers(event) {
  return (event?.ticketOffers ?? []).filter((offer) => !["support", "refund"].includes(offer.urlKind));
}

function offerSources(offers) {
  return unique(offers.flatMap((offer) => [offer.sourceUrl, offer.url]));
}

function latestVerified(offers, fallback = null) {
  const values = offers
    .map((offer) => offer.lastVerifiedAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();
  return values.at(-1) ?? fallback;
}

function joined(values) {
  const known = unique(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => !isUnknown(value)).map(String));
  return known.length ? known.join("；") : null;
}

function booleanLabel(value, positive, negative) {
  return value === true ? positive : value === false ? negative : null;
}

function fieldSnapshot(event, fieldId) {
  const offers = knownOffers(event);
  const explicitOffers = offers.filter((offer) => offer.urlKind === "event_detail");
  const eventSources = event?.verification?.sources ?? [];
  let value = null;
  let sources = [];
  let verifiedAt = null;
  let unknownReason = "官方来源尚未披露";

  if (fieldId === "officialEventDetail") {
    sources = unique(eventSources.map((source) => source.url));
    value = sources.length ? sources.join("；") : null;
    verifiedAt = event?.verification?.checkedAt ?? null;
    unknownReason = "正式 Event 尚无可追溯官方详情来源";
  } else if (fieldId === "officialTicketPage") {
    sources = offerSources(explicitOffers);
    value = sources.length ? sources.join("；") : null;
    verifiedAt = latestVerified(explicitOffers);
    unknownReason = "尚无已确认的具体场次票务页";
  } else if (fieldId === "visibleSalePhase") {
    const relevant = offers.filter((offer) => !isUnknown(offer.saleStatus));
    value = joined(relevant.map((offer) => `${offer.providerLabel}：${offer.saleStatus}`));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "eligibility") {
    const relevant = offers.filter((offer) => offer.eligibility?.length);
    value = joined(relevant.flatMap((offer) => offer.eligibility));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "membershipRequirement") {
    const relevant = offers.filter((offer) => !isUnknown(offer.membershipRequirement));
    value = joined(relevant.map((offer) => offer.membershipRequirement));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "phoneRegion") {
    const relevant = offers.filter((offer) => typeof offer.requiresJapanesePhone === "boolean" || !isUnknown(offer.regionRestriction) || !isUnknown(offer.phoneVerification));
    value = joined(relevant.flatMap((offer) => [
      booleanLabel(offer.requiresJapanesePhone, "需要日本手机号", "官方说明不需要日本手机号"),
      offer.regionRestriction,
      offer.phoneVerification,
    ]));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "ticketApp") {
    const relevant = offers.filter((offer) => !isUnknown(offer.ticketApp));
    value = joined(relevant.map((offer) => offer.ticketApp));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "identityCheck") {
    const relevant = offers.filter((offer) => typeof offer.identityCheck === "boolean");
    value = joined(relevant.map((offer) => booleanLabel(offer.identityCheck, "官方说明需要本人确认", "官方说明不需要本人确认")));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "companionDistribution") {
    const relevant = offers.filter((offer) => !isUnknown(offer.companionRestriction) || !isUnknown(offer.ticketDistribution));
    value = joined(relevant.flatMap((offer) => [offer.companionRestriction, offer.ticketDistribution]));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "applicationWindow") {
    const relevant = offers.filter((offer) => offer.startAt || offer.endAt);
    value = joined(relevant.map((offer) => `${offer.providerLabel}：${offer.startAt ?? "开始未说明"} → ${offer.endAt ?? "截止未说明"}`));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (["resultAt", "paymentDeadline", "ticketDisplayAt"].includes(fieldId)) {
    const relevant = offers.filter((offer) => !isUnknown(offer[fieldId]));
    value = joined(relevant.map((offer) => `${offer.providerLabel}：${offer[fieldId]}`));
    sources = offerSources(relevant);
    verifiedAt = latestVerified(relevant);
  } else if (fieldId === "lastVerifiedAt") {
    value = latestVerified(offers, event?.verification?.checkedAt ?? null);
    sources = offerSources(offers).length ? offerSources(offers) : unique(eventSources.map((source) => source.url));
    verifiedAt = value;
    unknownReason = "尚无核验时间记录";
  }

  return { value, sources, verifiedAt, unknownReason: value ? null : unknownReason };
}

function conflictMatrixField(field) {
  if (["startAt", "endAt"].includes(field)) return "applicationWindow";
  if (["requiresJapanesePhone", "regionRestriction", "phoneVerification"].includes(field)) return "phoneRegion";
  if (["companionRestriction", "ticketDistribution"].includes(field)) return "companionDistribution";
  return field;
}

export function buildEventVerificationMatrix(beforeEvent, afterEvent = beforeEvent, conflicts = []) {
  return PLANNED_VERIFICATION_FIELDS.map(({ id, label }) => {
    const before = fieldSnapshot(beforeEvent, id);
    const after = fieldSnapshot(afterEvent, id);
    const relatedConflicts = conflicts.filter((conflict) => conflictMatrixField(conflict.field) === id);
    return {
      field: id,
      label,
      currentValue: after.value,
      sourceUrls: after.sources,
      lastVerifiedAt: after.verifiedAt,
      changed: comparable(before.value) !== comparable(after.value),
      unknownReason: after.unknownReason,
      requiresManual: relatedConflicts.length > 0,
      conflicts: relatedConflicts,
    };
  });
}

export function detectObservationConflicts(event, observation) {
  const incoming = observation?.offer;
  if (!event || !incoming) return [];
  const current = knownOffers(event).find((offer) => offer.id === incoming.id)
    ?? knownOffers(event).find((offer) => canonicalizeTicketUrl(offer.url) === canonicalizeTicketUrl(incoming.url));
  if (!current || current.derivedFromLegacy) return [];
  const sameSource = canonicalizeTicketUrl(current.sourceUrl) === canonicalizeTicketUrl(incoming.sourceUrl);
  const currentVerified = Date.parse(current.lastVerifiedAt ?? "");
  const incomingVerified = Date.parse(incoming.lastVerifiedAt ?? "");
  const newerSameSource = sameSource && Number.isFinite(incomingVerified) && (!Number.isFinite(currentVerified) || incomingVerified >= currentVerified);
  if (newerSameSource) return [];
  return CONFLICT_FACT_FIELDS.flatMap((field) => {
    const previous = current[field];
    const next = incoming[field];
    if (isUnknown(previous) || isUnknown(next) || comparable(previous) === comparable(next)) return [];
    return [{
      eventId: event.id,
      offerId: incoming.id,
      field,
      currentValue: previous,
      observedValue: next,
      currentSourceUrl: current.sourceUrl,
      observedSourceUrl: incoming.sourceUrl,
      reason: sameSource ? "观察时间早于现有核验，拒绝覆盖" : "不同官方来源给出冲突值，需人工确认",
    }];
  });
}

export function annotateObservationConflicts(observations, events) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const conflicts = [];
  const values = observations.map((observation) => {
    const itemConflicts = detectObservationConflicts(eventById.get(observation.eventId), observation);
    conflicts.push(...itemConflicts);
    if (itemConflicts.length) return { ...observation, manualReviewRequired: true, conflicts: itemConflicts };
    const clean = { ...observation };
    delete clean.manualReviewRequired;
    delete clean.conflicts;
    return clean;
  });
  return { observations: values, conflicts };
}

function isValidOffer(offer) {
  return offer?.urlKind === "event_detail" && offer?.matchLevel === "confirmed" && Boolean(offer?.sourceUrl) && Boolean(offer?.lastVerifiedAt);
}

export function auditSelectedPublishScope(beforeEvents, afterEvents, selectedEventIds) {
  const selected = new Set(selectedEventIds);
  const beforeById = new Map(beforeEvents.map((event) => [event.id, event]));
  const afterById = new Map(afterEvents.map((event) => [event.id, event]));
  const violations = [];
  const beforeIds = [...beforeById.keys()].sort();
  const afterIds = [...afterById.keys()].sort();
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) violations.push("Event ID 集合发生变化");
  for (const [eventId, before] of beforeById) {
    const after = afterById.get(eventId);
    if (!after) continue;
    if (!selected.has(eventId) && JSON.stringify(before) !== JSON.stringify(after)) {
      violations.push(`未选中 Event 发生变化：${eventId}`);
    }
    if (selected.has(eventId)) {
      const afterKeys = new Set((after.ticketOffers ?? []).map((offer) => offer.id));
      for (const offer of (before.ticketOffers ?? []).filter(isValidOffer)) {
        if (!afterKeys.has(offer.id)) violations.push(`有效 Offer 被删除：${eventId}|${offer.id}`);
      }
    }
  }
  return { safe: violations.length === 0, violations };
}

export function renderPlannedVerificationMarkdown(report) {
  const lines = [
    "# 计划内 Event 深度票务核验",
    "",
    `运行：${report.runId}`,
    `时间：${report.generatedAt}`,
    `模式：${report.mode}`,
    `结果：${report.status}`,
    `选中 Event：${report.eventIds.join("、")}`,
    "",
  ];
  for (const item of report.events) {
    lines.push(`## ${item.title}（${item.eventId}）`, "", "| 字段 | 当前值 | 官方来源 | 最近核验 | 变化 | 未知原因 | 人工 |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of item.matrix) {
      const clean = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
      lines.push(`| ${clean(row.label)} | ${clean(row.currentValue ?? "未说明")} | ${clean(row.sourceUrls.join("、") || "未说明")} | ${clean(row.lastVerifiedAt ?? "未记录")} | ${row.changed ? "是" : "否"} | ${clean(row.unknownReason ?? "—")} | ${row.requiresManual ? "是" : "否"} |`);
    }
    lines.push("");
  }
  if (report.conflicts.length) {
    lines.push("## 冲突与人工处理", "");
    for (const conflict of report.conflicts) lines.push(`- ${conflict.eventId} · ${conflict.field}：${conflict.reason}`);
    lines.push("");
  }
  if (report.scopeAudit?.violations?.length) {
    lines.push("## 发布阻断", "", ...report.scopeAudit.violations.map((item) => `- ${item}`), "");
  }
  lines.push("平台通用准备建议不会写入本场要求；所有未披露字段保持未说明。", "");
  return `${lines.join("\n")}\n`;
}
