import { canonicalizeTicketUrl } from "./ticket-offer-lib.mjs";

export const MAX_PENDING_LIMIT = 10;
export const DEFAULT_BATCH_LIMIT = 10;

function canonicalSet(values) {
  return new Set(
    (values ?? [])
      .map((value) => canonicalizeTicketUrl(value) ?? String(value))
      .filter(Boolean),
  );
}

function eventIdsOf(job) {
  return [...new Set([
    job.hintedEventId,
    ...(job.hintedEventIds ?? []),
  ].filter(Boolean))];
}

export function selectFrontierJobs({
  jobs,
  nowMs = Date.now(),
  explicitUrls = [],
  explicitEventIds = [],
  pendingLimit = 0,
  batchLimit = DEFAULT_BATCH_LIMIT,
  allRoles = false,
  strictExplicitEvents = false,
  includeCheckedExplicit = false,
}) {
  if (!Number.isInteger(pendingLimit) || pendingLimit < 0 || pendingLimit > MAX_PENDING_LIMIT) {
    throw new Error(`--pending-limit 必须是 0-${MAX_PENDING_LIMIT} 的整数`);
  }
  if (!Number.isInteger(batchLimit) || batchLimit < 1) {
    throw new Error("--limit 必须是大于 0 的整数");
  }

  const urlSet = canonicalSet(explicitUrls);
  const eventSet = new Set(explicitEventIds);
  const selectedByUrl = new Map();

  function select(job, reason) {
    const identity = canonicalizeTicketUrl(job.url) ?? job.url;
    const current = selectedByUrl.get(identity) ?? { job, reasons: [] };
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    selectedByUrl.set(identity, current);
  }

  for (const job of jobs) {
    const identity = canonicalizeTicketUrl(job.url) ?? job.url;
    const explicitUrl = urlSet.has(identity);
    const explicitEvent = eventIdsOf(job).some((eventId) => eventSet.has(eventId));

    if (
      !strictExplicitEvents &&
      (allRoles || job.role === "ticket_detail") &&
      job.status === "deferred" &&
      job.nextCheckAt &&
      Number.isFinite(Date.parse(job.nextCheckAt)) &&
      Date.parse(job.nextCheckAt) <= nowMs
    ) {
      select(job, "到期 deferred");
    }
    if (["pending", "deferred"].includes(job.status) && explicitUrl) {
      select(job, "显式 URL");
    }
    const explicitStatuses = includeCheckedExplicit
      ? ["pending", "deferred", "done", "unmatched"]
      : ["pending", "deferred"];
    if (explicitStatuses.includes(job.status) && explicitEvent) {
      select(job, "显式 Event ID");
    }
  }

  if (pendingLimit > 0) {
    const selectedPending = new Set(
      [...selectedByUrl.values()]
        .filter(({ job }) => job.status === "pending")
        .map(({ job }) => canonicalizeTicketUrl(job.url) ?? job.url),
    );
    const remaining = Math.max(0, pendingLimit - selectedPending.size);
    for (const job of jobs) {
      if (remaining <= 0 || selectedPending.size >= pendingLimit) break;
      if (job.status !== "pending") continue;
      const identity = canonicalizeTicketUrl(job.url) ?? job.url;
      if (selectedByUrl.has(identity)) continue;
      select(job, `显式 pending 上限 ${pendingLimit}`);
      selectedPending.add(identity);
    }
  }

  const allSelected = [...selectedByUrl.values()];
  const selected = allSelected.slice(0, batchLimit);
  const selectedUrls = new Set(selected.map(({ job }) => canonicalizeTicketUrl(job.url) ?? job.url));
  const statusCounts = jobs.reduce((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    selected,
    omittedByBatchLimit: allSelected
      .filter(({ job }) => !selectedUrls.has(canonicalizeTicketUrl(job.url) ?? job.url))
      .map(({ job, reasons }) => ({ url: job.url, status: job.status, reasons })),
    statusCounts,
    policy: {
      defaultScope: "nextCheckAt 已到期的 deferred",
      pendingSelection: pendingLimit > 0 || urlSet.size > 0 || eventSet.size > 0
        ? "仅显式选择"
        : "未选择 pending",
      pendingLimit,
      batchLimit,
      allRoles,
      strictExplicitEvents,
      includeCheckedExplicit,
    },
  };
}

export function renderRefreshMarkdown(report) {
  const counts = report.counts;
  const lines = [
    "# Ticket refresh 运行报告",
    "",
    `运行：${report.runId}`,
    `时间：${report.generatedAt}`,
    `模式：${report.mode}`,
    `正式数据发生变化：${report.formalDataChanged ? "是" : "否"}`,
    `观察数据发生变化：${report.observationDataChanged ? "是" : "否"}`,
    "",
    "## 汇总",
    "",
    "| 指标 | 数量 |",
    "| --- | ---: |",
    `| 本次选择 | ${counts.selected} |`,
    `| 抓取成功 | ${counts.fetchSucceeded} |`,
    `| 有效匹配 | ${counts.validMatches} |`,
    `| 无效链接 | ${counts.invalid} |`,
    `| 歧义 | ${counts.ambiguous} |`,
    `| blocked | ${counts.blocked} |`,
    `| deferred | ${counts.deferred} |`,
    `| 待人工项 | ${counts.manualReview} |`,
    "",
    "## 实际选择",
    "",
  ];
  if (report.selection.selected.length === 0) {
    lines.push("- 本次没有符合策略的 URL。", "");
  } else {
    for (const item of report.selection.selected) {
      lines.push(`- \`${item.url}\` · ${item.status} · ${item.reasons.join("、")} · Event: ${item.eventIds.join(", ") || "未关联"}`);
    }
    lines.push("");
  }
  lines.push("## 结果与未处理原因", "");
  if (report.outcomes.length === 0) {
    lines.push(`- ${report.mode === "dry-run" ? "dry-run 未发起网络请求。" : "没有执行项。"}`, "");
  } else {
    lines.push("| 步骤 | 结果 | URL | Event | 原因 | 人工处理 | 下次检查 |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const item of report.outcomes) {
      lines.push(`| ${item.step} | ${item.result} | ${item.url} | ${(item.eventIds ?? []).join(", ") || "未关联"} | ${String(item.reason).replaceAll("|", "\\|")} | ${item.requiresManual ? "是" : "否"} | ${item.nextCheckAt ?? item.nextAction ?? "不自动重试"} |`);
    }
    lines.push("");
  }
  lines.push("## 发布", "", `- ${report.publish.status}：${report.publish.reason}`, "");
  return `${lines.join("\n")}\n`;
}
