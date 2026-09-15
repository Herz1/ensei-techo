import assert from "node:assert/strict";
import { parseAbczLove } from "./parsers/abcz-love.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10565";
const html = `
<html><body>
  <h1>A.B.C-Z Concert Tour 2026 The Way of L.O.V-E</h1>
  <section id="schedule">
    <h2>SCHEDULE</h2>
    <h3>[大阪府] オリックス劇場</h3>
    <div>2026.10.14（水） 18:00</div>
    <div>2026.10.15（木） 13:00 18:00</div>

    <h3>[愛知県] 刈谷市総合文化センター 大ホール</h3>
    <div>2026.10.19（月） 18:00</div>
    <div>2026.10.20（火） 13:00 18:00</div>

    <h3>[東京都] 東京ガーデンシアター</h3>
    <div>2026.10.31（土） 18:00</div>
    <div>2026.11.01（日） 17:00</div>

    <h3>[福岡県] 福岡サンパレス</h3>
    <div>2026.11.24（火） 18:00</div>
  </section>
  <section id="ticket">
    <h2>TICKET</h2>
    ファミリークラブ会員チケット 9,800円（税込）
  </section>
  <section id="goods">
    オンラインストア販売スケジュール
    9/14(月)12:00～9/20(日)23:00
    11/24(火)19:00～11/30(月)23:00
  </section>
</body></html>`;

const all = parseAbczLove(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 9);
assert.deepEqual(all.tourMonths, ["2026-10", "2026-11"]);
assert.equal(all.records.length, 9);
assert.deepEqual(all.records.slice(0, 3).map((item) => [
  item.date,
  item.venueName,
  item.startTime,
]), [
  ["2026-10-14", "オリックス劇場", "18:00"],
  ["2026-10-15", "オリックス劇場", "13:00"],
  ["2026-10-15", "オリックス劇場", "18:00"],
]);
assert.deepEqual(all.records.slice(3, 6).map((item) => [
  item.date,
  item.venueName,
  item.startTime,
]), [
  ["2026-10-19", "刈谷市総合文化センター 大ホール", "18:00"],
  ["2026-10-20", "刈谷市総合文化センター 大ホール", "13:00"],
  ["2026-10-20", "刈谷市総合文化センター 大ホール", "18:00"],
]);
assert.equal(all.records.every((item) => item.openTime === undefined), true);
assert.deepEqual(all.records[0].ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 9800, taxIncluded: true, notes: [] },
]);
assert.deepEqual(all.records[0].pricesJpy, [9800]);
assert.equal(all.records.some((item) => item.date === "2026-09-14"), false);
assert.equal(all.records.some((item) => item.date === "2026-11-30"), false);

const november = parseAbczLove(html, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.deepEqual(november.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-11-01", "東京ガーデンシアター", "17:00"],
  ["2026-11-24", "福岡サンパレス", "18:00"],
]);

const outside = parseAbczLove(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 9);

const malformed = parseAbczLove(
  `<html><body><h1>A.B.C-Z Concert Tour 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("A.B.C-Z The Way of L.O.V-E source smoke: ok");
