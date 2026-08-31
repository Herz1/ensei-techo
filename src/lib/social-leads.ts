"use client";

import { useCallback, useSyncExternalStore } from "react";
import { canonicalizeSocialUrl, socialPlatformFromUrl } from "./social-lead-core.mjs";

export type SocialPlatform = "xhs" | "x" | "instagram" | "other";
export type SocialLeadStatus = "inbox" | "matched" | "dismissed";

export interface SocialLead {
  id: string;
  platform: SocialPlatform;
  url?: string;
  canonicalUrl?: string;
  pastedText?: string;
  note?: string;
  capturedAt: string;
  status: SocialLeadStatus;
  matchedEventId?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSocialLeads {
  version: 1;
  leads: SocialLead[];
}

export const SOCIAL_LEADS_KEY = "ensei-social-leads";
export const SOCIAL_LEADS_SCHEMA_VERSION = 1;
const EVENT = "ensei-social-leads-change";
const EMPTY: SocialLead[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; parsed: SocialLead[] } | null = null;

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeSocialLead(value: unknown): SocialLead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<SocialLead>;
  const id = clean(item.id);
  const url = clean(item.url);
  const pastedText = clean(item.pastedText);
  const note = clean(item.note);
  if (!id || (!url && !pastedText)) return null;
  const canonicalUrl = url ? canonicalizeSocialUrl(url) : null;
  if (url && !canonicalUrl) return null;
  const status = ["inbox", "matched", "dismissed"].includes(String(item.status))
    ? item.status as SocialLeadStatus
    : "inbox";
  const matchedEventId = clean(item.matchedEventId);
  if (status === "matched" && !matchedEventId) return null;
  const createdAt = validDate(item.createdAt) ? item.createdAt : new Date().toISOString();
  const updatedAt = validDate(item.updatedAt) ? item.updatedAt : createdAt;
  return {
    id,
    platform: canonicalUrl ? socialPlatformFromUrl(canonicalUrl) as SocialPlatform : "other",
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(pastedText ? { pastedText } : {}),
    ...(note ? { note } : {}),
    capturedAt: validDate(item.capturedAt) ? item.capturedAt : createdAt,
    status,
    ...(matchedEventId ? { matchedEventId } : {}),
    ...(validDate(item.confirmedAt) ? { confirmedAt: item.confirmedAt } : {}),
    createdAt,
    updatedAt,
  };
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

function emit() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function parse(raw: string | null): SocialLead[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    const list = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<StoredSocialLeads>).leads
      : value;
    if (!Array.isArray(list)) return EMPTY;
    const byId = new Map<string, SocialLead>();
    for (const item of list) {
      const lead = normalizeSocialLead(item);
      if (lead) byId.set(lead.id, lead);
    }
    return [...byId.values()];
  } catch {
    return EMPTY;
  }
}

function readCached(): SocialLead[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(SOCIAL_LEADS_KEY);
  if (cache?.raw === raw) return cache.parsed;
  const parsed = parse(raw);
  cache = { raw, parsed };
  return parsed;
}

function write(leads: SocialLead[]) {
  if (typeof window === "undefined") return;
  const envelope: StoredSocialLeads = { version: SOCIAL_LEADS_SCHEMA_VERSION, leads };
  try {
    localStorage.setItem(SOCIAL_LEADS_KEY, JSON.stringify(envelope));
    cache = null;
  } catch {}
  emit();
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `lead-${crypto.randomUUID()}`
    : `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function replaceSocialLeads(values: SocialLead[]) {
  const normalized = values.map(normalizeSocialLead).filter((lead): lead is SocialLead => Boolean(lead));
  write(normalized);
}

export function useSocialLeads() {
  const leads = useSyncExternalStore(subscribe, readCached, () => EMPTY);
  const createLead = useCallback((draft: { url?: string; pastedText?: string; note?: string }): string | null => {
    const now = new Date().toISOString();
    const lead = normalizeSocialLead({ ...draft, id: newId(), capturedAt: now, status: "inbox", createdAt: now, updatedAt: now });
    if (!lead) return null;
    write([lead, ...readCached()]);
    return lead.id;
  }, []);
  const updateLead = useCallback((leadId: string, patch: Partial<Omit<SocialLead, "id" | "createdAt">>) => {
    const current = readCached();
    const existing = current.find((lead) => lead.id === leadId);
    if (!existing) return;
    const next = normalizeSocialLead({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    if (!next) return;
    write(current.map((lead) => lead.id === leadId ? next : lead));
  }, []);
  const confirmMatch = useCallback((leadId: string, eventId: string) => updateLead(leadId, { status: "matched", matchedEventId: eventId, confirmedAt: new Date().toISOString() }), [updateLead]);
  const returnToInbox = useCallback((leadId: string) => updateLead(leadId, { status: "inbox", matchedEventId: undefined, confirmedAt: undefined }), [updateLead]);
  const dismissLead = useCallback((leadId: string) => updateLead(leadId, { status: "dismissed", matchedEventId: undefined, confirmedAt: undefined }), [updateLead]);
  return { leads, createLead, updateLead, confirmMatch, returnToInbox, dismissLead };
}
