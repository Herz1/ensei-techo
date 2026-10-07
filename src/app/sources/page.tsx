import Link from "next/link";
import report from "@/data/ingest/report.json";
import manifest from "@/data/ingest/raw-manifest.json";
import snapshot from "@/data/ingest/source-health.json";
import { buildReportedSourceHealth } from "../../../scripts/source-health-report.mjs";

export const metadata = { title: "官方来源与审核证据" };
const LABELS: Record<string, string> = { healthy: "采集正常", degraded: "部分异常", fetch_failed: "抓取失败", parser_failed: "解析失败", failed: "采集失败", skipped: "未运行", unexpected_zero: "异常零记录", expected_zero: "有依据的零记录", evidence_missing: "缺少批次证据" };
export default function SourcesPage() {
  const { snapshot: current, summary, warnings } = buildReportedSourceHealth(report, manifest, snapshot);
  return <div className="mx-auto max-w-5xl px-4 py-8 pb-28">
    <h1 className="text-2xl font-bold">官方来源与审核证据</h1>
    <p className="mt-3 text-sm leading-7">这里展示已有采集批次的健康证据，不能代表今日官网、实时库存或人工批准。购票前请打开官方页面确认。</p>
    <section className="my-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>采集时间：{current.generatedAt ?? "未记录"} · 采集窗口：{current.collectionWindow.months.join("、") || "历史批次未记录"}</p>
      {warnings.map((warning: string) => <p key={warning} className="mt-2">{warning}</p>)}
      <p className="mt-2">{summary.total} 个来源 · {summary.actionable} 个需处理。原始网页未随 Git 分发；本机原始文件核验与目录元数据校验分别记录在 QA。</p>
    </section>
    <div className="grid gap-3 md:grid-cols-2">
      {current.sources.map((source: { id: string; name: string; recordCount: number; health: { state: string; evidence: { requestCount: number; parserSuccesses: number }; consecutiveAnomalies: number } }) => <article key={source.id} className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-card-dark">
        <h2 className="font-semibold">{source.name}</h2>
        <p className="mt-2 text-sm">{LABELS[source.health.state] ?? "待确认"} · {source.recordCount ?? 0} 条候选</p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">请求证据 {source.health.evidence.requestCount} · 解析成功 {source.health.evidence.parserSuccesses} · 连续异常批次 {source.health.consecutiveAnomalies}</p>
      </article>)}
    </div>
    <p className="mt-6 text-sm leading-7">每场正式演出的「查看字段审核证据」可核对批准状态、核验时刻、来源 URL 与原始内容哈希。缺证据、官网变化和来源冲突需要人工处理，不会自动批准。</p>
    <Link href="/events" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong">前往公演目录 →</Link>
  </div>;
}
