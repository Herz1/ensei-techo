"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import { useEventPlans, type TicketApplicationStatus } from "@/lib/store";
import { APPLICATION_STATUS_LABEL } from "@/lib/plan";
import type { EventSummary } from "@/lib/types";

// concert-travel-app-design: round cards and five-step application ribbon.
const STAGES = ["preparing", "applied", "won", "paid", "ticketed"] as const;
export default function ApplicationsBoard({events}:{events:EventSummary[]}) {
  const {plans,updateApplication}=useEventPlans();
  const [filter,setFilter]=useState<'all'|'active'|'closed'>('all');
  const rows=plans.flatMap(plan=>plan.applications.map(application=>({eventId:plan.eventId,application,event:events.find(event=>event.id===plan.eventId)})));
  const closed=(status:TicketApplicationStatus)=>['lost','cancelled','ticketed'].includes(status);
  const visible=rows.filter(row=>filter==='all'||(filter==='closed' ? closed(row.application.status) : !closed(row.application.status)));
  return <div className="application-board"><p className="text-xs tracking-widest text-zinc-500">TICKET NOTEBOOK / 抽選申込</p><h1 className="mt-3">每一轮期待，都有记录。</h1><p className="mt-3 text-sm text-zinc-500">记录你已确认的申请结果；这里不会替你申请、付款或推测中签。</p>
    <div className="application-summary"><span>全部轮次 <strong>{rows.length}</strong></span><span>等待结果 <strong>{rows.filter(row=>row.application.status==='applied').length}</strong></span><span>中签待付款 <strong>{rows.filter(row=>row.application.status==='won').length}</strong></span></div>
    <div className="flex flex-wrap items-center gap-2">{([['all','全部'],['active','进行中'],['closed','已结束']] as const).map(([key,label])=><button key={key} type="button" aria-pressed={key===filter} onClick={()=>setFilter(key)} className={`min-h-11 rounded border px-4 text-sm ${filter===key?'border-brand bg-brand-soft text-brand-strong':'border-zinc-300'}`}>{label}</button>)}<Link href="/events" className="ml-auto text-sm text-brand-strong">查找公演并添加申请 →</Link></div>
    {!visible.length&&<div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-9 text-center"><h2 className="font-semibold">{rows.length?'此分类暂无申请记录':'还没有抽选申请记录'}</h2><p className="mt-2 text-sm text-zinc-500">在公演详情或个人手账中添加申请，这里会同步显示。</p><Link href="/me" className="mt-4 inline-block text-sm text-brand-strong">打开个人手账 →</Link></div>}
    {visible.map(({eventId,application:app,event})=><article className="application-record" key={app.id} data-application-id={app.id}><header><div><h2>{event?.titleJa||'已保存公演'}</h2><p>{event?.date||'日期待确认'} · {app.label} {app.provider?`· ${app.provider}`:''}</p></div><Link href={`/events/${eventId}`} aria-label={`查看公演 ${event?.titleJa||eventId}`}><ArrowUpRight size={17}/></Link></header>
      <div className="application-stages" aria-label="申请流程">{STAGES.map((stage,index)=><span key={stage} data-current={app.status===stage}>{STAGES.indexOf(app.status as typeof STAGES[number])>index?<Check size={11}/>:String(index+1).padStart(2,'0')} {APPLICATION_STATUS_LABEL[stage]}</span>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-xs">实际状态 <select aria-label={`${app.label} 实际状态`} value={app.status} onChange={e=>updateApplication(eventId,app.id,{status:e.target.value as TicketApplicationStatus})}>{Object.entries(APPLICATION_STATUS_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><Link href="/me">编辑申请详情与准备项 →</Link></div>
      {app.accountAlias&&<p>申请账户：{app.accountAlias}</p>}{app.privateNote&&<p className="whitespace-pre-wrap">手账备注：{app.privateNote}</p>}
    </article>)}
  </div>;
}
