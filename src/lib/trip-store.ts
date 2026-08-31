"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type TripBudgetCategory =
  | "ticket"
  | "transport"
  | "hotel"
  | "food"
  | "merch"
  | "other";

export type TripCustomItemKind = "transport" | "stay" | "todo";
export type TravelLegType = "flight" | "train" | "bus" | "local_transit" | "walk" | "other";
export type TravelLegStatus = "estimated" | "confirmed";
export type TripChecklistSource = "default" | "event_requirement" | "platform_advice" | "manual";

export interface TripBudgetItem {
  id: string;
  category: TripBudgetCategory;
  label: string;
  amountJpy: number;
}

export interface TripChecklistItem {
  id: string;
  label: string;
  done: boolean;
  source?: TripChecklistSource;
  eventId?: string;
}

export interface TravelLeg {
  id: string;
  type: TravelLegType;
  from: string;
  to: string;
  departAt?: string;
  arriveAt?: string;
  durationMinutes?: number;
  status: TravelLegStatus;
  referenceUrl?: string;
  note?: string;
}

export interface TripCustomItem {
  id: string;
  date: string;
  time?: string;
  label: string;
  kind: TripCustomItemKind;
}

export interface TripPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  origin?: string;
  eventIds: string[];
  arrivalAt?: string;
  arrivalNote?: string;
  returnAt?: string;
  returnNote?: string;
  stayAt?: string;
  stayNote?: string;
  budgetItems: TripBudgetItem[];
  checklist: TripChecklistItem[];
  customItems: TripCustomItem[];
  travelLegs: TravelLeg[];
  eventEndOverrides: Record<string, string>;
  bufferMinutes: number;
  ignoredConflictKeys: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoredTrips {
  version: 2;
  trips: TripPlan[];
}

export const TRIPS_KEY = "ensei-trip-plans";
export const TRIP_SCHEMA_VERSION = 2;
export const TRIP_V1_BACKUP_KEY = "ensei-trip-plans-v1-backup";
export const TRIP_MIGRATION_MARKER_KEY = "ensei-trip-plans-migrated-v2";

const EVENT = "ensei-trip-store-change";
const listeners = new Set<() => void>();
const EMPTY_TRIPS: TripPlan[] = [];
const BUDGET_CATEGORIES = new Set<TripBudgetCategory>([
  "ticket",
  "transport",
  "hotel",
  "food",
  "merch",
  "other",
]);
const CUSTOM_KINDS = new Set<TripCustomItemKind>(["transport", "stay", "todo"]);
const TRAVEL_LEG_TYPES = new Set<TravelLegType>(["flight", "train", "bus", "local_transit", "walk", "other"]);
const TRAVEL_LEG_STATUSES = new Set<TravelLegStatus>(["estimated", "confirmed"]);
const CHECKLIST_SOURCES = new Set<TripChecklistSource>(["default", "event_requirement", "platform_advice", "manual"]);

export const BUDGET_LABELS: Record<TripBudgetCategory, string> = {
  ticket: "票款",
  transport: "交通",
  hotel: "酒店",
  food: "餐饮",
  merch: "周边",
  other: "其他",
};

export const TRAVEL_LEG_LABELS: Record<TravelLegType, string> = {
  flight: "航班",
  train: "列车",
  bus: "巴士",
  local_transit: "市内交通",
  walk: "步行",
  other: "其他",
};

