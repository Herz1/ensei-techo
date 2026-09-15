import assert from "node:assert/strict";
import { parseVantelinDomeSchedule } from "./parsers/vantelin-dome.mjs";

const sourceUrl = "https://www.nagoya-dome.co.jp/sp/eventcalen.php";
const months = [
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
  { year: 2026, month: 11 },
  { year: 2027, month: 1 },
];

const html = `
<html><body>
  <h1>イベントカレンダー | バンテリンドーム ナゴヤ</h1>
  <div class="event">9/1(火) 開場 16:00 ／ 開始 18:00 中日vs広島</div>
  <div class="event">
    9/5(土) 開場 16:30 ／ 開始 18:30
    <a href="https://www.straykidsjapan.com/run-it/">Stray Kids World Tour ＜RUN IT JAPAN＞</a>
  </div>
  <div class="event">
    9/6(日) 開場 14:00 ／ 開始 16:00
    <a href="https://www.straykidsjapan.com/run-it/">Stray Kids World Tour ＜RUN IT JAPAN＞</a>
  </div>
  <div class="event">9/13(日) 開場 --- ／ 開始 09:00 関係者イベント</div>

  <p>2026年10月は予定がありません</p>

  <div class="event">
    11/7(土) 開場 15:30 ／ 開始 18:00
    <a href="https://www.yoasobi-music.jp/dome2026/">YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027</a>
  </div>
  <div class="event">
    11/8(日) 開場 14:30 ／ 開始 17:00
    <a href="https://www.yoasobi-music.jp/dome2026/">YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027</a>
  </div>
  <div class="event">
    11/14(土) 開場 14:30 ／ 開始 16:30
    <a href="https://www.lovelive-anime.jp/15th/">LoveLive! Series 15th Anniversary ラブライブ！フェス</a>
  </div>
  <div class="event">
    11/15(日) 開場 13:30 ／ 開始 15:30
    <a href="https://www.lovelive-anime.jp/15th/">LoveLive! Series 15th Anniversary ラブライブ！フェス</a>
  </div>
  <div class="event">11/19(木) 開場 --- ／ 開始 --- 日米対抗ソフトボール2026</div>

  <div class="event">
    1/9(土) 開場 --- ／ 開始 17:00
    <a href="https://tobe-official.jp/artists/number_i/">Number_i LIVE TOUR No.III</a>
  </div>
  <div class="event">
    1/10(日) 開場 --- ／ 開始 12:30
    <a href="https://tobe-official.jp/artists/number_i/">Number_i LIVE TOUR No.III</a>
  </div>
  <div class="event">
    1/10(日) 開場 --- ／ 開始 19:00
    <a href="https://tobe-official.jp/artists/number_i/">Number_i LIVE TOUR No.III</a>
  </div>
  <div class="event">
    1/10(日) 開場 --- ／ 開始 12:30
    <a href="https://tobe-official.jp/artists/number_i/">Number_i LIVE TOUR No.III</a>
  </div>

  <div class="event">
    7/19(日) 開場 16:00 ／ 開始 18:00
    <a href="https://cloud.jo1.jp/">JO1DER SHOW 2026 ‘EIEN 永縁’ FINAL</a>
  </div>
</body></html>`;

const parsed = parseVantelinDomeSchedule(html, sourceUrl, { months });
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 9);
assert.deepEqual(parsed.records.map((event) => event.date), [
  "2026-09-05",
  "2026-09-06",
  "2026-11-07",
  "2026-11-08",
  "2026-11-14",
  "2026-11-15",
  "2027-01-09",
  "2027-01-10",
  "2027-01-10",
]);
assert.equal(parsed.records.some((event) => /中日|関係者|ソフトボール/u.test(event.title)), false);
assert.deepEqual(parsed.records[0].artistNames, ["Stray Kids"]);
assert.deepEqual(parsed.records[2].artistNames, ["YOASOBI"]);
assert.deepEqual(parsed.records[4].artistNames, []);
assert.deepEqual(parsed.records[6].artistNames, ["Number_i"]);
assert.equal(parsed.records[6].openTime, undefined);
assert.equal(parsed.records[6].startTime, "17:00");
assert.equal(parsed.records[0].officialEventUrl, "https://www.straykidsjapan.com/run-it/");
assert.equal(parsed.records[6].officialEventUrl, "https://tobe-official.jp/artists/number_i/");

const emptyMonth = parseVantelinDomeSchedule(
  "<html><body><h1>イベントカレンダー | バンテリンドーム ナゴヤ</h1><p>2026年10月は予定がありません</p></body></html>",
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(emptyMonth.ok, true);
assert.deepEqual(emptyMonth.records, []);

const malformed = parseVantelinDomeSchedule(
  "<html><body>not the official calendar</body></html>",
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

const ambiguous = parseVantelinDomeSchedule(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2027, month: 9 },
  ],
});
assert.equal(ambiguous.ok, false);
assert.deepEqual(ambiguous.records, []);

console.log("Vantelin Dome source smoke: ok");
