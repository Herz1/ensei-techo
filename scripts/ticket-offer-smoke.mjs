import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchTicketObservation } from "./event-match.mjs";
import { nextCheckAt, parseRetryAfter, retryDelayMs, shouldRetryStatus } from "./fetch-policy.mjs";
import { parseTicketPage } from "./ticket-page-parser.mjs";
import {
  buildLegacyTicketOffers,
  canonicalizeTicketUrl,
  classifyTicketUrl,
  getRefreshPriority,
  normalizeTicketOfferSaleStatus,
  recognizeTicketProvider,
} from "./ticket-offer-lib.mjs";
import { selectApplicationNextAction, selectTicketNextAction } from "../src/lib/ticket-action-core.mjs";
import { deriveEventDisplayStatus } from "../src/lib/ticket-trust-core.mjs";

assert.equal(recognizeTicketProvider("https://eplus.jp/sf/detail/123").key, "eplus");
assert.equal(recognizeTicketProvider("https://t.pia.jp/pia/event/event.do?eventCd=1").key, "pia");
assert.equal(recognizeTicketProvider("https://l-tike.com/concert/mevent/?mid=1").key, "lawson");
assert.equal(recognizeTicketProvider("https://ticketbook.jp/event/1").key, "ticketbook");
assert.equal(classifyTicketUrl("https://eplus.jp/sf/detail/123"), "event_detail");
assert.equal(classifyTicketUrl("https://eplus.jp/artist-page"), "generic_provider");
assert.equal(classifyTicketUrl("https://t.pia.jp/pia/artist/artists.do?artistsCd=1"), "generic_provider");
assert.equal(classifyTicketUrl("https://l-tike.com/concert/mevent/?mid=430471"), "event_detail");
assert.equal(classifyTicketUrl("https://l-tike.com/concert/mevent?mid=430471"), "event_detail", "规范化后的 Lawson 详情页仍应保留详情分类");
assert.equal(classifyTicketUrl("https://l-tike.com/search/?keyword=test"), "search");
assert.equal(classifyTicketUrl("https://eplus.jp/help/"), "support");
assert.equal(classifyTicketUrl("https://eplus.jp/refund/"), "refund");
assert.equal(classifyTicketUrl("https://l-tike.com/artist-page"), "generic_provider");
assert.equal(canonicalizeTicketUrl("https://eplus.jp/sf/detail/123/?utm_source=x#top"), "https://eplus.jp/sf/detail/123");

const legacyClosed = buildLegacyTicketOffers({
  eventId: "evt-legacy",
  phases: [{ name: "一般発売", kind: "general", start: "2026-08-01", end: "2026-08-10", status: "closed", url: "https://eplus.jp/sf/detail/legacy" }],
  ticketLinks: [],
  eligibility: [],
  lastVerifiedAt: "2026-08-11T00:00:00.000Z",
});
assert.equal(legacyClosed[0].saleStatus, "closed");
assert.equal(legacyClosed[0].inventoryStatus, "unknown", "受付结束不得推断售罄");
assert.equal(normalizeTicketOfferSaleStatus({ ...legacyClosed[0], saleStatus: "open" }, new Date("2026-08-11T00:00:00+09:00")).saleStatus, "closed");
assert.equal(normalizeTicketOfferSaleStatus({ ...legacyClosed[0], startAt: "2026-09-01T10:00:00+09:00", endAt: "2026-09-05T23:59:00+09:00", saleStatus: "unknown" }, new Date("2026-08-27T00:00:00+09:00")).saleStatus, "not_started");

const parsedClosed = parseTicketPage("<main><h1>公演</h1><p>受付終了</p></main>", "https://eplus.jp/sf/detail/closed", "2026-08-27T00:00:00.000Z");
assert.equal(parsedClosed.offerBase.saleStatus, "closed");
assert.equal(parsedClosed.offerBase.inventoryStatus, "unknown");

const parsedSoldOut = parseTicketPage(`
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"MusicEvent","name":"Test Live","startDate":"2026-09-20T18:00:00+09:00","location":{"name":"Test Hall"},"offers":{"@type":"Offer","url":"https://eplus.jp/sf/detail/999","availability":"https://schema.org/SoldOut","validFrom":"2026-08-20T10:00:00+09:00"}}
  </script>
`, "https://eplus.jp/sf/detail/999", "2026-08-27T00:00:00.000Z");
assert.equal(parsedSoldOut.offerBase.inventoryStatus, "sold_out");
assert.equal(parsedSoldOut.offerBase.saleStatus, "open");
assert.equal(parsedSoldOut.parserUsed, "json_ld");

