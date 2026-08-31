import { createHash } from "node:crypto";
import {
  applyFieldApprovals,
  createFieldEvidence,
  EVENT_FIELD_NAMES,
  mergeFieldEvidence,
} from "./event-field-model.mjs";
import { buildLegacyTicketOffers } from "./ticket-offer-lib.mjs";

export const PRIMARY_SOURCE_TYPES = new Set([
  "artist_official",
  "venue_official",
  "promoter_official",
  "ticket_official",
  "official_api",
]);

const SOURCE_PRIORITY = {
  artist_official: 3,
  promoter_official: 2.8,
  venue_official: 2,
  ticket_official: 1.8,
  official_api: 1.5,
  ticket_api: 1,
};

const VENUE_ALIASES = new Map([
  ["karenayokohama", "k-arena-yokohama"],
  ["kアリーナ横浜", "k-arena-yokohama"],
  ["長野ビッグハット", "nagano-big-hat"],
  ["宮城セキスイハイムスーパーアリーナ", "sekisui-heim-super-arena"],
  ["セキスイハイムスーパーアリーナ", "sekisui-heim-super-arena"],
  ["ポートメッセなごや第1展示館", "port-messe-nagoya"],
  ["ポートメッセなごや", "port-messe-nagoya"],
  ["zeppsapporo", "zepp-sapporo"],
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(value) {
  return cleanText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[「」『』【】()[\]（）・･,，.。'"“”‘’\s_\-–—~〜/／\\]/g, "");
}

export function normalizeJapaneseMatch(value) {
  return normalizeName(value)
    .replace(/[\u30a1-\u30f6]/gu, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .replace(/[ーｰ]/gu, "");
}

export function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return undefined;
  }
  const value = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export function splitArtistNames(value) {
  let rawText = String(value ?? "").replace(/[\u2009\u200a\u202f]+/gu, " / ");
  if ((rawText.match(/・/gu) ?? []).length >= 3) {
    rawText = rawText.replaceAll("・", " / ");
  }
  let text = cleanText(rawText);
  if (!text) return [];
  if (/出演キャンセル/u.test(text) && !/[\/／、,，×]/u.test(text)) return [];
  text = text
    .replace(/^出演者?\s*[:：]\s*ハロプロ研修生(?=[\p{sc=Han}])/u, "ハロプロ研修生 / ")
    .replace(/^出演者?\s*[:：]\s*/u, "")
    .replace(/ハロプロ研修生(?=[\p{sc=Han}])/gu, "ハロプロ研修生 / ")
    .replace(/^(WHITE SCORPION)\s+(.+)$/u, "$1 / $2")
    .replace(/^【\s*(?:day\s*\d+|第\d+部)\s*】\s*/iu, "")
    .replace(/^【\s*(?:福岡|東京|大阪|名古屋|札幌|横浜)\s*[・:：]\s*([^】]+)】$/u, "$1")
    .replace(/[【［<＜](?:guest|ゲスト|出演|opening\s*act|live\s*act)[】］>＞]/giu, " / ")
    .replace(/[■◆●・]?\s*(?:スペシャルゲスト|guest|ゲスト|opening\s*act|live\s*act|出演|vs)\s*[:：]\s*/giu, " / ")
    .replace(/\s+(?:guest|ゲスト)\s+/giu, " / ")
    .replace(/member\s*[:：]\s*/giu, " / ")
    .replace(/\s+(?:w\/|with\s+guest)\s+/giu, " / ")
    .replace(/\s+(?:他|ほか)\s*$/u, "")
    .replace(/\s*[※＊]\s*ゲストあり\s*$/u, "")
    .replace(/\s*[（(]\s*順不同\s*[）)]\s*$/u, "")
    .replace(/^[\s\-–—]*(?:day\s*\d+|第\d+部)[\s\-–—:：]*/iu, "");
  return [...new Set(
    text
      .split(/\s*(?:\/|／|、|,|，|×|\s&\s|\band\b|\bx\b)\s*/iu)
      .map((name) => cleanText(name)
        .replace(/^[▷▶◆■●+]\s*/u, "")
        .replace(/^[＜<]?(?:司会|出演)[＞>]?\s*/u, "")
        .replace(/^【[^】]+】\s*/u, "")
        .replace(/^[（(]\s*/u, "")
        .replace(/[）)]\s*$/u, "")
        .replace(/\s*[（(](?:guitar|vocal|bass|keyboards?|drums?|chorus|gt|ba|perc|tp|sax|mc|sousaphone|バンド)[^）)]*[）)]\s*$/iu, "")
        .replace(/^[^:：]{0,16}(?:演奏|member|dancer|vj|laser|costume provider)\s*[:：].*$/iu, "")
        .replace(/^MC\s*[:：]\s*/iu, "")
        .replace(/\s*→\s*出演キャンセル.*$/u, "")
        .replace(/\s*[※＊]\s*出演者.*$/u, "")
        .replace(/\s+w$/u, ""))
      .filter((name) =>
        name &&
        !/^(?:guest|ゲスト|出演者|more(?:\.{3}|…)?|coming\s*soon(?:…|\.\.\.)?|not\s*found)$/iu.test(name) &&
        !/^(?:Zepp\s|新宿(?:LOFT|MARZ|Marble|SAMURAI|Zirco|HEIST|Motion|ACB)|BAR THE LOFT|ROCK CAFE LOFT|HOLIDAY SHINJUKU|club SCIENCE)/iu.test(name),
      ),
  )];
}

export function parseJpyPrices(value) {
  const prices = [];
  for (const match of cleanText(value).matchAll(/[¥￥]\s*([\d,]+)/g)) {
    const price = Number(match[1].replaceAll(",", ""));
    if (Number.isInteger(price) && price >= 0) prices.push(price);
  }
  return [...new Set(prices)].sort((a, b) => a - b);
}

export function normalizeTime(value) {
  const match = cleanText(value).match(/(\d{1,2}):(\d{2})/u);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function makeSourceRecord(source, fields) {
  const purchaseUrls = [
    ...(fields.purchaseUrls ?? []),
    fields.ticketUrl,
  ].filter(Boolean);
  const record = {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    sourceUrl: fields.sourceUrl || source.url,
    sourceEventId: cleanText(fields.sourceEventId),
    fetchedAt: source.fetchedAt,
    title: cleanText(fields.title),
    lineupText: cleanText(fields.lineupText ?? (fields.artistNames ?? []).join(" / ")),
    artistNames: [...new Set((fields.artistNames ?? []).map(cleanText).filter(Boolean))],
    venueName: cleanText(fields.venueName),
    venueIdHint: fields.venueIdHint,
    date: fields.date,
    openTime: normalizeTime(fields.openTime),
    startTime: normalizeTime(fields.startTime),
    endDate: fields.endDate || undefined,
    ticketUrl: fields.ticketUrl || undefined,
    purchaseUrls: [...new Set(purchaseUrls)],
    ticketTypes: fields.ticketTypes ?? [],
    ticketPhases: (fields.ticketPhases ?? []).map((phase) => ({
      name: cleanText(phase.name),
      kind: phase.kind,
      start: phase.start,
      end: phase.end,
      url: phase.url,
    })),
    pricesJpy: [...new Set(fields.pricesJpy ?? [])].sort((a, b) => a - b),
    additionalFees: fields.additionalFees ?? [],
    eligibility: fields.eligibility ?? [],
    sourceChain: fields.sourceChain ?? [{
      role: source.role ?? "not_checked",
      sourceId: source.id,
      url: source.rawEvidence?.canonicalUrl ?? source.url,
      fetchStatus: "success",
      contentHash: source.rawEvidence?.contentHash,
      contentType: source.rawEvidence?.contentType,
      httpStatus: source.rawEvidence?.httpStatus,
      fetchedAt: source.rawEvidence?.fetchedAt ?? source.fetchedAt,
    }],
    fieldAvailability: fields.fieldAvailability ?? {},
    statusHint: fields.statusHint || "unknown",
  };
  return {
    ...record,
    contentHash: sha256(JSON.stringify({
      ...record,
      fetchedAt: undefined,
    })),
  };
}

export function refreshRecordContentHash(record) {
  const withoutHash = { ...record };
  delete withoutHash.contentHash;
  return {
    ...withoutHash,
    contentHash: sha256(JSON.stringify({
      ...withoutHash,
      fetchedAt: undefined,
    })),
  };
}

function buildArtistIndex(artists) {
  return artists.map((artist) => ({
    id: artist.id,
    variants: [...new Set([
      artist.nameJa,
      artist.nameZh,
      artist.romaji,
      artist.kana,
      ...(artist.aliases ?? []),
    ].map(normalizeName).filter(Boolean))],
    foldedVariants: [...new Set([
      artist.nameJa,
      artist.nameZh,
      artist.romaji,
      artist.kana,
      ...(artist.aliases ?? []),
    ].map(normalizeJapaneseMatch).filter(Boolean))],
  }));
}

function resolveArtistIds(record, artistIndex) {
  const resolved = new Set();
  const explicit = record.artistNames.map(normalizeName).filter(Boolean);

  for (const name of explicit) {
    for (const artist of artistIndex) {
      if (artist.variants.includes(name)) {
        resolved.add(artist.id);
      }
    }
  }

  if (resolved.size === 0) {
    const haystack = normalizeName(`${record.title} ${record.artistNames.join(" ")}`);
    for (const artist of artistIndex) {
      if (artist.variants.some((variant) => variant.length >= 4 && haystack === variant)) {
        resolved.add(artist.id);
      }
    }
  }

  return [...resolved].sort();
}

function unresolvedArtistNames(record, artistIndex) {
  return record.artistNames.filter((rawName) => {
    const name = normalizeName(rawName);
    if (!name) return false;
    return !artistIndex.some((artist) =>
      artist.variants.includes(name),
    );
  });
}

function artistMatchReview(record, artistIndex) {
  const reviews = [];
  for (const rawName of record.artistNames) {
    const strict = normalizeName(rawName);
    if (!strict || artistIndex.some((artist) => artist.variants.includes(strict))) continue;
    const folded = normalizeJapaneseMatch(rawName);
    const possibleArtistIds = artistIndex
      .filter((artist) => artist.foldedVariants.includes(folded))
      .map((artist) => artist.id);
    if (possibleArtistIds.length) {
      reviews.push({
        rawName,
        normalizedName: strict,
        possibleArtistIds,
        reason: "片假名/平假名或长音折叠后相同，需人工确认别名",
      });
    }
  }
  return reviews;
}

function buildVenueIndex(venues) {
  return venues.map((venue) => ({
    id: venue.id,
    variants: [...new Set([
      venue.id,
      venue.nameJa,
      venue.nameZh,
    ].map(normalizeName).filter(Boolean))],
  }));
}

function resolveVenueId(record, venueIndex, venueIds) {
  if (record.venueIdHint && venueIds.has(record.venueIdHint)) {
    return record.venueIdHint;
  }
  const normalized = normalizeName(record.venueName);
  const alias = VENUE_ALIASES.get(normalized);
  if (alias && venueIds.has(alias)) return alias;

  const exact = venueIndex.find((venue) => venue.variants.includes(normalized));
  if (exact) return exact.id;

  const contained = venueIndex
    .filter((venue) =>
      venue.variants.some((variant) =>
        variant.length >= 5 &&
        (normalized.includes(variant) || variant.includes(normalized)),
      ),
    )
    .sort((a, b) =>
      Math.max(...b.variants.map((variant) => variant.length)) -
      Math.max(...a.variants.map((variant) => variant.length)),
    )[0];
  return contained?.id;
}

function sourceSummary(record) {
  return {
    sourceId: record.sourceId,
    sourceName: record.sourceName,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    sourceEventId: record.sourceEventId,
    fetchedAt: record.fetchedAt,
    contentHash: record.contentHash,
    sourceChain: record.sourceChain ?? [],
  };
}

function sourceConfidence(sourceType) {
  if (sourceType === "artist_official") return 1;
  if (sourceType === "promoter_official") return 0.98;
  if (sourceType === "venue_official") return 0.96;
  if (sourceType === "ticket_official") return 0.94;
  if (sourceType === "official_api" || sourceType === "ticket_api") return 0.9;
  return 0.7;
}

function hasPublishedValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function fieldValue(record, artistIds, venueId, field) {
  switch (field) {
    case "title":
      return record.title;
    case "artist":
      return artistIds;
    case "venue":
      return venueId;
    case "eventDate":
      return record.date;
    case "openTime":
      return record.openTime;
    case "startTime":
      return record.startTime;
    case "ticketTypes":
      return record.ticketTypes ?? [];
    case "prices":
      return record.pricesJpy ?? [];
    case "additionalFees":
      return record.additionalFees ?? [];
    case "ticketPhases":
      return record.ticketPhases ?? [];
    case "eligibility":
      return record.eligibility ?? [];
    case "purchaseUrls":
      return record.purchaseUrls ?? [];
    default:
      return undefined;
  }
}

function buildCandidateFields(group) {
  return Object.fromEntries(
    EVENT_FIELD_NAMES.map((field) => {
      const evidence = group.map(({ record, artistIds, venueId }) => {
        const value = fieldValue(record, artistIds, venueId, field);
        const availabilityStatus = hasPublishedValue(value)
          ? "published"
          : record.fieldAvailability?.[field] ?? "not_checked";
        return createFieldEvidence({
          field,
          value: hasPublishedValue(value) ? value : undefined,
          availabilityStatus,
          source: record,
          confidence: sourceConfidence(record.sourceType),
        });
      });
      return [field, mergeFieldEvidence(field, evidence)];
    }),
  );
}

function candidateKey(record, artistIds, venueId) {
  const venuePart = venueId || normalizeName(record.venueName);
  const artistPart = artistIds.length
    ? artistIds.join("+")
    : normalizeName(record.artistNames[0] || record.title);
  return [
    record.date || "unknown-date",
    venuePart || "unknown-venue",
    artistPart || normalizeName(record.title),
    record.startTime || "unknown-time",
  ].join("|");
}

function addIssue(candidate, issue) {
  if (!candidate.issues.includes(issue)) candidate.issues.push(issue);
}

function applyConflictChecks(candidates) {
  const venueSlots = new Map();
  const artistSlots = new Map();

  for (const candidate of candidates) {
    if (candidate.venueId && candidate.date && candidate.startTime) {
      const key = `${candidate.date}|${candidate.startTime}|${candidate.venueId}`;
      const group = venueSlots.get(key) ?? [];
      group.push(candidate);
      venueSlots.set(key, group);
    }
    for (const artistId of candidate.artistIds) {
      if (!candidate.date || !candidate.startTime) continue;
      const key = `${candidate.date}|${candidate.startTime}|${artistId}`;
      const group = artistSlots.get(key) ?? [];
      group.push(candidate);
      artistSlots.set(key, group);
    }
  }

  for (const group of venueSlots.values()) {
    const identities = new Set(group.map((item) => item.artistIds.join("+") || normalizeName(item.title)));
    if (identities.size > 1) group.forEach((item) => addIssue(item, "venue_time_conflict"));
  }
  for (const group of artistSlots.values()) {
    const venues = new Set(group.map((item) => item.venueId));
    if (venues.size > 1) group.forEach((item) => addIssue(item, "artist_time_conflict"));
  }
}

function titleSimilarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value) => {
    if (value.length < 2) return new Set([value]);
    return new Set(
      Array.from({ length: value.length - 1 }, (_, index) =>
        value.slice(index, index + 2),
      ),
    );
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  const intersection = [...aGrams].filter((gram) => bGrams.has(gram)).length;
  return intersection / new Set([...aGrams, ...bGrams]).size;
}

function minutes(value) {
  if (!value) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function applyFuzzyMatchChecks(candidates) {
  const buckets = new Map();
  for (const candidate of candidates) {
    if (!candidate.date || !candidate.venueId || !candidate.artistIds.length) {
      continue;
    }
    const key = `${candidate.date}|${candidate.venueId}`;
    const group = buckets.get(key) ?? [];
    group.push(candidate);
    buckets.set(key, group);
  }

  for (const group of buckets.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < group.length;
        rightIndex += 1
      ) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        const sameArtists =
          left.artistIds.length === right.artistIds.length &&
          left.artistIds.every((id) => right.artistIds.includes(id));
        if (!sameArtists) continue;
        const similarity = titleSimilarity(left.title, right.title);
        if (similarity < 0.65) continue;
        const leftMinutes = minutes(left.startTime);
        const rightMinutes = minutes(right.startTime);
        if (
          leftMinutes !== undefined &&
          rightMinutes !== undefined &&
          Math.abs(leftMinutes - rightMinutes) > 15
        ) {
          continue;
        }
        const score = Number(
          (
            0.55 +
            similarity * 0.3 +
            (leftMinutes === undefined || rightMinutes === undefined ? 0.1 : 0.15)
          ).toFixed(3),
        );
        const attach = (candidate, possibleMatch) => {
          candidate.matchReview ??= [];
          candidate.matchReview.push({
            candidateId: possibleMatch.id,
            score,
            reason: "同日、同场馆、同艺人且标题相近，但开始时间不完整或近似",
          });
          addIssue(candidate, "possible_duplicate_match");
        };
        attach(left, right);
        attach(right, left);
      }
    }
  }
}

