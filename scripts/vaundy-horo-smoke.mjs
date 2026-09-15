import assert from "node:assert/strict";
import { parseVaundyHoro } from "./parsers/vaundy-horo.mjs";

const sourceUrl = "https://member.vaundy.jp/feature/ASIAARENATOUR_2026";
const html = `
<html><body>
  <h1>Vaundy ASIA ARENA TOUR 2026 “HORO”</h1>
  <table id="tokyo"><tbody>
    <tr><td>2026 09.05 sat</td><td>16:30 / 18:00</td><td>幕張メッセ 9・11ホール</td><td>SOGO TOKYO</td></tr>
    <tr><td>2026 09.06 sun</td><td>14:30 / 16:00</td><td>幕張メッセ 9・11ホール</td><td>SOGO TOKYO</td></tr>
  </tbody></table>
  <table id="seoul"><tbody>
    <tr><td>2026 09.19 sat</td><td>15:00 / 17:00</td><td>INSPIRE ARENA</td></tr>
    <tr><td>2026 09.20 sun</td><td>14:00 / 16:00</td><td>INSPIRE ARENA</td></tr>
  </tbody></table>
  <table id="hongkong"><tbody>
    <tr><td>2026 10.03 sat</td><td>18:00 / 20:00</td><td>AsiaWorld-Arena</td></tr>
  </tbody></table>
  <table id="fukuoka"><tbody>
    <tr><td>2026 10.24 sat</td><td>16:30 / 18:00</td><td>北九州メッセ</td><td>キョードー西日本</td></tr>
    <tr><td>2026 10.25 sun</td><td>14:30 / 16:00</td><td>北九州メッセ</td><td>キョードー西日本</td></tr>
  </tbody></table>
  <table id="taipei"><tbody>
    <tr><td>2026 10.31 sat</td><td>17:30 / 19:00</td><td>Taipei Arena</td></tr>
    <tr><td>2026 11.01 sun</td><td>17:30 / 19:00</td><td>Taipei Arena</td></tr>
  </tbody></table>
  <table id="shanghai"><tbody>
    <tr><td>2026 11.14 sat</td><td>-</td><td>- CANCELLED -</td></tr>
    <tr><td>2026 11.15 sun</td><td>-</td><td>- CANCELLED -</td></tr>
  </tbody></table>
  <section id="ticket">TOKYO / FUKUOKA 東京・福岡公演 スタンディング 9,900円(税込)</section>
  <table id="trade-duplicate"><tbody>
    <tr><td>2026 09.05 sat</td><td>16:30 / 18:00</td><td>Makuhari Messe Halls 9 &amp; 11</td></tr>
    <tr><td>2026 09.06 sun</td><td>14:30 / 16:00</td><td>Makuhari Messe Halls 9 &amp; 11</td></tr>
    <tr><td>2026 10.24 sat</td><td>16:30 / 18:00</td><td>Kitakyushu Messe</td></tr>
    <tr><td>2026 10.25 sun</td><td>14:30 / 16:00</td><td>Kitakyushu Messe</td></tr>
  </tbody></table>
</body></html>`;

const all = parseVaundyHoro(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 4);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-10"]);
assert.deepEqual(all.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-09-05", "幕張メッセ 国際展示場9-11ホール", "16:30", "18:00"],
  ["2026-09-06", "幕張メッセ 国際展示場9-11ホール", "14:30", "16:00"],
  ["2026-10-24", "北九州メッセ", "16:30", "18:00"],
  ["2026-10-25", "北九州メッセ", "14:30", "16:00"],
]);
assert.equal(all.records.some((item) => item.date === "2026-09-19"), false);
assert.equal(all.records.some((item) => item.date === "2026-10-03"), false);
assert.equal(all.records.some((item) => item.date === "2026-10-31"), false);
assert.equal(all.records.some((item) => item.date === "2026-11-14"), false);
assert.deepEqual(all.records[0].ticketTypes, [
  { name: "スタンディング", priceJpy: 9900, taxIncluded: true, notes: [] },
]);
assert.deepEqual(all.records[0].pricesJpy, [9900]);

const october = parseVaundyHoro(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(october.records.length, 2);
assert.equal(october.records.every((item) => item.venueName === "北九州メッセ"), true);

const outside = parseVaundyHoro(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-10"]);

const malformed = parseVaundyHoro(
  `<html><body><h1>Vaundy ASIA ARENA TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Vaundy HORO Japan source smoke: ok");
