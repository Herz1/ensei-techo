import assert from "node:assert/strict";
import { parseGenerationsParallelQuest } from "./parsers/generations-parallel-quest-v2.mjs";

const sourceUrl = "https://www.ldh-liveschedule.jp/sys/tour/40102/";
const article = ({ day, weekday = "(土)", place, time }) => `
<article>
  <div class="main_info">
    <div class="day_box"><p class="day">${day}</p><p class="youbi">${weekday}</p></div>
    <div class="info_box"><p class="place">${place}</p></div>
  </div>
  <div class="sub_info"><div class="content"><dl class="txt_box">
    <dt>開場/開演</dt><dd>${time}</dd>
    <dt>お問い合わせ</dt><dd>問い合わせ窓口 12:00～16:00</dd>
  </dl></div></div>
</article>`;

const html = `
<html><body>
  <h1>GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</h1>
  <section class="schedule"><div class="accordion" id="tour">
    ${article({ day: "10/31", place: "[長野公演] 長野ビッグハット", time: "16:00 / 17:00" })}
    ${article({ day: "11/3", weekday: "(火・祝)", place: "[福岡公演] マリンメッセ福岡 A館", time: "15:00 / 16:00" })}
    ${article({ day: "11/21", place: "[福井公演] サンドーム福井 (14th ANNIVERSARY)", time: "15:00 / 16:00" })}
    ${article({ day: "12/22", weekday: "(火)", place: "[東京公演] 国立代々木競技場 第一体育館 (\"RE\"QUEST)", time: "17:30 / 18:30" })}
  </div></section>
  <article>11/30(日) NEWS 更新のお知らせ</article>
</body></html>`;

const current = parseGenerationsParallelQuest(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(current.ok, true);
assert.equal(current.allRecordCount, 4);
assert.deepEqual(current.tourMonths, ["2026-10", "2026-11", "2026-12"]);
assert.deepEqual(current.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-10-31", "ビッグハット", "16:00", "17:00"],
  ["2026-11-03", "マリンメッセ福岡A館", "15:00", "16:00"],
  ["2026-11-21", "サンドーム福井", "15:00", "16:00"],
  ["2026-12-22", "国立代々木競技場 第一体育館", "17:30", "18:30"],
]);

const legacy = parseGenerationsParallelQuest(`
<html><body>
  <h1>GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</h1>
  2026/11/7(土) 東京 有明アリーナ 開場 16:00 / 開演 17:00
</body></html>`, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(legacy.ok, true);
assert.deepEqual(legacy.records.map((item) => [item.date, item.venueName]), [
  ["2026-11-07", "有明アリーナ"],
]);

const outside = parseGenerationsParallelQuest(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);

const malformed = parseGenerationsParallelQuest(
  `<html><body><h1>GENERATIONS LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 11 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("GENERATIONS PARALLEL QUEST source smoke: ok");
