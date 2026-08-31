import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const baseUrl = process.env.USER_FLOW_TEST_URL ?? "http://127.0.0.1:3731";
const testPort = new URL(baseUrl).port || "3731";
const EVENT_ID = "evt_e912cb05373a12af9141c910";
const EVENT_TITLE = "森本爵ONEMANLIVE ～Palindrome～";
const ARTIST_ID = "artist-ext-fc53eec384c52489";
const ARTIST_NAME = "森本爵";
const STORAGE_KEYS = [
  "ensei-user-preferences",
  "ensei-event-plans",
  "ensei-follows",
  "ensei-trip-plans",
  "ensei-social-leads",
  "ensei-wants",
];

const events = JSON.parse(await readFile(resolve(ROOT, "src/data/events.json"), "utf8"));
const artists = [
  ...JSON.parse(await readFile(resolve(ROOT, "src/data/artists.json"), "utf8")),
  ...JSON.parse(await readFile(resolve(ROOT, "src/data/artists-ingested.json"), "utf8")),
];
assert.equal(events.find((event) => event.id === EVENT_ID)?.titleJa, EVENT_TITLE, "固定 Event ID 已变化");
assert.equal(artists.find((artist) => artist.id === ARTIST_ID)?.nameJa, ARTIST_NAME, "固定 Artist ID 已变化");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // 继续寻找本机浏览器。
  }
}
if (!executablePath) throw new Error("未找到 Chrome/Edge。可通过 CHROME_PATH 指定浏览器可执行文件。");

let server = null;
let serverOutput = "";
async function appReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok && (await response.text()).includes("远征手账");
  } catch {
    return false;
  }
}
if (!await appReady()) {
  const nextBin = resolve(ROOT, "node_modules/next/dist/bin/next");
  try {
    await access(resolve(ROOT, ".next/BUILD_ID"));
  } catch {
    throw new Error("缺少生产构建；请先运行 npm run build，再执行 npm run test:user-flow");
  }
  server = spawn(process.execPath, [nextBin, "start", "-p", testPort], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });
  for (let attempt = 0; attempt < 40 && !await appReady(); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    if (server.exitCode !== null) throw new Error(`本地服务器启动失败：\n${serverOutput}`);
  }
  if (!await appReady()) throw new Error(`本地服务器 20 秒内未就绪：\n${serverOutput}`);
}

function shanghaiWallTime() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function storageSnapshot(page) {
  return page.evaluate((keys) => Object.fromEntries(keys.map((key) => {
    const raw = localStorage.getItem(key);
    return [key, raw === null ? null : JSON.parse(raw)];
  })), STORAGE_KEYS);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, `${label} 出现横向溢出`);
}

async function assertNotCoveredByBottomNav(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, `${label} 没有可见布局框`);
  const nav = await page.locator(".site-bottom-tabs").boundingBox();
  if (nav) assert.ok(box.y + box.height <= nav.y + 1, `${label} 被底部导航遮挡`);
}

