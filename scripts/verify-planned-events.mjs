import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MAX_PLANNED_EVENTS,
  annotateObservationConflicts,
  auditSelectedPublishScope,
  buildEventVerificationMatrix,
  renderPlannedVerificationMarkdown,
  selectPlannedEventIds,
} from "./planned-verification-core.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVENTS_PATH = resolve(ROOT, "src/data/events.json");
const OBSERVATIONS_PATH = resolve(ROOT, "src/data/ingest/ticket-offer-observations.json");
const REPORT_PATH = resolve(ROOT, "src/data/ingest/planned-verification-last.json");
const REPORT_MARKDOWN_PATH = resolve(ROOT, "src/data/ingest/planned-verification-last.md");

function optionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
    else if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
  }
  return values;
}

function integerOption(name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = optionValues(name).at(-1);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} 必须是 1-${maximum} 的整数`);
  return value;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function runNode(script, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(ROOT, script), ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${script} 退出码 ${code}`));
    });
  });
}

const apply = process.argv.includes("--apply");
const explicitDryRun = process.argv.includes("--dry-run");
if (apply && explicitDryRun) throw new Error("--apply 与 --dry-run 不能同时使用");
const mode = apply ? "apply" : "dry-run";
const limit = integerOption("--limit", MAX_PLANNED_EVENTS, MAX_PLANNED_EVENTS);
const urlLimit = integerOption("--url-limit", 30, 50);
const inputPath = optionValues("--input").at(-1);
const input = inputPath ? await readJson(resolve(ROOT, inputPath)) : null;
const beforeEvents = await readJson(EVENTS_PATH, []);
const eventIds = selectPlannedEventIds({
  explicitEventIds: optionValues("--event-id"),
  input,
  limit,
  knownEventIds: beforeEvents.map((event) => event.id),
});
const selected = new Set(eventIds);
const runAt = new Date().toISOString();
const runId = `planned-verification-${runAt.replace(/[:.]/gu, "-")}`;
let afterEvents = beforeEvents;
let conflicts = [];
let scopeAudit = { safe: true, violations: [] };
let failure = null;

console.log(`计划内核验模式：${mode}；Event ${eventIds.length}/${limit}；URL 上限 ${urlLimit}`);
for (const eventId of eventIds) console.log(`SELECT Event=${eventId}`);

if (apply) {
  try {
    const frontierArgs = [
      "--fetch",
      "--apply",
      "--all-roles",
      "--strict-events",
      "--include-checked",
      "--limit",
      String(urlLimit),
      ...eventIds.flatMap((eventId) => ["--event-id", eventId]),
    ];
    await runNode("scripts/process-link-frontier.mjs", frontierArgs);

    const observationsFile = await readJson(OBSERVATIONS_PATH, { schemaVersion: 1, observations: [] });
    const observations = observationsFile.observations ?? observationsFile;
    const selectedObservations = observations.filter((item) => selected.has(item.eventId));
    const annotated = annotateObservationConflicts(selectedObservations, beforeEvents);
    conflicts = annotated.conflicts;
    let selectedIndex = 0;
    const nextObservations = observations.map((item) => selected.has(item.eventId) ? annotated.observations[selectedIndex++] : item);
    const nextFile = Array.isArray(observationsFile)
      ? nextObservations
      : { ...observationsFile, generatedAt: new Date().toISOString(), observations: nextObservations };
    await writeFile(OBSERVATIONS_PATH, `${JSON.stringify(nextFile, null, 2)}\n`, "utf8");

    await runNode("scripts/publish-ticket-offers.mjs", ["--apply"]);
    afterEvents = await readJson(EVENTS_PATH, []);
    scopeAudit = auditSelectedPublishScope(beforeEvents, afterEvents, eventIds);
    if (!scopeAudit.safe) {
      await writeFile(EVENTS_PATH, `${JSON.stringify(beforeEvents, null, 2)}\n`, "utf8");
      afterEvents = beforeEvents;
      throw new Error(`发布范围校验失败，已回滚 events.json：${scopeAudit.violations.join("；")}`);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
}

const beforeById = new Map(beforeEvents.map((event) => [event.id, event]));
const afterById = new Map(afterEvents.map((event) => [event.id, event]));
const report = {
  schemaVersion: 1,
  runId,
  generatedAt: new Date().toISOString(),
  mode,
  status: failure ? "failed" : conflicts.length ? "manual_review" : apply ? "applied" : "dry_run",
  eventIds,
  selectedCount: eventIds.length,
  unselectedEventCount: beforeEvents.length - eventIds.length,
  formalDataChanged: apply && JSON.stringify(beforeEvents) !== JSON.stringify(afterEvents),
  conflicts,
  scopeAudit,
  failure,
  events: eventIds.map((eventId) => ({
    eventId,
    title: afterById.get(eventId)?.titleJa ?? beforeById.get(eventId)?.titleJa ?? eventId,
    matrix: buildEventVerificationMatrix(
      beforeById.get(eventId),
      afterById.get(eventId),
      conflicts.filter((conflict) => conflict.eventId === eventId),
    ),
  })),
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(REPORT_MARKDOWN_PATH, renderPlannedVerificationMarkdown(report), "utf8");

for (const item of report.events) {
  console.log(`MATRIX Event=${item.eventId} | ${item.title}`);
  for (const row of item.matrix) {
    console.log(`${row.label} | value=${row.currentValue ?? "未说明"} | source=${row.sourceUrls.join(",") || "未说明"} | verified=${row.lastVerifiedAt ?? "未记录"} | changed=${row.changed ? "是" : "否"} | unknown=${row.unknownReason ?? "-"} | manual=${row.requiresManual ? "是" : "否"}`);
  }
}
console.log(`核验报告：${REPORT_MARKDOWN_PATH}`);
if (failure) {
  console.error(`FAIL step=planned-verification | Event=${eventIds.join(",")} | reason=${failure} | manual=是`);
  process.exitCode = 1;
}
