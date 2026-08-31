"use client";

import { useCallback, useSyncExternalStore } from "react";
import { deadlineInstant, isValidLocalDateTime } from "./deadline-core.mjs";

export type PlanIntent = "interested" | "committed";
export type LegacyTicketStatus =
  | "not_applied"
  | "applied"
  | "won"
  | "lost"
  | "paid"
  | "ticketed";
export type TicketApplicationStatus =
  | "preparing"
  | "applied"
  | "won"
  | "lost"
  | "paid"
  | "ticketed"
  | "cancelled";
export type ReadinessStatus = "unknown" | "ready" | "not_ready" | "not_applicable";
export type ReadinessKey =
  | "eligibility"
  | "account"
  | "phoneDevice"
  | "ticketApp"
  | "identityDocument"
  | "payment"
  | "companion"
  | "distribution";
export type ApplicationReadiness = Record<ReadinessKey, ReadinessStatus>;
export type TripStatus = "not_planned" | "planning" | "ready" | "attended";
export type DisplayCurrency = "CNY" | "JPY" | "USD";
export type DisplayTimeZone = "browser" | "Asia/Tokyo" | "Asia/Shanghai";
export type SetupStatus = "pending" | "completed" | "skipped";

export interface UserPreferences {
  version: 1;
  setupStatus: SetupStatus;
  homePrefecture?: string;
  origin?: string;
  currency: DisplayCurrency;
  timeZone: DisplayTimeZone;
  updatedAt: string;
}

export interface ManualDeadline {
  /** 用户本地时间，datetime-local 对应的 YYYY-MM-DDTHH:mm。 */
  at: string;
  label: string;
  /** 保存时的用户/浏览器时区；旧数据可能未记录。 */
  timeZone?: string;
  /** at 在保存时对应的绝对时刻，确保跨设备恢复和 ICS 语义不漂移。 */
  instantAt?: string;
}

export interface TicketApplication {
  id: string;
  eventId: string;
  offerId?: string;
  label: string;
  provider?: string;
  round?: string;
  status: TicketApplicationStatus;
  quantity?: number;
  accountAlias?: string;
  appliedAt?: string;
  actualPriceJpy?: number;
  seatNote?: string;
  companionNote?: string;
  privateNote?: string;
  readiness: ApplicationReadiness;
  createdAt: string;
  updatedAt: string;
}

export interface ManualTask {
  id: string;
  label: string;
  /** 保存后的绝对时刻；页面按 timeZone 还原用户填写的墙上时间。 */
  dueAt: string;
  timeZone: string;
  done: boolean;
  linkedApplicationId?: string;
  source: "manual";
  createdAt: string;
  updatedAt: string;
}

export interface UserEventPlan {
  eventId: string;
  intent: PlanIntent;
  tripStatus: TripStatus;
  eventNote?: string;
  applications: TicketApplication[];
  manualTasks: ManualTask[];
  createdAt: string;
  updatedAt: string;
}

interface StoredPlans {
  version: 2;
  plans: UserEventPlan[];
}

const listeners = new Set<() => void>();
const EVENT = "ensei-store-change";
const EMPTY_SET: string[] = [];
const EMPTY_PLANS: UserEventPlan[] = [];
export const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  setupStatus: "pending",
  currency: "CNY",
  timeZone: "browser",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export const WANTS_KEY = "ensei-wants";
export const FOLLOWS_KEY = "ensei-follows";
export const PLANS_KEY = "ensei-event-plans";
export const PREFERENCES_KEY = "ensei-user-preferences";
export const PLAN_SCHEMA_VERSION = 2;
export const PLAN_V1_BACKUP_KEY = "ensei-event-plans-v1-backup";
const PLAN_MIGRATION_KEY = "ensei-event-plans-migrated-v2";

