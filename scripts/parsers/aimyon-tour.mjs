import * as cheerio from "cheerio";
import {
  cleanText,
  normalizeTime,
  toIsoDate,
} from "../event-ingest-lib.mjs";

const TITLE = "AIMYON TOUR 2027 -cosmic%-";
const TITLE_RE = /AIMYON\s+TOUR\s+2027\s*-\s*cosmic\s*%\s*-/iu;
const DATE_TIME_RE = /(\d{1,2})\.(\d{1,2})\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2}:\d{2})\s*[／/]\s*(\d{1,2}:\d{2})/giu;
const TICKET_RE = /指定席\s*([0-9][0-9,]*)円\s*[（(]税込[)）]/u;

const VENUES = [
  ["真駒内セキスイハイムアイスアリーナ", "真駒内セキスイハイムアイスアリーナ"],
  ["朱鷺メッセ・新潟コンベンションセンター", "朱鷺メッセ"],
  ["クロコくんホール(旧日本ガイシホール)", "クロコくんホール"],
  ["国立代々木競技場第一体育館", "国立代々木競技場 第一体育館"],
  ["宮城セキスイハイムスーパーアリーナ", "宮城セキスイハイムスーパーアリーナ"],
  ["セキスイハイムスーパーアリーナ", "宮城セキスイハイムスーパーアリーナ"],
  ["Aichi Sky Expo(愛知県国際展示場) ホールA", "Aichi Sky Expo(愛知県国際展示場) ホールA"],
  ["沖縄サントリーアリーナ", "沖縄サントリーアリーナ"],
  ["広島グリーンアリーナ", "広島グリーンアリーナ"],
  ["マリンメッセ福岡A館", "マリンメッセ福岡A館"],
  ["神戸ワールド記念ホール", "神戸ワールド記念ホール"],
  ["あなぶきアリーナ香川", "あなぶきアリーナ香川"],
  ["GLION ARENA KOBE", "GLION ARENA KOBE"],
  ["ぴあアリーナMM", "ぴあアリーナMM"],
  ["サンドーム福井", "サンドーム福井"],
  ["K-Arena Yokohama", "Kアリーナ横浜"],
  ["エコパアリーナ", "静岡エコパアリーナ"],
  ["大阪城ホール", "大阪城ホール"],
].sort((a, b) => b[0].length - a[0].length);

function allowedMonthKeys(months) {
  return new Set(
    months.map(({ year, month }) =>
      `${Number(year)}-${String(Number(month)).padStart(2, "0")}`,
    ),
  );
}

function venueFromSegment(segment) {
  const normalized = segment.normalize("NFKC");
  for (const [needle, canonical] of VENUES) {
    if (normalized.includes(needle.normalize("NFKC"))) return canonical;
  }
  return undefined;
}

function ticketTypesFrom(bodyText) {
  const match = bodyText.match(TICKET_RE);
  if (!match) return [];
  const priceJpy = Number(match[1].replaceAll(",", ""));
  if (!Number.isInteger(priceJpy) || priceJpy <= 0) return [];
  return [{ name: "指定席", priceJpy, taxIncluded: true, notes: [] }];
}

export function parseAimyonTour2027(html, sourceUrl, { months = [] } = {}) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text()).normalize("NFKC");
  if (!TITLE_RE.test(bodyText) || !bodyText.includes("SCHEDULE 2027")) {
    return {
      ok: false,
      reason: "AIMYON official tour page 缺少 2027 cosmic tour / schedule 标识",
      records: [],
    };
  }

  const allowed = allowedMonthKeys(months);
  if (!allowed.size) {
    return { ok: false, reason: "AIMYON parser 需要明确目标月份窗口", records: [] };
  }

  const matches = [...bodyText.matchAll(DATE_TIME_RE)];
  const pending = [];
  const records = [];
  const ticketTypes = ticketTypesFrom(bodyText);
  const pricesJpy = ticketTypes.map((item) => item.priceJpy);

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const date = toIsoDate(2027, match[1], match[2]);
    if (!date) continue;
    pending.push({
      date,
      openTime: normalizeTime(match[3]),
      startTime: normalizeTime(match[4]),
    });

    const segment = bodyText.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : bodyText.length,
    );
    const venueName = venueFromSegment(segment);
    if (!venueName) continue;

    for (const performance of pending.splice(0)) {
      if (!allowed.has(performance.date.slice(0, 7))) continue;
      records.push({
        title: TITLE,
        artistNames: ["あいみょん"],
        venueName,
        ...performance,
        ticketTypes,
        pricesJpy,
      });
    }
  }

  return {
    ok: true,
    records: records.filter(
      (record, index, all) =>
        all.findIndex((candidate) =>
          candidate.date === record.date &&
          candidate.venueName === record.venueName &&
          candidate.startTime === record.startTime,
        ) === index,
    ),
  };
}
