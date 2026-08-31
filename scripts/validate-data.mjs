import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dataUrl = new URL("../src/data/", import.meta.url);
const baseArtists = readJson("artists.json");
const ingestedArtists = readJson("artists-ingested.json");
const artists = [...baseArtists, ...ingestedArtists];
const baseVenues = readJson("venues.json");
const ingestedVenues = readJson("venues-ingested.json");
const venues = [...baseVenues, ...ingestedVenues];
const events = readJson("events.json");
const approvedEvents = readJson("ingest/approved.json");
const candidates = readJson("ingest/candidates.json");
const rawManifest = readJsonObject("ingest/raw-manifest.json", null);
const errors = [];

const eventStatuses = new Set([
  "announced",
  "lottery",
  "on_sale",
  "sold_out",
  "resale",
  "ended",
]);
const eventLifecycleStatuses = new Set([
  "scheduled",
  "postponed",
  "cancelled",
  "rescheduled",
  "completed",
]);
const ticketSaleStatuses = new Set(["announced", "not_started", "open", "closed", "unknown"]);
const ticketInventoryStatuses = new Set(["available", "low", "sold_out", "unknown"]);
const ticketProviders = new Set(["eplus", "pia", "lawson", "ticketbook", "other"]);
const ticketUrlKinds = new Set(["event_detail", "generic_provider", "search", "support", "refund", "unknown"]);
const ticketSaleTypes = new Set(["fan_club_lottery", "playguide_lottery", "general_sale", "official_resale", "other"]);
const eventTypes = new Set([
  "oneman",
  "taiban",
  "fes",
  "idol_seiyu",
  "release_event",
]);
const venueTiers = new Set(["livehouse", "hall", "arena", "dome", "stadium"]);
const phaseStatuses = new Set(["upcoming", "open", "closed"]);
const phaseKinds = new Set([
  "fc_lottery",
  "playguide_lottery",
  "general",
  "resale",
]);
const modelKeys = new Set(["tokyo-dome", "budokan", "yokohama-arena"]);
const availabilityStatuses = new Set([
  "not_checked",
  "not_found_on_page",
  "published",
  "not_announced",
  "source_does_not_disclose",
  "parser_failed",
  "page_fetch_failed",
  "blocked",
  "pending_review",
  "conflicting_sources",
]);
const fieldNames = [
  "title",
  "artist",
  "venue",
  "eventDate",
  "openTime",
  "startTime",
  "ticketTypes",
  "prices",
  "additionalFees",
  "ticketPhases",
  "eligibility",
  "purchaseUrls",
];
const requiredPublishFields = new Set([
  "title",
  "artist",
  "venue",
  "eventDate",
  "openTime",
  "startTime",
]);
const sourceTypes = new Set([
  "artist_official",
  "venue_official",
  "promoter_official",
  "ticket_official",
  "official_api",
  "ticket_api",
]);
const sourceRoles = new Set([
  "venue_schedule",
  "venue_detail",
  "artist_official",
  "promoter_official",
  "ticket_detail",
  "structured_api",
]);

function readJson(filename) {
  const value = JSON.parse(readFileSync(new URL(filename, dataUrl), "utf8"));
  if (!Array.isArray(value)) {
    throw new Error(`${filename} 的顶层结构必须是数组`);
  }
  return value;
}