const INTENTS = new Set<PlanIntent>(["interested", "committed"]);
const LEGACY_TICKET_STATUSES = new Set<LegacyTicketStatus>([
  "not_applied",
  "applied",
  "won",
  "lost",
  "paid",
  "ticketed",
]);
const APPLICATION_STATUSES = new Set<TicketApplicationStatus>([
  "preparing",
  "applied",
  "won",
  "lost",
  "paid",
  "ticketed",
  "cancelled",
]);
export const READINESS_KEYS: ReadinessKey[] = [
  "eligibility",
  "account",
  "phoneDevice",
  "ticketApp",
  "identityDocument",
  "payment",
  "companion",
  "distribution",
];
const READINESS_STATUSES = new Set<ReadinessStatus>([
  "unknown",
  "ready",
  "not_ready",
  "not_applicable",
]);
const TRIP_STATUSES = new Set<TripStatus>([
  "not_planned",
  "planning",
  "ready",
  "attended",
]);

function emit() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onStorage);
  };
}

function readSet(key: string): string[] {
  if (typeof window === "undefined") return EMPTY_SET;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
      : EMPTY_SET;
  } catch {
    return EMPTY_SET;
  }
}

const setCache = new Map<string, { raw: string | null; parsed: string[] }>();

function readSetCached(key: string): string[] {
  if (typeof window === "undefined") return EMPTY_SET;
  const raw = localStorage.getItem(key);
  const hit = setCache.get(key);
  if (hit?.raw === raw) return hit.parsed;
  const parsed = readSet(key);
  setCache.set(key, { raw, parsed });
  return parsed;
}

function cleanOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

const SENSITIVE_VALUE_PATTERNS = [
  /(?:密码|password|passcode|验证码|verification\s*code|one[- ]?time\s*password|otp|cvv)\s*[:：=]?\s*\S{4,}/iu,
  /(?:护照号|passport\s*(?:no|number)|身份证号|identity\s*(?:no|number)|银行卡号|card\s*(?:no|number))\s*[:：=]?\s*[A-Z0-9][A-Z0-9\s-]{5,}/iu,
  /(?:^|\D)(?:\+?\d[\s-]?){10,15}(?:\D|$)/u,
  /(?:^|\D)\d{17}[\dXx](?:\D|$)/u,
  /(?:^|\D)(?:\d[ -]?){13,19}(?:\D|$)/u,
];

/** 用户文本只保存普通备注和账号别名；明显的凭据或完整号码会被拒绝。 */
export function containsSensitivePersonalData(...values: unknown[]): boolean {
  return values.some((value) =>
    typeof value === "string" && SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value)),
  );
}

function cleanSafeText(value: unknown): string | undefined {
  const cleaned = cleanOptionalText(value);
  return cleaned && !containsSensitivePersonalData(cleaned) ? cleaned : undefined;
}

export function defaultApplicationReadiness(): ApplicationReadiness {
  return Object.fromEntries(READINESS_KEYS.map((key) => [key, "unknown"])) as ApplicationReadiness;
}

function normalizeReadiness(value: unknown): ApplicationReadiness {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<ApplicationReadiness>
    : {};
  return Object.fromEntries(READINESS_KEYS.map((key) => [
    key,
    READINESS_STATUSES.has(source[key] as ReadinessStatus)
      ? source[key] as ReadinessStatus
      : "unknown",
  ])) as ApplicationReadiness;
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validTimeZone(value: unknown): value is string {
  return typeof value === "string"
    && /^(?:UTC|browser|unknown|[A-Za-z_+-]+\/[A-Za-z0-9_+\/-]+)$/u.test(value);
}

export function newPlanRecordId(prefix: "application" | "task"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const CURRENCIES = new Set<DisplayCurrency>(["CNY", "JPY", "USD"]);
const TIME_ZONES = new Set<DisplayTimeZone>([
  "browser",
  "Asia/Tokyo",
  "Asia/Shanghai",
]);
const SETUP_STATUSES = new Set<SetupStatus>(["pending", "completed", "skipped"]);

export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PREFERENCES;
  }
  const item = value as Partial<UserPreferences>;
  return {
    version: 1,
    setupStatus: SETUP_STATUSES.has(item.setupStatus as SetupStatus)
      ? (item.setupStatus as SetupStatus)
      : "pending",
    ...(cleanOptionalText(item.homePrefecture)
      ? { homePrefecture: cleanOptionalText(item.homePrefecture) }
      : {}),
    ...(cleanOptionalText(item.origin)
      ? { origin: cleanOptionalText(item.origin) }
      : {}),
    currency: CURRENCIES.has(item.currency as DisplayCurrency)
      ? (item.currency as DisplayCurrency)
      : "CNY",
    timeZone: TIME_ZONES.has(item.timeZone as DisplayTimeZone)
      ? (item.timeZone as DisplayTimeZone)
      : "browser",
    updatedAt:
      typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
        ? item.updatedAt
        : DEFAULT_PREFERENCES.updatedAt,
  };
}

