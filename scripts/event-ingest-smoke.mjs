import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeAndMerge,
  normalizeJapaneseMatch,
  splitArtistNames,
} from "./event-ingest-lib.mjs";
import {
  createFieldEvidence,
  mergeFieldEvidence,
} from "./event-field-model.mjs";
import { parseTicketText } from "./parsers/ticket-text.mjs";
import {
  parseEmbeddedEventJson,
  parseEventJsonLd,
} from "./parsers/structured-event.mjs";
import { parseKenshiYonezuTour } from "./parsers/kenshi-yonezu.mjs";
import { parseSheenaRingoTour } from "./parsers/sheena-ringo.mjs";
import { parseTicketmasterEvents } from "./parsers/ticketmaster.mjs";
import { parseYokohamaArenaEvents } from "./parsers/yokohama-arena.mjs";
import { parseYokohamaArenaDetail } from "./parsers/yokohama-detail.mjs";
import { parseZeppDetail } from "./parsers/zepp-detail.mjs";
import { parseZeppSchedule } from "./parsers/zepp-schedule.mjs";
import { isSpecificTicketUrl } from "./parsers/ticket-url.mjs";

const fetchedAt = "2026-07-29T00:00:00.000Z";
const venueSource = {
  id: "venue-test",
  name: "场馆官网测试",
  type: "venue_official",
  url: "https://venue.example/events",
  fetchedAt,
};
const artistSource = {
  id: "artist-test",
  name: "艺人官网测试",
  type: "artist_official",
  url: "https://artist.example/tour",
  fetchedAt,
};

function availability(record, field) {
  const values = {
    title: record.title,
    artist: record.artistNames,
    venue: record.venueName,
    eventDate: record.date,
    openTime: record.openTime,
    startTime: record.startTime,
    ticketTypes: record.ticketTypes,
    prices: record.pricesJpy,
    additionalFees: record.additionalFees,
    ticketPhases: record.ticketPhases,
    eligibility: record.eligibility,
    purchaseUrls: record.purchaseUrls,
  };
  const value = values[field];
  if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
    return "published";
  }
  return record.fieldAvailability?.[field] ?? "not_checked";
}

function assertAvailability(record, expected, name) {
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(expected).map((field) => [
        field,
        availability(record, field),
      ]),
    ),
    expected,
    name,
  );
}

const ticketFixtures = JSON.parse(
  await readFile(
    new URL("./fixtures/ticket-text.json", import.meta.url),
    "utf8",
  ),
);
for (const fixture of ticketFixtures) {
  const parsed = parseTicketText(fixture.input);
  assert.deepEqual(parsed.prices, fixture.expected.prices, fixture.name);
  assert.equal(
    parsed.ticketTypes.length,
    fixture.expected.ticketTypeCount,
    fixture.name,
  );
  if (fixture.expected.names) {
    assert.deepEqual(
      parsed.ticketTypes.map((item) => item.name),
      fixture.expected.names,
      fixture.name,
    );
  }
  if ("taxIncluded" in fixture.expected) {
    assert.equal(parsed.taxIncluded, fixture.expected.taxIncluded, fixture.name);
  }
  if (fixture.expected.additionalFees) {
    assert.deepEqual(
      parsed.additionalFees,
      fixture.expected.additionalFees,
      fixture.name,
    );
  }
}

const ticketmaster = parseTicketmasterEvents({
  _embedded: {
    events: [{
      id: "tm-one",
      name: "Test Artist Japan Tour",
      url: "https://ticket.example/event/tm-one",
      dates: {
        start: { localDate: "2026-09-01", localTime: "18:30:00" },
        status: { code: "onsale" },
      },
      priceRanges: [{ currency: "JPY", min: 9000, max: 12000 }],
      _embedded: {
        attractions: [{ name: "Test Artist" }],
        venues: [{ name: "横浜アリーナ" }],
      },
    }],
  },
}, {
  id: "ticketmaster-test",
  name: "Ticketmaster",
  type: "ticket_api",
  url: "https://app.ticketmaster.com/",
  fetchedAt,
});
assert.equal(ticketmaster.length, 1);
assert.equal(ticketmaster[0].startTime, "18:30");
assert.deepEqual(ticketmaster[0].pricesJpy, [9000, 12000]);

const yokohama = parseYokohamaArenaEvents([
  {
    id: "one",
    date1: "2026-08-05",
    date2: "2026-08-05",
    title: "なにわ男子 LIVE TOUR 2026",
    artist: "なにわ男子",
    ev_open: ["12:00", "17:00"],
    ev_start: ["①13:00", "②18:00"],
    path: "/event/detail/naniwa",
  },
], venueSource);
assert.equal(yokohama.length, 2);
assert.equal(yokohama[1].startTime, "18:00");

