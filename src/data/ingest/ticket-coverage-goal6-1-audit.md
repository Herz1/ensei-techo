# Goal 6.1：Goal 5 → Goal 6 数据变化复核

复核时间：2026-08-27（JST）  
复核范围：现有 `TicketOffer`、link frontier、已保存的 frontier 原始 HTML；本轮没有发起新的网络抓取。

## 口径和限制

- Goal 6 初始值来自 `ticket-coverage-goal6-before.json`（2026-08-27 05:32:33Z）。
- Goal 5 的逐条 JSON 没有单独落盘，但本地会话保留了该批次完整的 28 条观察摘要（退款页在最终发布前剔除为 27 条）、16:19 的 100 条发布结果，以及当时的发布逻辑。使用当前未改变的 `ticketLinks/phases` 基础输入重放后得到 100 个稳定的 `eventId|offer.id` key；因此以下是可复核的逐 key diff，不是凭汇总数反推。
- 当前值来自 `ticket-coverage-current.json`（2026-08-27 06:59:42Z），事件发布后重新生成；Event ID 仍为 428 个且未变化。
- “具体详情页”只计 `classifyTicketUrl(url) === event_detail`；艺人页、搜索页、帮助/退款页即使来自官方域名，也不计为具体购票页。

## 一张指标表

| 指标 | Goal 5 供给基线 | Goal 6 初始快照 | Goal 6.1 当前 | 结论 |
| --- | ---: | ---: | ---: | --- |
| TicketOffer | 100 | 88 | 89 | 严格校验后净少 11；本轮恢复/保留有效证据，较 Goal 6 初始净增 1 |
| 有 Offer 的 Event | 56 | 52 | 52 | 没有事件丢失 |
| 有 Offer 的未来 Event | 44 | 44 | 44 | 没有未来场次丢失 |
| 具体购票详情 URL | 41 | 18 | 21 | 旧宽松引用净减；当前恢复 3 个净增，均有保存页面证据 |
| 有具体详情 URL 的 Event | 未提供 | 17 | 19 | 较 Goal 6 初始增加 2 个事件 |
| 至少两类来源的 Event | 23 | 10 | 17 | 由宽松统计改为“场馆/事件 + 已确认购票来源” |
| frontier `done` | 24 | 8 | 16 | 8 个误判修复回 `done`，8 个仍因证据不足保持未匹配 |
| Event ID | 428 | 428 | 428 | 稳定 |

当前附加检查：`duplicateOfferKeys=0`、`duplicateFrontierUrls=0`、`closed + sold_out=0`、无无证据的付款期限/中签期限推断。

## 逐 Offer 键级回放

旧发布（Goal 5）100 个 key，当前 89 个 key：`oldOnly=11`、`currentOnly=0`、同 key 字段发生变化 23 个。当前没有出现新增但旧版不存在的 key，故 100→89 是纯删除/降级，不是 Event ID 漂移。

### 11 个从发布结果移除的 key

| Offer key（简写） | 旧来源 | 复核原因 |
| --- | --- | --- |
| e+ `071978…P0030515`、`071978…P0030516` | legacy | 保存 meta 为 HTTP 404；分别对应两个 DIAURA/Royz 场次，不能保留为可购票详情 |
| e+ `319217…P0030035` | legacy | 保存 meta 为 HTTP 404；不发布 |
| e+ `/sophia`、Lawson artist `000000000848007` | legacy | 保存 meta 为 HTTP 404；不发布 |
| Tickebo `info=15259`、`kym-shukabd-ky-ticket01`（两个 Event key） | legacy | 保存 meta 为 HTTP 404（后者重定向到 `info=16083` 后仍 404）；不发布 |
| e+ `0046360001` → `evt_1ff1…` | observed | 页面 HTTP 200，但内容是相川七濑 2026-09-12 高知/新来岛高知重工ホール；提示 Event 是 2026-08-11 Zepp Sapporo，日期和场馆均不匹配 |
| Lawson `mid=319198` → `evt_1ff1…` | observed | 页面 HTTP 200，内容同为相川七濑高知场；与 Zepp Sapporo 场次不匹配 |
| Lawson `mid=644132` → `evt_49d1…` | observed | 页面 HTTP 200，内容是 SOPHIA 2026-10-15 NHK Hall；提示 Event 是 2026-08-01 Zepp Sapporo，不匹配 |

以上 11 个 key 中，8 个是 404 的兼容旧链接，3 个是“页面有效但指向另一场演出”的旧观察；没有有效且匹配当前 Event 的 Offer 被删除。

### 同 key 的 23 个字段变化

