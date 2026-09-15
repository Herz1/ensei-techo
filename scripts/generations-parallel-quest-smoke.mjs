import assert from "node:assert/strict";
import { parseGenerationsParallelQuest } from "./parsers/generations-parallel-quest-v2.mjs";

const sourceUrl = "https://www.ldh-liveschedule.jp/sys/tour/40102/";
const html = `
<html><body>
  <h1>GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</h1>
  <section class="desktop">
    2026/11/7(土) 長野 ビッグハット 開場 16:00 / 開演 17:00
    11/8(日) 長野 ビッグハット 開場 15:00 / 開演 16:00
    11/21(土) 東京 有明アリーナ OPEN 16:00 / START 17:00
    11/22(日) 東京 有明アリーナ OPEN 15:00 / START 16:00
    12/5(土) 福井 サンドーム福井 開場 16:00 / 開演 17:00
    12/6(日) 福井 サンドーム福井 開場 15:00 / 開演 16:00
  </section>
  <section class="mobile">
    2026/11/7(土) 長野 ビッグハット 開場 16:00 / 開演 17:00
    11/8(日) 長野 ビッグハット 開場 15:00 / 開演 16:00
  </section>
  <article>11/30(日) NEWS 更新のお知らせ</article>
</body></html>`;

const november = parseGenerationsParallelQuest(html, sourceUrl, {
  months: [{ year: 2026, month: 11 }],
});
assert.equal(november.ok, true);
assert.equal(november.allRecordCount, 6);
assert.deepEqual(november.tourMonths, ["2026-11", "2026-12"]);
assert.deepEqual(november.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-11-07", "ビッグハット", "16:00", "17:00"],
  ["2026-11-08", "ビッグハット", "15:00", "16:00"],
  ["2026-11-21", "有明アリーナ", "16:00", "17:00"],
  ["2026-11-22", "有明アリーナ", "15:00", "16:00"],
]);

const december = parseGenerationsParallelQuest(html, sourceUrl, {
  months: [{ year: 2026, month: 12 }],
});
assert.deepEqual(december.records.map((item) => [item.date, item.venueName]), [
  ["2026-12-05", "サンドーム福井"],
  ["2026-12-06", "サンドーム福井"],
]);

const january = parseGenerationsParallelQuest(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(january.ok, true);
assert.deepEqual(january.records, []);
assert.deepEqual(january.tourMonths, ["2026-11", "2026-12"]);

const malformed = parseGenerationsParallelQuest(
  `<html><body><h1>GENERATIONS LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 11 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("GENERATIONS PARALLEL QUEST source smoke: ok");
