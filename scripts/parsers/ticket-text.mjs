function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amount(value) {
  const number = Number(String(value).replaceAll(",", ""));
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

export function parseTicketText(value) {
  const text = clean(value);
  const taxIncluded = /税込|tax\s*included/iu.test(text)
    ? true
    : /税別|税抜|tax\s*excluded/iu.test(text)
      ? false
      : null;
  const ticketTypes = [];

  const bracketPattern = /\[([^\]\n]+)\]\s*[¥￥]\s*([\d,]+)/gu;
  for (const match of text.matchAll(bracketPattern)) {
    const priceJpy = amount(match[2]);
    const name = clean(match[1]);
    if (!name || priceJpy === undefined) continue;
    ticketTypes.push({
      name,
      priceJpy,
      taxIncluded,
      notes: [],
    });
  }

  const pattern =
    /(?:^|[\]\s])([^¥￥\n]+?)\s*[/／:：]\s*[¥￥]\s*([\d,]+)/gu;
  for (const match of text.matchAll(pattern)) {
    const name = clean(match[1])
      .replace(/^.*(?:\[PRICE\]|PRICE)\s*/iu, "")
      .replace(/^(?:PRICE|料金|チケット)\s*/iu, "")
      .replace(/^[\[\]\s]+|[\[\]\s]+$/gu, "")
      .trim();
    const priceJpy = amount(match[2]);
    if (!name || priceJpy === undefined) continue;
    if (ticketTypes.some(
      (item) => item.name === name && item.priceJpy === priceJpy,
    )) {
      continue;
    }
    ticketTypes.push({
      name,
      priceJpy,
      taxIncluded,
      notes: [],
    });
  }

  if (ticketTypes.length === 0) {
    const single = text.match(/[¥￥]\s*([\d,]+)/u);
    const priceJpy = single ? amount(single[1]) : undefined;
    if (priceJpy !== undefined) {
      ticketTypes.push({
        name: null,
        priceJpy,
        taxIncluded,
        notes: [],
      });
    }
  }

  const additionalFees = [];
  const drinkContext =
    text.match(
      /(?:別途\s*)?(?:ドリンク|drink)(?:代|料金|fee)?[^¥￥\d]{0,12}[¥￥]?\s*([\d,]+)/iu,
    );
  if (drinkContext) {
    additionalFees.push({
      type: "drink",
      label: "ドリンク代",
      amountJpy: amount(drinkContext[1]),
      required: true,
    });
  } else if (
    /(?:別途\s*)?(?:ドリンク|drink)(?:代|料金|fee)?[^。、]{0,12}(?:必要|別)/iu.test(text)
  ) {
    additionalFees.push({
      type: "drink",
      label: "ドリンク代",
      amountJpy: null,
      required: true,
    });
  }

  return {
    ticketTypes,
    prices: [...new Set(
      ticketTypes.map((item) => item.priceJpy).filter(Number.isInteger),
    )].sort((a, b) => a - b),
    additionalFees,
    taxIncluded,
  };
}