export const DEFAULT_CHECKLIST_LABELS = [
  "护照或本人确认证件",
  "电子票 App",
  "手机网络和充电",
  "票券分配",
  "交通和住宿确认",
  "场馆寄物",
];

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function uniqueId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now().toString(36)}`;
}

function defaultBudget(initialTicketJpy = 0): TripBudgetItem[] {
  return (Object.keys(BUDGET_LABELS) as TripBudgetCategory[]).map((category) => ({
    id: `budget-${category}`,
    category,
    label: BUDGET_LABELS[category],
    amountJpy: category === "ticket" ? initialTicketJpy : 0,
  }));
}

function defaultChecklist(): TripChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label, index) => ({
    id: `check-${index + 1}`,
    label,
    done: false,
    source: "default",
  }));
}

export function createTripPlan({
  name,
  startDate,
  endDate = startDate,
  origin,
  eventId,
  initialTicketJpy = 0,
}: {
  name: string;
  startDate: string;
  endDate?: string;
  origin?: string;
  eventId?: string;
  initialTicketJpy?: number;
}): TripPlan {
  const now = new Date().toISOString();
  return {
    id: uniqueId("trip"),
    name: name.trim() || "未命名远征",
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    ...(origin?.trim() ? { origin: origin.trim() } : {}),
    eventIds: eventId ? [eventId] : [],
    budgetItems: defaultBudget(initialTicketJpy),
    checklist: defaultChecklist(),
    customItems: [],
    travelLegs: [],
    eventEndOverrides: {},
    bufferMinutes: 90,
    ignoredConflictKeys: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTripPlan(value: unknown): TripPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<TripPlan>;
  if (!cleanText(item.id) || !cleanText(item.name)) return null;
  if (!validDate(item.startDate) || !validDate(item.endDate)) return null;
  if (!Array.isArray(item.eventIds)) return null;
  if (typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt))) return null;
  if (typeof item.updatedAt !== "string" || Number.isNaN(Date.parse(item.updatedAt))) return null;

  const budgetItems = Array.isArray(item.budgetItems)
    ? item.budgetItems.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const budget = entry as Partial<TripBudgetItem>;
        if (
          !cleanText(budget.id) ||
          !BUDGET_CATEGORIES.has(budget.category as TripBudgetCategory) ||
          !cleanText(budget.label) ||
          !Number.isInteger(budget.amountJpy) ||
          budget.amountJpy! < 0
        ) return [];
        return [{
          id: budget.id!,
          category: budget.category as TripBudgetCategory,
          label: budget.label!.trim(),
          amountJpy: budget.amountJpy!,
        }];
      })
    : [];
  const checklist = Array.isArray(item.checklist)
    ? item.checklist.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const check = entry as Partial<TripChecklistItem>;
        if (!cleanText(check.id) || !cleanText(check.label) || typeof check.done !== "boolean") return [];
        const source = CHECKLIST_SOURCES.has(check.source as TripChecklistSource)
          ? check.source as TripChecklistSource
          : undefined;
        return [{
          id: check.id!,
          label: check.label!.trim(),
          done: check.done,
          ...(source ? { source } : {}),
          ...(cleanText(check.eventId) ? { eventId: cleanText(check.eventId) } : {}),
        }];
      })
    : [];
  const customItems = Array.isArray(item.customItems)
    ? item.customItems.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const custom = entry as Partial<TripCustomItem>;
        if (
          !cleanText(custom.id) ||
          !validDate(custom.date) ||
          !cleanText(custom.label) ||
          !CUSTOM_KINDS.has(custom.kind as TripCustomItemKind) ||
          (custom.time !== undefined && !validTime(custom.time))
        ) return [];
        return [{
          id: custom.id!,
          date: custom.date!,
          ...(custom.time ? { time: custom.time } : {}),
          label: custom.label!.trim(),
          kind: custom.kind as TripCustomItemKind,
        }];
      })
    : [];
  const travelLegs = Array.isArray(item.travelLegs)
    ? item.travelLegs.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const leg = entry as Partial<TravelLeg> & { depart?: unknown; arrive?: unknown; duration?: unknown; reference?: unknown };
        const departAt = leg.departAt ?? leg.depart;
        const arriveAt = leg.arriveAt ?? leg.arrive;
        const rawDuration = leg.durationMinutes ?? leg.duration;
        const referenceUrl = cleanText(leg.referenceUrl ?? leg.reference);
        const durationMinutes = Number.isInteger(rawDuration) && Number(rawDuration) >= 0 && Number(rawDuration) <= 10_080
          ? Number(rawDuration)
          : undefined;
        if (
          !cleanText(leg.id) ||
          !TRAVEL_LEG_TYPES.has(leg.type as TravelLegType) ||
          !cleanText(leg.from) ||
          !cleanText(leg.to) ||
          !TRAVEL_LEG_STATUSES.has(leg.status as TravelLegStatus) ||
          (departAt !== undefined && !validDateTime(departAt)) ||
          (arriveAt !== undefined && !validDateTime(arriveAt)) ||
          (referenceUrl !== undefined && !/^https?:\/\//iu.test(referenceUrl))
        ) return [];
        return [{
          id: leg.id!.trim(),
          type: leg.type as TravelLegType,
          from: leg.from!.trim(),
          to: leg.to!.trim(),
          ...(departAt ? { departAt } : {}),
          ...(arriveAt ? { arriveAt } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
          status: leg.status as TravelLegStatus,
          ...(referenceUrl ? { referenceUrl } : {}),
          ...(cleanText(leg.note) ? { note: cleanText(leg.note) } : {}),
        }];
      })
    : [];
  const overrides: Record<string, string> = {};
  if (item.eventEndOverrides && typeof item.eventEndOverrides === "object") {
    for (const [eventId, time] of Object.entries(item.eventEndOverrides)) {
      if (eventId && validTime(time)) overrides[eventId] = time;
    }
  }
  const bufferMinutes = Number.isInteger(item.bufferMinutes)
    ? Math.min(720, Math.max(0, item.bufferMinutes!))
    : 90;

  return {
    id: item.id!.trim(),
    name: item.name!.trim(),
    startDate: item.startDate,
    endDate: item.endDate < item.startDate ? item.startDate : item.endDate,
    ...(cleanText(item.origin) ? { origin: cleanText(item.origin) } : {}),
    eventIds: [...new Set(item.eventIds.filter((eventId): eventId is string => typeof eventId === "string" && Boolean(eventId)))],
    ...(validDateTime(item.arrivalAt) ? { arrivalAt: item.arrivalAt } : {}),
    ...(cleanText(item.arrivalNote) ? { arrivalNote: cleanText(item.arrivalNote) } : {}),
    ...(validDateTime(item.returnAt) ? { returnAt: item.returnAt } : {}),
    ...(cleanText(item.returnNote) ? { returnNote: cleanText(item.returnNote) } : {}),
    ...(validDateTime(item.stayAt) ? { stayAt: item.stayAt } : {}),
    ...(cleanText(item.stayNote) ? { stayNote: cleanText(item.stayNote) } : {}),
    budgetItems: budgetItems.length ? budgetItems : defaultBudget(),
    checklist: Array.isArray(item.checklist) ? checklist : defaultChecklist(),
    customItems,
    travelLegs,
    eventEndOverrides: overrides,
    bufferMinutes,
    ignoredConflictKeys: Array.isArray(item.ignoredConflictKeys)
      ? [...new Set(item.ignoredConflictKeys.filter((key): key is string => typeof key === "string"))]
      : [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

let tripCache: { raw: string | null; parsed: TripPlan[] } | null = null;

function parseTrips(raw: string | null): TripPlan[] {
  if (!raw) return EMPTY_TRIPS;
  try {
    const value: unknown = JSON.parse(raw);
    const entries = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<StoredTrips>).trips
      : null;
    if (!Array.isArray(entries)) return EMPTY_TRIPS;
    const byId = new Map<string, TripPlan>();
    for (const entry of entries) {
      const trip = normalizeTripPlan(entry);
      if (trip) byId.set(trip.id, trip);
    }
    return [...byId.values()];
  } catch {
    return EMPTY_TRIPS;
  }
}

function readTripsCached(): TripPlan[] {
  if (typeof window === "undefined") return EMPTY_TRIPS;
  const raw = localStorage.getItem(TRIPS_KEY);
  if (tripCache?.raw === raw) return tripCache.parsed;
  const parsed = parseTrips(raw);
  tripCache = { raw, parsed };
  return parsed;
}

function migrateTripStoreOnce() {
  if (typeof window === "undefined" || localStorage.getItem(TRIP_MIGRATION_MARKER_KEY)) return;
  const raw = localStorage.getItem(TRIPS_KEY);
  if (!raw) {
    localStorage.setItem(TRIP_MIGRATION_MARKER_KEY, "empty");
    return;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || (value as { version?: unknown }).version !== 1) {
      localStorage.setItem(TRIP_MIGRATION_MARKER_KEY, "not-v1");
      return;
    }
    const trips = parseTrips(raw);
    localStorage.setItem(TRIP_V1_BACKUP_KEY, raw);
    localStorage.setItem(TRIPS_KEY, JSON.stringify({ version: TRIP_SCHEMA_VERSION, trips } satisfies StoredTrips));
    localStorage.setItem(TRIP_MIGRATION_MARKER_KEY, new Date().toISOString());
    tripCache = null;
    emit();
  } catch {
    // 损坏的旧数据保持原样，避免迁移时覆盖用户内容。
  }
}

export function clearTripMigrationBackup() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TRIP_V1_BACKUP_KEY);
  localStorage.removeItem(TRIP_MIGRATION_MARKER_KEY);
}

function emit() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onChange = () => callback();
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function writeTrips(trips: TripPlan[]) {
  if (typeof window === "undefined") return;
  const envelope: StoredTrips = { version: TRIP_SCHEMA_VERSION, trips };
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(envelope));
    tripCache = null;
  } catch {}
  emit();
}

export function replaceTrips(trips: TripPlan[]) {
  const normalized = trips
    .map(normalizeTripPlan)
    .filter((trip): trip is TripPlan => Boolean(trip));
  writeTrips(normalized);
}

export function useTripPlans() {
  const trips = useSyncExternalStore(subscribe, readTripsCached, () => EMPTY_TRIPS);
  useEffect(() => migrateTripStoreOnce(), []);

  const createTrip = useCallback((trip: TripPlan) => {
    const normalized = normalizeTripPlan(trip);
    if (!normalized) return null;
    writeTrips([...readTripsCached(), normalized]);
    return normalized.id;
  }, []);

  const updateTrip = useCallback((tripId: string, patch: Partial<TripPlan>) => {
    const current = readTripsCached();
    const existing = current.find((trip) => trip.id === tripId);
    if (!existing) return;
    const normalized = normalizeTripPlan({
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!normalized) return;
    writeTrips(current.map((trip) => trip.id === tripId ? normalized : trip));
  }, []);

  const deleteTrip = useCallback((tripId: string) => {
    writeTrips(readTripsCached().filter((trip) => trip.id !== tripId));
  }, []);

  const addEvent = useCallback((tripId: string, eventId: string, eventDate: string) => {
    const current = readTripsCached();
    const existing = current.find((trip) => trip.id === tripId);
    if (!existing) return;
    const eventIds = existing.eventIds.includes(eventId)
      ? existing.eventIds
      : [...existing.eventIds, eventId];
    const normalized = normalizeTripPlan({
      ...existing,
      eventIds,
      startDate: eventDate < existing.startDate ? eventDate : existing.startDate,
      endDate: eventDate > existing.endDate ? eventDate : existing.endDate,
      updatedAt: new Date().toISOString(),
    });
    if (!normalized) return;
    writeTrips(current.map((trip) => trip.id === tripId ? normalized : trip));
  }, []);

  const removeEvent = useCallback((tripId: string, eventId: string) => {
    const current = readTripsCached();
    const existing = current.find((trip) => trip.id === tripId);
    if (!existing) return;
    const { [eventId]: _removed, ...eventEndOverrides } = existing.eventEndOverrides;
    void _removed;
    const normalized = normalizeTripPlan({
      ...existing,
      eventIds: existing.eventIds.filter((id) => id !== eventId),
      eventEndOverrides,
      updatedAt: new Date().toISOString(),
    });
    if (!normalized) return;
    writeTrips(current.map((trip) => trip.id === tripId ? normalized : trip));
  }, []);

  return { trips, createTrip, updateTrip, deleteTrip, addEvent, removeEvent };
}

export function newTripItemId(prefix: "custom" | "check" | "budget" | "travel") {
  return uniqueId(prefix);
}
