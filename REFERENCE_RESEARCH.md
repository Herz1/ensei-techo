# 官方开源实现调查

调查日期：2026-10-07（Asia/Shanghai）。通过 GitHub 官方 REST API 查询 release / commit / archived，阅读官方源码及许可证；以下为执行当时快照。

| 项目与官方仓库 | 最新 release | 最新主线 commit | 许可与活跃证据 | 本轮取舍 |
|---|---|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | [v6.13.0](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.13.0)，2026-10-06 | `93fd787123428c3cd20f1432c16a4c30f424994f`，2026-10-07，处理 context lost 时 setStyle | 未归档；[LICENSE.txt](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) 为 BSD-3-Clause 核心并保留 Mapbox/d3 BSD 和 glfx MIT notices；API NOASSERTION 不能当无许可证 | 复用已有地图/worker/聚合与运行时回归；不为外壳切换升级地图。`src/ui/map.ts` 的 style 生命周期启发避免为换视觉重新创建地图 |
| [FullCalendar](https://github.com/fullcalendar/fullcalendar) | [v7.1.1](https://github.com/fullcalendar/fullcalendar/releases/tag/v7.1.1)，2026-10-06 | `786d1b27673deef84bc550f936f61b4d4a03a7a0`，2026-10-06 | 未归档；[MIT](https://github.com/fullcalendar/fullcalendar/blob/main/LICENSE.md)；商业 premium 不属于本次授权内容 | 阅读 `packages/vanilla/src/themes/classic/index.ts`、themes/global 及 [timeZone](https://fullcalendar.io/docs/timeZone) 文档：视觉主题应与事件状态分离，命名时区需要明确转换。现有时间线已成熟，不添加日历框架，不复制商业 scheduler |
| [icalendar](https://github.com/collective/icalendar) | [v7.3.0](https://github.com/collective/icalendar/releases/tag/v7.3.0)，2026-08-19 | `a7d8508d3e22c68fc1783ea938b8356950cb2a7f`，2026-10-06；仓库 pushed_at 2026-10-07 | 未归档；[LICENSE.rst](https://github.com/collective/icalendar/blob/main/LICENSE.rst) BSD-2-Clause（核对文本） | 阅读 `src/icalendar/parser/content_line.py` 的行语法/反转义、`parser/string.py` 的字节折行。补充 CRLF 注入与中文折行验证，并在独立 Python 环境解析真实本轮 ICS；不将 Python 库加入浏览器依赖 |

以上三个项目均有近期主线活动。poliastro 与本项目演出、备份和主题目标无直接关联且已归档，本轮不使用；活跃算法参考改用与实际 ICS 验收相关的 icalendar。

## 明确边界

调查不等于引入依赖。MapLibre 已经是本项目依赖，保持锁文件版本；FullCalendar 只参考主题/时区约束；icalendar 只作独立解析验证工具。没有复制整体应用、模拟票务事实、商业内容或自动发布逻辑。
