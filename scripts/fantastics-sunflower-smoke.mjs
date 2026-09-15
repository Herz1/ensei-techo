import assert from "node:assert/strict";
import { parseFantasticsSunflower } from "./parsers/fantastics-sunflower.mjs";

const sourceUrl = "https://www.ldh-liveschedule.jp/sys/tour/40198/";
const html = `
<html><body>
  <h1>FANTASTICS LIVE TOUR 2026 “SUNFLOWER”</h1>
  <section id="schedule">
    5/23(土) [愛知公演] Aichi Sky Expo (愛知県国際展示場) ホールA 開場/開演 16:00 / 17:00 お問い合わせ
    6/20(土) [広島公演] 広島グリーンアリーナ 開場/開演 15:00 / 16:00 お問い合わせ
    7/1(水) [大阪公演] 大阪城ホール 開場/開演 16:00 / 18:30 お問い合わせ
    7/2(木) [大阪公演] 大阪城ホール 開場/開演 16:00 / 18:30 お問い合わせ
    7/18(土) [静岡公演] エコパアリーナ 開場/開演 15:00 / 16:00 お問い合わせ
    7/19(日) [静岡公演] エコパアリーナ 開場/開演 14:00 / 15:00 お問い合わせ
    7/25(土) [東京公演] 有明アリーナ 開場/開演 15:00 / 16:00 お問い合わせ
    7/26(日) [東京公演] 有明アリーナ 開場/開演 14:00 / 15:00 お問い合わせ
    9/6(日) [福岡公演] マリンメッセ福岡 A館 開場/開演 14:00 / 15:00 お問い合わせ
    9/26(土) [東京公演] 国立代々木競技場 第一体育館 開場/開演 15:00 / 16:00 お問い合わせ
    9/27(日) [東京公演] 国立代々木競技場 第一体育館 開場/開演 14:00 / 15:00 お問い合わせ
    10/11(日) [福井公演] サンドーム福井 開場/開演 15:00 / 16:00 お問い合わせ
  </section>
  <section id="ticket">
    TICKET チケット料金
    1.全席指定：¥12,100 (チケット代 ¥11,000＋税)
    2.プレミアムチケット：¥18,150
    3.プレミアムチケット(オリジナルグッズ付き)：¥24,200
    申込期間 12/29(月)15:00～1/9(金)23:00
  </section>
</body></html>`;

const currentWindow = parseFantasticsSunflower(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});
assert.equal(currentWindow.ok, true);
assert.equal(currentWindow.allRecordCount, 12);
assert.deepEqual(currentWindow.tourMonths, [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-09",
  "2026-10",
]);
assert.equal(currentWindow.records.length, 4);
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
assert.equal(july.records.length, 6);
assert.deepEqual(july.records.slice(0, 2).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-07-01", "大阪城ホール", "16:00", "18:30"],
  ["2026-07-02", "大阪城ホール", "16:00", "18:30"],
]);
assert.equal(july.records[2].venueName, "静岡エコパアリーナ");

const may = parseFantasticsSunflower(html, sourceUrl, {
  months: [{ year: 2026, month: 5 }],
});
assert.equal(may.records[0].venueName, "Aichi Sky Expo(愛知県国際展示場) ホールA");
assert.equal(
  currentWindow.records.some((item) => item.date === "2026-12-29" || item.date === "2026-01-09"),
  false,
);

const outside = parseFantasticsSunflower(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 12);

const malformed = parseFantasticsSunflower(
  `<html><body><h1>FANTASTICS LIVE TOUR 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("FANTASTICS SUNFLOWER source smoke: ok");
