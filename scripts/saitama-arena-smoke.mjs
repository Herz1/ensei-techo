import assert from "node:assert/strict";
import {
  parseSaitamaArenaDetail,
  parseSaitamaArenaScheduleIndex,
} from "./parsers/saitama-arena.mjs";

const sourceUrl = "https://www.saitama-arena.co.jp/schedule/2027/05/";
const indexHtml = `
  <html><body>
    <h1>2027年5月のイベント</h1>
    <article>
      <a href="/schedule/test-live/">Test Artist LIVE TOUR 2027</a>
      <p>開催日 2027/05/03</p>
      <p>コンサート・ショー</p>
      <p>会場タイプ メインアリーナ</p>
    </article>
    <article>
      <a href="/schedule/exhibition/">展示イベント</a>
      <p>開催日 2027/05/04</p>
      <p>物販・展示会</p>
      <p>会場タイプ 展示ホール</p>
    </article>
    <article>
      <a href="/schedule/toiro-event/">TOIRO Event</a>
      <p>開催日 2027/05/05</p>
      <p>コンサート・ショー</p>
      <p>会場タイプ TOIRO</p>
    </article>
  </body></html>
`;

const index = parseSaitamaArenaScheduleIndex(indexHtml, sourceUrl, {
  year: 2027,
  month: 5,
});
assert.equal(index.ok, true);
assert.equal(index.events.length, 1, "大型 Arena 以外を混入しない");
assert.equal(index.events[0].venueType, "メインアリーナ");
assert.equal(index.events[0].url, "https://www.saitama-arena.co.jp/schedule/test-live/");

const wrongMonth = parseSaitamaArenaScheduleIndex(
  indexHtml.replace("2027年5月のイベント", "2027年4月のイベント"),
  sourceUrl,
  { year: 2027, month: 5 },
);
assert.equal(wrongMonth.ok, false, "月度页面错配必须失败而不是静默导入");

const detail = parseSaitamaArenaDetail(`
  <html><body>
    <h1>Test Artist LIVE TOUR 2027</h1>
    <h2>開催日</h2>
    <p>2027/05/03 ～ 2027/05/04</p>
    <p>3日(月) 開場 16:00 開演 18:00</p>
    <p>4日(火) 開場 15:00 開演 17:00</p>
    <h2>開催場所</h2>
    <p>メインアリーナ</p>
    <h2>イベント詳細</h2>
    <p>未就学児童入場不可</p>
    <a href="https://eplus.jp/test-artist/">チケット</a>
  </body></html>
`, "https://www.saitama-arena.co.jp/schedule/test-live/");
assert.equal(detail.ok, true);
assert.deepEqual(detail.artistNames, ["Test Artist"]);
assert.deepEqual(detail.shows, [
  { date: "2027-05-03", openTime: "16:00", startTime: "18:00" },
  { date: "2027-05-04", openTime: "15:00", startTime: "17:00" },
]);
assert.deepEqual(detail.purchaseUrls, ["https://eplus.jp/test-artist/"]);
assert.equal(detail.eligibility[0].label, "未就学児童入場不可");

const smallVenueDetail = parseSaitamaArenaDetail(`
  <html><body>
    <h1>Small Event</h1>
    <h2>開催日</h2><p>2027/05/06</p>
    <h2>開催場所</h2><p>TOIRO</p>
  </body></html>
`, "https://www.saitama-arena.co.jp/schedule/small-event/");
assert.equal(smallVenueDetail.ok, false, "TOIRO をさいたまスーパーアリーナ本体として扱わない");

console.log("Saitama arena source smoke passed");
