const TRACKING_KEYS = new Set(["fbclid", "gclid", "igshid", "si", "ref", "source"]);
const CREDENTIAL_KEYS = new Set(["access_token", "auth_token", "session", "sessionid", "password"]);

export function socialPlatformFromUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./u, "");
    if (host === "xhslink.com" || host.endsWith("xiaohongshu.com")) return "xhs";
    if (host === "x.com" || host.endsWith("twitter.com")) return "x";
    if (host === "instagram.com" || host.endsWith("instagram.com")) return "instagram";
    return "other";
  } catch {
    return "other";
  }
}

export function canonicalizeSocialUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_KEYS.has(key.toLowerCase()) || CREDENTIAL_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

function key(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s・･\-_/()（）「」『』【】：:,.。!！?？~～]/gu, "");
}

function dateSignals(text) {
  const values = new Set();
  for (const match of text.matchAll(/(20\d{2})[\/\.年-](\d{1,2})[\/\.月-](\d{1,2})日?/gu)) {
    values.add(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  }
  for (const match of text.matchAll(/(?:^|\D)(\d{1,2})[\/\.月](\d{1,2})日?/gu)) {
    values.add(`${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
  }
  return values;
}

export function matchSocialLead(lead, eventContexts, limit = 5) {
  const source = [lead?.pastedText, lead?.note, lead?.canonicalUrl, lead?.url].filter(Boolean).join(" ");
  const sourceKey = key(source);
  const dates = dateSignals(source);
  if (!sourceKey) return [];
  return (eventContexts ?? [])
    .map((event) => {
      let score = 0;
      const reasons = [];
      const artist = (event.artistNames ?? []).find((name) => {
        const candidate = key(name);
        return candidate.length >= 2 && sourceKey.includes(candidate);
      });
      if (artist) { score += 6; reasons.push(`艺人：${artist}`); }
      const title = key(event.titleJa);
      const titleZh = key(event.titleZh);
      if ((title.length >= 4 && sourceKey.includes(title)) || (titleZh.length >= 4 && sourceKey.includes(titleZh))) {
        score += 7;
        reasons.push("演出标题一致");
      }
      if (dates.has(event.date)) { score += 6; reasons.push(`日期：${event.date}`); }
      else if (dates.has(event.date.slice(5))) { score += 3; reasons.push(`月日：${event.date.slice(5)}`); }
      const venue = (event.venueNames ?? []).find((name) => {
        const candidate = key(name);
        return candidate.length >= 3 && sourceKey.includes(candidate);
      });
      if (venue) { score += 4; reasons.push(`场馆：${venue}`); }
      return { eventId: event.id, score, reasons };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.eventId.localeCompare(right.eventId))
    .slice(0, Math.max(0, Math.min(5, limit)));
}
