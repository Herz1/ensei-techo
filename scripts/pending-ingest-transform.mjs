const RAW_STORE_IMPORT = 'import { createRawEvidenceStore } from "./raw-evidence-store.mjs";';
const ADAPTERS_MARKER = "  const adapters = [";
const RAW_STORE_MARKER = "  const rawStore = createRawEvidenceStore({";
const PENDING_IMPORT = 'import { createPendingSourceAdapters } from "./adapters/pending-source-registry.mjs";';
const PENDING_PUSH = "  adapters.push(...await createPendingSourceAdapters(adapterContext));";

function occurrenceCount(source, value) {
  return source.split(value).length - 1;
}

function requireExactlyOnce(source, marker, label) {
  const count = occurrenceCount(source, marker);
  if (count !== 1) {
    throw new Error(`pending ingest transform 要求 ${label} 恰好出现一次，实际 ${count} 次`);
  }
}

export function injectPendingRegistry(source) {
  const importCount = occurrenceCount(source, PENDING_IMPORT);
  const pushCount = occurrenceCount(source, PENDING_PUSH);

  if (importCount === 1 && pushCount === 1) {
    return source;
  }
  if (importCount !== 0 || pushCount !== 0) {
    throw new Error(
      `pending ingest transform 检测到不完整或重复接线：import=${importCount}, push=${pushCount}`,
    );
  }

  requireExactlyOnce(source, RAW_STORE_IMPORT, "raw store import marker");
  requireExactlyOnce(source, ADAPTERS_MARKER, "adapters marker");
  requireExactlyOnce(source, RAW_STORE_MARKER, "raw store construction marker");

  const withImport = source.replace(
    RAW_STORE_IMPORT,
    `${PENDING_IMPORT}\n${RAW_STORE_IMPORT}`,
  );
  const transformed = withImport.replace(
    RAW_STORE_MARKER,
    `${PENDING_PUSH}\n${RAW_STORE_MARKER}`,
  );

  requireExactlyOnce(transformed, PENDING_IMPORT, "pending registry import");
  requireExactlyOnce(transformed, PENDING_PUSH, "pending adapter push");
  return transformed;
}
