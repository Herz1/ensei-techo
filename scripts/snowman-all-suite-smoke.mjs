import assert from "node:assert/strict";
import { parseSnowManAllSuite } from "./parsers/snowman-all-suite.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10578";
const html = `
<html><body>
  <h1>Snow Man DOME TOUR 2026-2027 ALL SUITE</h1>
  <section id="schedule">
    <h3>[北海道] 大和ハウス プレミストドーム （札幌ドーム）</h3>
    <div>2026.10.30（金） 17:00</div>
    <div>2026.10.31（土） 17:00</div>
    <div>2026.11.01（日） 15:00</div>

    <h3>[愛知県] バンテリンドーム ナゴヤ</h3>
    <div>2026.11.26（木） 17:00</div>
    <div>2026.11.27（金） 17:00</div>
    <div>2026.11.28（土） 17:00</div>
    <div>2026.11.29（日） 15:00</div>

    <h3>[福岡県] みずほPayPayドーム福岡</h3>
    <div>2026.12.04（金） 17:00</div>
    <div>2026.12.05（土） 17:00</div>
    <div>2026.12.06（日） 16:00</div>

    <h3>[東京都] 東京ドーム</h3>
    <div>2026.12.23（水） 17:00</div>
    <div>2026.12.24（木） 17:00</div>
    <div>2026.12.25（金） 17:00</div>
    <div>2026.12.26（土） 16:00</div>

    <h3>[大阪府] 京セラドーム大阪</h3>
    <div>2027.01.04（月） 17:00</div>
    <div>2027.01.05（火） 17:00</div>
    <div>2027.01.06（水） 17:00</div>
    <div>2027.01.07（木） 16:00</div>
  </section>
  <section id="ticket">
    ファミリークラブ会員チケット 11,000円（税込）
  </section>
  <section id="goods">
    <div>2026.12.23（水） 10:00-18:00</div>
  </section>
</body></html>`;

const currentWindow = parseSnowManAllSuite(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(currentWindow.ok, true);
assert.equal(currentWindow.allRecordCount, 18);
assert.deepEqual(currentWindow.tourMonths, [
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
]);
assert.equal(currentWindow.records.length, 14);
assert.deepEqual(currentWindow.records.slice(0, 3).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-10-30", "札幌ドーム", undefined, "17:00"],
  ["2026-10-31", "札幌ドーム", undefined, "17:00"],
  ["2026-11-01", "札幌ドーム", undefined, "15:00"],
]);
assert.equal(currentWindow.records.at(-1).date, "2026-12-26");
assert.equal(currentWindow.records.at(-1).venueName, "東京ドーム");
assert.deepEqual(currentWindow.records[0].ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 11000, taxIncluded: true, notes: [] },
]);
assert.deepEqual(currentWindow.records[0].pricesJpy, [11000]);
assert.equal(currentWindow.records.some((item) => item.startTime === "10:00"), false);

const january = parseSnowManAllSuite(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(january.records.length, 4);
assert.deepEqual(january.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2027-01-04", "京セラドーム大阪", "17:00"],
  ["2027-01-05", "京セラドーム大阪", "17:00"],
  ["2027-01-06", "京セラドーム大阪", "17:00"],
  ["2027-01-07", "京セラドーム大阪", "16:00"],
]);

const outside = parseSnowManAllSuite(html, sourceUrl, {
  months: [{ year: 2027, month: 2 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 18);

const malformed = parseSnowManAllSuite(
  `<html><body><h1>Snow Man DOME TOUR 2026-2027</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Snow Man ALL SUITE source smoke: ok");
