import assert from "node:assert/strict";
import { parseTokyoDomeSchedule } from "./parsers/tokyo-dome.mjs";

const sourceUrl = "https://www.tokyo-dome.co.jp/dome/event/schedule.html";

const html = `
<html><body>
  <h1>東京ドームスケジュール</h1>
  <h2>2026年9月</h2>
  <section>
    <p>21（月・祝）</p>
    <p>コンサート</p>
    <a href="https://example.com/ini-official">INI WORLD TOUR in TOKYO DOME</a>
    <p>開場 15:00 開演 17:00</p>
  </section>
  <section>
    <p>22（火）</p>
    <p>野球</p>
    <p>巨人 vs 阪神</p>
  </section>
  <h2>2026年10月</h2>
  <section>
    <p>3（土）</p>
    <p>コンサート</p>
    <a href="/dome/event/detail/super-beaver.html">SUPER BEAVER DOME TOUR 2026</a>
    <p>開場 16:00 開演 18:00</p>
  </section>
  <section>
    <p>4（日）</p>
    <p>イベント</p>
    <p>展示イベント</p>
  </section>
  <h2>2026年11月</h2>
  <section>
    <p>7（土）</p>
    <p>コンサート</p>
    <a href="https://example.com/straykids">Stray Kids WORLD TOUR in TOKYO DOME</a>
    <p>開場 14:30 開演 16:30</p>
  </section>
</body></html>`;

const parsed = parseTokyoDomeSchedule(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ],
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 2);
assert.deepEqual(parsed.records.map((event) => event.date), [
  "2026-09-21",
  "2026-10-03",
]);
assert.deepEqual(parsed.records.map((event) => event.startTime), ["17:00", "18:00"]);
assert.deepEqual(parsed.records.map((event) => event.openTime), ["15:00", "16:00"]);
assert.deepEqual(parsed.records[0].artistNames, ["INI"]);
assert.deepEqual(parsed.records[1].artistNames, ["SUPER BEAVER"]);
assert.equal(parsed.records[0].officialEventUrl, "https://example.com/ini-official");
assert.equal(
  parsed.records[1].officialEventUrl,
  "https://www.tokyo-dome.co.jp/dome/event/detail/super-beaver.html",
);
assert.equal(parsed.records.some((event) => /巨人|展示イベント/u.test(event.title)), false);

const malformed = parseTokyoDomeSchedule("<html><body>not a schedule</body></html>", sourceUrl, {
  months: [{ year: 2026, month: 9 }],
});
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Tokyo Dome source smoke: ok");