/** 备份导入使用的严格校验；枚举无效时不回退为默认值。 */
export function validateUserPreferences(value: unknown): UserPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<UserPreferences>;
  if (!SETUP_STATUSES.has(item.setupStatus as SetupStatus)) return null;
  if (!CURRENCIES.has(item.currency as DisplayCurrency)) return null;
  if (!TIME_ZONES.has(item.timeZone as DisplayTimeZone)) return null;
  if (typeof item.updatedAt !== "string" || Number.isNaN(Date.parse(item.updatedAt))) return null;
  if (item.homePrefecture !== undefined && !cleanOptionalText(item.homePrefecture)) return null;
  if (item.origin !== undefined && !cleanOptionalText(item.origin)) return null;
  return normalizeUserPreferences(item);
}

let preferencesCache: { raw: string | null; parsed: UserPreferences } | null = null;

function readPreferencesCached(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  const raw = localStorage.getItem(PREFERENCES_KEY);
  if (preferencesCache?.raw === raw) return preferencesCache.parsed;
  let parsed = DEFAULT_PREFERENCES;
  try {
    parsed = normalizeUserPreferences(raw ? JSON.parse(raw) : null);
  } catch {}
  preferencesCache = { raw, parsed };
  return parsed;
}

function writePreferences(preferences: UserPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    preferencesCache = null;
  } catch {}
  emit();
}

export function replacePreferences(value: UserPreferences) {
  const preferences = validateUserPreferences(value);
  if (preferences) writePreferences(preferences);
}