const zepp = parseZeppSchedule(`
  <a class="sch-content" href="/event/1">
    <p class="sch-content-date__year">2026</p>
    <p class="sch-content-date__month">8.1</p>
    <h2 class="sch-content-text__performer">SOPHIA</h2>
    <h3 class="sch-content-text__ttl">SOPHIA TOUR 2026</h3>
    <div class="sch-content-text__desc">
      <div class="sch-content-text-date">
        <span class="sch-content-text-date__open">16:30</span>
        <span class="sch-content-text-date__start">17:00</span>
      </div>
      <p>[PRICE] 指定席/ ¥11,000</p>
    </div>
  </a>
`, venueSource, { id: "zepp-sapporo", name: "Zepp Sapporo" });
assert.equal(zepp.length, 1);
assert.deepEqual(zepp[0].pricesJpy, [11000]);
assert.equal(zepp[0].ticketTypes[0].name, "指定席");
const zeppTitleSoldOut = parseZeppSchedule(`
  <a class="sch-content" href="/event/title-soldout">
    <p class="sch-content-date__year">2026</p>
    <p class="sch-content-date__month">8.2</p>
    <h2 class="sch-content-text__performer">Test Artist</h2>
    <h3 class="sch-content-text__ttl">SOLDOUT を冠した公演タイトル</h3>
    <div class="sch-content-text__desc">
      <div class="sch-content-text-date">
        <span class="sch-content-text-date__open">16:30</span>
        <span class="sch-content-text-date__start">17:00</span>
      </div>
      <p>[PRICE] 指定席/ ¥5,000</p>
    </div>
  </a>
`, venueSource, { id: "zepp-sapporo", name: "Zepp Sapporo" });
assert.equal(zeppTitleSoldOut[0].statusHint, "unknown", "标题中的 SOLDOUT 不能推断售罄");
const zeppBadgeSoldOut = parseZeppSchedule(`
  <a class="sch-content" href="/event/badge-soldout">
    <p class="sch-content-date__year">2026</p>
    <p class="sch-content-date__month">8.3</p>
    <h2 class="sch-content-text__performer">Test Artist</h2>
    <h3 class="sch-content-text__ttl">普通公演</h3>
    <div class="sch-content-text__desc">
      <div class="sch-content-text-date">
        <span class="sch-content-text-date__open">16:30</span>
        <span class="sch-content-text-date__start">17:00</span>
      </div>
      <p>[PRICE] 指定席/ <span class="sold-out">SOLD OUT</span></p>
    </div>
  </a>
`, venueSource, { id: "zepp-sapporo", name: "Zepp Sapporo" });
assert.equal(zeppBadgeSoldOut[0].statusHint, "sold_out", "官方 sold-out 标记才可判定售罄");
assertAvailability(zepp[0], {
  title: "published",
  artist: "published",
  venue: "published",
  eventDate: "published",
  openTime: "published",
  startTime: "published",
  prices: "published",
  ticketTypes: "published",
  additionalFees: "not_found_on_page",
  ticketPhases: "not_checked",
  eligibility: "not_checked",
  purchaseUrls: "not_checked",
}, "Zepp 日程字段覆盖");

const zeppDetail = parseZeppDetail(`
  <script type="application/ld+json">
    {"@type":"MusicEvent","name":"SOPHIA TOUR 2026"}
  </script>
  <h2 class="sch-single-headelin-ttl">SOPHIA TOUR 2026</h2>
  <div class="sch-single-table">
    <p>※入場時、別途ドリンク代が必要です</p>
    <p>未就学児童入場不可、小学生以上チケット必要</p>
    <a href="https://eplus.jp/sophia/">チケット</a>
  </div>
`, "https://www.zepp.co.jp/hall/sapporo/schedule/single/?rid=1");
assert.equal(zeppDetail.ok, true);
assert.equal(zeppDetail.additionalFees[0].type, "drink");
assert.equal(zeppDetail.eligibility.length, 2);
assert.deepEqual(zeppDetail.purchaseUrls, ["https://eplus.jp/sophia/"]);
assert.equal(zeppDetail.structured.events[0].title, "SOPHIA TOUR 2026");

const changedZeppDetail = parseZeppDetail(
  "<main><h1>redesigned event page</h1></main>",
  "https://www.zepp.co.jp/hall/sapporo/schedule/single/?rid=2",
);
assert.equal(changedZeppDetail.ok, false);
assert.match(changedZeppDetail.reason, /页面结构可能已变化/u);

