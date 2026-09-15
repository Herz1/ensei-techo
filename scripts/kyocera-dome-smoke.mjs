import assert from "node:assert/strict";
import { parseKyoceraDomeSchedule } from "./parsers/kyocera-dome.mjs";

const sourceUrl = "https://www.kyoceradome-osaka.jp/events/?monthId=11&yearId=2026";

const html = `
<html><body>
  <h1>EVENT</h1><h2>イベント</h2><h2>イベント詳細</h2>
  <p>2026年11月のイベントスケジュール</p>

  <section class="event">
    <p>2026年11月14日（土）</p>
    <h3>INI</h3>
    <h4>2026 INI DOME LIVE TOUR</h4>
    <p>コンサート</p>
    <p>2026年11月14日（土） 開場時間：16:30～ 開始時間：18:30～</p>
    <p>入場料(円)</p><p>24,200～14,300</p>
    <p>お問合せ先(TEL)</p><p>キョードーインフォメーション：0570-200-888</p>
    <a href="/events/detail/ini.html">詳細を見る</a>
  </section>

  <section class="event">
    <p>2026年11月15日（日）</p>
    <h3>INI</h3>
    <h4>2026 INI DOME LIVE TOUR</h4>
    <p>コンサート</p>
    <p>2026年11月15日（日） 開場時間：12:30～ 開始時間：14:30～</p>
    <p>入場料(円)</p><p>24,200～14,300</p>
    <p>お問合せ先(TEL)</p><p>キョードーインフォメーション：0570-200-888</p>
  </section>

  <section class="event">
    <p>2026年11月20日（金）</p>
    <h4>2026 MAMA AWARDS</h4>
    <p>コンサート</p>
    <p>2026年11月20日（金）</p>
    <p>入場料(円)</p><p></p>
    <p>お問合せ先(TEL)</p><p>：</p>
  </section>

  <section class="event">
    <p>2026年11月27日（金）</p>
    <h3>BIGBANG</h3>
    <h4>BIGBANG 2026-2027 WORLD TOUR &lt; XX : COSMOS &gt; IN JAPAN</h4>
    <p>コンサート</p>
    <p>2026年11月27日（金） 開場時間：16:00～ 開始時間：18:00～</p>
    <p>入場料(円)</p><p>60,000～12,800</p>
    <p>お問合せ先(TEL)</p><p>キョードーインフォメーション：0570-200-888</p>
  </section>

  <section class="event duplicate">
    <p>2026年11月27日（金）</p>
    <h3>BIGBANG</h3>
    <h4>BIGBANG 2026-2027 WORLD TOUR &lt; XX : COSMOS &gt; IN JAPAN</h4>
    <p>コンサート</p>
    <p>2026年11月27日（金） 開場時間：16:00～ 開始時間：18:00～</p>
    <p>入場料(円)</p><p>60,000～12,800</p>
    <p>お問合せ先(TEL)</p><p>キョードーインフォメーション：0570-200-888</p>
  </section>

  <section class="event">
    <p>2026年11月22日（日）</p>
    <h4>オリックスvsソフトバンク</h4>
    <p>野球</p>
    <p>2026年11月22日（日） 開始時間：18:00～</p>
    <p>入場料(円)</p><p>5,000～2,000</p>
    <p>お問合せ先(TEL)</p><p>オリックス野球クラブ</p>
  </section>

  <section class="event">
    <p>2026年11月29日（日）</p>
    <h4>非公開イベント</h4>
    <p>販売・展示・その他</p>
    <p>2026年11月29日（日） 開場時間：9:00～ 開始時間：10:00～15:00</p>
    <p>入場料(円)</p><p>関係者のみ</p>
    <p>お問合せ先(TEL)</p><p>：</p>
  </section>
</body></html>`;

const parsed = parseKyoceraDomeSchedule(html, sourceUrl, {
  year: 2026,
  month: 11,
  knownArtistNames: new Set(["ini", "bigbang"]),
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 4);
assert.deepEqual(parsed.records.map((event) => event.date), [
  "2026-11-14",
  "2026-11-15",
  "2026-11-20",
  "2026-11-27",
]);
assert.deepEqual(parsed.records[0].artistNames, ["INI"]);
assert.deepEqual(parsed.records[0].pricesJpy, [14300, 24200]);
assert.equal(parsed.records[0].openTime, "16:30");
assert.equal(parsed.records[0].startTime, "18:30");
assert.equal(
  parsed.records[0].officialEventUrl,
  "https://www.kyoceradome-osaka.jp/events/detail/ini.html",
);
assert.deepEqual(parsed.records[2].artistNames, []);
assert.deepEqual(parsed.records[2].pricesJpy, []);
assert.equal(parsed.records[2].openTime, undefined);
assert.equal(parsed.records[2].startTime, undefined);
assert.deepEqual(parsed.records[3].artistNames, ["BIGBANG"]);
assert.deepEqual(parsed.records[3].pricesJpy, [12800, 60000]);
assert.equal(parsed.records.some((event) => /オリックス|非公開/u.test(event.title)), false);

const empty = parseKyoceraDomeSchedule(
  "<html><body><h1>イベント詳細</h1><p>2026年10月のイベントスケジュール</p></body></html>",
  "https://www.kyoceradome-osaka.jp/events/?monthId=10&yearId=2026",
  { year: 2026, month: 10 },
);
assert.equal(empty.ok, true);
assert.deepEqual(empty.records, []);

const wrongMonth = parseKyoceraDomeSchedule(html, sourceUrl, {
  year: 2026,
  month: 12,
});
assert.equal(wrongMonth.ok, false);
assert.deepEqual(wrongMonth.records, []);

const malformed = parseKyoceraDomeSchedule(
  "<html><body>not a Kyocera Dome schedule</body></html>",
  sourceUrl,
  { year: 2026, month: 11 },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Kyocera Dome source smoke: ok");
