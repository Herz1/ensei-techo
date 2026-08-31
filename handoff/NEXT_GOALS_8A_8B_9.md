# 后续 Goal 路线：8A → 8B → 9

本文件供网页端 Pro 模型直接使用。一次只执行一个 Goal；前一个通过验收后再进入下一个，不把三项混成一次大改。

## 共同约束

- 保留 Next.js 16、React 19、TypeScript、Tailwind 4、MapLibre 和现有本地 store。
- 不新增后台、数据库、账号、云同步、邮件、Web Push 或 Redux。
- 不伪造资格、库存、结果、付款期限、终电和演出结束时间；未知保持“未说明/待确认”。
- Event ID 必须稳定；不放宽既有 TicketOffer matcher。
- 不抓取社媒、不登录外站、不处理验证码、不保存 Cookie/凭据、不自动购票或付款。
- localStorage、JSON、ICS 必须向后兼容；迁移确定、可测试，旧数据可恢复。
- 不加入 Demo/随机数据，不重构无关模块，不增加字段级哈希或通用审核框架。
- 每个 Goal 完成后运行 `npm run check`、`npm run build`，并检查 375px 手机与 1440px 桌面。

## Goal 8A：显式小批量演出深度票务核验

### 用户/运营结果

运营者可明确指定 1–10 个 Event ID，先 dry-run 查看每场演出的票务缺口、官方来源和潜在变更，再决定是否应用；未选中的 Event 不发生任何变化。

### 必须实现

- 提供类似命令：

```text
npm run verify:planned -- --event-id <ID> --dry-run
npm run verify:planned -- --event-id <ID1> --event-id <ID2>
npm run verify:planned -- --input selected-events.json --limit 10
```

- Event ID 必须显式；默认 dry-run；最多 10 条；禁止读取或上传 localStorage。
- 复用现有 fetch policy、ticket parser、matcher、publisher 和报告能力；不新增来源 adapter，不扫描全部未来演出。
- 每场核对：官方演出详情、官方票务详情、可见阶段、资格、会员/账号、手机/地区、票务 App、身份核验、同行者/分配、申请起止、结果、付款期限、出票/显示时间、最后核验时间。
- 只有官方页面明确披露的值才能写入；平台通用规则只能显示为“平台准备建议”，不能伪装成该场 Event 的要求。
- 每个写入字段带 `sourceUrl` 和 `lastVerifiedAt`；与正式值冲突时停止自动覆盖并输出人工报告。
- 输出逐 Event 矩阵：字段、当前值、来源、最后核验、是否变化、未知原因、是否人工处理。
- 发布保护：比较 Event ID、Offer key、有效详情 URL 和来源家族；有效数据减少时停止。

### 验收

- 同一选择和同一输入可复现；未选中 Event 字节级不变。
- `--dry-run` 不修改正式 JSON；写入需要显式 apply。
- 不减少 Event ID 或已确认有效 Offer。
- UI 能区分 Event 特定要求与平台通用建议。
- `npm run check`、`npm run build` 通过。

## Goal 8B：完全本地的社媒线索箱

### 用户结果

用户可粘贴小红书、X、Instagram 或其他网页 URL/文本/备注，在本地得到最多 5 个正式 Event 候选；只有用户点击确认后才建立关联。

### 最小数据模型

