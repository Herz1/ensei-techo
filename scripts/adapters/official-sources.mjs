import {
  refreshRecordContentHash,
} from "../event-ingest-lib.mjs";
import { parseKenshiYonezuTour } from "../parsers/kenshi-yonezu.mjs";
import { parseSheenaRingoTour } from "../parsers/sheena-ringo.mjs";
import { parseTicketmasterEvents } from "../parsers/ticketmaster.mjs";
import { parseYokohamaArenaEvents } from "../parsers/yokohama-arena.mjs";
import { parseYokohamaArenaDetail } from "../parsers/yokohama-detail.mjs";
import { parseZeppDetail } from "../parsers/zepp-detail.mjs";
import { parseZeppSchedule } from "../parsers/zepp-schedule.mjs";

export const ZEPP_HALLS = [
  { slug: "sapporo", id: "zepp-sapporo", name: "Zepp Sapporo" },
  { slug: "haneda", id: "zepp-haneda", name: "Zepp Haneda(TOKYO)" },
  { slug: "divercity", id: "zepp-divercity", name: "Zepp DiverCity(TOKYO)" },
  { slug: "shinjuku", id: "zepp-shinjuku", name: "Zepp Shinjuku(TOKYO)" },
  { slug: "yokohama", id: "kt-zepp-yokohama", name: "KT Zepp Yokohama" },
  { slug: "nagoya", id: "zepp-nagoya", name: "Zepp Nagoya" },
  { slug: "namba", id: "zepp-namba", name: "Zepp Namba(OSAKA)" },
  { slug: "osakabayside", id: "zepp-osaka-bayside", name: "Zepp Osaka Bayside" },
  { slug: "fukuoka", id: "zepp-fukuoka", name: "Zepp Fukuoka" },
];

function endDateFrom(date, months) {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 0));
  return value.toISOString().slice(0, 10);
}

function ticketmasterAdapter(context) {
  const definition = {
    id: "ticketmaster-jp",
    name: "Ticketmaster Discovery API (Japan)",
    type: "ticket_api",
    role: "structured_api",
    parserIds: ["ticketmaster-json"],
    parserVersion: "1",
    url: "https://app.ticketmaster.com/discovery/v2/events.json",
    fetchedAt: context.generatedAt,
  };
  return {
    definition,
    async collect({ fetchJson, recordParserResult, getRawEvidence }) {
      const apiKey = context.env.TICKETMASTER_API_KEY;
      if (!apiKey) {
        return {
          skipped: true,
          reason: "TICKETMASTER_API_KEY 未设置",
          records: [],
        };
      }
      const records = [];
      for (let page = 0; page < context.maxTicketmasterPages; page += 1) {
        const url = new URL(definition.url);
        url.searchParams.set("apikey", apiKey);
        url.searchParams.set("countryCode", "JP");
        url.searchParams.set("classificationName", "music");
        url.searchParams.set("startDateTime", `${context.today}T00:00:00Z`);
        url.searchParams.set(
          "endDateTime",
          `${endDateFrom(context.today, context.monthCount)}T23:59:59Z`,
        );
        url.searchParams.set("size", "200");
        url.searchParams.set("page", String(page));
        url.searchParams.set("sort", "date,asc");
        const payload = await fetchJson(url, {
          accept: "application/json",
          evidenceRole: "structured_api",
        });
        const parsed = parseTicketmasterEvents(payload, {
          ...definition,
          url: url.href,
          rawEvidence: getRawEvidence(url),
        });
        records.push(...parsed);
        await recordParserResult({
          url,
          parserId: "ticketmaster-json",
          status: "success",
          outputCount: parsed.length,
        });
        if (page + 1 >= (payload?.page?.totalPages ?? 0)) break;
      }
      return { records };
    },
  };
}

