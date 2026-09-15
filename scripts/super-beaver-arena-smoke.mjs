import assert from "node:assert/strict";
import { parseSuperBeaverArenaTour } from "./parsers/super-beaver-arena.mjs";

const sourceUrl = "https://sp.super-beaver.com/feature/tour2627";
const html = `
<html><body>
  <h1>SUPER BEAVER 都会のラクダ TOUR 2026-2027 〜ラクダの人生、ゴーゴーゴー〜</h1>
  <h2>HALL TOUR</h2>
  <h2>SCHEDULE</h2>
  <div>09.03 thu京都 舞鶴市総合文化会館 OPEN 17:30 / START 18:30 GREENS</div>
  <h2>TICKET</h2>
  <div>指定席 9,300円(税込) 立見 9,300円(税込)</div>
  <h2>ARENA TOUR</h2>
  <div>SUPER BEAVER 「都会のラクダ TOUR 2026-2027 〜ラクダの人生、ゴーゴーゴー〜」開催決定！</div>
  <h2>SCHEDULE</h2>
  <div>01.16 sat神奈川 Kアリーナ横浜 OPEN 16:30 / START 18:00 DISK GARAGE</div>
  <div>01.17 sun神奈川 Kアリーナ横浜 OPEN 15:30 / START 17:00 DISK GARAGE</div>
  <div>01.23 sat熊本 グランメッセ熊本 OPEN 16:00 / START 17:00 キョードー西日本</div>
  <div>01.24 sun熊本 グランメッセ熊本 OPEN 16:00 / START 17:00 キョードー西日本</div>
  <div>02.13 sat香川 あなぶきアリーナ香川 OPEN 16:00 / START 17:00 デューク</div>
  <div>02.14 sun香川 あなぶきアリーナ香川 OPEN 16:00 / START 17:00 デューク</div>
  <div>02.20 sat和歌山 和歌山ビッグホエール OPEN 16:00 / START 17:00 GREENS</div>
  <div>02.21 sun和歌山 和歌山ビッグホエール OPEN 16:00 / START 17:00 GREENS</div>
  <div>03.06 sat新潟 朱鷺メッセ 新潟コンベンションセンター OPEN 16:00 / START 17:00 FOB</div>
  <div>03.07 sun新潟 朱鷺メッセ 新潟コンベンションセンター OPEN 16:00 / START 17:00 FOB</div>
  <div>03.20 sat三重 三重県営サンアリーナ OPEN 16:00 / START 17:00 サンデーフォークプロモーション</div>
  <div>03.21 sun三重 三重県営サンアリーナ OPEN 16:00 / START 17:00 サンデーフォークプロモーション</div>
  <h2>TICKET</h2>
  <div>
    指定席 10,500円(税込)
    着席限定席 10,500円(税込)
    注釈付き指定席 10,500円(税込)
    立見 10,500円(税込)
    車椅子 10,500円(税込)
  </div>
  <h3>枚数・年齢制限</h3>
  <div>4歳以上チケット必要</div>
</body></html>`;

const parsed = parseSuperBeaverArenaTour(html, sourceUrl, {
  months: [
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
    { year: 2027, month: 3 },
  ],
});
assert.equal(parsed.ok, true);
assert.equal(parsed.records.length, 12);
assert.equal(parsed.records.some((item) => item.date.startsWith("2026-")), false);
assert.equal(parsed.records.some((item) => /舞鶴/u.test(item.venueName)), false);

assert.deepEqual(parsed.records.slice(0, 4).map((item) => [
  item.date,
  item.venueName,
  item.openTime,
  item.startTime,
]), [
  ["2027-01-16", "Kアリーナ横浜", "16:30", "18:00"],
  ["2027-01-17", "Kアリーナ横浜", "15:30", "17:00"],
  ["2027-01-23", "グランメッセ熊本", "16:00", "17:00"],
  ["2027-01-24", "グランメッセ熊本", "16:00", "17:00"],
]);

const toki = parsed.records.find((item) => item.date === "2027-03-06");
assert.equal(toki?.venueName, "朱鷺メッセ");
const mie = parsed.records.find((item) => item.date === "2027-03-20");
assert.equal(mie?.venueName, "三重県営サンアリーナ");

for (const record of parsed.records) {
  assert.deepEqual(record.pricesJpy, [10500]);
  assert.equal(record.ticketTypes.length, 5);
  assert.equal(record.ticketTypes.every((item) => item.priceJpy === 10500), true);
  assert.equal(record.ticketTypes.some((item) => item.priceJpy === 9300), false);
}
assert.deepEqual(parsed.records[0].ticketTypes.map((item) => item.name), [
  "指定席",
  "着席限定席",
  "注釈付き指定席",
  "立見",
  "車椅子",
]);

const febOnly = parseSuperBeaverArenaTour(html, sourceUrl, {
  months: [{ year: 2027, month: 2 }],
});
assert.deepEqual(febOnly.records.map((item) => item.date), [
  "2027-02-13",
  "2027-02-14",
  "2027-02-20",
  "2027-02-21",
]);

const malformed = parseSuperBeaverArenaTour(
  `<html><body><h1>都会のラクダ TOUR 2026-2027</h1><h2>ARENA TOUR</h2></body></html>`,
  sourceUrl,
  { months: [{ year: 2027, month: 1 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("SUPER BEAVER arena tour source smoke: ok");
