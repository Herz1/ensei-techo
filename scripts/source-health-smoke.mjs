import assert from "node:assert/strict";
import {
  attachSourceHealth,
  buildSourceHealthSnapshot,
} from "./source-health.mjs";

const months = [
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
  { year: 2026, month: 11 },
];

function result(id, recordCount, status = "ok", extra = {}) {
  return {
    id,
    name: id,
    type: "venue_official",
    status,
    recordCount,
    ...extra,
  };
}

function entry(sourceId, fetchStatus, parserStatus) {
  return { sourceId, fetchStatus, parserStatus };
}

const previousSnapshot = {
  collectionWindow: {
    from: "2026-09-14",
    months: ["2026-09", "2026-10", "2026-11"],
  },
  sources: [
    {
      id: "drop-source",
      recordCount: 100,
      health: { state: "healthy", consecutiveAnomalies: 0 },
    },
    {
      id: "repeat-zero-source",
      recordCount: 0,
      health: { state: "unexpected_zero", consecutiveAnomalies: 2 },
    },
  ],
};

const sourceResults = [
  result("healthy-source", 12),
  result("kuroko-kun-hall-official", 0),
  result("unexpected-zero-source", 0),
  result("parser-source", 0),
  result("fetch-source", 0, "failed", { error: "network down" }),
  result("partial-source", 5),
  result("drop-source", 20),
  result("repeat-zero-source", 0),
  result("ticketmaster-jp", 0, "skipped", { reason: "API key missing" }),
];

const rawEntries = [
  entry("healthy-source", "success", "success"),
  entry("kuroko-kun-hall-official", "success", "success"),
  entry("unexpected-zero-source", "cache_reused", "success"),
  entry("parser-source", "success", "parser_failed"),
  entry("fetch-source", "page_fetch_failed", "not_run"),
  entry("partial-source", "success", "success"),
  entry("partial-source", "page_fetch_failed", "not_run"),
  entry("drop-source", "success", "success"),
  entry("repeat-zero-source", "success", "success"),
];

const health = attachSourceHealth({
  sourceResults,
  rawEntries,
  previousSnapshot,
  months,
});

const byId = new Map(health.sources.map((source) => [source.id, source]));
assert.equal(byId.get("healthy-source").health.state, "healthy");
assert.equal(byId.get("kuroko-kun-hall-official").health.state, "expected_zero");
assert.equal(byId.get("kuroko-kun-hall-official").health.actionable, false);
assert.equal(byId.get("unexpected-zero-source").health.state, "unexpected_zero");
assert.equal(byId.get("parser-source").health.state, "parser_failed");
assert.equal(byId.get("fetch-source").health.state, "fetch_failed");
assert.equal(byId.get("partial-source").health.state, "degraded");
assert.equal(byId.get("drop-source").health.state, "degraded");
assert.equal(byId.get("drop-source").health.recordCountRatio, 0.2);
assert.equal(byId.get("repeat-zero-source").health.consecutiveAnomalies, 3);
assert.equal(byId.get("ticketmaster-jp").health.state, "skipped");
assert.equal(health.summary.total, 9);
assert.equal(health.summary.actionable, 6);
assert.deepEqual(health.collectionWindow.months, [
  "2026-09",
  "2026-10",
  "2026-11",
]);

const snapshot = buildSourceHealthSnapshot({
  generatedAt: "2026-09-15T08:00:00.000Z",
  collectionWindow: {
    from: "2026-09-15",
    months: health.collectionWindow.months,
  },
  sources: health.sources,
});
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.sources.length, 9);
assert.equal(snapshot.sources[0].health.state, "healthy");

const shiftedWindow = attachSourceHealth({
  sourceResults: [result("drop-source", 1)],
  rawEntries: [entry("drop-source", "success", "success")],
  previousSnapshot,
  months: [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ],
});
assert.equal(shiftedWindow.sources[0].health.state, "healthy");
assert.equal(shiftedWindow.sources[0].health.comparableWindow, false);
assert.equal(shiftedWindow.sources[0].health.recordCountRatio, null);

console.log("Source Health smoke: ok");
