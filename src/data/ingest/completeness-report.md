# 演出数据完整度报告

生成时间：2026-07-30T05:28:51.647Z

## 汇总

| 指标 | 数值 |
| --- | ---: |
| 正式演出 | 428 |
| Discovered | 519 |
| Reviewable | 445 |
| Published | 428 |
| 官方来源 | 12 |
| Source adapters | 13 |
| Parsers | 8 |
| 票价覆盖 | 401/428 (93.7%) |
| 席种覆盖 | 387/428 (90.4%) |
| 售票阶段覆盖 | 25/428 (5.8%) |
| 官方链接覆盖 | 428/428 (100%) |
| 具体购票链接覆盖 | 58/428 (13.6%) |
| 额外费用覆盖 | 321/428 (75%) |
| 待审核字段 | 1711 |
| 可执行字段审核 | 0 |
| 必填字段阻塞候选 | 17 |
| 未检查字段 | 126 |
| 当前页未发现字段 | 1367 |
| 解析失败字段 | 0 |
| 页面抓取失败字段 | 228 |
| 访问受限字段 | 0 |
| 来源冲突字段 | 0 |
| 官网变化字段 | 458 |
| 模糊匹配待审 | 0 |

## 来源贡献

| 来源 | 类型 | 正式记录贡献 |
| --- | --- | ---: |
| KT Zepp Yokohama 公式スケジュール | venue_official | 59 |
| Zepp Haneda(TOKYO) 公式スケジュール | venue_official | 54 |
| Zepp Fukuoka 公式スケジュール | venue_official | 50 |
| Zepp Shinjuku(TOKYO) 公式スケジュール | venue_official | 45 |
| Zepp Osaka Bayside 公式スケジュール | venue_official | 45 |
| Zepp DiverCity(TOKYO) 公式スケジュール | venue_official | 45 |
| Zepp Namba(OSAKA) 公式スケジュール | venue_official | 30 |
| Zepp Nagoya 公式スケジュール | venue_official | 29 |
| Zepp Sapporo 公式スケジュール | venue_official | 28 |
| 横浜アリーナ公式イベントカレンダー | venue_official | 18 |
| 米津玄師 REISSUE RECORDS | artist_official | 14 |
| 椎名林檎 SR猫柳本線 | artist_official | 11 |

## 字段缺失状态

```json
{
  "title": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "artist": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "venue": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "eventDate": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "openTime": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "startTime": {
    "not_checked": 0,
    "not_found_on_page": 0,
    "published": 428,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "ticketTypes": {
    "not_checked": 0,
    "not_found_on_page": 27,
    "published": 390,
    "not_announced": 0,
    "source_does_not_disclose": 11,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "prices": {
    "not_checked": 0,
    "not_found_on_page": 27,
    "published": 401,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 0,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "additionalFees": {
    "not_checked": 0,
    "not_found_on_page": 33,
    "published": 321,
    "not_announced": 0,
    "source_does_not_disclose": 25,
    "parser_failed": 0,
    "page_fetch_failed": 49,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "ticketPhases": {
    "not_checked": 0,
    "not_found_on_page": 354,
    "published": 25,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 49,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "eligibility": {
    "not_checked": 0,
    "not_found_on_page": 220,
    "published": 145,
    "not_announced": 0,
    "source_does_not_disclose": 14,
    "parser_failed": 0,
    "page_fetch_failed": 49,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  },
  "purchaseUrls": {
    "not_checked": 0,
    "not_found_on_page": 321,
    "published": 58,
    "not_announced": 0,
    "source_does_not_disclose": 0,
    "parser_failed": 0,
    "page_fetch_failed": 49,
    "blocked": 0,
    "pending_review": 0,
    "conflicting_sources": 0
  }
}
```

## 队列

- 待审核：1711
- 可执行字段审核：0
- 必填字段阻塞候选：17
- 未检查：126
- 当前页未发现：1367
- parser_failed：0
- page_fetch_failed：228
- blocked：0
- conflicting_sources：0
- 官网内容变化：458
- 模糊匹配待审：0
