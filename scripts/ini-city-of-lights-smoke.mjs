import assert from "node:assert/strict";
import { parseIniCityOfLights } from "./parsers/ini-city-of-lights.mjs";

const sourceUrl = "https://ini-official.com/news/detail/4200";
const html = `
<html><body>
  <h1>2026 INI 5TH ANNIVERSARY DOME TOUR [CITY OF LIGHTS]</h1>
  <section id="advance">
    ローソンチケット先行
    2026/06/15（月）12:00 ～ 2026/06/23（火）23:59
    ■注釈付指定席 14,300円（税込）
  </section>
  <section id="ticket">
    〈チケット料金〉 ■指定席 14,300円（税込）
  </section>
  <section id="schedule">
    [東京・東京ドーム]
    2026/09/16（水） 開場16:30 / 開演18:30
    2026/09/17（木） 開場12:30 / 開演14:30
    [大阪・京セラドーム大阪]
    2026/11/14（土） 開場16:30 / 開演18:30
    2026/11/15（日） 開場12:30 / 開演14:30
  </section>
</body></html>`;

const all = parseIniCityOfLights(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 4);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-11"]);
assert.deepEqual(all.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-09-16", "東京ドーム", "16:30", "18:30"],
  ["2026-09-17", "東京ドーム", "12:30", "14:30"],
  ["2026-11-14", "京セラドーム大阪", "16:30", "18:30"],
  ["2026-11-15", "京セラドーム大阪", "12:30", "14:30"],
]);
assert.deepEqual(all.records[0].ticketTypes, [
  { name: "指定席", priceJpy: 14300, taxIncluded: true, notes: [] },
]);
assert.deepEqual(all.records[0].pricesJpy, [14300]);
assert.equal(all.records.some((item) => item.date === "2026-06-15"), false);
assert.equal(all.records.some((item) => item.date === "2026-06-23"), false);

const september = parseIniCityOfLights(html, sourceUrl, {
  months: [{ year: 2026, month: 9 }],
});
assert.equal(september.records.length, 2);
assert.equal(september.records.every((item) => item.venueName === "東京ドーム"), true);

const english = parseIniCityOfLights(`
<html><body>
  <h1>2026 INI 5TH ANNIVERSARY DOME TOUR [CITY OF LIGHTS]</h1>
  [Tokyo Dome, Tokyo]
  2026/09/16 (Wed) Doors open 16:30 / Show starts 18:30
  2026/09/17 (Thu) Doors open 12:30 / Show starts 14:30
  [Osaka - Kyocera Dome Osaka]
  2026/11/14 (Sat) Doors open 16:30 / Start 18:30
  2026/11/15 (Sun) Doors open 12:30 / Show starts 14:30
</body></html>`, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(english.ok, true);
assert.equal(english.allRecordCount, 4);
assert.equal(english.records.length, 2);
assert.equal(english.records[0].venueName, "京セラドーム大阪");

const outside = parseIniCityOfLights(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-11"]);

const malformed = parseIniCityOfLights(
  `<html><body><h1>2026 INI 5TH ANNIVERSARY DOME TOUR</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("INI CITY OF LIGHTS source smoke: ok");