export function normalizeAndMerge(records, artists, venues, reviews = {}) {
  const artistIndex = buildArtistIndex(artists);
  const venueIndex = buildVenueIndex(venues);
  const venueIds = new Set(venues.map((venue) => venue.id));
  const groups = new Map();

  for (const record of records) {
    const artistIds = resolveArtistIds(record, artistIndex);
    const unresolvedNames = unresolvedArtistNames(record, artistIndex);
    const entityMatchReview = artistMatchReview(record, artistIndex);
    const venueId = resolveVenueId(record, venueIndex, venueIds);
    const key = candidateKey(record, artistIds, venueId);
    const group = groups.get(key) ?? [];
    group.push({ record, artistIds, unresolvedNames, entityMatchReview, venueId });
    groups.set(key, group);
  }

  const candidates = [...groups.entries()].map(([key, group]) => {
    group.sort((a, b) =>
      (SOURCE_PRIORITY[b.record.sourceType] ?? 0) -
      (SOURCE_PRIORITY[a.record.sourceType] ?? 0),
    );
    const preferred = group[0].record;
    const artistIds = [...new Set(group.flatMap((item) => item.artistIds))].sort();
    const venueId = group.find((item) => item.venueId)?.venueId;
    const sources = [];
    const seenSources = new Set();
    for (const { record } of group) {
      const sourceKey = `${record.sourceId}|${record.sourceEventId}`;
      if (seenSources.has(sourceKey)) continue;
      seenSources.add(sourceKey);
      sources.push(sourceSummary(record));
    }

    const issues = [];
    if (!preferred.date) issues.push("missing_date");
    if (!preferred.title) issues.push("missing_title");
    if (!artistIds.length) issues.push("unknown_artist");
    const unresolvedNames = [...new Set(
      group.flatMap((item) => item.unresolvedNames),
    )];
    if (artistIds.length && unresolvedNames.length) {
      issues.push("partial_artist_resolution");
    }
    if (!venueId) issues.push("unknown_venue");
    const hasPrimarySource = sources.some((source) => PRIMARY_SOURCE_TYPES.has(source.sourceType));
    if (!hasPrimarySource) issues.push("needs_primary_source");

    const evidenceLevel = sources.length >= 2 && hasPrimarySource
      ? "corroborated"
      : hasPrimarySource
        ? "primary_official"
        : "aggregator_only";
    const fields = buildCandidateFields(group);
    const sourceChain = group
      .flatMap((item) => item.record.sourceChain ?? [])
      .filter((entry, index, entries) =>
        entries.findIndex(
          (candidate) =>
            `${candidate.role}|${candidate.sourceId}|${candidate.url}` ===
            `${entry.role}|${entry.sourceId}|${entry.url}`,
        ) === index,
      );
    for (const [field, merged] of Object.entries(fields)) {
      if (merged.availabilityStatus === "conflicting_sources") {
        issues.push(`field_conflict:${field}`);
      }
    }

    return {
      id: `evt_${sha256(key).slice(0, 24)}`,
      canonicalKey: key,
      title: preferred.title,
      artistIds,
      artistNames: [...new Set(group.flatMap((item) => item.record.artistNames))],
      unresolvedArtistNames: unresolvedNames,
      artistMatchReview: group.flatMap((item) => item.entityMatchReview),
      lineupTexts: [...new Set(group.map((item) => item.record.lineupText).filter(Boolean))],
      venueId,
      venueName: preferred.venueName,
      date: preferred.date,
      endDate: preferred.endDate,
      openTime: preferred.openTime,
      startTime: preferred.startTime,
      pricesJpy: [...new Set(group.flatMap((item) => item.record.pricesJpy))].sort((a, b) => a - b),
      ticketTypes: group
        .flatMap((item) => item.record.ticketTypes ?? [])
        .filter((ticket, index, tickets) =>
          tickets.findIndex((item) =>
            JSON.stringify(item) === JSON.stringify(ticket),
          ) === index,
        ),
      additionalFees: group
        .flatMap((item) => item.record.additionalFees ?? [])
        .filter((fee, index, fees) =>
          fees.findIndex((item) => JSON.stringify(item) === JSON.stringify(fee)) === index,
        ),
      eligibility: group
        .flatMap((item) => item.record.eligibility ?? [])
        .filter((rule, index, rules) =>
          rules.findIndex((item) => JSON.stringify(item) === JSON.stringify(rule)) === index,
        ),
      statusHint: preferred.statusHint,
      ticketUrls: [...new Set(
        group.flatMap((item) => item.record.purchaseUrls ?? []).filter(Boolean),
      )],
      ticketPhases: group
        .flatMap((item) => item.record.ticketPhases ?? [])
        .filter((phase, index, phases) =>
          phases.findIndex((item) =>
            `${item.kind}|${item.start}|${item.end}|${item.url}` ===
            `${phase.kind}|${phase.start}|${phase.end}|${phase.url}`,
          ) === index,
        ),
      evidenceLevel,
      issues,
      sources,
      sourceChain,
      fields,
    };
  });

  applyConflictChecks(candidates);
  applyFuzzyMatchChecks(candidates);

  const approvedEntries = Array.isArray(reviews.approved) ? reviews.approved : [];
  const approved = new Map(
    approvedEntries.map((entry) =>
      typeof entry === "string"
        ? [entry, undefined]
        : [entry?.id, entry?.evidenceHash],
    ).filter(([id]) => id),
  );
  const rejected = new Set(
    (Array.isArray(reviews.rejected) ? reviews.rejected : [])
      .map((entry) => typeof entry === "string" ? entry : entry?.id)
      .filter(Boolean),
  );
  for (const candidate of candidates) {
    candidate.evidenceHash = sha256(
      candidate.sources.map((source) => source.contentHash).sort().join("|"),
    );
    const blockingIssues = candidate.issues.filter((issue) =>
      [
        "missing_date",
        "missing_title",
        "unknown_artist",
        "partial_artist_resolution",
        "unknown_venue",
        "needs_primary_source",
        "venue_time_conflict",
        "artist_time_conflict",
      ].includes(issue),
    );
    candidate.readyForReview = blockingIssues.length === 0;
    if (reviews.schemaVersion === 2) {
      if (rejected.has(candidate.id)) {
        candidate.reviewState = "rejected";
      } else {
        applyFieldApprovals(
          candidate,
          reviews,
          reviews.verifiedAt || new Date().toISOString(),
        );
      }
    } else if (rejected.has(candidate.id)) {
      candidate.reviewState = "rejected";
    } else if (approved.has(candidate.id)) {
      const approvedHash = approved.get(candidate.id);
      if (!approvedHash) {
        addIssue(candidate, "approval_requires_evidence_hash");
        candidate.reviewState = "candidate";
      } else if (approvedHash !== candidate.evidenceHash) {
        addIssue(candidate, "approval_stale");
        candidate.reviewState = "candidate";
      } else if (!candidate.readyForReview) {
        addIssue(candidate, "approval_blocked");
        candidate.reviewState = "candidate";
      } else {
        candidate.reviewState = "approved";
      }
    } else {
      candidate.reviewState = "candidate";
    }

    const fieldBlockers = Object.entries(candidate.fields ?? {})
      .filter(
        ([name, field]) =>
          [
            "title",
            "artist",
            "venue",
            "eventDate",
            "openTime",
            "startTime",
          ].includes(name) &&
          field.approvalState !== "approved",
      )
      .map(
        ([name, field]) =>
          `required_field:${name}:${field.availabilityStatus}:${field.approvalState}`,
      );
    const blockingReasons = [
      ...candidate.issues.filter((issue) =>
        [
          "missing_date",
          "missing_title",
          "unknown_artist",
          "partial_artist_resolution",
          "unknown_venue",
          "needs_primary_source",
          "venue_time_conflict",
          "artist_time_conflict",
        ].includes(issue),
      ),
      ...fieldBlockers,
    ];
    if (
      candidate.reviewState !== "approved" &&
      blockingReasons.length === 0
    ) {
      blockingReasons.push(
        candidate.reviewState === "rejected"
          ? "rejected"
          : "field_review_pending",
      );
    }
    candidate.blockingReasons = [...new Set(blockingReasons)];
    candidate.primaryBlockingReason = candidate.blockingReasons[0] ?? null;
    if (
      candidate.reviewState !== "approved" &&
      candidate.primaryBlockingReason &&
      !candidate.issues.includes(candidate.primaryBlockingReason)
    ) {
      candidate.issues.push(candidate.primaryBlockingReason);
    }
  }

  candidates.sort((a, b) =>
    `${a.date}|${a.startTime || ""}|${a.title}`.localeCompare(
      `${b.date}|${b.startTime || ""}|${b.title}`,
      "ja",
    ),
  );

  return candidates;
}

