// 远征手账 遠征手帳 — 领域类型定义

export type Genre =
  | "jpop"
  | "jrock"
  | "idol"
  | "seiyu_anison"
  | "visual_kei"
  | "vtuber"
  | "hiphop_rnb"
  | "electronic"
  | "alt_indie";

export type VenueTier = "livehouse" | "hall" | "arena" | "dome" | "stadium";

export type EventType = "oneman" | "taiban" | "fes" | "idol_seiyu" | "release_event";

export type EventStatus = "announced" | "lottery" | "on_sale" | "sold_out" | "resale" | "ended";

/** 演出本身的状态；不要与受付或库存混用。 */
export type EventLifecycleStatus =
  | "scheduled"
  | "postponed"
  | "cancelled"
  | "rescheduled"
  | "completed";

export type TicketSaleStatus =
  | "announced"
  | "not_started"
  | "open"
  | "closed"
  | "unknown";

export type TicketInventoryStatus = "available" | "low" | "sold_out" | "unknown";

export type TicketProvider = "eplus" | "pia" | "lawson" | "ticketbook" | "other";

export type TicketUrlKind =
  | "event_detail"
  | "generic_provider"
  | "search"
  | "support"
  | "refund"
  | "unknown";

export type TicketSaleType =
  | "fan_club_lottery"
  | "playguide_lottery"
  | "general_sale"
  | "official_resale"
  | "other";

export type PhaseKind = "fc_lottery" | "playguide_lottery" | "general" | "resale";

export type PhaseStatus = "upcoming" | "open" | "closed";

export type AvailabilityStatus =
  | "not_checked"
  | "not_found_on_page"
  | "published"
  | "not_announced"
  | "source_does_not_disclose"
  | "parser_failed"
  | "page_fetch_failed"
  | "blocked"
  | "pending_review"
  | "conflicting_sources";

export type EventFieldName =
  | "title"
  | "artist"
  | "venue"
  | "eventDate"
  | "openTime"
  | "startTime"
  | "ticketTypes"
  | "prices"
  | "additionalFees"
  | "ticketPhases"
  | "eligibility"
  | "purchaseUrls";

export type OfficialSourceType =
  | "artist_official"
  | "venue_official"
  | "promoter_official"
  | "ticket_official"
  | "official_api"
  | "ticket_api";

export interface Artist {
  id: string;
  nameJa: string;
  /** 仅在有可靠来源时填写；最小实体不翻译、不臆测读音。 */
  nameZh: string | null;
  romaji: string | null;
  kana: string | null;
  aliases: string[];
  genres: Genre[];
  /** 旧静态资料中的展示权重；新采集艺人不使用该字段 */
  popularity?: number;
  /** 头像渐变主色 */
  color: string;
  profileStatus?: "full" | "minimal";
  verification?: {
    state: "verified";
    checkedAt: string;
    evidenceHash: string;
    sources: {
      name: string;
      type: OfficialSourceType;
      url: string;
      fetchedAt: string;
      rawContentHashes?: string[];
    }[];
  };
}

export interface StationAccess {
  line: string;
  station: string;
  walkMin: number;
}

export interface HubAccess {
  from: string;
  route: string;
  min: number;
}

export interface Venue {
  id: string;
  nameJa: string;
  nameZh: string | null;
  /** 都道府县 id,对应 prefectures.ts */
  prefecture: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  tier: VenueTier | null;
  stations: StationAccess[];
  hubAccess: HubAccess[];
  /** 寄物柜情报 */
  lockers?: string;
  notes?: string;
  /** 大型场馆的 3D 模型标识 */
  model3d?: "tokyo-dome" | "budokan" | "yokohama-arena";
  profileStatus?: "full" | "minimal";
  verification?: {
    state: "verified";
    checkedAt: string;
    evidenceHash: string;
    sources: {
      name: string;
      type: OfficialSourceType;
      url: string;
      fetchedAt: string;
      rawContentHashes?: string[];
    }[];
  };
}

export interface TicketTier {
  name: string;
  priceJpy: number;
  taxIncluded?: boolean | null;
  note?: string;
}

export interface AdditionalFee {
  type: "drink" | "system" | "issuance" | "other";
  label: string;
  amountJpy: number | null;
  required: boolean;
}

export interface EligibilityRule {
  label: string;
  appliesTo: string;
}

export interface SalePhase {
  name: string;
  kind: PhaseKind;
  /** JST 日期 YYYY-MM-DD */
  start: string;
  end: string;
  status: PhaseStatus;
  /** 对应的官方抽选/购票页面 */
  url?: string;
}

export interface StreamingInfo {
  platform: string;
  priceJpy: number;
}

export interface EventTicketLink {
  label: string;
  url: string;
  purpose: "ticket" | "official_info";
}