interface LegacyUserEventPlan {
  eventId?: unknown;
  intent?: unknown;
  ticketStatus?: unknown;
  tripStatus?: unknown;
  manualDeadline?: ManualDeadline;
  actualPriceJpy?: unknown;
  seatNote?: unknown;
  privateNote?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function normalizeTicketApplication(
  value: unknown,
  expectedEventId: string,
): TicketApplication | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<TicketApplication>;
  const id = cleanOptionalText(item.id);
  const label = cleanSafeText(item.label);
  if (!id || !label || item.eventId !== expectedEventId) return null;
  if (!APPLICATION_STATUSES.has(item.status as TicketApplicationStatus)) return null;
  if (!validIsoDate(item.createdAt) || !validIsoDate(item.updatedAt)) return null;
  if (item.appliedAt !== undefined && !validIsoDate(item.appliedAt)) return null;
  if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) return null;
  if (item.actualPriceJpy !== undefined && (!Number.isInteger(item.actualPriceJpy) || item.actualPriceJpy < 0)) return null;

  const offerId = cleanOptionalText(item.offerId);
  const provider = cleanSafeText(item.provider);
  const round = cleanSafeText(item.round);
  const accountAlias = cleanSafeText(item.accountAlias);
  const seatNote = cleanSafeText(item.seatNote);
  const companionNote = cleanSafeText(item.companionNote);
  const privateNote = cleanSafeText(item.privateNote);
  return {
    id,
    eventId: expectedEventId,
    ...(offerId ? { offerId } : {}),
    label,
    ...(provider ? { provider } : {}),
    ...(round ? { round } : {}),
    status: item.status as TicketApplicationStatus,
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    ...(accountAlias ? { accountAlias } : {}),
    ...(item.appliedAt ? { appliedAt: item.appliedAt } : {}),
    ...(item.actualPriceJpy !== undefined ? { actualPriceJpy: item.actualPriceJpy } : {}),
    ...(seatNote ? { seatNote } : {}),
    ...(companionNote ? { companionNote } : {}),
    ...(privateNote ? { privateNote } : {}),
    readiness: normalizeReadiness(item.readiness),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function normalizeManualTask(value: unknown): ManualTask | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<ManualTask>;
  const id = cleanOptionalText(item.id);
  const label = cleanSafeText(item.label);
  if (!id || !label || !validIsoDate(item.dueAt) || !validTimeZone(item.timeZone)) return null;
  if (typeof item.done !== "boolean" || item.source !== "manual") return null;
  if (!validIsoDate(item.createdAt) || !validIsoDate(item.updatedAt)) return null;
  const linkedApplicationId = cleanOptionalText(item.linkedApplicationId);
  return {
    id,
    label,
    dueAt: item.dueAt,
    timeZone: item.timeZone,
    done: item.done,
    ...(linkedApplicationId ? { linkedApplicationId } : {}),
    source: "manual",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** v1 单状态计划到 v2 多申请计划的确定性、幂等转换。 */
export function migrateLegacyUserEventPlan(value: unknown): UserEventPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as LegacyUserEventPlan;
  const eventId = cleanOptionalText(item.eventId);
  if (!eventId || !INTENTS.has(item.intent as PlanIntent)) return null;
  if (!LEGACY_TICKET_STATUSES.has(item.ticketStatus as LegacyTicketStatus)) return null;
  if (!TRIP_STATUSES.has(item.tripStatus as TripStatus)) return null;
  if (!validIsoDate(item.createdAt) || !validIsoDate(item.updatedAt)) return null;
  if (item.actualPriceJpy !== undefined && (!Number.isInteger(item.actualPriceJpy) || Number(item.actualPriceJpy) < 0)) return null;

  let legacyDeadline: ManualDeadline | undefined;
  if (item.manualDeadline !== undefined) {
    const deadline = item.manualDeadline;
    if (
      !deadline || !isValidLocalDateTime(deadline.at)
      || (deadline.timeZone !== undefined && !validTimeZone(deadline.timeZone))
      || (deadline.instantAt !== undefined && !validIsoDate(deadline.instantAt))
    ) return null;
    legacyDeadline = {
      at: deadline.at,
      label: cleanSafeText(deadline.label) ?? "个人截止事项",
      ...(deadline.timeZone ? { timeZone: deadline.timeZone } : {}),
      ...(deadline.instantAt ? { instantAt: deadline.instantAt } : {}),
    };
  }

  const legacyStatus = item.ticketStatus as LegacyTicketStatus;
  const actualPriceJpy = item.actualPriceJpy as number | undefined;
  const seatNote = cleanSafeText(item.seatNote);
  const privateNote = cleanSafeText(item.privateNote);
  const needsApplication = legacyStatus !== "not_applied"
    || actualPriceJpy !== undefined
    || Boolean(seatNote)
    || Boolean(privateNote);
  const applications: TicketApplication[] = needsApplication ? [{
    id: `application-v1-${eventId}`,
    eventId,
    label: "旧版迁移记录",
    status: legacyStatus === "not_applied" ? "preparing" : legacyStatus,
    ...(actualPriceJpy !== undefined ? { actualPriceJpy } : {}),
    ...(seatNote ? { seatNote } : {}),
    ...(privateNote ? { privateNote } : {}),
    readiness: defaultApplicationReadiness(),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }] : [];

  const manualTasks: ManualTask[] = [];
  if (legacyDeadline) {
    const due = deadlineInstant(legacyDeadline);
    if (!Number.isFinite(due.timestamp)) return null;
    manualTasks.push({
      id: `task-v1-${eventId}`,
      label: legacyDeadline.label,
      dueAt: new Date(due.timestamp).toISOString(),
      timeZone: legacyDeadline.timeZone ?? "unknown",
      done: false,
      source: "manual",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }

  return {
    eventId,
    intent: item.intent as PlanIntent,
    tripStatus: item.tripStatus as TripStatus,
    applications,
    manualTasks,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** 导入与本地读取共用；兼容 v1 单状态计划并统一返回 v2。 */
export function normalizeUserEventPlan(value: unknown): UserEventPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<UserEventPlan> & { ticketStatus?: unknown };
  if (!Array.isArray(item.applications) || !Array.isArray(item.manualTasks)) {
    return migrateLegacyUserEventPlan(value);
  }
  const eventId = cleanOptionalText(item.eventId);
  if (!eventId || !INTENTS.has(item.intent as PlanIntent)) return null;
  if (!TRIP_STATUSES.has(item.tripStatus as TripStatus)) return null;
  if (!validIsoDate(item.createdAt) || !validIsoDate(item.updatedAt)) return null;

  const applications: TicketApplication[] = [];
  const applicationIds = new Set<string>();
  for (const value of item.applications) {
    const application = normalizeTicketApplication(value, eventId);
    if (!application || applicationIds.has(application.id)) continue;
    applicationIds.add(application.id);
    applications.push(application);
  }
  if (item.applications.length > 0 && applications.length === 0) return null;
  const manualTasks: ManualTask[] = [];
  const taskIds = new Set<string>();
  for (const value of item.manualTasks) {
    const task = normalizeManualTask(value);
    if (!task || taskIds.has(task.id)) continue;
    taskIds.add(task.id);
    manualTasks.push(
      task.linkedApplicationId && !applicationIds.has(task.linkedApplicationId)
        ? { ...task, linkedApplicationId: undefined }
        : task,
    );
  }
  if (item.manualTasks.length > 0 && manualTasks.length === 0) return null;
  const eventNote = cleanSafeText(item.eventNote);
  return {
    eventId,
    intent: item.intent as PlanIntent,
    tripStatus: item.tripStatus as TripStatus,
    ...(eventNote ? { eventNote } : {}),
    applications,
    manualTasks,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function createUserEventPlan(
  eventId: string,
  now = new Date().toISOString(),
): UserEventPlan {
  return {
    eventId,
    intent: "interested",
    tripStatus: "not_planned",
    applications: [],
    manualTasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parsePlans(raw: string | null): UserEventPlan[] {
  if (!raw) return EMPTY_PLANS;
  try {
    const value: unknown = JSON.parse(raw);
    const list =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Partial<StoredPlans>).plans
        : undefined;
    if (!Array.isArray(list)) return EMPTY_PLANS;
    const byId = new Map<string, UserEventPlan>();
    for (const item of list) {
      const plan = normalizeUserEventPlan(item);
      if (plan) byId.set(plan.eventId, plan);
    }
    return [...byId.values()];
  } catch {
    return EMPTY_PLANS;
  }
}

let planCache: { raw: string | null; parsed: UserEventPlan[] } | null = null;

function writePlans(plans: UserEventPlan[], shouldEmit = true) {
  if (typeof window === "undefined") return;
  const envelope: StoredPlans = { version: PLAN_SCHEMA_VERSION, plans };
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(envelope));
    // 保留旧键供旧版本客户端与 v1 备份读取；它不再是当前状态的权威来源。
    localStorage.setItem(WANTS_KEY, JSON.stringify(plans.map((plan) => plan.eventId)));
    localStorage.setItem(PLAN_MIGRATION_KEY, "done");
    planCache = null;
  } catch {}
  if (shouldEmit) emit();
}

function migratePlansToV2Once() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(PLANS_KEY);
  let legacyEnvelope = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; plans?: unknown[] };
      legacyEnvelope = parsed?.version !== PLAN_SCHEMA_VERSION
        || Boolean(parsed?.plans?.some((plan) => plan && typeof plan === "object" && Object.hasOwn(plan, "ticketStatus")));
    } catch {
      legacyEnvelope = false;
    }
  }
  if (localStorage.getItem(PLAN_MIGRATION_KEY) === "done" && !legacyEnvelope) return;
  if (legacyEnvelope && raw && localStorage.getItem(PLAN_V1_BACKUP_KEY) === null) {
    try {
      localStorage.setItem(PLAN_V1_BACKUP_KEY, raw);
    } catch {}
  }
  const existing = parsePlans(raw);
  const byId = new Map(existing.map((plan) => [plan.eventId, plan]));
  const migratedAt = new Date().toISOString();
  for (const eventId of readSet(WANTS_KEY)) {
    if (!byId.has(eventId)) byId.set(eventId, createUserEventPlan(eventId, migratedAt));
  }
  writePlans([...byId.values()], false);
}

function readPlansCached(): UserEventPlan[] {
  if (typeof window === "undefined") return EMPTY_PLANS;
  migratePlansToV2Once();
  const raw = localStorage.getItem(PLANS_KEY);
  if (planCache?.raw === raw) return planCache.parsed;
  const parsed = parsePlans(raw);
  planCache = { raw, parsed };
  return parsed;
}

export function replacePlans(plans: UserEventPlan[]) {
  const byId = new Map<string, UserEventPlan>();
  for (const item of plans) {
    const plan = normalizeUserEventPlan(item);
    if (plan) byId.set(plan.eventId, plan);
  }
  writePlans([...byId.values()]);
}

export function clearPlanMigrationBackup() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PLAN_V1_BACKUP_KEY);
  } catch {}
}

