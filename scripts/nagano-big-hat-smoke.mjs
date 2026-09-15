import assert from "node:assert/strict";
import {
  parseNaganoBigHatDetail,
  parseNaganoBigHatScheduleLinks,
} from "./parsers/nagano-big-hat.mjs";

const sourceUrl = "https://www.nagano-mwave.co.jp/bighat/topics/event/";
const known = new Set([
  "boynextdoor",
  "generations",
  "米津玄師",
  "mrsgreenapple",
]);

const indexHtml = `
<html><body>
  <header>ビッグハット</header><h1>トピックス</h1><h2>イベント</h2>
  <ul>
    <li><a href="/bighat/topics/2025/12/boynextdoor.php">9/25（金）・26（土） BOYNEXTDOOR TOUR 'KNOCK ON Vol.1' IN JAPAN</a></li>
    <li><a href="/bighat/topics/2025/12/generations.php">10/31（土） GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</a></li>
    <li><a href="/bighat/topics/2026/01/yonezu.php">11/6（金）・7（土） 『米津玄師 2026 TOUR / GHOST』</a></li>
    <li><a href="/bighat/topics/2026/01/mrs.php">11/18（水）・19（木） Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</a></li>
    <li><a href="/bighat/topics/2026/01/robot.php">全国高等学校ロボットコンテスト</a></li>
    <li><a href="/bighat/topics/2026/01/marching.php">全日本マーチングコンテスト</a></li>
    <li><a href="/bighat/topics/2026/01/welding.php">ウェルディングフェスタ</a></li>
    <li><a href="/bighat/topics/2026/01/intern.php">インターンシップ・キャリア発見フェア</a></li>
    <li><a href="/bighat/topics/event/">イベント一覧</a></li>
  </ul>
</body></html>`;

const discovered = parseNaganoBigHatScheduleLinks(indexHtml, sourceUrl, {
  knownArtistNames: known,
});
assert.equal(discovered.ok, true);
assert.deepEqual(discovered.links.map((item) => item.url), [
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/boynextdoor.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/generations.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2026/01/yonezu.php",
  "https://www.nagano-mwave.co.jp/bighat/topics/2026/01/mrs.php",
]);

const generationsHtml = `
<html><body>
  <header>ビッグハット</header><nav>トピックス イベント</nav>
  <h4>10/31（土）GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</h4>
  <p>GENERATIONS LIVE TOUR 2026 “PARALLEL QUEST”</p>
  <dl>
    <dt>日時</dt><dd>10/31（土） 開場16：00　開演17：00</dd>
    <dt>入場料</dt><dd>有料</dd>
    <dt>公式HP</dt><dd><a href="https://www.ldh-liveschedule.jp/sys/tour/37148/">公式HP</a></dd>
    <dt>チケットについて</dt><dd><a href="https://www.kyodo-hokuriku.co.jp/artist/11707">キョードー北陸</a></dd>
  </dl>
</body></html>`;
const generations = parseNaganoBigHatDetail(
  generationsHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/generations.php",
  {
    months: [
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ],
    knownArtistNames: known,
  },
);
assert.equal(generations.ok, true);
assert.equal(generations.records[0].date, "2026-10-31");
assert.equal(generations.records[0].openTime, "16:00");
assert.equal(generations.records[0].startTime, "17:00");
assert.deepEqual(generations.records[0].artistNames, ["GENERATIONS"]);
assert.equal(generations.records[0].artistOfficialUrl, "https://www.ldh-liveschedule.jp/sys/tour/37148/");
assert.equal(generations.records[0].ticketInfoUrl, "https://www.kyodo-hokuriku.co.jp/artist/11707");

