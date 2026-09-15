import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestPendingRegistry } from "./adapters/pending-source-registry.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adapterDir = path.join(scriptDir, "adapters");
const REGISTRY_IMPORT_RE = /from\s+["']\.\/pending-sources-r(\d+)\.mjs["']/gu;
const ADAPTER_IMPORT_RE = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']\.\/([^"']+-source\.mjs)["']/gu;

function quotedField(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*["']([^"']+)["']`, "u"));
  return match?.[1] ?? null;
}

function definitionBlock(source) {
  return source.match(/const\s+definition\s*=\s*\{([\s\S]*?)\n\s*\};/u)?.[1] ?? null;
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
    const text = await readFile(filename, "utf8");
    const adapters = [...text.matchAll(ADAPTER_IMPORT_RE)].map((match) => ({
      factory: match[1].trim(),
      filename: match[2],
    }));
    chain.push({ round: current.round, filename: current.filename, adapters });

    const previous = [...text.matchAll(REGISTRY_IMPORT_RE)]
      .map((match) => Number(match[1]))
      .filter((round) => Number.isInteger(round));
    if (!previous.length) break;
    if (previous.length !== 1 || previous[0] >= current.round) {
      throw new Error(`${current.filename} 的 previous registry 链不合法`);
    }
    current = {
      round: previous[0],
      filename: `pending-sources-r${previous[0]}.mjs`,
    };
  }

  return chain.reverse();
}

async function sourceRows(chain) {
  const seen = new Set();
  const rows = [];

  for (const registry of chain) {
    for (const adapter of registry.adapters) {
      if (seen.has(adapter.filename)) continue;
      seen.add(adapter.filename);

      const source = await readFile(path.join(adapterDir, adapter.filename), "utf8");
      const block = definitionBlock(source);
      if (!block) {
        throw new Error(`${adapter.filename} 未找到 definition block`);
      }
      const row = {
        round: registry.round,
        adapterFile: adapter.filename,
        factory: adapter.factory,
        id: quotedField(block, "id"),
        name: quotedField(block, "name"),
        type: quotedField(block, "type"),
        role: quotedField(block, "role"),
        url: quotedField(block, "url"),
      };
      if (!row.id || !row.name || !row.type || !row.role || !row.url) {
        throw new Error(`${adapter.filename} definition 缺少必要元数据`);
      }
      rows.push(row);
    }
  }
  return rows;
}

async function main() {
  const latest = await latestPendingRegistry();
  if (!latest) {
    const empty = { latestRound: null, registryDepth: 0, sourceCount: 0, sources: [] };
    console.log(process.argv.includes("--json") ? JSON.stringify(empty, null, 2) : "No pending sources.");
    return;
  }

  const chain = await registryChain(latest);
  const sources = await sourceRows(chain);
  const report = {
    latestRound: latest.round,
    latestRegistry: latest.filename,
    registryDepth: chain.length,
    sourceCount: sources.length,
    sources,
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Pending sources: ${sources.length} (latest R${latest.round}, registry depth ${chain.length})`);
  for (const source of sources) {
    console.log(`- R${source.round} ${source.id}: ${source.name}`);
    console.log(`  ${source.type}/${source.role}  ${source.url}`);
  }
}

main().catch((error) => {
  console.error(`Pending source report failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
