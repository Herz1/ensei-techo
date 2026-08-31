import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const baseUrl = process.env.UI_QUALITY_TEST_URL ?? "http://127.0.0.1:3732";
const testPort = new URL(baseUrl).port || "3732";
const EVENT_ID = "evt_e912cb05373a12af9141c910";
const EVENT_TITLE = "森本爵ONEMANLIVE ～Palindrome～";
const SEARCH_QUERY = "森本爵";
const TRIP_ID = "trip-goal-7d-smoke";
const TRIP_NAME = "Goal 7D 视口检查远征";

const events = JSON.parse(await readFile(resolve(ROOT, "src/data/events.json"), "utf8"));
assert.equal(events.find((event) => event.id === EVENT_ID)?.titleJa, EVENT_TITLE, "固定 Event ID 已变化");

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
    throw new Error("缺少生产构建；请先运行 npm run build，再执行 npm run test:ui-quality");
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

const NOW = "2026-08-31T04:00:00.000Z";
const EMPTY_READINESS = {
  eligibility: "unknown",
  account: "unknown",
  phoneDevice: "unknown",
  ticketApp: "unknown",
  identityDocument: "unknown",
  payment: "unknown",
  companion: "unknown",
  distribution: "unknown",
};
const seed = {
  preferences: {
    version: 1,
    setupStatus: "completed",
    homePrefecture: "tokyo",
    origin: "上海虹桥",
    currency: "USD",
    timeZone: "Asia/Shanghai",
    updatedAt: NOW,
  },
  plans: {
    version: 2,
    plans: [{
      eventId: EVENT_ID,
      intent: "committed",
      tripStatus: "planning",
      applications: [{
        id: "application-goal-7d-smoke",
        eventId: EVENT_ID,
        label: "视口检查申请",
        provider: "其他官方渠道",
        status: "applied",
        readiness: EMPTY_READINESS,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      manualTasks: [],
      createdAt: NOW,
      updatedAt: NOW,
    }],
  },
  trips: {
    version: 1,
    trips: [{
      id: TRIP_ID,
      name: TRIP_NAME,
      startDate: "2026-09-04",
      endDate: "2026-09-05",
      origin: "上海虹桥",
      eventIds: [EVENT_ID],
      budgetItems: [{ id: "budget-ticket", category: "ticket", label: "票款", amountJpy: 20000 }],
      checklist: [{ id: "check-smoke", label: "确认电子票", done: false }],
      customItems: [{ id: "custom-smoke", date: "2026-09-04", time: "14:00", label: "抵达新宿", kind: "transport" }],
      eventEndOverrides: {},
      bufferMinutes: 90,
      ignoredConflictKeys: [],
      createdAt: NOW,
      updatedAt: NOW,
    }],
  },
};

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 1, `${label} 横向溢出：${dimensions.scrollWidth} > ${dimensions.innerWidth}`);
}

async function gotoAndCheck(page, path, label) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await assertNoHorizontalOverflow(page, label);
}

async function runViewport(browser, viewport, label) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ seeded, eventId }) => {
    localStorage.setItem("ensei-user-preferences", JSON.stringify(seeded.preferences));
    localStorage.setItem("ensei-event-plans", JSON.stringify(seeded.plans));
    localStorage.setItem("ensei-event-plans-migrated-v2", "true");
    localStorage.setItem("ensei-trip-plans", JSON.stringify(seeded.trips));
    localStorage.setItem("ensei-follows", "[]");
    localStorage.setItem("ensei-wants", JSON.stringify([eventId]));
  }, { seeded: seed, eventId: EVENT_ID });
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
    await gotoAndCheck(page, "/", `${label} 首页`);
    assert.equal(await page.getByRole("heading", { name: "行动中心" }).count(), 1, `${label} 首页行动中心不唯一`);
    await page.getByRole("heading", { name: "先完成眼前的动作" }).waitFor();
    await page.getByText(TRIP_NAME, { exact: true }).waitFor();

    await gotoAndCheck(page, "/events", `${label} 公演列表`);
    if (viewport.width < 768) {
      assert.equal(await page.getByRole("dialog", { name: "筛选与排序" }).count(), 0, `${label} 手机筛选默认展开`);
      await page.getByRole("button", { name: /筛选/u }).click();
      const filterDialog = page.getByRole("dialog", { name: "筛选与排序" });
      await filterDialog.waitFor();
      await filterDialog.getByLabel("开始日期").waitFor();
      await page.getByRole("button", { name: "关闭筛选" }).click();
    } else {
      await page.getByLabel("开始日期").waitFor();
    }

    await gotoAndCheck(page, `/events/${EVENT_ID}`, `${label} 公演详情`);
    await page.getByRole("heading", { name: EVENT_TITLE }).waitFor();
    await page.getByText("最重要的下一步", { exact: true }).waitFor();
    await page.getByText("最近核验", { exact: true }).waitFor();
    await page.getByText("本场明确要求 · 官方页", { exact: true }).first().waitFor();
    await page.getByText("平台准备建议 · 非本场明确要求", { exact: true }).first().waitFor();
    assert.ok(await page.getByText(/Asia\/Shanghai/u).count() > 0, `${label} 官方票务时间未显示用户本地时区`);
    assert.ok(await page.getByText(/参考/u).count() > 0, `${label} 未显示 USD 参考价说明`);

    await gotoAndCheck(page, "/me", `${label} 我的`);
    await page.getByRole("heading", { name: /^我的/u }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "行动中心" }).count(), 0, `${label} 我的页重复行动中心`);
    await page.getByRole("heading", { name: "偏好设置" }).waitFor();
    await page.getByRole("heading", { name: "数据管理" }).waitFor();

    await gotoAndCheck(page, `/trips/${TRIP_ID}`, `${label} 远征详情`);
    await page.getByRole("heading", { name: TRIP_NAME }).waitFor();
    await page.getByText("下一项行程", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "冲突检查" }).waitFor();

    const searchTrigger = page.getByRole("button", { name: "搜索", exact: true });
    await searchTrigger.click();
    const dialog = page.getByRole("dialog", { name: "全站搜索" });
    await dialog.waitFor();
    const input = page.getByLabel("搜索艺人、场地或演出");
    await input.fill(SEARCH_QUERY);
    await page.locator(`[data-event-id="${EVENT_ID}"]`).waitFor();
    const activeBefore = await input.getAttribute("aria-activedescendant");
    assert.ok(activeBefore, `${label} 搜索缺少活动项`);
    await input.press("ArrowDown");
    assert.notEqual(await input.getAttribute("aria-activedescendant"), activeBefore, `${label} 搜索 ArrowDown 无效`);
    await input.press("Escape");
    assert.equal(await dialog.count(), 0, `${label} Escape 未关闭搜索`);
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索");
    assert.equal(await searchTrigger.evaluate((element) => element === document.activeElement), true, `${label} 搜索焦点未返回`);
    await assertNoHorizontalOverflow(page, `${label} 搜索关闭后`);

    assert.deepEqual(errors, [], `${label} 未处理页面错误：${errors.join("；")}`);
  } finally {
    await context.close();
  }
}

let browser = null;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  await runViewport(browser, { width: 375, height: 812 }, "375px");
  await runViewport(browser, { width: 768, height: 900 }, "768px");
  await runViewport(browser, { width: 1440, height: 900 }, "1440px");
  console.log("UI 质量测试通过：375 / 768 / 1440 三档视口覆盖首页、公演列表、公演详情、我的、远征详情与搜索。");
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolveWait) => server.once("exit", resolveWait));
  }
}
