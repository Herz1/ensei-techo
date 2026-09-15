import assert from "node:assert/strict";
import { parseMrChildrenTour } from "./parsers/mrchildren-tour.mjs";

const sourceUrl = "https://tour.mrchildren.jp/index.html";
const html = `
<html><body>
  <h1>Mr.Children Tour 2026 “Saturday in the park”</h1>
  <section id="ticket">
    <h2>Ticket</h2>
    <div>前売料金 （全て税込） 1. 指定席 ¥14,300 2. 注釈付指定席 ¥12,100 3. 後方立見 ¥11,000</div>
    <div>※後方立見は、神奈川(横浜アリーナ)・愛知・宮城・福岡・大阪・香川・神奈川(ぴあアリーナMM)・北海道・福井・佐賀公演のみ</div>
  </section>
  <section id="schedule">
    2026.5.30 sat 大阪 大阪城ホール 開場 16:00 / 開演 17:00 キョードー大阪
    2026.5.31 sun 大阪 大阪城ホール 開場 15:00 / 開演 16:00 キョードー大阪
    2026.10.3 sat 福井 サンドーム福井 開場 16:00 / 開演 17:00 キョードー北陸
    2026.10.4 sun 福井 サンドーム福井 開場 15:00 / 開演 16:00 キョードー北陸
    2026.10.14 wed 大阪 大阪城ホール 開場 17:30 / 開演 18:30 キョードー大阪
    2026.10.15 thu 大阪 大阪城ホール 開場 17:30 / 開演 18:30 キョードー大阪
    2026.10.24 sat 静岡 静岡エコパアリーナ 開場 16:00 / 開演 17:00 サンデーフォークプロモーション静岡
    2026.10.25 sun 静岡 静岡エコパアリーナ 開場 15:00 / 開演 16:00 サンデーフォークプロモーション静岡
    2026.10.31 sat 東京 有明アリーナ 開場 16:00 / 開演 17:00 DISK GARAGE
    2026.11.1 sun 東京 有明アリーナ 開場 15:00 / 開演 16:00 DISK GARAGE
    2026.11.7 sat 福岡 マリンメッセ福岡 A館 開場 16:00 / 開演 17:00 キョードー西日本
    2026.11.8 sun 福岡 マリンメッセ福岡 A館 開場 15:00 / 開演 16:00 キョードー西日本
    2026.11.14 sat 佐賀 SAGAアリーナ 開場 16:00 / 開演 17:00 キョードー西日本
    2026.11.15 sun 佐賀 SAGAアリーナ 開場 15:00 / 開演 16:00 キョードー西日本
    2026.11.21 sat 広島 広島グリーンアリーナ 開場 16:00 / 開演 17:00 YUMEBANCHI
    2026.11.22 sun 広島 広島グリーンアリーナ 開場 15:00 / 開演 16:00 YUMEBANCHI
    2026.12.2 wed 神奈川 横浜アリーナ 開場 17:30 / 開演 18:30 DISK GARAGE
    2026.12.3 thu 神奈川 横浜アリーナ 開場 17:30 / 開演 18:30 DISK GARAGE
  </section>
  <section id="news">
    <div>2026.06.09 振替公演および追加公演決定のお知らせ 10月14日(水) 大阪城ホール（開場17:30/開演18:30）</div>
  </section>
</body></html>`;

const future = parseMrChildrenTour(html, sourceUrl, {
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(future.ok, true);
assert.equal(future.records.length, 16);
assert.equal(future.records.some((item) => item.date === "2026-06-09"), false);
assert.deepEqual(future.records.slice(0, 4).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2026-10-03", "サンドーム福井", "16:00", "17:00"],
  ["2026-10-04", "サンドーム福井", "15:00", "16:00"],
  ["2026-10-14", "大阪城ホール", "17:30", "18:30"],
  ["2026-10-15", "大阪城ホール", "17:30", "18:30"],
]);

const byDate = new Map(future.records.map((item) => [item.date, item]));
assert.deepEqual(byDate.get("2026-10-03").ticketTypes.map((item) => item.name), [
  "指定席",
  "注釈付指定席",
  "後方立見",
]);
assert.deepEqual(byDate.get("2026-10-24").ticketTypes.map((item) => item.name), [
  "指定席",
  "注釈付指定席",
]);
assert.deepEqual(byDate.get("2026-11-07").ticketTypes.map((item) => item.name), [
  "指定席",
  "注釈付指定席",
  "後方立見",
]);
assert.deepEqual(byDate.get("2026-11-21").ticketTypes.map((item) => item.name), [
  "指定席",
  "注釈付指定席",
]);
assert.deepEqual(byDate.get("2026-12-02").pricesJpy, [11000, 12100, 14300]);
assert.equal(byDate.get("2026-10-24").pricesJpy.includes(11000), false);
assert.equal(byDate.get("2026-11-01").venueName, "有明アリーナ");
assert.equal(byDate.get("2026-11-07").venueName, "マリンメッセ福岡A館");

const cancelledMay = parseMrChildrenTour(html, sourceUrl, {
  months: [{ year: 2026, month: 5 }],
});
assert.equal(cancelledMay.ok, true);
assert.deepEqual(cancelledMay.records, []);

const malformed = parseMrChildrenTour(
  `<html><body><h1>Mr.Children Tour 2026</h1><div>broken</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Mr.Children Tour 2026 source smoke: ok");
