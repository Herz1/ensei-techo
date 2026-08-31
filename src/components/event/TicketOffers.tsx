"use client";

import { AlertTriangle, Clock, ExternalLink, Info, TicketCheck } from "lucide-react";
import type { EventItem, TicketOffer, TicketSaleStatus } from "@/lib/types";
import {
  getNextTicketAction,
  getTicketFreshness,
  platformPreparationAdvice,
  ticketOfferCtaLabel,
  ticketOffersOf,
  ticketUrlKindLabel,
} from "@/lib/ticket-offer";
import type { TicketApplication } from "@/lib/store";
import { useEventPlans } from "@/lib/store";
import { APPLICATION_STATUS_LABEL } from "@/lib/plan";
import OfficialInstant from "@/components/ui/OfficialInstant";

const SALE_LABEL: Record<TicketSaleStatus, string> = {
  announced: "已公告",
  not_started: "未开始",
  open: "受付中",
  closed: "已结束",
  unknown: "状态待确认",
};

const INVENTORY_LABEL: Record<TicketOffer["inventoryStatus"], string> = {
  available: "官方显示可售",
  low: "官方显示余量较少",
  sold_out: "官方显示已售罄",
  unknown: "库存未说明",
};

const SALE_TYPE_LABEL: Record<TicketOffer["saleType"], string> = {
  fan_club_lottery: "FC 抽选",
  playguide_lottery: "抽选受付",
  general_sale: "一般发售",
  official_resale: "官方转售",
  other: "官方票务",
};

function formatVerifiedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function OfferDetails({
  offer,
  applications,
  createApplication,
}: {
  offer: TicketOffer;
  applications: TicketApplication[];
  createApplication: (status: "preparing" | "applied") => void;
}) {
  const freshness = getTicketFreshness(offer);
  const linkedApplications = applications.filter((application) => application.offerId === offer.id);
  const historicalPrefix = freshness.isStale
    ? freshness.recorded ? "上次核验：" : "未核验："
    : "";
  return (
    <div data-offer-id={offer.id} className="rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{offer.providerLabel} · {SALE_TYPE_LABEL[offer.saleType]}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              官方渠道
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              {ticketUrlKindLabel(offer.urlKind)}
            </span>
          </div>
        </div>
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition ${offer.urlKind === "event_detail" ? "bg-violet-600 text-white hover:bg-violet-700" : "border border-zinc-300 text-zinc-600 hover:border-violet-300 hover:text-brand-strong dark:border-zinc-700 dark:text-zinc-300"}`}
        >
          {ticketOfferCtaLabel(offer)} <ExternalLink size={12} />
        </a>
      </div>
      <div className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs ${freshness.isStale ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-zinc-50 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400"}`}>
        {freshness.recorded && freshness.verifiedAt ? (
          <>
            <Clock size={12} />
            <span>最近核验 {formatVerifiedAt(freshness.verifiedAt)}</span>
            {freshness.isStale && (
              <span className="inline-flex items-center gap-1 font-bold">
                <AlertTriangle size={12} /> 信息可能过旧
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 font-bold">
            <AlertTriangle size={12} /> 核验时间未记录
          </span>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-bold ${freshness.isStale ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : offer.saleStatus === "open" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          {historicalPrefix}{SALE_LABEL[offer.saleStatus]}
        </span>
        <span className={`rounded-full px-2 py-0.5 font-bold ${freshness.isStale ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : offer.inventoryStatus === "sold_out" ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          {historicalPrefix}{INVENTORY_LABEL[offer.inventoryStatus]}
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <div><dt className="text-zinc-400">受付开始（JST）</dt><dd className="mt-0.5 font-semibold tabular-nums"><OfficialInstant value={offer.startAt} /></dd></div>
        <div><dt className="text-zinc-400">受付截止（JST）</dt><dd className="mt-0.5 font-semibold tabular-nums"><OfficialInstant value={offer.endAt} /></dd></div>
        <div><dt className="text-zinc-400">结果公布（JST）</dt><dd className="mt-0.5 font-semibold tabular-nums"><OfficialInstant value={offer.resultAt} /></dd></div>
        <div><dt className="text-zinc-400">付款期限（JST）</dt><dd className="mt-0.5 font-semibold tabular-nums"><OfficialInstant value={offer.paymentDeadline} /></dd></div>
        <div><dt className="text-zinc-400">票券显示／下载（JST）</dt><dd className="mt-0.5 font-semibold tabular-nums"><OfficialInstant value={offer.ticketDisplayAt ?? null} /></dd></div>
      </dl>
      <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <p className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">本场明确要求 · 官方页</p>
        <dl className="mt-2 grid gap-1.5 text-xs text-zinc-500 sm:grid-cols-2 dark:text-zinc-400">
          <div><dt className="inline font-semibold">申请资格：</dt><dd className="inline">{offer.eligibility.length ? offer.eligibility.join("；") : "未说明"}</dd></div>
          <div><dt className="inline font-semibold">会员／账号：</dt><dd className="inline">{offer.membershipRequirement ?? "未说明"}</dd></div>
          <div><dt className="inline font-semibold">日本手机号：</dt><dd className="inline">{offer.requiresJapanesePhone === true ? "需要" : offer.requiresJapanesePhone === false ? "不需要" : "未说明"}</dd></div>
          <div><dt className="inline font-semibold">地区限制：</dt><dd className="inline">{offer.regionRestriction ?? "未说明"}</dd></div>
          <div><dt className="inline font-semibold">电话／SMS 认证：</dt><dd className="inline">{offer.phoneVerification ?? "未说明"}</dd></div>
          <div><dt className="inline font-semibold">本人确认：</dt><dd className="inline">{offer.identityCheck === true ? "官方说明需要" : offer.identityCheck === false ? "官方说明不需要" : "未说明"}</dd></div>
          <div><dt className="inline font-semibold">电子票 App：</dt><dd className="inline">{offer.ticketApp ?? "未说明"}</dd></div>
          <div><dt className="inline font-semibold">同行者限制：</dt><dd className="inline">{offer.companionRestriction ?? "未说明"}</dd></div>
          <div><dt className="inline font-semibold">票券分配：</dt><dd className="inline">{offer.ticketDistribution ?? "未说明"}</dd></div>
        </dl>
      </div>
      <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
        <p className="font-bold">平台准备建议 · 非本场明确要求</p>
        <p className="mt-1 leading-relaxed">{platformPreparationAdvice(offer)} 本场未说明的内容仍需打开官方页确认。</p>
      </div>
      <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {linkedApplications.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-zinc-400">本机申请记录：</span>
            {linkedApplications.map((application) => (
              <span key={application.id} className="rounded-full bg-violet-100 px-2 py-1 font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {application.label} · {APPLICATION_STATUS_LABEL[application.status]}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => createApplication("preparing")} className="rounded-full border border-violet-300 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-500/10">
              准备申请
            </button>
            <button type="button" onClick={() => createApplication("applied")} className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
              已申请此轮
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TicketOffers({ event }: { event: EventItem }) {
  const { plans, addApplication } = useEventPlans();
  const plan = plans.find((item) => item.eventId === event.id);
  const offers = ticketOffersOf(event)
    .filter((offer) => !["support", "refund"].includes(offer.urlKind))
    .sort((left, right) => {
      const rank = { open: 0, not_started: 1, announced: 2, unknown: 3, closed: 4 };
      return rank[left.saleStatus] - rank[right.saleStatus]
        || (left.endAt ?? left.startAt ?? "9999").localeCompare(right.endAt ?? right.startAt ?? "9999");
    });
  const next = getNextTicketAction(event, plan);
  const primary = next.offer
    ? offers.find((offer) => offer.id === next.offer?.id) ?? next.offer
    : offers[0] ?? null;
  const others = primary ? offers.filter((offer) => offer.id !== primary.id) : offers;
  const createForOffer = (offer: TicketOffer, status: "preparing" | "applied") => {
    addApplication(event.id, {
      offerId: offer.id,
      label: `${offer.providerLabel} · ${SALE_TYPE_LABEL[offer.saleType]}`,
      provider: offer.providerLabel,
      round: SALE_TYPE_LABEL[offer.saleType],
      status,
      ...(status === "applied" ? { appliedAt: new Date().toISOString() } : {}),
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-card-dark">
      <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
        <TicketCheck size={16} /> 购票与抽选
      </h2>

      {primary ? (
        <div className="mt-3"><OfferDetails offer={primary} applications={plan?.applications ?? []} createApplication={(status) => createForOffer(primary, status)} /></div>
      ) : (
        <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          尚无可确认的官方购票渠道；不会把普通来源页当成购票入口。
        </p>
      )}
      {others.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 hover:border-violet-300 dark:border-zinc-700 dark:text-zinc-300">
            其他 {others.length} 个官方渠道
          </summary>
          <div className="mt-2 space-y-2">{others.map((offer) => <OfferDetails key={offer.id} offer={offer} applications={plan?.applications ?? []} createApplication={(status) => createForOffer(offer, status)} />)}</div>
        </details>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        官方来源与核验时间分别显示；信息过旧不等于停售，受付结束不等于售罄。未说明的内容不会被推测，跳转后请以官方页面当前显示为准。
      </p>
    </section>
  );
}