function yokohamaArenaAdapter(context) {
  const definition = {
    id: "yokohama-arena-official",
    name: "横浜アリーナ公式イベントカレンダー",
    type: "venue_official",
    role: "structured_api",
    parserIds: [
      "yokohama-arena-json",
      "generic-jsonld",
      "yokohama-arena-detail-html",
    ],
    parserVersion: "1",
    url: "https://www.yokohama-arena.co.jp/event/",
    fetchedAt: context.generatedAt,
  };
  return {
    definition,
    async collect({
      fetchJson,
      fetchText,
      recordParserResult,
      getRawEvidence,
    }) {
      const records = [];
      for (const { year, month } of context.months) {
        const key = `${year}${String(month).padStart(2, "0")}`;
        const url = `https://www.yokohama-arena.co.jp/event/${key}?_format=json`;
        const payload = await fetchJson(url, {
          accept: "application/vnd.api+json",
          evidenceRole: "structured_api",
        });
        const parsed = parseYokohamaArenaEvents(payload, {
          ...definition,
          url,
          rawEvidence: getRawEvidence(url),
        });
        records.push(...parsed);
        await recordParserResult({
          url,
          parserId: "yokohama-arena-json",
          status: "success",
          outputCount: parsed.length,
        });
      }
      const details = new Map();
      for (const url of [...new Set(records.map((record) => record.sourceUrl))]) {
        if (!/\/event\/detail\//u.test(url)) continue;
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_detail",
          });
          const detail = parseYokohamaArenaDetail(html, url);
          detail.rawEvidence = getRawEvidence(url);
          details.set(url, detail);
          await recordParserResult({
            url,
            parserId: "yokohama-arena-detail-html",
            status: detail.ok ? "success" : "parser_failed",
            error: detail.ok ? undefined : detail.reason,
            outputCount: detail.ok ? 1 : 0,
          });
        } catch (error) {
          details.set(url, {
            ok: false,
            availabilityStatus: "page_fetch_failed",
            reason: error instanceof Error ? error.message : String(error),
            additionalFees: [],
            ticketTypes: [],
            prices: [],
            eligibility: [],
            purchaseUrls: [],
            discoveredLinks: [],
            openTimes: [],
            startTimes: [],
            discoveredLinks: [],
          });
          await recordParserResult({
            url,
            parserId: "yokohama-arena-detail-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }
      const enriched = records.map((record) => {
        const detail = details.get(record.sourceUrl);
        if (!detail) return record;
        const availabilityStatus = detail.ok
          ? "not_found_on_page"
          : detail.availabilityStatus ?? "parser_failed";
        const raw = detail.rawEvidence;
        return refreshRecordContentHash({
          ...record,
          ticketTypes: detail.ok && detail.ticketTypes.length
            ? detail.ticketTypes
            : record.ticketTypes,
          pricesJpy: detail.ok && detail.prices.length
            ? detail.prices
            : record.pricesJpy,
          additionalFees: detail.ok
            ? detail.additionalFees
            : record.additionalFees,
          eligibility: detail.ok ? detail.eligibility : record.eligibility,
          purchaseUrls: [
            ...new Set([
              ...(record.purchaseUrls ?? []),
              ...(detail.purchaseUrls ?? []),
            ]),
          ],
          sourceChain: [
            ...(record.sourceChain ?? []),
            {
              role: "venue_detail",
              sourceId: definition.id,
              url: record.sourceUrl,
              fetchStatus: detail.ok ? "success" : availabilityStatus,
              contentHash: raw?.contentHash,
              contentType: raw?.contentType,
              httpStatus: raw?.httpStatus,
              fetchedAt: raw?.fetchedAt,
            },
            ...(detail.discoveredLinks ?? []).map((link) => ({
              role: link.role,
              sourceId: definition.id,
              url: link.url,
              fetchStatus: "not_checked",
            })),
          ],
          fieldAvailability: {
            ...record.fieldAvailability,
            ticketTypes: detail.ok && detail.ticketTypes.length
              ? "published"
              : availabilityStatus,
            prices: detail.ok && detail.prices.length
              ? "published"
              : availabilityStatus,
            additionalFees: detail.ok && detail.additionalFees.length
              ? "published"
              : availabilityStatus,
            ticketPhases: availabilityStatus,
            eligibility: detail.ok && detail.eligibility.length
              ? "published"
              : availabilityStatus,
            purchaseUrls: (
              (record.purchaseUrls?.length ?? 0) +
              (detail.purchaseUrls?.length ?? 0)
            )
              ? "published"
              : availabilityStatus,
          },
          parserErrors: detail.ok
            ? record.parserErrors
            : [
                ...(record.parserErrors ?? []),
                `yokohama-detail: ${detail.reason}`,
              ],
        });
      });
      return { records: enriched };
    },
  };
}

function zeppAdapter(context, hall) {
  const definition = {
    id: `zepp-${hall.slug}-official`,
    name: `${hall.name} 公式スケジュール`,
    type: "venue_official",
    role: "venue_schedule",
    parserIds: ["generic-jsonld", "zepp-schedule-html", "zepp-detail-html"],
    parserVersion: "1",
    url: `https://www.zepp.co.jp/hall/${hall.slug}/schedule/`,
    fetchedAt: context.generatedAt,
  };
  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const records = [];
      for (const { year, month } of context.months) {
        const url = new URL(definition.url);
        url.searchParams.set("_y", String(year));
        url.searchParams.set("_m", String(month));
        const html = await fetchText(url, {
          evidenceRole: "venue_schedule",
        });
        const parsed = parseZeppSchedule(
          html,
          {
            ...definition,
            url: url.href,
            rawEvidence: getRawEvidence(url),
          },
          { id: hall.id, name: hall.name },
        );
        records.push(...parsed);
        await recordParserResult({
          url,
          parserId: "zepp-schedule-html",
          status: "success",
          outputCount: parsed.length,
        });
      }
      const detailUrls = [...new Set(
        records
          .map((record) => record.sourceUrl),
      )];
      const details = new Map();
      for (const url of detailUrls) {
        try {
          const html = await fetchText(url, {
            evidenceRole: "venue_detail",
          });
          const detail = parseZeppDetail(html, url);
          detail.rawEvidence = getRawEvidence(url);
          details.set(url, detail);
          await recordParserResult({
            url,
            parserId: "zepp-detail-html",
            status: detail.ok ? "success" : "parser_failed",
            error: detail.ok ? undefined : detail.reason,
            outputCount: detail.ok ? 1 : 0,
          });
        } catch (error) {
          details.set(url, {
            ok: false,
            availabilityStatus: "page_fetch_failed",
            reason: error instanceof Error ? error.message : String(error),
            additionalFees: [],
            eligibility: [],
            purchaseUrls: [],
          });
          await recordParserResult({
            url,
            parserId: "zepp-detail-html",
            status: "not_run",
            error,
            outputCount: 0,
          });
        }
      }
      const enriched = records.map((record) => {
        const detail = details.get(record.sourceUrl);
        if (!detail) return record;
        if (!detail.ok) {
          const availabilityStatus =
            detail.availabilityStatus ?? "parser_failed";
          return refreshRecordContentHash({
            ...record,
            sourceChain: [
              ...(record.sourceChain ?? []),
              {
                role: "venue_detail",
                sourceId: definition.id,
                url: record.sourceUrl,
                fetchStatus: availabilityStatus,
                contentHash: detail.rawEvidence?.contentHash,
                contentType: detail.rawEvidence?.contentType,
                httpStatus: detail.rawEvidence?.httpStatus,
                fetchedAt: detail.rawEvidence?.fetchedAt,
              },
            ],
            fieldAvailability: {
              ...record.fieldAvailability,
              additionalFees: availabilityStatus,
              ticketPhases: availabilityStatus,
              eligibility: availabilityStatus,
              purchaseUrls: availabilityStatus,
            },
            parserErrors: [
              ...(record.parserErrors ?? []),
              `zepp-detail: ${detail.reason}`,
            ],
          });
        }
        return refreshRecordContentHash({
          ...record,
          sourceChain: [
            ...(record.sourceChain ?? []),
            {
              role: "venue_detail",
              sourceId: definition.id,
              url: record.sourceUrl,
              fetchStatus: "success",
              contentHash: detail.rawEvidence?.contentHash,
              contentType: detail.rawEvidence?.contentType,
              httpStatus: detail.rawEvidence?.httpStatus,
              fetchedAt: detail.rawEvidence?.fetchedAt,
            },
            ...(detail.discoveredLinks ?? []).map((link) => ({
              role: link.role,
              sourceId: definition.id,
              url: link.url,
              fetchStatus: "not_checked",
            })),
          ],
          additionalFees: detail.additionalFees,
          ticketTypes: detail.ticketTypes.length
            ? detail.ticketTypes
            : record.ticketTypes,
          pricesJpy: detail.prices.length
            ? detail.prices
            : record.pricesJpy,
          eligibility: detail.eligibility,
          purchaseUrls: detail.purchaseUrls,
          ticketUrl: detail.purchaseUrls[0],
          openTime: record.openTime || (
            detail.startTimes.length === 1 ||
            detail.startTimes.includes(record.startTime)
              ? detail.openTimes[
                  Math.max(0, detail.startTimes.indexOf(record.startTime))
                ]
              : undefined
          ),
          startTime: record.startTime || (
            detail.startTimes.length === 1
              ? detail.startTimes[0]
              : undefined
          ),
          fieldAvailability: {
            ...record.fieldAvailability,
            ticketTypes: detail.ticketTypes.length
              ? "published"
              : record.fieldAvailability.ticketTypes,
            prices: detail.prices.length
              ? "published"
              : record.fieldAvailability.prices,
            additionalFees: detail.additionalFees.length
              ? "published"
              : "not_found_on_page",
            ticketPhases: "not_found_on_page",
            eligibility: detail.eligibility.length
              ? "published"
              : "not_found_on_page",
            purchaseUrls: detail.purchaseUrls.length
              ? "published"
              : "not_found_on_page",
          },
        });
      });
      return { records: enriched };
    },
  };
}