const yokohamaDetail = parseYokohamaArenaDetail(`
  <table class="event_detail_table">
    <tr><th>アーティスト</th><td>Test Artist</td></tr>
    <tr><th>日程</th><td>2026/09/01 開場 17:30 開演 18:30</td></tr>
    <tr><th>料金</th><td>指定席 / ¥9,900（税込）</td></tr>
    <tr><th>WEBサイト</th><td><a href="https://artist.example/tour">公式</a></td></tr>
    <tr><th>チケット</th><td><a href="https://eplus.jp/test-event/">購入</a></td></tr>
  </table>
`, "https://www.yokohama-arena.co.jp/event/detail/test");
assert.equal(yokohamaDetail.ok, true);
assert.deepEqual(yokohamaDetail.prices, [9900]);
assert.equal(yokohamaDetail.ticketTypes[0].name, "指定席");
assert.deepEqual(yokohamaDetail.purchaseUrls, [
  "https://eplus.jp/test-event/",
]);
assert.equal(
  yokohamaDetail.discoveredLinks.some(
    (link) => link.role === "artist_official",
  ),
  true,
);

assert.equal(isSpecificTicketUrl("https://eplus.jp/"), false);
assert.equal(isSpecificTicketUrl("https://l-tike.com/contact/"), false);
assert.equal(
  isSpecificTicketUrl("https://eplus.jp/test-event/"),
  true,
);

const structured = parseEventJsonLd(`
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      "name": "JSON-LD Live",
      "startDate": "2026-09-01T18:30:00+09:00",
      "location": {"@type": "MusicVenue", "name": "横浜アリーナ"},
      "performer": {"@type": "MusicGroup", "name": "Test Artist"},
      "offers": {"@type": "Offer", "price": "9900", "url": "https://ticket.example/live"}
    }
  </script>
`,);
assert.equal(structured.errors.length, 0);
assert.deepEqual(structured.events[0], {
  title: "JSON-LD Live",
  startDate: "2026-09-01",
  startTime: "18:30",
  venueName: "横浜アリーナ",
  artistNames: ["Test Artist"],
  prices: [9900],
  purchaseUrls: ["https://ticket.example/live"],
});
assert.equal(
  parseEventJsonLd(
    '<script type="application/ld+json">{"broken":</script>',
  ).errors.length,
  1,
);

const embedded = parseEmbeddedEventJson(`
  <script id="__NEXT_DATA__" type="application/json">
    {"props":{"events":[{"title":"Embedded Live","date":"2026-10-01T19:00:00+09:00","venue":{"name":"Zepp Sapporo"},"artist":"Embedded Artist","prices":[8800]}]}}
  </script>
`);
assert.equal(embedded.errors.length, 0);
assert.deepEqual(
  splitArtistNames("Blue Mash 【Guest】ねぐせ / FOMARE"),
  ["Blue Mash", "ねぐせ", "FOMARE"],
);
assert.deepEqual(
  splitArtistNames("hide with Spread Beaver"),
  ["hide with Spread Beaver"],
);
assert.deepEqual(splitArtistNames("梟 →出演キャンセルとなりました"), []);
assert.equal(normalizeJapaneseMatch("スーパー"), normalizeJapaneseMatch("すーぱー"));
assert.deepEqual(embedded.events[0], {
  title: "Embedded Live",
  startDate: "2026-10-01",
  startTime: "19:00",
  venueName: "Zepp Sapporo",
  artistNames: ["Embedded Artist"],
  prices: [8800],
  purchaseUrls: [],
});

const kenshi = parseKenshiYonezuTour(`
  <blockquote>
    <p><strong>11/ 6 (金)</strong> OPEN 17:00 / START 18:30<br>
    <strong>長野　　長野ビッグハット</strong></p>
  </blockquote>
`, artistSource);
assert.equal(kenshi.length, 1);
assert.equal(kenshi[0].venueName, "長野ビッグハット");

const sheena = parseSheenaRingoTour(`
  <ul class="sched-list"><li><div class="sched-row">
    <span class="sched-date">2026.10.30</span>
    <span class="sched-venue">横浜アリーナ</span>
    <span class="sched-time">18:00 / 19:00</span>
  </div></li></ul>
`, artistSource);
assert.equal(sheena.length, 1);
assert.equal(sheena[0].startTime, "19:00");
assert.equal(
  sheena[0].ticketPhases.filter((phase) => phase.kind === "fc_lottery").length,
  3,
);
assert.equal(
  sheena[0].ticketPhases.some((phase) => phase.kind === "general"),
  true,
);

