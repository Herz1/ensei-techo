import assert from "node:assert/strict";
import { parseKurokoKunHallConcertSchedule } from "./parsers/kuroko-kun-hall.mjs";

const sourceUrl = "https://www.nespa.or.jp/sports-plaza/hall/event-schedule/concert.html";
const html = `
<html><body>
  <h1>コンサート等イベント情報</h1>
  <p>※コンサート等イベント情報は主催者からの情報に基づき作成しています。</p>

  <h2>2026年12月</h2>
  <table><tbody>
    <tr><th>日時</th><th>イベント名</th><th>お問い合わせ先</th></tr>
    <tr>
      <td>2日(水) 開場: 17時30分 開演: 18時30分</td>
      <td><a href="detail.html?id=aiko1">aiko Live Tour「Love Like Pop vol.26」</a> (aiko)</td>
      <td><a href="https://www.sundayfolk.com/">ｻﾝﾃﾞｰﾌｫｰｸﾌﾟﾛﾓｰｼｮﾝ</a> 052-320-9100</td>
    </tr>
    <tr>
      <td>3日(木) 開場: 17時30分 開演: 18時30分</td>
      <td><a href="detail.html?id=aiko2">aiko Live Tour「Love Like Pop vol.26」</a> (aiko)</td>
      <td><a href="https://www.sundayfolk.com/">ｻﾝﾃﾞｰﾌｫｰｸﾌﾟﾛﾓｰｼｮﾝ</a></td>
    </tr>
    <tr>
      <td>16日(水) 開場:未定 開演: 未定</td>
      <td><a href="detail.html?id=kuwata">桑田佳祐　夏休みツアー 2026 supported by カンロ〖追加公演〗</a> (桑田佳祐)</td>
      <td><a href="https://www.sundayfolk.com/">ｻﾝﾃﾞｰﾌｫｰｸﾌﾟﾛﾓｰｼｮﾝ</a></td>
    </tr>
    <tr>
      <td>19日(土) 開場:未定 開演: 未定</td>
      <td><a href="detail.html?id=marching">第54回マーチングバンド全国大会</a> (小学生の部/中学生の部)</td>
      <td><a href="https://www.japan-mba.org/">日本マーチングバンド協会</a></td>
    </tr>
    <tr>
      <td>22日(火) 開場: 16時30分 開演: 18時00分</td>
      <td><a href="detail.html?id=hinata">日向坂46 ARENA TOUR「ひなくり2026」</a> (日向坂46)</td>
      <td><a href="https://www.sundayfolk.com/">ｻﾝﾃﾞｰﾌｫｰｸﾌﾟﾛﾓｰｼｮﾝ</a></td>
    </tr>
  </tbody></table>

  <h2>2027年1月</h2>
  <table><tbody>
    <tr>
      <td>5日(火) 開場: 17時30分 開演: 18時30分</td>
      <td><a href="detail.html?id=miyamoto1">TOUR 2026～2027 I AM HERO</a> (宮本浩次)</td>
      <td><a href="https://www.sundayfolk.com/">ｻﾝﾃﾞｰﾌｫｰｸﾌﾟﾛﾓｰｼｮﾝ</a></td>
    </tr>
    <tr>
      <td>9日(土) 開場: 15時00分 開演: 16時00分</td>
      <td><a href="detail.html?id=chisako">高嶋ちさ子のザワつく! 昭和歌謡祭 2026</a> (高嶋ちさ子ほか)</td>
      <td><a href="https://www.kyodotokai.co.jp/">ｷｮｰﾄﾞｰ東海</a></td>
    </tr>
  </tbody></table>

  <h2>2027年3月</h2>
  <table><tbody>
    <tr><td>6日(土) 開場:未定 開演: 未定</td><td><a href="detail.html?id=otoichi">音市音座2027</a> (音市音座)</td><td></td></tr>
  </tbody></table>
</body></html>`;

const parsed = parseKurokoKunHallConcertSchedule(html, sourceUrl, {
  months: [
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
  ],
});
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 6);
assert.deepEqual(parsed.records.map((item) => item.date), [
  "2026-12-02",
  "2026-12-03",
  "2026-12-16",
  "2026-12-22",
  "2027-01-05",
  "2027-01-09",
]);
assert.deepEqual(parsed.records[0].artistNames, ["aiko"]);
assert.equal(parsed.records[0].openTime, "17:30");
assert.equal(parsed.records[0].startTime, "18:30");
assert.equal(parsed.records[0].officialDetailUrl, "https://www.nespa.or.jp/sports-plaza/hall/event-schedule/detail.html?id=aiko1");
assert.equal(parsed.records[0].promoterUrl, "https://www.sundayfolk.com/");

const kuwata = parsed.records.find((item) => item.title.includes("桑田佳祐"));
assert.ok(kuwata);
assert.equal(kuwata.openTime, undefined);
assert.equal(kuwata.startTime, undefined);
assert.deepEqual(kuwata.artistNames, ["桑田佳祐"]);

const chisako = parsed.records.find((item) => item.title.includes("昭和歌謡祭"));
assert.ok(chisako);
assert.deepEqual(chisako.artistNames, ["高嶋ちさ子"]);
assert.equal(chisako.promoterUrl, "https://www.kyodotokai.co.jp/");
assert.equal(parsed.records.some((item) => item.title.includes("マーチングバンド全国大会")), false);
assert.equal(parsed.records.some((item) => item.title.includes("音市音座2027")), false);

const closureWindow = parseKurokoKunHallConcertSchedule(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ],
});
assert.equal(closureWindow.ok, true);
assert.deepEqual(closureWindow.records, []);

const malformed = parseKurokoKunHallConcertSchedule(
  "<html><body>broken page</body></html>",
  sourceUrl,
  { months: [{ year: 2026, month: 12 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Kuroko-kun Hall source smoke: ok");