以下分组覆盖全部 23 个同 key 变化；URL 仅查询参数顺序变化时按 canonical URL 比较：

| key 分组 | 实际变化 | 处理理由 |
| --- | --- | --- |
| e+ `3565380001`、`4332440001`（日/夜）、`1743710001`、`3841110001-P0030020P021001`、`332510…`、`0176540001`（难波/羽田） | `playguide_lottery/unknown` → 页面当前解析的 `general_sale/open`；部分库存/结束时间随页面更新 | 以保存的最新详情页字段为准；昼夜两 Event 仍共享同一详情 URL |
| Lawson `mid=430471`、`mid=486312` | `fan_club_lottery`、旧库存/时间字段 → `general_sale`、库存与时间 `unknown`；canonical URL 保留 `/mevent` | 详情分类修复后保留为详情，但不把旧页面字段继续当作当前事实 |
| LivePocket `9t1kz`、`one_more_step` | `unknown + sold_out` → 时间归一后的 `closed + unknown` | 已过结束时间；结束不等于售罄 |
| LivePocket `livehouseoneman`、`bb_rs` | `unknown` → `open`；前者受付类型由 playguide 改为 general | 依据当前保存页的受付时间窗口 |
| Pia `eventCd=2609756`、`eventBundleCd=b2669967` | `fan_club_lottery` → `playguide_lottery` | 当前页面类型解析更准确；b2669967 仍不填未公布的开演时间 |
| Pia `eventBundleCd=b2668974` → `evt_39a0…`、`evt_71c3…` | 观察值降为 `derivedFromLegacy=true`，时间/受付类型清空 | 同页多日期、多场馆且缺开演时间，无法唯一拆分日/夜场 |
| Pia artist `I5220085`、`J9040009` | 观察值降为兼容 legacy，受付/库存回到 `unknown` | 艺人页没有可对应日期/场馆，不作为场次详情 |
| Lawson artist `000000000155305` | 泛入口仍保留，受付/库存由旧 `open/sold_out` 归一为 `unknown` | listing 可证明关联演出，但不能证明该泛入口的库存 |
| e+ `4469370001`、Lawson `mid=774369` | 观察详情降为兼容 legacy，具体字段清空 | 页面对应 Mateus 2026-12-16 EX THEATER，不是提示的 2026-08-11 Zepp Shinjuku |

这些降级均发生在“页面不再唯一对应当前 Event”或“泛入口不能证明库存”的情况下；匹配当前 Event 的真实详情页没有被错误降为泛入口。

## 变化原因

### 1. TicketOffer 100 → 88 → 89

Goal 6 的 88 条是严格发布快照：新抓取结果不会把泛入口、搜索入口、帮助/退款页、404 页面，或无法把日期/场馆和当前 Event 唯一对应的页面当作已验证事实。发布器仍会保留部分 `derivedFromLegacy=true` 的旧链接作为兼容入口，并将其阶段、库存和时间置为未知；这不是对当前售票状态的断言，也没有从正式事件表删除 Event。

Goal 6.1 当前为 89 条（18 条保存证据观察 + 71 条兼容性的 legacy offer），净增来自保存证据的重放：

- 恢复 5 个 LivePocket 详情页；JSON-LD 的 `00:00` 只是日期占位，正文给出了真实开演时间。
- 恢复 Pia `eventCd=2609756` 和 `eventBundleCd=b2669967`；前者日期/场馆/时间明确，后者日期/场馆唯一但页面未公布开演时间，因此只保留已知字段。
- 保留 Lawson 艺人页 `000000000155305` 作为官方 listing（`generic_provider`，不冒充具体详情页），因为正文明确列出 SLENDERIE 2026-08-28 Zepp Sapporo；库存和阶段字段仍按未知处理。
- Lawson `/concert/mevent/` 规范化去掉末尾斜杠后，`mid=430471`、`mid=486312` 仍被识别为 `event_detail`，没有再误降级。

### 2. 具体详情 URL 41 → 18 → 21

41 是历史 `ticketLinks/phases` 的去重数量，不等于 41 个可直接购票详情页。当前 41 个旧引用的分类为：`event_detail=14`、`generic_provider=15`、`search=4`、`unknown=6`、`support=1`、`refund=1`。当前 TicketOffer 分类为 `event_detail=21`、`generic_provider=16`、`search=5`、`unknown=47`。

复核确认：没有已确认的 `event_detail` 因分类器修复而被降为泛入口；净增的 3 个详情 URL 来自已保存 HTML 的重新匹配。当前仍有 4 个 legacy `event_detail` 记录（e+ 446937、Lawson 774369、Pia b2668974 挂到两个候选 Event），它们保留原链接但 `derivedFromLegacy=true` 且字段未知，不能当作已确认场次。404/403、退款和帮助页仍明确排除，详见样本表。

