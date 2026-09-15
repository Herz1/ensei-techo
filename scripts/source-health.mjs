const FETCH_SUCCESS = new Set(["success", "cache_reused"]);
const ACTIONABLE_STATES = new Set([
  "unexpected_zero",
  "parser_failed",
  "fetch_failed",
  "degraded",
  "failed",
]);

function normalizeMonthKey({ year, month }) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function sameWindow(previous, monthKeys) {
  const prior = previous?.collectionWindow?.months;
  if (!Array.isArray(prior)) return false;
  return JSON.stringify(prior) === JSON.stringify(monthKeys);
}

function expectedZeroPolicy(sourceId, monthKeys) {
  if (
    sourceId === "kuroko-kun-hall-official" &&
    monthKeys.length > 0 &&
    monthKeys.every((key) => ["2026-09", "2026-10", "2026-11"].includes(key))
  ) {
    return {
      expected: true,
      reason: "2026-08-06 至 2026-11-30 因亚洲/亚残运相关安排暂停一般利用；9-11 月为完整受限月",
    };
  }
  if (
    sourceId === "big-hat-nagano-official" &&
    monthKeys.length > 0 &&
    monthKeys.every((key) => [
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
    ].includes(key))
  ) {
    return {
      expected: true,
      reason: "ビッグハット官方公告 2027 年 4 月上旬至 10 月末因设施长寿命化改修休馆；5-10 月为完整休馆月",
    };
  }
  return { expected: false, reason: null };
}

function evidenceSummary(entries) {
  const byRequest = new Map();
  entries.forEach((entry, index) => {
    const key = entry.requestedUrl || `__entry_${index}`;
    const group = byRequest.get(key) ?? [];
    group.push(entry);
    byRequest.set(key, group);
  });

  let fetchSuccesses = 0;
  let fetchFailures = 0;
  let parserSuccesses = 0;
  let parserFailures = 0;
  let parserNotRun = 0;
  let parserNotRecorded = 0;

  for (const group of byRequest.values()) {
    if (group.some((entry) => FETCH_SUCCESS.has(entry.fetchStatus))) {
      fetchSuccesses += 1;
    } else {
      fetchFailures += 1;
    }

    if (group.some((entry) => entry.parserStatus === "success")) {
      parserSuccesses += 1;
    } else if (group.some((entry) => entry.parserStatus === "parser_failed")) {
      parserFailures += 1;
    } else if (group.some((entry) => entry.parserStatus === "not_run")) {
      parserNotRun += 1;
    } else {
      parserNotRecorded += 1;
    }
  }

  return {
    requestCount: byRequest.size,
    attemptCount: entries.length,
    fetchSuccesses,
    fetchFailures,
    parserSuccesses,
    parserFailures,
    parserNotRun,
    parserNotRecorded,
  };
}

function classify({ result, evidence, policy, previousSource, comparableWindow }) {
  const recordCount = Number(result.recordCount ?? 0);
  const previousRecordCount = Number.isFinite(Number(previousSource?.recordCount))
    ? Number(previousSource.recordCount)
    : null;
  const dropRatio = comparableWindow && previousRecordCount > 0
    ? recordCount / previousRecordCount
    : null;
  const reasons = [];
  let state;

  if (result.status === "skipped") {
    state = "skipped";
    if (result.reason) reasons.push(`skipped:${result.reason}`);
  } else if (result.status === "failed") {
    if (evidence.fetchSuccesses === 0 && evidence.fetchFailures > 0) {
      state = "fetch_failed";
      reasons.push("all_fetches_failed");
    } else if (evidence.parserFailures > 0 && evidence.parserSuccesses === 0) {
      state = "parser_failed";
      reasons.push("no_successful_parser_result");
    } else {
      state = "failed";
      reasons.push(result.error ? `adapter_failed:${result.error}` : "adapter_failed");
    }
  } else if (recordCount === 0) {
    if (evidence.fetchSuccesses === 0 && evidence.fetchFailures > 0) {
      state = "fetch_failed";
      reasons.push("zero_records_and_no_successful_fetch");
    } else if (evidence.parserFailures > 0 && evidence.parserSuccesses === 0) {
      state = "parser_failed";
      reasons.push("zero_records_and_parser_failed");
    } else if (policy.expected) {
      state = "expected_zero";
      reasons.push(`expected_zero:${policy.reason}`);
    } else {
      state = "unexpected_zero";
      reasons.push("successful_source_returned_zero_records");
    }
  } else if (evidence.fetchFailures > 0 || evidence.parserFailures > 0) {
    state = "degraded";
    if (evidence.fetchFailures > 0) reasons.push("partial_fetch_failure");
    if (evidence.parserFailures > 0) reasons.push("partial_parser_failure");
  } else if (dropRatio !== null && dropRatio <= 0.25) {
    state = "degraded";
    reasons.push(`record_count_drop:${recordCount}/${previousRecordCount}`);
  } else {
    state = "healthy";
  }

  const actionable = ACTIONABLE_STATES.has(state);
  const previousHealth = previousSource?.health;
  const previousWasActionable = ACTIONABLE_STATES.has(previousHealth?.state);
  const consecutiveAnomalies = actionable
    ? (previousWasActionable ? Number(previousHealth?.consecutiveAnomalies ?? 1) + 1 : 1)
    : 0;

  return {
    state,
    actionable,
    reasons,
    expectedZero: policy.expected,
    expectedZeroReason: policy.reason,
    previousState: previousHealth?.state ?? null,
    previousRecordCount,
    comparableWindow,
    recordCountRatio: dropRatio,
    consecutiveAnomalies,
    evidence,
  };
}

export function attachSourceHealth({
  sourceResults,
  rawEntries = [],
  previousSnapshot = null,
  months = [],
}) {
  const monthKeys = months.map(normalizeMonthKey).filter(Boolean);
  const previousById = new Map(
    (previousSnapshot?.sources ?? []).map((source) => [source.id, source]),
  );
  const comparableWindow = sameWindow(previousSnapshot, monthKeys);

  const sources = sourceResults.map((result) => {
    const entries = rawEntries.filter((entry) => entry.sourceId === result.id);
    const evidence = evidenceSummary(entries);
    const policy = expectedZeroPolicy(result.id, monthKeys);
    const previousSource = previousById.get(result.id);
    const health = classify({
      result,
      evidence,
      policy,
      previousSource,
      comparableWindow,
    });
    return { ...result, health };
  });

  const stateCounts = {};
  for (const source of sources) {
    const state = source.health.state;
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
  }

  return {
    collectionWindow: {
      months: monthKeys,
    },
    summary: {
      total: sources.length,
      actionable: sources.filter((source) => source.health.actionable).length,
      stateCounts,
    },
    sources,
  };
}

export function buildSourceHealthSnapshot({
  generatedAt,
  collectionWindow,
  sources,
}) {
  return {
    schemaVersion: 1,
    generatedAt,
    collectionWindow,
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      recordCount: source.recordCount,
      health: source.health,
    })),
  };
}
