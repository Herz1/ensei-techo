import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const reportFile = path.join(scriptDir, "report-pending-sources.mjs");

function runNode(filename, args = [], stdio = "inherit") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename, ...args], {
      cwd: projectDir,
      env: process.env,
      stdio,
    });
    let stdout = "";
    let stderr = "";
    if (stdio === "pipe") {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${path.basename(filename)} 被信号 ${signal} 终止`));
        return;
      }
      if (code !== 0) {
        reject(new Error(
          `${path.basename(filename)} 退出码 ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
        ));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { stdout } = await runNode(reportFile, ["--json"], "pipe");
  const report = JSON.parse(stdout);
  const smokeFiles = [...new Set(
    (report.sources ?? []).map((source) =>
      path.join(
        scriptDir,
        source.adapterFile.replace(/-source\.mjs$/u, "-smoke.mjs"),
      ),
    ),
  )];

  for (const smokeFile of smokeFiles) {
    if (!await exists(smokeFile)) {
      throw new Error(`pending runtime smoke 不存在: ${path.basename(smokeFile)}`);
    }
  }

  if (process.argv.includes("--list")) {
    for (const smokeFile of smokeFiles) {
      console.log(path.relative(projectDir, smokeFile));
    }
    return;
  }

  for (const smokeFile of smokeFiles) {
    console.log(`Running pending smoke: ${path.basename(smokeFile)}`);
    await runNode(smokeFile);
  }

  console.log(`Pending source runtime smokes: ok (${smokeFiles.length})`);
}

main().catch((error) => {
  console.error(`Pending source runtime smokes failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