function kenshiYonezuAdapter(context) {
  const definition = {
    id: "kenshi-yonezu-official",
    name: "米津玄師 REISSUE RECORDS",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["kenshi-tour-html"],
    parserVersion: "1",
    url: "https://reissuerecords.net/2026/07/03/2026-tour-ghost/",
    fetchedAt: context.generatedAt,
  };
  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const records = parseKenshiYonezuTour(html, {
        ...definition,
        rawEvidence: getRawEvidence(definition.url),
      });
      await recordParserResult({
        url: definition.url,
        parserId: "kenshi-tour-html",
        status: "success",
        outputCount: records.length,
      });
      return {
        records,
      };
    },
  };
}

function sheenaRingoAdapter(context) {
  const definition = {
    id: "sheena-ringo-official",
    name: "椎名林檎 SR猫柳本線",
    type: "artist_official",
    role: "artist_official",
    parserIds: ["sheena-tour-html"],
    parserVersion: "1",
    url: "https://tour.kronekodow.com/bonno_bodai2026/",
    fetchedAt: context.generatedAt,
  };
  return {
    definition,
    async collect({ fetchText, recordParserResult, getRawEvidence }) {
      const html = await fetchText(definition.url, {
        evidenceRole: "artist_official",
      });
      const records = parseSheenaRingoTour(html, {
        ...definition,
        rawEvidence: getRawEvidence(definition.url),
      });
      await recordParserResult({
        url: definition.url,
        parserId: "sheena-tour-html",
        status: "success",
        outputCount: records.length,
      });
      return {
        records,
      };
    },
  };
}

export function createOfficialSourceAdapters(context) {
  return [
    ticketmasterAdapter(context),
    yokohamaArenaAdapter(context),
    ...ZEPP_HALLS.map((hall) => zeppAdapter(context, hall)),
    kenshiYonezuAdapter(context),
    sheenaRingoAdapter(context),
  ];
}