const artists = [
  {
    id: "sheena-ringo",
    nameJa: "椎名林檎",
    nameZh: "椎名林檎",
    romaji: "Sheena Ringo",
    kana: "しいなりんご",
    aliases: [],
  },
];
const venues = [
  {
    id: "yokohama-arena",
    nameJa: "横浜アリーナ",
    nameZh: "横滨体育馆",
  },
];
const corroboratingVenueRecord = {
  ...sheena[0],
  sourceId: "yokohama-test",
  sourceName: "横浜アリーナ",
  sourceType: "venue_official",
  sourceUrl: "https://venue.example/sheena",
  sourceEventId: "venue-sheena",
};
const candidates = normalizeAndMerge(
  [sheena[0], corroboratingVenueRecord],
  artists,
  venues,
  { approved: [], rejected: [] },
);
assert.equal(candidates.length, 1);
assert.equal(candidates[0].artistIds[0], "sheena-ringo");
assert.equal(candidates[0].venueId, "yokohama-arena");
assert.equal(candidates[0].evidenceLevel, "corroborated");
assert.equal(candidates[0].readyForReview, true);
assert.equal(candidates[0].sources.length, 2);
assert.equal(candidates[0].fields.title.availabilityStatus, "published");
assert.equal(candidates[0].fields.ticketPhases.value.length, 4);

const fuzzyCandidates = normalizeAndMerge(
  [
    sheena[0],
    {
      ...corroboratingVenueRecord,
      sourceEventId: "venue-sheena-missing-time",
      startTime: undefined,
    },
  ],
  artists,
  venues,
  { approved: [], rejected: [] },
);
assert.equal(fuzzyCandidates.length, 2);
assert.equal(
  fuzzyCandidates.every(
    (candidate) =>
      candidate.issues.includes("possible_duplicate_match") &&
      candidate.matchReview.length === 1 &&
      candidate.matchReview[0].score >= 0.9,
  ),
  true,
);

const evidenceSourceA = {
  sourceId: "source-a",
  sourceUrl: "https://a.example/event",
  sourceType: "artist_official",
  fetchedAt,
};
const evidenceSourceB = {
  sourceId: "source-b",
  sourceUrl: "https://b.example/event",
  sourceType: "venue_official",
  fetchedAt,
};
const agreed = mergeFieldEvidence("prices", [
  createFieldEvidence({
    field: "prices",
    value: [9900],
    availabilityStatus: "published",
    source: evidenceSourceA,
    confidence: 1,
  }),
  createFieldEvidence({
    field: "prices",
    value: [9900],
    availabilityStatus: "published",
    source: evidenceSourceB,
    confidence: 0.96,
  }),
]);
assert.equal(agreed.availabilityStatus, "published");
assert.equal(agreed.evidence.length, 2);

const conflict = mergeFieldEvidence("startTime", [
  createFieldEvidence({
    field: "startTime",
    value: "18:00",
    availabilityStatus: "published",
    source: evidenceSourceA,
    confidence: 1,
  }),
  createFieldEvidence({
    field: "startTime",
    value: "19:00",
    availabilityStatus: "published",
    source: evidenceSourceB,
    confidence: 0.96,
  }),
]);
assert.equal(conflict.availabilityStatus, "conflicting_sources");
assert.equal(conflict.conflicts.length, 2);

const supplementedLinks = mergeFieldEvidence("purchaseUrls", [
  createFieldEvidence({
    field: "purchaseUrls",
    value: ["https://eplus.example/event"],
    availabilityStatus: "published",
    source: evidenceSourceA,
    confidence: 1,
  }),
  createFieldEvidence({
    field: "purchaseUrls",
    value: ["https://ticket.example/event"],
    availabilityStatus: "published",
    source: evidenceSourceB,
    confidence: 0.96,
  }),
]);
assert.equal(supplementedLinks.availabilityStatus, "published");
assert.deepEqual(supplementedLinks.value, [
  "https://eplus.example/event",
  "https://ticket.example/event",
]);

const missing = mergeFieldEvidence("prices", [
  createFieldEvidence({
    field: "prices",
    value: undefined,
    availabilityStatus: "not_announced",
    source: evidenceSourceA,
    confidence: 1,
  }),
]);
assert.equal(missing.availabilityStatus, "not_announced");

const parserFailed = mergeFieldEvidence("prices", [
  createFieldEvidence({
    field: "prices",
    value: undefined,
    availabilityStatus: "parser_failed",
    source: evidenceSourceA,
    confidence: 1,
  }),
]);
assert.equal(parserFailed.availabilityStatus, "parser_failed");

console.log(
  `演出采集 fixture 测试通过：${ticketFixtures.length} 个票务文本场景、字段覆盖断言、JSON-LD/内嵌 JSON、动态接口、详情页、链接过滤、页面结构变化、字段合并、冲突和重复识别正常。`,
);
