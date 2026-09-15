import assert from "node:assert/strict";
import { parseSixTonesMile } from "./parsers/sixtones-mile.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10499";
const html = `
<html><body>
  <h1>MILESixTONES（スタジアムツアー）</h1>
  <section id="schedule">
    <h3>[東京都] 味の素スタジアム</h3>
    <table><tbody>
      <tr><td>2026.09.19（土）</td><td>17:30</td></tr>
      <tr><td>2026.09.20（日）</td><td>17:30</td></tr>
    </tbody></table>
    <h3>[大阪府] ヤンマースタジアム長居</h3>
    <table><tbody>
      <tr><td>2026.11.07（土）</td><td>17:00</td></tr>
      <tr><td>2026.11.08（日）</td><td>17:00</td></tr>
    </tbody></table>
    <h3>[神奈川県] 日産スタジアム</h3>
    <table><tbody>
      <tr><td>2026.11.21（土）</td><td>16:30</td></tr>
      <tr><td>2026.11.22（日）</td><td>16:30</td></tr>
    </tbody></table>
  </section>
  <section id="ticket">
    ファミリークラブ会員チケット 10,500円（税込）
    一般チケット（プレイガイド） 11,000円（税込）
  </section>
  <section id="goods">
    [東京公演] グッズ販売時間
    <table><tbody>
      <tr><td>2026.09.19(土)</td><td>10:00-18:00</td></tr>
      <tr><td>2026.09.20(日)</td><td>10:00-18:00</td></tr>
    </tbody></table>
    各公演の開場時間は開演時間の2時間前を予定しています。
  </section>
</body></html>`;

const all = parseSixTonesMile(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 6);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-11"]);
assert.deepEqual(all.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-09-19", "味の素スタジアム", undefined, "17:30"],
  ["2026-09-20", "味の素スタジアム", undefined, "17:30"],
  ["2026-11-07", "ヤンマースタジアム長居", undefined, "17:00"],
  ["2026-11-08", "ヤンマースタジアム長居", undefined, "17:00"],
  ["2026-11-21", "日産スタジアム", undefined, "16:30"],
  ["2026-11-22", "日産スタジアム", undefined, "16:30"],
]);
assert.deepEqual(all.records[0].ticketTypes.map((item) => [item.name, item.priceJpy]), [
  ["ファミリークラブ会員チケット", 10500],
  ["一般チケット", 11000],
]);
assert.deepEqual(all.records[0].pricesJpy, [10500, 11000]);
assert.equal(all.records.some((item) => item.startTime === "10:00"), false);
assert.equal(all.records.some((item) => item.startTime === "18:00"), false);

const november = parseSixTonesMile(html, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(november.records.length, 4);
assert.deepEqual([...new Set(november.records.map((item) => item.venueName))], [
  "ヤンマースタジアム長居",
  "日産スタジアム",
]);

const outside = parseSixTonesMile(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-11"]);

const malformed = parseSixTonesMile(
  `<html><body><h1>SixTONES MILE</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("SixTONES MILE stadium source smoke: ok");
