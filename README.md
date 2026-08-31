# 远征手账 / 遠征手帳

面向赴日观演用户的全日本 Live 情报与行程管理应用。项目将演出发现、官方购票跳转、售票时间线、场馆交通、地图探索和收藏管理整合在一个响应式 Web 应用中。

> 正式演出库只接收白名单官方来源、完成 ID 归一化并通过证据哈希审核的记录。购票前仍须以链接后的官方页面为准。

## 主要功能

- 首页展示今日、本周及即将开票的演出
- 按日期、地区、都道府县、类型、状态和价格筛选演出
- 支持中文、日文、罗马字和假名的模糊搜索
- 查看演出日程、票价、售票阶段、场馆交通及关联演出
- 日本地图展示都道府县热度和场馆位置
- 按已核验未来公演数量展示艺人与地区收录统计
- 东京巨蛋、日本武道馆和横滨 Arena 的低多边形 3D 分区参考
- 使用浏览器本地存储保存“想看”和“关注”
- 汇总远征日程、日期冲突及开票提醒
- 导出 ICS 日历和 JSON 备份，并支持从 JSON 恢复
- 响应式布局、深浅色主题和非日本时区换算

## 技术栈

- Next.js 16、React 19、TypeScript
- Tailwind CSS 4
- MapLibre GL
- React Three Fiber、Three.js
- Fuse.js

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

开发服务器运行在 [http://localhost:3720](http://localhost:3720)。

### Windows 一键启动与关闭

- 双击 `启动远征手账.cmd`：首次运行会自动安装依赖；源码有变化时自动重新构建，随后在后台启动服务器并打开浏览器。
- 双击 `关闭远征手账.cmd`：只关闭由本项目记录的服务器进程，不会终止碰巧占用 3720 端口的其他程序。
- 进程所有权记录保存在 `.ensei-techo/server.json`，重新构建不会丢失关闭信息。

生产构建与本地启动：

```bash
npm run build
npm run start
```

## 常用命令

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript 类型检查
npm run validate:data # 校验静态数据及引用关系
npm run check         # 运行静态检查、数据校验和离线采集测试
npm run test:map-runtime # 启动服务器后，用本机 Chrome/Edge 验证地图图层与交互
npm run test:event-ingest # 离线验证官网解析、归一化和去重
npm run ingest:events # 从白名单官方来源采集真实演出候选
npm run discover:artists # 从候选中生成待审核艺人
npm run publish:artists # 发布已批准艺人
npm run review:prepare # 生成字段级审核批次和批次哈希
npm run review:apply -- --batch <hash> --reviewer <name> # 显式批准审核批次
npm run publish:events # 将已批准候选发布到正式演出库
npm run report:data   # 生成 JSON/Markdown 完整度与异常队列报告
```

## 真实演出候选采集

`npm run ingest:events` 使用三层混合采集，不直接覆盖正式
`src/data/events.json`：

1. 有 `TICKETMASTER_API_KEY` 时读取 Ticketmaster 日本音乐活动 API；没有 Key
   时明确跳过这一层。
2. 低频读取横滨 Arena、9 个 Zepp 场馆日程及其详情页，以及米津玄师、椎名林檎
   两个艺人官方巡演页。
3. 统一艺人和场馆 ID、去重、检查同场馆/艺人时间冲突，再进入字段级审核；
   页面结构变化会明确进入 `parser_failed`，不会被解释成“尚未公布”。

输出位于 `src/data/ingest/`：

- `candidates.json`：全部候选及来源证据、内容哈希和待处理问题。
- `report.json`：各来源成功/失败、候选数量及问题统计。
- `approved.json`：仅包含人工批准的候选。
- `reviews.json`：字段级审核记录，每个字段保存独立 `approvalHash`、审核时间
  和审核者。字段内容变化时只有对应字段退回 `changed`，不会静默沿用旧结论。
- `field-review-batch.json`：可批准字段、阻断字段及不可篡改的批次哈希。
- `completeness-report.json/.md`：覆盖率、来源贡献、待审核、解析失败、来源冲突
  和官网变化队列。

执行 `review:prepare` 并核对批次内容，再通过 `review:apply` 显式批准。审核完成后
再次执行 `npm run ingest:events` 生成 `approved.json`，再执行
`npm run publish:events`。发布脚本会拒绝空审核库、未核验记录、缺少官方来源或缺少
开演时间的记录。原随机 Demo 生成器已经移除，正式演出库不能从随机数据回填。

审核格式示例：

```json
{
  "schemaVersion": 2,
  "events": [
    {
      "id": "evt_...",
      "fields": {
        "title": "候选字段中的 approvalHash",
        "eventDate": "候选字段中的 approvalHash"
      },
      "verifiedAt": "ISO-8601 时间",
      "reviewer": "审核者"
    }
  ],
  "rejected": ["evt_..."]
}
```

可选环境变量：

```bash
TICKETMASTER_API_KEY=...    # Ticketmaster 开发者 Key
EVENT_INGEST_MONTHS=4       # 场馆/API 向后采集月份，范围 1-12
EVENT_INGEST_FROM=2026-07-29 # 固定采集起始日，默认日本当天
EVENT_INGEST_TIMEOUT_MS=25000
```

采集器只访问白名单公开日程，不登录、不处理验证码，也不抓取实时票务库存。
任一来源失败会在报告中记录；如果所有来源均失败，则保留现有候选文件而不是写入空数据。

## 目录结构

```text
src/app/          页面与路由
src/components/   页面组件、地图、搜索和 3D 场馆
src/data/         艺人、场馆、演出与都道府县数据
src/lib/          时间、搜索、状态、汇率和 ICS 等工具
public/data/      地图 GeoJSON
scripts/          演出采集、审核发布与数据校验脚本
```

## 数据与使用限制

- 正式演出数据来自审核后的静态 JSON，目前没有后端、账号系统或云同步。
- “想看”“关注”和主题设置仅保存在当前浏览器；换设备需使用 JSON 导出与导入迁移。
- 开票提醒是个人中心内的汇总视图，不包含系统通知或推送。
- 人民币价格按代码中的固定参考汇率换算，不是实时汇率。
- ICS 默认按演出开始后 2.5 小时作为结束时间。
- 3D 场馆使用简化几何模型，分区和视野仅供界面演示。
- 地图覆盖日本 47 个都道府县，但当前场馆数据没有覆盖全部地区。
