import assert from "node:assert/strict";
import { parseOsakaJoHallSchedule } from "./parsers/osaka-johall.mjs";

const source = {
  id: "osaka-johall-test",
  name: "大阪城ホール test",
  type: "venue_official",
  role: "venue_schedule",
  url: "https://www.osaka-johall.com/event/?ym=202609",
  fetchedAt: "2026-09-15T00:00:00.000Z",
};

const fixture = `
<html><body>
  <h1>2026年9月のイベント</h1>
  <ul>
    <li>
      <div>19（土）</div>
      <a href="https://artist.example/live">新しい地図 Arena Tour 2026</a>
      <div>開場 11:00/15:00</div>
      <div>開演 12:00/16:00</div>
      <div>座席 指定席 11,000円 / ファンクラブ会員限定席 15,000円</div>
      <div>主催 Example</div>
      <div>音楽・芸能</div><div>アリーナ</div>
    </li>
    <li>
      <div>27（日）</div>
      <a href="https://artist.example/dct">DREAMS COME TRUE</a>
      <div>開場 15:00</div>
      <div>開演 17:00</div>
      <div>座席 指定席 12,000円</div>
      <div>主催 Example</div>
      <div>音楽・芸能</div><div>アリーナ</div>
    </li>
  </ul>
</body></html>`;

const parsed = parseOsakaJoHallSchedule(fixture, source, { year: 2026, month: 9 });
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 3, "双场日期必须拆成两个 source record");
assert.equal(parsed.records[0].date, "2026-09-19");
assert.equal(parsed.records[0].openTime, "11:00");
assert.equal(parsed.records[0].startTime, "12:00");
assert.equal(parsed.records[1].openTime, "15:00");
assert.equal(parsed.records[1].startTime, "16:00");
assert.equal(parsed.records[0].venueIdHint, "osaka-jo-hall");
assert.deepEqual(parsed.records[0].pricesJpy, [11000, 15000]);
assert.equal(parsed.records[0].ticketTypes.length, 2);
assert.ok(parsed.records[0].eligibility.some((rule) => /会員限定/u.test(rule.label)));
assert.equal(parsed.records[2].title, "DREAMS COME TRUE");
assert.equal(parsed.records[2].startTime, "17:00");

const wrongMonth = parseOsakaJoHallSchedule(
  fixture.replace("2026年9月のイベント", "2026年8月のイベント"),
  source,
  { year: 2026, month: 9 },
);
assert.equal(wrongMonth.ok, false);
assert.match(wrongMonth.reason, /查询参数可能失效|页面结构已变化/u);

const noEvents = parseOsakaJoHallSchedule(
  "<html><body><h1>2026年9月のイベント</h1><p>予定なし</p></body></html>",
  source,
  { year: 2026, month: 9 },
);
assert.equal(noEvents.ok, true);
assert.equal(noEvents.records.length, 0);

console.log("大阪城ホール公式源测试通过：月份防串、双场拆分、OPEN/START、座席票价和会員限制正常。");