### 3. 至少两类来源 23 → 10 → 17

Goal 5 的 23 使用了宽松的来源链计数；Goal 6 只把真正的购票事件证据加入 `ticket` family，并保留场馆来源。旧 23 个带 `ticket` family 的 Event 与当前 17 个逐一对照后，减少的 6 个是：

| Event | 旧票务证据 | 当前处理 |
| --- | --- | --- |
| `evt_1ff1…`、`evt_49d1…` | 相川七濑高知页、SOPHIA NHK Hall 页 | 页面有效但与提示场次不匹配，移除 `ticket` family |
| `evt_39a…`、`evt_71c…` | Pia `b2668974` 多日期详情 | 缺开演时间且存在日/夜场候选，保留 `unmatched`，不自动确认 |
| `evt_7ef…`、`evt_eec…` | Pia 艺人页 | 无可对应日期/场馆；仅保留兼容入口，不计 `ticket` family |

因此没有真实且匹配当前 Event 的第二官方来源被删除；减少项全部是错误匹配、歧义或泛入口。

当前 17 个已确认事件：

| Event ID | 事件 | 购票证据 |
| --- | --- | --- |
| `evt_4731670d99556a60a5bfa466` | 電脳ヒメカ | LivePocket 详情 |
| `evt_3d89ce9288dc16a46363b3b0` | Mateus Asato Tour 2026 | Pia 详情 |
| `evt_cd5946fd30fdf6d177834b69` | One More Step | LivePocket 详情 |
| `evt_19e7d78f9c8bb72b1722fce6` | ふぁぼフェス♡ | Pia 详情（日期/场馆唯一） |
| `evt_76baa565bca71e5195662c3f` / `evt_dcea3120d379ceb36a92fb73` | Element Sicks 日场/夜场 | 同一 e+ 详情页，时间拆分后分别确认 |
| `evt_581952c85ac9645b0225b1eb` | SLENDERIE RECORD | e+ 详情 + Lawson listing |
| `evt_a071a4ea90eb83779637adc8` | リアフェスin全Zepp | 旧版 LivePocket 详情 |
| `evt_4b12eed7c9b49dcd7fb04e6b` | 音羽-otoha- | e+ 详情 |
| `evt_59b6d33d870afdde5987e7a2` | Sweet Alley | LivePocket 详情 |
| `evt_89c7d2f37bf96af3e8c45a4b` | ロックスター症候群 | e+ 详情 |
| `evt_e912cb05373a12af9141c910` | 森本爵 | LivePocket 详情 |
| `evt_365ac0ebe5b517e6be3c8e38` | LOVEBITES | Lawson 详情 |
| `evt_ce34048aa2e19fc9f0402b90` | CORNELIUS | Lawson 详情 |
| `evt_6f7deafeba380b1bf290ffbb` | kanekoayano | e+ 详情 |
| `evt_13b68ce333e2e7c111a90adb` / `evt_ab4f64953d0d48b4439f900c` | toe 难波/羽田 | 同一 e+ 详情页，场次拆分后分别确认 |

### 4. `done` 24 → 8 → 16：逐项解释

Goal 6 初始的 16 个 `done`→`unmatched` 候选中，以下 8 个已由保存页面证据恢复为 `done`：

| URL | 恢复结论 |
| --- | --- |
| `https://livepocket.jp/e/9t1kz` | 正文 2026-08-04、Zepp Shinjuku、17:45；修复 JSON-LD 午夜占位误判 |
| `https://livepocket.jp/e/bb_rs` | 正文 2026-09-04、Zepp Shinjuku、18:00；修复午夜占位误判 |
| `https://livepocket.jp/e/livehouseoneman` | 正文 2026-09-02、Zepp DiverCity、18:00；修复午夜占位误判 |
| `https://livepocket.jp/e/one_more_step` | 正文 2026-08-12、Zepp Shinjuku、16:00；修复午夜占位误判 |
| `https://t.livepocket.jp/e/7y68r` | 旧版正文 2026-08-30、Zepp Osaka Bayside、14:00 |
| `https://t.pia.jp/pia/event/event.do?eventCd=2609756` | Pia 正文/结构化字段为 2026-08-11、Zepp Shinjuku、16:00 |
| `https://t.pia.jp/pia/event/event.do?eventBundleCd=b2669967` | 2026-08-22、Zepp Shinjuku；无开演时间，按已知字段确认 |
| `https://l-tike.com/takashi-fujii` | 页面 listing 明确列出 2026-08-28、Zepp Sapporo；保留为官方泛入口，非详情页 |

