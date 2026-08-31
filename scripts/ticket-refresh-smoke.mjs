import assert from "node:assert/strict";
import { deriveEventDisplayStatus, neutralizeStaleTicketOffer, ticketFreshness } from "../src/lib/ticket-trust-core.mjs";
import { buildPublishDiff } from "./ticket-publish-guard.mjs";
import { selectFrontierJobs } from "./ticket-refresh-core.mjs";

const now = Date.parse("2026-08-30T00:00:00.000Z");
const jobs = [
  { url: "https://eplus.jp/sf/detail/due", role: "ticket_detail", status: "deferred", nextCheckAt: "2026-08-29T00:00:00.000Z", hintedEventIds: ["evt-due"] },
  { url: "https://eplus.jp/sf/detail/future", role: "ticket_detail", status: "deferred", nextCheckAt: "2026-09-01T00:00:00.000Z", hintedEventIds: ["evt-future"] },
  { url: "https://eplus.jp/sf/detail/pending-1", role: "ticket_detail", status: "pending", nextCheckAt: null, hintedEventIds: ["evt-pending"] },
  { url: "https://eplus.jp/artist/generic", role: "artist_schedule", status: "pending", nextCheckAt: null, hintedEventIds: ["evt-pending"] },
];

const defaultSelection = selectFrontierJobs({ jobs, nowMs: now });
assert.deepEqual(defaultSelection.selected.map(({ job }) => job.url), ["https://eplus.jp/sf/detail/due"]);
assert.equal(defaultSelection.policy.pendingSelection, "未选择 pending");

const explicitUrl = selectFrontierJobs({ jobs, nowMs: now, explicitUrls: [jobs[2].url] });
assert.equal(explicitUrl.selected.some(({ job }) => job.status === "pending"), true);
assert.equal(explicitUrl.selected.find(({ job }) => job.url === jobs[2].url)?.reasons.includes("显式 URL"), true);

const explicitEvent = selectFrontierJobs({ jobs, nowMs: now, explicitEventIds: ["evt-future"] });
assert.equal(explicitEvent.selected.some(({ job }) => job.url === jobs[1].url), true);

const strictEvent = selectFrontierJobs({ jobs, nowMs: now, explicitEventIds: ["evt-future"], strictExplicitEvents: true });
assert.deepEqual(strictEvent.selected.map(({ job }) => job.url), [jobs[1].url], "计划内核验不得夹带其他到期 Event");
const checkedJob = { url: "https://eplus.jp/sf/detail/checked", role: "ticket_detail", status: "done", hintedEventIds: ["evt-checked"] };
const includeChecked = selectFrontierJobs({ jobs: [...jobs, checkedJob], nowMs: now, explicitEventIds: ["evt-checked"], strictExplicitEvents: true, includeCheckedExplicit: true });
assert.deepEqual(includeChecked.selected.map(({ job }) => job.url), [checkedJob.url], "显式深查应允许重新核验已检查页面");

const pendingBatch = selectFrontierJobs({ jobs, nowMs: now, pendingLimit: 1 });
assert.equal(pendingBatch.selected.filter(({ job }) => job.status === "pending").length, 1);
assert.throws(() => selectFrontierJobs({ jobs, pendingLimit: 11 }), /0-10/);

const freshOffer = {
  id: "offer-1",
  eventId: "evt-1",
  provider: "eplus",
  providerLabel: "e+",
  providerEventId: "1",
  url: "https://eplus.jp/sf/detail/1",
  urlKind: "event_detail",
  saleType: "general_sale",
  saleStatus: "open",
  inventoryStatus: "unknown",
  startAt: null,
  endAt: null,
  resultAt: null,
  paymentDeadline: null,
  eligibility: [],
  requiresJapanesePhone: null,
  identityCheck: null,
  ticketApp: null,
  sourceUrl: "https://eplus.jp/sf/detail/1",
  lastVerifiedAt: "2026-08-01T00:00:00.000Z",
  matchLevel: "confirmed",
};
const baseEvent = {
  id: "evt-1",
  date: "2026-09-20",
  status: "announced",
  eventStatus: "scheduled",
  verification: { sources: [{ type: "artist_official" }] },
  ticketOffers: [freshOffer],
};

assert.equal(ticketFreshness("2026-07-31T00:00:00.000Z", new Date(now)).isStale, false, "整 30 天仍不标记过旧");
assert.equal(ticketFreshness("2026-07-30T23:59:59.000Z", new Date(now)).isStale, true);
assert.equal(ticketFreshness(null, new Date(now)).recorded, false);
assert.equal(neutralizeStaleTicketOffer({ ...freshOffer, lastVerifiedAt: "2026-07-01T00:00:00.000Z" }, new Date(now)).saleStatus, "unknown");
assert.equal(deriveEventDisplayStatus(baseEvent, [{ ...freshOffer, inventoryStatus: "sold_out" }], "2026-08-30", new Date(now)), "on_sale", "单一 Offer sold_out 不得提升 Event 售罄");

assert.equal(buildPublishDiff([baseEvent], [structuredClone(baseEvent)]).safe, true);
assert.equal(buildPublishDiff([baseEvent], []).blockers.some((item) => item.code === "event_ids_changed"), true);

const noOfferEvent = { ...baseEvent, ticketOffers: [] };
const removal = buildPublishDiff([baseEvent], [noOfferEvent]);
assert.equal(removal.blockers.some((item) => item.code === "valid_offer_removed_without_evidence"), true);
const evidencedRemoval = buildPublishDiff([baseEvent], [noOfferEvent], [{
  url: freshOffer.url,
  status: "invalid",
  lastCheckedAt: "2026-08-20T00:00:00.000Z",
  lastError: "HTTP 410",
}]);
assert.equal(evidencedRemoval.blockers.some((item) => item.code === "valid_offer_removed_without_evidence"), false);

const genericOffer = { ...freshOffer, id: "generic", url: "https://eplus.jp/artist/test", sourceUrl: "https://eplus.jp/artist/test", urlKind: "generic_provider" };
const downgrade = buildPublishDiff([baseEvent], [{ ...baseEvent, ticketOffers: [genericOffer] }]);
assert.equal(downgrade.blockers.some((item) => item.code === "detail_url_downgraded"), true);

const soldOutEvent = { ...baseEvent, status: "sold_out", ticketOffers: [{ ...freshOffer, inventoryStatus: "sold_out" }] };
assert.equal(buildPublishDiff([baseEvent], [soldOutEvent]).blockers.some((item) => item.code === "single_offer_promoted_to_event_sold_out"), true);

const unknownOffer = { ...freshOffer, lastVerifiedAt: "", matchLevel: "probable", inventoryStatus: "unknown" };
const filledOffer = { ...unknownOffer, inventoryStatus: "available" };
const unverified = buildPublishDiff([{ ...baseEvent, ticketOffers: [unknownOffer] }], [{ ...baseEvent, ticketOffers: [filledOffer] }]);
assert.equal(unverified.blockers.some((item) => item.code === "unverified_fields_became_known"), true);

console.log("Ticket refresh 测试通过：小批量选择、发布阻断、新鲜度降级与 Event 售罄边界正常。");
