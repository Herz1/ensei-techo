import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const preflight = path.join(scriptDir, "pending-ingest-preflight.mjs");
const ingest = path.join(scriptDir, "ingest-events-pending.mjs");

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
  await runNode(preflight);
  if (process.env.PENDING_INGEST_PREFLIGHT_ONLY === "1") {
    console.log("Pending ingest: preflight only, live ingest skipped");
    return;
  }
  await runNode(ingest);
}

main().catch((error) => {
  console.error(
    `Pending ingest runner failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