function phaseStatus(phase, today) {
  if (phase.end < today) return "closed";
  if (phase.start <= today) return "open";
  return "upcoming";
}

function publishedStatus(candidate, phases, today) {
  if (candidate.date < today) return "ended";
  if (candidate.statusHint === "sold_out") return "sold_out";
  const open = phases.filter((phase) => phase.status === "open");
  if (open.some((phase) => phase.kind === "resale")) return "resale";
  if (open.some((phase) => phase.kind.endsWith("lottery"))) return "lottery";
  if (open.some((phase) => phase.kind === "general")) return "on_sale";
  return "announced";
}

function eventType(candidate) {
  const text = `${candidate.title} ${candidate.artistNames.join(" ")}`;
  if (/(?:festival|フェス|fes\b)/iu.test(text)) return "fes";
  if (candidate.artistIds.length > 1) return "taiban";
  return "oneman";
}

function approvedField(candidate, name, fallback) {
  const field = candidate.fields?.[name];
  if (!field) return fallback;
  if (field.approvalState !== "approved") return undefined;
  return field.availabilityStatus === "published" ? field.value : undefined;
}

function publishedFieldProvenance(candidate) {
  return Object.fromEntries(
    Object.entries(candidate.fields ?? {}).map(([name, field]) => [
      name,
      {
        availabilityStatus: field.availabilityStatus,
        confidence: field.confidence,
        approvalState: field.approvalState,
        approvalHash: field.approvalHash,
        verifiedAt: field.verifiedAt ?? null,
        evidence: field.evidence.map((item) => ({
          sourceUrl: item.sourceUrl,
          sourceType: item.sourceType,
          fetchedAt: item.fetchedAt,
          verifiedAt: item.verifiedAt,
          evidenceHash: item.evidenceHash,
          confidence: item.confidence,
          availabilityStatus: item.availabilityStatus,
          rawContentHashes: item.rawContentHashes ?? [],
        })),
      },
    ]),
  );
}

