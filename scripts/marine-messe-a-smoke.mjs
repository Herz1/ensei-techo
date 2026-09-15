import assert from "node:assert/strict";
import { normalizeName } from "./event-ingest-lib.mjs";
import { parseMarineMesseASchedule } from "./parsers/marine-messe-a.mjs";

const knownArtistNames = new Set([
  "GENERATIONS",
  "米津玄師",
  "NEWS",
  "back number",
].map(normalizeName));

const novemberHtml = `
<html>
  <body>
    <h1>イベント情報</h1>
    <h2>2026年11月のイベント</h2>
    <ul>
      <li><a href="https://www.ldh-liveschedule.jp/sys/tour/36764/">11.3(火・祝) 16:00～ GENERATIONS LIVE TOUR 2026 ''PARALLEL QUEST''</a></li>
      <li><a href="https://reissuerecords.net/tour2026/">11.27(金) 18:30～ 11.28(土) 17:00～ 米津玄師 2026 TOUR / GHOST</a></li>
      <li><a href="https://news-project.example/live/">11.15(日) ①13:00～ ②17:30～ NEWS LIVE TOUR 2026</a></li>
      <li><a href="https://example.com/dental/">11.20(金) 10:00～ 九州デンタルショー2026</a></li>
      <li><a href="https://example.com/ice/">11.21(土) 10:00～ ディズニー・オン・アイス ”Find your gift” 福岡公演</a></li>
    </ul>
  </body>
</html>`;

const november = parseMarineMesseASchedule(
  novemberHtml,
  "https://www.marinemesse.or.jp/sp/messe/event/?mm=11&yy=2026",
  {
    year: 2026,
    month: 11,
    allowedMonths: [{ year: 2026, month: 11 }],
    knownArtistNames,
  },
);

assert.equal(november.ok, true);
assert.equal(november.records.length, 5);

const generations = november.records.find((record) => record.title.startsWith("GENERATIONS"));
assert.equal(generations?.date, "2026-11-03");
assert.equal(generations?.startTime, "16:00");
assert.deepEqual(generations?.artistNames, ["GENERATIONS"]);
assert.equal(generations?.officialEventRole, "promoter_official");

const yonezu = november.records.filter((record) => record.title.startsWith("米津玄師"));
assert.equal(yonezu.length, 2);
assert.deepEqual(yonezu.map((record) => record.date), ["2026-11-27", "2026-11-28"]);
assert.deepEqual(yonezu.map((record) => record.startTime), ["18:30", "17:00"]);
assert.deepEqual(yonezu[0]?.artistNames, ["米津玄師"]);
assert.equal(yonezu[0]?.officialEventRole, "artist_official");

const news = november.records.filter((record) => record.title.startsWith("NEWS"));
assert.equal(news.length, 2);
assert.deepEqual(news.map((record) => record.startTime), ["13:00", "17:30"]);
assert.deepEqual(news[0]?.artistNames, ["NEWS"]);

assert.equal(november.records.some((record) => /デンタル/u.test(record.title)), false);
assert.equal(november.records.some((record) => /ディズニー/u.test(record.title)), false);

const crossMonthHtml = `
<html>
  <body>
    <h2>2026年08月のイベント</h2>
    <ul>
      <li><a href="https://backnumber.info/tour2026/">8.31(月) 18:00～ 9.1(火) 17:00～ back number anti sleeps tour 2026</a></li>
    </ul>
  </body>
</html>`;

const crossMonth = parseMarineMesseASchedule(
  crossMonthHtml,
  "https://www.marinemesse.or.jp/sp/messe/event/?mm=8&yy=2026",
  {
    year: 2026,
    month: 8,
    allowedMonths: [
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ],
    knownArtistNames,
  },
);

assert.equal(crossMonth.ok, true);
assert.equal(crossMonth.records.length, 2);
assert.deepEqual(crossMonth.records.map((record) => record.date), ["2026-08-31", "2026-09-01"]);
assert.deepEqual(crossMonth.records[0]?.artistNames, ["backnumber"]);

const emptyMonth = parseMarineMesseASchedule(
  `<html><body><h2>2026年10月のイベント</h2><ul><li>Coming Soon...</li></ul></body></html>`,
  "https://www.marinemesse.or.jp/sp/messe/event/?mm=10&yy=2026",
  {
    year: 2026,
    month: 10,
    allowedMonths: [{ year: 2026, month: 10 }],
    knownArtistNames,
  },
);
assert.equal(emptyMonth.ok, true);
assert.equal(emptyMonth.records.length, 0);

const wrongMonth = parseMarineMesseASchedule(
  novemberHtml.replace("2026年11月のイベント", "イベント情報"),
  "https://www.marinemesse.or.jp/sp/messe/event/?mm=11&yy=2026",
  {
    year: 2026,
    month: 11,
    allowedMonths: [{ year: 2026, month: 11 }],
    knownArtistNames,
  },
);
assert.equal(wrongMonth.ok, false);
assert.equal(wrongMonth.records.length, 0);

console.log("Marine Messe Fukuoka A source smoke passed");
