import assert from "node:assert/strict";
import {
  parseAnabukiArenaDetail,
  parseAnabukiArenaScheduleLinks,
} from "./parsers/anabuki-arena-kagawa.mjs";

const sourceUrl = "https://kagawa-arena.com/";
const known = new Set([
  "なにわ男子",
  "mrs green apple",
  "bump of chicken",
  "櫻坂46",
]);

const scheduleHtml = `
<html><body>
  <header>あなぶきアリーナ香川</header>
  <h2>EVENT</h2>
  <ul>
    <li><a href="/event/1250/">〖なにわ男子〗なにわ男子 LIVE TOUR 2026 「ND⁵」</a><span>9.19土9.21月</span><span>メインアリーナ</span></li>
    <li><a href="/event/1392/">〖Mrs. GREEN APPLE〗Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</a><span>9.30水10.1木</span><span>メインアリーナ</span></li>
    <li><a href="/event/1374/">〖BUMP OF CHICKEN〗BUMP OF CHICKEN TOUR 2026-2027 Ratio Clavis</a><span>11.21土11.22日</span><span>メインアリーナ</span></li>
    <li><a href="/event/1400/">りそなグループ B.LEAGUE 香川ファイブアローズ vs 福岡</a><span>10.3土10.4日</span><span>メインアリーナ</span></li>
    <li><a href="/event/1401/">〖ディズニー・オン・アイス〗日本公演40周年記念</a><span>9.11金9.13日</span><span>メインアリーナ</span></li>
    <li><a href="/event/1402/">プラセール フットサルスクール</a><span>9.16水</span><span>サブアリーナ</span></li>
    <li><a href="/news/999/">BUMP OF CHICKEN LIVE NEWS</a><span>メインアリーナ</span></li>
  </ul>
</body></html>`;

const discovered = parseAnabukiArenaScheduleLinks(scheduleHtml, sourceUrl, {
  knownArtistNames: known,
});
assert.equal(discovered.ok, true);
assert.deepEqual(discovered.links.map((item) => item.url), [
  "https://kagawa-arena.com/event/1250/",
  "https://kagawa-arena.com/event/1392/",
  "https://kagawa-arena.com/event/1374/",
]);

const naniwaHtml = `
<html><body>
  <div>あなぶきアリーナ香川</div><div>イベント</div><div>9.19土 9.21月</div><div>メインアリーナ</div>
  <h1>〖なにわ男子〗なにわ男子 LIVE TOUR 2026 「ND⁵」</h1>
  <h2>開演時間</h2>
  <p>2026年9月19日（土） ①13：30/②18：00</p>
  <p>2026年9月20日（日） ①13：00/②17：30</p>
  <p>2026年9月21日（月・祝） ①14：00</p>
  <h2>公式サイト</h2><p><a href="https://starto.jp/s/p/live/10489">https://starto.jp/s/p/live/10489</a></p>
  <h2>お問い合わせ</h2><p>ファミリークラブ <a href="https://www.familyclub.jp/">https://www.familyclub.jp/</a></p>
</body></html>`;
const naniwa = parseAnabukiArenaDetail(
  naniwaHtml,
  "https://kagawa-arena.com/event/1250/",
  { months: [{ year: 2026, month: 9 }], knownArtistNames: known },
);
assert.equal(naniwa.ok, true);
assert.deepEqual(naniwa.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-09-19", undefined, "13:30"],
  ["2026-09-19", undefined, "18:00"],
  ["2026-09-20", undefined, "13:00"],
  ["2026-09-20", undefined, "17:30"],
  ["2026-09-21", undefined, "14:00"],
]);
assert.deepEqual(naniwa.records[0].artistNames, ["なにわ男子"]);
assert.equal(naniwa.records[0].artistOfficialUrl, "https://starto.jp/s/p/live/10489");
assert.equal(naniwa.records[0].promoterUrl, "https://www.familyclub.jp/");

