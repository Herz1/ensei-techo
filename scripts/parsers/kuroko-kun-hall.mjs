import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const MONTH_HEADING = /(20\d{2})年(\d{1,2})月/u;
const NON_CONCERT = /(マーチングバンド.*大会|全国大会|コンクール|選手権|競技大会|スポーツ大会|試合|大会\s*$)/iu;

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function parseJapaneseTime(value) {
  const text = cleanText(value);
  if (!text || /未定/u.test(text)) return undefined;
  const match = text.match(/(\d{1,2})時\s*(\d{2})分/u);
  if (!match) return undefined;
  return normalizeTime(`${match[1]}:${match[2]}`);
}

function parseArtistNames(eventText, title) {
  const remainder = cleanText(eventText.replace(title, ""));
  const matches = [...remainder.matchAll(/[（(]([^()（）]{2,160})[）)]/gu)];
  for (const match of matches) {
    const value = cleanText(match[1]);
    if (!value || /駐車場|混雑|部$/u.test(value)) continue;
    const names = splitArtistNames(value);
    if (names.length) return names;
  }
  return [];
}

function associatedTable($, heading) {
  const direct = $(heading).nextAll("table").first();
  if (direct.length) return direct;
  const wrapper = $(heading).parent();
  return wrapper.find("table").first();
}

export function parseKurokoKunHallConcertSchedule(
  html,
  sourceUrl,
  { months = [] } = {},
) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  if (
    !bodyText.includes("コンサート等イベント情報") ||
    !bodyText.includes("主催者からの情報に基づき作成")
  ) {
    return {
      ok: false,
      reason: "クロコくんホール官方 concert 页面缺少结构标识，页面结构可能已变化",
      records: [],
    };
  }

  const monthKeys = allowedMonthKeys(months);
  if (!monthKeys.size) {
    return {
      ok: false,
      reason: "クロコくんホール parser 需要明确目标月份",
      records: [],
    };
  }

  const monthHeadings = $("h1,h2,h3,h4").toArray()
    .map((element) => ({ element, text: cleanText($(element).text()) }))
    .filter((item) => MONTH_HEADING.test(item.text));
  if (!monthHeadings.length) {
    return {
      ok: false,
      reason: "クロコくんホール官方 concert 页面未发现年月分组",
      records: [],
    };
  }

  const records = [];
  for (const { element, text } of monthHeadings) {
    const monthMatch = text.match(MONTH_HEADING);
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (!monthKeys.has(key)) continue;

    const table = associatedTable($, element);
    if (!table.length) continue;
    for (const row of table.find("tr").toArray()) {
      const cells = $(row).find("td").toArray();
      if (cells.length < 2) continue;
      const dateText = cleanText($(cells[0]).text());
      const dayMatch = dateText.match(/(\d{1,2})日[（(][^）)]*[）)]/u);
      if (!dayMatch) continue;
      const date = toIsoDate(year, month, dayMatch[1]);
      if (!date) continue;

      const eventCell = $(cells[1]);
      const detailAnchor = eventCell.find("a[href*='detail.html']").first();
      const title = cleanText(detailAnchor.text()) || cleanText(eventCell.find("a[href]").first().text());
      if (!title || NON_CONCERT.test(title)) continue;

      const artistNames = parseArtistNames(cleanText(eventCell.text()), title);
      const openRaw = dateText.match(/開場\s*[:：]\s*(未定|\d{1,2}時\s*\d{2}分)/u)?.[1];
      const startRaw = dateText.match(/開演\s*[:：]\s*(未定|\d{1,2}時\s*\d{2}分)/u)?.[1];
      const inquiryCell = cells[2] ? $(cells[2]) : null;
      const promoterAnchor = inquiryCell?.find("a[href]").first();

      records.push({
        title,
        artistNames,
        date,
        openTime: parseJapaneseTime(openRaw),
        startTime: parseJapaneseTime(startRaw),
        officialDetailUrl: normalizeUrl(detailAnchor.attr("href"), sourceUrl),
        promoterUrl: promoterAnchor?.length
          ? normalizeUrl(promoterAnchor.attr("href"), sourceUrl)
          : undefined,
      });
    }
  }

  return {
    ok: true,
    records: records.filter(
      (record, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.date === record.date &&
            candidate.title === record.title &&
            candidate.startTime === record.startTime,
        ) === index,
    ),
  };
}
