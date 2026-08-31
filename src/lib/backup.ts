import { prefectureById } from "@/data/prefectures";
import {
  createUserEventPlan,
  normalizeUserEventPlan,
  type UserEventPlan,
  type UserPreferences,
  validateUserPreferences,
} from "./store";
import { normalizeTripPlan, type TripPlan } from "./trip-store";
import { normalizeSocialLead, type SocialLead } from "./social-leads";

export const BACKUP_VERSION = 5;

export interface EnseiBackupV5 {
  app: "ensei-techo";
  version: 5;
  exportedAt: string;
  preferences: UserPreferences;
  plans: UserEventPlan[];
  follows: string[];
  trips: TripPlan[];
  socialLeads: SocialLead[];
  /** 旧版客户端只认识 wants；它不是 v5 的权威计划状态。 */
  wants: string[];
}

export interface ImportSection<T> {
  provided: boolean;
  apply: boolean;
  values: T[];
  restored: number;
  ignored: number;
  reason?: string;
}

export interface PreparedBackupImport {
  preferences: {
    provided: boolean;
    apply: boolean;
    value: UserPreferences | null;
    restored: number;
    ignored: number;
    reason?: string;
  };
  plans: ImportSection<UserEventPlan>;
  follows: ImportSection<string>;
  trips: ImportSection<TripPlan>;
  socialLeads: ImportSection<SocialLead>;
  restored: number;
  ignored: number;
  appliedSectionCount: number;
  warnings: string[];
}

export interface BackupCatalog {
  eventIds: ReadonlySet<string>;
  artistIds: ReadonlySet<string>;
}

export function buildBackupPayload({
  preferences,
  plans,
  follows,
  trips,
  socialLeads,
}: {
  preferences: UserPreferences;
  plans: UserEventPlan[];
  follows: string[];
  trips: TripPlan[];
  socialLeads: SocialLead[];
}): EnseiBackupV5 {
  return {
    app: "ensei-techo",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    preferences,
    plans,
    follows,
    trips,
    socialLeads,
    wants: plans.map((plan) => plan.eventId),
  };
}

function parseSocialLeads(raw: unknown, eventIds: ReadonlySet<string>): ImportSection<SocialLead> {
  if (!Array.isArray(raw)) return invalidArraySection("socialLeads 必须是数组");
  const byId = new Map<string, SocialLead>();
  let ignored = 0;
  for (const value of raw) {
    const lead = normalizeSocialLead(value);
    if (!lead || (lead.status === "matched" && (!lead.matchedEventId || !eventIds.has(lead.matchedEventId)))) {
      ignored += 1;
      continue;
    }
    if (byId.has(lead.id)) ignored += 1;
    byId.set(lead.id, lead);
  }
  return finalizeArraySection([...byId.values()], raw.length, ignored);
}

function missingSection<T>(): ImportSection<T> {
  return { provided: false, apply: false, values: [], restored: 0, ignored: 0 };
}

function invalidArraySection<T>(reason: string): ImportSection<T> {
  return { provided: true, apply: false, values: [], restored: 0, ignored: 1, reason };
}

function finalizeArraySection<T>(values: T[], rawLength: number, ignored: number): ImportSection<T> {
  const apply = rawLength === 0 || values.length > 0;
  return {
    provided: true,
    apply,
    values,
    restored: values.length,
    ignored,
    ...(apply ? {} : { reason: "非空数据段没有任何有效记录，已保留当前本机数据" }),
  };
}

function parsePlans(raw: unknown, source: "plans" | "wants", eventIds: ReadonlySet<string>): ImportSection<UserEventPlan> {
  if (!Array.isArray(raw)) return invalidArraySection(`${source} 必须是数组`);
  const byId = new Map<string, UserEventPlan>();
  let ignored = 0;
  for (const value of raw) {
    const plan = source === "plans"
      ? normalizeUserEventPlan(value)
      : typeof value === "string" && eventIds.has(value)
        ? createUserEventPlan(value)
        : null;
    if (!plan || !eventIds.has(plan.eventId)) {
      ignored += 1;
      continue;
    }
    if (source === "plans" && value && typeof value === "object" && !Array.isArray(value)) {
      const rawPlan = value as { applications?: unknown; manualTasks?: unknown };
      if (Array.isArray(rawPlan.applications)) {
        ignored += Math.max(0, rawPlan.applications.length - plan.applications.length);
      }
      if (Array.isArray(rawPlan.manualTasks)) {
        ignored += Math.max(0, rawPlan.manualTasks.length - plan.manualTasks.length);
      }
    }
    if (byId.has(plan.eventId)) ignored += 1;
    byId.set(plan.eventId, plan);
  }
  return finalizeArraySection([...byId.values()], raw.length, ignored);
}

