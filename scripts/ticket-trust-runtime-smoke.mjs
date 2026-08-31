import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.TICKET_TRUST_TEST_URL ?? "http://127.0.0.1:3720";
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

try {
  const response = await fetch(baseUrl);
  assert.equal(response.ok, true, `应用不可用：${response.status} ${response.statusText}`);
} catch (error) {
  throw new Error(`无法访问 ${baseUrl}。请先启动远征手账服务器。\n${error.message}`);
}

const events = JSON.parse(await readFile(new URL("../src/data/events.json", import.meta.url), "utf8"));
const offerEvent = events.find((event) => (event.ticketOffers ?? []).some((offer) => !["support", "refund"].includes(offer.urlKind)));
assert.ok(offerEvent, "正式数据中没有可用于页面验收的 TicketOffer");
const staleEvent = events.find((event) => (event.ticketOffers ?? []).some((offer) => {
  const verified = Date.parse(offer.lastVerifiedAt ?? "");
  return !Number.isFinite(verified) || Date.now() - verified > 30 * 86_400_000;
})) ?? offerEvent;
const channelSoldOutEvent = events.find((event) =>
  event.status !== "sold_out" && (event.ticketOffers ?? []).some((offer) => offer.inventoryStatus === "sold_out"),
);

const browser = await chromium.launch({ executablePath, headless: true });
const urlKindLabels = ["具体场次", "官方搜索页", "通用渠道页", "官方信息页"];

async function verifyTrustPage(page, event, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/events/${event.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "购票与抽选", exact: true }).waitFor({ state: "visible" });
  assert.ok(await page.getByText("官方渠道", { exact: true }).count() > 0, `${label} 未显示官方渠道标记`);
  assert.ok(
    await page.getByText(/最近核验|核验时间未记录/u).count() > 0,
    `${label} 未显示核验时间或缺失提示`,
  );
  const kindCount = await Promise.all(urlKindLabels.map((text) => page.getByText(text, { exact: true }).count()));
  assert.ok(kindCount.some((count) => count > 0), `${label} 未显示 URL 类型`);
  assert.ok(
    await page.getByText(/信息过旧不等于停售，受付结束不等于售罄/u).count() > 0,
    `${label} 未显示状态边界说明`,
  );
  assert.ok(
    await page.getByText(/跳转后请以官方页面当前显示为准/u).count() > 0,
    `${label} 未显示官方页面免责声明`,
  );
  assert.deepEqual(errors, [], `${label} 页面脚本错误：${errors.join("；")}`);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await verifyTrustPage(desktop, offerEvent, "1440px 桌面端");

  if (staleEvent) {
    await desktop.goto(`${baseUrl}/events/${staleEvent.id}`, { waitUntil: "domcontentloaded" });
    await desktop.getByText("信息可能过旧", { exact: true }).first().waitFor({ state: "visible" });
  }

  if (channelSoldOutEvent) {
    await desktop.goto(`${baseUrl}/events/${channelSoldOutEvent.id}`, { waitUntil: "domcontentloaded" });
    assert.equal(
      await desktop.locator("header").getByText("SOLD OUT", { exact: true }).count(),
      0,
      "单一渠道售罄被错误显示成整个 Event SOLD OUT",
    );
  }

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await verifyTrustPage(mobile, offerEvent, "375px 手机端");
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, "375px 手机端出现横向溢出");

  console.log(`Ticket trust 浏览器测试通过：桌面 1440px、手机 375px；事件 ${offerEvent.id}。`);
} finally {
  await browser.close();
}
