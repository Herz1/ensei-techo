import assert from "node:assert/strict";
import { parseAriakeArenaSchedule } from "./parsers/ariake-arena.mjs";

const sourceUrl = "https://ariake-arena.tokyo/event/";
const months = [
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
];

const html = `
<html><body>
  <h1>ARIAKE ARENA EVENT</h1>

  <section class="event">
    <p>8.1 SAT 8.2 SUN</p>
    <p>ME:I</p>
    <p>2026 ME:I 2ND ARENA LIVE TOUR "ME:I WAY"</p>
    <p>公演時間 8.1 Sat 開場 16:00 / 開演 17:00 8.2 Sun 開場 14:00 / 開演 15:00</p>
    <p>料金 指定席 ¥12,100（税込） 着席指定￥12,100（税込）</p>
    <p>公式サイト <a href="https://me-i.jp/">https://me-i.jp/</a></p>
    <p>お問合せ先 <a href="https://info.diskgarage.com/">DISK GARAGE</a></p>
    <p>備考 ※3歳以上有料、3歳未満入場不可 ※お1人様1公演につき4枚まで申込み可能</p>
  </section>

  <section class="event">
    <p>9.5 SAT 9.6 SUN</p>
    <p>TREASURE</p>
    <p>TREASURE THE STAGE 2026 IN JAPAN</p>
    <p>公演時間 9.5 Sat ①開場 12:30 / 開演 13:30 ②開場 17:00 / 開演 18:00 9.6 Sun 開場 14:00 / 開演 15:00</p>
    <p>料金 TREASURE SEAT：25,800円(税込) YG FAMILY SEAT：22,800円(税込) ARENA SEAT：15,800円(税込) 一般指定席：12,800円(税込)</p>
    <p>公式サイト <a href="https://ygex.jp/treasure/">https://ygex.jp/treasure/</a></p>
    <p>お問合せ先 <a href="https://supportform.jp/a-information">(a)-Information</a></p>
    <p>備考</p>
  </section>

  <section class="event">
    <p>8.20 THU - 8.21 FRI</p>
    <p>KEY TO LIT</p>
    <p>KEY TO LIT Arena Tour 2026 NEO CLASSICS</p>
    <p>公演時間 8.20 Thu ①開演18:00 8.21 Fri ①開演13:00 ②開演18:00</p>
    <p>料金 公式サイトをご覧ください</p>
    <p>公式サイト <a href="https://jr-official.starto.jp/s/jr/live/10153?tab=schedule">公式サイト</a></p>
    <p>お問合せ先 <a href="https://contact.fc-member.familyclub.jp/s/fcinq/">FAMILY CLUB</a></p>
    <p>備考</p>
  </section>

  <section class="event sports">
    <p>10.3 SAT 10.4 SUN</p>
    <p>りそなグループ B.LEAGUE 2026-27 SEASON B.LEAGUE ONE</p>
    <p>TUBCホーム開幕戦 東京ユナイテッドBC vs アースフレンズ東京Z</p>
    <p>公演時間 10.3 Sat 試合開始17:05 10.4 Sun 試合開始15:05</p>
    <p>料金 公式サイトをご覧ください</p>
    <p>公式サイト <a href="https://tubc.tokyo/">https://tubc.tokyo/</a></p>
    <p>お問合せ先 TUBC</p>
    <p>備考</p>
  </section>

  <section class="event ice">
    <p>8.17 FRI</p>
    <p>ディズニー・オン・アイス</p>
    <p>日本公演40周年記念 ディズニー・オン・アイス Let's Party!</p>
    <p>公演時間 8.17 Fri 開場 10:00 / 開演 11:00</p>
    <p>料金 S席 ¥9,000（税込）</p>
    <p>公式サイト <a href="https://example.com/disney">公式サイト</a></p>
    <p>お問合せ先 主催</p>
    <p>備考</p>
  </section>

  <section class="event">
    <p>10.7 WED</p>
    <p>LANY</p>
    <p>LANY: soft world tour</p>
    <p>公演時間 10.7 Wed 開場 17:30／開演 19:00</p>
    <p>料金 PLATINUM席 ¥39,800（税込） GOLD席 ¥29,800（税込） SS席 ¥16,800（税込） S席 ¥12,800（税込） A席 ¥10,800（税込）</p>
    <p>公式サイト <a href="https://www.livenationhip.co.jp/all-events/lany-tickets-ae771408">公式サイト</a></p>
    <p>お問合せ先 <a href="https://www.livenation.co.jp/">Live Nation</a></p>
    <p>備考</p>
  </section>
</body></html>`;

const parsed = parseAriakeArenaSchedule(html, sourceUrl, {
  months,
  knownArtistNames: new Set(["me:i", "treasure", "key to lit", "lany"]),
});

assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 9);

const mei = parsed.records.filter((event) => event.title.includes("ME:I WAY"));
assert.equal(mei.length, 2);
assert.deepEqual(mei.map((event) => event.date), ["2026-08-01", "2026-08-02"]);
assert.deepEqual(mei[0].artistNames, ["ME:I"]);
assert.equal(mei[0].ticketTypes.length, 2);
assert.deepEqual(mei[0].pricesJpy, [12100]);
assert.equal(mei[0].ticketTypes[0].taxIncluded, true);
assert.deepEqual(mei[0].eligibility, [
  { label: "3歳以上有料、3歳未満入場不可", appliesTo: "入場条件" },
  { label: "お1人様1公演につき4枚まで申込み可能", appliesTo: "申込条件" },
]);
assert.equal(mei[0].officialEventUrl, "https://me-i.jp/");
assert.equal(mei[0].promoterUrl, "https://info.diskgarage.com/");

const treasure = parsed.records.filter((event) => event.title.includes("TREASURE THE STAGE"));
assert.equal(treasure.length, 3);
assert.deepEqual(treasure.map((event) => [event.date, event.startTime]), [
  ["2026-09-05", "13:30"],
  ["2026-09-05", "18:00"],
  ["2026-09-06", "15:00"],
]);
assert.equal(treasure[0].ticketTypes.length, 4);
assert.deepEqual(treasure[0].pricesJpy, [12800, 15800, 22800, 25800]);

const keyToLit = parsed.records.filter((event) => event.title.includes("NEO CLASSICS"));
assert.equal(keyToLit.length, 3);
assert.equal(keyToLit.every((event) => event.openTime === undefined), true);
assert.deepEqual(keyToLit.map((event) => event.startTime), ["18:00", "13:00", "18:00"]);

const lany = parsed.records.find((event) => event.title.includes("soft world tour"));
assert.ok(lany);
assert.equal(lany.date, "2026-10-07");
assert.equal(lany.openTime, "17:30");
assert.equal(lany.startTime, "19:00");
assert.deepEqual(lany.pricesJpy, [10800, 12800, 16800, 29800, 39800]);

assert.equal(parsed.records.some((event) => /B\.LEAGUE|ディズニー/u.test(event.title)), false);

const malformed = parseAriakeArenaSchedule(
  "<html><body>not the event page</body></html>",
  sourceUrl,
  { months },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

const ambiguous = parseAriakeArenaSchedule(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2027, month: 9 },
  ],
});
assert.equal(ambiguous.ok, false);
assert.deepEqual(ambiguous.records, []);

console.log("Ariake Arena source smoke: ok");
