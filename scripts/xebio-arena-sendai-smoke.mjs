import assert from "node:assert/strict";
import { parseXebioArenaSendaiProgram } from "./parsers/xebio-arena-sendai.mjs";

const sourceUrl = "https://www.xebioarena.com/program/";
const html = `
<html><body>
  <h1>イベント - ゼビオアリーナ仙台</h1>
  <a href="/program/asuto-music-park-2026-day1/">2026.09.05 (土) ASUTO MUSIC PARK 2026 開場・開演 10:00／11:00</a>
  <a href="/program/asuto-music-park-2026-day2/">2026.09.06 (日) ASUTO MUSIC PARK 2026 開場・開演 10:00／11:00</a>
  <a href="/program/tohoku-cup-2026-day1/">2026.09.12 (土) 第14回 TOHOKU CUP 2026 開場・開演 未定</a>
  <a href="/program/symphony-ing2026/">2026.09.20 (日) 西本幸弘が贈るつなぐ未来コンサート Symphony-ing2026 Supported by日本カルミック 開場・開演 14:00／15:00</a>
  <a href="/program/89ers-akita-20260926/">2026.09.26 (土) 仙台89ERS秋田ノーザンハピネッツ戦 開場・試合開始 未定</a>

  <a href="/program/bump-of-chicken-tour-2026-3/">2026.10.03 (土) BUMP OF CHICKEN TOUR 2026 開場・開演 17:00／18:00</a>
  <a href="/program/bump-of-chicken-tour-2026-4/">2026.10.04 (日) BUMP OF CHICKEN TOUR 2026 開場・開演 17:00／18:00</a>
  <a href="/program/milk-arena-tour-2026-2027-miyagi-1/">2026.10.24 (土) M!LK ARENA TOUR 2026-2027「シャカリキレボリューション」宮城公演 開場・開演 16:00／17:00</a>
  <a href="/program/milk-arena-tour-2026-2027-miyagi-2/">2026.10.25 (日) M!LK ARENA TOUR 2026-2027「シャカリキレボリューション」宮城公演 ＜1部＞開場・開演 11:30／12:30 ＜2部＞開場・開演 16:30／17:30</a>

  <a href="/program/glay-arena-tour-2026-2027-1/">2026.11.21 (土) GLAY ARENA TOUR 2026-2027“EXOFIRE” 開場・開演 16:00／17:00</a>
  <a href="/program/glay-arena-tour-2026-2027-2/">2026.11.22 (日) GLAY ARENA TOUR 2026-2027“EXOFIRE” 開場・開演 15:00／16:00</a>
  <a href="/program/mynavi-career-fair-2026/">2026.11.28 (土) マイナビインターンシップ＆キャリア発見フェア 開催時間 13:00～17:00</a>

  <a href="/program/tomohisa-yamashita-tour-2026-1/">2026.12.12 (土) TOMOHISA YAMASHITA Tour 2026 開場・開演 16:00／17:00</a>
  <a href="/program/tomohisa-yamashita-tour-2026-2/">2026.12.13 (日) TOMOHISA YAMASHITA Tour 2026 開場・開演 14:00／15:00</a>

  <a href="/program/miyamoto-hiroji-tour-2027-1/">2027.01.23 (土) 宮本浩次 TOUR 2026〜2027 I AM HERO 開場・開演 16:30／17:30</a>
  <a href="/program/rizin-landmark-14/">終了したイベントです 2026.06.06 (土) RIZIN LANDMARK 14 in SENDAI 開場・開演 13:00／15:00</a>
  <a href="/access/">2026.10.03 (土) Fake Concert 開場・開演 17:00／18:00</a>
</body></html>`;

const parsed = parseXebioArenaSendaiProgram(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
  ],
  knownArtistNames: new Set([
    "bump of chicken",
    "m!lk",
    "glay",
    "tomohisa yamashita",
    "宮本浩次",
  ]),
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 13);
assert.deepEqual(parsed.records.map((item) => [item.date, item.startTime]), [
  ["2026-09-05", "11:00"],
  ["2026-09-06", "11:00"],
  ["2026-09-20", "15:00"],
  ["2026-10-03", "18:00"],
  ["2026-10-04", "18:00"],
  ["2026-10-24", "17:00"],
  ["2026-10-25", "12:30"],
  ["2026-10-25", "17:30"],
  ["2026-11-21", "17:00"],
  ["2026-11-22", "16:00"],
  ["2026-12-12", "17:00"],
  ["2026-12-13", "15:00"],
  ["2027-01-23", "17:30"],
]);

const bump = parsed.records.find((item) => item.title.startsWith("BUMP OF CHICKEN"));
assert.ok(bump);
assert.deepEqual(bump.artistNames, ["BUMP OF CHICKEN"]);
assert.equal(
  bump.officialDetailUrl,
  "https://www.xebioarena.com/program/bump-of-chicken-tour-2026-3/",
);

const milk = parsed.records.filter((item) => item.title.startsWith("M!LK"));
assert.equal(milk.length, 3);
assert.deepEqual(milk.map((item) => item.artistNames), [["M!LK"], ["M!LK"], ["M!LK"]]);
assert.deepEqual(milk.slice(1).map((item) => [item.openTime, item.startTime]), [
  ["11:30", "12:30"],
  ["16:30", "17:30"],
]);

const glay = parsed.records.filter((item) => item.title.startsWith("GLAY"));
assert.equal(glay.length, 2);
assert.deepEqual(glay[0].artistNames, ["GLAY"]);

const yamashita = parsed.records.filter((item) => item.title.startsWith("TOMOHISA YAMASHITA"));
assert.equal(yamashita.length, 2);
assert.deepEqual(yamashita[0].artistNames, ["TOMOHISA YAMASHITA"]);

const miyamoto = parsed.records.find((item) => item.title.startsWith("宮本浩次"));
assert.ok(miyamoto);
assert.deepEqual(miyamoto.artistNames, ["宮本浩次"]);

assert.equal(parsed.records.some((item) => /TOHOKU CUP|仙台89ERS|キャリア発見フェア|RIZIN/u.test(item.title)), false);
assert.equal(parsed.records.some((item) => item.title === "Fake Concert"), false);

const outOfWindow = parseXebioArenaSendaiProgram(html, sourceUrl, {
  months: [{ year: 2027, month: 5 }],
});
assert.equal(outOfWindow.ok, true);
assert.deepEqual(outOfWindow.records, []);

const malformed = parseXebioArenaSendaiProgram(
  "<html><body>broken</body></html>",
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Xebio Arena Sendai source smoke: ok");