const boynextdoorHtml = `
<html><body>
  <header>ビッグハット</header><nav>トピックス イベント</nav>
  <h4>9/25（金）・26（土） BOYNEXTDOOR TOUR 'KNOCK ON Vol.1' IN JAPAN</h4>
  <p>BOYNEXTDOOR TOUR 'KNOCK ON Vol.1' IN JAPAN</p>
  <dl>
    <dt>日程</dt><dd>9/25（金） 開場17:00 開演18:00<br>9/26（土） 開場15:00 開演16:00</dd>
    <dt>入場料</dt><dd>有料</dd>
    <dt>公式HP</dt><dd><a href="https://boynextdoor-official.jp/">BOYNEXTDOOR Official</a></dd>
    <dt>チケットについて</dt><dd><a href="https://www.kyodo-hokuriku.co.jp/artist/11699">キョードー北陸</a></dd>
  </dl>
</body></html>`;
const boynextdoor = parseNaganoBigHatDetail(
  boynextdoorHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/boynextdoor.php",
  {
    months: [
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ],
    knownArtistNames: known,
  },
);
assert.equal(boynextdoor.ok, true);
assert.deepEqual(boynextdoor.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-09-25", "17:00", "18:00"],
  ["2026-09-26", "15:00", "16:00"],
]);
assert.deepEqual(boynextdoor.records[0].artistNames, ["BOYNEXTDOOR"]);

const yonezuHtml = `
<html><body>
  <header>ビッグハット</header><nav>トピックス イベント</nav>
  <h4>11/6（金）・7（土）『米津玄師 2026 TOUR / GHOST』</h4>
  <p>米津玄師 2026 TOUR / GHOST</p>
  <dl>
    <dt>日時</dt><dd>11/6（金） 開場17:00 開演18:30<br>11/7（土） 開場15:30 開演17:00</dd>
    <dt>入場料</dt><dd>有料</dd>
    <dt>公式HP</dt><dd><a href="https://reissuerecords.net/">REISSUE RECORDS</a></dd>
    <dt>チケットについて</dt><dd><a href="https://www.kyodo-hokuriku.co.jp/artist/11698">キョードー北陸</a></dd>
  </dl>
</body></html>`;
const yonezu = parseNaganoBigHatDetail(
  yonezuHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2026/01/yonezu.php",
  { months: [{ year: 2026, month: 11 }], knownArtistNames: known },
);
assert.equal(yonezu.ok, true);
assert.deepEqual(yonezu.records.map((item) => [item.date, item.startTime]), [
  ["2026-11-06", "18:30"],
  ["2026-11-07", "17:00"],
]);
assert.deepEqual(yonezu.records[0].artistNames, ["米津玄師"]);

const mrsHtml = `
<html><body>
  <header>ビッグハット</header><nav>トピックス イベント</nav>
  <h4>11/18（水）・19（木） Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</h4>
  <p>Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</p>
  <dl>
    <dt>日時</dt><dd>11/18（水） 開場17:00 開演18:00<br>11/19（木） 開場17:00 開演18:00</dd>
    <dt>入場料</dt><dd>有料</dd>
    <dt>公式HP</dt><dd><a href="https://mrsgreenapple.com/">Mrs. GREEN APPLE</a></dd>
  </dl>
</body></html>`;
const mrs = parseNaganoBigHatDetail(
  mrsHtml,
  "https://www.nagano-mwave.co.jp/bighat/topics/2026/01/mrs.php",
  { months: [{ year: 2026, month: 11 }], knownArtistNames: known },
);
assert.equal(mrs.ok, true);
assert.deepEqual(mrs.records[0].artistNames, ["Mrs. GREEN APPLE"]);
assert.deepEqual(mrs.records.map((item) => item.date), ["2026-11-18", "2026-11-19"]);

const conflictingYears = parseNaganoBigHatDetail(generationsHtml, "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/generations.php", {
  months: [
    { year: 2026, month: 10 },
    { year: 2027, month: 10 },
  ],
  knownArtistNames: known,
});
assert.equal(conflictingYears.ok, false);

const outOfWindow = parseNaganoBigHatDetail(generationsHtml, "https://www.nagano-mwave.co.jp/bighat/topics/2025/12/generations.php", {
  months: [{ year: 2026, month: 12 }],
  knownArtistNames: known,
});
assert.equal(outOfWindow.ok, false);

const malformed = parseNaganoBigHatScheduleLinks("<html><body>broken</body></html>", sourceUrl);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.links, []);

console.log("Nagano Big Hat source smoke: ok");