function parseFollows(raw: unknown, artistIds: ReadonlySet<string>): ImportSection<string> {
  if (!Array.isArray(raw)) return invalidArraySection("follows 必须是数组");
  const values: string[] = [];
  const seen = new Set<string>();
  let ignored = 0;
  for (const value of raw) {
    if (typeof value !== "string" || !artistIds.has(value) || seen.has(value)) {
      ignored += 1;
      continue;
    }
    seen.add(value);
    values.push(value);
  }
  return finalizeArraySection(values, raw.length, ignored);
}

function parseTrips(raw: unknown, knownEventIds: ReadonlySet<string>): ImportSection<TripPlan> {
  if (!Array.isArray(raw)) return invalidArraySection("trips 必须是数组");
  const byId = new Map<string, TripPlan>();
  let ignored = 0;
  for (const value of raw) {
    const trip = normalizeTripPlan(value);
    if (!trip) {
      ignored += 1;
      continue;
    }
    const eventIds = trip.eventIds.filter((eventId) => {
      const valid = knownEventIds.has(eventId);
      if (!valid) ignored += 1;
      return valid;
    });
    const eventEndOverrides = Object.fromEntries(
      Object.entries(trip.eventEndOverrides).filter(([eventId]) => {
        const valid = knownEventIds.has(eventId);
        if (!valid) ignored += 1;
        return valid;
      }),
    );
    if (byId.has(trip.id)) ignored += 1;
    byId.set(trip.id, { ...trip, eventIds, eventEndOverrides });
  }
  return finalizeArraySection([...byId.values()], raw.length, ignored);
}

export function prepareBackupImport(value: unknown, catalog: BackupCatalog): PreparedBackupImport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("文件格式不对：请选择本站导出的 JSON 备份");
  }
  const obj = value as Record<string, unknown>;
  if (obj.app !== undefined && obj.app !== "ensei-techo") {
    throw new Error("文件不是远征手账备份");
  }
  const known = ["preferences", "plans", "wants", "follows", "trips", "socialLeads"]
    .some((key) => Object.hasOwn(obj, key));
  if (!known) throw new Error("文件格式不对：找不到可恢复的个人数据段");

  const preferencesProvided = Object.hasOwn(obj, "preferences");
  let preferencesValue = preferencesProvided ? validateUserPreferences(obj.preferences) : null;
  if (preferencesValue?.homePrefecture && !prefectureById.has(preferencesValue.homePrefecture)) {
    preferencesValue = null;
  }
  const preferences = {
    provided: preferencesProvided,
    apply: Boolean(preferencesValue),
    value: preferencesValue,
    restored: preferencesValue ? 1 : 0,
    ignored: preferencesProvided && !preferencesValue ? 1 : 0,
    ...(preferencesProvided && !preferencesValue
      ? { reason: "preferences 枚举或地区无效，已保留当前本机偏好" }
      : {}),
  };

  const plans = Object.hasOwn(obj, "plans")
    ? parsePlans(obj.plans, "plans", catalog.eventIds)
    : Object.hasOwn(obj, "wants")
      ? parsePlans(obj.wants, "wants", catalog.eventIds)
      : missingSection<UserEventPlan>();
  const follows = Object.hasOwn(obj, "follows") ? parseFollows(obj.follows, catalog.artistIds) : missingSection<string>();
  const trips = Object.hasOwn(obj, "trips") ? parseTrips(obj.trips, catalog.eventIds) : missingSection<TripPlan>();
  const socialLeads = Object.hasOwn(obj, "socialLeads") ? parseSocialLeads(obj.socialLeads, catalog.eventIds) : missingSection<SocialLead>();
  const sections = [preferences, plans, follows, trips, socialLeads];
  const warnings = sections
    .filter((section) => section.provided && !section.apply && section.reason)
    .map((section) => section.reason!);
  return {
    preferences,
    plans,
    follows,
    trips,
    socialLeads,
    restored: sections.reduce((sum, section) => sum + section.restored, 0),
    ignored: sections.reduce((sum, section) => sum + section.ignored, 0),
    appliedSectionCount: sections.filter((section) => section.apply).length,
    warnings,
  };
}
