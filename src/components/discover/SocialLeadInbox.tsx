"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ExternalLink, Inbox, Link2, Plus, ShieldAlert, X } from "lucide-react";
import { containsSensitivePersonalData, useEventPlans } from "@/lib/store";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { ticketOffersOf } from "@/lib/ticket-offer";
import { matchSocialLead } from "@/lib/social-lead-core.mjs";
import { type SocialLead, useSocialLeads } from "@/lib/social-leads";

const PLATFORM_LABEL = { xhs: "小红书 / XHS", x: "X", instagram: "Instagram", other: "其他" } as const;
const FIELD = "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";
type EventContext = {
  id: string;
  titleJa: string;
  titleZh: string;
  date: string;
  artistNames: string[];
  venueNames: string[];
};

function LeadCard({ lead, contexts, eventById }: { lead: SocialLead; contexts: EventContext[]; eventById: Map<string, EventSummary> }) {
  const { confirmMatch, returnToInbox, dismissLead } = useSocialLeads();
  const { getPlan, upsertPlan, addApplication } = useEventPlans();
  const candidates = useMemo(() => matchSocialLead(lead, contexts, 5), [lead, contexts]);
  const matchedEvent = lead.matchedEventId ? eventById.get(lead.matchedEventId) : undefined;
  const plan = matchedEvent ? getPlan(matchedEvent.id) : undefined;
  const preparationExists = Boolean(plan?.applications.some((application) => application.privateNote?.includes(lead.id)));
  const [message, setMessage] = useState("");

  const addPlan = () => {
    if (!matchedEvent) return;
    upsertPlan(matchedEvent.id, { intent: "interested" });
    setMessage("已加入正式演出计划；社媒内容仍保持未核验线索。 ");
  };
  const addPreparation = () => {
    if (!matchedEvent || preparationExists) return;
    addApplication(matchedEvent.id, {
      label: "社媒线索后的申请准备",
      status: "preparing",
      privateNote: `未核验社媒线索 ${lead.id}；正式要求以官方 Event/Ticket 来源为准。`,
    });
    setMessage("已创建申请准备项，不会自动认定社媒内容为票务事实。");
  };

  return (
    <article data-social-lead-id={lead.id} className="rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"><ShieldAlert size={13} /> 社媒线索 · 未核验</p>
          <p className="mt-1 text-sm font-bold">{PLATFORM_LABEL[lead.platform]}</p>
          {lead.pastedText && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{lead.pastedText}</p>}
          {lead.note && <p className="mt-1 text-xs text-zinc-400">私人备注：{lead.note}</p>}
        </div>
        {lead.canonicalUrl && <a href={lead.canonicalUrl} target="_blank" rel="noreferrer" aria-label={`打开保存的 ${PLATFORM_LABEL[lead.platform]} 线索`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-violet-600 dark:hover:bg-zinc-800"><ExternalLink size={14} /></a>}
      </div>

      {matchedEvent ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-500/10">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">已由你确认关联</p>
          <Link href={`/events/${matchedEvent.id}`} prefetch={false} className="mt-1 block text-sm font-bold hover:text-violet-600">{matchedEvent.titleJa}</Link>
          <p className="mt-1 text-xs text-zinc-500">{matchedEvent.date} · 正式 Event 有 {matchedEvent.verification.sources.length} 个官方演出来源 · {ticketOffersOf(matchedEvent).some((offer) => offer.urlKind === "event_detail") ? "已有具体票务入口" : "具体票务入口未确认"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/events/${matchedEvent.id}`} prefetch={false} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white">打开正式 Event <ArrowRight size={12} /></Link>
            <button type="button" onClick={addPlan} className="min-h-10 rounded-xl border border-violet-300 px-3 text-xs font-bold text-violet-700 dark:border-violet-700 dark:text-violet-300">{plan ? "已在计划中" : "加入计划"}</button>
            <button type="button" onClick={addPreparation} disabled={preparationExists} className="min-h-10 rounded-xl border border-zinc-300 px-3 text-xs font-bold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">{preparationExists ? "已创建准备项" : "创建申请准备项"}</button>
            <button type="button" onClick={() => returnToInbox(lead.id)} className="min-h-10 px-2 text-xs font-semibold text-zinc-400">取消关联</button>
          </div>
          {message && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</p>}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs font-bold text-zinc-500">本地候选 · 必须由你确认</p>
          {candidates.length ? (
            <div className="mt-2 space-y-2">
              {candidates.map((candidate: { eventId: string; reasons: string[] }) => {
                const event = eventById.get(candidate.eventId);
                if (!event) return null;
                return (
                  <div key={candidate.eventId} className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 sm:flex-row sm:items-center dark:bg-zinc-800/70">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{event.titleJa}</p><p className="mt-1 text-xs text-zinc-400">{event.date} · {candidate.reasons.join(" · ")}</p></div>
                    <button type="button" aria-label={`确认关联：${event.titleJa}`} onClick={() => confirmMatch(lead.id, event.id)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-bold text-white dark:bg-white dark:text-zinc-900"><Check size={12} /> 确认关联</button>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-2 rounded-xl border border-dashed border-zinc-300 py-4 text-center text-xs text-zinc-400 dark:border-zinc-700">没有本地匹配；线索会继续仅保存在本机。</p>}
          <button type="button" onClick={() => dismissLead(lead.id)} className="mt-2 inline-flex min-h-10 items-center gap-1 px-2 text-xs font-semibold text-zinc-400 hover:text-red-500"><X size={12} /> 移出收件箱</button>
        </div>
      )}
    </article>
  );
}

export default function SocialLeadInbox({ events, artists, venues }: { events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  const { leads, createLead } = useSocialLeads();
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const contexts = useMemo(() => {
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));
    const venueById = new Map(venues.map((venue) => [venue.id, venue]));
    return events.map((event) => {
      const venue = venueById.get(event.venueId);
      return {
        id: event.id,
        titleJa: event.titleJa,
        titleZh: event.titleZh,
        date: event.date,
        artistNames: event.artistIds.flatMap((id) => {
          const artist = artistById.get(id);
          return artist ? [artist.nameJa, artist.nameZh, artist.romaji].filter((name): name is string => Boolean(name)) : [];
        }),
        venueNames: venue ? [venue.nameJa, venue.nameZh, venue.city].filter((name): name is string => Boolean(name)) : [],
      };
    });
  }, [artists, events, venues]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const visible = leads.filter((lead) => lead.status !== "dismissed").slice(0, 8);

  return (
    <section aria-labelledby="social-lead-title" className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="social-lead-title" className="flex items-center gap-2 text-base font-bold"><Inbox size={17} className="text-amber-600" /> 社媒线索收件箱</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">粘贴后只在本机匹配正式演出；不会登录或抓取外部页面。</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white"><Plus size={14} /> 保存社媒线索 <ChevronDown size={13} className={open ? "rotate-180" : ""} /></button>
      </div>

      {open && (
        <form className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:grid-cols-2 dark:border-amber-900 dark:bg-zinc-900" onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim() && !pastedText.trim()) { setMessage("请至少填写 URL 或公告文字。"); return; }
          if (containsSensitivePersonalData(pastedText, note)) { setMessage("未保存：请删除完整手机号、证件号、银行卡号、验证码或密码。"); return; }
          const id = createLead({ url: url.trim() || undefined, pastedText: pastedText.trim() || undefined, note: note.trim() || undefined });
          if (!id) { setMessage("URL 格式无效；请使用 HTTP(S) 地址，或只粘贴公告文字。"); return; }
          setUrl(""); setPastedText(""); setNote(""); setMessage("线索已保存在本机，候选不会自动关联。");
        }}>
          <label className="text-xs font-semibold text-zinc-500 sm:col-span-2"><span className="inline-flex items-center gap-1"><Link2 size={12} /> 社媒 URL（可选）</span><input aria-label="社媒 URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="小红书 / X / Instagram / 其他 HTTP(S) URL" className={FIELD} /></label>
          <label className="text-xs font-semibold text-zinc-500">公告文字<textarea aria-label="公告文字" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="粘贴艺人、标题、日期或场馆；不做 OCR" className={`${FIELD} min-h-24`} /></label>
          <label className="text-xs font-semibold text-zinc-500">私人备注<textarea aria-label="社媒私人备注" value={note} onChange={(event) => setNote(event.target.value)} placeholder="仅保存在本机；不要填写手机号、证件或凭据" className={`${FIELD} min-h-24`} /></label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white sm:col-span-2 dark:bg-white dark:text-zinc-900"><Plus size={13} /> 保存到本机收件箱</button>
          {message && <p role="status" className={`text-xs font-semibold sm:col-span-2 ${message.startsWith("线索已") ? "text-emerald-600" : "text-red-500"}`}>{message}</p>}
        </form>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((lead) => <LeadCard key={`${lead.id}-${lead.updatedAt}`} lead={lead} contexts={contexts} eventById={eventById} />)}
      </div>
      {visible.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-amber-300 py-5 text-center text-xs text-amber-700 dark:border-amber-800 dark:text-amber-300">暂无线索。保存 URL 或文字后立即进行离线匹配。</p>}

      <div aria-label="信息信任层级" className="mt-4 grid gap-2 border-t border-amber-200 pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4 dark:border-amber-900">
        <p><b className="text-amber-700 dark:text-amber-300">社媒线索</b><br /><span className="text-zinc-500">未核验，不写正式数据</span></p>
        <p><b className="text-emerald-700 dark:text-emerald-300">官方演出来源</b><br /><span className="text-zinc-500">确认演出存在</span></p>
        <p><b className="text-sky-700 dark:text-sky-300">官方票务来源</b><br /><span className="text-zinc-500">确认票务入口</span></p>
        <p><b className="text-violet-700 dark:text-violet-300">个人备注</b><br /><span className="text-zinc-500">仅自己可见</span></p>
      </div>
    </section>
  );
}