仍为 `unmatched` 的 8 个有明确原因：

| URL（缩写） | 保存页面事实 | 结论 |
| --- | --- | --- |
| `eplus.jp/nanase30th-tour`、`l-tike.com/nanase30th-tour` | 最终页面是相川七濑 2026-09-12 高知，新来岛高知重工ホール | 与提示的 2026-08-11 Zepp Sapporo 不同，不能确认 |
| `eplus.jp/sf/detail/4469370001…`、`l-tike.com/concert/mevent?mid=774369` | Mateus Asato 2026-12-16 EX THEATER ROPPONGI | 与 2026-08-11 Zepp Shinjuku 不同，不能确认 |
| `l-tike.com/sophia` | SOPHIA 2026-10-15 NHK Hall | 与提示场次不同，不能确认 |
| `t.pia.jp/pia/artist/artists.do?artistsCd=I5220085` | 艺人落地页，无可对应日期/场馆 | 证据不足 |
| `t.pia.jp/pia/artist/artists.do?artistsCd=J9040009` | 艺人落地页，无可对应日期/场馆 | 证据不足 |
| `t.pia.jp/pia/event/event.do?eventBundleCd=b2668974` | 同页含 9/11、9/13、9/23 多场，9/23 DiverCity 还有日/夜两个提示 Event | 无开演时间，保持 `day_night_ambiguity`，不自动发布 |

这 8 项不是“抓取失败”，而是正确的保守拒绝；当前 unmatched 原因统计为 `page_information_insufficient=81`、`day_night_ambiguity=1`。

## 旧链接降级和无效页

当前没有发现“已确认的真实详情页被降为泛入口”的案例。需要区分：旧数据中形状像详情页但实际指向另一场演出的 legacy 记录仍保留用于兼容跳转，且不计入本轮确认观察。已确认的降级/排除规则如下：

- 规范化 URL 只移除尾斜杠和追踪参数；Lawson `/concert/mevent/?mid=` 与 `/concert/mevent?mid=` 都是 `event_detail`。
- `artist`、搜索、帮助、退款、联系页不作为具体购票页。
- HTTP 404/410 不发布；HTTP 403 的帮助页也不发布。
- 页面虽为官方域名，但日期/场馆无法与提示 Event 唯一对应时，不用来源链强行确认。

无效样本：`eplus.jp/contact-form`（403/support）、`eplus.jp/page/eplus/refund1/index.html`（200/refund）、e+ `071978…P0030515`、`071978…P0030516`、`319217…P0030035`（404）、`eplus.jp/sophia`（404）、Lawson artist `000000000848007`（404）、Tickebo `info=15259` 和 `kym-shukabd-ky-ticket01`（404）、`ritta-japan.com/contact`（support）。这些不会变成 TicketOffer。

## 官方页面抽样（保存的原始 HTML）

以下 28 条覆盖详情页、泛入口、日期/场馆歧义和无效页面；状态与字段均来自本地 frontier raw HTML/meta，未在本轮重新联网。

