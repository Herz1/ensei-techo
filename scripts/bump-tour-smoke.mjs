import assert from "node:assert/strict";
import { parseBumpTour } from "./parsers/bump-tour.mjs";

const sourceUrl = "https://www.bumpofchicken.com/live_information/2799";
const html = `
<html><body>
  <h1>BUMP OF CHICKEN TOUR 2026-2027 Ratio Clavis</h1>
  <h2>TICKET</h2>
  <div>
    アリーナS指定：16,500円（税込）
    スタンドA指定：13,200円（税込）
    スタンドA着席指定：13,200円（税込）
    スタンドA車椅子指定：13,200円（税込）
    スタンドBステージサイド指定：8,800円（税込）
  </div>
  <h2>SCHEDULE</h2>
  <div>2026/10/3(土) 宮城公演 ゼビオアリーナ仙台 OPEN 17:00 / START 18:00 ジー・アイ・ピー</div>
  <div>2026/10/4(日) 宮城公演 ゼビオアリーナ仙台 OPEN 17:00 / START 18:00 ジー・アイ・ピー</div>
  <div>2026/10/17(土) 北海道公演 北海道立総合体育センター 北海きたえーる OPEN 17:00 / START 18:00 マウントアライブ</div>
  <div>2026/10/18(日) 北海道公演 北海道立総合体育センター 北海きたえーる OPEN 17:00 / START 18:00 マウントアライブ</div>
  <div>2026/10/27(火) 東京公演 有明アリーナ OPEN 17:30 / START 18:30 ライブマスターズ</div>
  <div>2026/10/28(水) 東京公演 有明アリーナ OPEN 17:30 / START 18:30 ライブマスターズ</div>
  <div>2026/11/7(土) 兵庫公演 GLION ARENA KOBE OPEN 17:00 / START 18:00 グリーンズ</div>
  <div>2026/11/8(日) 兵庫公演 GLION ARENA KOBE OPEN 17:00 / START 18:00 グリーンズ</div>
  <div>2026/11/21(土) 香川公演 あなぶきアリーナ香川 OPEN 17:00 / START 18:00 夢番地岡山</div>
  <div>2026/11/22(日) 香川公演 あなぶきアリーナ香川 OPEN 17:00 / START 18:00 夢番地岡山</div>
  <div>2026/11/28(土) 広島公演 グリーンアリーナ OPEN 17:00 / START 18:00 夢番地広島</div>
  <div>2026/11/29(日) 広島公演 グリーンアリーナ OPEN 17:00 / START 18:00 夢番地広島</div>
  <div>2026/12/12(土) 福岡公演 マリンメッセ福岡A館 OPEN 17:00 / START 18:00 キョードー西日本</div>
  <div>2026/12/13(日) 福岡公演 マリンメッセ福岡A館 OPEN 17:00 / START 18:00 キョードー西日本</div>
  <div>2026/12/19(土) 愛知公演 IGアリーナ OPEN 17:00 / START 18:00 ジェイルハウス</div>
  <div>2026/12/20(日) 愛知公演 IGアリーナ OPEN 17:00 / START 18:00 ジェイルハウス</div>
  <div>2027/1/23(土) 大阪公演 京セラドーム大阪 OPEN 16:00 / START 18:00 グリーンズ</div>
  <div>2027/1/24(日) 大阪公演 京セラドーム大阪 OPEN 16:00 / START 18:00 グリーンズ</div>
  <div>2027/2/6(土) 東京公演 東京ドーム OPEN 16:00 / START 18:00 ライブマスターズ</div>
  <div>2027/2/7(日) 東京公演 東京ドーム OPEN 16:00 / START 18:00 ライブマスターズ</div>
</body></html>`;

const current = parseBumpTour(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(current.ok, true);
assert.equal(current.records.length, 16);
assert.deepEqual(current.records.slice(0, 3).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-10-03", "ゼビオアリーナ仙台", "17:00", "18:00"],
  ["2026-10-04", "ゼビオアリーナ仙台", "17:00", "18:00"],
  ["2026-10-17", "北海きたえーる", "17:00", "18:00"],
]);
assert.equal(current.records.find((item) => item.date === "2026-11-28")?.venueName, "広島グリーンアリーナ");
assert.deepEqual(current.records[0].ticketTypes.map((item) => [item.name, item.priceJpy]), [
  ["アリーナS指定", 16500],
  ["スタンドA指定", 13200],
  ["スタンドA着席指定", 13200],
  ["スタンドA車椅子指定", 13200],
  ["スタンドBステージサイド指定", 8800],
]);
assert.deepEqual(current.records[0].pricesJpy, [8800, 13200, 16500]);

const dome = parseBumpTour(html, sourceUrl, {
  months: [
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
  ],
});
assert.equal(dome.ok, true);
assert.deepEqual(dome.records.map((item) => [item.date, item.venueName, item.openTime, item.startTime]), [
  ["2027-01-23", "京セラドーム大阪", "16:00", "18:00"],
  ["2027-01-24", "京セラドーム大阪", "16:00", "18:00"],
  ["2027-02-06", "東京ドーム", "16:00", "18:00"],
  ["2027-02-07", "東京ドーム", "16:00", "18:00"],
]);

const malformed = parseBumpTour(
  `<html><body><h1>BUMP OF CHICKEN TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("BUMP OF CHICKEN Ratio Clavis source smoke: ok");
