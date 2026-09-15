import assert from "node:assert/strict";
import { parsePremistDomeEventList } from "./parsers/premist-dome.mjs";

const sourceUrl = "https://www.sapporo-dome.co.jp/eventlist/";
const html = `
<html><body>
  <h1>イベントリスト</h1><p>大和ハウス プレミストドーム</p>

  <ul>
    <li>
      <a href="/schedule/detail/?date=20260921">2026/09/21 HBA Special Night 道新・秋華火</a>
      <p>2026/09/21(月・祝)</p><p>イベント</p>
      <h3>HBA Special Night 道新・秋華火</h3>
      <p>開場時刻 16:00</p><p>開始時刻 19:00</p>
      <p>お問い合わせ：<a href="https://moula.jp/hanabi/">大会事務局</a></p>
      <p><a href="https://moula.jp/hanabi/">公式サイト</a></p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20260926">2026/09/26 SBI MUSIC CIRCUS HOKKAIDO 第一部</a>
      <p>2026/09/26(土)</p><p>イベント</p>
      <h3>SBI MUSIC CIRCUS HOKKAIDO 第一部</h3>
      <p>開場時刻 12:00</p><p>開始時刻 13:00</p>
      <p>お問い合わせ：株式会社SBI MUSIC CIRCUS</p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20260926">2026/09/26 SBI MUSIC CIRCUS HOKKAIDO 第二部</a>
      <p>2026/09/26(土)</p><p>イベント</p>
      <h3>SBI MUSIC CIRCUS HOKKAIDO 第二部</h3>
      <p>開場時刻 22:00</p><p>開始時刻 22:00</p>
      <p>お問い合わせ：株式会社SBI MUSIC CIRCUS</p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20261024">2026/10/24 Number_i LIVE TOUR No.Ⅲ</a>
      <p>2026/10/24(土)</p><p>コンサート</p>
      <h3>Number_i LIVE TOUR No.Ⅲ</h3>
      <p>開始時刻 16:00</p>
      <p>お問い合わせ：<a href="https://musicfun.co.jp/">ミュージックファン</a></p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20261030">2026/10/30 Snow Man DOME TOUR 2026-2027 ALL SUITE</a>
      <p>2026/10/30(金)</p><p>コンサート</p>
      <h3>Snow Man DOME TOUR 2026-2027 ALL SUITE</h3>
      <p>開始時刻 17:00</p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20261114">2026/11/14 YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027 “超惑星”</a>
      <p>2026/11/14(土)</p><p>コンサート</p>
      <h3>YOASOBI ASIA 10-CITY DOME &amp; STADIUM TOUR 2026-2027 “超惑星”</h3>
      <p>開場時刻 15:30</p><p>開始時刻 18:00</p>
      <p>リンク <a href="https://www.yoasobi-music.jp/">公式サイト</a></p>
      <p>お問い合わせ：<a href="https://wess.jp/">WESS</a></p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20261107">2026/11/07 第105回全国高等学校サッカー選手権大会 北海道大会 準決勝</a>
      <p>2026/11/07(土)</p><p>サッカー</p>
      <h3>第105回全国高等学校サッカー選手権大会 北海道大会 準決勝</h3>
      <p>開始時刻 未定</p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20261121">2026/11/21 コープさっぽろ 食べる・たいせつフェスティバル2026</a>
      <p>2026/11/21(土)</p><p>イベント</p>
      <h3>コープさっぽろ 食べる・たいせつフェスティバル2026</h3>
      <p>開始時刻 10:00</p>
    </li>
    <li>
      <a href="/schedule/detail/?date=20270110">2027/01/10 Bruno Mars – The Romantic Tour in Japan</a>
      <p>2027/01/10(日)</p><p>コンサート</p>
      <h3>Bruno Mars – The Romantic Tour in Japan</h3>
      <p>開場時刻 14:00</p><p>開始時刻 16:00</p>
      <p>お問い合わせ：<a href="https://musicfun.co.jp/">ミュージックファン</a></p>
    </li>
  </ul>
</body></html>`;

const parsed = parsePremistDomeEventList(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2027, month: 1 },
  ],
  knownArtistNames: new Set(["number_i", "snow man", "yoasobi", "bruno mars"]),
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 6);
assert.deepEqual(parsed.records.map((item) => [item.date, item.startTime]), [
  ["2026-09-26", "13:00"],
  ["2026-09-26", "22:00"],
  ["2026-10-24", "16:00"],
  ["2026-10-30", "17:00"],
  ["2026-11-14", "18:00"],
  ["2027-01-10", "16:00"],
]);
assert.equal(parsed.records[0].category, "イベント");
assert.equal(parsed.records[1].category, "イベント");

const numberI = parsed.records.find((item) => item.title.startsWith("Number_i"));
assert.ok(numberI);
assert.equal(numberI.openTime, undefined);
assert.deepEqual(numberI.artistNames, ["Number_i"]);
assert.equal(numberI.promoterUrl, "https://musicfun.co.jp/");

const yoasobi = parsed.records.find((item) => item.title.startsWith("YOASOBI"));
assert.ok(yoasobi);
assert.deepEqual(yoasobi.artistNames, ["YOASOBI"]);
assert.equal(yoasobi.openTime, "15:30");
assert.equal(yoasobi.officialEventUrl, "https://www.yoasobi-music.jp/");
assert.equal(yoasobi.promoterUrl, "https://wess.jp/");
assert.equal(
  yoasobi.officialDetailUrl,
  "https://www.sapporo-dome.co.jp/schedule/detail/?date=20261114",
);

const bruno = parsed.records.find((item) => item.title.startsWith("Bruno Mars"));
assert.ok(bruno);
assert.deepEqual(bruno.artistNames, ["Bruno Mars"]);
assert.equal(parsed.records.some((item) => /秋華火|サッカー|食べる・たいせつ/u.test(item.title)), false);

const outOfWindow = parsePremistDomeEventList(html, sourceUrl, {
  months: [{ year: 2026, month: 12 }],
});
assert.equal(outOfWindow.ok, true);
assert.deepEqual(outOfWindow.records, []);

const malformed = parsePremistDomeEventList(
  "<html><body>broken</body></html>",
  sourceUrl,
  { months: [{ year: 2026, month: 10 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Premist Dome source smoke: ok");
