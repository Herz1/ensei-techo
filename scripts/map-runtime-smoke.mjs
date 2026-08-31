import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { EMPTY_MAP_GLYPHS, OFFLINE_TILE_PNG } from "./browser-fixtures.mjs";

const mapUrl = process.env.MAP_TEST_URL ?? "http://127.0.0.1:3720/map";
const mapOrigin = new URL(mapUrl).origin;
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
if (!executablePath) {
  throw new Error(
    "未找到 Chrome/Edge。可通过 CHROME_PATH 指定浏览器可执行文件。",
  );
}

try {
  const response = await fetch(mapUrl);
  assert.equal(
    response.ok,
    true,
    `地图页不可用：${response.status} ${response.statusText}`,
  );
} catch (error) {
  throw new Error(
    `无法访问 ${mapUrl}。请先启动远征手账服务器。\n${error.message}`,
  );
}

const venues = JSON.parse(
  await readFile(new URL("../src/data/venues.json", import.meta.url), "utf8"),
);
const targetVenue =
  venues.find((venue) => venue.id === "ajinomoto-stadium") ?? venues[0];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl"],
});

async function installOfflineRoutes(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === mapOrigin || ["data:", "blob:"].includes(url.protocol)) {
      await route.continue();
    } else if (url.pathname.endsWith(".png")) {
      await route.fulfill({ status: 200, contentType: "image/png", body: OFFLINE_TILE_PNG });
    } else if (url.pathname.endsWith(".pbf")) {
      await route.fulfill({ status: 200, contentType: "application/x-protobuf", body: EMPTY_MAP_GLYPHS });
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await installOfflineRoutes(page);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
  const status = page.getByTestId("map-runtime-status");
  await status.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const element = document.querySelector(
      '[data-testid="map-runtime-status"]',
    );
    return (
      element?.getAttribute("data-map-ready") === "true" &&
      Number(element.getAttribute("data-heat-rendered")) > 0 &&
      Number(element.getAttribute("data-venue-rendered")) > 0
    );
  });

  const mapFailure = page.getByRole("alert").filter({ hasText: "地图图层加载失败" });
  const mapFailureText = await mapFailure.count() ? await mapFailure.innerText() : "";
  assert.equal(
    await page.getByText("地图图层加载失败", { exact: true }).count(),
    0,
    `页面显示地图图层加载错误：${mapFailureText}`,
  );

  const firstRender = await status.evaluate((element) => ({
    heat: Number(element.getAttribute("data-heat-rendered")),
    venues: Number(element.getAttribute("data-venue-rendered")),
  }));
  assert.ok(firstRender.heat > 0, "未渲染任何都道府县热度区域");
  assert.ok(firstRender.venues > 0, "未渲染任何场馆或聚合点");

  const viewportCoverage = await page.evaluate(() => {
    const map = window.__enseiMap;
    const canvas = map.getCanvas();
    const hokkaido = map.project([143.5, 43.8]);
    const okinawa = map.project([127.8, 26.3]);
    const visible = (point) =>
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= canvas.clientWidth &&
      point.y <= canvas.clientHeight;
    return {
      hokkaido: visible(hokkaido),
      okinawa: visible(okinawa),
    };
  });
  assert.equal(viewportCoverage.hokkaido, true, "初始视野未覆盖北海道");
  assert.equal(viewportCoverage.okinawa, true, "初始视野未覆盖冲绳");

  const heatButton = page.getByRole("button", {
    name: "热力图层",
    exact: true,
  });
  const venueButton = page.getByRole("button", {
    name: "场地图层",
    exact: true,
  });
  assert.equal(await heatButton.isEnabled(), true, "热力图层按钮未就绪");
  assert.equal(await venueButton.isEnabled(), true, "场地图层按钮未就绪");
  await heatButton.click();
  assert.equal(
    await page.evaluate(
      () => window.__enseiMap.getLayoutProperty("pref-fill", "visibility"),
    ),
    "none",
    "热力图层按钮未隐藏 pref-fill",
  );
  await heatButton.click();
  await page.waitForFunction(
    () =>
      window.__enseiMap.getLayoutProperty("pref-fill", "visibility") ===
      "visible",
  );
  await venueButton.click();
  assert.equal(
    await page.evaluate(
      () => window.__enseiMap.getLayoutProperty("clusters", "visibility"),
    ),
    "none",
    "场地图层按钮未隐藏 clusters",
  );
  await venueButton.click();
  await page.waitForFunction(
    () =>
      window.__enseiMap.getLayoutProperty("clusters", "visibility") ===
      "visible",
  );
  await page.waitForFunction(
    () =>
      window.__enseiMap.queryRenderedFeatures({ layers: ["clusters"] }).length >
      0,
  );

  const canvasBox = await page.locator(".maplibregl-canvas").boundingBox();
  assert.ok(canvasBox, "找不到地图画布");

  const cluster = await page.evaluate(() => {
    const map = window.__enseiMap;
    const feature = map.queryRenderedFeatures({ layers: ["clusters"] })[0];
    if (!feature) return null;
    const point = map.project(feature.geometry.coordinates);
    return { x: point.x, y: point.y, zoom: map.getZoom() };
  });
  assert.ok(cluster, "初始视野没有可点击的场馆聚合点");
  await page.mouse.click(canvasBox.x + cluster.x, canvasBox.y + cluster.y);
  await page.waitForFunction(
    (zoom) => !window.__enseiMap.isMoving() && window.__enseiMap.getZoom() > zoom,
    cluster.zoom,
  );

  await page.evaluate(({ lng, lat }) => {
    window.__enseiMap.jumpTo({
      center: [lng, lat],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  }, targetVenue);
  await page.waitForFunction(
    (venueId) =>
      window.__enseiMap
        .queryRenderedFeatures({ layers: ["venue-pt"] })
        .some((feature) => feature.properties.id === venueId),
    targetVenue.id,
  );

  const venuePoint = await page.evaluate((venueId) => {
    const map = window.__enseiMap;
    const feature = map
      .queryRenderedFeatures({ layers: ["venue-pt"] })
      .find((item) => item.properties.id === venueId);
    const point = map.project(feature.geometry.coordinates);
    return { x: point.x, y: point.y };
  }, targetVenue.id);
  await page.mouse.move(
    canvasBox.x + venuePoint.x,
    canvasBox.y + venuePoint.y,
  );
  await page.getByText(targetVenue.nameJa, { exact: true }).first().waitFor({
    state: "visible",
  });
  await page.mouse.click(
    canvasBox.x + venuePoint.x,
    canvasBox.y + venuePoint.y,
  );
  await page.getByRole("complementary").waitFor({ state: "visible" });
  assert.equal(
    await status.getAttribute("data-selected-venue"),
    targetVenue.id,
    "点击场馆后没有选中对应场馆",
  );
  await page.getByRole("button", { name: "关闭场馆面板", exact: true }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="map-runtime-status"]')
        ?.getAttribute("data-map-ready") === "true",
  );
  const prefectureCanvasBox = await page
    .locator(".maplibregl-canvas")
    .boundingBox();
  assert.ok(prefectureCanvasBox, "重新加载后找不到地图画布");
  await page.waitForFunction(() => {
    const map = window.__enseiMap;
    const point = map.project([143.5, 43.8]);
    return map.queryRenderedFeatures(point, { layers: ["pref-fill"] }).length > 0;
  });
  const prefectureClick = await page.evaluate(() => {
    const map = window.__enseiMap;
    const point = map.project([143.5, 43.8]);
    const hit = map.queryRenderedFeatures(point, { layers: ["pref-fill"] });
    return { x: point.x, y: point.y, hit: hit.length, zoom: map.getZoom() };
  });
  assert.ok(prefectureClick.hit > 0, "北海道测试坐标未命中 pref-fill");
  await page.locator(".maplibregl-canvas").click({
    position: { x: prefectureClick.x, y: prefectureClick.y },
  });
  await page.waitForFunction(
    (zoom) => !window.__enseiMap.isMoving() && window.__enseiMap.getZoom() > zoom,
    prefectureClick.zoom,
  );
  assert.ok(
    await page.evaluate(() => window.__enseiMap.getZoom() >= 8),
    "点击都道府县后没有放大地图",
  );

  assert.deepEqual(pageErrors, [], `页面脚本错误：${pageErrors.join("; ")}`);

  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await installOfflineRoutes(mobilePage);
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  await mobilePage.goto(mapUrl, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForFunction(() => {
    const element = document.querySelector(
      '[data-testid="map-runtime-status"]',
    );
    return (
      element?.getAttribute("data-map-ready") === "true" &&
      Number(element.getAttribute("data-heat-rendered")) > 0 &&
      Number(element.getAttribute("data-venue-rendered")) > 0
    );
  });
  assert.equal(
    await mobilePage.getByText("地图图层加载失败", { exact: true }).count(),
    0,
    "移动端显示地图图层加载错误",
  );
  assert.deepEqual(
    mobileErrors,
    [],
    `移动端页面脚本错误：${mobileErrors.join("; ")}`,
  );
  await mobilePage.close();

  console.log(
    `地图运行时测试通过：桌面端 ${firstRender.heat} 个热度要素、${firstRender.venues} 个场馆/聚合要素，图层开关与四项交互正常；移动端渲染正常。`,
  );
} finally {
  await browser.close();
}
