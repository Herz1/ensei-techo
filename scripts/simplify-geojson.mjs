// 把 13MB 的全精度 japan.geojson 压缩为地图 choropleth 可用的轻量版
// 手段:坐标取 2 位小数去重 + 丢弃极小离岛环(保留每县最大环)
import { readFileSync, writeFileSync, statSync } from "node:fs";

const SRC = "public/data/japan.geojson";
const OUT = "public/data/japan-simplified.geojson";

const g = JSON.parse(readFileSync(SRC, "utf8"));

const round = (n) => Math.round(n * 100) / 100;

function simplifyRing(ring) {
  const out = [];
  for (const [lng, lat] of ring) {
    const p = [round(lng), round(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  // 闭合
  if (out.length >= 3) {
    const [f, l] = [out[0], out[out.length - 1]];
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  }
  return out.length >= 4 ? out : null;
}

function bboxArea(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

const MIN_AREA = 0.008; // 度²,过滤零碎离岛

for (const f of g.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const cleaned = [];
  let biggest = null;
  let biggestArea = -1;
  for (const poly of polys) {
    const outer = simplifyRing(poly[0]);
    if (!outer) continue;
    const area = bboxArea(outer);
    const p = [outer]; // 丢弃内环(湖泊等,choropleth 不需要)
    if (area > biggestArea) {
      biggestArea = area;
      biggest = p;
    }
    if (area >= MIN_AREA) cleaned.push(p);
  }
  if (cleaned.length === 0 && biggest) cleaned.push(biggest);
  f.geometry = { type: "MultiPolygon", coordinates: cleaned };
  f.properties = { id: f.properties.id, nameJa: f.properties.nam_ja };
}

writeFileSync(OUT, JSON.stringify(g), "utf8");
console.log("out size(KB):", Math.round(statSync(OUT).size / 1024));
console.log("features:", g.features.length);
