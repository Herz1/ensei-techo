import assert from "node:assert/strict";
import { normalizeName } from "./event-ingest-lib.mjs";
import { parsePayPayDomeSchedule } from "./parsers/paypay-dome.mjs";

const sourceUrl = "https://www.softbankhawks.co.jp/stadium/event_schedule/2026/";
const knownArtistNames = new Set([
  "Stray Kids",
  "YOASOBI",
  "Snow Man",
  "BIGBANG",
].map(normalizeName));

const html = `
<html>
  <body>
    <h1>2026年みずほPayPayドームイベント日程</h1>
    <div class="event">
      <p>2026/10/24（土）</p>
      <p>イベント | <a href="https://www.straykidsjapan.com/run-it/">Stray Kids World Tour &lt;RUN IT JAPAN&gt;</a></p>
      <p>開演時間 | 16:30 開場 18:30 開演</p>
      <p>お問い合わせ | BEA</p>
    </div>
    <div class="event">
      <p>2026/11/14（土）</p>
      <p>イベント | <a href="https://hehn.fujiikaze.com/prema/">Prema World Tour</a></p>
      <p>開演時間 | 開場 16:00 開演 18:00</p>
      <p>お問い合わせ | キョードー西日本</p>
    </div>
    <div class="event">
      <p>2026/11/23（月祝）</p>
      <p>イベント | FUKUOKA OH SADAHARU LEGACY PROJECT SPECIAL MATCH</p>
      <p>お問い合わせ | 福岡ソフトバンクホークス株式会社</p>
    </div>
    <div class="event">
      <p>2026/11/28（土）</p>
      <p>イベント | <a href="https://www.yoasobi-music.jp/dome2026/">YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027</a></p>
      <p>開演時間 | 開場 15:30 開演 18:00</p>
      <p>お問い合わせ | キョードー西日本</p>
    </div>
    <div class="event">
      <p>2026/11/29（日）</p>
      <p>イベント | <a href="https://www.yoasobi-music.jp/dome2026/">YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027</a></p>
      <p>開演時間 | 開場 14:30 開演 17:00</p>
      <p>お問い合わせ | キョードー西日本</p>
    </div>
    <div class="event">
      <p>2026/12/4（金）</p>
      <p>イベント | <a href="https://example.com/snowman">Snow Man DOME TOUR</a></p>
      <p>開演時間 | 開演 17:00</p>
      <p>お問い合わせ | キョードー西日本</p>
    </div>
    <div class="event">
      <p>2026/12/26（土）</p>
      <p>イベント | <a href="https://ygex.jp/bigbang/">BIGBANG 2026 WORLD TOUR</a></p>
      <p>開演時間 | 開場 15:00 開演 17:00</p>
      <p>お問い合わせ | キョードー西日本</p>
    </div>
    <div class="event">
      <p>2026/3/1（日）</p>
      <p>イベント | <a href="https://job.mynavi.jp/">マイナビ就職EXPO</a></p>
      <p>開催時間 | 12:00～17:00</p>
      <p>お問い合わせ | fk-event@mynavi.jp</p>
    </div>
    <div class="event">
      <p>2026/7/18（土）</p>
      <p>イベント | みずほPayPayドームフィールド無料開放！</p>
      <p>開演時間 | 11:00～17:00</p>
      <p>お問い合わせ | BOSS E・ZO FUKUOKA</p>
    </div>
  </body>
</html>`;

const parsed = parsePayPayDomeSchedule(html, sourceUrl, {
  year: 2026,
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
  knownArtistNames,
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 6);

const strayKids = parsed.records.find((record) => record.date === "2026-10-24");
assert.equal(strayKids?.openTime, "16:30");
assert.equal(strayKids?.startTime, "18:30");
assert.deepEqual(strayKids?.artistNames, ["Stray Kids"]);
assert.equal(strayKids?.officialEventUrl, "https://www.straykidsjapan.com/run-it/");

const prema = parsed.records.find((record) => record.title === "Prema World Tour");
assert.equal(prema?.date, "2026-11-14");
assert.deepEqual(prema?.artistNames, []);

const yoasobi = parsed.records.filter((record) => record.title.startsWith("YOASOBI"));
assert.equal(yoasobi.length, 2);
assert.deepEqual(yoasobi[0]?.artistNames, ["YOASOBI"]);
assert.equal(yoasobi[0]?.startTime, "18:00");
assert.equal(yoasobi[1]?.startTime, "17:00");

const snowMan = parsed.records.find((record) => record.title === "Snow Man DOME TOUR");
assert.equal(snowMan?.openTime, undefined);
assert.equal(snowMan?.startTime, "17:00");
assert.deepEqual(snowMan?.artistNames, ["Snow Man"]);

assert.equal(parsed.records.some((record) => /就職EXPO/u.test(record.title)), false);
assert.equal(parsed.records.some((record) => /SPECIAL MATCH/u.test(record.title)), false);
assert.equal(parsed.records.some((record) => /無料開放/u.test(record.title)), false);

const novemberOnly = parsePayPayDomeSchedule(html, sourceUrl, {
  year: 2026,
  months: [{ year: 2026, month: 11 }],
  knownArtistNames,
});
assert.equal(novemberOnly.ok, true);
assert.equal(novemberOnly.records.length, 3);
assert.ok(novemberOnly.records.every((record) => record.date.startsWith("2026-11-")));

const wrongYear = parsePayPayDomeSchedule(
  html.replace("2026年みずほPayPayドームイベント日程", "イベント日程"),
  sourceUrl,
  { year: 2026, months: [], knownArtistNames },
);
assert.equal(wrongYear.ok, false);
assert.equal(wrongYear.records.length, 0);

console.log("PayPay Dome source smoke passed");
