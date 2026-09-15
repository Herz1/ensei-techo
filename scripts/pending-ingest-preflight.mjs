import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { injectPendingRegistry } from "./pending-ingest-transform.mjs";
import { latestPendingRegistry } from "./adapters/pending-source-registry.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adapterDir = path.join(scriptDir, "adapters");
const parserDir = path.join(scriptDir, "parsers");
const REGISTRY_IMPORT_RE = /from\s+["']\.\/pending-sources-r(\d+)\.mjs["']/gu;
const ADAPTER_IMPORT_RE = /from\s+["']\.\/([^"']+-source\.mjs)["']/gu;
const PARSER_IMPORT_RE = /from\s+["']\.\.\/parsers\/([^"']+\.mjs)["']/gu;

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function runNodeCheck(filename) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", filename], {
      cwd: path.dirname(scriptDir),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${path.relative(path.dirname(scriptDir), filename)} 被信号 ${signal} 终止`));
        return;
      }
      if (code !== 0) {
        reject(new Error(
          `${path.relative(path.dirname(scriptDir), filename)} node --check 失败\n${stderr.trim()}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function registryChain(latest) {
  const chain = [];
  const visited = new Set();
  let current = latest;

  while (current) {
    if (visited.has(current.round)) {
      throw new Error(`pending registry chain 出现循环: R${current.round}`);
    }
    visited.add(current.round);

    const filename = path.join(adapterDir, current.filename);
    if (!await exists(filename)) {
      throw new Error(`pending registry 文件不存在: ${current.filename}`);
    }
    const text = await readFile(filename, "utf8");
    const exportName = `createPendingSourceAdaptersR${current.round}`;
    if (!text.includes(`export function ${exportName}`)) {
      throw new Error(`${current.filename} 缺少导出 ${exportName}`);
    }

    const adapters = [...text.matchAll(ADAPTER_IMPORT_RE)].map((match) => match[1]);
    chain.push({
      round: current.round,
      filename: current.filename,
      text,
      adapters,
    });

    const previousRounds = [...text.matchAll(REGISTRY_IMPORT_RE)]
      .map((match) => Number(match[1]))
      .filter((round) => Number.isInteger(round));
    if (!previousRounds.length) break;
    if (previousRounds.length !== 1 || previousRounds[0] >= current.round) {
      throw new Error(`${current.filename} 的 previous registry 链不合法`);
    }
    current = {
      round: previousRounds[0],
      filename: `pending-sources-r${previousRounds[0]}.mjs`,
    };
  }

  return chain;
}

async function pendingFiles(chain) {
  const files = new Set();
  for (const registry of chain) {
    files.add(path.join(adapterDir, registry.filename));
    for (const adapterName of registry.adapters) {
      const adapterFile = path.join(adapterDir, adapterName);
      if (!await exists(adapterFile)) {
        throw new Error(`pending adapter 文件不存在: ${adapterName}`);
      }
      files.add(adapterFile);

      const adapterText = await readFile(adapterFile, "utf8");
      const parserNames = [...adapterText.matchAll(PARSER_IMPORT_RE)].map((match) => match[1]);
      if (!parserNames.length) {
        throw new Error(`${adapterName} 未引用 parser`);
      }
      for (const parserName of parserNames) {
        const parserFile = path.join(parserDir, parserName);
        if (!await exists(parserFile)) {
          throw new Error(`pending parser 文件不存在: ${parserName}`);
        }
        files.add(parserFile);
      }

      const smokeName = adapterName.replace(/-source\.mjs$/u, "-smoke.mjs");
      const smokeFile = path.join(scriptDir, smokeName);
      if (!await exists(smokeFile)) {
        throw new Error(`pending smoke 文件不存在: ${smokeName}`);
      }
      files.add(smokeFile);
    }
  }
  return [...files].sort();
}

async function validateTransformedCore() {
  const coreFile = path.join(scriptDir, "ingest-events.mjs");
  const original = await readFile(coreFile, "utf8");
  const transformed = injectPendingRegistry(original);
  const temporary = path.join(
    scriptDir,
    `.pending-ingest-preflight-${process.pid}-${Date.now()}.mjs`,
  );
  await writeFile(temporary, transformed, "utf8");
  try {
    await runNodeCheck(temporary);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function main() {
  const latest = await latestPendingRegistry();
  if (!latest) {
    console.log("Pending ingest preflight: no pending registry");
    return;
  }

  const chain = await registryChain(latest);
  const files = await pendingFiles(chain);
  const infrastructure = [
    path.join(scriptDir, "pending-ingest-transform.mjs"),
    path.join(scriptDir, "ingest-events-pending.mjs"),
    path.join(adapterDir, "pending-source-registry.mjs"),
  ];

  for (const filename of [...infrastructure, ...files]) {
    await runNodeCheck(filename);
  }
  await validateTransformedCore();

  const adapterCount = new Set(chain.flatMap((item) => item.adapters)).size;
  console.log(
    `Pending ingest preflight: ok (latest R${latest.round}, registry depth ${chain.length}, adapters ${adapterCount}, checked files ${new Set([...infrastructure, ...files]).size})`,
  );
}

main().catch((error) => {
  console.error(`Pending ingest preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
