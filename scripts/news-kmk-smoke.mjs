import assert from "node:assert/strict";
import { parseNewsKmk } from "./parsers/news-kmk.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10507";
const html = `
<html><body>
  <h1>NEWS LIVE TOUR 2026 /// KMK</h1>
  <section id="schedule">
    <h3>[北海道] 北海道立総合体育センター（北海きたえーる）</h3>
    <div>2026.08.01（土） 17:00</div>
    <div>2026.08.02（日） 16:00</div>

    <h3>[福岡県] マリンメッセ福岡A館</h3>
    <div>2026.08.11（火・祝） 17:00</div>
    <div>2026.08.12（水） 17:00</div>

    <h3>[静岡県] エコパアリーナ</h3>
    <div>2026.08.28（金） 18:00</div>
    <div>2026.08.29（土） 17:00</div>
    <div>2026.08.30（日） 17:00</div>

    <h3>[宮城県] セキスイハイムスーパーアリーナ</h3>
    <div>2026.09.05（土） 17:00</div>
    <div>2026.09.06（日） 16:00</div>

    <h3>[東京都] 有明アリーナ</h3>
    <div>2026.09.11（金） 18:00</div>
    <div>2026.09.12（土） 17:00</div>
    <div>2026.09.13（日） 17:00</div>

    <h3>[神奈川県] 横浜アリーナ</h3>
    <div>2026.10.06（火） 18:00</div>
    <div>2026.10.07（水） 18:00</div>
    <div>2026.10.08（木） 18:00</div>

    <h3>[広島県] 広島グリーンアリーナ</h3>
    <div>2026.10.17（土） 17:00</div>
    <div>2026.10.18（日） 16:00</div>

    <h3>[兵庫県] GLION ARENA KOBE</h3>
    <div>2026.10.27（火） 17:00</div>
    <div>2026.10.28（水） 17:00</div>
  </section>
  <section id="ticket">
    ファミリークラブ会員チケット 10,300円（税込）
    一般チケット（プレイガイド） 10,800円（税込）
  </section>
  <section id="goods">
    <div>2026.10.28（水） 10:00-18:00</div>
    各公演の開場時間は開演時間の1時間前を予定しています。
  </section>
</body></html>`;

const all = parseNewsKmk(html, sourceUrl, {
  months: [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 19);
assert.deepEqual(all.tourMonths, ["2026-08", "2026-09", "2026-10"]);
assert.equal(all.records.length, 19);
assert.deepEqual(all.records.slice(0, 2).map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-08-01", "北海きたえーる", "17:00"],
  ["2026-08-02", "北海きたえーる", "16:00"],
]);
assert.equal(all.records[4].venueName, "静岡エコパアリーナ");
assert.equal(all.records[7].venueName, "宮城セキスイハイムスーパーアリーナ");
assert.equal(all.records.every((item) => item.openTime === undefined), true);
assert.deepEqual(all.records[0].ticketTypes.map((item) => [item.name, item.priceJpy]), [
  ["ファミリークラブ会員チケット", 10300],
  ["一般チケット", 10800],
]);
assert.deepEqual(all.records[0].pricesJpy, [10300, 10800]);
assert.equal(all.records.some((item) => item.startTime === "10:00"), false);

const future = parseNewsKmk(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(future.records.length, 7);
assert.deepEqual(future.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-10-06", "横浜アリーナ", "18:00"],
  ["2026-10-07", "横浜アリーナ", "18:00"],
  ["2026-10-08", "横浜アリーナ", "18:00"],
  ["2026-10-17", "広島グリーンアリーナ", "17:00"],
  ["2026-10-18", "広島グリーンアリーナ", "16:00"],
  ["2026-10-27", "GLION ARENA KOBE", "17:00"],
  ["2026-10-28", "GLION ARENA KOBE", "17:00"],
]);

const outside = parseNewsKmk(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 19);

const malformed = parseNewsKmk(
  `<html><body><h1>NEWS LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("NEWS KMK source smoke: ok");