export function useEventPlans() {
  const plans = useSyncExternalStore(subscribe, readPlansCached, () => EMPTY_PLANS);

  const upsertPlan = useCallback(
    (eventId: string, patch: Partial<Omit<UserEventPlan, "eventId" | "createdAt">> = {}) => {
      const current = readPlansCached();
      const existing = current.find((plan) => plan.eventId === eventId);
      const now = new Date().toISOString();
      const next = normalizeUserEventPlan({
        ...(existing ?? createUserEventPlan(eventId, now)),
        ...patch,
        eventId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      if (!next) return;
      writePlans([...current.filter((plan) => plan.eventId !== eventId), next]);
    },
    [],
  );

  const removePlan = useCallback((eventId: string) => {
    writePlans(readPlansCached().filter((plan) => plan.eventId !== eventId));
  }, []);

  const addApplication = useCallback((
    eventId: string,
    draft: Partial<TicketApplication> & Pick<TicketApplication, "label" | "status">,
  ): string | null => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId)
      ?? createUserEventPlan(eventId);
    const now = new Date().toISOString();
    const id = cleanOptionalText(draft.id) ?? newPlanRecordId("application");
    if (existing.applications.some((application) => application.id === id)) return null;
    const application = normalizeTicketApplication({
      ...draft,
      id,
      eventId,
      readiness: draft.readiness ?? defaultApplicationReadiness(),
      createdAt: now,
      updatedAt: now,
    }, eventId);
    if (!application) return null;
    const next = normalizeUserEventPlan({
      ...existing,
      intent: "committed",
      applications: [...existing.applications, application],
      updatedAt: now,
    });
    if (!next) return null;
    writePlans([...current.filter((plan) => plan.eventId !== eventId), next]);
    return application.id;
  }, []);

  const updateApplication = useCallback((
    eventId: string,
    applicationId: string,
    patch: Partial<Omit<TicketApplication, "id" | "eventId" | "createdAt">>,
  ) => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId);
    const application = existing?.applications.find((item) => item.id === applicationId);
    if (!existing || !application) return;
    const now = new Date().toISOString();
    const updated = normalizeTicketApplication({
      ...application,
      ...patch,
      id: application.id,
      eventId,
      createdAt: application.createdAt,
      updatedAt: now,
    }, eventId);
    if (!updated) return;
    const next = normalizeUserEventPlan({
      ...existing,
      applications: existing.applications.map((item) => item.id === applicationId ? updated : item),
      updatedAt: now,
    });
    if (!next) return;
    writePlans(current.map((plan) => plan.eventId === eventId ? next : plan));
  }, []);

  const removeApplication = useCallback((eventId: string, applicationId: string) => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId);
    if (!existing) return;
    const now = new Date().toISOString();
    const next = normalizeUserEventPlan({
      ...existing,
      applications: existing.applications.filter((item) => item.id !== applicationId),
      manualTasks: existing.manualTasks.map((task) =>
        task.linkedApplicationId === applicationId
          ? { ...task, linkedApplicationId: undefined, updatedAt: now }
          : task,
      ),
      updatedAt: now,
    });
    if (!next) return;
    writePlans(current.map((plan) => plan.eventId === eventId ? next : plan));
  }, []);

  const addManualTask = useCallback((
    eventId: string,
    draft: Pick<ManualTask, "label" | "dueAt" | "timeZone"> & Partial<Pick<ManualTask, "linkedApplicationId" | "done">>,
  ): string | null => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId)
      ?? createUserEventPlan(eventId);
    const now = new Date().toISOString();
    const id = newPlanRecordId("task");
    const task = normalizeManualTask({
      ...draft,
      id,
      done: draft.done ?? false,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    if (!task) return null;
    const next = normalizeUserEventPlan({
      ...existing,
      manualTasks: [...existing.manualTasks, task],
      updatedAt: now,
    });
    if (!next) return null;
    writePlans([...current.filter((plan) => plan.eventId !== eventId), next]);
    return id;
  }, []);

  const updateManualTask = useCallback((
    eventId: string,
    taskId: string,
    patch: Partial<Omit<ManualTask, "id" | "source" | "createdAt">>,
  ) => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId);
    const task = existing?.manualTasks.find((item) => item.id === taskId);
    if (!existing || !task) return;
    const now = new Date().toISOString();
    const updated = normalizeManualTask({
      ...task,
      ...patch,
      id: task.id,
      source: "manual",
      createdAt: task.createdAt,
      updatedAt: now,
    });
    if (!updated) return;
    const next = normalizeUserEventPlan({
      ...existing,
      manualTasks: existing.manualTasks.map((item) => item.id === taskId ? updated : item),
      updatedAt: now,
    });
    if (!next) return;
    writePlans(current.map((plan) => plan.eventId === eventId ? next : plan));
  }, []);

  const removeManualTask = useCallback((eventId: string, taskId: string) => {
    const current = readPlansCached();
    const existing = current.find((plan) => plan.eventId === eventId);
    if (!existing) return;
    const now = new Date().toISOString();
    const next = normalizeUserEventPlan({
      ...existing,
      manualTasks: existing.manualTasks.filter((item) => item.id !== taskId),
      updatedAt: now,
    });
    if (!next) return;
    writePlans(current.map((plan) => plan.eventId === eventId ? next : plan));
  }, []);

  const getPlan = useCallback(
    (eventId: string) => plans.find((plan) => plan.eventId === eventId),
    [plans],
  );

  return {
    plans,
    getPlan,
    upsertPlan,
    removePlan,
    addApplication,
    updateApplication,
    removeApplication,
    addManualTask,
    updateManualTask,
    removeManualTask,
  };
}

