import type {
  ReadinessKey,
  ReadinessStatus,
  TicketApplicationStatus,
  TripStatus,
  UserEventPlan,
} from "./store";

export const APPLICATION_STATUS_LABEL: Record<TicketApplicationStatus, string> = {
  preparing: "准备申请",
  applied: "已申请",
  won: "已中签",
  lost: "已落选",
  paid: "已付款",
  ticketed: "已出票",
  cancelled: "已取消",
};

export const READINESS_LABEL: Record<ReadinessKey, string> = {
  eligibility: "申请资格",
  account: "账号",
  phoneDevice: "手机与设备",
  ticketApp: "电子票 App",
  identityDocument: "本人确认证件",
  payment: "付款方式",
  companion: "同行者",
  distribution: "票券分配",
};

export const READINESS_STATUS_LABEL: Record<ReadinessStatus, string> = {
  unknown: "待确认",
  ready: "已准备",
  not_ready: "未准备",
  not_applicable: "不适用",
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  not_planned: "尚未准备行程",
  planning: "行程筹备中",
  ready: "待入场",
  attended: "已参加",
};

export interface PlanApplicationSummary {
  preparing: number;
  applied: number;
  awaitingResult: number;
  won: number;
  lost: number;
  paid: number;
  ticketed: number;
}

export function planApplicationSummary(plan: UserEventPlan): PlanApplicationSummary {
  const activeSubmitted = new Set<TicketApplicationStatus>(["applied", "won", "lost", "paid", "ticketed"]);
  const wonStatuses = new Set<TicketApplicationStatus>(["won", "paid", "ticketed"]);
  const paidStatuses = new Set<TicketApplicationStatus>(["paid", "ticketed"]);
  return {
    preparing: plan.applications.filter((item) => item.status === "preparing").length,
    applied: plan.applications.filter((item) => activeSubmitted.has(item.status)).length,
    awaitingResult: plan.applications.filter((item) => item.status === "applied").length,
    won: plan.applications.filter((item) => wonStatuses.has(item.status)).length,
    lost: plan.applications.filter((item) => item.status === "lost").length,
    paid: plan.applications.filter((item) => paidStatuses.has(item.status)).length,
    ticketed: plan.applications.filter((item) => item.status === "ticketed").length,
  };
}

export type PlanSectionId = "pending" | "applied" | "admission" | "attended";

export function planSection(plan: UserEventPlan): PlanSectionId {
  if (plan.tripStatus === "attended") return "attended";
  const summary = planApplicationSummary(plan);
  if (summary.won > 0) return "admission";
  if (summary.applied > 0 || summary.lost > 0) return "applied";
  return "pending";
}

export function planStatusLabel(plan: UserEventPlan): string {
  if (plan.tripStatus === "attended") return TRIP_STATUS_LABEL.attended;
  const summary = planApplicationSummary(plan);
  if (summary.ticketed > 0) return `已出票 ${summary.ticketed} 轮`;
  if (summary.paid > 0) return `已付款 ${summary.paid} 轮`;
  if (summary.won > 0) return `已中签 ${summary.won} 轮`;
  if (summary.awaitingResult > 0) return `等待结果 ${summary.awaitingResult} 轮`;
  if (summary.lost > 0) return `已落选 ${summary.lost} 轮`;
  if (summary.preparing > 0) return `准备中 ${summary.preparing} 轮`;
  return "已加入计划";
}

/** 只把仍有效的中签/付款/出票申请计入实际票款，落选记录不会进入预算。 */
export function planActualTicketTotal(plan: UserEventPlan): number | null {
  const values = plan.applications
    .filter((item) => ["won", "paid", "ticketed"].includes(item.status))
    .map((item) => item.actualPriceJpy)
    .filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}
