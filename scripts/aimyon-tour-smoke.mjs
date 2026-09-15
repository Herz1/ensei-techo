import assert from "node:assert/strict";
import { parseAimyonTour2027 } from "./parsers/aimyon-tour.mjs";

const sourceUrl = "https://www.aimyong.net/feature/tour2027";
const duplicatedSchedule = `
  SCHEDULE 2027
  2.6 SAT 17:00 / 18:00
  2.7 SUN 16:00 / 17:00
  神奈川 ぴあアリーナMM INFO

  2.13 SAT 17:00 / 18:00
  2.14 SUN 16:00 / 17:00
  福井 サンドーム福井 INFO

  3.20 SAT 17:00 / 18:00
  3.21 SUN 16:00 / 17:00
  愛知 クロコくんホール (旧日本ガイシホール) INFO

  6.26 SAT 17:00 / 18:00
  6.27 SUN 16:00 / 17:00
  愛知 Aichi Sky Expo(愛知県国際展示場) ホールA INFO

  7.10 SAT 17:30 / 18:30
  7.11 SUN 15:30 / 16:30
  沖縄 沖縄サントリーアリーナ INFO
`;

const html = `
<html><body>
  <h1>AIMYON TOUR 2027 -cosmic%-</h1>
  <section class="desktop">${duplicatedSchedule}</section>
  <section class="mobile">${duplicatedSchedule}</section>
  <section>
    <h2>TICKET</h2>
    <p>詳細は後日発表いたします。</p>
  </section>
  <article>
    <h2>AIMYON 2027 会員イベント</h2>
    <p>指定席 10,000円(税込)</p>
  </article>
</body></html>`;

const parsed = parseAimyonTour2027(html, sourceUrl, {
  months: [
    { year: 2027, month: 2 },
    { year: 2027, month: 3 },
    { year: 2027, month: 6 },
    { year: 2027, month: 7 },
  ],
});
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 10);
assert.deepEqual(parsed.records.slice(0, 4).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2027-02-06", "ぴあアリーナMM", "17:00", "18:00"],
  ["2027-02-07", "ぴあアリーナMM", "16:00", "17:00"],
  ["2027-02-13", "サンドーム福井", "17:00", "18:00"],
  ["2027-02-14", "サンドーム福井", "16:00", "17:00"],
]);

const gaishi = parsed.records.find((item) => item.date === "2027-03-20");
assert.equal(gaishi?.venueName, "クロコくんホール");
const aichi = parsed.records.find((item) => item.date === "2027-06-26");
assert.equal(aichi?.venueName, "Aichi Sky Expo(愛知県国際展示場) ホールA");
const okinawa = parsed.records.find((item) => item.date === "2027-07-10");
assert.deepEqual(
  [okinawa?.venueName, okinawa?.openTime, okinawa?.startTime],
  ["沖縄サントリーアリーナ", "17:30", "18:30"],
);

assert.equal(
  new Set(parsed.records.map((item) => `${item.date}|${item.venueName}|${item.startTime}`)).size,
  parsed.records.length,
);
assert.equal(parsed.records.some((item) => "ticketTypes" in item), false);
assert.equal(parsed.records.some((item) => "pricesJpy" in item), false);

const julyOnly = parseAimyonTour2027(html, sourceUrl, {
  months: [{ year: 2027, month: 7 }],
});
assert.deepEqual(julyOnly.records.map((item) => item.date), ["2027-07-10", "2027-07-11"]);

const malformed = parseAimyonTour2027(
  `<html><body><h1>AIMYON TOUR 2027</h1><div>SCHEDULE 2027</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2027, month: 2 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("AIMYON TOUR 2027 cosmic source smoke: ok");
