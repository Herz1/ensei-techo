import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_RE = /^pending-sources-r(\d+)\.mjs$/u;

export async function latestPendingRegistry() {
  const files = await readdir(adapterDir);
  const candidates = files
    .map((filename) => {
      const match = filename.match(REGISTRY_RE);
      return match
        ? { filename, round: Number(match[1]) }
        : null;
    })
    .filter(Boolean)
    .filter((item) => Number.isInteger(item.round))
    .sort((a, b) => b.round - a.round);
  return candidates[0] ?? null;
}

export async function createPendingSourceAdapters(context) {
  const latest = await latestPendingRegistry();
  if (!latest) return [];

  const module = await import(`./${latest.filename}`);
  const factoryName = `createPendingSourceAdaptersR${latest.round}`;
  const factory = module[factoryName];
  if (typeof factory !== "function") {
    throw new Error(
      `最新 pending registry ${latest.filename} 缺少导出 ${factoryName}`,
    );
  }

  const adapters = await factory(context);
  if (!Array.isArray(adapters)) {
    throw new Error(`${factoryName} 必须返回 adapter 数组`);
  }

  const ids = adapters.map((adapter) => adapter?.definition?.id).filter(Boolean);
  if (ids.length !== adapters.length || new Set(ids).size !== ids.length) {
    throw new Error("pending source registry 存在缺失或重复 source id");
  }
  return adapters;
}
