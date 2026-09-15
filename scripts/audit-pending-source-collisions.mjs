import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const adapterDir = path.join(scriptDir, "adapters");
const mainIngestFile = path.join(scriptDir, "ingest-events.mjs");
const reportFile = path.join(scriptDir, "report-pending-sources.mjs");

function runJsonReport() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [reportFile, "--json"], {
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

export function detectPendingSourceCollisions({
  pendingSources,
  mainIngest,
  adapterSources,
}) {
  const conflicts = [];
  const ids = new Map();

  for (const source of pendingSources) {
    const previous = ids.get(source.id);
    if (previous) {
      conflicts.push({
        sourceId: source.id,
        reason: "duplicate_pending_source_id",
        detail: `${previous.adapterFile} / ${source.adapterFile}`,
      });
    } else {
      ids.set(source.id, source);
    }

    const modulePath = `./adapters/${source.adapterFile}`;
    if (mainIngest.includes(modulePath) || mainIngest.includes(source.factory)) {
      conflicts.push({
        sourceId: source.id,
        reason: "already_registered_in_main_ingest",
        detail: source.adapterFile,
      });
    }

    for (const [filename, text] of adapterSources) {
      if (filename === source.adapterFile) continue;
      if (text.includes(`"${source.id}"`) || text.includes(`'${source.id}'`)) {
        conflicts.push({
          sourceId: source.id,
          reason: "duplicate_source_id_literal",
          detail: filename,
        });
      }
    }
  }

  return conflicts;
}

async function main() {
  const report = await runJsonReport();
  const pendingSources = report.sources ?? [];
  const mainIngest = await readFile(mainIngestFile, "utf8");
  const adapterFiles = (await readdir(adapterDir))
    .filter((filename) => filename.endsWith(".mjs"));
  const adapterSources = new Map(
    await Promise.all(adapterFiles.map(async (filename) => [
      filename,
      await readFile(path.join(adapterDir, filename), "utf8"),
    ])),
  );

  const conflicts = detectPendingSourceCollisions({
    pendingSources,
    mainIngest,
    adapterSources,
  });
  if (conflicts.length) {
    for (const conflict of conflicts) {
      console.error(
        `[${conflict.reason}] ${conflict.sourceId}: ${conflict.detail}`,
      );
    }
    throw new Error(`发现 ${conflicts.length} 个 pending source collision`);
  }

  console.log(
    `Pending source collision audit: ok (${pendingSources.length} pending sources, ${adapterFiles.length} adapter files scanned)`,
  );
}

main().catch((error) => {
  console.error(`Pending source collision audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