const mrsHtml = `
<html><body>
  <div>あなぶきアリーナ香川</div><div>イベント</div><div>9.30水 10.1木</div><div>メインアリーナ</div>
  <h1>〖Mrs. GREEN APPLE〗Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</h1>
  <h2>開場時間</h2><div>2026年9月30日(水)17:00<br>2026年10月1日(木)17:00</div>
  <h2>開演時間</h2><div>2026年9月30日(水)18:00<br>2026年10月1日(木)18:00</div>
  <h2>料金</h2><div><span>指定席　15,000円(税込)</span><br><span>着席指定席　15,000円(税込)</span></div>
  <h2>公式サイト</h2><p><a href="https://mrsgreenapple.com/">https://mrsgreenapple.com/</a></p>
  <h2>お問い合わせ</h2><p>デューク高松 087-822-2520（平日11:00～17:00）</p>
</body></html>`;
const mrs = parseAnabukiArenaDetail(
  mrsHtml,
  "https://kagawa-arena.com/event/1392/",
  {
    months: [
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ],
    knownArtistNames: known,
  },
);
assert.equal(mrs.ok, true);
assert.deepEqual(mrs.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-09-30", "17:00", "18:00"],
  ["2026-10-01", "17:00", "18:00"],
]);
assert.deepEqual(mrs.records[0].pricesJpy, [15000]);
assert.deepEqual(mrs.records[0].ticketTypes.map((item) => item.name), ["指定席", "着席指定席"]);
assert.equal(mrs.records[0].artistOfficialUrl, "https://mrsgreenapple.com/");

const bumpHtml = `
<html><body>
  <div>あなぶきアリーナ香川</div><div>11.21土 11.22日</div><div>メインアリーナ</div>
  <h1>〖BUMP OF CHICKEN〗BUMP OF CHICKEN TOUR 2026-2027 Ratio Clavis</h1>
  <h2>開場時間</h2><div>2026年11月21日(土) 開場/17:00<br>2026年11月22日(日) 開場/17:00</div>
  <h2>開演時間</h2><div>2026年11月21日(土) 開演/18:00<br>2026年11月22日(日) 開演/18:00</div>
  <h2>料金</h2>
  <div>アリーナS指定：16,500円（税込）<br>スタンドA指定：13,200円（税込）<br>スタンドA着席指定：13,200円（税込）<br>スタンドBステージサイド指定：8,800円（税込）</div>
  <h2>公式サイト</h2><p><a href="https://www.bumpofchicken.com/">https://www.bumpofchicken.com/</a></p>
  <h2>お問い合わせ</h2><p>YUMEBANCHI（岡山） 086-231-3531（平日 12:00～17:00）</p>
</body></html>`;
const bump = parseAnabukiArenaDetail(
  bumpHtml,
  "https://kagawa-arena.com/event/1374/",
  { months: [{ year: 2026, month: 11 }], knownArtistNames: known },
);
assert.equal(bump.ok, true);
assert.deepEqual(bump.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-11-21", "17:00", "18:00"],
  ["2026-11-22", "17:00", "18:00"],
]);
assert.deepEqual(bump.records[0].pricesJpy, [8800, 13200, 16500]);
assert.equal(bump.records[0].ticketTypes.length, 4);

const sportsDetail = parseAnabukiArenaDetail(
  `<html><body><div>あなぶきアリーナ香川</div><div>メインアリーナ</div><h1>香川ファイブアローズ B.LEAGUE リーグ戦</h1><h2>開演時間</h2><p>2026年10月3日(土)19:00</p></body></html>`,
  "https://kagawa-arena.com/event/1400/",
  { months: [{ year: 2026, month: 10 }], knownArtistNames: known },
);
assert.equal(sportsDetail.ok, false);

const outOfWindow = parseAnabukiArenaDetail(
  mrsHtml,
  "https://kagawa-arena.com/event/1392/",
  { months: [{ year: 2026, month: 12 }], knownArtistNames: known },
);
assert.equal(outOfWindow.ok, false);

const malformed = parseAnabukiArenaScheduleLinks("<html><body>broken</body></html>", sourceUrl);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.links, []);

console.log("Anabuki Arena Kagawa source smoke: ok");