export function buildPublishedEvents(approvedCandidates, generatedAt, today) {
  return approvedCandidates.map((candidate) => {
    const fieldMode = Boolean(candidate.fields);
    if (
      candidate.reviewState !== "approved" ||
      !candidate.readyForReview ||
      !candidate.sources?.length ||
      (fieldMode
        ? !candidate.requiredFieldsApproved
        : !candidate.evidenceHash || !candidate.openTime || !candidate.startTime)
    ) {
      throw new Error(`候选 ${candidate.id} 未满足正式发布条件`);
    }
    const officialSources = candidate.sources.filter((source) =>
      PRIMARY_SOURCE_TYPES.has(source.sourceType) || source.sourceType === "ticket_api",
    );
    if (!officialSources.length) {
      throw new Error(`候选 ${candidate.id} 缺少可追溯来源`);
    }

    const title = approvedField(candidate, "title", candidate.title);
    const artistIds = approvedField(candidate, "artist", candidate.artistIds);
    const venueId = approvedField(candidate, "venue", candidate.venueId);
    const date = approvedField(candidate, "eventDate", candidate.date);
    const openTime = approvedField(candidate, "openTime", candidate.openTime);
    const startTime = approvedField(candidate, "startTime", candidate.startTime);
    if (!title || !artistIds?.length || !venueId || !date || !openTime || !startTime) {
      throw new Error(`候选 ${candidate.id} 的必填字段未逐项批准`);
    }

    const ticketTypes =
      approvedField(candidate, "ticketTypes", candidate.ticketTypes) ?? [];
    const prices =
      approvedField(candidate, "prices", candidate.pricesJpy) ?? [];
    const additionalFees =
      approvedField(candidate, "additionalFees", candidate.additionalFees) ?? [];
    const eligibility =
      approvedField(candidate, "eligibility", candidate.eligibility) ?? [];
    const purchaseUrls =
      approvedField(candidate, "purchaseUrls", candidate.ticketUrls) ?? [];
    const phases = (
      approvedField(candidate, "ticketPhases", candidate.ticketPhases) ?? []
    ).map((phase) => ({
      ...phase,
      status: phaseStatus(phase, today),
    }));
    const ticketLinks = purchaseUrls.map((url) => ({
      label: phases.some((phase) => phase.url === url)
        ? "官方抽选／购票页面"
        : "官方购票／演出页面",
      url,
      purpose: "ticket",
    }));
    const ticketOffers = buildLegacyTicketOffers({
      eventId: candidate.id,
      phases,
      ticketLinks,
      eligibility,
      lastVerifiedAt: generatedAt,
      explicitSoldOut: candidate.statusHint === "sold_out",
    });

    return {
      id: candidate.id,
      artistIds,
      titleJa: title,
      titleZh: title,
      type: eventType(candidate),
      venueId,
      date,
      openTime,
      startTime,
      eventStatus: date < today ? "completed" : "scheduled",
      status: publishedStatus({ ...candidate, date }, phases, today),
      tiers: ticketTypes.length
        ? ticketTypes.map((ticket, index) => ({
            name: ticket.name || `官方公布票价 ${index + 1}`,
            priceJpy: ticket.priceJpy,
            taxIncluded: ticket.taxIncluded,
            note: ticket.notes?.join(" · ") || undefined,
          }))
        : prices.map((price, index) => ({
            name: prices.length === 1
              ? "官方公布票价"
              : `官方公布票价 ${index + 1}`,
            priceJpy: price,
          })),
      additionalFees,
      phases,
      eligibility,
      ticketLinks,
      ticketOffers,
      fieldProvenance: fieldMode
        ? publishedFieldProvenance(candidate)
        : undefined,
      availability: fieldMode
        ? Object.fromEntries(
            Object.entries(candidate.fields).map(([name, field]) => [
              name,
              field.availabilityStatus,
            ]),
          )
        : undefined,
      verification: {
        state: "verified",
        checkedAt: generatedAt,
        evidenceHash: fieldMode
          ? sha256(
              Object.values(candidate.fields)
                .filter((field) => field.approvalState === "approved")
                .map((field) => field.approvalHash)
                .sort()
                .join("|"),
            )
          : candidate.evidenceHash,
        sources: officialSources.map((source) => ({
          name: source.sourceName,
          type: source.sourceType,
          url: source.sourceUrl,
          fetchedAt: source.fetchedAt,
        })),
      },
      tags: ["官方来源"],
    };
  });
}

