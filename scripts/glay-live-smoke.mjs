import assert from "node:assert/strict";
import { parseGlayLivePage } from "./parsers/glay-live.mjs";

const sourceUrl = "https://www.glay.co.jp/feature/live";
const html = `
<html><body>
  <h1>GLAY</h1>
  <section>
    <h2>音楽と髭達2026-TIME MACHINE-</h2>
    <table>
      <tr><th>日程</th><th>会場</th><th>開場/開演</th></tr>
      <tr><td>8.29（土）</td><td>HARD OFF ECO スタジアム新潟</td><td>9:00/11:00</td></tr>
    </table>
  </section>
  <section>
    <h2>GLAY ARENA TOUR 2026-2027 “EXOFIRE”</h2>
    <table>
      <tr><th>日程</th><th>会場</th><th>開場/開演</th><th>お問い合わせ</th></tr>
      <tr>
        <td>11.7（土）</td>
        <td rowspan="2">大阪城ホール</td>
        <td>16:00/17:00</td>
        <td rowspan="2"><a href="https://www.yumebanchi.jp/">YUMEBANCHI(大阪)</a> TEL：06-0000-0000</td>
      </tr>
      <tr><td>11.8（日）</td><td>15:00/16:00</td></tr>
      <tr>
        <td>12.5（土）</td>
        <td>新潟・朱鷺メッセ</td>
        <td>16:00/17:00</td>
        <td><a href="https://www.kyodo-hokuriku.co.jp/">キョードー北陸チケットセンター</a> TEL：025-000-0000</td>
      </tr>
      <tr>
        <td>2027.1.16（土）</td>
        <td rowspan="2">兵庫・GLION ARENA KOBE</td>
        <td>16:00/17:00</td>
        <td rowspan="2"><a href="https://www.yumebanchi.jp/">YUMEBANCHI(大阪)</a> TEL：06-0000-0000</td>
      </tr>
      <tr><td>2027.1.17（日）</td><td>15:00/16:00</td></tr>
      <tr>
        <td>2027.2.6（土）</td>
        <td rowspan="2">Aichi Sky Expo(愛知県国際展示場) ホールA</td>
        <td>16:00/17:00</td>
        <td rowspan="2"><a href="https://www.sundayfolk.com/">サンデーフォークプロモーション(名古屋)</a> TEL：052-000-0000</td>
      </tr>
      <tr><td>2027.2.7（日）</td><td>15:00/16:00</td></tr>
      <tr>
        <td>2027.2.11（木・祝）</td>
        <td rowspan="3">函館サーモン・まるなまアリーナ（函館アリーナ）</td>
        <td>16:00/17:00</td>
        <td rowspan="3"><a href="https://wess.jp/">WESS-INFO</a> info@example.com</td>
      </tr>
      <tr><td>2027.2.13（土）</td></tr>
      <tr><td>2027.2.14（日）</td><td>15:00/16:00</td></tr>
      <tr>
        <td>2027.2.20（土）</td>
        <td rowspan="2">神奈川・横浜アリーナ</td>
        <td>16:00/17:00</td>
        <td rowspan="2"><a href="https://www.kyodoyokohama.com/">キョードー横浜</a> TEL：045-000-0000</td>
      </tr>
      <tr><td>2027.2.21（日）</td><td>15:00/16:00</td></tr>
    </table>
  </section>
</body></html>`;

const parsed = parseGlayLivePage(html, sourceUrl, {
  months: [
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
  ],
});
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 12);
assert.equal(parsed.records.some((item) => /HARD OFF/u.test(item.venueName)), false);

assert.deepEqual(
  parsed.records.slice(0, 3).map((item) => [item.date, item.venueName, item.openTime, item.startTime]),
  [
    ["2026-11-07", "大阪城ホール", "16:00", "17:00"],
    ["2026-11-08", "大阪城ホール", "15:00", "16:00"],
    ["2026-12-05", "朱鷺メッセ", "16:00", "17:00"],
  ],
);
assert.equal(parsed.records[1].promoterUrl, "https://www.yumebanchi.jp/");

const glion = parsed.records.find((item) => item.date === "2027-01-16");
assert.equal(glion?.venueName, "GLION ARENA KOBE");

const aichi = parsed.records.find((item) => item.date === "2027-02-06");
assert.equal(aichi?.venueName, "Aichi Sky Expo(愛知県国際展示場) ホールA");
assert.equal(aichi?.promoterUrl, "https://www.sundayfolk.com/");

const hakodate11 = parsed.records.find((item) => item.date === "2027-02-11");
const hakodate13 = parsed.records.find((item) => item.date === "2027-02-13");
const hakodate14 = parsed.records.find((item) => item.date === "2027-02-14");
assert.equal(hakodate11?.venueName, "函館サーモン・まるなまアリーナ（函館アリーナ）");
assert.equal(hakodate13?.venueName, hakodate11?.venueName);
assert.equal(hakodate13?.openTime, undefined);
assert.equal(hakodate13?.startTime, undefined);
assert.equal(hakodate13?.promoterUrl, "https://wess.jp/");
assert.deepEqual([hakodate14?.openTime, hakodate14?.startTime], ["15:00", "16:00"]);

const febOnly = parseGlayLivePage(html, sourceUrl, {
  months: [{ year: 2027, month: 2 }],
});
assert.equal(febOnly.ok, true);
assert.deepEqual(febOnly.records.map((item) => item.date), [
  "2027-02-06",
  "2027-02-07",
  "2027-02-11",
  "2027-02-13",
  "2027-02-14",
  "2027-02-20",
  "2027-02-21",
]);

const malformed = parseGlayLivePage(
  `<html><body><h2>GLAY ARENA TOUR 2026-2027 “EXOFIRE”</h2><table><tr><th>日程</th></tr></table></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 11 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("GLAY official live source smoke: ok");
