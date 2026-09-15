import assert from "node:assert/strict";
import {
  parseBigHatNaganoDetail,
  parseBigHatNaganoIndex,
} from "./parsers/big-hat-nagano.mjs";

const sourceUrl = "https://www.nagano-mwave.co.jp/bighat/topics/event/";
const months = [
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
  { year: 2026, month: 11 },
];

const indexHtml = `
<html><body>
  <header>長野市多目的スポーツアリーナ ビッグハット</header>
  <h1>イベント</h1>
  <article><a href="/bighat/topics/2025/12/boynextdoor.php">9/25（金）9/26（土）BOYNEXTDOOR TOUR 'KNOCK ON Vol.2' IN JAPAN</a></article>
  <article><a href="/bighat/topics/2025/12/generations.php">10/31（土）GENERATIONS LIVE TOUR 2026 PARALLEL QUEST</a></article>
  <article><a href="/bighat/topics/2025/12/yonezu.php">11/6（金）11/7（土）米津玄師2026 TOUR / GHOST</a></article>
  <article><a href="/bighat/topics/2025/11/mrs.php">11/18（水）11/19（木）Mrs. GREEN APPLE Ringo Jam Tour SHADOWS</a></article>
  <article><a href="/bighat/topics/2025/12/industry.php">10/23（金）10/24（土）産業フェア in 信州 2026</a></article>
  <article><a href="/bighat/topics/2025/12/job.php">10/25（日）マイナビ インターンシップ＆キャリア発見フェア</a></article>
</body></html>`;

const discovered = parseBigHatNaganoIndex(indexHtml, sourceUrl);
assert.equal(discovered.ok, true);
assert.deepEqual(discovered.links.map((item) => item.url), [
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/boynextdoor.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/generations.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/yonezu.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/11/mrs.php",
]);

const boyHtml = `
<html><body>
  <div>ビッグハット</div><div>イベント</div>
  <h4>9/25（金）9/26（土）BOYNEXTDOOR TOUR 'KNOCK ON Vol.2' IN JAPAN</h4>
  <table>
    <tr><th>日程</th><td>9/25（金） 開場17：00 開演18：00<br>9/26（土） 開場15：00 開演16：00</td></tr>
    <tr><th>入場料</th><td>有料</td></tr>
    <tr><th>公式HP</th><td><a href="https://boynextdoor-official.jp/news/example">公式HP</a></td></tr>
    <tr><th>チケットについて</th><td><a href="https://www.kyodo-hokuriku.co.jp/artist/11640">チケットについて</a></td></tr>
  </table>
</body></html>`;
const boy = parseBigHatNaganoDetail(
  boyHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/boynextdoor.php",
  { months },
);
assert.equal(boy.ok, true);
assert.deepEqual(boy.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-09-25", "17:00", "18:00"],
  ["2026-09-26", "15:00", "16:00"],
]);
assert.deepEqual(boy.records[0].artistNames, ["BOYNEXTDOOR"]);
assert.equal(boy.records[0].artistOfficialUrl, "https://boynextdoor-official.jp/news/example");
assert.equal(boy.records[0].ticketInfoUrl, "https://www.kyodo-hokuriku.co.jp/artist/11640");

const yonezuHtml = `
<html><body>
  <div>ビッグハット</div><div>イベント</div>
  <h4>11/6（金）11/7（土）米津玄師2026 TOUR / GHOST</h4>
  <table>
    <tr><th>日時</th><td>11/6（金） 開場17：00 開演18：30<br>11/7（土） 開場15：30 開演17：00</td></tr>
    <tr><th>入場料</th><td>有料</td></tr>
    <tr><th>公式HP</th><td><a href="https://reissuerecords.net/example">公式HP</a></td></tr>
    <tr><th>チケットについて</th><td><a href="https://www.kyodo-hokuriku.co.jp/artist/11697">チケット</a></td></tr>
  </table>
</body></html>`;
const yonezu = parseBigHatNaganoDetail(
  yonezuHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/yonezu.php",
  { months },
);
assert.equal(yonezu.ok, true);
assert.deepEqual(yonezu.records[0].artistNames, ["米津玄師"]);
assert.deepEqual(yonezu.records.map((item) => item.date), ["2026-11-06", "2026-11-07"]);

const mrsHtml = `
<html><body>
  <div>ビッグハット</div><div>イベント</div>
  <h4>11/18（水）11/19（木）Mrs. GREEN APPLE Ringo Jam Tour "SHADOWS"</h4>
  <table>
    <tr><th>日程</th><td>11/18（水） 開場17：00 開演18：00<br>11/19（木） 開場17：00 開演18：00</td></tr>
    <tr><th>入場料</th><td>有料</td></tr>
    <tr><th>公式HP</th><td><a href="https://mrsgreenapple.com/news/detail/22677">公式HP</a></td></tr>
  </table>
</body></html>`;
const mrs = parseBigHatNaganoDetail(
  mrsHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/11/mrs.php",
  { months },
);
assert.equal(mrs.ok, true);
assert.deepEqual(mrs.records[0].artistNames, ["Mrs. GREEN APPLE"]);

const nonMusic = parseBigHatNaganoDetail(
  `<html><body><div>ビッグハット イベント</div><h4>10/23（金）10/24（土）産業フェア in 信州 2026</h4><table><tr><th>日程</th><td>10/23（金） 開場10:00 開演10:00</td></tr></table></body></html>`,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/industry.php",
  { months },
);
assert.equal(nonMusic.ok, false);

const shifted = parseBigHatNaganoDetail(boyHtml, "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/boynextdoor.php", {
  months: [{ year: 2027, month: 9 }],
});
assert.equal(shifted.ok, true);
assert.deepEqual(shifted.records.map((item) => item.date), ["2027-09-25", "2027-09-26"]);

const malformed = parseBigHatNaganoIndex("<html><body>broken</body></html>", sourceUrl);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.links, []);

console.log("Big Hat Nagano source smoke: ok");
