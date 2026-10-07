import Link from "next/link";
import type { EventItem } from "@/lib/types";
const LABELS: Record<string, string> = { title: "标题", artist: "艺人", venue: "场馆", eventDate: "公演日期", openTime: "开场时间", startTime: "开演时间", ticketTypes: "票种", prices: "价格", additionalFees: "附加费用", ticketPhases: "售票阶段", eligibility: "申请资格", purchaseUrls: "购票入口" };
const STATES: Record<string, string> = { approved: "已人工批准", pending_review: "待审核", changed: "内容变化待复核", conflict: "来源冲突" };

export default function ReviewEvidence({ event }: { event: EventItem }) {
  return <details className="mt-4" data-testid="review-evidence">
    <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">查看字段审核证据</summary>
    <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">审核哈希用于核对已有记录，不能代替今日官网确认。原始文件完整性请通过本机证据审计核对。</p>
    <div className="mt-3 space-y-3">{Object.entries(event.fieldProvenance).map(([key, field]) => <article key={key} className="min-w-0 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-700">
      <p className="font-semibold">{LABELS[key] ?? key} · {STATES[field.approvalState] ?? "待确认"}</p>
      <p className="mt-2 break-all">最近核验：{field.verifiedAt ?? "未记录"}</p>
      {field.approvalHash && <p className="mt-2 break-all">审核哈希：{field.approvalHash}</p>}
      {field.evidence.map((evidence, index) => <div key={index} className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-700">
        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="inline-block min-h-11 break-all py-2 text-brand-strong">{evidence.sourceUrl}</a>
        <p className="break-all">抓取：{evidence.fetchedAt} · 核验：{evidence.verifiedAt ?? "未记录"}</p>
        <p className="mt-1 break-all">证据哈希：{evidence.evidenceHash}</p>
        <p className="mt-1 break-all">原始内容 SHA-256：{evidence.rawContentHashes.join("、") || "此字段未记录"}</p>
      </div>)}
    </article>)}</div>
    <Link href="/sources" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-brand-strong">查看官方来源健康 →</Link>
  </details>;
}
