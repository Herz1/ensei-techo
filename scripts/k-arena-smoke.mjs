import assert from "node:assert/strict";
import {
  parseKArenaDetail,
  parseKArenaScheduleLinks,
} from "./parsers/k-arena.mjs";

const schedule = parseKArenaScheduleLinks(`
  <main>
    <a href="/schedule/20260908-1/">
      HOSHIMACHI SUISEI ARENA TOUR 2026 Once Upon a Stellar
    </a>
    <a href="https://k-arena.com/schedule/20260909-1/">day 2</a>
    <a href="/news/20260908-1/">not a performance</a>
  </main>
`, "https://k-arena.com/schedule/");
assert.deepEqual(schedule.map((item) => [item.date, item.url]), [
  ["2026-09-08", "https://k-arena.com/schedule/20260908-1/"],
  ["2026-09-09", "https://k-arena.com/schedule/20260909-1/"],
]);

const detail = parseKArenaDetail(`
  <html>
    <head><title>HOSHIMACHI SUISEI ARENA TOUR 2026 Once Upon a Stellar | Kアリーナ横浜</title></head>
    <body>
      <main>
        <h1>HOSHIMACHI SUISEI ARENA TOUR 2026 Once Upon a Stellar</h1>
        <section><h2>ARTIST</h2><p>星街すいせい</p></section>
        <section><h2>OPEN/START</h2><p>OPEN 17:30 / START 19:00</p></section>
        <section>
          <h2>INFORMATION</h2>
          <a href="https://example-artist.jp/tour">オフィシャルHP</a>
        </section>
        <section>
          <h2>TICKETS</h2>
          <p>◆指定席：11,000円(税込)</p>
          <p>◆注釈付き指定席：11,000円(税込)</p>
        </section>
        <section>
          <h2>NOTES</h2>
          <p>※3歳以上要チケット。3歳未満は入場不可。</p>
          <p>※お一人様4枚まで</p>
          <p>※公演当日は写真付き身分証明書による本人確認を行う場合があります。</p>
        </section>
        <a href="https://eplus.jp/suisei-2026/">チケット購入</a>
        <h2>CONTACT</h2>
        <p>SOGO TOKYO</p>
        <h2>ORGANIZER</h2>
        <p>Studio STELLAR</p>
      </main>
    </body>
  </html>
`, "https://k-arena.com/schedule/20260908-1/");
assert.equal(detail.ok, true);
assert.equal(detail.date, "2026-09-08");
assert.equal(detail.title, "HOSHIMACHI SUISEI ARENA TOUR 2026 Once Upon a Stellar");
assert.deepEqual(detail.artistNames, ["星街すいせい"]);
assert.equal(detail.openTime, "17:30");
assert.equal(detail.startTime, "19:00");
assert.deepEqual(detail.prices, [11000]);
assert.deepEqual(detail.ticketTypes.map((item) => item.name), [
  "指定席",
  "注釈付き指定席",
]);
assert.deepEqual(detail.purchaseUrls, ["https://eplus.jp/suisei-2026/"]);
assert.equal(
  detail.discoveredLinks.some(
    (link) => link.role === "artist_official" && link.url === "https://example-artist.jp/tour",
  ),
  true,
);
assert.equal(
  detail.eligibility.some((rule) => rule.label === "3歳以上はチケット必要"),
  true,
);
assert.equal(
  detail.eligibility.some((rule) => rule.label === "3歳未満は入場不可"),
  true,
);
assert.equal(
  detail.eligibility.some((rule) => rule.label === "1人あたり4枚まで"),
  true,
);
assert.equal(
  detail.eligibility.some((rule) => rule.appliesTo === "本人確認"),
  true,
);

const sparse = parseKArenaDetail(`
  <main>
    <h1>米津玄師 2026 TOUR / GHOST</h1>
    <h2>ARTIST</h2><p>米津玄師</p>
    <a href="/schedule/">公演スケジュール一覧</a>
  </main>
`, "https://k-arena.com/schedule/20261112-1/");
assert.equal(sparse.ok, true);
assert.equal(sparse.openTime, undefined);
assert.equal(sparse.startTime, undefined);
assert.equal(sparse.fieldAvailability.openTime, "not_found_on_page");
assert.equal(sparse.fieldAvailability.prices, "not_found_on_page");

const malformed = parseKArenaDetail(`
  <main><p>redesigned page without heading</p></main>
`, "https://k-arena.com/schedule/not-a-date/");
assert.equal(malformed.ok, false);
assert.match(malformed.reason, /页面结构可能已变化/u);

console.log("K Arena parser smoke: ok");
