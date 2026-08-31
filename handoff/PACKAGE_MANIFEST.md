# Pro 交接包清单

## 包含

- `handoff/PRO_MODEL_HANDOFF.md`：当前完成度、风险、关键文件和验证状态
- `handoff/NEXT_GOALS_8A_8B_9.md`：后续三个独立 Goal 的约束与验收
- 根目录运行与配置：`README.md`、`package*.json`、Next/TypeScript/ESLint/PostCSS 配置、一键启动/关闭脚本
- `src/app/**`、`src/components/**`、`src/lib/**`
- 正式运行数据：`artists*.json`、`venues*.json`、`events.json`、`prefectures.ts`、`src/data/index.ts`
- 精选数据证据：Ticket coverage、Goal 6.1 审计、Frontier、TicketOffer observations、完整度/来源审计报告
- `scripts/**`：采集、解析、发布、报告、启动控制和 smoke 测试
- `public/**`：地图运行资源、MapLibre worker 与站点图标
- Goal 7D 交付：动作摘要、偏好价格/时间、近期远征、移动筛选、搜索键盘/焦点、375/768/1440 UI 测试

## 排除

- `node_modules/**`、`.next/**`、`.ensei-techo/**`
- `src/data/ingest/raw/**`（约 242 MB 原始页面）
- 大型中间候选/审批/审核 JSON
- 日志、`.env*`、TypeScript 构建缓存、旧交接 ZIP

## 用途与限制

该 ZIP 是“主要源码 + 正式运行数据 + 精选状态证据”的轻量上下文包，面向网页端 Pro 模型做代码梳理和后续 Goal 实现。它可以安装依赖并生产构建；因为不含完整 raw/候选/审批证据，完整 `npm run validate:data` 应在原工作区运行。