| # | 页面 | 页面证据/处理 |
| ---: | --- | --- |
| 1 | `eplus.jp/sf/detail/3565380001…` | 2026-09-03 Zepp DiverCity；详情确认 |
| 2 | `eplus.jp/sf/detail/4332440001…`（日） | 2026-08-28 14:30 Zepp Nagoya；详情确认 |
| 3 | `eplus.jp/sf/detail/4332440001…`（夜） | 2026-08-28 18:30 Zepp Nagoya；按时间拆分确认 |
| 4 | `eplus.jp/sf/detail/1743710001…` | 2026-09-21 Zepp Sapporo；详情确认 |
| 5 | `eplus.jp/sf/detail/3841110001-P0030020P021001…` | 2026-08-30 18:00 Zepp Shinjuku；详情确认 |
| 6 | `eplus.jp/sf/detail/3325100001-P0030017…` | 2026-08-28 19:00 Zepp Sapporo；详情确认 |
| 7 | `eplus.jp/sf/detail/0176540001…`（难波） | 2026-10-04 18:00 Zepp Namba；详情确认 |
| 8 | `eplus.jp/sf/detail/0176540001…`（羽田） | 2026-10-11 18:00 Zepp Haneda；详情确认 |
| 9 | `l-tike.com/concert/mevent/?mid=430471` | CORNELIUS、2026-09-19 Zepp Sapporo；规范化后仍为详情 |
| 10 | `l-tike.com/concert/mevent/?mid=486312` | LOVEBITES、2026-09-11 Zepp Sapporo；规范化后仍为详情 |
| 11 | `livepocket.jp/e/9t1kz` | JSON-LD 00:00，正文 17:45；正文覆盖占位值 |
| 12 | `livepocket.jp/e/bb_rs` | JSON-LD 00:00，正文 18:00；正文覆盖占位值 |
| 13 | `livepocket.jp/e/livehouseoneman` | JSON-LD 00:00，正文 18:00；正文覆盖占位值 |
| 14 | `livepocket.jp/e/one_more_step` | JSON-LD 00:00，正文 16:00；正文覆盖占位值 |
| 15 | `t.livepocket.jp/e/7y68r` | 旧版正文 2026-08-30 14:00、Zepp Osaka Bayside；详情确认 |
| 16 | `t.pia.jp/pia/event/event.do?eventCd=2609756` | 2026-08-11 16:00、Zepp Shinjuku；详情确认 |
| 17 | `t.pia.jp/pia/event/event.do?eventBundleCd=b2669967` | 2026-08-22、Zepp Shinjuku，无时间；唯一匹配 |
| 18 | `l-tike.com/artist/000000000155305` | listing 明确列出 SLENDERIE、08.28、Zepp Sapporo；保留 generic |
| 19 | `eplus.jp/nanase30th-tour` | 最终 Aikawa Nanase 09.12 高知；与提示场次不符 |
| 20 | `eplus.jp/sf/detail/4469370001…` | Mateus 12.16 EX THEATER；与提示场次不符 |
| 21 | `l-tike.com/concert/mevent?mid=774369` | Mateus 12.16 EX THEATER；与提示场次不符 |
| 22 | `l-tike.com/nanase30th-tour` | 最终 Aikawa Nanase 09.12 高知；与提示场次不符 |
| 23 | `l-tike.com/sophia` | SOPHIA 10.15 NHK Hall；与提示场次不符 |
| 24 | `t.pia.jp/pia/artist/artists.do?artistsCd=I5220085` | 艺人页无日期/场馆；未匹配 |
| 25 | `t.pia.jp/pia/artist/artists.do?artistsCd=J9040009` | 艺人页无日期/场馆；未匹配 |
| 26 | `t.pia.jp/pia/event/event.do?eventBundleCd=b2668974` | 多日期、多场馆且缺时间；保留 day/night 歧义 |
| 27 | `http://eplus.jp/contact-form` | 403/support；不发布 |
| 28 | `http://eplus.jp/page/eplus/refund1/index.html` | 200/refund；不发布 |

## 最小修复和回归

- `scripts/ticket-offer-lib.mjs`：修正 Lawson 规范化路径的详情分类。
- `scripts/ticket-page-parser.mjs`：允许 `Zepp Shinjuku(TOKYO)` 与 master venue 对齐；用正文日期/场馆/时间覆盖 LivePocket `00:00` 日期占位；日期/场馆唯一且未公布时间时只填已知字段。
- `scripts/event-match.mjs`：同日同场馆存在多个 Event 且页面没有精确开演时间时，不再沿来源链自动确认。
- `scripts/ticket-offer-smoke.mjs`：加入 Lawson 双路径、LivePocket 午夜占位、DOM 日期/时间/场馆和日夜歧义回归用例。

## 审计判定

**PASS — READY FOR GOAL 7A**

- 当前数据与 Goal 6 初始快照的 Event ID、事件覆盖、未来事件覆盖和 URL 分类规则一致；LivePocket 午夜占位、Lawson 尾斜杠、场馆别名和日/夜场歧义等实际误判均已有回归证据。
- 已用本地会话中的 28 条观察摘要、原始 HTML/meta 和当时发布逻辑确定性重放 Goal 5 的 100 个 `eventId|offer.id` key：`oldOnly=11`、`currentOnly=0`、同 key 修改 23 个；11 个移除项均已逐项解释（8 个 404 兼容旧链接、3 个页面有效但场次不匹配）。没有有效且匹配当前 Event 的 TicketOffer 被删除，也没有真实详情页被错误降为泛入口。
- 28 条保存的官方页面样本通过；来源家族减少的 6 个 Event 全部属于场次不匹配、日/夜场歧义或艺人泛入口；没有真实的第二官方来源被移除，且 `closed + sold_out=0`。
- 本轮未修改 schema、matcher、采集器或来源范围，`deferred=4` 继续等待 `nextCheckAt`，`pending=112` 不批量抓取。

后续仍按现有策略处理 `deferred=4`（等待 `nextCheckAt` 后复查）并人工决定 `b2668974` 的日/夜场；不批量抓取 `pending=112`。