const parsedDeadline = parseTicketPage(`
  <main><p>抽選受付期間 2026/09/01 10:00 ～ 2026/09/05 23:59</p>
  <p>結果発表 2026/09/08 13:00</p><p>支払期限 2026/09/10 23:00</p>
  <p>チケット表示開始 2026/09/15 12:00</p>
  <p>申込みには会員登録が必要です。日本国内在住者限定。日本国内の携帯電話番号が必要です。SMS認証。本人確認を実施。AnyPASS。</p>
  <p>同行者は事前登録が必要です。同行者へのチケット分配が必要です。</p></main>
`, "https://l-tike.com/concert/mevent/?mid=999", "2026-08-27T00:00:00.000Z");
assert.equal(parsedDeadline.offerBase.saleStatus, "not_started");
assert.equal(parsedDeadline.offerBase.inventoryStatus, "unknown");
assert.equal(parsedDeadline.offerBase.startAt, "2026-09-01T10:00+09:00");
assert.equal(parsedDeadline.offerBase.endAt, "2026-09-05T23:59+09:00");
assert.equal(parsedDeadline.offerBase.resultAt, "2026-09-08T13:00+09:00");
assert.equal(parsedDeadline.offerBase.paymentDeadline, "2026-09-10T23:00+09:00");
assert.equal(parsedDeadline.offerBase.requiresJapanesePhone, true);
assert.equal(parsedDeadline.offerBase.identityCheck, true);
assert.equal(parsedDeadline.offerBase.ticketApp, "AnyPASS");
assert.equal(parsedDeadline.offerBase.membershipRequirement, "申请需要会员账号");
assert.equal(parsedDeadline.offerBase.regionRestriction, "仅限日本国内居住者");
assert.equal(parsedDeadline.offerBase.phoneVerification, "需要 SMS 认证");
assert.equal(parsedDeadline.offerBase.companionRestriction, "同行者需要事先登记");
assert.equal(parsedDeadline.offerBase.ticketDistribution, "需要向同行者分配票券");
assert.equal(parsedDeadline.offerBase.ticketDisplayAt, "2026-09-15T12:00+09:00");

const livePocketDateOnly = parseTicketPage(`
  <main>
    <p>2026年9月4日(金)</p><p>開演時間 18:00</p><p>Zepp Shinjuku (東京都)</p>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"LivePocket event","startDate":"2026-09-04T00:00","location":{"@type":"Place","name":"Zepp Shinjuku"},"offers":{"@type":"Offer","url":"https://livepocket.jp/e/test"}}
    </script>
  </main>
`, "https://livepocket.jp/e/test", "2026-08-27T00:00:00.000Z", {
  date: "2026-09-04",
  startTime: "18:00",
  venueName: "Zepp Shinjuku(TOKYO)",
});
assert.equal(livePocketDateOnly.contextMatched, true);
assert.equal(livePocketDateOnly.metadata.startTime, "18:00", "LivePocket 的 JSON-LD 午夜占位时间应以页面可见开演时间为准");

const livePocketDomOnly = parseTicketPage(
  `<main><h1>リアフェスin全Zepp</h1><p>2026/8/30(日)</p><p>開演 14:00</p><p>Zepp Osaka Bayside</p></main>`,
  "https://t.livepocket.jp/e/test-old-site",
  "2026-08-27T00:00:00.000Z",
  { date: "2026-08-30", startTime: "14:00", venueName: "Zepp Osaka Bayside" },
);
assert.equal(livePocketDomOnly.contextMatched, true);
assert.equal(livePocketDomOnly.metadata.date, "2026-08-30");
assert.equal(livePocketDomOnly.metadata.startTime, "14:00");
assert.equal(livePocketDomOnly.metadata.venueName, "Zepp Osaka Bayside");

const scopedEvent = parseTicketPage(`
  <article class="block-ticket-article">
    <h3>2026/09/21(月・祝) 開演：18:00～ Zepp Sapporo</h3>
    <h4>先着★一般発売</h4>
    <p>受付期間:2026/07/18(土)10:00～2026/09/20(日)18:00</p><p>受付中</p>
    <h4>抽選◆オフィシャル先行</h4>
    <p>受付期間:2026/03/03(火)19:00～2026/03/15(日)23:59</p><p>受付終了</p>
  </article>
`, "https://eplus.jp/sf/detail/1743710001", "2026-08-27T00:00:00.000Z", {
  date: "2026-09-21",
  startTime: "18:00",
  venueName: "Zepp Sapporo",
});
assert.equal(scopedEvent.contextMatched, true);
assert.equal(scopedEvent.offerBase.startAt, "2026-07-18T10:00+09:00", "应使用当前场次的售票阶段");
assert.equal(scopedEvent.offerBase.endAt, "2026-09-20T18:00+09:00");
assert.equal(scopedEvent.offerBase.saleStatus, "open");
assert.equal(scopedEvent.offerBase.inventoryStatus, "unknown", "历史阶段售罄不能污染当前开放阶段");
assert.equal(scopedEvent.offerBase.saleType, "general_sale");
assert.equal(parseTicketPage(
  `<article class="block-ticket-article"><h3>2026/09/21 Zepp Sapporo</h3><p>受付中</p></article>`,
  "https://eplus.jp/sf/detail/1743710001",
  "2026-08-27T00:00:00.000Z",
  { date: "2026-09-22", startTime: "18:00", venueName: "Zepp Sapporo" },
).contextMatched, false, "未找到对应场次时不得使用来源链直连确认");

