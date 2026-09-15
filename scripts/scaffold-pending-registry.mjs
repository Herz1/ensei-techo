import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestPendingRegistry } from "./adapters/pending-source-registry.mjs";
import { buildPendingRegistry } from "./pending-registry-scaffold-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adapterDir = path.join(scriptDir, "adapters");

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
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
  const adapterFile = valueAfter("--adapter");
  const factory = valueAfter("--factory");
  if (!adapterFile || !factory) {
    throw new Error(
      "用法: node scripts/scaffold-pending-registry.mjs --adapter <foo-source.mjs> --factory <createFooSourceAdapter> [--round N] [--write]",
    );
  }

  const latest = await latestPendingRegistry();
  const requestedRound = valueAfter("--round");
  const round = requestedRound === undefined
    ? (latest?.round ?? 0) + 1
    : Number(requestedRound);

  const adapterPath = path.join(adapterDir, adapterFile);
  if (!await exists(adapterPath)) {
    throw new Error(`adapter 文件不存在: ${adapterFile}`);
  }
  const adapterText = await readFile(adapterPath, "utf8");
  if (
    !adapterText.includes(`export function ${factory}`) &&
    !adapterText.includes(`export const ${factory}`)
  ) {
    throw new Error(`${adapterFile} 未导出 ${factory}`);
  }

  const content = buildPendingRegistry({
    previousRound: latest?.round ?? null,
    round,
    adapterFile,
    factory,
  });
  const filename = `pending-sources-r${round}.mjs`;
  const output = path.join(adapterDir, filename);

  if (!process.argv.includes("--write")) {
    process.stdout.write(content);
    return;
  }

  await writeFile(output, content, { encoding: "utf8", flag: "wx" });
  console.log(`Created ${path.relative(path.dirname(scriptDir), output)}`);
}

main().catch((error) => {
  console.error(`Pending registry scaffold failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
