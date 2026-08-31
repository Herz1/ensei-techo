# TicketOffer 覆盖率报告

生成时间：2026-08-27T06:59:42.284Z
统计日期（JST）：2026-08-27
Event ID 保持不变：是

| 指标 | 修改前 | 当前 | 变化 |
| --- | ---: | ---: | ---: |
| candidates | 519 | 519 | +0 |
| approvedCandidates | 428 | 428 | +0 |
| publishedEvents | 428 | 428 | +0 |
| publishedFutureEvents | 255 | 255 | +0 |
| eventsWithOffers | 0 | 52 | +52 |
| futureEventsWithOffers | 0 | 44 | +44 |
| offers | 0 | 89 | +89 |
| concreteOfferUrls | 0 | 21 | +21 |
| eventsWithConcreteOfferUrl | 0 | 19 | +19 |
| eventsWithAtLeastTwoSourceFamilies | 0 | 17 | +17 |
| offersWithOpenStatus | 0 | 10 | +10 |
| offersWithEndAt | 0 | 60 | +60 |
| offersWithResultAt | 0 | 1 | +1 |
| offersWithPaymentDeadline | 0 | 0 | +0 |
| offersWithKnownInventory | 0 | 5 | +5 |
| eventsWithLegacyTicketReferences | 58 | 58 | +0 |
| uniqueLegacyTicketUrls | 41 | 41 | +0 |

## URL 分类

- TicketOffer：{"generic_provider":16,"event_detail":21,"search":5,"unknown":47}
- 旧购票引用：{"event_detail":14,"generic_provider":15,"refund":1,"unknown":6,"search":4,"support":1}

## Frontier

- 状态：{"invalid":23,"deferred":4,"done":16,"unmatched":82,"pending":112,"blocked":13}
- 新鲜度：{"aging_30d":71,"fresh_7d":18}

## 异常样例

```json
{
  "blocked": [
    {
      "url": "https://twitter.com/sunnyday_tokyo",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://www.instagram.com/_mikado_ss",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://www.instagram.com/claquepot_official",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://www.instagram.com/danceholictko",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://www.zepp.co.jp/cdn-cgi/l/email-protection",
      "httpStatus": null,
      "reason": "不是可访问的 HTTP(S) 官方页面"
    },
    {
      "url": "https://x.com/azu_ifn?lang=ja",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://x.com/boakwon",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://x.com/claquepot",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://x.com/megater_0",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    },
    {
      "url": "https://x.com/passpo_crew",
      "httpStatus": null,
      "reason": "社交平台页面不进入自动二轮抓取"
    }
  ],
  "failedOrDeferred": [],
  "invalid": [
    {
      "url": "http://eplus.jp/contact-form",
      "httpStatus": 403,
      "reason": "URL 类型为 support，不是有效购票页"
    },
    {
      "url": "http://eplus.jp/page/eplus/refund1/index.html",
      "httpStatus": 200,
      "reason": "URL 类型为 refund，不是有效购票页"
    },
    {
      "url": "https://eplus.jp/sf/detail/0719780001-P0030515?P1=0402&P59=1&P6=001",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://eplus.jp/sf/detail/0719780001-P0030516?P1=0402&P59=1&P6=001",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://eplus.jp/sf/detail/3192170001-P0030035?P1=0402&P59=1&P6=001",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://eplus.jp/sophia",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://l-tike.com/artist/000000000848007",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://ticket.tickebo.jp/show/event.html?info=15259",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "https://ticket.tickebo.jp/sn/kym-shukabd-ky-ticket01",
      "httpStatus": 404,
      "reason": "HTTP 404 Not Found"
    },
    {
      "url": "http://ritta-japan.com/contact",
      "httpStatus": null,
      "reason": "URL 类型为 support，不是有效购票页"
    }
  ],
  "nonConcreteLegacyUrls": [
    {
      "url": "https://eplus.jp/sophia/",
      "classification": "generic_provider"
    },
    {
      "url": "https://l-tike.com/sophia/",
      "classification": "generic_provider"
    },
    {
      "url": "http://eplus.jp/page/eplus/refund1/index.html",
      "classification": "refund"
    },
    {
      "url": "https://t.pia.jp/pia/artist/artists.do?artistsCd=J9040009",
      "classification": "generic_provider"
    },
    {
      "url": "https://ticket.tickebo.jp/show/event.html?info=15259",
      "classification": "unknown"
    },
    {
      "url": "https://eplus.jp/nanase30th-tour/",
      "classification": "generic_provider"
    },
    {
      "url": "https://l-tike.com/nanase30th-tour/",
      "classification": "generic_provider"
    },
    {
      "url": "https://ticket.tickebo.jp/sn/kym-shukabd-ky-ticket01",
      "classification": "unknown"
    },
    {
      "url": "https://l-tike.com/artist/000000000848007/",
      "classification": "generic_provider"
    },
    {
      "url": "https://t.pia.jp/pia/artist/artists.do?artistsCd=I5220085",
      "classification": "generic_provider"
    }
  ],
  "staleOffers": []
}
```