function readJsonObject(filename, fallback) {
  const url = new URL(filename, dataUrl);
  if (!existsSync(url)) return fallback;
  const value = JSON.parse(readFileSync(url, "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${filename} 的顶层结构必须是对象`);
  }
  return value;
}

function addError(path, message) {
  errors.push(`${path}: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function collectIds(items, label) {
  const ids = new Set();
  items.forEach((item, index) => {
    const path = `${label}[${index}].id`;
    if (!isNonEmptyString(item?.id)) {
      addError(path, "必须是非空字符串");
      return;
    }
    if (ids.has(item.id)) {
      addError(path, `ID 重复：${item.id}`);
    }
    ids.add(item.id);
  });
  return ids;
}

const artistIds = collectIds(artists, "artists");
const venueIds = collectIds(venues, "venues");
collectIds(events, "events");
const approvedById = new Map(approvedEvents.map((event) => [event.id, event]));

if (events.length !== approvedEvents.length) {
  addError(
    "events",
    `正式库 ${events.length} 条与已批准库 ${approvedEvents.length} 条不一致，请重新执行 npm run publish:events`,
  );
}

artists.forEach((artist, index) => {
  const path = `artists[${index}]`;
  if (!isNonEmptyString(artist.nameJa)) {
    addError(`${path}.nameJa`, "必须是非空字符串");
  }
  if (artist.profileStatus === "minimal") {
    for (const field of ["nameZh", "romaji", "kana"]) {
      if (artist[field] !== null) {
        addError(`${path}.${field}`, "最小实体的未知资料必须显式为 null");
      }
    }
    if (
      artist.verification?.state !== "verified" ||
      !isNonEmptyString(artist.verification?.checkedAt) ||
      !isNonEmptyString(artist.verification?.evidenceHash) ||
      !Array.isArray(artist.verification?.sources) ||
      artist.verification.sources.length === 0
    ) {
      addError(`${path}.verification`, "最小艺人实体必须带来源、时间和证据哈希");
    }
  } else {
    for (const field of ["nameZh", "romaji"]) {
      if (!isNonEmptyString(artist[field])) {
        addError(`${path}.${field}`, "必须是非空字符串");
      }
    }
    if (typeof artist.kana !== "string") {
      addError(`${path}.kana`, "必须是字符串；未知假名可留空");
    }
  }
  if (!Array.isArray(artist.genres)) {
    addError(`${path}.genres`, "必须是数组");
  }
  if (
    artist.popularity !== undefined &&
    (!Number.isFinite(artist.popularity) || artist.popularity < 0)
  ) {
    addError(`${path}.popularity`, "必须是非负数");
  }
});

venues.forEach((venue, index) => {
  const path = `venues[${index}]`;
  for (const field of ["nameJa", "prefecture"]) {
    if (!isNonEmptyString(venue[field])) {
      addError(`${path}.${field}`, "必须是非空字符串");
    }
  }
  if (venue.profileStatus === "minimal") {
    for (const field of ["nameZh", "lat", "lng", "capacity", "tier"]) {
      if (venue[field] !== null) {
        addError(`${path}.${field}`, "最小实体的未知资料必须显式为 null");
      }
    }
    if (venue.city !== null && !isNonEmptyString(venue.city)) {
      addError(`${path}.city`, "必须是非空字符串或 null");
    }
    if (
      venue.verification?.state !== "verified" ||
      !isNonEmptyString(venue.verification?.checkedAt) ||
      !isNonEmptyString(venue.verification?.evidenceHash) ||
      !Array.isArray(venue.verification?.sources) ||
      venue.verification.sources.length === 0
    ) {
      addError(`${path}.verification`, "最小场馆实体必须带来源、时间和证据哈希");
    }
  } else {
    for (const field of ["nameZh", "city"]) {
      if (!isNonEmptyString(venue[field])) {
        addError(`${path}.${field}`, "必须是非空字符串");
      }
    }
    if (!Number.isFinite(venue.lat) || venue.lat < -90 || venue.lat > 90) {
      addError(`${path}.lat`, "纬度必须在 -90 到 90 之间");
    }
    if (!Number.isFinite(venue.lng) || venue.lng < -180 || venue.lng > 180) {
      addError(`${path}.lng`, "经度必须在 -180 到 180 之间");
    }
    if (!Number.isInteger(venue.capacity) || venue.capacity <= 0) {
      addError(`${path}.capacity`, "必须是正整数");
    }
    if (!venueTiers.has(venue.tier)) {
      addError(`${path}.tier`, `未知场馆类型：${venue.tier}`);
    }
  }
  if (venue.model3d && !modelKeys.has(venue.model3d)) {
    addError(`${path}.model3d`, `未知 3D 模型：${venue.model3d}`);
  }
});

events.forEach((event, index) => {
  const path = `events[${index}]`;
  const approved = approvedById.get(event.id);
  if (!approved || approved.reviewState !== "approved") {
    addError(path, "记录不存在于已批准候选库");
  } else {
    const factualFields = [
      ["titleJa", "title"],
      ["venueId", "venue"],
      ["date", "eventDate"],
      ["openTime", "openTime"],
      ["startTime", "startTime"],
    ];
    for (const [publishedField, fieldName] of factualFields) {
      const approvedField = approved.fields?.[fieldName];
      if (
        approvedField?.approvalState !== "approved" ||
        approvedField.availabilityStatus !== "published" ||
        event[publishedField] !== approvedField.value
      ) {
        addError(
          `${path}.${publishedField}`,
          "与字段级批准值不一致",
        );
      }
    }
    if (
      JSON.stringify([...event.artistIds].sort()) !==
      JSON.stringify([...(approved.fields?.artist?.value ?? [])].sort())
    ) {
      addError(`${path}.artistIds`, "与已批准候选不一致");
    }
    const expectedEventHash = createHash("sha256")
      .update(
        Object.values(approved.fields ?? {})
          .filter((field) => field.approvalState === "approved")
          .map((field) => field.approvalHash)
          .sort()
          .join("|"),
      )
      .digest("hex");
    if (event.verification?.evidenceHash !== expectedEventHash) {
      addError(
        `${path}.verification.evidenceHash`,
        "与字段级批准哈希集合不一致",
      );
    }
  }
  if (!Array.isArray(event.artistIds) || event.artistIds.length === 0) {
    addError(`${path}.artistIds`, "至少需要一位艺人");
  } else {
    event.artistIds.forEach((artistId, artistIndex) => {
      if (!artistIds.has(artistId)) {
        addError(`${path}.artistIds[${artistIndex}]`, `引用了不存在的艺人：${artistId}`);
      }
    });
  }
  if (!venueIds.has(event.venueId)) {
    addError(`${path}.venueId`, `引用了不存在的场馆：${event.venueId}`);
  }
  if (!isNonEmptyString(event.titleJa) || !isNonEmptyString(event.titleZh)) {
    addError(`${path}.title`, "日文和中文标题都不能为空");
  }
  if (!isValidDate(event.date)) {
    addError(`${path}.date`, `日期格式无效：${event.date}`);
  }
  if (!isValidTime(event.openTime)) {
    addError(`${path}.openTime`, `时间格式无效：${event.openTime}`);
  }
  if (!isValidTime(event.startTime)) {
    addError(`${path}.startTime`, `时间格式无效：${event.startTime}`);
  }
  if (!eventTypes.has(event.type)) {
    addError(`${path}.type`, `未知演出类型：${event.type}`);
  }
  if (!eventStatuses.has(event.status)) {
    addError(`${path}.status`, `未知演出状态：${event.status}`);
  }
  if (!eventLifecycleStatuses.has(event.eventStatus)) {
    addError(`${path}.eventStatus`, `未知演出生命周期状态：${event.eventStatus}`);
  }
  if (!Array.isArray(event.tiers)) {
    addError(`${path}.tiers`, "必须是数组");
  } else {
    event.tiers.forEach((tier, tierIndex) => {
      if (!isNonEmptyString(tier.name)) {
        addError(`${path}.tiers[${tierIndex}].name`, "票档名称不能为空");
      }
      if (!Number.isInteger(tier.priceJpy) || tier.priceJpy < 0) {
        addError(`${path}.tiers[${tierIndex}].priceJpy`, "票价必须是非负整数");
      }
      if (
        tier.taxIncluded !== undefined &&
        tier.taxIncluded !== null &&
        typeof tier.taxIncluded !== "boolean"
      ) {
        addError(`${path}.tiers[${tierIndex}].taxIncluded`, "含税状态必须为布尔值或 null");
      }
    });
  }
  if (!Array.isArray(event.additionalFees)) {
    addError(`${path}.additionalFees`, "必须是数组");
  } else {
    event.additionalFees.forEach((fee, feeIndex) => {
      const feePath = `${path}.additionalFees[${feeIndex}]`;
      if (!isNonEmptyString(fee.label)) addError(`${feePath}.label`, "不能为空");
      if (
        fee.amountJpy !== null &&
        (!Number.isInteger(fee.amountJpy) || fee.amountJpy < 0)
      ) {
        addError(`${feePath}.amountJpy`, "必须是非负整数或 null");
      }
    });
  }
  if (!Array.isArray(event.phases)) {
    addError(`${path}.phases`, "必须是数组");
  } else {
    event.phases.forEach((phase, phaseIndex) => {
      const phasePath = `${path}.phases[${phaseIndex}]`;
      if (!isNonEmptyString(phase.name)) {
        addError(`${phasePath}.name`, "阶段名称不能为空");
      }
      if (!phaseKinds.has(phase.kind)) {
        addError(`${phasePath}.kind`, `未知售票阶段：${phase.kind}`);
      }
      if (!phaseStatuses.has(phase.status)) {
        addError(`${phasePath}.status`, `未知阶段状态：${phase.status}`);
      }
      if (!isValidDate(phase.start) || !isValidDate(phase.end)) {
        addError(phasePath, `日期范围无效：${phase.start} 至 ${phase.end}`);
      } else if (phase.start > phase.end) {
        addError(phasePath, "开始日期不能晚于结束日期");
      }
      if (phase.url && !isHttpUrl(phase.url)) {
        addError(`${phasePath}.url`, "必须是 HTTP(S) 官方页面");
      }
    });
  }
  if (!Array.isArray(event.ticketLinks)) {
    addError(`${path}.ticketLinks`, "必须是数组");
  } else {
    event.ticketLinks.forEach((link, linkIndex) => {
      const linkPath = `${path}.ticketLinks[${linkIndex}]`;
      if (!isNonEmptyString(link.label)) {
        addError(`${linkPath}.label`, "链接名称不能为空");
      }
      if (!isHttpUrl(link.url)) {
        addError(`${linkPath}.url`, "必须是 HTTP(S) 官方页面");
      }
      if (!["ticket", "official_info"].includes(link.purpose)) {
        addError(`${linkPath}.purpose`, "未知链接用途");
      }
    });
  }
  if (!Array.isArray(event.ticketOffers)) {
    addError(`${path}.ticketOffers`, "必须是数组");
  } else {
    const offerIds = new Set();
    event.ticketOffers.forEach((offer, offerIndex) => {
      const offerPath = `${path}.ticketOffers[${offerIndex}]`;
      if (!isNonEmptyString(offer.id) || offerIds.has(offer.id)) {
        addError(`${offerPath}.id`, "必须是当前演出内唯一的非空 ID");
      }
      offerIds.add(offer.id);
      if (offer.eventId !== event.id) addError(`${offerPath}.eventId`, "必须引用所属演出");
      if (!ticketProviders.has(offer.provider)) addError(`${offerPath}.provider`, "未知票务渠道");
      if (!ticketUrlKinds.has(offer.urlKind)) addError(`${offerPath}.urlKind`, "未知 URL 类型");
      if (!ticketSaleTypes.has(offer.saleType)) addError(`${offerPath}.saleType`, "未知售票类型");
      if (!ticketSaleStatuses.has(offer.saleStatus)) addError(`${offerPath}.saleStatus`, "未知受付状态");
      if (!ticketInventoryStatuses.has(offer.inventoryStatus)) addError(`${offerPath}.inventoryStatus`, "未知库存状态");
      if (!isHttpUrl(offer.url) || !isHttpUrl(offer.sourceUrl)) addError(`${offerPath}.url`, "必须是 HTTP(S) 来源");
      if (!isNonEmptyString(offer.lastVerifiedAt) || Number.isNaN(Date.parse(offer.lastVerifiedAt))) addError(`${offerPath}.lastVerifiedAt`, "必须是有效时间");
      for (const nullableDate of ["startAt", "endAt", "resultAt", "paymentDeadline"]) {
        if (offer[nullableDate] !== null && Number.isNaN(Date.parse(offer[nullableDate]))) addError(`${offerPath}.${nullableDate}`, "必须是有效时间或 null");
      }
      if (offer.ticketDisplayAt !== undefined && offer.ticketDisplayAt !== null && Number.isNaN(Date.parse(offer.ticketDisplayAt))) {
        addError(`${offerPath}.ticketDisplayAt`, "必须是有效时间、null 或省略");
      }
      if (!Array.isArray(offer.eligibility)) addError(`${offerPath}.eligibility`, "必须是数组");
      if (![null, true, false].includes(offer.requiresJapanesePhone)) addError(`${offerPath}.requiresJapanesePhone`, "必须是布尔值或 null");
      if (![null, true, false].includes(offer.identityCheck)) addError(`${offerPath}.identityCheck`, "必须是布尔值或 null");
      for (const optionalText of ["membershipRequirement", "regionRestriction", "phoneVerification", "companionRestriction", "ticketDistribution"]) {
        if (offer[optionalText] !== undefined && offer[optionalText] !== null && !isNonEmptyString(offer[optionalText])) {
          addError(`${offerPath}.${optionalText}`, "必须是非空字符串、null 或省略");
        }
      }
      if (!["confirmed", "probable"].includes(offer.matchLevel)) addError(`${offerPath}.matchLevel`, "未知事件匹配级别");
    });
  }
  if (!Array.isArray(event.eligibility)) {
    addError(`${path}.eligibility`, "必须是数组");
  }
  if (!event.availability || !event.fieldProvenance) {
    addError(path, "缺少字段级 availability 或 provenance");
  } else {
    for (const fieldName of fieldNames) {
      const availability = event.availability[fieldName];
      const provenance = event.fieldProvenance[fieldName];
      if (!availabilityStatuses.has(availability)) {
        addError(`${path}.availability.${fieldName}`, "未知字段缺失状态");
      }
      if (!provenance || provenance.availabilityStatus !== availability) {
        addError(`${path}.fieldProvenance.${fieldName}`, "与 availability 不一致");
        continue;
      }
      const mayRemainUnapproved =
        !requiredPublishFields.has(fieldName) &&
        [
          "not_checked",
          "not_found_on_page",
          "parser_failed",
          "page_fetch_failed",
          "blocked",
          "pending_review",
          "conflicting_sources",
        ].includes(
          availability,
        );
      if (
        (!mayRemainUnapproved &&
          (provenance.approvalState !== "approved" ||
            !isNonEmptyString(provenance.approvalHash) ||
            !isNonEmptyString(provenance.verifiedAt))) ||
        (mayRemainUnapproved &&
          !["pending_review", "changed", "conflict"].includes(
            provenance.approvalState,
          ))
      ) {
        addError(
          `${path}.fieldProvenance.${fieldName}`,
          "正式库必填/已披露字段必须逐项批准；解析失败等可选字段必须保留待处理状态",
        );
      }
      if (!Array.isArray(provenance.evidence) || provenance.evidence.length === 0) {
        addError(`${path}.fieldProvenance.${fieldName}.evidence`, "证据不能为空");
      } else {
        provenance.evidence.forEach((evidence, evidenceIndex) => {
          const evidencePath =
            `${path}.fieldProvenance.${fieldName}.evidence[${evidenceIndex}]`;
          if (
            !isHttpUrl(evidence.sourceUrl) ||
            !sourceTypes.has(evidence.sourceType) ||
            !isNonEmptyString(evidence.fetchedAt) ||
            (!mayRemainUnapproved && !isNonEmptyString(evidence.verifiedAt)) ||
            !isNonEmptyString(evidence.evidenceHash) ||
            !Number.isFinite(evidence.confidence) ||
            evidence.confidence < 0 ||
            evidence.confidence > 1 ||
            !availabilityStatuses.has(evidence.availabilityStatus)
          ) {
            addError(evidencePath, "字段证据元数据不完整");
          }
          if (
            !Array.isArray(evidence.rawContentHashes) ||
            evidence.rawContentHashes.length === 0 ||
            evidence.rawContentHashes.some(
              (hash) => !/^[a-f0-9]{64}$/u.test(hash),
            )
          ) {
            addError(
              `${evidencePath}.rawContentHashes`,
              "正式字段证据必须引用原始响应哈希",
            );
          }
        });
      }
    }
  }
  if (
    event.verification?.state !== "verified" ||
    !isNonEmptyString(event.verification?.evidenceHash) ||
    !isNonEmptyString(event.verification?.checkedAt)
  ) {
    addError(`${path}.verification`, "正式演出必须带核验状态、时间和证据哈希");
  }
  if (!Array.isArray(event.verification?.sources) || event.verification.sources.length === 0) {
    addError(`${path}.verification.sources`, "至少需要一个可追溯来源");
  } else {
    event.verification.sources.forEach((source, sourceIndex) => {
      const sourcePath = `${path}.verification.sources[${sourceIndex}]`;
      if (!isNonEmptyString(source.name) || !isHttpUrl(source.url)) {
        addError(sourcePath, "来源名称与 HTTP(S) 页面不能为空");
      }
      if (!sourceTypes.has(source.type)) {
        addError(`${sourcePath}.type`, "未知来源类型");
      }
    });
  }
  if ("wantCount" in event || "viewCount" in event) {
    addError(path, "正式演出不得包含 Demo 想看数或浏览量");
  }
});

candidates.forEach((candidate, candidateIndex) => {
  const candidatePath = `ingest/candidates.json[${candidateIndex}]`;
  if (!Array.isArray(candidate.sourceChain) || candidate.sourceChain.length === 0) {
    addError(`${candidatePath}.sourceChain`, "候选必须包含至少一个来源链节点");
  } else {
    candidate.sourceChain.forEach((entry, entryIndex) => {
      const entryPath = `${candidatePath}.sourceChain[${entryIndex}]`;
      if (!sourceRoles.has(entry.role)) {
        addError(`${entryPath}.role`, `未知来源链角色：${entry.role}`);
      }
      if (!isHttpUrl(entry.url) || !isNonEmptyString(entry.sourceId)) {
        addError(entryPath, "来源链必须包含 sourceId 和 HTTP(S) URL");
      }
      if (
        entry.fetchStatus === "success" &&
        (!isNonEmptyString(entry.contentHash) ||
          !Number.isInteger(entry.httpStatus))
      ) {
        addError(entryPath, "成功来源链节点必须包含原始内容哈希和 HTTP 状态");
      }
    });
  }
  if (
    candidate.reviewState !== "approved" &&
    (!Array.isArray(candidate.issues) || candidate.issues.length === 0)
  ) {
    addError(candidatePath, "未发布候选必须包含明确阻塞或待处理原因");
  }
  for (const [fieldName, field] of Object.entries(candidate.fields ?? {})) {
    if (field.availabilityStatus !== "source_does_not_disclose") continue;
    if (
      candidate.sourceChain.some(
        (entry) =>
          ["not_checked", "page_fetch_failed", "parser_failed"].includes(
            entry.fetchStatus,
          ),
      )
    ) {
      addError(
        `${candidatePath}.fields.${fieldName}`,
        "来源链尚未完整检查，不得标记 source_does_not_disclose",
      );
    }
    if (
      field.evidence?.some(
        (evidence) =>
          !Array.isArray(evidence.rawContentHashes) ||
          evidence.rawContentHashes.length === 0,
      )
    ) {
      addError(
        `${candidatePath}.fields.${fieldName}`,
        "source_does_not_disclose 必须引用原始响应哈希",
      );
    }
  }
});

if (!rawManifest) {
  addError("ingest/raw-manifest.json", "缺少原始响应采集清单");
} else {
  if (!isNonEmptyString(rawManifest.batchId) || !Array.isArray(rawManifest.entries)) {
    addError("ingest/raw-manifest.json", "缺少 batchId 或 entries");
  } else {
    rawManifest.entries.forEach((entry, index) => {
      const entryPath = `ingest/raw-manifest.json.entries[${index}]`;
      if (
        !isNonEmptyString(entry.sourceId) ||
        !sourceRoles.has(entry.sourceRole) ||
        !isHttpUrl(entry.requestedUrl) ||
        !isNonEmptyString(entry.fetchedAt) ||
        !Array.isArray(entry.parserIds) ||
        entry.parserIds.length === 0 ||
        !isNonEmptyString(entry.parserVersion)
      ) {
        addError(entryPath, "原始响应元数据不完整");
      }
      if (["success", "cache_reused"].includes(entry.fetchStatus)) {
        if (
          !isHttpUrl(entry.canonicalUrl) ||
          !Number.isInteger(entry.httpStatus) ||
          !isNonEmptyString(entry.contentType) ||
          !isNonEmptyString(entry.contentHash) ||
          !isNonEmptyString(entry.rawFile)
        ) {
          addError(entryPath, "成功响应缺少 URL、HTTP、类型、哈希或原始文件");
        } else {
          const rawUrl = new URL(`ingest/${entry.rawFile}`, dataUrl);
          if (!existsSync(rawUrl)) {
            addError(`${entryPath}.rawFile`, "原始响应文件不存在");
          } else {
            const actualHash = createHash("sha256")
              .update(readFileSync(rawUrl))
              .digest("hex");
            if (actualHash !== entry.contentHash) {
              addError(`${entryPath}.contentHash`, "与原始响应文件不一致");
            }
          }
        }
        if (entry.parserStatus === "not_recorded") {
          addError(`${entryPath}.parserStatus`, "成功响应未记录 parser 结果");
        }
      }
    });
  }
}

if (errors.length > 0) {
  console.error(`数据校验失败，共 ${errors.length} 项：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `数据校验通过：${artists.length} 位艺人、${venues.length} 个场馆、${events.length} 场演出。`,
  );
}
