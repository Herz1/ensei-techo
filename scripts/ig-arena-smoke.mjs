import assert from "node:assert/strict";
import {
  parseIgArenaDetail,
  parseIgArenaScheduleIndex,
} from "./parsers/ig-arena.mjs";
import { isSpecificTicketUrl } from "./parsers/ticket-url.mjs";

const scheduleUrl = "https://www.ig-arena.jp/events/?month=2026-11";
const scheduleHtml = `
<!doctype html>
<html><body>
  <h1>イベント・チケット</h1>
  <section>
    <p>2026 11.7（土）</p>
    <a href="/events/2101/">HOSHIMACHI SUISEI ARENA TOUR 2026 Once Upon a Stellar</a>
  </section>
  <section>
    <p>2026 11.15（日）</p>
    <a href="/events/2102/">B.LEAGUE PREMIER リーグ戦</a>
  </section>
</body></html>`;

const schedule = parseIgArenaScheduleIndex(scheduleHtml, scheduleUrl, {
  year: 2026,
  month: 11,
});
assert.equal(schedule.ok, true);
assert.equal(schedule.events.length, 2);
assert.equal(schedule.events[0].url, "https://www.ig-arena.jp/events/2101/");

const wrongMonth = parseIgArenaScheduleIndex(scheduleHtml, scheduleUrl, {
  year: 2026,
  month: 12,
});
assert.equal(wrongMonth.ok, false);

const musicHtml = `
<!doctype html>
<html><body>
  <h1>すとろべりーめもりー Vol.10th anniversary ~すとぷり ARENA TOUR~</h1>
  <div>▼公演名 すとろべりーめもりー Vol.10th anniversary</div>
  <div>▼アーティスト すとぷり</div>
  <div>▼日時
    2026年11月20日（金）
    1部 OPEN / START：11:00 / 12:00
    2部 OPEN / START：16:30 / 17:30
    2026年11月21日（土）
    OPEN / START：11:00 / 12:00
  </div>
  <div>▼チケット料金 指定席 ￥12,000（税込） 4歳以上チケット必要 お一人様4枚まで</div>
  <a href="https://example-artist.jp/tour/">公式サイト</a>
  <a href="https://ig-arena.venue-ticket.jp/event/venue/26112001A">IGアリーナチケット</a>
  <div>▼公演に関するお問い合わせ先 主催者</div>
</body></html>`;

const music = parseIgArenaDetail(
  musicHtml,
  "https://www.ig-arena.jp/events/2101/",
);
assert.equal(music.ok, true);
assert.equal(music.isMusic, true);
assert.deepEqual(music.artistNames, ["すとぷり"]);
assert.equal(music.shows.length, 3);
assert.deepEqual(music.shows[0], {
  date: "2026-11-20",
  openTime: "11:00",
  startTime: "12:00",
});
assert.deepEqual(music.shows[1], {
  date: "2026-11-20",
  openTime: "16:30",
  startTime: "17:30",
});
assert.deepEqual(music.shows[2], {
  date: "2026-11-21",
  openTime: "11:00",
  startTime: "12:00",
});
assert.deepEqual(music.pricesJpy, [12000]);
assert.ok(music.eligibility.some((rule) => rule.label === "4歳以上チケット必要"));
assert.ok(music.eligibility.some((rule) => rule.label === "1人4枚まで"));
assert.deepEqual(music.officialSiteUrls, ["https://example-artist.jp/tour/"]);
assert.deepEqual(music.purchaseUrls, [
  "https://ig-arena.venue-ticket.jp/event/venue/26112001A",
]);
assert.equal(
  isSpecificTicketUrl("https://ig-arena.venue-ticket.jp/event/venue/26112001A"),
  true,
);

const sportsHtml = `
<!doctype html>
<html><body>
  <h1>りそなグループ B.LEAGUE 2026-27</h1>
  <div>▼日時 2026年11月15日（日） OPEN / START：13:00 / 14:00</div>
</body></html>`;
const sports = parseIgArenaDetail(
  sportsHtml,
  "https://www.ig-arena.jp/events/2102/",
);
assert.equal(sports.ok, true);
assert.equal(sports.isMusic, false);
assert.equal(sports.shows.length, 0);

const malformed = parseIgArenaDetail(
  "<html><body><p>no event title</p></body></html>",
  "https://www.ig-arena.jp/events/9999/",
);
assert.equal(malformed.ok, false);

console.log("IG Arena source smoke passed");
