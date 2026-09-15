import assert from "node:assert/strict";
import { parseKamiyamaInputOutput } from "./parsers/kamiyama-input-output.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10551";
const html = `
<html><body>
  <h1>Tomohiro Kamiyama 1st LIVE TOUR 2026 INPUT⇄OUTPUT</h1>
  <section id="schedule">
    <h2>SCHEDULE</h2>
    <h3>[東京都] Zepp Haneda（TOKYO）</h3>
    <div>2026.09.18（金） 18:00</div>
    <div>2026.09.19（土） 13:00 18:00</div>

    <h3>[愛知県] Zepp Nagoya</h3>
    <div>2026.09.30（水） 19:00</div>
    <div>2026.10.01（木） 13:00 18:00</div>

    <h3>[大阪府] Zepp Namba（OSAKA）</h3>
    <div>2026.10.14（水） 19:00</div>
    <div>2026.10.15（木） 13:00 18:00</div>
  </section>
  <section id="ticket">
    <h2>TICKET</h2>
    ファミリークラブ会員チケット 9,200円（税込） ※別途ドリンク代600円
    一般チケット(プレイガイド) 9,700円（税込）※別途ドリンク代600円
  </section>
  <section id="goods">
    <h2>GOODS</h2>
    各公演の開場時間は開演時間の1時間前を予定しています。
    東京公演 2026.09.18(金) 14:00-18:30
    東京公演 2026.09.19(土) 10:30-18:30
    オンライン注文 10/15(木)19:00～10/21(水)23:00
  </section>
</body></html>`;

const all = parseKamiyamaInputOutput(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 9);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-10"]);
assert.deepEqual(all.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-09-18", "Zepp Haneda(TOKYO)", "18:00"],
  ["2026-09-19", "Zepp Haneda(TOKYO)", "13:00"],
  ["2026-09-19", "Zepp Haneda(TOKYO)", "18:00"],
  ["2026-09-30", "Zepp Nagoya", "19:00"],
  ["2026-10-01", "Zepp Nagoya", "13:00"],
  ["2026-10-01", "Zepp Nagoya", "18:00"],
  ["2026-10-14", "Zepp Namba(OSAKA)", "19:00"],
  ["2026-10-15", "Zepp Namba(OSAKA)", "13:00"],
  ["2026-10-15", "Zepp Namba(OSAKA)", "18:00"],
]);
assert.equal(all.records.every((item) => item.openTime === undefined), true);
assert.deepEqual(all.records[0].ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 9200, taxIncluded: true, notes: [] },
  { name: "一般チケット", priceJpy: 9700, taxIncluded: true, notes: [] },
]);
assert.deepEqual(all.records[0].pricesJpy, [9200, 9700]);
assert.deepEqual(all.records[0].additionalFees, [
  { type: "drink", label: "ドリンク代", amountJpy: 600, required: true },
]);
assert.equal(all.records.some((item) => item.date === "2026-10-21"), false);

const september = parseKamiyamaInputOutput(html, sourceUrl, {
  months: [{ year: 2026, month: 9 }],
});
assert.equal(september.records.length, 4);
assert.deepEqual(september.records.map((item) => item.venueName), [
  "Zepp Haneda(TOKYO)",
  "Zepp Haneda(TOKYO)",
  "Zepp Haneda(TOKYO)",
  "Zepp Nagoya",
]);

const october = parseKamiyamaInputOutput(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(october.records.length, 5);
assert.equal(october.records.filter((item) => item.venueName === "Zepp Nagoya").length, 2);
assert.equal(october.records.filter((item) => item.venueName === "Zepp Namba(OSAKA)").length, 3);

const outside = parseKamiyamaInputOutput(html, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 9);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-10"]);

const malformed = parseKamiyamaInputOutput(
  `<html><body><h1>Tomohiro Kamiyama 1st LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Tomohiro Kamiyama INPUT⇄OUTPUT source smoke: ok");