const matchEvents = [
  { id: "day", date: "2026-09-01", venueName: "横浜アリーナ", startTime: "13:00", title: "Test Live", artistNames: ["Test Artist"] },
  { id: "night", date: "2026-09-01", venueName: "横浜アリーナ", startTime: "18:00", title: "Test Live", artistNames: ["Test Artist"] },
  { id: "osaka", date: "2026-09-02", venueName: "大阪城ホール", startTime: "18:00", title: "Other", artistNames: ["Other"] },
];
assert.equal(matchTicketObservation({}, matchEvents, "night").level, "unmatched", "来源链提示不能绕过事件证据");
assert.equal(matchTicketObservation({ date: "2026-09-01", venueName: "横浜アリーナ", startTime: "18:00" }, matchEvents, "night").level, "confirmed");
assert.equal(matchTicketObservation({ date: "2026-09-01", venueName: "横浜アリーナ" }, matchEvents, "night").level, "probable", "昼夜场缺少时间时，来源链提示不能直接确认");
assert.equal(matchTicketObservation({ date: "2026-09-02", venueName: "大阪城ホール" }, matchEvents).reason, "date_venue");
assert.equal(matchTicketObservation({ date: "2026-09-01", venueName: "横浜アリーナ" }, matchEvents).level, "probable", "昼夜公演缺少时间不得自动合并");
assert.equal(matchTicketObservation({ date: "2026-09-01", startTime: "18:00", venueName: "横浜アリーナ" }, matchEvents).eventId, "night");
assert.equal(matchTicketObservation({ date: "2026-09-01", title: "Test Live", artistNames: ["Test Artist"] }, matchEvents).level, "probable");

const baseEvent = { id: "event", eventStatus: "scheduled", date: "2026-09-20", startTime: "18:00" };
const baseOffer = {
  ...parsedDeadline.offerBase,
  id: "offer",
  eventId: "event",
  urlKind: "event_detail",
  inventoryStatus: "unknown",
};
const readiness = Object.fromEntries(["eligibility", "account", "phoneDevice", "ticketApp", "identityDocument", "payment", "companion", "distribution"].map((key) => [key, "unknown"]));
const application = { id: "application-1", eventId: "event", offerId: "offer", label: "FC 先行", status: "won", readiness };
assert.equal(selectApplicationNextAction(baseEvent, application, baseOffer).label, "完成付款");
const unknownResult = selectApplicationNextAction(baseEvent, { ...application, status: "applied" }, { ...baseOffer, resultAt: null });
assert.equal(unknownResult.label, "等待结果公布");
assert.equal(unknownResult.dueAt, null, "未知结果时间不得自动生成");
const multiPlan = {
  tripStatus: "planning",
  applications: [
    { ...application, id: "lost-round", status: "lost" },
    { ...application, id: "won-round", status: "won" },
  ],
};
assert.equal(selectTicketNextAction(baseEvent, multiPlan, [baseOffer]).applicationId, "won-round", "落选轮次不能覆盖另一轮中签申请");
assert.equal(selectTicketNextAction(baseEvent, undefined, [{ ...baseOffer, saleStatus: "closed", endAt: null }]).detail, "受付结束不等于售罄");
assert.equal(selectTicketNextAction(baseEvent, undefined, [{ ...baseOffer, urlKind: "generic_provider", saleStatus: "open" }]).label, "前往官方渠道确认");
assert.equal(selectTicketNextAction(baseEvent, undefined, [{ ...baseOffer, inventoryStatus: "sold_out" }]).label, "该渠道显示已售罄");
assert.equal(
  deriveEventDisplayStatus({ ...baseEvent, status: "announced" }, [{ ...baseOffer, inventoryStatus: "sold_out" }], "2026-08-30", new Date("2026-08-30T00:00:00Z")),
  "announced",
  "单一渠道售罄不得升级为 Event 级 SOLD OUT",
);
assert.equal(
  deriveEventDisplayStatus({ ...baseEvent, status: "sold_out" }, [baseOffer], "2026-08-30", new Date("2026-08-30T00:00:00Z")),
  "sold_out",
  "Event 官方明确 sold_out 时必须保留",
);

assert.equal(parseRetryAfter("5", 0), 5_000);
assert.equal(parseRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT", 0), 10_000);
assert.equal(retryDelayMs(1, 120_000), 60_000);
assert.equal(shouldRetryStatus(429), true);
assert.equal(shouldRetryStatus(503), true);
assert.equal(shouldRetryStatus(404), false);
assert.equal(nextCheckAt(1_000, 0), "1970-01-01T00:00:01.000Z");
assert.equal(getRefreshPriority({ saleStatus: "open", startAt: null }), "high");
assert.equal(getRefreshPriority({ saleStatus: "closed", startAt: null }), "low");

const events = JSON.parse(await readFile(new URL("../src/data/events.json", import.meta.url), "utf8"));
const baseline = JSON.parse(await readFile(new URL("../src/data/ingest/ticket-coverage-baseline.json", import.meta.url), "utf8"));
assert.deepEqual(events.map((event) => event.id).sort(), baseline.eventIds, "Goal 5 不得改变既有 Event ID");

console.log("TicketOffer 测试通过：状态/库存保守解析、下一步动作、URL 分类、昼夜场 Event 匹配与 429 重试策略正常。");
