import assert from "node:assert/strict";
import {
  PLANNED_VERIFICATION_FIELDS,
  annotateObservationConflicts,
  auditSelectedPublishScope,
  buildEventVerificationMatrix,
  selectPlannedEventIds,
} from "./planned-verification-core.mjs";

const offer = {
  id: "offer-1",
  eventId: "event-1",
  provider: "eplus",
  providerLabel: "e+",
  url: "https://eplus.jp/sf/detail/1",
  sourceUrl: "https://eplus.jp/sf/detail/1",
  urlKind: "event_detail",
  matchLevel: "confirmed",
  saleStatus: "open",
  startAt: "2026-09-01T10:00+09:00",
  endAt: "2026-09-05T23:59+09:00",
  resultAt: null,
  paymentDeadline: null,
  eligibility: [],
  requiresJapanesePhone: null,
  identityCheck: null,
  ticketApp: null,
  lastVerifiedAt: "2026-08-31T00:00:00.000Z",
};
const event = {
  id: "event-1",
  titleJa: "Fixture Live",
  verification: { checkedAt: "2026-08-30T00:00:00.000Z", sources: [{ url: "https://artist.example/live/1" }] },
  ticketOffers: [offer],
};
const other = { ...event, id: "event-2", titleJa: "Other", ticketOffers: [] };

assert.deepEqual(selectPlannedEventIds({ explicitEventIds: ["event-1"], limit: 10, knownEventIds: ["event-1"] }), ["event-1"]);
assert.deepEqual(selectPlannedEventIds({ input: { events: [{ eventId: "event-1" }] }, limit: 10, knownEventIds: ["event-1"] }), ["event-1"]);
assert.throws(() => selectPlannedEventIds({ explicitEventIds: [], knownEventIds: ["event-1"] }), /显式提供/u);
assert.throws(() => selectPlannedEventIds({ explicitEventIds: ["missing"], knownEventIds: ["event-1"] }), /不存在/u);
assert.throws(() => selectPlannedEventIds({ explicitEventIds: Array.from({ length: 11 }, (_, index) => `event-${index}`), knownEventIds: Array.from({ length: 11 }, (_, index) => `event-${index}`) }), /超过/u);

const matrix = buildEventVerificationMatrix(event);
assert.equal(matrix.length, PLANNED_VERIFICATION_FIELDS.length);
assert.equal(matrix.length, 14);
assert.equal(matrix.find((row) => row.field === "officialTicketPage")?.currentValue, offer.url);
assert.equal(matrix.find((row) => row.field === "paymentDeadline")?.unknownReason, "官方来源尚未披露");

const conflictingObservation = {
  eventId: "event-1",
  matchLevel: "confirmed",
  offer: {
    ...offer,
    sourceUrl: "https://promoter.example/ticket/1",
    endAt: "2026-09-06T23:59+09:00",
    lastVerifiedAt: "2026-08-31T01:00:00.000Z",
  },
};
const annotated = annotateObservationConflicts([conflictingObservation], [event]);
assert.equal(annotated.conflicts.length, 1);
assert.equal(annotated.conflicts[0].field, "endAt");
assert.equal(annotated.observations[0].manualReviewRequired, true);

assert.equal(auditSelectedPublishScope([event, other], [{ ...event, titleJa: "Changed" }, other], ["event-1"]).safe, true);
assert.equal(auditSelectedPublishScope([event, other], [event, { ...other, titleJa: "Changed" }], ["event-1"]).safe, false);
assert.equal(auditSelectedPublishScope([event, other], [{ ...event, ticketOffers: [] }, other], ["event-1"]).safe, false);

console.log("计划内深度核验测试通过：显式选择、10 条上限、14 字段矩阵、冲突阻断、未选中 Event 稳定与有效 Offer 保护正常。");
