# 远征手账：网页端 Pro 模型交接说明

生成日期：2026-08-31（Asia/Shanghai）  
工作区：`E:\claude use\live\ensei-techo`

## 先读结论

这是一个可本地构建、可完整走通核心用户流程的 Next.js 应用，不是待重写原型。当前产品已经完成真实演出浏览、官方购票入口、申请状态、个人下一步、地图、远征、JSON/ICS 导出恢复以及移动端/桌面端质量收口。

当前完成度以 **Goal 7D** 为界。下一阶段不要重复做收藏、备份、筛选或地图；应按 `handoff/NEXT_GOALS_8A_8B_9.md` 依次完成：小批量演出深度票务核验、本地社媒线索箱、中奖后的远征当天工作台。

本目录没有 `.git` 元数据，不能依赖提交历史判断修改范围。交接以源码、测试脚本和本文件为准。根目录 `README.md` 部分内容落后于当前实现，不应据此回退为二元“想看”模型。

## 一、产品与技术边界

- Next.js 16.2.12、React 19.2.4、TypeScript、Tailwind CSS 4。
- MapLibre GL 展示日本地图；React Three Fiber/Three.js 提供三个场馆的简化 3D 参考。
- 正式演出数据来自静态 JSON；没有后台、账号、数据库或云同步。
- 个人偏好、关注、演出计划、申请和远征全部保存在浏览器 `localStorage`。 
- JSON 备份格式当前为 v4；演出与个人截止支持 ICS。
- 票务字段仅在官方来源明确披露时展示；不推测库存、资格、结果、付款期限、终电或演出结束时间。
- 外部购票站只作为跳转目标；自动测试会拦截外部导航，不会提交票务表单。

## 二、当前进度总览

| 模块 | 状态 | 当前结果 |
| --- | --- | --- |
| 真实数据与审计 | 已完成基础闭环 | 574 位艺人、84 个场馆、428 场正式演出；无随机 Demo 回填 |
| 三层混合采集 | 已完成基础闭环 | API（有 Key 才运行）+ 白名单官方页 + 实体/证据/审核发布 |
| 票务 Frontier | 可小批量运行 | 保守分类与匹配，拒绝搜索/支持/退款/404/歧义页 |
| 演出计划 | 已完成 | 从加入计划到申请、中签、付款、出票、参加的本地状态闭环 |
| 下一步中心 | 已完成 | 官方阶段与个人截止排序，过期/未知状态明确 |
| 我的页面 | 已完成 | 待处理、已申请、中签/待入场、已参加、关注艺人、偏好与数据管理 |
| 地图 | 已完成并有运行时测试 | 热度、聚合点、场馆点、聚合放大、悬停、面板、都道府县点击 |
| 远征 | 已完成基础版 | 多日行程、场次、住宿/交通备注、预算、清单、冲突与导出 |
| JSON/ICS | 已完成 | v1-v4 兼容迁移与坏记录保护；个人截止绝对时刻语义一致 |
| Goal 7D UI 收口 | 已完成 | 信息架构、偏好价格/时间、移动筛选、动作摘要、搜索键盘与焦点、三档视口测试 |
| Goal 8A | 未实现 | 尚无显式 Event ID 的深度票务核验命令和逐字段矩阵 |
| Goal 8B | 未实现 | 尚无完全本地的社媒线索箱与候选匹配确认 |
| Goal 9 | 部分基础存在 | 已有 Trip，但没有 TravelLeg、Event Day 的 Now/Next 或动态票务准备清单 |

## 三、用户现在能完成什么

### 1. 发现与浏览

- `/`：首次设置常驻地区、出发地、币种和时区；查看关注艺人、下一步、附近演出、推荐理由和近期远征。
- `/events`：搜索并按日期、地区、都道府县、类型、状态和价格筛选。
- `/artists/[id]`、`/venues/[id]`：查看实体详情与关联演出。
- `/map`：切换热度/场馆图层，使用聚合、场馆面板和都道府县跳转。
- `/rankings`：查看正式数据的艺人/地区收录情况。
- 深浅色、375px 手机、768px 中间宽度和 1440px 桌面均已处理。

### 2. 演出计划与票务行动

