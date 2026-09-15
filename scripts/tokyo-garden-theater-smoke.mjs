import assert from "node:assert/strict";
import {
  parseTokyoGardenTheaterDetail,
  parseTokyoGardenTheaterScheduleLinks,
} from "./parsers/tokyo-garden-theater.mjs";

const octoberUrl = "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/?date=2026-10";

const indexHtml = `
<html><body>
  <h1>EVENT</h1><h2>開催予定のイベント</h2>
  <nav><a>202610月</a><a>202611月</a></nav>
  <p>2026 Oct.</p>
  <ul>
    <li><a href="/tokyo_garden_theater/schedule/5338/">10 03 Sat. コンサート・ショー QuizKnock10周年パーティー！ 〜メンバー全員でクリアを目指せエイトアンサー〜 伊沢拓司、ふくらP</a></li>
    <li><a href="/tokyo_garden_theater/schedule/5162/">10 04 Sun. コンサート・ショー Sung Si Kyung Sung Si Kyung Japan Concert [A Song For You 2026]</a></li>
    <li><a href="/tokyo_garden_theater/schedule/5999/">10 31 Sat. 11 01 Sun. コンサート・ショー A.B.C-Z A.B.C-Z Concert Tour 2026 The Way of L.O.V-E</a></li>
    <li><a href="/tokyo_garden_theater/schedule/5999/">10 31 Sat. 11 01 Sun. コンサート・ショー A.B.C-Z A.B.C-Z Concert Tour 2026 The Way of L.O.V-E</a></li>
    <li><a href="/tokyo_garden_theater/schedule/6000/">10 10 Sat. 会議・式典・セミナー Private Event</a></li>
  </ul>
</body></html>`;

const discovered = parseTokyoGardenTheaterScheduleLinks(indexHtml, octoberUrl, {
  year: 2026,
  month: 10,
});
assert.equal(discovered.ok, true);
assert.equal(discovered.links.length, 3);
assert.deepEqual(discovered.links.map((item) => item.url), [
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/5338/",
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/5162/",
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/5999/",
]);

const wrongMonth = parseTokyoGardenTheaterScheduleLinks(indexHtml, octoberUrl, {
  year: 2026,
  month: 12,
});
assert.equal(wrongMonth.ok, false);
assert.deepEqual(wrongMonth.links, []);

const quizHtml = `
<html><body>
  <h1>EVENT</h1><h2>イベント詳細</h2>
  <h2>QuizKnock10周年パーティー！ 〜メンバー全員でクリアを目指せエイトアンサー〜</h2>
  <p>コンサート・ショー</p>
  <p>伊沢拓司、ふくらP、須貝駿貴、河村拓哉、山本祥彰、鶴崎修功、東問、東言</p>
  <h3>OPEN / START</h3>
  <p>2026 / 10 / 03 (土) 〖開場〗16:30 〖開演〗18:00</p>
  <h3>INFORMATION</h3>
  <p>S席 ￥7,500</p><p>A席 ￥6,500</p><p>B席 ￥5,500</p>
  <p>車椅子S席 ￥7,500</p><p>車椅子A席 ￥6,500</p>
  <p>※車椅子をご利用されている方に限り、ご応募いただける受付となります。</p>
  <p>子ども・保護者ペア席 ￥11,000</p>
  <p>※6歳以上はチケット必須。6歳未満は膝の上可能、6歳未満で座席ありはチケット必要。</p>
  <section><h3>お問い合わせ</h3><a href="https://info.diskgarage.com/">DISK GARAGE</a></section>
  <section><h3>チケット購入</h3><a href="https://l-tike.com/quizknock/">ローソンチケット</a></section>
</body></html>`;

const quiz = parseTokyoGardenTheaterDetail(
  quizHtml,
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/5338/",
  { discoveryText: discovered.links[0].discoveryText },
);
assert.equal(quiz.ok, true);
assert.equal(quiz.records.length, 1);
assert.equal(quiz.records[0].date, "2026-10-03");
assert.equal(quiz.records[0].openTime, "16:30");
assert.equal(quiz.records[0].startTime, "18:00");
assert.equal(quiz.records[0].title.includes("QuizKnock10周年パーティー"), true);
assert.deepEqual(quiz.records[0].pricesJpy, [5500, 6500, 7500, 11000]);
assert.equal(quiz.records[0].ticketTypes.length, 6);
assert.deepEqual(quiz.records[0].purchaseUrls, ["https://l-tike.com/quizknock/"]);
assert.equal(quiz.records[0].promoterUrl, "https://info.diskgarage.com/");
assert.equal(quiz.records[0].eligibility.some((item) => item.label.includes("6歳未満")), true);
assert.equal(quiz.records[0].eligibility.some((item) => item.label.includes("車椅子")), true);

