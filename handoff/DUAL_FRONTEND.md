# 本地双前端：经典版 / 纸感手账

基于 live 远征手账提交 `79d7a1aaa0775a36a4649e010f9a2ddc726b2b3b` 的独立本地副本。分支：`local/dual-frontend`。没有推送或部署。

## 查看

```sh
npm ci
npm run build
npm run start:dual
```

打开 <http://127.0.0.1:3722>。顶部的「纸感手账 ⇄」切换到新版；新版顶部「经典版 ⇄」可随时返回。选择保存在 `ensei-frontend`，刷新后保留，同源标签页同步。深色模式与前端选择独立。

开发运行：`npm run dev:dual`。关闭前台服务可按 Ctrl+C。`scripts/start-local-preview.mjs` 是本次验证用的隐藏预览启动器，其进程 ID 记录在 `handoff/dual-frontend-qa/preview.pid`。

## 三个压缩包的整合方式

| 材料 | 用途 | 实现位置 |
| --- | --- | --- |
| ensei-techo-ui-refinement.zip | 纸张/墨色层级、朱色行动、靛色信息、字号节奏、克制动效 | `src/app/paper.css`、`FrontendFrame.tsx` |
| ensei-techo-homepage-design.zip | 行动 + 下一程双栏、票务手账、发现卡片、准备清单及路线插画 | `PaperHome.tsx` |
| concert-travel-app-design.zip | 紧凑的票务/远征导航、申请轮次卡片、五阶段进度条 | `ApplicationsBoard.tsx`、新版导航与全站样式 |

材料使用此前已审查版本，原 ZIP 和暂存版本均保持不变。原型中的固定人物、虚构演出、固定日期和模拟票务状态没有接入业务。

## 数据与功能

- 两套界面调用同一份 live 演出目录以及 `useEventPlans`、`useFollows`、`usePreferences`、`useTripPlans`，不存在第二套示例数据库。
- 新版有独立首页、导航、抽选记录面板和全站纸感视觉。公演详情、搜索、票务核验、行程编辑、演出日、地图/3D、个人设置与备份复用现有业务组件，并应用新版样式。
- `/applications` 汇总已保存申请，可筛选并记录用户确认的实际状态；详情继续在原有计划管理器编辑。修改立即写入现有存储，两套界面均可见。
- 切换不跳转地址，保留当前路径、查询和锚点；公演表单组件保持挂载，未保存的申请草稿不会因切换丢失。首页是独立布局，未提交的首页引导表单和临时筛选状态会随首页切换重置，建议先保存。
- 浏览器禁用存储或空间已满时，现有业务存储会抛出异常。新增边界对此给出明确提示，并保留导航与前端切换；不会以空数据覆盖原有记录。恢复存储权限/空间后刷新即可重试。
- 票务入口可信度、过期来源提醒、未知时间、申请资格和付款语义沿用 live 逻辑。没有引入原型中的“默认中签”或推测截止时间。
- **本地端口属于不同浏览器来源。** 原站若运行在 3720，其浏览器记录不会自动出现在 3722。需要时可在原站导出备份，再于本地副本「个人手账」导入；本次没有迁移或修改原站用户数据。

## 验证命令

```sh
npm run typecheck
npm run lint
npm run build
# 先启动 3722 预览
npm run test:dual
npm run test:user-flow
```

纸感版完整流程（PowerShell）：

```powershell
$env:FRONTEND_TEST_MODE='paper'
$env:USER_FLOW_TEST_URL='http://127.0.0.1:3734'
npm run test:user-flow
```

双前端浏览器回归记录及截图在 `handoff/dual-frontend-qa/`。测试使用独立临时浏览器上下文，不调用真实购票或付款。

## 后续集成

当前为本地评审版本，原 live 工作目录未修改。确认设计后，可把本地分支提交或补丁应用到 live 项目，再单独决定是否上线。原项目依赖版本保持不变，本次没有进行依赖升级。
