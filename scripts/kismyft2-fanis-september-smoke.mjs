import assert from "node:assert/strict";
import { parseKismyft2FanisSeptember } from "./parsers/kismyft2-fanis-september.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10460";
const html = `
<html><body>
  <h1>Kis-My-Ft2 LIVE TOUR 2026 fan IS・・・・・・</h1>
  <section><h2>SCHEDULE</h2>
    <div>[静岡県] エコパアリーナ 2026.08.23（日） 14:00</div>
    <h3>[千葉県] ららアリーナ 東京ベイ</h3>
    <div>2026.09.04（金） 18:30</div>
    <div>2026.09.05（土） 13:00 18:30</div>
    <div>2026.09.06（日） 14:00</div>
    <h3>[広島県] 広島グリーンアリーナ</h3>
    <div>2026.09.12（土） 13:00 18:30</div>
    <div>2026.09.13（日） 14:00</div>
    <h3>[新潟県] 朱鷺メッセ 新潟コンベンションセンター</h3>
    <div>2026.09.19（土） 13:00 18:30</div>
    <div>2026.09.20（日） 14:00</div>
  </section>
  <section><h2>TICKET</h2>
    ファミリークラブ会員チケット 9,800円（税込）
    一般チケット(プレイガイド) 10,300円（税込）
  </section>
  <section><h2>GOODS</h2>
    2026.09.19（土） 10:00–19:00
    2026.09.20（日） 11:00–14:30
    オンライン 9/20(日)19:00～9/26(土)23:00
  </section>
</body></html>`;

const september = parseKismyft2FanisSeptember(html, sourceUrl, {
  months: [{ year: 2026, month: 9 }],
});
assert.equal(september.ok, true);
assert.equal(september.allRecordCount, 10);
assert.deepEqual(september.tourMonths, ["2026-09"]);
assert.equal(september.records.length, 10);
assert.deepEqual(september.records.slice(-3).map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-09-19", "朱鷺メッセ", "13:00"],
  ["2026-09-19", "朱鷺メッセ", "18:30"],
  ["2026-09-20", "朱鷺メッセ", "14:00"],
]);
assert.equal(september.records.filter((item) => item.venueName === "ららアリーナ 東京ベイ").length, 4);
assert.equal(september.records.filter((item) => item.venueName === "広島グリーンアリーナ").length, 3);
assert.equal(september.records.filter((item) => item.venueName === "朱鷺メッセ").length, 3);
assert.equal(september.records.every((item) => item.openTime === undefined), true);
assert.deepEqual(september.records[0].ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 9800, taxIncluded: true, notes: [] },
  { name: "一般チケット", priceJpy: 10300, taxIncluded: true, notes: [] },
]);
assert.deepEqual(september.records[0].pricesJpy, [9800, 10300]);
assert.equal(september.records.some((item) => item.date === "2026-08-23"), false);
assert.equal(september.records.some((item) => item.date === "2026-09-26"), false);

const outside = parseKismyft2FanisSeptember(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 10);
assert.deepEqual(outside.tourMonths, ["2026-09"]);

const malformed = parseKismyft2FanisSeptember(
  `<html><body><h1>Kis-My-Ft2 LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Kis-My-Ft2 fan IS September source smoke: ok");