export function buildIngestReport(candidates, sourceResults, reviews = {}, generatedAt) {
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const reviewedIds = [
    ...(Array.isArray(reviews.approved) ? reviews.approved : []),
    ...(Array.isArray(reviews.rejected) ? reviews.rejected : []),
  ].map((entry) => typeof entry === "string" ? entry : entry?.id).filter(Boolean);
  const issueCounts = {};
  for (const candidate of candidates) {
    for (const issue of candidate.issues) {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }
  }

  return {
    generatedAt,
    summary: {
      sourceCount: sourceResults.length,
      successfulSources: sourceResults.filter((result) => result.status === "ok").length,
      failedSources: sourceResults.filter((result) => result.status === "failed").length,
      skippedSources: sourceResults.filter((result) => result.status === "skipped").length,
      candidateCount: candidates.length,
      readyForReview: candidates.filter((candidate) => candidate.readyForReview).length,
      approved: candidates.filter((candidate) => candidate.reviewState === "approved").length,
      rejected: candidates.filter((candidate) => candidate.reviewState === "rejected").length,
    },
    issueCounts,
    matchReviewQueue: candidates
      .filter((candidate) => candidate.matchReview?.length)
      .map((candidate) => ({
        eventId: candidate.id,
        title: candidate.title,
        date: candidate.date,
        venueId: candidate.venueId,
        possibleMatches: candidate.matchReview,
      })),
    staleReviewIds: [...new Set(reviewedIds.filter((id) => !ids.has(id)))],
    sources: sourceResults,
  };
}
