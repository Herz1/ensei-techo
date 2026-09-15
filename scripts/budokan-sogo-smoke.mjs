import assert from "node:assert/strict";
import {
  parseSogoBudokanDetail,
  parseSogoBudokanScheduleIndex,
} from "./parsers/sogo-budokan.mjs";

const scheduleUrl = "https://sogotokyo.com/live_information/calendar/?year=2026&month=10";
const scheduleHtml = `
<html><body>
  <h1>2026.10</h1>
  <a href="/live_information/detail/9999/">HANA 日本武道館 2026.10.20</a>
  <a href="/live_information/detail/9998/">別公演 東京国際フォーラム</a>
  <a href="/live_information/detail/9999/">HANA 日本武道館 詳細</a>
</body></html>`;

const schedule = parseSogoBudokanScheduleIndex(scheduleHtml, scheduleUrl, {
  year: 2026,
  month: 10,
});
assert.equal(schedule.ok, true);
assert.equal(schedule.events.length, 1);
assert.equal(
  schedule.events[0].url,
  "https://sogotokyo.com/live_information/detail/9999/",
);

const wrongMonth = parseSogoBudokanScheduleIndex(
  scheduleHtml,
  scheduleUrl,
  { year: 2026, month: 11 },
);
assert.equal(wrongMonth.ok, false);

const detailUrl = "https://sogotokyo.com/live_information/detail/9999/";
const detailHtml = `
<html><body>
<nav>SCHEDULEイベントスケジュール</nav>
<div>HANA</div>
<h1>HANA</h1>
<div>EVENT TITLE</div>
<div>HANA 1st TOUR FINAL</div>
<div>DATE</div>
<div>2026.10.20 (Tue)</div>
<div>VENUE</div>
<div>日本武道館</div>
<div>OPEN / START</div>
<div>17:00 / 18:00</div>
<div>PRICE</div>
<div>指定席 ¥12,500（税込）。注釈付指定席 ¥11,500（税込）。未就学児入場不可。お一人様4枚まで。</div>
<div>TICKET</div>
<a href="https://eplus.jp/hana-budokan/">e+</a>
<div>INFORMATION</div>
<div>本人確認を行う場合があります。</div>
<div>NOTICE</div>
<div>電子チケットのみ</div>
<div>CONTACT</div>
<a href="https://hana.b-rave.tokyo/">OFFICIAL SITE</a>
</body></html>`;

const detail = parseSogoBudokanDetail(detailHtml, detailUrl);
assert.equal(detail.ok, true);
assert.equal(detail.title, "HANA 1st TOUR FINAL");
assert.deepEqual(detail.shows, [
  { date: "2026-10-20", openTime: "17:00", startTime: "18:00" },
]);
assert.deepEqual(detail.pricesJpy, [11500, 12500]);
assert.equal(detail.purchaseUrls[0], "https://eplus.jp/hana-budokan/");
assert.equal(detail.officialSiteUrls[0], "https://hana.b-rave.tokyo/");
assert.ok(detail.eligibility.some((rule) => rule.label === "未就学児童入場不可"));
assert.ok(detail.eligibility.some((rule) => rule.label === "1人4枚まで"));
assert.ok(detail.eligibility.some((rule) => rule.label === "本人確認の場合あり"));
assert.ok(detail.eligibility.some((rule) => rule.label === "電子チケットのみ"));

const twoDayHtml = `
<html><body>
<div>Artist X</div>
<div>EVENT TITLE</div><div>Artist X BUDOKAN</div>
<div>DATE</div><div>2026.12.31 / 2027.01.01</div>
<div>VENUE</div><div>日本武道館</div>
<div>OPEN / START</div>
<div>&lt;12/31&gt; OPEN 17:00 / START 18:00 &lt;1/1&gt; OPEN 15:00 / START 16:00</div>
<div>PRICE</div><div>指定席 ¥10,000</div>
<div>TICKET</div><div>未定</div>
<div>INFORMATION</div><div>詳細後日</div>
<div>NOTICE</div><div></div>
<div>CONTACT</div><div>SOGO TOKYO</div>
</body></html>`;
const twoDay = parseSogoBudokanDetail(twoDayHtml, detailUrl);
assert.equal(twoDay.ok, true);
assert.deepEqual(twoDay.shows, [
  { date: "2026-12-31", openTime: "17:00", startTime: "18:00" },
  { date: "2027-01-01", openTime: "15:00", startTime: "16:00" },
]);

const wrongVenueHtml = detailHtml.replace("日本武道館", "東京国際フォーラム");
assert.equal(parseSogoBudokanDetail(wrongVenueHtml, detailUrl).ok, false);

console.log("SOGO TOKYO Budokan parser smoke passed");
