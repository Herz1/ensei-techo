import { createHash } from "node:crypto";

export const AVAILABILITY_STATUSES = [
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
];

export const EVENT_FIELD_NAMES = [
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

export const REQUIRED_PUBLISH_FIELDS = [
  "title",
  "artist",
  "venue",
  "eventDate",
  "openTime",
  "startTime",
];

const STATUS_PRIORITY = {
  conflicting_sources: 10,
  blocked: 9,
  page_fetch_failed: 8,
  parser_failed: 7,
  pending_review: 6,
  not_checked: 5,
  not_found_on_page: 4,
  not_announced: 3,
  source_does_not_disclose: 2,
  published: 1,
};

const ADDITIVE_FIELDS = new Set([
  "ticketTypes",
  "prices",
  "additionalFees",
  "ticketPhases",
  "eligibility",
  "purchaseUrls",
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function fieldEvidenceHash(field, value, availabilityStatus, source) {
  const payload = {
    field,
    value: stableValue(value),
    availabilityStatus,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    sourceType: source.sourceType,
    rawContentHashes: [
      ...new Set(
        (source.sourceChain ?? [])
          .map((entry) => entry.contentHash)
          .filter(Boolean),
      ),
    ],
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createFieldEvidence({
  field,
  value,
  availabilityStatus,
  source,
  confidence = 1,
}) {
  if (!EVENT_FIELD_NAMES.includes(field)) {
    throw new Error(`未知事件字段：${field}`);
  }
  if (!AVAILABILITY_STATUSES.includes(availabilityStatus)) {
    throw new Error(`未知缺失状态：${availabilityStatus}`);
  }
  return {
    value,
    availabilityStatus,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    sourceType: source.sourceType,
    rawContentHashes: [
      ...new Set(
        (source.sourceChain ?? [])
          .map((entry) => entry.contentHash)
          .filter(Boolean),
      ),
    ],
    fetchedAt: source.fetchedAt,
    verifiedAt: null,
    evidenceHash: fieldEvidenceHash(
      field,
      value,
      availabilityStatus,
      source,
    ),
    confidence,
  };
}

function valueKey(value) {
  return JSON.stringify(stableValue(value));
}

function mergeAdditiveValues(field, groups) {
  const unique = new Map();
  for (const group of groups) {
    for (const item of group[0].value) {
      unique.set(valueKey(item), item);
    }
  }
  const merged = [...unique.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  if (field === "prices") {
    return merged.sort((a, b) => a - b);
  }
  return merged;
}

export function mergeFieldEvidence(field, evidence) {
  const published = evidence.filter(
    (item) => item.availabilityStatus === "published",
  );
  const distinctPublished = new Map();
  for (const item of published) {
    const key = valueKey(item.value);
    const group = distinctPublished.get(key) ?? [];
    group.push(item);
    distinctPublished.set(key, group);
  }

  if (distinctPublished.size > 1 && ADDITIVE_FIELDS.has(field)) {
    const value = mergeAdditiveValues(field, [...distinctPublished.values()]);
    return {
      value,
      availabilityStatus: "published",
      confidence: Math.max(...published.map((item) => item.confidence)),
      evidence,
      approvalHash: createHash("sha256")
        .update(
          `${valueKey(value)}|${published
            .map((item) => item.evidenceHash)
            .sort()
            .join("|")}`,
        )
        .digest("hex"),
      approvalState: "pending_review",
    };
  }

  if (distinctPublished.size > 1) {
    return {
      value: undefined,
      availabilityStatus: "conflicting_sources",
      confidence: Math.max(...published.map((item) => item.confidence)),
      evidence,
      conflicts: [...distinctPublished.values()].map((group) => ({
        value: group[0].value,
        evidenceHashes: group.map((item) => item.evidenceHash),
      })),
      approvalState: "conflict",
    };
  }

  if (distinctPublished.size === 1) {
    const group = [...distinctPublished.values()][0];
    return {
      value: group[0].value,
      availabilityStatus: "published",
      confidence: Math.max(...group.map((item) => item.confidence)),
      evidence,
      approvalHash: createHash("sha256")
        .update(group.map((item) => item.evidenceHash).sort().join("|"))
        .digest("hex"),
      approvalState: "pending_review",
    };
  }

  const availabilityStatus = evidence
    .map((item) => item.availabilityStatus)
    .sort((a, b) => STATUS_PRIORITY[b] - STATUS_PRIORITY[a])[0] ??
    "pending_review";
  const relevant = evidence.filter(
    (item) => item.availabilityStatus === availabilityStatus,
  );
  return {
    value: undefined,
    availabilityStatus,
    confidence: relevant.length
      ? Math.max(...relevant.map((item) => item.confidence))
      : 0,
    evidence,
    approvalHash: relevant.length
      ? createHash("sha256")
          .update(relevant.map((item) => item.evidenceHash).sort().join("|"))
          .digest("hex")
      : undefined,
    approvalState: "pending_review",
  };
}

export function applyFieldApprovals(candidate, reviews, verifiedAt) {
  const eventReview = (reviews.events ?? []).find(
    (item) => item.id === candidate.id,
  );
  for (const [field, merged] of Object.entries(candidate.fields)) {
    const approvedHash = eventReview?.fields?.[field];
    if (merged.availabilityStatus === "conflicting_sources") {
      merged.approvalState = "conflict";
      continue;
    }
    if (!approvedHash) {
      merged.approvalState = "pending_review";
      continue;
    }
    if (approvedHash !== merged.approvalHash) {
      merged.approvalState = "changed";
      continue;
    }
    merged.approvalState = "approved";
    merged.verifiedAt = eventReview.verifiedAt || verifiedAt;
    merged.evidence = merged.evidence.map((item) => ({
      ...item,
      verifiedAt: eventReview.verifiedAt || verifiedAt,
    }));
  }

  candidate.approvedFieldCount = Object.values(candidate.fields).filter(
    (field) => field.approvalState === "approved",
  ).length;
  candidate.requiredFieldsApproved = REQUIRED_PUBLISH_FIELDS.every(
    (field) => candidate.fields[field]?.approvalState === "approved",
  );
  candidate.reviewState = candidate.requiredFieldsApproved
    ? "approved"
    : "candidate";
  return candidate;
}

export function buildReviewMigration(candidates, verifiedAt) {
  return {
    schemaVersion: 2,
    verifiedAt,
    events: candidates
      .filter((candidate) => candidate.readyForReview)
      .map((candidate) => ({
        id: candidate.id,
        verifiedAt,
        fields: Object.fromEntries(
          Object.entries(candidate.fields)
            .filter(([, field]) => field.approvalHash)
            .map(([name, field]) => [name, field.approvalHash]),
        ),
      })),
    rejected: [],
  };
}