async function runFlow(browser, viewport, label) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseUrl).origin || ["data:", "blob:"].includes(url.protocol)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.getByText("让发现页更贴近你的远征", { exact: true }).waitFor();
    await page.getByLabel("常驻都道府县").selectOption("tokyo");
    await page.getByLabel("常用出发地").fill("上海虹桥");
    await page.getByLabel("显示币种").selectOption("JPY");
    await page.getByLabel("显示时区").selectOption("Asia/Shanghai");
    await page.getByRole("button", { name: "保存并开始发现" }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("ensei-user-preferences") ?? "null")?.setupStatus === "completed");

    await page.getByRole("button", { name: "保存社媒线索" }).click();
    await page.getByLabel("社媒 URL").fill("https://www.instagram.com/p/local-test/?utm_source=smoke&igshid=secret");
    await page.getByLabel("公告文字").fill(`${ARTIST_NAME} ${EVENT_TITLE} 2026/09/04 Zepp Shinjuku`);
    await page.getByRole("button", { name: "保存到本机收件箱" }).click();
    await page.getByRole("button", { name: `确认关联：${EVENT_TITLE}` }).waitFor();
    await page.getByRole("button", { name: `确认关联：${EVENT_TITLE}` }).click();
    await page.getByText("已由你确认关联", { exact: true }).waitFor();
    await page.getByLabel("社媒 URL").fill("https://x.com/example/status/999?utm_medium=smoke");
    await page.getByLabel("公告文字").fill("完全不存在的演出 2099/01/01");
    await page.getByRole("button", { name: "保存到本机收件箱" }).click();
    await page.getByText("没有本地匹配；线索会继续仅保存在本机。", { exact: true }).waitFor();
    const socialState = await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-social-leads") ?? "null"));
    assert.equal(socialState.version, 1, `${label} 社媒线索 envelope 版本错误`);
    assert.equal(socialState.leads.length, 2, `${label} 社媒线索保存数量错误`);
    assert.equal(socialState.leads.filter((lead) => lead.status === "matched").length, 1, `${label} 候选未由用户确认关联`);
    assert.equal(socialState.leads.some((lead) => lead.status === "inbox"), true, `${label} 未匹配线索没有留在收件箱`);
    assert.equal(JSON.stringify(socialState).includes("utm_"), false, `${label} 社媒 URL 仍含追踪参数`);
    assert.equal(JSON.stringify(socialState).includes("igshid"), false, `${label} Instagram 追踪参数仍被保存`);

    await page.goto(`${baseUrl}/artists/${ARTIST_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "关注", exact: true }).click();
    await page.waitForFunction((artistId) => JSON.parse(localStorage.getItem("ensei-follows") ?? "[]").includes(artistId), ARTIST_ID);
    await page.getByRole("button", { name: /已关注/u }).waitFor();

    const searchTrigger = page.getByRole("button", { name: "搜索", exact: true });
    await searchTrigger.click();
    const searchDialog = page.getByRole("dialog", { name: "全站搜索" });
    await searchDialog.waitFor();
    assert.equal(await searchDialog.getAttribute("aria-modal"), "true", `${label} 搜索未声明模态对话框`);
    const searchInput = page.getByPlaceholder(/艺人 \/ 场地 \/ 巡演名/u);
    await searchInput.fill(ARTIST_NAME);
    await page.locator(`[data-event-id="${EVENT_ID}"]`).waitFor({ state: "visible" });
    const activeBefore = await searchInput.getAttribute("aria-activedescendant");
    assert.ok(activeBefore, `${label} 搜索结果缺少活动项`);
    await searchInput.press("ArrowDown");
    const activeAfterDown = await searchInput.getAttribute("aria-activedescendant");
    assert.notEqual(activeAfterDown, activeBefore, `${label} ArrowDown 未移动搜索活动项`);
    await searchInput.press("ArrowUp");
    assert.equal(await searchInput.getAttribute("aria-activedescendant"), activeBefore, `${label} ArrowUp 未恢复搜索活动项`);
    await searchInput.press("Escape");
    assert.equal(await searchInput.count(), 0, `${label} 搜索对话框未关闭`);
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索");
    assert.equal(await searchTrigger.evaluate((element) => element === document.activeElement), true, `${label} 搜索关闭后未返回触发按钮`);
    await searchTrigger.click();
    await page.getByPlaceholder(/艺人 \/ 场地 \/ 巡演名/u).fill(EVENT_TITLE);
    const eventResult = page.locator(`[data-event-id="${EVENT_ID}"]`);
    await eventResult.waitFor({ state: "visible" });
    await eventResult.click();
    await page.waitForURL(`**/events/${EVENT_ID}`);
    await page.getByRole("heading", { name: EVENT_TITLE }).waitFor();
    assert.ok(await page.getByText("受付开始（JST）", { exact: true }).count() > 0, `${label} 官方票务时间未标记 JST`);

    const addPlan = page.getByRole("button", { name: "加入计划", exact: true });
    await assertNotCoveredByBottomNav(page, addPlan, `${label} 加入计划按钮`);
    await addPlan.click();
    await page.getByText("已加入计划", { exact: true }).first().waitFor();

    await page.getByRole("button", { name: "已申请此轮" }).click();
    await page.waitForFunction(() => {
      const plan = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0];
      return plan?.applications?.length === 1 && plan.applications[0].status === "applied" && Boolean(plan.applications[0].offerId);
    });
    await page.locator("#plan-manager > details > summary").click();
    await page.getByRole("button", { name: "新增个人申请记录" }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0]?.applications?.length === 2);

    let applicationCards = page.locator("[data-application-id]");
    let secondApplication = applicationCards.nth(1);
    await secondApplication.getByText("个人记录，未关联官方渠道", { exact: true }).waitFor();
    await secondApplication.getByText("申请详情与准备状态", { exact: true }).click();
    await secondApplication.getByLabel("申请名称").fill("个人第二轮");
    await secondApplication.getByLabel("申请私人备注").fill("密码：abc12345");
    await secondApplication.getByRole("button", { name: "保存申请详情" }).click();
    await secondApplication.getByRole("alert").getByText(/请勿填写密码/u).waitFor();
    assert.equal((await page.evaluate(() => localStorage.getItem("ensei-event-plans") ?? "")).includes("abc12345"), false, `${label} 敏感值被写入本地存储`);
    await secondApplication.getByLabel("申请私人备注").fill("仅本机普通测试备注");
    await secondApplication.getByLabel("申请实际票价（JPY）").fill("9800");
    await secondApplication.getByLabel("申请座位备注").fill("二层测试席");
    await secondApplication.getByLabel("账号别名").fill("测试小号");
    await secondApplication.getByLabel("准备状态：付款方式").selectOption("ready");
    await secondApplication.getByRole("button", { name: "保存申请详情" }).click();
    await page.locator("[data-application-id]").nth(1).getByText("个人第二轮", { exact: true }).waitFor();

    applicationCards = page.locator("[data-application-id]");
    secondApplication = applicationCards.nth(1);
    await secondApplication.getByRole("button", { name: "标记已申请" }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0]?.applications?.[1]?.status === "applied");

    await page.getByText("管理演出级计划与个人任务", { exact: true }).click();
    const wall = shanghaiWallTime();
    await page.getByLabel("个人任务日期").fill(wall.date);
    await page.getByLabel("个人任务时间").fill(wall.time);
    await page.getByLabel("个人任务内容").fill("Goal 7C 同日任务");
    await page.getByLabel("任务关联申请").selectOption({ label: "个人第二轮" });
    await page.getByRole("button", { name: "添加个人任务" }).click();
    await page.waitForFunction(() => {
      const task = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0]?.manualTasks?.[0];
      return task?.timeZone === "Asia/Shanghai" && Boolean(task?.dueAt) && Boolean(task?.linkedApplicationId);
    });

    await page.goto(`${baseUrl}/me`, { waitUntil: "networkidle" });
    await page.getByText(EVENT_TITLE, { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("heading", { name: "行动中心" }).count(), 0, `${label} “我的”重复出现行动中心`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("heading", { name: "行动中心" }).count(), 1, `${label} 首页行动中心数量不为 1`);
    await page.locator('[aria-labelledby="action-group-overdue"]').getByText("Goal 7C 同日任务", { exact: true }).waitFor();
    assert.ok(await page.getByText(/Asia\/Shanghai/u).count() > 0, `${label} 个人截止未标记用户时区`);
    assert.ok(await page.getByText("等待结果公布", { exact: true }).count() >= 2, `${label} 两轮申请没有分别进入时间未公布组`);
    assert.ok(await page.getByRole("heading", { name: /时间未公布/u }).count() > 0, `${label} 行动中心缺少时间未公布分组`);
    const applicationJson = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null").plans[0].applications));
    assert.equal(/resultAt|paymentDeadline|ticketedAt/u.test(applicationJson), false, `${label} 未知官方时间被复制进个人申请`);
    const deadlineState = await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null").plans[0].manualTasks[0]);
    await page.goto(`${baseUrl}/me`, { waitUntil: "networkidle" });
    const [deadlineDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出个人截止" }).click(),
    ]);
    const deadlinePath = await deadlineDownload.path();
    assert.ok(deadlinePath, `${label} 个人截止 ICS 下载路径不可用`);
    const deadlineIcs = await readFile(deadlinePath, "utf8");
    const unfoldedDeadlineIcs = deadlineIcs.replaceAll("\r\n ", "");
    const expectedDue = deadlineState.dueAt.replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
    assert.match(unfoldedDeadlineIcs, new RegExp(`DUE:${expectedDue}`, "u"), `${label} ICS 未保持个人截止的绝对时刻`);
    assert.match(unfoldedDeadlineIcs, /Asia\/Shanghai/u, `${label} ICS 未记录个人截止时区语义`);

    await page.goto(`${baseUrl}/events/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.locator("#plan-manager > details > summary").click();
    applicationCards = page.locator("[data-application-id]");
    await applicationCards.nth(0).getByRole("button", { name: "记录落选" }).click();
    await applicationCards.nth(1).getByRole("button", { name: "记录中签" }).click();
    await page.waitForFunction(() => {
      const applications = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0]?.applications ?? [];
      return applications.length === 2 && applications[0].status === "lost" && applications[1].status === "won";
    });
    const summaryAfterResult = await page.getByTestId("application-summary").innerText();
    assert.match(summaryAfterResult, /已申请 2 轮/u);
    assert.match(summaryAfterResult, /中签 1 轮/u);
    await page.reload({ waitUntil: "networkidle" });
    const afterApplicationRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null").plans[0].applications);
    assert.deepEqual(afterApplicationRefresh.map((item) => item.status), ["lost", "won"], `${label} 刷新后两轮申请历史不一致`);
    await page.locator("#plan-manager > details > summary").click();
    applicationCards = page.locator("[data-application-id]");
    await applicationCards.nth(1).getByRole("button", { name: "标记已付款" }).click();
    await applicationCards.nth(1).getByRole("button", { name: "标记已出票" }).click();
    await page.waitForFunction(() => {
      const applications = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans?.[0]?.applications ?? [];
      return applications[0]?.status === "lost" && applications[1]?.status === "ticketed";
    });
    const summaryAfterTicketed = await page.getByTestId("application-summary").innerText();
    assert.match(summaryAfterTicketed, /付款 是 · 出票 是/u);

    const tripName = `${ARTIST_NAME} 09/04 远征`;
    const quickTripButton = applicationCards.nth(1).getByRole("button", { name: "创建远征并进入" });
    await quickTripButton.waitFor();
    await quickTripButton.click();
    await page.waitForURL("**/trips/**");
    await page.getByRole("heading", { name: tripName }).waitFor();

    await page.getByLabel("交通段类型").selectOption("train");
    await page.getByLabel("交通段状态").selectOption("confirmed");
    await page.getByLabel("交通段出发地").fill("Zepp Shinjuku");
    await page.getByLabel("交通段到达地").fill("羽田机场");
    await page.getByLabel("交通段出发时间").fill("2026-09-04T19:00");
    await page.getByLabel("交通段到达时间").fill("2026-09-04T20:00");
    await page.getByLabel("交通段时长").fill("60");
    await page.getByLabel("交通段参考链接").fill("https://example.com/train/001");
    await page.getByRole("button", { name: "添加交通段" }).click();
    await page.getByText("交通出发早于演出结束", { exact: true }).waitFor();
    await page.getByText("个人确认", { exact: true }).first().waitFor();
    const tripEnvelope = await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-trip-plans") ?? "null"));
    assert.equal(tripEnvelope.version, 2, `${label} 远征 envelope 未迁移到 schema v2`);
    assert.equal(tripEnvelope.trips[0].travelLegs[0].status, "confirmed", `${label} 交通段确认状态未保存`);

    const [tripJsonDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON" }).click()]);
    const tripJsonPath = await tripJsonDownload.path();
    assert.ok(tripJsonPath, `${label} 远征 JSON 下载失败`);
    const tripJson = JSON.parse(await readFile(tripJsonPath, "utf8"));
    assert.equal(tripJson.version, 2);
    assert.equal(tripJson.trip.travelLegs[0].referenceUrl, "https://example.com/train/001");
    const [tripIcsDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ICS" }).click()]);
    const tripIcsPath = await tripIcsDownload.path();
    assert.ok(tripIcsPath, `${label} 远征 ICS 下载失败`);
    const tripIcs = (await readFile(tripIcsPath, "utf8")).replaceAll("\r\n ", "");
    assert.match(tripIcs, /列车 · Zepp Shinjuku → 羽田机场/u, `${label} ICS 未包含交通段`);
    assert.match(tripIcs, /个人确认/u, `${label} ICS 未保留交通段状态`);
    const printButton = page.getByRole("button", { name: "打印" });
    await printButton.waitFor();
    await page.emulateMedia({ media: "print" });
    assert.equal(await printButton.isVisible(), false, `${label} 打印视图仍显示操作按钮`);
    assert.equal(await page.locator("[data-travel-leg-id]").first().isVisible(), true, `${label} 打印视图遗漏交通段`);
    await page.emulateMedia({ media: "screen" });

    await page.getByRole("link", { name: "演出日模式" }).click();
    await page.waitForURL("**/trips/**/day");
    await page.getByRole("heading", { name: "演出日模式" }).waitFor();
    await page.getByLabel("Now Next 倒计时").waitFor();
    await page.getByText("已出票", { exact: true }).waitFor();
    await page.getByText("Zepp Shinjuku(TOKYO)", { exact: true }).waitFor();
    await page.getByText("平台／通用建议", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "标记完成：手机电量与充电设备（通用准备建议）" }).click();
    await page.waitForFunction((eventId) => {
      const trip = JSON.parse(localStorage.getItem("ensei-trip-plans") ?? "null")?.trips?.[0];
      return trip?.checklist?.some((item) => item.eventId === eventId && item.source === "platform_advice" && item.done);
    }, EVENT_ID);
    await assertNoHorizontalOverflow(page, `${label} 演出日模式`);
    await page.getByRole("link", { name: "返回远征详情" }).click();
    await page.waitForURL(/\/trips\/[^/]+$/u);

    await page.getByLabel("预算：票款").fill("12300");
    const checkLabel = `确认 ${label} 测试材料`;
    await page.getByPlaceholder("新增检查事项").fill(checkLabel);
    await page.getByRole("button", { name: "添加检查事项" }).click();
    await page.getByRole("button", { name: `标记完成：${checkLabel}` }).click();
    await page.waitForFunction(({ eventId, checkLabelValue }) => {
      const trips = JSON.parse(localStorage.getItem("ensei-trip-plans") ?? "null")?.trips ?? [];
      return trips[0]?.eventIds?.includes(eventId)
        && trips[0]?.budgetItems?.some((item) => item.category === "ticket" && item.amountJpy === 12300)
        && trips[0]?.checklist?.some((item) => item.label === checkLabelValue && item.done);
    }, { eventId: EVENT_ID, checkLabelValue: checkLabel });

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: tripName }).waitFor();
    assert.equal(await page.getByLabel("预算：票款").inputValue(), "12300", `${label} 刷新后预算丢失`);
    await page.getByRole("button", { name: `取消完成：${checkLabel}` }).waitFor();

    await page.goto(`${baseUrl}/me`, { waitUntil: "networkidle" });
    await assertNoHorizontalOverflow(page, `${label} /me`);
    const exportButton = page.getByRole("button", { name: "导出备份 JSON" });
    await assertNotCoveredByBottomNav(page, exportButton, `${label} 导出按钮`);
    const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
    const downloadPath = await download.path();
    assert.ok(downloadPath, `${label} 备份下载路径不可用`);
    const backupBuffer = await readFile(downloadPath);
    const backup = JSON.parse(backupBuffer.toString("utf8"));
    assert.equal(backup.version, 5, `${label} 备份版本不是 v5`);
    assert.equal(backup.preferences.homePrefecture, "tokyo");
    assert.equal(backup.plans[0].eventId, EVENT_ID);
    assert.equal(backup.plans[0].applications.length, 2);
    assert.deepEqual(backup.plans[0].applications.map((item) => item.status), ["lost", "ticketed"]);
    assert.equal(backup.plans[0].manualTasks.length, 1);
    assert.equal(Object.hasOwn(backup.plans[0], "ticketStatus"), false, `${label} v5 备份仍包含 Event 级 ticketStatus`);
    assert.equal(JSON.stringify(backup).includes("abc12345"), false, `${label} 敏感值进入备份`);
    assert.ok(backup.follows.includes(ARTIST_ID));
    assert.ok(backup.trips[0].eventIds.includes(EVENT_ID));
    assert.equal(backup.trips[0].travelLegs[0].status, "confirmed");
    assert.equal(backup.trips[0].checklist.some((item) => item.source === "platform_advice" && item.eventId === EVENT_ID), true);
    assert.equal(backup.socialLeads.length, 2);
    assert.equal(backup.socialLeads.filter((lead) => lead.status === "matched").length, 1);
    assert.equal(JSON.stringify(backup.socialLeads).includes("utm_"), false, `${label} 备份包含社媒追踪参数`);
    assert.deepEqual(backup.wants, [EVENT_ID]);

    const beforeClear = await storageSnapshot(page);
    assert.equal(beforeClear["ensei-event-plans"].version, 2, `${label} 本地计划 envelope 未升级到 schema v2`);
    assert.equal(beforeClear["ensei-trip-plans"].version, 2, `${label} 本地远征 envelope 未升级到 schema v2`);
    const clearButton = page.getByRole("button", { name: "清空本机计划" });
    await clearButton.click();
    await page.getByRole("button", { name: "再点一次确认清空" }).click();
    await page.getByRole("status").getByText(/已清空本机偏好/u).waitFor();
    const cleared = await storageSnapshot(page);
    assert.equal(cleared["ensei-user-preferences"].setupStatus, "pending");
    assert.deepEqual(cleared["ensei-event-plans"].plans, []);
    assert.deepEqual(cleared["ensei-follows"], []);
    assert.deepEqual(cleared["ensei-trip-plans"].trips, []);
    assert.deepEqual(cleared["ensei-social-leads"].leads, []);

    await page.getByLabel("导入备份文件").setInputFiles({
      name: "ensei-backup.json",
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    await page.getByRole("status").getByText(/恢复完成/u).waitFor();
    const restored = await storageSnapshot(page);
    assert.deepEqual(restored, beforeClear, `${label} JSON 恢复后个人数据不完整`);
    assert.ok(await page.getByText(ARTIST_NAME, { exact: true }).count() > 0, `${label} 关注艺人未恢复到页面`);

    const mixed = Buffer.from(JSON.stringify({
      ...backup,
      plans: [
        { ...backup.plans[0], applications: [...backup.plans[0].applications, { id: "bad-application" }] },
        { eventId: "evt_missing" },
      ],
      follows: [...backup.follows, "artist_missing"],
      trips: [...backup.trips, { id: "bad-trip", name: "坏数据", startDate: "nope" }],
      socialLeads: [...backup.socialLeads, { ...backup.socialLeads[0], id: "bad-lead", status: "matched", matchedEventId: "evt_missing" }],
    }));
    await page.getByLabel("导入备份文件").setInputFiles({ name: "mixed.json", mimeType: "application/json", buffer: mixed });
    await page.getByRole("status").getByText(/忽略 5 条/u).waitFor();
    assert.deepEqual(await storageSnapshot(page), restored, `${label} 混合备份未做到忽略单条坏记录并恢复有效记录`);

    const nestedCorrupted = Buffer.from(JSON.stringify({
      ...backup,
      plans: [{
        ...backup.plans[0],
        applications: [{ id: "bad-only-application" }],
        manualTasks: [{ id: "bad-only-task" }],
      }],
    }));
    const beforeNestedCorrupt = await storageSnapshot(page);
    await page.getByLabel("导入备份文件").setInputFiles({ name: "nested-corrupted.json", mimeType: "application/json", buffer: nestedCorrupted });
    await page.getByRole("status").getByText(/非空数据段没有任何有效记录/u).waitFor();
    assert.deepEqual(await storageSnapshot(page), beforeNestedCorrupt, `${label} 全无效 applications/manualTasks 清空了当前计划`);

    const corrupted = Buffer.from(JSON.stringify({
      app: "ensei-techo",
      version: 4,
      preferences: { version: 1, setupStatus: "broken", currency: "BTC", timeZone: "Mars/Base", updatedAt: "nope" },
      plans: [{ eventId: "evt_missing" }],
      follows: ["artist_missing"],
      trips: [{ id: "bad-trip", name: "坏数据", startDate: "nope" }],
      wants: ["evt_missing"],
    }));
    const beforeCorrupt = await storageSnapshot(page);
    await page.getByLabel("导入备份文件").setInputFiles({ name: "corrupted.json", mimeType: "application/json", buffer: corrupted });
    await page.getByRole("status").getByText(/当前本机状态未改变/u).waitFor();
    assert.deepEqual(await storageSnapshot(page), beforeCorrupt, `${label} 损坏备份清空或改写了有效数据`);

    const legacy = Buffer.from(JSON.stringify({ app: "ensei-techo", version: 1, wants: [EVENT_ID], follows: [ARTIST_ID] }));
    await page.getByLabel("导入备份文件").setInputFiles({ name: "legacy-v1.json", mimeType: "application/json", buffer: legacy });
    await page.getByRole("status").getByText(/计划 1 场/u).waitFor();
    await page.waitForFunction((eventId) => {
      const plans = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans ?? [];
      return plans.length === 1 && plans[0].eventId === eventId && plans[0].intent === "interested"
        && plans[0].applications.length === 0 && plans[0].manualTasks.length === 0;
    }, EVENT_ID);

    const legacyV1Plan = {
      eventId: EVENT_ID,
      intent: "committed",
      ticketStatus: "paid",
      tripStatus: "planning",
      manualDeadline: {
        at: "2026-09-01T12:30",
        label: "旧版付款截止",
        timeZone: "Asia/Shanghai",
        instantAt: "2026-09-01T04:30:00.000Z",
      },
      actualPriceJpy: 7777,
      seatNote: "旧版座位备注",
      privateNote: "旧版私人备注",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const legacyBackupV3 = Buffer.from(JSON.stringify({
      app: "ensei-techo",
      version: 3,
      plans: [legacyV1Plan],
      follows: [ARTIST_ID],
      trips: [],
      wants: [EVENT_ID],
    }));
    await page.getByLabel("导入备份文件").setInputFiles({ name: "legacy-v3.json", mimeType: "application/json", buffer: legacyBackupV3 });
    await page.waitForFunction((eventId) => {
      const envelope = JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null");
      return envelope?.version === 2
        && envelope.plans?.[0]?.eventId === eventId
        && envelope.plans[0].applications?.[0]?.status === "paid"
        && envelope.plans[0].manualTasks?.[0]?.label === "旧版付款截止";
    }, EVENT_ID);

    const legacyTrip = structuredClone(backup.trips[0]);
    delete legacyTrip.travelLegs;
    const legacyTripEnvelope = JSON.stringify({ version: 1, trips: [legacyTrip] });
    await page.evaluate(({ raw }) => {
      localStorage.setItem("ensei-trip-plans", raw);
      localStorage.removeItem("ensei-trip-plans-migrated-v2");
      localStorage.removeItem("ensei-trip-plans-v1-backup");
    }, { raw: legacyTripEnvelope });
    await page.goto(`${baseUrl}/trips/${legacyTrip.id}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("ensei-trip-plans") ?? "null")?.version === 2);
    const migratedTrip = await page.evaluate(() => ({
      backup: localStorage.getItem("ensei-trip-plans-v1-backup"),
      envelope: JSON.parse(localStorage.getItem("ensei-trip-plans") ?? "null"),
    }));
    assert.equal(migratedTrip.backup, legacyTripEnvelope, `${label} 远征 v1 原文未保留回滚备份`);
    assert.deepEqual(migratedTrip.envelope.trips[0].travelLegs, [], `${label} 远征 v1 未确定迁移为空交通段`);

    const legacyEnvelope = JSON.stringify({ version: 1, plans: [legacyV1Plan] });
    await page.evaluate(({ raw, eventId }) => {
      localStorage.setItem("ensei-event-plans", raw);
      localStorage.setItem("ensei-wants", JSON.stringify([eventId]));
      localStorage.removeItem("ensei-event-plans-migrated-v2");
      localStorage.removeItem("ensei-event-plans-v1-backup");
    }, { raw: legacyEnvelope, eventId: EVENT_ID });
    await page.goto(`${baseUrl}/events/${EVENT_ID}`, { waitUntil: "networkidle" });
    const migratedOnce = await page.evaluate(() => ({
      raw: localStorage.getItem("ensei-event-plans"),
      backup: localStorage.getItem("ensei-event-plans-v1-backup"),
      envelope: JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null"),
    }));
    assert.equal(migratedOnce.backup, legacyEnvelope, `${label} v1 原始计划未保留备份`);
    assert.equal(migratedOnce.envelope.version, 2);
    assert.deepEqual(migratedOnce.envelope.plans[0].applications[0], {
      id: `application-v1-${EVENT_ID}`,
      eventId: EVENT_ID,
      label: "旧版迁移记录",
      status: "paid",
      actualPriceJpy: 7777,
      seatNote: "旧版座位备注",
      privateNote: "旧版私人备注",
      readiness: {
        eligibility: "unknown", account: "unknown", phoneDevice: "unknown", ticketApp: "unknown",
        identityDocument: "unknown", payment: "unknown", companion: "unknown", distribution: "unknown",
      },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    assert.deepEqual(migratedOnce.envelope.plans[0].manualTasks[0], {
      id: `task-v1-${EVENT_ID}`,
      label: "旧版付款截止",
      dueAt: "2026-09-01T04:30:00.000Z",
      timeZone: "Asia/Shanghai",
      done: false,
      source: "manual",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.evaluate(() => localStorage.getItem("ensei-event-plans")), migratedOnce.raw, `${label} v1 迁移不幂等`);

    const legacyNotApplied = JSON.stringify({ version: 1, plans: [{
      ...legacyV1Plan,
      ticketStatus: "not_applied",
      manualDeadline: undefined,
      actualPriceJpy: undefined,
      seatNote: undefined,
      privateNote: undefined,
    }] });
    await page.evaluate(({ raw }) => {
      localStorage.setItem("ensei-event-plans", raw);
      localStorage.removeItem("ensei-event-plans-migrated-v2");
      localStorage.removeItem("ensei-event-plans-v1-backup");
    }, { raw: legacyNotApplied });
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null").plans[0].applications), [], `${label} v1 not_applied 被强制创建申请`);

    await page.locator("#plan-manager > details > summary").click();
    await page.getByRole("button", { name: "放弃整个计划" }).click();
    await page.getByRole("button", { name: "加入计划", exact: true }).waitFor();
    const finalPlans = await page.evaluate(() => JSON.parse(localStorage.getItem("ensei-event-plans") ?? "null")?.plans ?? []);
    assert.deepEqual(finalPlans, [], `${label} 删除计划失败`);
    await assertNoHorizontalOverflow(page, `${label} 演出详情`);
    assert.deepEqual(errors, [], `${label} 未处理页面错误：${errors.join("；")}`);
  } finally {
    await context.close();
  }
}

let browser = null;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  await runFlow(browser, { width: 375, height: 812 }, "手机");
  await runFlow(browser, { width: 1440, height: 900 }, "桌面");
  console.log(`用户流程测试通过：固定 Event ${EVENT_ID} / Artist ${ARTIST_ID}；375×812 与 1440×900 的社媒匹配/未匹配、独立申请、远征 v2 交通段/冲突/演出日、v1 迁移及 v5 备份恢复正常。`);
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolveWait) => server.once("exit", resolveWait));
  }
}
