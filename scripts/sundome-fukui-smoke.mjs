import assert from "node:assert/strict";
import {
  parseSundomeFukuiDetail,
  parseSundomeFukuiScheduleLinks,
} from "./parsers/sundome-fukui.mjs";

const sourceUrl = "https://sundome.sankan.jp/eventinfo/";
const known = new Set([
  "mrchildren",
  "fantastics",
  "mrsgreenapple",
  "generations",
]);

const indexHtml = `
<html><body>
  <h1>イベント情報</h1><p>Event Schedule</p>
  <article>
    <a href="/eventinfo/mc/">Mr.Children コンサート/キョードー北陸 コンサート</a>
    <p>開催期間：2026.10.03(土) 〜 2026.10.04(日)</p><p>利用会場：メインホール</p>
  </article>
  <article>
    <a href="/eventinfo/fantastics/">FANTASTICS コンサート/キョードー北陸 コンサート</a>
    <p>開催期間：2026.10.11(日)</p><p>利用会場：メインホール</p>
  </article>
  <article>
    <a href="/eventinfo/mrs-green-apple/">Mrs. GREEN APPLEコンサート/キョードー北陸 コンサート</a>
    <p>開催期間：2026.11.13(金) 〜 2026.11.14(土)</p><p>利用会場：メインホール</p>
  </article>
  <article>
    <a href="/eventinfo/generations/">GENERATIONSコンサート/キョードー北陸 コンサート</a>
    <p>開催期間：2026.11.21(土)</p><p>利用会場：メインホール</p>
  </article>
  <article>
    <a href="/eventinfo/furisode/">振袖大展示会 呉服</a>
    <p>開催期間：2026.11.01(日)</p><p>利用会場：小ホール</p>
  </article>
  <article>
    <a href="/eventinfo/sports/">全国スポーツ大会</a>
    <p>開催期間：2026.11.28(土)</p><p>利用会場：メインホール</p>
  </article>
</body></html>`;

const discovered = parseSundomeFukuiScheduleLinks(indexHtml, sourceUrl);
assert.equal(discovered.ok, true);
assert.deepEqual(discovered.links.map((item) => item.url), [
  "https://sundome.sankan.jp/eventinfo/mc/",
  "https://sundome.sankan.jp/eventinfo/fantastics/",
  "https://sundome.sankan.jp/eventinfo/mrs-green-apple/",
  "https://sundome.sankan.jp/eventinfo/generations/",
]);

const mcHtml = `
<html><body>
  <h1>イベント情報</h1><h2>コンサート</h2><h2>Mr.Children コンサート/キョードー北陸</h2>
  <dl>
    <dt>催事名</dt><dd>Mr.Children Tour 2026</dd>
    <dt>主催者名</dt><dd>キョードー北陸</dd>
    <dt>利用会場</dt><dd>メインホール</dd>
    <dt>開催期間</dt><dd>2026.10.03(土) 〜 2026.10.04(日)</dd>
    <dt>開催時間</dt><dd>2026/10/03 開場16:00／開演17:00<br>2026/10/04 開場15:00／開演16:00</dd>
    <dt>主催者HP</dt><dd><a href="https://www.kyodo-hokuriku.co.jp/artist/11465">https://www.kyodo-hokuriku.co.jp/artist/11465</a></dd>
    <dt>お問い合わせ先</dt><dd>Tel.025-245-5100</dd>
  </dl>
  <p>チケットのお取り扱い、公演詳細につきましては、主催者HP、アーティストHP <a href="https://tour.mrchildren.jp/">https://tour.mrchildren.jp/</a> にてご確認ください。</p>
  <h3>カテゴリー</h3>
</body></html>`;
const mc = parseSundomeFukuiDetail(mcHtml, "https://sundome.sankan.jp/eventinfo/mc/", {
  months: [{ year: 2026, month: 10 }],
  knownArtistNames: known,
});
assert.equal(mc.ok, true);
assert.deepEqual(mc.records.map((item) => [item.date, item.openTime, item.startTime]), [
  ["2026-10-03", "16:00", "17:00"],
  ["2026-10-04", "15:00", "16:00"],
]);
assert.deepEqual(mc.records[0].artistNames, ["Mr.Children"]);
assert.equal(mc.records[0].promoterUrl, "https://www.kyodo-hokuriku.co.jp/artist/11465");
assert.equal(mc.records[0].artistOfficialUrl, "https://tour.mrchildren.jp/");

const mrsHtml = `
<html><body>
  <h1>イベント情報</h1><h2>コンサート</h2>
  <dl>
    <dt>催事名</dt><dd>Mrs. GREEN APPLE Ringo Jam Tour “SHADOWS”</dd>
    <dt>主催者名</dt><dd>キョードー北陸</dd>
    <dt>利用会場</dt><dd>メインホール</dd>
    <dt>開催期間</dt><dd>2026.11.13(金) 〜 2026.11.14(土)</dd>
    <dt>開催時間</dt><dd>2026/11/13 開場17:00／開演18:00<br>2026/11/14 開場16:00／開演17:00</dd>
    <dt>主催者HP</dt><dd><a href="https://www.kyodo-hokuriku.co.jp/artist/11671">主催者ページ</a></dd>
    <dt>お問い合わせ先</dt><dd>Tel.025-245-5100</dd>
  </dl>
  <p>アーティストHP <a href="https://mrsgreenapple.com/">Mrs. GREEN APPLE</a> にてご確認ください。</p>
  <h3>カテゴリー</h3>
</body></html>`;
const mrs = parseSundomeFukuiDetail(
  mrsHtml,
  "https://sundome.sankan.jp/eventinfo/mrs-green-apple/",
  { months: [{ year: 2026, month: 11 }], knownArtistNames: known },
);
assert.equal(mrs.ok, true);
assert.deepEqual(mrs.records[0].artistNames, ["Mrs. GREEN APPLE"]);
assert.equal(mrs.records[0].artistOfficialUrl, "https://mrsgreenapple.com/");

const sports = parseSundomeFukuiDetail(
  `<html><body><h1>イベント情報</h1><h2>スポーツ大会</h2><dl><dt>利用会場</dt><dd>メインホール</dd><dt>催事名</dt><dd>全国スポーツ大会</dd></dl></body></html>`,
  "https://sundome.sankan.jp/eventinfo/sports/",
  { months: [{ year: 2026, month: 11 }], knownArtistNames: known },
);
assert.equal(sports.ok, false);

const outOfWindow = parseSundomeFukuiDetail(mcHtml, "https://sundome.sankan.jp/eventinfo/mc/", {
  months: [{ year: 2026, month: 12 }],
  knownArtistNames: known,
});
assert.equal(outOfWindow.ok, false);

const malformed = parseSundomeFukuiScheduleLinks("<html><body>broken</body></html>", sourceUrl);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.links, []);

console.log("Sundome Fukui source smoke: ok");
