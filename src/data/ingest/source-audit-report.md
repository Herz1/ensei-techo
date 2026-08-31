# 官方来源召回率审计

批次：2026-07-30T05-28-12-015Z

| 来源 | 官网条目 | 发现记录 | 详情访问率 | 详情抓取成功率 | 解析成功率 | 可审核 | 正式发布 | 漏抓 | parser_failed | page_fetch_failed | 实体阻塞 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ticketmaster Discovery API (Japan) | 0 | 0 | 0% | 0% | 0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 横浜アリーナ公式イベントカレンダー | 56 | 78 | 100% | 100% | 100% | 21 | 18 | 0 | 2 | 0 | 34 |
| Zepp Sapporo 公式スケジュール | 48 | 53 | 100% | 100% | 100% | 30 | 28 | 0 | 0 | 0 | 5 |
| Zepp Haneda(TOKYO) 公式スケジュール | 74 | 80 | 100% | 85.1% | 85.9% | 54 | 54 | 0 | 0 | 11 | 2 |
| Zepp DiverCity(TOKYO) 公式スケジュール | 68 | 80 | 100% | 88.2% | 88.9% | 47 | 45 | 0 | 0 | 8 | 8 |
| Zepp Shinjuku(TOKYO) 公式スケジュール | 71 | 74 | 100% | 85.9% | 86.7% | 45 | 45 | 0 | 0 | 10 | 2 |
| KT Zepp Yokohama 公式スケジュール | 84 | 99 | 100% | 88.1% | 88.6% | 61 | 59 | 0 | 0 | 10 | 5 |
| Zepp Nagoya 公式スケジュール | 52 | 59 | 100% | 100% | 100% | 32 | 29 | 0 | 0 | 0 | 3 |
| Zepp Namba(OSAKA) 公式スケジュール | 46 | 53 | 100% | 100% | 100% | 34 | 30 | 0 | 0 | 0 | 4 |
| Zepp Osaka Bayside 公式スケジュール | 62 | 67 | 100% | 88.7% | 89.4% | 46 | 45 | 0 | 0 | 7 | 5 |
| Zepp Fukuoka 公式スケジュール | 71 | 75 | 100% | 85.9% | 86.7% | 50 | 50 | 0 | 0 | 10 | 6 |
| 米津玄師 REISSUE RECORDS | 14 | 14 | 0% | 0% | 100% | 14 | 14 | 0 | 0 | 0 | 0 |
| 椎名林檎 SR猫柳本線 | 11 | 11 | 0% | 0% | 100% | 11 | 11 | 0 | 0 | 0 | 0 |

## 抽样

- Ticketmaster Discovery API (Japan)：检查 0/0 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":0,"requiredFields":0}。
- 横浜アリーナ公式イベントカレンダー：检查 20/56 条；漏抓原因 {"pageStructure":2,"pageFetch":0,"detailNotVisited":0,"entityMatching":34,"requiredFields":37}。
- Zepp Sapporo 公式スケジュール：检查 20/48 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":5,"requiredFields":7}。
- Zepp Haneda(TOKYO) 公式スケジュール：检查 20/74 条；漏抓原因 {"pageStructure":0,"pageFetch":11,"detailNotVisited":0,"entityMatching":2,"requiredFields":2}。
- Zepp DiverCity(TOKYO) 公式スケジュール：检查 20/68 条；漏抓原因 {"pageStructure":0,"pageFetch":8,"detailNotVisited":0,"entityMatching":8,"requiredFields":10}。
- Zepp Shinjuku(TOKYO) 公式スケジュール：检查 20/71 条；漏抓原因 {"pageStructure":0,"pageFetch":10,"detailNotVisited":0,"entityMatching":2,"requiredFields":2}。
- KT Zepp Yokohama 公式スケジュール：检查 20/84 条；漏抓原因 {"pageStructure":0,"pageFetch":10,"detailNotVisited":0,"entityMatching":5,"requiredFields":7}。
- Zepp Nagoya 公式スケジュール：检查 20/52 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":3,"requiredFields":6}。
- Zepp Namba(OSAKA) 公式スケジュール：检查 20/46 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":4,"requiredFields":8}。
- Zepp Osaka Bayside 公式スケジュール：检查 20/62 条；漏抓原因 {"pageStructure":0,"pageFetch":7,"detailNotVisited":0,"entityMatching":5,"requiredFields":6}。
- Zepp Fukuoka 公式スケジュール：检查 20/71 条；漏抓原因 {"pageStructure":0,"pageFetch":10,"detailNotVisited":0,"entityMatching":6,"requiredFields":6}。
- 米津玄師 REISSUE RECORDS：检查 14/14 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":0,"requiredFields":0}。
- 椎名林檎 SR猫柳本線：检查 11/11 条；漏抓原因 {"pageStructure":0,"pageFetch":0,"detailNotVisited":0,"entityMatching":0,"requiredFields":0}。
