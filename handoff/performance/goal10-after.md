# Goal 10 客户端性能基线：after

生成时间：2026-08-31T06:01:05.165Z

## 环境与方法

- 机器：win32 10.0.22631 x64 · AMD Ryzen 7 5800H with Radeon Graphics · 16 逻辑核 · 15.9 GB RAM
- 浏览器：151.0.7922.174（headless，1440×900）
- Node：v24.19.0；生产构建 ID：yuR93rU0oPnhaqYHlHUjU
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
| 首页 `/` | 640.0 KB | 718.7 KB | 0.0 KB | 85.76 ms | 3.9 ms | 895.9 ms | 7.02 MB | 否 |
| 演出列表 `/events` | 639.5 KB | 690.0 KB | 0.0 KB | 125.47 ms | 3.9 ms | 1090.2 ms | 9.00 MB | 否 |
| 演出详情 `/events/evt_e912cb05373a12af9141c910` | 642.4 KB | 266.4 KB | 3.8 KB | 79.78 ms | 1.1 ms | 1014.2 ms | 5.99 MB | 否 |
| 地图 `/map` | 1.53 MB | 690.0 KB | 0.0 KB | 442.25 ms | 5.3 ms | 1709.8 ms | 24.52 MB | 否 |
| 我的 `/me` | 655.7 KB | 701.7 KB | 0.0 KB | 71.39 ms | 4 ms | 850.1 ms | 6.27 MB | 否 |
| 远征详情 `/trips/trip-goal-10-performance` | 624.8 KB | 576.6 KB | 0.0 KB | 68.18 ms | 3.6 ms | 811 ms | 6.36 MB | 否 |

## 首次交互

- 搜索首次结果：首页 37.2 ms；交互期间新增数据 249.8 KB。
- 演出筛选：142.7 ms（6 场结果）。
- 地图初始化：1261.2 ms（等待至少一个热度区域和一个场馆／聚合点）。

## Bundle 证据

固定 Event ID 与真实性字段共同命中的客户端 chunk：无。

加载该完整 Event chunk 的路由：无。

原始样本及逐个 chunk 见同目录 JSON。