- `UserEventPlan` 已替代二元 wants；旧 `ensei-wants` 会一次性迁移且不影响关注艺人。
- 一个 Event 下支持多条 `TicketApplication`，可分别记录准备、已申请、中签、落选、已付款、已出票等状态。
- 演出详情顶部有精简动作摘要，下方保留详细票务来源、申请状态和远征操作。
- “下一步”优先展示即将截止的官方阶段和个人任务；未知值保持“未说明/待确认”。
- 官方票务时间按 JST 展示；个人截止保存墙上时间、时区和绝对时刻，旧记录会安全迁移。
- Event 列表/详情价格会结合用户币种偏好显示参考换算，但不会伪装成实时汇率或结算金额。

关键文件：

- `src/lib/store.ts`
- `src/lib/plan.ts`
- `src/lib/ticket-offer.ts`
- `src/lib/ticket-action-core.mjs`
- `src/components/event/EventActionSummary.tsx`
- `src/components/event/WantButton.tsx`
- `src/components/event/TicketOffers.tsx`
- `src/components/me/SaleAlerts.tsx`
- `src/components/me/WantTimeline.tsx`

### 3. 远征与个人数据

- 新建多日远征，将多场演出加入同一行程。
- 记录出发地、抵达/返程、住宿、交通/自定义项目、预算、检查清单和个人结束时间覆盖。
- 识别场次重叠、缓冲不足和跨都道府县冲突，并允许用户显式忽略。
- JSON v4 备份包含偏好、计划/申请、关注和远征；导入逐条校验正式 Event/Artist ID。
- 某个非空分段全部无效时保留本机数据，不会静默清空。
- ICS 可导出演出、个人截止和远征时间线。

关键文件：`src/lib/backup.ts`、`src/lib/ics.ts`、`src/lib/trip-store.ts`、`src/lib/trip.ts`、`src/components/trip/**`、`src/components/me/DataManage.tsx`。

### 4. 一键启动与关闭

- 双击 `启动远征手账.cmd`：缺依赖时安装，源码较构建新时构建，后台启动 3720 并打开浏览器。
- 双击 `关闭远征手账.cmd`：只停止状态文件确认属于本项目的 Node 进程。
- 控制逻辑在 `scripts/ensei-techo-control.ps1`；本机进程状态 `.ensei-techo/**` 不进入交接包。

## 四、正式数据与票务快照

以下是本地正式库和 2026-08-27 票务报告快照，不代表实时库存：

| 指标 | 值 |
| --- | ---: |
| 艺人 | 574 |
| 场馆 | 84 |
| 正式演出 | 428 |
| 未来演出（报告快照） | 255 |
| TicketOffer | 89 |
| 有 Offer 的 Event | 52 |
| 有 Offer 的未来 Event | 44 |
| 已确认具体购票详情 URL | 21 |
| 至少两类官方来源的 Event | 17 |
| Frontier | done 16 / unmatched 82 / invalid 23 / deferred 4 / pending 112 / blocked 13 |

数据覆盖明显偏向 Zepp 九个场馆、横滨 Arena、米津玄师和椎名林檎官方页。“地图覆盖日本”不等于演出来源已全国充分覆盖。

Goal 6.1 审计结论为 `PASS — READY FOR GOAL 7A`：428 个 Event ID 稳定；旧版 Offer 回放中的 11 个移除项为 8 个 404 和 3 个错误场次链接，没有为美化覆盖率保留无效入口。证据见 `src/data/ingest/ticket-coverage-goal6-1-audit.md`。

## 五、Goal 7D 交付摘要

- 首页动作区去重，并补充近期远征入口。
- Event 卡片、列表和详情增加偏好币种价格展示。
- 演出详情增加 `EventActionSummary`，优先给出明确下一步。
- “我的”页增加可编辑偏好面板。
- `/events` 在 375px 使用紧凑筛选，768px 起恢复横向布局，避免中间宽度断裂。
- 搜索对话框支持 ArrowUp/ArrowDown、Escape、焦点陷阱和关闭后返回触发按钮。
- 全局补充一致的 `focus-visible`，并避免 EventRow 出现嵌套交互控件。
- 新增 `scripts/ui-quality-smoke.mjs`，固定覆盖 375 / 768 / 1440 三档的首页、公演列表、详情、我的、远征和搜索。

新增/重点修改文件：

- `src/components/event/EventActionSummary.tsx`
- `src/components/ui/PreferencePrice.tsx`
- `src/components/ui/OfficialInstant.tsx`
- `src/components/me/PreferencesPanel.tsx`
- `src/components/discover/UpcomingTrips.tsx`
- `src/components/event/EventsBrowser.tsx`
- `src/components/search/SearchModal.tsx`
- `scripts/ui-quality-smoke.mjs`
- `scripts/user-flow-smoke.mjs`