```ts
interface SocialLead {
  id: string;
  platform: "xhs" | "x" | "instagram" | "other";
  url?: string;
  canonicalUrl?: string;
  pastedText?: string;
  note?: string;
  capturedAt: string;
  status: "inbox" | "matched" | "dismissed";
  matchedEventId?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 必须实现

- 首页动作区增加“保存社媒线索”；支持 URL、粘贴文本和私人备注。
- 识别平台域名；移除 `utm_*`、`igshid` 等追踪参数；离线也能保存。
- 只用正式本地数据按艺人、标题、日期、场馆匹配，最多返回 5 条并说明原因。
- 候选不能自动确认；用户确认后可打开 Event、加入计划或创建申请准备项。
- 未匹配线索仍保存在本机；不得修改 `events.json` 或 `TicketOffer`。
- UI 明确四层信任：社媒线索未核验、Event 来源确认演出存在、Ticket 来源确认票务入口、个人备注私密。
- JSON 备份/恢复纳入 SocialLead，但不得包含 Cookie、缓存、账号或登录信息。
- 禁止社媒抓取、OCR、截图识别、自动发布和把粉丝账号当官方来源。

### 验收

- 三个平台 URL 可保存和规范化；断网可匹配。
- 已匹配与未匹配都有浏览器流程；关联必须由用户确认。
- 正式数据不被污染；JSON 清空后导入可恢复线索。
- `npm run check`、`npm run build` 通过。

## Goal 9：中奖后的远征行动工作台

### 用户结果

申请变为中签、已付款或已出票后，用户可在不超过 3 次点击内加入已有远征或创建远征；演出当天可在手机看到当前时间、Now、Next、倒计时和未完成准备事项。

### 必须实现

- 状态进入 `won` / `paid` / `ticketed` 时显示加入远征提示；自动带入 Event、日期、场馆、开场时间和偏好出发地，不执行任何预订。
- 增加最小 `TravelLeg`：

```ts
interface TravelLeg {
  id: string;
  from: string;
  to: string;
  departAt?: string;
  arriveAt?: string;
  durationMinutes?: number;
  status: "estimated" | "confirmed";
  referenceUrl?: string;
  note?: string;
}
```

- TravelLeg 只允许用户手填；不得声称实时交通、准确终电或已预订。估算与确认必须视觉区分。
- 新增每个 Trip 的 Event Day 手机页面：当前时间、Now、Next、倒计时、演出/场馆/开场、来源更新时间、申请/票状态、票务 App 或未知、座位/同行、证件、电量/网络、路线、寄存、返程和未完成清单。
- 根据已核验 TicketOffer 字段生成未勾选准备项：账号/会员、手机/SMS、App、身份、同行者/分配、付款、出票、网络/充电、交通/住宿/寄存。
- Event 特定要求与平台通用建议分开；每一项可追溯到来源或明确标为个人项。
- 时间线按天合并演出、TravelLeg 和自定义事项；明确 `estimated` / `confirmed`。固定 150 分钟只能叫“估算”，手动覆盖显示“个人确认”。
- 冲突至少包含重叠、缓冲不足、跨都道府县和返程早于估算结束。
- JSON、ICS 和打印版包含票务准备、交通、场馆/应急备注与离线关键时间。

### 验收

- 中签后不超过 3 次点击进入 Trip。
- 375px 页面首屏能看到 Now/Next；时间状态和未完成清单清晰。
- 不出现实时交通或已预订暗示；清单来源可追溯。
- JSON、ICS、打印可用；有移动端 E2E。
- `npm run check`、`npm run build` 通过。

## 可直接复制给 Pro 的起始提示词

```text
先完整阅读 handoff/PRO_MODEL_HANDOFF.md 和 handoff/NEXT_GOALS_8A_8B_9.md，再阅读 package.json、src/lib/types.ts、src/data/index.ts、src/lib/store.ts、src/lib/plan.ts、src/lib/ticket-offer.ts、src/lib/backup.ts、src/lib/trip-store.ts、src/lib/trip.ts 及当前 Goal 涉及的组件/脚本。

当前已完成到 Goal 7D。不要重写技术栈，不要重复演出计划、备份、地图、筛选和无障碍收口。本次只执行 NEXT_GOALS_8A_8B_9.md 中第一个尚未完成的 Goal；先审计现有能力，再做最小实现。不得伪造票务或交通事实，不得放宽 matcher，不得修改无关采集管线。完成后运行 npm run check、npm run build 和对应的 375px/1440px 浏览器流程，只报告用户能力、数据/迁移、关键文件、验证结果和剩余风险。
```
