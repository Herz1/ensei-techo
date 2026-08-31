import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeSegment(value) {
  return String(value ?? "unknown")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function extension(contentType) {
  const value = String(contentType ?? "").toLowerCase();
  if (value.includes("json")) return "json";
  if (value.includes("html") || value.includes("xhtml")) return "html";
  if (value.includes("xml")) return "xml";
  return "bin";
}

async function writeOnce(filename, content) {
  try {
    await writeFile(filename, content, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function createRawEvidenceStore({
  rawRoot,
  batchId,
  fetchedAt,
}) {
  const entries = [];
  let previousEntries = [];
  const ingestRoot = path.dirname(rawRoot);

  async function captureResponse(response, context) {
    const body = Buffer.from(await response.clone().arrayBuffer());
    const contentHash = sha256(body);
    const requestedUrl = String(context.requestedUrl);
    const canonicalUrl = response.url || requestedUrl;
    const contentType = response.headers.get("content-type") || "";
    const sourceId = safeSegment(context.sourceId);
    const directory = path.join(rawRoot, sourceId, batchId);
    const bodyFilename = path.join(
      directory,
      `${contentHash}.${extension(contentType)}`,
    );
    const requestHash = sha256(
      `${requestedUrl}|${canonicalUrl}|${context.attempt}`,
    ).slice(0, 12);
    const metaFilename = path.join(
      directory,
      `${contentHash}.${requestHash}.meta.json`,
    );
    await mkdir(directory, { recursive: true });
    await writeOnce(bodyFilename, body);
    const entry = {
      schemaVersion: 1,
      batchId,
      sourceId: context.sourceId,
      adapterId: context.adapterId,
      sourceRole: context.sourceRole,
      parserIds: context.parserIds,
      parserVersion: context.parserVersion,
      requestedUrl,
      canonicalUrl,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      contentType,
      fetchedAt,
      contentHash,
      redirected: response.redirected || canonicalUrl !== requestedUrl,
      fetchStatus: response.ok ? "success" : "http_error",
      attempt: context.attempt,
      retryAfterMs: context.retryAfterMs ?? null,
      nextCheckAt: context.nextCheckAt ?? null,
      parserStatus: "not_recorded",
      parserErrors: [],
      rawFile: path.relative(path.dirname(rawRoot), bodyFilename),
      _metaFilename: metaFilename,
    };
    entries.push(entry);
    await writeFile(
      metaFilename,
      `${JSON.stringify(
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => !key.startsWith("_")),
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    return entry;
  }

  async function captureFailure(error, context) {
    const requestedUrl = String(context.requestedUrl);
    const failureHash = sha256(
      `${requestedUrl}|${context.sourceId}|${context.attempt}|${error}`,
    );
    const directory = path.join(
      rawRoot,
      safeSegment(context.sourceId),
      batchId,
    );
    const metaFilename = path.join(
      directory,
      `${failureHash}.fetch-failed.meta.json`,
    );
    await mkdir(directory, { recursive: true });
    const entry = {
      schemaVersion: 1,
      batchId,
      sourceId: context.sourceId,
      adapterId: context.adapterId,
      sourceRole: context.sourceRole,
      parserIds: context.parserIds,
      parserVersion: context.parserVersion,
      requestedUrl,
      canonicalUrl: null,
      httpStatus: null,
      httpStatusText: null,
      contentType: null,
      fetchedAt,
      contentHash: null,
      redirected: false,
      fetchStatus: "page_fetch_failed",
      attempt: context.attempt,
      nextCheckAt: context.nextCheckAt ?? null,
      parserStatus: "not_run",
      parserErrors: [
        error instanceof Error ? error.message : String(error),
      ],
      rawFile: null,
      _metaFilename: metaFilename,
    };
    entries.push(entry);
    await writeFile(
      metaFilename,
      `${JSON.stringify(
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => !key.startsWith("_")),
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    return entry;
  }

  async function recordParserResult({
    sourceId,
    url,
    parserId,
    status,
    error,
    outputCount,
  }) {
    const matching = entries.filter(
      (entry) =>
        entry.sourceId === sourceId &&
        (entry.requestedUrl === String(url) ||
          entry.canonicalUrl === String(url)),
    );
    for (const entry of matching) {
      entry.parserStatus = status;
      entry.parserOutputCount = outputCount;
      if (error) {
        entry.parserErrors = [
          ...new Set([
            ...entry.parserErrors,
            `${parserId}: ${error instanceof Error ? error.message : String(error)}`,
          ]),
        ];
      }
      await writeFile(
        entry._metaFilename,
        `${JSON.stringify(
          Object.fromEntries(
            Object.entries(entry).filter(([key]) => !key.startsWith("_")),
          ),
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  }

  async function writeManifest(filename) {
    const previous = await readJson(filename, null);
    const serializable = entries.map((entry) =>
      Object.fromEntries(
        Object.entries(entry).filter(([key]) => !key.startsWith("_")),
      ),
    );
    const manifest = {
      schemaVersion: 1,
      batchId,
      generatedAt: fetchedAt,
      requestCount: serializable.length,
      successCount: serializable.filter(
        (entry) =>
          entry.fetchStatus === "success" ||
          entry.fetchStatus === "cache_reused",
      ).length,
      failureCount: serializable.filter(
        (entry) =>
          !["success", "cache_reused"].includes(entry.fetchStatus),
      ).length,
      entries: serializable,
      previousBatchId: previous?.batchId ?? null,
    };
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return manifest;
  }

  function getEvidence(sourceId, url) {
    const value = String(url);
    return [...entries].reverse().find(
      (entry) =>
        entry.sourceId === sourceId &&
        ["success", "cache_reused"].includes(entry.fetchStatus) &&
        (entry.requestedUrl === value || entry.canonicalUrl === value),
    );
  }

  async function loadPreviousManifest(filename) {
    const manifest = await readJson(filename, null);
    previousEntries = manifest?.entries ?? [];
    async function collectMeta(directory) {
      let items;
      try {
        items = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const nested = await Promise.all(items.map(async (item) => {
        const filename = path.join(directory, item.name);
        if (item.isDirectory()) return collectMeta(filename);
        if (!item.name.endsWith(".meta.json")) return [];
        try {
          return [JSON.parse(await readFile(filename, "utf8"))];
        } catch {
          return [];
        }
      }));
      return nested.flat();
    }
    const historyEntries = await collectMeta(rawRoot);
    const byIdentity = new Map();
    for (const entry of [...historyEntries, ...previousEntries]) {
      const key =
        `${entry.sourceId}|${entry.requestedUrl}|${entry.contentHash ?? "none"}`;
      const current = byIdentity.get(key);
      if (
        !current ||
        new Date(entry.fetchedAt).getTime() >
          new Date(current.fetchedAt).getTime()
      ) {
        byIdentity.set(key, entry);
      }
    }
    previousEntries = [...byIdentity.values()];
  }

  async function reuseFreshResponse(context, maxAgeMs) {
    const requestedUrl = String(context.requestedUrl);
    const previous = [...previousEntries].reverse().find(
      (entry) =>
        entry.sourceId === context.sourceId &&
        ["success", "cache_reused"].includes(entry.fetchStatus) &&
        entry.requestedUrl === requestedUrl &&
        entry.rawFile &&
        entry.contentHash,
    );
    if (!previous) return null;
    const age = Date.now() - new Date(previous.fetchedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
    const rawFilename = path.join(ingestRoot, previous.rawFile);
    let body;
    try {
      body = await readFile(rawFilename);
    } catch {
      return null;
    }
    if (sha256(body) !== previous.contentHash) return null;

    const directory = path.join(
      rawRoot,
      safeSegment(context.sourceId),
      batchId,
    );
    const requestHash = sha256(
      `${requestedUrl}|cache|${previous.contentHash}`,
    ).slice(0, 12);
    const metaFilename = path.join(
      directory,
      `${previous.contentHash}.${requestHash}.meta.json`,
    );
    await mkdir(directory, { recursive: true });
    const entry = {
      ...previous,
      batchId,
      adapterId: context.adapterId,
      sourceRole: context.sourceRole,
      parserIds: context.parserIds,
      parserVersion: context.parserVersion,
      checkedAt: fetchedAt,
      fetchStatus: "cache_reused",
      parserStatus: "not_recorded",
      parserErrors: [],
      attempt: 0,
      _metaFilename: metaFilename,
    };
    entries.push(entry);
    await writeFile(
      metaFilename,
      `${JSON.stringify(
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => !key.startsWith("_")),
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    return { body, entry };
  }

  async function reuseFreshFailure(context, maxAgeMs) {
    const requestedUrl = String(context.requestedUrl);
    const previous = [...previousEntries].reverse().find(
      (entry) =>
        entry.sourceId === context.sourceId &&
        !["success", "cache_reused"].includes(entry.fetchStatus) &&
        entry.httpStatus !== 429 &&
        entry.requestedUrl === requestedUrl,
    );
    if (!previous) return null;
    const age = Date.now() - new Date(previous.fetchedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
    const directory = path.join(
      rawRoot,
      safeSegment(context.sourceId),
      batchId,
    );
    const failureHash = sha256(
      `${requestedUrl}|failure-cache|${previous.httpStatus ?? "network"}`,
    );
    const metaFilename = path.join(
      directory,
      `${failureHash}.failure-cache.meta.json`,
    );
    await mkdir(directory, { recursive: true });
    const entry = {
      ...previous,
      batchId,
      adapterId: context.adapterId,
      sourceRole: context.sourceRole,
      parserIds: context.parserIds,
      parserVersion: context.parserVersion,
      checkedAt: fetchedAt,
      fetchStatus: "failure_cache_reused",
      parserStatus: "not_run",
      parserErrors: previous.parserErrors ?? [],
      attempt: 0,
      _metaFilename: metaFilename,
    };
    entries.push(entry);
    await writeFile(
      metaFilename,
      `${JSON.stringify(
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => !key.startsWith("_")),
        ),
        null,
        2,
      )}\n`,
      "utf8",
    );
    return entry;
  }

  return {
    captureResponse,
    captureFailure,
    recordParserResult,
    writeManifest,
    getEvidence,
    loadPreviousManifest,
    reuseFreshResponse,
    reuseFreshFailure,
    entries,
  };
}
