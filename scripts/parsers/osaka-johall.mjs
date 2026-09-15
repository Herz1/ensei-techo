import * as cheerio from "cheerio";
import {
  cleanText,
  makeSourceRecord,
  splitArtistNames,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const DAY_PATTERN = /(?:^|\s)(\d{1,2})[（(][月火水木金土日][)）](?=\s|$)/u;
const TIME_PATTERN = /(\d{1,2}:\d{2})/gu;

function timesIn(value) {
  return [...String(value ?? "").matchAll(TIME_PATTERN)].map((match) => match[1]);
}

function segmentBetween(text, startLabel, endLabels) {
  const start = text.indexOf(startLabel);
  if (start < 0) return "";
  const tail = text.slice(start + startLabel.length);
  const end = endLabels
    .map((label) => tail.indexOf(label))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return cleanText(end === undefined ? tail : tail.slice(0, end));
}

function parseSeatTypes(text) {
  const seatText = segmentBetween(text, "座席", ["主催", "音楽・芸能", "アリーナ"]);
  if (!seatText) return [];
  const matches = [...seatText.matchAll(/([0-9][0-9,]*)\s*円/gu)];
  const ticketTypes = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const previous = index === 0
      ? 0
      : (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
    const name = cleanText(seatText.slice(previous, match.index))
      .replace(/^[、，/／・\s]+|[、，/／・\s]+$/gu, "")
      .replace(/^座席\s*/u, "");
    const priceJpy = Number(match[1].replaceAll(",", ""));
    if (!name || !Number.isInteger(priceJpy) || priceJpy < 0) continue;
    if (ticketTypes.some((item) => item.name === name && item.priceJpy === priceJpy)) continue;
    ticketTypes.push({
      name,
      priceJpy,
      taxIncluded: null,
      notes: [],
    });
  }
  return ticketTypes;
}

function eligibilityFromSeatText(ticketTypes) {
  const rules = [];
  for (const ticket of ticketTypes) {
    const memberships = [...ticket.name.matchAll(/([A-Za-z0-9_-]{2,24}|[^（）()\s]{2,24})会員限定/gu)];
    for (const match of memberships) {
      const label = `${match[1]}会員限定`;
      if (!rules.some((rule) => rule.label === label)) {
        rules.push({ label, appliesTo: "座席・申込条件" });
      }
    }
  }
  return rules;
}

function eventContainers($) {
  const candidates = $("li").toArray().filter((element) => {
    const text = cleanText($(element).text());
    return DAY_PATTERN.test(text)
      && /音楽・芸能/u.test(text)
      && /アリーナ/u.test(text)
      && /開演/u.test(text);
  });
  const set = new Set(candidates);
  return candidates.filter((element) =>
    !$(element).find("li").toArray().some((child) => child !== element && set.has(child)),
  );
}

function eventTitle($, element, text, dayMatch) {
  const linkTitle = $(element).find("a[href]").toArray()
    .map((anchor) => cleanText($(anchor).text()))
    .find((value) => value && !/^(?:Image|画像|チケットはこちら)$/u.test(value));
  if (linkTitle) return linkTitle;
  const afterDay = text.slice((dayMatch.index ?? 0) + dayMatch[0].length);
  return cleanText(afterDay.split(/\s+開場|\s+開演/u)[0]);
}

function primaryArtistNames(title) {
  const primary = cleanText(title).replace(/[（(][^）)]*[）)]\s*$/u, "");
  return splitArtistNames(primary);
}

export function parseOsakaJoHallSchedule(html, source, { year, month }) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedHeading = `${year}年${month}月のイベント`;
  if (!bodyText.includes(expectedHeading)) {
    return {
      ok: false,
      reason: `大阪城ホール月間页缺少「${expectedHeading}」，查询参数可能失效或页面结构已变化`,
      records: [],
    };
  }

  const records = [];
  for (const element of eventContainers($)) {
    const text = cleanText($(element).text());
    const dayMatch = text.match(DAY_PATTERN);
    if (!dayMatch) continue;
    const date = toIsoDate(year, month, dayMatch[1]);
    if (!date) continue;
    const title = eventTitle($, element, text, dayMatch);
    if (!title) continue;

    const openTimes = timesIn(segmentBetween(text, "開場", ["開演", "座席", "主催"]));
    const startTimes = timesIn(segmentBetween(text, "開演", ["座席", "主催", "音楽・芸能", "アリーナ"]));
    if (!startTimes.length) continue;

    const ticketTypes = parseSeatTypes(text);
    const pricesJpy = [...new Set(ticketTypes.map((item) => item.priceJpy))].sort((a, b) => a - b);
    const eligibility = eligibilityFromSeatText(ticketTypes);
    const artistNames = primaryArtistNames(title);

    startTimes.forEach((startTime, index) => {
      const openTime = openTimes.length === startTimes.length
        ? openTimes[index]
        : startTimes.length === 1 && openTimes.length === 1
          ? openTimes[0]
          : undefined;
      records.push(makeSourceRecord(source, {
        sourceEventId: `${date}|${startTime}|${title}`,
        sourceUrl: source.url,
        title,
        lineupText: title,
        artistNames,
        venueName: "大阪城ホール",
        venueIdHint: "osaka-jo-hall",
        date,
        openTime,
        startTime,
        ticketTypes,
        pricesJpy,
        eligibility,
        fieldAvailability: {
          ticketTypes: ticketTypes.length ? "published" : "not_found_on_page",
          prices: pricesJpy.length ? "published" : "not_found_on_page",
          additionalFees: "not_found_on_page",
          ticketPhases: "not_checked",
          eligibility: eligibility.length ? "published" : "not_found_on_page",
          purchaseUrls: "not_found_on_page",
        },
        statusHint: "unknown",
      }));
    });
  }

  return { ok: true, records };
}
