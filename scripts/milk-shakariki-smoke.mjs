import assert from "node:assert/strict";
import { parseMilkShakariki } from "./parsers/milk-shakariki.mjs";

const sourceUrl = "https://sd-milk.com/pages/shakarikirevolution";
const html = `
<html><body>
  <h1>M!LK ARENA TOUR 2026-2027「シャカリキレボリューション」</h1>
  <section><h2>SCHEDULE</h2>
    <div>2026 09.26(土)</div>
    <div>OPEN 16:00 / START 17:00</div>
    <div>2026 09.27(日)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>福岡</div><div>マリンメッセ福岡B館</div><div>(問)キョードー西日本 0570-09-2424</div>

    <div>2026 10.24(土)</div>
    <div>OPEN 16:00 / START 17:00</div>
    <div>2026 10.25(日)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>宮城</div><div>ゼビオアリーナ仙台</div><div>(問)キョードー東北 022-217-7788</div>

    <div>2026 11.21(土)</div>
    <div>OPEN 17:00 / START 18:00</div>
    <div>2026 11.22(日)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>神奈川</div><div>ぴあアリーナMM</div><div>(問)Live Nation H.I.P.</div>

    <div>2026 12.12(土)</div>
    <div>OPEN 16:00 / START 17:00</div>
    <div>2026 12.13(日)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>愛知</div><div>Aichi Sky Expo(愛知県国際展示場) ホールA</div><div>(問)サンデーフォークプロモーション</div>

    <div>2026 12.25(金)</div>
    <div>OPEN 16:00 / START 17:00</div>
    <div>2026 12.26(土)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>大阪</div><div>大阪城ホール</div><div>(問)キョードーインフォメーション</div>

    <div>2027 01.15(金)</div>
    <div>OPEN 17:00 / START 18:00</div>
    <div>2027 01.16(土)</div>
    <div>＜1部＞OPEN 11:30 / START 12:30 ＜2部＞OPEN 16:30 / START 17:30</div>
    <div>2027 01.17(日)</div>
    <div>OPEN 15:00 / START 16:00</div>
    <div>神奈川</div><div>横浜アリーナ</div><div>(問)Live Nation H.I.P.</div>
  </section>
  <section><h2>TICKET</h2>
    <div>指定席 | 11,500円 (税込)</div>
    <div>ファミリー席 | 11,500円 (税込)</div>
    <div>着席指定席 | 11,500円 (税込)</div>
    <div>受付期間：2026年2月11日 20:30～3月1日 23:59</div>
  </section>
  <section><h2>GOODS</h2><div>販売時間 11:00～18:00</div></section>
</body></html>`;

const all = parseMilkShakariki(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
  ],
});
assert.equal(all.ok, true);
assert.equal(all.allRecordCount, 19);
assert.deepEqual(all.tourMonths, ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
assert.equal(all.records.length, 19);
assert.deepEqual(all.records.slice(0, 3).map((item) => [item.date, item.venueName, item.openTime, item.startTime]), [
  ["2026-09-26", "マリンメッセ福岡B館", "16:00", "17:00"],
  ["2026-09-27", "マリンメッセ福岡B館", "11:30", "12:30"],
  ["2026-09-27", "マリンメッセ福岡B館", "16:30", "17:30"],
]);
assert.deepEqual(all.records.at(-1), {
  title: "M!LK ARENA TOUR 2026-2027「シャカリキレボリューション」",
  artistNames: ["M!LK"],
  venueName: "横浜アリーナ",
  date: "2027-01-17",
  openTime: "15:00",
  startTime: "16:00",
  ticketTypes: [
    { name: "指定席", priceJpy: 11500, taxIncluded: true, notes: [] },
    { name: "ファミリー席", priceJpy: 11500, taxIncluded: true, notes: [] },
    { name: "着席指定席", priceJpy: 11500, taxIncluded: true, notes: [] },
  ],
  pricesJpy: [11500],
});
assert.equal(all.records.every((item) => item.openTime && item.startTime), true);
assert.equal(all.records.some((item) => item.startTime === "23:59"), false);
assert.equal(all.records.some((item) => item.startTime === "18:00" && item.date === undefined), false);

const defaultWindow = parseMilkShakariki(html, sourceUrl, {
  months: [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(defaultWindow.records.length, 15);
assert.equal(defaultWindow.records.filter((item) => item.venueName === "マリンメッセ福岡B館").length, 3);
assert.equal(defaultWindow.records.filter((item) => item.venueName === "ゼビオアリーナ仙台").length, 3);
assert.equal(defaultWindow.records.filter((item) => item.venueName === "ぴあアリーナMM").length, 3);
assert.equal(defaultWindow.records.filter((item) => item.venueName === "Aichi Sky Expo(愛知県国際展示場) ホールA").length, 3);
assert.equal(defaultWindow.records.filter((item) => item.venueName === "大阪城ホール").length, 3);

const january = parseMilkShakariki(html, sourceUrl, {
  months: [{ year: 2027, month: 1 }],
});
assert.equal(january.records.length, 4);
assert.equal(january.records.every((item) => item.venueName === "横浜アリーナ"), true);

const outside = parseMilkShakariki(html, sourceUrl, {
  months: [{ year: 2027, month: 2 }],
});
assert.equal(outside.ok, true);
assert.deepEqual(outside.records, []);
assert.equal(outside.allRecordCount, 19);
assert.deepEqual(outside.tourMonths, ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);

const noTitleButStrongMarkers = parseMilkShakariki(
  html.replace(/<h1>[^<]+<\/h1>/u, ""),
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(noTitleButStrongMarkers.ok, true);
assert.equal(noTitleButStrongMarkers.records.length, 3);

const malformed = parseMilkShakariki(
  `<html><body><h1>M!LK</h1><div>SCHEDULE broken TICKET</div></body></html>`,
  sourceUrl,
  { months: [{ year: 2026, month: 9 }] },
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("M!LK Shakariki source smoke: ok");
