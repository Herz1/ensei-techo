# Goal 10 客户端性能基线：before

生成时间：2026-08-31T05:10:48.845Z

## 环境与方法

- 机器：win32 10.0.22631 x64 · AMD Ryzen 7 5800H with Radeon Graphics · 16 逻辑核 · 15.9 GB RAM
- 浏览器：151.0.7922.174（headless，1440×900）
- Node：v24.19.0；生产构建 ID：qarzpFjauVT-aSSJaLI9y
- 每条路由：3 个全新浏览器上下文，禁用 HTTP 缓存，取中位数。
- 外部网络全部拦截；地图 PNG 底图返回内存透明瓦片，业务 GeoJSON、热度和场馆点仍从本地生产站点加载。
- 客户端 JS、HTML 与 RSC 取 Resource Timing 的 decodedBodySize；RSC 是带 `_rsc` 参数的首屏请求，HTML 内嵌 Flight 数据计入 document。
- `首次数据解析`以 Chrome CDP 的首屏 ScriptDuration 作为可重复近似值；另单列实际 JSON.parse（≥1 KB）耗时。当前 JSON 模块会编译为 JS 字面量，因此不会完整落入 JSON.parse 计时。
- `首次可交互`是从 navigationStart 到点击全站搜索按钮后模态框确实打开；搜索、筛选和地图均等待可见结果或运行时 ready 标记。
- 内存是 route ready 后 Runtime.getHeapUsage 的 usedSize 近似值，不代表操作系统工作集。

权威源：src/data/events.json，428 场，5.58 MB。

## 路由中位数

| 路由 | 客户端 JS（解码） | HTML | RSC | 首次数据解析/执行近似 | JSON.parse ≥1KB | 首次可交互 | JS Heap | 完整 Event chunk |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| 首页 `/` | 5.31 MB | 48.7 KB | 22.9 KB | 156.64 ms | 21.4 ms | 1147.2 ms | 19.72 MB | 是 |
| 演出列表 `/events` | 5.31 MB | 20.0 KB | 32.6 KB | 193.16 ms | 20.9 ms | 1259.8 ms | 23.74 MB | 是 |
| 演出详情 `/events/evt_e912cb05373a12af9141c910` | 5.39 MB | 67.7 KB | 22.8 KB | 148.62 ms | 20.2 ms | 1155.2 ms | 19.49 MB | 是 |
| 地图 `/map` | 6.22 MB | 20.0 KB | 18.5 KB | 485.6 ms | 22.8 ms | 1902.1 ms | 28.32 MB | 是 |
| 我的 `/me` | 5.31 MB | 31.7 KB | 20.5 KB | 148.2 ms | 21.9 ms | 1029.8 ms | 19.05 MB | 是 |
| 远征详情 `/trips/trip-goal-10-performance` | 5.38 MB | 20.4 KB | 23.1 KB | 144.34 ms | 21.9 ms | 1113.3 ms | 19.27 MB | 是 |

## 首次交互

- 搜索首次结果：首页 37.4 ms；交互期间新增数据 0.0 KB。
- 演出筛选：140.5 ms（6 场结果）。
- 地图初始化：1299 ms（等待至少一个热度区域和一个场馆／聚合点）。

## Bundle 证据

固定 Event ID 与真实性字段共同命中的客户端 chunk：`04ga49dyj84or.js` 4.51 MB。

加载该完整 Event chunk 的路由：/、/events、/events/evt_e912cb05373a12af9141c910、/map、/me、/trips/trip-goal-10-performance。

原始样本及逐个 chunk 见同目录 JSON。
