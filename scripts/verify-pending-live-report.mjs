import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const pendingReportFile = path.join(scriptDir, "report-pending-sources.mjs");
const ingestReportFile = path.join(projectDir, "src", "data", "ingest", "report.json");

function runPendingReport() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pendingReportFile, "--json"], {
      cwd: projectDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`pending source report 被信号 ${signal} 终止`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`pending source report 退出码 ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`pending source report JSON 无法解析: ${error.message}`));
      }
    });
  });
}

export function verifyPendingResults({ pendingSources, ingestReport }) {
  const byId = new Map((ingestReport.sources ?? []).map((source) => [source.id, source]));
  const failures = [];
  const summaries = [];

  for (const pending of pendingSources) {
    const result = byId.get(pending.id);
    if (!result) {
      failures.push({
        sourceId: pending.id,
        reason: "missing_from_ingest_report",
      });
      continue;
    }

    const health = result.health ?? null;
    summaries.push({
      id: pending.id,
      status: result.status,
      recordCount: Number(result.recordCount ?? 0),
      healthState: health?.state ?? null,
      actionable: Boolean(health?.actionable),
    });

    if (!new Set(["ok", "skipped"]).has(result.status)) {
      failures.push({
        sourceId: pending.id,
        reason: `unexpected_status:${result.status}`,
        detail: result.error ?? result.reason ?? null,
      });
      continue;
    }
    if (health?.actionable) {
      failures.push({
        sourceId: pending.id,
        reason: `actionable_health:${health.state ?? "unknown"}`,
        detail: health.reasons ?? null,
      });
      continue;
    }
    if (result.status === "skipped" && health?.state !== "skipped") {
      failures.push({
        sourceId: pending.id,
        reason: `skipped_source_health_mismatch:${health?.state ?? "missing"}`,
      });
      continue;
    }
    if (result.status === "ok" && !health) {
      failures.push({
        sourceId: pending.id,
        reason: "missing_source_health",
      });
    }
  }

  return { failures, summaries };
}

async function main() {
  const [pendingReport, ingestReport] = await Promise.all([
    runPendingReport(),
    readFile(ingestReportFile, "utf8").then(JSON.parse),
  ]);
  const { failures, summaries } = verifyPendingResults({
    pendingSources: pendingReport.sources ?? [],
    ingestReport,
  });

  for (const summary of summaries) {
    console.log(
      `- ${summary.id}: ${summary.status}, records=${summary.recordCount}, health=${summary.healthState ?? "missing"}`,
    );
  }
  if (failures.length) {
    for (const failure of failures) {
      console.error(
        `[${failure.reason}] ${failure.sourceId}${failure.detail ? `: ${JSON.stringify(failure.detail)}` : ""}`,
      );
    }
    throw new Error(`pending live report verification failed: ${failures.length} issue(s)`);
  }

  console.log(`Pending live report verification: ok (${summaries.length})`);
}

main().catch((error) => {
  console.error(`Pending live report verifier failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
