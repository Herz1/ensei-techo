import assert from "node:assert/strict";
import { parseNaniwaNd5 } from "./parsers/naniwa-nd5.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10489";
const html = `
<html><body>
  <h1>なにわ男子 LIVE TOUR 2026 「ND⁵」</h1>
  <section id="schedule">
    <h2>SCHEDULE</h2>
    <h3>[北海道] 北海道立総合体育センター（北海きたえーる）</h3>
    <div>2026.07.11（土） 13:30 18:00</div>
    <div>2026.07.12（日） 14:00</div>

    <h3>[福岡県] マリンメッセ福岡A館</h3>
    <div>2026.07.18（土） 13:30 18:00</div>
    <div>2026.07.19（日） 13:00 17:30</div>

    <h3>[大阪府] 大阪城ホール</h3>
    <div>2026.07.28（火） 18:00</div>
    <div>2026.07.29（水） 13:30 18:00</div>

    <h3>[神奈川県] 横浜アリーナ</h3>
    <div>2026.08.05（水） 13:00 18:00</div>
    <div>2026.08.06（木） 13:00 18:00</div>
    <div>2026.08.07（金） 13:00 18:00</div>

    <h3>[宮城県] セキスイハイムスーパーアリーナ</h3>
    <div>2026.08.15（土） 13:30 18:00</div>
    <div>2026.08.16（日） 13:00 17:30</div>

    <h3>[大阪府] 大阪城ホール</h3>
    <div>2026.08.25（火） 18:00</div>
    <div>2026.08.26（水） 13:30 18:00</div>

    <h3>[新潟県] 朱鷺メッセ 新潟コンベンションセンター</h3>
    <div>2026.09.05（土） 13:30 18:00</div>
    <div>2026.09.06（日） 13:00 17:30</div>

    <h3>[香川県] あなぶきアリーナ香川</h3>
    <div>2026.09.19（土） 13:30 18:00</div>
    <div>2026.09.20（日） 13:00 17:30</div>
    <div>2026.09.21（月・祝） 14:00</div>

    <h3>[静岡県] エコパアリーナ</h3>
    <div>2026.10.10（土） 13:30 18:00</div>
    <div>2026.10.11（日） 13:00 17:30</div>
    <div>2026.10.12（月・祝） 14:00</div>

    <h3>[千葉県] ららアリーナ 東京ベイ</h3>
    <div>2026.10.24（土） 13:00 18:00</div>
    <div>2026.10.25（日） 12:30 17:30</div>
    <div>2026.10.26（月） 18:00</div>
    <div>2026.10.27（火） 13:00 18:00</div>
    <div>2026.10.28（水） 15:00</div>
  </section>
  <section id="ticket">
    <h2>TICKET</h2>
    ファミリークラブ会員チケット 9,800円（税込）
    一般チケット(プレイガイド) 10,300円（税込）
    2026.08.30 12:00 発売
  </section>
</body></html>`;

const all = parseNaniwaNd5(html, sourceUrl, {
  months: [
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 45);
assert.deepEqual(all.tourMonths, ["2026-07", "2026-08", "2026-09", "2026-10"]);
assert.equal(all.records.length, 45);

const osaka = all.records.filter((item) => item.venueName === "大阪城ホール");
assert.deepEqual(osaka.map((item) => [item.date, item.startTime]), [
  ["2026-07-28", "18:00"],
  ["2026-07-29", "13:30"],
  ["2026-07-29", "18:00"],
  ["2026-08-25", "18:00"],
  ["2026-08-26", "13:30"],
  ["2026-08-26", "18:00"],
]);

const miyagi = all.records.find((item) => item.date === "2026-08-15");
assert.equal(miyagi?.venueName, "宮城セキスイハイムスーパーアリーナ");
const niigata = all.records.find((item) => item.date === "2026-09-05");
assert.equal(niigata?.venueName, "朱鷺メッセ");
const shizuoka = all.records.find((item) => item.date === "2026-10-10");
assert.equal(shizuoka?.venueName, "静岡エコパアリーナ");
assert.equal(all.records.every((item) => item.openTime === undefined), true);
assert.deepEqual(all.records[0].ticketTypes, [
  { name: "ファミリークラブ会員チケット", priceJpy: 9800, taxIncluded: true, notes: [] },
  { name: "一般チケット", priceJpy: 10300, taxIncluded: true, notes: [] },
]);
assert.deepEqual(all.records[0].pricesJpy, [9800, 10300]);
assert.equal(all.records.some((item) => item.date === "2026-08-30"), false);

const october = parseNaniwaNd5(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(october.records.length, 13);
assert.deepEqual(october.records.slice(0, 5).map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-10-10", "静岡エコパアリーナ", "13:30"],
  ["2026-10-10", "静岡エコパアリーナ", "18:00"],
  ["2026-10-11", "静岡エコパアリーナ", "13:00"],
  ["2026-10-11", "静岡エコパアリーナ", "17:30"],
  ["2026-10-12", "静岡エコパアリーナ", "14:00"],
]);
assert.equal(october.records.filter((item) => item.venueName === "ららアリーナ 東京ベイ").length, 8);

const septemberOctober = parseNaniwaNd5(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(septemberOctober.records.length, 22);

const outside = parseNaniwaNd5(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 45);
assert.deepEqual(outside.tourMonths, ["2026-07", "2026-08", "2026-09", "2026-10"]);

const malformed = parseNaniwaNd5(
  `<html><body><h1>なにわ男子 LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("なにわ男子 ND5 source smoke: ok");
