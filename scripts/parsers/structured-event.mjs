import * as cheerio from "cheerio";

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function eventNodes(value) {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return [item, ...asArray(item["@graph"])];
  }).filter((item) => {
    const types = asArray(item?.["@type"]);
    return types.includes("Event") || types.includes("MusicEvent");
  });
}

export function parseEventJsonLd(html) {
  const $ = cheerio.load(html);
  const events = [];
  const errors = [];
  $('script[type="application/ld+json"]').each((index, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      for (const item of eventNodes(payload)) {
        const start = typeof item.startDate === "string"
          ? item.startDate
          : undefined;
        const offers = asArray(item.offers);
        events.push({
          title: item.name,
          startDate: start?.slice(0, 10),
          startTime: start?.match(/T(\d{2}:\d{2})/u)?.[1],
          venueName: item.location?.name,
          artistNames: asArray(item.performer)
            .map((performer) =>
              typeof performer === "string" ? performer : performer?.name,
            )
            .filter(Boolean),
          prices: offers
            .map((offer) => Number(offer?.price))
            .filter((price) => Number.isFinite(price)),
          purchaseUrls: offers
            .map((offer) => offer?.url)
            .filter((url) => typeof url === "string"),
        });
      }
    } catch (error) {
      errors.push({
        scriptIndex: index,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { events, errors };
}

function walk(value, visit, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, seen));
  } else {
    Object.values(value).forEach((item) => walk(item, visit, seen));
  }
}

export function parseEmbeddedEventJson(html) {
  const $ = cheerio.load(html);
  const events = [];
  const errors = [];
  const scripts = $(
    'script#__NEXT_DATA__, script#__NUXT_DATA__, script[type="application/json"]',
  ).toArray();
  scripts.forEach((element, scriptIndex) => {
    const text = $(element).text().trim();
    if (!text) return;
    try {
      const payload = JSON.parse(text);
      walk(payload, (item) => {
        const title = item.title ?? item.name;
        const date = item.eventDate ?? item.startDate ?? item.date;
        const venue = item.venueName ?? item.venue?.name ?? item.location?.name;
        if (
          typeof title === "string" &&
          typeof date === "string" &&
          (typeof venue === "string" || item.artist || item.performer)
        ) {
          events.push({
            title,
            startDate: date.slice(0, 10),
            startTime: date.match(/T(\d{2}:\d{2})/u)?.[1] ??
              item.startTime,
            venueName: venue,
            artistNames: asArray(item.artist ?? item.performer)
              .map((artist) =>
                typeof artist === "string" ? artist : artist?.name,
              )
              .filter(Boolean),
            prices: asArray(item.prices ?? item.price)
              .map(Number)
              .filter(Number.isFinite),
            purchaseUrls: asArray(
              item.purchaseUrls ?? item.ticketUrl ?? item.url,
            ).filter((url) => typeof url === "string"),
          });
        }
      });
    } catch (error) {
      errors.push({
        scriptIndex,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return {
    events: events.filter(
      (event, index, values) =>
        values.findIndex(
          (candidate) =>
            `${candidate.title}|${candidate.startDate}|${candidate.venueName}` ===
            `${event.title}|${event.startDate}|${event.venueName}`,
        ) === index,
    ),
    errors,
  };
}
