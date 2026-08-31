import * as cheerio from "cheerio";
import { parseEventJsonLd } from "./structured-event.mjs";
import { parseTicketText } from "./ticket-text.mjs";
import { isSpecificTicketUrl } from "./ticket-url.mjs";

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eligibilityFrom(text) {
  const rules = [];
  const patterns = [
    {
      pattern: /未就学児(?:童)?入場不可/u,
      label: "未就学児童入場不可",
      appliesTo: "入場条件",
    },
    {
      pattern: /小学生以上有料/u,
      label: "小学生以上有料",
      appliesTo: "入場条件",
    },
    {
      pattern: /3歳以上有料/u,
      label: "3歳以上有料",
      appliesTo: "入場条件",
    },
    {
      pattern: /FC最速先行[^。]{0,40}(?:当選|会員)/u,
      label: "FC最速先行の当選・入金者",
      appliesTo: "アップグレード受付",
    },
    {
      pattern: /小学生以上(?:は)?チケット(?:が)?必要/u,
      label: "小学生以上はチケット必要",
      appliesTo: "入場条件",
    },
    {
      pattern: /未就学児(?:童)?(?:のお子様)?は大人1名につき1名まで膝上(?:に限り)?無料/u,
      label: "未就学児は大人1名につき1名まで膝上無料",
      appliesTo: "入場条件",
    },
    {
      pattern: /中学生以下のお子様が必ず1名以上[^。]{0,80}満18歳以上の大人が必ず1名以上同席/u,
      label: "中学生以下1名以上と18歳以上の大人1名以上の同席が必要",
      appliesTo: "ファミリー席",
    },
  ];
  for (const rule of patterns) {
    if (rule.pattern.test(text)) {
      rules.push({
        label: rule.label,
        appliesTo: rule.appliesTo,
      });
    }
  }
  return rules;
}

export function parseZeppDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const structured = parseEventJsonLd(html);
  const detail = $(".sch-single-table").first();
  const title =
    clean($(".sch-single-headelin-ttl").first().text()) ||
    clean($(".sch-single-headeline02").first().text());
  if (!detail.length || !title) {
    return {
      ok: false,
      reason: "Zepp 详情页缺少 .sch-single-table 或标题节点，页面结构可能已变化",
      additionalFees: [],
      eligibility: [],
      purchaseUrls: [],
      structured,
    };
  }

  const text = clean(detail.text());
  const priceText = clean(detail.find(".sch-single-table-price").text());
  const ticketInfo = parseTicketText(priceText);
  const detailInfo = parseTicketText(text);
  const purchaseUrls = [];
  detail.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = new URL(href, sourceUrl).href;
    if (isSpecificTicketUrl(absolute)) purchaseUrls.push(absolute);
  });
  const discoveredLinks = [];
  detail.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = new URL(href, sourceUrl).href;
    const containerText = clean($(element).closest("dl").find("dt").first().text());
    const role = isSpecificTicketUrl(absolute)
      ? "ticket_detail"
      : /公式サイト/u.test(containerText)
        ? "artist_official"
        : /問い合わせ/u.test(containerText)
          ? "promoter_official"
          : null;
    if (role) discoveredLinks.push({ role, url: absolute });
  });

  return {
    ok: true,
    title,
    additionalFees: detailInfo.additionalFees,
    ticketTypes: ticketInfo.ticketTypes,
    prices: ticketInfo.prices,
    eligibility: eligibilityFrom(text),
    purchaseUrls: [...new Set(purchaseUrls)],
    discoveredLinks: discoveredLinks.filter(
      (link, index, links) =>
        links.findIndex(
          (candidate) =>
            candidate.role === link.role && candidate.url === link.url,
        ) === index,
    ),
    openTimes: detail.find(".sch-single-table-time__open").toArray()
      .map((element) => clean($(element).text()))
      .filter(Boolean),
    startTimes: detail.find(".sch-single-table-time__start").toArray()
      .map((element) => clean($(element).text()))
      .filter(Boolean),
    structured,
  };
}