## 六、当前验证状态

本次交接验证日期：2026-08-31。

- `npm run check`：通过。包含 ESLint、TypeScript、数据校验、演出采集、TicketOffer、Frontier policy、ticket refresh 和 deadline smoke。
- 数据校验：574 位艺人、84 个场馆、428 场演出。
- `npm run build`：通过。Next.js 生产构建与全部 12 条业务/系统路由生成成功。
- `npm run test:user-flow`：本日 Goal 7D 收口后已通过，覆盖 375×812 与 1440×900 的申请、旧模型迁移、v4 备份恢复、搜索键盘与焦点。
- `npm run test:ui-quality`：本日已通过，覆盖 375 / 768 / 1440 三档视口和六类页面。
- `npm run test:map-runtime`：地图有独立运行时测试；需先有可访问的本地服务。

本次 `npm run build` 在受限沙箱内第一次运行时因 Windows `spawn EPERM` 停止；在允许 Next 创建构建 worker 后原命令完整通过，这不是源码或类型错误。

## 七、当前风险与未完成项

1. **票务新鲜度与覆盖率仍是首要风险。** 不能把 2026-08-27 快照描述为实时状态，也不能靠放宽 matcher 提升数字。
2. **缺少按 Event 深查的运营闭环。** 现有 Frontier 面向链接队列，没有 Goal 8A 要求的显式 Event ID、最多 10 条、14 字段矩阵和冲突人工报告。
3. **社媒线索尚未纳入产品。** 不应为此增加登录或爬虫；Goal 8B 只做本地粘贴、规范化、候选匹配和用户确认。
4. **远征仍偏静态计划。** 已有 Trip 基础，但缺少中奖后直达、TravelLeg、Event Day、Now/Next 和来源可追溯的动态准备清单。
5. **用户数据只在当前浏览器。** 换设备依赖 JSON；没有账号、云备份或通知。
6. **客户端数据体积需先测后改。** `events.json` 约 5.7 MB，多个客户端组件导入完整数据；扩容前应测 bundle/内存，不先引入 Redux、数据库或通用缓存。
7. **交接包不含原始网页证据。** 它可审阅、安装和构建；完整 `validate:data` 仍需原工作区约 242 MB 的 `src/data/ingest/raw/**` 及候选/审批文件。

## 八、后续方向

按顺序一次只做一个 Goal：

1. **P0 / Goal 8A：显式小批量深度票务核验。** 先做只读 dry-run 和逐字段矩阵，再允许受保护写入；Event ID 显式、最多 10 条、未选中 Event 完全不变。
2. **P1 / Goal 8B：完全本地的社媒线索箱。** 粘贴小红书/X/Instagram URL 或文本，本地规范化和匹配；只有用户确认后才关联正式 Event，线索永远不能修改正式数据。
3. **P1 / Goal 9：中奖后的远征行动工作台。** 复用现有 Trip，补 TravelLeg、Event Day、Now/Next、动态票务准备清单和离线可用导出；不做实时交通、订票或付款。

完整拆分、边界和验收见 `handoff/NEXT_GOALS_8A_8B_9.md`。不要把三个 Goal 合并实现。

## 九、Pro 模型开始方式

先完整阅读：

1. `handoff/PRO_MODEL_HANDOFF.md`
2. `handoff/NEXT_GOALS_8A_8B_9.md`
3. `package.json`
4. `src/lib/types.ts`
5. `src/data/index.ts`
6. `src/lib/store.ts`、`plan.ts`、`ticket-offer.ts`、`backup.ts`
7. `src/lib/trip-store.ts`、`trip.ts`
8. 与当前 Goal 相关的组件和脚本

然后只执行 `NEXT_GOALS_8A_8B_9.md` 中排在最前的未完成 Goal。先验证现有能力，只补缺口；每个 Goal 结束运行 `npm run check`、`npm run build` 和对应浏览器流程。

## 十、交接包范围

ZIP 包含主要源码、运行配置、正式运行数据、精选 Ticket/Frontier 报告、smoke 脚本和交接文档；排除：

- `node_modules/**`、`.next/**`、日志、环境变量、本机进程状态；
- `src/data/ingest/raw/**` 约 242 MB 原始页面；
- 大型候选、审批和审核批次 JSON；
- 旧交接 ZIP。

它适合上传给网页端 Pro 做代码梳理和下一 Goal 实现，也可以执行 `npm install` 与 `npm run build`。完整数据证据审计仍应回到原工作区。
