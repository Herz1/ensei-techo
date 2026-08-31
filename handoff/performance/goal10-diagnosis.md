# Goal 10 问题来源与最小优化说明

## 结论

优化前，完整 `src/data/events.json` 确实进入了首页及全部六个目标路由的客户端依赖图。生产构建中可用固定 Event ID、`fieldProvenance` 和 `verification` 三重特征定位到同一个 4,728,785 字节的客户端 chunk；`/`、`/events`、`/events/[id]`、`/map`、`/me`、`/trips/[id]` 都加载了它。

原因不是 React 重复保存了六份文件，而是多个 `use client` 组件及其共享工具直接或间接导入 `@/data`。共享 chunk 在同一浏览器会话中可被 HTTP 缓存复用，但每个全新页面上下文仍要下载／读取、解析并执行它；因此六条入口都无条件承担完整数据成本。全局搜索模态框的同步数据导入尤其使本来不需要演出目录的页面也被污染。

优化后，客户端组件及其共享工具不再导入 `@/data`，完整 Event 特征 chunk 在六条路由中均不存在。正式数据仍只在 `src/data/events.json` 维护；生成文件是构建产物，并由 `npm run check:client-data` 对内容陈旧进行确定性校验。

## 各交互真正需要的数据

### 列表与本地计划

- Event：稳定 ID、标题、艺人 ID、类型、场馆 ID、日期／开场／开演、生命周期与展示状态、票价档、受付／官方票务行动摘要、配信摘要。
- Artist：ID、名称／别名、类型标签所需 Genre、展示色。
- Venue：ID、名称、都道府县、城市、容量、类型及交通展示摘要。
- 本地计划、关注和远征只保存 ID；因为 ID 来自浏览器 localStorage，Server Component 无法预先知道具体切片，所以这些页面接收构建生成的轻量目录，而不是完整真实性证据。

### 地图

- Event：ID、标题、日期、场馆 ID、展示状态，以及场馆面板所需的最低票价摘要。
- Venue：ID、名称、经纬度、都道府县、场馆类型和面板展示摘要。
- 都道府县边界继续来自本地 `public/data/japan-simplified.geojson`。
- 热度、场馆计数与聚合点均在浏览器基于轻量摘要计算，不读取字段级证据。

### 搜索

- Event：ID、标题、巡演名、艺人 ID、日期和状态。
- Artist：名称、罗马字、假名与别名。
- Venue：名称、城市和类型。
- 索引只在用户首次打开全站搜索时请求 `public/data/search-index.json`，首屏不再同步打包搜索目录。

## 留在 Server Component 的内容

- `fieldProvenance`、字段级 evidence、availability 明细、evidence hash、完整核验记录。
- 额外费用、标签和仅详情页展示的真实性说明。
- 演出详情路由只查找并序列化当前一场完整 Event；相关场次和比较场次使用摘要。
- 完整艺人／场馆核验资料只在相应详情 Server Component 使用。

客户端仍保留票价、受付和 TicketOffer 的必要行动字段，因为“行动中心”、本地申请状态、演出日清单和列表筛选需要离线读取它们；这部分来自同一权威 Event 的生成视图，不是第二套人工领域数据。

## 实现边界

- `scripts/generate-client-data.mjs` 从三份正式实体数据生成 `src/data/generated/event-summary-index.json` 与 `public/data/search-index.json`。
- `src/data/client-data.ts` 是 `server-only` 路由切片入口，并复用现有票务状态归一化逻辑。
- 客户端共享工具（搜索、备份、远征、热度）改为显式接收目录参数，避免隐藏的全量导入。
- 关闭大目录路由和单场完整详情链接的自动 prefetch，避免页面可见时后台预取数百 KB 目录或多场完整证据；点击仍正常导航。
- 未引入缓存框架、状态框架、数据库、GraphQL 或新依赖。

## 可复现命令

```text
npm run build
npm run measure:performance -- --label after --runs 3
npm run compare:performance
npm run check
npm run test:map-runtime
npm run test:user-flow
```

原始逐轮样本、环境、测量口径和 bundle 特征证据位于同目录的 `goal10-before.json`、`goal10-after.json` 与 `goal10-comparison.json`。
