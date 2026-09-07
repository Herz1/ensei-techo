"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowRight, MapPin, Ticket, Plane, Bookmark, CalendarDays } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { useEventPlans, useFollows, usePreferences } from "@/lib/store";
import { useTripPlans } from "@/lib/trip-store";
import { todayJst, formatJaDateShort } from "@/lib/time";
import { planStatusLabel } from "@/lib/plan";
import SaleAlerts from "@/components/me/SaleAlerts";
import SocialLeadInbox from "@/components/discover/SocialLeadInbox";
import FirstRunSetup from "@/components/discover/FirstRunSetup";
import StatusBadge from "@/components/event/StatusBadge";
import PreferencePrice from "@/components/ui/PreferencePrice";
import { minPrice } from "@/components/event/status";

// Composition adapted from homepage-design; semantic palette from ui-refinement.
// All cards use the live catalogue and existing stores, never prototype fixtures.
export default function PaperHome({ events, artists, venues }: { events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  const { plans } = useEventPlans();
  const { items: follows } = useFollows();
  const { trips } = useTripPlans();
  const { preferences } = usePreferences();
  const [filter, setFilter] = useState<"all" | "followed">("all");
  const today = todayJst();
  const upcoming = events.filter(event => event.date >= today).sort((a,b) => a.date.localeCompare(b.date));
  const followed = artists.filter(artist => follows.includes(artist.id));
  const visible = (filter === "followed" ? upcoming.filter(event => event.artistIds.some(id => follows.includes(id))) : upcoming).slice(0,6);
  const nextTrip = trips.filter(trip => trip.endDate >= today).sort((a,b) => a.startDate.localeCompare(b.startDate))[0];
  const nextEvent = nextTrip ? events.find(event => nextTrip.eventIds.includes(event.id)) : undefined;
  const nextVenue = venues.find(venue => venue.id === nextEvent?.venueId);
  const completed = nextTrip?.checklist.filter(item => item.done).length ?? 0;
  return <div className="paper-home">
    <div className="paper-greeting"><div><p className="paper-eyebrow">{today.replaceAll("-", ".")} · JST · MY LIVE JOURNAL</p><h1>下一场心动，<span>准备好出发。</span></h1></div><div className="paper-summary"><span><Bookmark size={14}/>{plans.length} 场计划</span><span><Plane size={14}/>{trips.length} 次远征</span></div></div>
    {preferences.setupStatus === "pending" && <FirstRunSetup artists={artists}/>}
    <div className="paper-lead-grid">
      <section className="paper-panel paper-action-panel"><div className="paper-section-heading"><div><p className="paper-eyebrow">01 / NEXT ACTION</p><h2>今日行动</h2></div><Link href="/me">全部记录 <ArrowUpRight size={15}/></Link></div><SaleAlerts plans={plans} followed={followed} events={events} compact/></section>
      <section className="paper-panel paper-trip-panel"><div className="paper-section-heading"><div><p className="paper-eyebrow">02 / NEXT JOURNEY</p><h2>下一次远征</h2></div><span className="paper-stamp">旅の支度</span></div>
        {nextTrip ? <><h3>{nextTrip.name}</h3><p className="paper-muted">{formatJaDateShort(nextTrip.startDate)} — {formatJaDateShort(nextTrip.endDate)} · {nextTrip.eventIds.length} 场公演</p><JourneyMap from={nextTrip.origin || "出发地待填写"} to={nextVenue?.nameJa || "目的地待确认"}/><div className="paper-trip-bottom"><span>出行清单 <strong>{completed}/{nextTrip.checklist.length}</strong></span><Link className="paper-primary" href={`/trips/${nextTrip.id}`}>打开行程 <ArrowRight size={15}/></Link></div></> : <><h3>把下一场现场，变成一段旅程。</h3><p className="paper-muted">从已加入计划的公演出发，安排交通、住宿和入场准备。</p><JourneyMap from="出发" to="期待中的现场"/><Link className="paper-primary" href="/trips">规划一次远征 <ArrowRight size={15}/></Link></>}
      </section>
    </div>
    <section className="paper-panel paper-ticket-panel"><div className="paper-section-heading"><div><p className="paper-eyebrow">03 / TICKET NOTEBOOK</p><h2>票务进度手账</h2></div><Link href="/applications">抽选记录 <ArrowUpRight size={15}/></Link></div>
      {plans.length ? <div className="paper-plan-grid">{plans.slice(0,4).map(plan => { const event = events.find(item => item.id === plan.eventId); return <Link href={`/events/${plan.eventId}`} key={plan.eventId} className="paper-plan"><Ticket size={18}/><div><strong>{event?.titleJa || "已保存公演"}</strong><p>{planStatusLabel(plan)} · {event?.date || "日期待确认"}</p></div><ArrowUpRight size={15}/></Link>; })}</div> : <div className="paper-empty"><Ticket size={25}/><div><strong>还没有公演计划</strong><p>找到喜欢的演出后加入计划，申请与付款进度会收在这里。</p></div><Link href="/events">去发现 <ArrowRight size={14}/></Link></div>}
    </section>
    <section className="paper-discover"><div className="paper-section-heading"><div><p className="paper-eyebrow">04 / DISCOVER LIVE</p><h2>现场，会有新的相遇。</h2></div><div className="paper-filters" aria-label="公演范围">{([['all','即将开演'],['followed','我的关注']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}<Link href="/events">全部 <ArrowUpRight size={14}/></Link></div></div>
      <div className="paper-event-grid">{visible.map((event,index) => { const venue = venues.find(item=>item.id===event.venueId); const price=minPrice(event); return <Link key={event.id} href={`/events/${event.id}`} prefetch={false} className="paper-event"><div className="paper-event-date"><span>{event.date.slice(5).replace('-',' / ')}</span><StatusBadge event={event}/></div><span className="paper-event-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><h3>{event.titleJa}</h3><p className="paper-muted">{event.artistIds.map(id=>artists.find(artist=>artist.id===id)?.nameJa).filter(Boolean).slice(0,3).join(' / ')}</p><div className="paper-event-bottom"><span><MapPin size={13}/>{venue?.nameJa || '场馆待确认'}</span><strong>{price == null ? '票价待确认' : <PreferencePrice amountJpy={price}/>}</strong></div></Link>; })}</div>
      {!visible.length && <p className="paper-empty">{filter==='followed' ? '关注艺人后，这里会显示他们即将举办的公演。' : '暂时没有即将举办的公演，请到公演页查看完整档案。'}</p>}
    </section>
    <div className="paper-bottom-grid"><section className="paper-panel"><SocialLeadInbox events={events} artists={artists} venues={venues}/></section><section className="paper-panel paper-prep"><p className="paper-eyebrow">BEFORE YOU GO</p><h2>小事准备妥当，<br/>现场只管尽兴。</h2><p>申请资格、电子票设备、证件和交通时间，留一点余裕给期待。</p><Link href="/applications"><Ticket size={17}/>核对抽选与付款记录 <ArrowUpRight size={15}/></Link><Link href="/trips"><CalendarDays size={17}/>整理出行与入场清单 <ArrowUpRight size={15}/></Link><Link href="/map"><MapPin size={17}/>在地图上看看场馆 <ArrowUpRight size={15}/></Link></section></div>
  </div>;
}

// Route illustration adapted from NextTrip.tsx; labels come from the user's trip.
function JourneyMap({from,to}:{from:string;to:string}) {
  return <div className="paper-journey-map"><svg viewBox="0 0 500 125" aria-hidden="true"><path d="M-10 100 Q80 40 170 90 T510 70 M-10 115 Q80 55 170 105 T510 85" fill="none" stroke="currentColor" opacity=".1"/><path d="M35 95 Q180 -10 300 48 L450 38" fill="none" stroke="var(--paper-red)" strokeWidth="2" strokeDasharray="6 6"/><circle cx="35" cy="95" r="5" fill="var(--paper-card)" stroke="currentColor" strokeWidth="2"/><circle cx="450" cy="38" r="7" fill="var(--paper-red)"/><path d="m210 32 18 3-12 10 1-8z" fill="var(--paper-red)"/></svg><div><span>{from}</span><span>{to}</span></div></div>;
}
