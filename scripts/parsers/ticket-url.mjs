const TICKET_HOSTS = [
  "eplus.jp",
  "ticket.pia.jp",
  "t.pia.jp",
  "l-tike.com",
  "ticket.tickebo.jp",
  "ticketbook.jp",
  "ticket.rakuten.co.jp",
  "ticketpay.jp",
  "livepocket.jp",
  "zaiko.io",
  "cnplayguide.com",
];

export function isSpecificTicketUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase("en");
    const provider = TICKET_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
    const path = url.pathname.replace(/\/+$/u, "");
    return provider &&
      path.length > 0 &&
      !/^\/(?:contact|help|guide|faq|login)(?:\/|$)/iu.test(path);
  } catch {
    return false;
  }
}
