import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const checkedRunner = path.join(scriptDir, "run-pending-ingest-checked.mjs");
const verifier = path.join(scriptDir, "verify-pending-live-report.mjs");

function runNode(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename], {
      cwd: projectDir,
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
  await runNode(checkedRunner);
  if (process.env.PENDING_INGEST_PREFLIGHT_ONLY === "1") {
    console.log("Verified pending ingest: validation only, live report verification skipped");
    return;
  }
  await runNode(verifier);
}

main().catch((error) => {
  console.error(
    `Verified pending ingest failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
