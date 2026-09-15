import assert from "node:assert/strict";
import { parseRockForYou } from "./parsers/rock-for-you.mjs";

const sourceUrl = "https://starto.jp/s/p/live/10505";
const html = `
<html><body>
  <h1>ROCK FOR YOU LIVE TOUR</h1>
  <div>横山裕</div>
  <section><h2>SCHEDULE</h2>
    <h3>[新潟県] NIIGATA LOTS</h3>
    <div>2026.09.18（金） 19:00</div>

    <h3>[東京都] Zepp Haneda（TOKYO）</h3>
    <div>2026.09.20（日） 18:00</div>
    <div>2026.09.21（月・祝） 18:00</div>

    <h3>[宮城県] SENDAI GIGS</h3>
    <div>2026.09.23（水・祝） 18:00</div>

    <h3>[北海道] Zepp Sapporo</h3>
    <div>2026.09.28（月） 19:00</div>
    <div>2026.09.29（火） 19:00</div>

    <h3>[東京都] 東京ガーデンシアター</h3>
    <div>2026.10.07（水） 19:00 (追加公演)</div>
  </section>
  <section><h2>TICKET</h2>
    <div>ファミリークラブ会員チケット</div>
    <div>【大阪・愛知・福岡・東京・宮城・北海道公演】 9,200円(税込)※別途ドリンク代必要(600円)</div>
    <div>【香川・岡山・岐阜・広島・熊本・新潟公演】 8,900円(税込)※別途ドリンク代必要(新潟：500円/その他：600円)</div>
    <div>【追加 東京公演】 9,200円(税込)※ドリンク代なし</div>
    <div>一般チケット(プレイガイド)</div>
    <div>【大阪・愛知・福岡・東京・宮城・北海道公演】 9,700円(税込)※別途ドリンク代必要(600円)</div>
    <div>【香川・岡山・岐阜・広島・熊本・新潟公演】 9,400円(税込)※別途ドリンク代必要(新潟：500円/その他：600円)</div>
    <div>【追加 東京公演】 9,700円(税込)※ドリンク代なし</div>
    <div>発売中</div>
  </section>
  <section><h2>GOODS</h2>
    <div>2026.09.20(日) 15:30–18:30</div>
    <div>2026.09.23(水・祝) 15:30–18:30</div>
    <div>注文受付期間：10/7(水)20:00～10/13(火)23:00</div>
  </section>
</body></html>`;

const all = parseRockForYou(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 6);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-10"]);
assert.deepEqual(all.records.map((item) => [item.date, item.venueName, item.startTime]), [
  ["2026-09-20", "Zepp Haneda(TOKYO)", "18:00"],
  ["2026-09-21", "Zepp Haneda(TOKYO)", "18:00"],
  ["2026-09-23", "SENDAI GIGS", "18:00"],
  ["2026-09-28", "Zepp Sapporo", "19:00"],
  ["2026-09-29", "Zepp Sapporo", "19:00"],
  ["2026-10-07", "東京ガーデンシアター", "19:00"],
]);
assert.equal(all.records.some((item) => item.date === "2026-09-18"), false);
assert.equal(all.records.some((item) => item.date === "2026-10-13"), false);
assert.equal(all.records.every((item) => item.openTime === undefined), true);

for (const event of all.records) {
  assert.deepEqual(event.ticketTypes, [
    { name: "ファミリークラブ会員チケット", priceJpy: 9200, taxIncluded: true, notes: [] },
    { name: "一般チケット", priceJpy: 9700, taxIncluded: true, notes: [] },
  ]);
  assert.deepEqual(event.pricesJpy, [9200, 9700]);
}

for (const event of all.records.filter((item) => item.venueName !== "東京ガーデンシアター")) {
  assert.deepEqual(event.additionalFees, [
    { type: "drink", label: "ドリンク代", amountJpy: 600, required: true },
  ]);
  assert.equal(event.additionalFeesPublished, true);
}

const garden = all.records.find((item) => item.venueName === "東京ガーデンシアター");
assert.deepEqual(garden?.additionalFees, []);
assert.equal(garden?.additionalFeesPublished, true);

const september = parseRockForYou(html, sourceUrl, {
  months: [{ year: 2026, month: 9 }],
});
assert.equal(september.records.length, 5);
assert.equal(september.records.every((item) => item.date.startsWith("2026-09-")), true);

const october = parseRockForYou(html, sourceUrl, {
  months: [{ year: 2026, month: 10 }],
});
assert.equal(october.records.length, 1);
assert.equal(october.records[0].venueName, "東京ガーデンシアター");
assert.deepEqual(october.records[0].additionalFees, []);
assert.equal(october.records[0].additionalFeesPublished, true);

const outside = parseRockForYou(html, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 6);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-10"]);

const malformed = parseRockForYou(
  `<html><body><h1>ROCK FOR YOU</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("ROCK FOR YOU remaining-leg source smoke: ok");
