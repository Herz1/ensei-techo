import assert from "node:assert/strict";
import { parseFantasticsSunflower } from "./parsers/fantastics-sunflower.mjs";

const sourceUrl = "https://www.ldh-liveschedule.jp/sys/tour/40198/";
const article = ({ day, weekday = "(土)", place, time, finished = false }) => `
<article class="${finished ? "fin" : ""}">
  <div class="main_info">
    <div class="day_box"><p class="day">${day}</p><p class="youbi">${weekday}</p></div>
    <div class="info_box"><p class="place">${place}</p></div>
  </div>
  <div class="sub_info"><div class="content"><dl class="txt_box">
    <dt>開場/開演</dt><dd>${time}</dd>
    <dt>お問い合わせ</dt><dd>問い合わせ窓口 12:00～18:00</dd>
  </dl></div></div>
</article>`;

const html = `
<html><body>
  <h1>FANTASTICS LIVE TOUR 2026 “SUNFLOWER”</h1>
  <section class="schedule"><div class="accordion" id="tour">
    ${article({ day: "7/1", weekday: "(水)", place: "[大阪公演] 大阪城ホール", time: "16:00 / 18:30", finished: true })}
    ${article({ day: "7/2", weekday: "(木)", place: "[大阪公演] 大阪城ホール", time: "16:00 / 18:30", finished: true })}
    ${article({ day: "9/6", weekday: "(日)", place: "[福岡公演] マリンメッセ福岡 A館", time: "14:00 / 15:00", finished: true })}
    ${article({ day: "9/26", place: "[東京公演] 国立代々木競技場 第一体育館", time: "15:00 / 16:00" })}
    ${article({ day: "9/27", weekday: "(日)", place: "[東京公演] 国立代々木競技場 第一体育館", time: "14:00 / 15:00" })}
    ${article({ day: "10/11", weekday: "(日)", place: "[福井公演] サンドーム福井", time: "15:00 / 16:00" })}
  </div></section>
  <section id="ticket">
    <p>1.全席指定：¥12,100 (チケット代 ¥11,000＋税)</p>
    <p>2.プレミアムチケット：¥18,150</p>
    <p>3.プレミアムチケット(オリジナルグッズ付き)：¥24,200</p>
    <p>申込期間 12/29(月)15:00～1/9(金)23:00</p>
  </section>
</body></html>`;

const currentWindow = parseFantasticsSunflower(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(currentWindow.ok, true);
assert.equal(currentWindow.allRecordCount, 6);
assert.deepEqual(currentWindow.tourMonths, ["2026-07", "2026-09", "2026-10"]);
assert.deepEqual(currentWindow.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-09-06", "マリンメッセ福岡A館", "14:00", "15:00"],
  ["2026-09-26", "国立代々木競技場 第一体育館", "15:00", "16:00"],
  ["2026-09-27", "国立代々木競技場 第一体育館", "14:00", "15:00"],
  ["2026-10-11", "サンドーム福井", "15:00", "16:00"],
]);
assert.deepEqual(currentWindow.records[0].ticketTypes.map((item) => [item.name, item.priceJpy]), [
  ["全席指定", 12100],
  ["プレミアムチケット", 18150],
  ["プレミアムチケット(オリジナルグッズ付き)", 24200],
]);
assert.deepEqual(currentWindow.records[0].pricesJpy, [12100, 18150, 24200]);

const july = parseFantasticsSunflower(html, sourceUrl, {
  months: [{ year: 2026, month: 7 }],
});
assert.deepEqual(july.records.map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-07-01", "大阪城ホール", "16:00", "18:30"],
  ["2026-07-02", "大阪城ホール", "16:00", "18:30"],
]);
assert.equal(
  currentWindow.records.some((item) => item.date === "2026-12-29" || item.date === "2026-01-09"),
  false,
);

const malformed = parseFantasticsSunflower(
  `<html><body><h1>FANTASTICS LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("FANTASTICS SUNFLOWER source smoke: ok");
