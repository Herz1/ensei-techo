import type { Artist, EventItem, EventStatus, SalePhase, TicketOffer, Venue } from "@/lib/types";
import { deriveLegacyTicketOffers, normalizeTicketOfferSaleStatus } from "@/lib/ticket-offer";
import { deriveEventDisplayStatus } from "@/lib/ticket-trust-core.mjs";
import { todayJst } from "@/lib/time";
import artistsJson from "./artists.json";
import ingestedArtistsJson from "./artists-ingested.json";
import venuesJson from "./venues.json";
import ingestedVenuesJson from "./venues-ingested.json";
import eventsJson from "./events.json";

// events.json 只能由 scripts/publish-events.mjs 从已审核候选生成。
export const artists = [
  ...(artistsJson as unknown as Artist[]),
  ...(ingestedArtistsJson as unknown as Artist[]),
];
export const venues = [
  ...(venuesJson as unknown as Venue[]),
  ...(ingestedVenuesJson as unknown as Venue[]),
];

function phaseStatus(phase: SalePhase, today: string): SalePhase["status"] {
  if (phase.end < today) return "closed";
  if (phase.start <= today) return "open";
  return "upcoming";
}

function displayStatus(event: EventItem, offers: TicketOffer[], today: string): EventStatus {
  return deriveEventDisplayStatus(event, offers, today) as EventStatus;
}

// 官方页面的阶段会随日期推进；加载时重算状态，避免显示过期受付。
const today = todayJst();
export const events = (eventsJson as unknown as EventItem[]).map((event) => {
  const phases = event.phases.map((phase) => ({
    ...phase,
    status: phaseStatus(phase, today),
  }));
  const eventStatus = event.eventStatus ?? (event.date < today ? "completed" : "scheduled");
  const normalized = { ...event, eventStatus, phases };
  const ticketOffers = event.ticketOffers?.length
    ? event.ticketOffers
    : deriveLegacyTicketOffers(normalized);
  const currentTicketOffers = ticketOffers.map((offer) => normalizeTicketOfferSaleStatus(offer));
  return {
    ...normalized,
    phases,
    ticketOffers: currentTicketOffers,
    status: displayStatus(normalized, currentTicketOffers, today),
  };
});

export const artistById = new Map(artists.map((a) => [a.id, a]));
export const venueById = new Map(venues.map((v) => [v.id, v]));
export const eventById = new Map(events.map((e) => [e.id, e]));

export function artistsOf(e: EventItem): Artist[] {
  return e.artistIds
    .map((id) => artistById.get(id))
    .filter((a): a is Artist => Boolean(a));
}

export function venueOf(e: EventItem): Venue | undefined {
  return venueById.get(e.venueId);
}

export function eventsOfArtist(artistId: string): EventItem[] {
  return events.filter((e) => e.artistIds.includes(artistId));
}

export function eventsOfVenue(venueId: string): EventItem[] {
  return events.filter((e) => e.venueId === venueId);
}
