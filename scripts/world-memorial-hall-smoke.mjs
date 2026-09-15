import assert from "node:assert/strict";
import { parseWorldMemorialHallMonth } from "./parsers/world-memorial-hall.mjs";

const octoberUrl = "https://www.kobe-spokyo.jp/world-kobe/cal_event?ym=202610";
const octoberHtml = `
<html><body>
  <h1>イベントカレンダー</h1>
  <div>ホールイベント情報</div>
  <div>イベント名 開催日/開演時間 お問い合わせ先 対象 備考</div>
  <ul>
    <li>
      ETHICS FAN MEETING 2026、秋。
      10月4日(日)10:00～
      <a href="https://rinri-project.jp/">実践倫理宏正会</a> 06-6353-8521
    </li>
    <li>
      BALLISTIK BOYZ ARENA LIVE 2026 &quot;BEAT BLAST Z&quot; ~Our Place~
      10月17日(土)17:00～10月18日(日)16:00～
      <a href="https://www.sound-c.co.jp/">サウンドクリエーター （平日 12:00〜15:00）</a>
      <a href="https://www.ldh.co.jp/management/ballistik_boyz/">ｱｰﾃｨｽﾄ ｵﾌｨｼｬﾙｻｲﾄ</a>
    </li>
    <li>
      浦島坂田船
      10月24日(土)18:00～10月25日(日)16:00～
      <a href="https://www.urashimasakatasen.com/">アーティスト オフィシャルサイト</a>
    </li>
    <li>
      CUTIE STREET JAPAN ARENA TOUR 2026-AUTUMN
      10月31日(土)11月1日(日)
      <a href="https://kyodo-osaka.co.jp/">キョードーインフォメーション（12:00〜17:00 土日祝休業）</a>
      <a href="https://cutiestreet.asobisystem.com/">ｱｰﾃｨｽﾄ ｵﾌｨｼｬﾙｻｲﾄ</a>
    </li>
  </ul>
</body></html>`;

const known = new Set([
  "ballistik boyz",
  "浦島坂田船",
  "cutie street",
  "ko1keyz",
  "me:i",
]);

const october = parseWorldMemorialHallMonth(octoberHtml, octoberUrl, {
  year: 2026,
  month: 10,
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
  knownArtistNames: known,
});
assert.equal(october.ok, true);
assert.deepEqual(october.records.map((item) => [item.date, item.startTime]), [
  ["2026-10-17", "17:00"],
  ["2026-10-18", "16:00"],
  ["2026-10-24", "18:00"],
  ["2026-10-25", "16:00"],
  ["2026-10-31", undefined],
  ["2026-11-01", undefined],
]);
assert.equal(october.records.some((item) => item.startTime === "12:00"), false);
assert.equal(october.records.some((item) => item.title.startsWith("ETHICS")), false);

const ballistik = october.records.find((item) => item.title.startsWith("BALLISTIK"));
assert.ok(ballistik);
assert.deepEqual(ballistik.artistNames, ["BALLISTIK BOYZ"]);
assert.equal(ballistik.promoterUrl, "https://www.sound-c.co.jp/");
assert.equal(ballistik.artistOfficialUrl, "https://www.ldh.co.jp/management/ballistik_boyz/");

const septemberUrl = "https://www.kobe-spokyo.jp/world-kobe/cal_event?ym=202609";
const septemberHtml = `
<html><body>
  <h1>イベントカレンダー</h1><div>ホールイベント情報</div>
  <div>イベント名 開催日/開演時間 お問い合わせ先 対象 備考</div>
  <ul>
    <li>
      2026 1ST FAN MEETING KO1KEYZ
      9月9日(水)13:30～18:30～9月10日(木)13:30～18:30～
      <a href="https://kyodo-osaka.co.jp/">ｷｮｰﾄﾞｰｲﾝﾌｫﾒｰｼｮﾝ （12:00〜17:00 土日祝休業）</a>
      <a href="https://shinsekai.produce101.jp/">ｱｰﾃｨｽﾄ ｵﾌｨｼｬﾙｻｲﾄ</a>
    </li>
    <li>
      2026 ME:I 2ND ARENA LIVE TOUR &quot;ME:I WAY&quot;
      9月12日(土)17:00～9月13日(日)15:00～
      <a href="https://kyodo-osaka.co.jp/">キョードーインフォメーション</a>
      <a href="https://me-i.jp/">アーティスト オフィシャルサイト</a>
    </li>
    <li>
      日本公演40周年ディズニー・オン・アイス “LET'S PARTY！”
      9月19日(土)10:00～14:00～18:00～9月20日(日)10:00～14:00～18:00～
      <a href="https://www.ctv.co.jp/disneyonice/">ディズニー・オン・アイス関西公演事務局</a>
    </li>
  </ul>
</body></html>`;

const september = parseWorldMemorialHallMonth(septemberHtml, septemberUrl, {
  year: 2026,
  month: 9,
  months: [{ year: 2026, month: 9 }],
  knownArtistNames: known,
});
assert.equal(september.ok, true);
assert.deepEqual(september.records.map((item) => [item.date, item.startTime]), [
  ["2026-09-09", "13:30"],
  ["2026-09-09", "18:30"],
  ["2026-09-10", "13:30"],
  ["2026-09-10", "18:30"],
  ["2026-09-12", "17:00"],
  ["2026-09-13", "15:00"],
]);
assert.equal(september.records.some((item) => /ディズニー/u.test(item.title)), false);
assert.deepEqual(september.records[0].artistNames, ["KO1KEYZ"]);

const decemberHtml = `
<html><body>
  <h1>イベントカレンダー</h1><div>ホールイベント情報</div>
  <div>イベント名 開催日/開演時間 お問い合わせ先 対象 備考</div>
  <ul><li>
    TEST ARTIST LIVE TOUR 2026-2027
    12月31日(木)18:00～1月1日(金)15:00～
    <a href="https://example.com/artist">アーティスト オフィシャルサイト</a>
  </li></ul>
</body></html>`;
const crossYear = parseWorldMemorialHallMonth(
  decemberHtml,
  "https://www.kobe-spokyo.jp/world-kobe/cal_event?ym=202612",
  {
    year: 2026,
    month: 12,
    months: [
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ],
  },
);
assert.deepEqual(crossYear.records.map((item) => item.date), ["2026-12-31", "2027-01-01"]);

const malformed = parseWorldMemorialHallMonth(
  "<html><body>broken</body></html>",
  octoberUrl,
  { year: 2026, month: 10, months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("World Memorial Hall source smoke: ok");
