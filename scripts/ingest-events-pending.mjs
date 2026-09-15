import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { injectPendingRegistry } from "./pending-ingest-transform.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const coreIngest = path.join(scriptDir, "ingest-events.mjs");
const sourceHealth = path.join(scriptDir, "report-source-health.mjs");

function runNode(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename], {
      cwd: path.dirname(scriptDir),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${path.basename(filename)} 被信号 ${signal} 终止`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${path.basename(filename)} 退出码 ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const original = await readFile(coreIngest, "utf8");
  const transformed = injectPendingRegistry(original);
  const temporary = path.join(
    scriptDir,
    `.ingest-events-pending-${process.pid}-${Date.now()}.mjs`,
  );

  await writeFile(temporary, transformed, "utf8");
  try {
    await runNode(temporary);
    await runNode(sourceHealth);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

main().catch((error) => {
  console.error(
    `pending 演出采集失败：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