const sungHtml = `
<html><body>
  <h1>EVENT</h1><h2>イベント詳細</h2>
  <h2>Sung Si Kyung</h2>
  <p>コンサート・ショー</p>
  <p>Sung Si Kyung Japan Concert [A Song For You 2026]</p>
  <h3>OPEN / START</h3>
  <p>2026 / 10 / 04 (日) 〖開場〗17:00 〖開演〗18:00</p>
  <h3>INFORMATION</h3>
  <p>前方席 ￥18,000</p><p>指定席 ￥14,000</p>
  <p>・3歳未満のお子様は入場不可となります。3歳以上のお子様の場合、チケット購入後にご入場いただけます。</p>
  <p>・1公演につき 4枚</p>
  <section><h3>お問い合わせ</h3><a href="https://info.diskgarage.com/">DISK GARAGE</a></section>
  <p><a href="https://ssk-purpleocean.jp/">オフィシャルサイト</a></p>
</body></html>`;

const sung = parseTokyoGardenTheaterDetail(
  sungHtml,
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/5162/",
  {
    discoveryText: discovered.links[1].discoveryText,
    knownArtistNames: new Set(["sung si kyung"]),
  },
);
assert.equal(sung.ok, true);
assert.equal(sung.records[0].title, "Sung Si Kyung Japan Concert [A Song For You 2026]");
assert.deepEqual(sung.records[0].artistNames, ["Sung Si Kyung"]);
assert.deepEqual(sung.records[0].pricesJpy, [14000, 18000]);
assert.equal(sung.records[0].officialEventUrl, "https://ssk-purpleocean.jp/");
assert.deepEqual(sung.records[0].purchaseUrls, []);
assert.equal(sung.records[0].eligibility.some((item) => item.label.includes("3歳未満")), true);
assert.equal(sung.records[0].eligibility.some((item) => item.label.includes("1公演につき 4枚")), true);

const multiHtml = `
<html><body>
  <h2>イベント詳細</h2>
  <h2>New HISTORY COMING ARENA LIVE -The Imperial Theatre Symphony-</h2>
  <p>コンサート・ショー</p>
  <p>New HISTORY COMING ARENA LIVE -The Imperial Theatre Symphony-</p>
  <h3>OPEN / START</h3>
  <p>2026 / 08 / 07 (金) 〖開場〗17:00 〖開演〗18:00</p>
  <p>2026 / 08 / 08 (土) 〖開場〗12:00 〖開演〗13:00</p>
  <p>2026 / 08 / 08 (土) 〖開場〗18:00 〖開演〗19:00</p>
  <p>2026 / 08 / 09 (日) 〖開場〗12:00 〖開演〗13:00</p>
  <h3>INFORMATION</h3>
  <section><h3>お問い合わせ</h3><p>東宝テレザーブ</p></section>
  <p><a href="https://www.tohostage.com/newhistorycoming/">オフィシャルサイト</a></p>
</body></html>`;
const multi = parseTokyoGardenTheaterDetail(
  multiHtml,
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/4676/",
);
assert.equal(multi.ok, true);
assert.deepEqual(multi.records.map((item) => [item.date, item.startTime]), [
  ["2026-08-07", "18:00"],
  ["2026-08-08", "13:00"],
  ["2026-08-08", "19:00"],
  ["2026-08-09", "13:00"],
]);
assert.equal(multi.records[0].officialEventUrl, "https://www.tohostage.com/newhistorycoming/");

const nonConcertDetail = parseTokyoGardenTheaterDetail(
  `<html><body><h2>イベント詳細</h2><p>会議・式典・セミナー</p><h3>OPEN / START</h3><p>2026 / 10 / 10 (土) 〖開場〗09:00 〖開演〗10:00</p></body></html>`,
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/6000/",
);
assert.equal(nonConcertDetail.ok, false);
assert.deepEqual(nonConcertDetail.records, []);

const malformed = parseTokyoGardenTheaterDetail(
  "<html><body>broken</body></html>",
  "https://www.shopping-sumitomo-rd.com/tokyo_garden_theater/schedule/9999/",
);
assert.equal(malformed.ok, false);
assert.deepEqual(malformed.records, []);

console.log("Tokyo Garden Theater source smoke: ok");