/** 一条可独立采取行动的官方受付/购票渠道。未知事实保持 null。 */
export interface TicketOffer {
  id: string;
  eventId: string;
  provider: TicketProvider;
  providerLabel: string;
  providerEventId: string | null;
  url: string;
  urlKind: TicketUrlKind;
  saleType: TicketSaleType;
  saleStatus: TicketSaleStatus;
  inventoryStatus: TicketInventoryStatus;
  startAt: string | null;
  endAt: string | null;
  resultAt: string | null;
  paymentDeadline: string | null;
  eligibility: string[];
  requiresJapanesePhone: boolean | null;
  identityCheck: boolean | null;
  ticketApp: string | null;
  /** 本场官方页明确披露的会员／账号要求；平台通用规则不得写入。 */
  membershipRequirement?: string | null;
  /** 本场官方页明确披露的地区限制。 */
  regionRestriction?: string | null;
  /** 本场官方页明确披露的 SMS／电话认证要求。 */
  phoneVerification?: string | null;
  /** 本场官方页明确披露的同行者限制。 */
  companionRestriction?: string | null;
  /** 本场官方页明确披露的票券分配规则。 */
  ticketDistribution?: string | null;
  /** 本场官方页明确披露的票券显示／下载时间。 */
  ticketDisplayAt?: string | null;
  sourceUrl: string;
  lastVerifiedAt: string;
  matchLevel: "confirmed" | "probable";
  derivedFromLegacy?: boolean;
}

export interface EventVerification {
  state: "verified";
  checkedAt: string;
  evidenceHash: string;
  sources: {
    name: string;
    type: OfficialSourceType;
    url: string;
    fetchedAt: string;
  }[];
}

export interface FieldEvidence {
  sourceUrl: string;
  sourceType: OfficialSourceType;
  fetchedAt: string;
  verifiedAt: string | null;
  evidenceHash: string;
  confidence: number;
  availabilityStatus: AvailabilityStatus;
  rawContentHashes: string[];
}

export interface FieldProvenance {
  availabilityStatus: AvailabilityStatus;
  confidence: number;
  approvalState: "pending_review" | "approved" | "changed" | "conflict";
  approvalHash?: string;
  verifiedAt: string | null;
  evidence: FieldEvidence[];
}

export interface EventItem {
  id: string;
  artistIds: string[];
  titleJa: string;
  titleZh: string;
  tourName?: string;
  type: EventType;
  venueId: string;
  /** JST 公演日 YYYY-MM-DD */
  date: string;
  /** 開場 HH:mm (JST) */
  openTime: string;
  /** 開演 HH:mm (JST) */
  startTime: string;
  /** 新主字段：只描述演出生命周期。 */
  eventStatus: EventLifecycleStatus;
  /** 兼容旧界面的展示状态，不作为库存事实来源。 */
  status: EventStatus;
  tiers: TicketTier[];
  additionalFees: AdditionalFee[];
  phases: SalePhase[];
  eligibility: EligibilityRule[];
  ticketLinks: EventTicketLink[];
  /** 新主读取结构；旧 phases/ticketLinks 仅用于保守兼容。 */
  ticketOffers: TicketOffer[];
  availability: Record<EventFieldName, AvailabilityStatus>;
  fieldProvenance: Record<EventFieldName, FieldProvenance>;
  verification: EventVerification;
  streaming?: StreamingInfo;
  tags: string[];
}

/**
 * 由正式 Event 构建生成的客户端视图。它不是第二套领域模型；只删除列表、地图、
 * 本地计划和搜索不需要的字段级证据、可用性明细及详情专用内容。
 */
export type EventSummary = Pick<
  EventItem,
  | "id"
  | "artistIds"
  | "titleJa"
  | "titleZh"
  | "tourName"
  | "type"
  | "venueId"
  | "date"
  | "openTime"
  | "startTime"
  | "eventStatus"
  | "status"
  | "tiers"
  | "phases"
  | "eligibility"
  | "ticketLinks"
  | "ticketOffers"
  | "streaming"
> & {
  verification: Pick<EventVerification, "checkedAt" | "sources">;
};

export type ArtistSummary = Omit<Artist, "verification">;
export type VenueSummary = Omit<Venue, "verification">;

export type EventPlanReference = Pick<
  EventSummary,
  "id" | "artistIds" | "titleJa" | "date"
>;

export type SearchEventSummary = Pick<
  EventSummary,
  | "id"
  | "artistIds"
  | "titleJa"
  | "titleZh"
  | "tourName"
  | "date"
  | "eventStatus"
  | "status"
>;

export interface EventSummaryIndex {
  schemaVersion: 1;
  generatedFrom: "src/data/events.json";
  eventCount: number;
  events: EventSummary[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}

export interface SearchIndex {
  schemaVersion: 1;
  generatedFrom: "src/data/events.json";
  events: SearchEventSummary[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}

export type RegionId =
  | "hokkaido_tohoku"
  | "kanto"
  | "chubu"
  | "kinki"
  | "chugoku_shikoku"
  | "kyushu_okinawa";

export interface PrefectureInfo {
  /** romaji id,如 "tokyo" */
  id: string;
  /** JIS 都道府县代码 1-47 */
  code: number;
  nameJa: string;
  nameZh: string;
  /** [lng, lat] */
  centroid: [number, number];
  region: RegionId;
}