export function useStoredSet(key: string) {
  const items = useSyncExternalStore(
    subscribe,
    () => readSetCached(key),
    () => EMPTY_SET,
  );
  const toggle = useCallback((id: string) => {
    const current = readSet(key);
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setCache.delete(key);
    } catch {}
    emit();
  }, [key]);
  const has = useCallback((id: string) => items.includes(id), [items]);
  return { items, toggle, has };
}

/** 整体替换集合；WANTS_KEY 会转换为新计划以兼容旧备份。 */
export function replaceSet(key: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (key === WANTS_KEY) {
    const current = readPlansCached();
    const byId = new Map(current.map((plan) => [plan.eventId, plan]));
    replacePlans(unique.map((id) => byId.get(id) ?? createUserEventPlan(id)));
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(unique));
    setCache.delete(key);
  } catch {}
  emit();
}

/** 旧组件兼容层：计划存在即视为“想看”。 */
export function useWants() {
  const { plans, upsertPlan, removePlan } = useEventPlans();
  const items = plans.map((plan) => plan.eventId);
  const has = useCallback((id: string) => plans.some((plan) => plan.eventId === id), [plans]);
  const toggle = useCallback((id: string) => {
    if (plans.some((plan) => plan.eventId === id)) removePlan(id);
    else upsertPlan(id);
  }, [plans, removePlan, upsertPlan]);
  return { items, has, toggle };
}

export function useFollows() {
  return useStoredSet(FOLLOWS_KEY);
}

export function usePreferences() {
  const preferences = useSyncExternalStore(
    subscribe,
    readPreferencesCached,
    () => DEFAULT_PREFERENCES,
  );
  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    writePreferences(
      normalizeUserPreferences({
        ...readPreferencesCached(),
        ...patch,
        version: 1,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, []);
  return { preferences, updatePreferences };
}
