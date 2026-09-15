import assert from "node:assert/strict";
import { parseVaundyHoro } from "./parsers/vaundy-horo.mjs";

const sourceUrl = "https://member.vaundy.jp/feature/ASIAARENATOUR_2026";
const html = `
<html><body>
  <h1>Vaundy ASIA ARENA TOUR 2026 “HORO”</h1>
  <table id="tokyo"><tbody>
    <tr><th>DATE</th><th>OPEN / START</th><th>VENUE</th></tr>
    <tr class="day-one">
      <td class="date"><span class="year">2026</span>09.05<span class="week">sat</span></td>
      <td class="time">16:30 / 18:00<br><span>※現地時間</span></td>
      <td class="venue" rowspan="2"><p class="venue_place">幕張メッセ 9・11ホール</p></td>
    </tr>
    <tr class="day-two">
      <td class="date"><span class="year">2026</span>09.06<span class="week">sun</span></td>
      <td class="time">14:30 / 16:00<br><span>※現地時間</span></td>
    </tr>
  </tbody></table>
  <table id="seoul"><tbody>
    <tr class="day-one">
      <td class="date"><span class="year">2026</span>09.19<span class="week">sat</span></td>
      <td class="time">15:00 / 17:00</td>
      <td class="venue"><p class="venue_place">INSPIRE ARENA</p></td>
    </tr>
  </tbody></table>
  <table id="fukuoka"><tbody>
    <tr class="day-one">
      <td class="date"><span class="year">2026</span>10.24<span class="week">sat</span></td>
      <td class="time">16:30 / 18:00</td>
      <td class="venue" rowspan="2"><p class="venue_place">北九州メッセ</p></td>
    </tr>
    <tr class="day-two">
      <td class="date"><span class="year">2026</span>10.25<span class="week">sun</span></td>
      <td class="time">14:30 / 16:00</td>
      <td class="venue sp"><p class="venue_place">北九州メッセ</p></td>
    </tr>
  </tbody></table>
  <table id="shanghai"><tbody>
    <tr class="day-one">
      <td class="date"><span class="year">2026</span>11.14<span class="week">sat</span></td>
      <td class="time">18:00 / 20:00</td>
      <td class="venue"><p class="venue_place">- CANCELLED -</p></td>
    </tr>
  </tbody></table>
  <table id="trade-duplicate"><tbody>
    <tr class="day-one">
      <td class="date"><span class="year">2026</span>09.05<span class="week">sat</span></td>
      <td class="time">16:30 / 18:00</td>
      <td class="venue"><p class="venue_place">Makuhari Messe Halls 9 &amp; 11</p></td>
    </tr>
  </tbody></table>
  <section id="ticket">東京・福岡公演 スタンディング 9,900円(税込)</section>
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
