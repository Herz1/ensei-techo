import assert from "node:assert/strict";
import { parseTakuyaCheckpoint } from "./parsers/takuya-checkpoint.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10520";
const html = `
<html><body>
  <h1>TAKUYA KIMURA Live Tour 2026 Checkpoint</h1>
  <section id="schedule">
    <h2>SCHEDULE</h2>
    <h3>[兵庫県] GLION ARENA KOBE</h3>
    <div>2026.09.05（土） 17:00</div>
    <div>2026.09.06（日） 17:00</div>

    <h3>[ソウル] INSPIRE ARENA</h3>
    <div>2026.09.26（土） 16:00</div>

    <h3>[福岡県] マリンメッセ福岡A館</h3>
    <div>2026.10.07（水） 17:00</div>

    <h3>[台北] Taipei Music Center</h3>
    <div>2026.11.13（金） 19:00</div>
    <div>2026.11.14（土） 18:00</div>

    <h3>[千葉県] ららアリーナ 東京ベイ</h3>
    <div>2026.11.21（土） 18:00</div>
    <div>2026.11.22（日） 17:00</div>
    <div>2026.11.23（月・祝） 17:00</div>
  </section>
  <section id="ticket">
    <h2>TICKET</h2>
    ファミリークラブ会員チケット 12,000円（税込）
    ■台北公演 一般販売 11/01 12:00
    ■ソウル公演 一般チケット販売 9/10 12:00
    一般チケット(プレイガイド) 12,500円（税込）
    〖福岡公演〗
    注釈付き指定／立見指定／車イス席
  </section>
  <section id="goods">
    <h2>GOODS</h2>
    オンラインストア販売スケジュール
    11/23(月・祝)19:00～11/29(日)23:00
  </section>
</body></html>`;

const all = parseTakuyaCheckpoint(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 6);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-10", "2026-11"]);
assert.deepEqual(all.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-09-05", "GLION ARENA KOBE", "17:00"],
  ["2026-09-06", "GLION ARENA KOBE", "17:00"],
  ["2026-10-07", "マリンメッセ福岡A館", "17:00"],
  ["2026-11-21", "ららアリーナ 東京ベイ", "18:00"],
  ["2026-11-22", "ららアリーナ 東京ベイ", "17:00"],
  ["2026-11-23", "ららアリーナ 東京ベイ", "17:00"],
]);
assert.equal(all.records.some((item) => item.date === "2026-09-26"), false);
assert.equal(all.records.some((item) => item.date === "2026-11-13"), false);
assert.equal(all.records.some((item) => item.date === "2026-11-14"), false);
assert.equal(all.records.every((item) => item.openTime === undefined), true);

const fukuoka = all.records.find((item) => item.venueName === "マリンメッセ福岡A館");
assert.deepEqual(fukuoka?.ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 12000, taxIncluded: true, notes: [] },
  { name: "一般チケット", priceJpy: 12500, taxIncluded: true, notes: ["福岡公演"] },
]);
assert.deepEqual(fukuoka?.pricesJpy, [12000, 12500]);

const lala = all.records.find((item) => item.venueName === "ららアリーナ 東京ベイ");
assert.deepEqual(lala?.ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 12000, taxIncluded: true, notes: [] },
]);
assert.deepEqual(lala?.pricesJpy, [12000]);

const futureWindow = parseTakuyaCheckpoint(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(futureWindow.records.length, 4);
assert.deepEqual(futureWindow.records.map((item) => item.date), [
  "2026-10-07",
  "2026-11-21",
  "2026-11-22",
  "2026-11-23",
]);
assert.equal(futureWindow.records.some((item) => item.date === "2026-11-29"), false);

const outside = parseTakuyaCheckpoint(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 6);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-10", "2026-11"]);

const malformed = parseTakuyaCheckpoint(
  `<html><body><h1>TAKUYA KIMURA Live Tour 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("TAKUYA KIMURA Checkpoint source smoke: ok");
