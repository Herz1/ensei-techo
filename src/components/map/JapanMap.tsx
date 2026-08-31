"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MLMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type AddLayerObject,
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { prefectures } from "@/data/prefectures";
import type { EventSummary, VenueSummary } from "@/lib/types";
import { todayJst } from "@/lib/time";
import VenuePanel from "./VenuePanel";

const TIER_COLOR: Record<string, string> = {
  dome: "#f43f5e",
  stadium: "#ef4444",
  arena: "#8b5cf6",
  hall: "#3b82f6",
  livehouse: "#10b981",
};

const TIER_RADIUS: Record<string, number> = {
  dome: 9,
  stadium: 9,
  arena: 7.5,
  hall: 6,
  livehouse: 5.5,
};

type MapIssue = {
  step: string;
  message: string;
};

type LayerStatus = {
  heatReady: boolean;
  pinsReady: boolean;
  heatRendered: number;
  venuesRendered: number;
};

const INITIAL_STATUS: LayerStatus = {
  heatReady: false,
  pinsReady: false,
  heatRendered: 0,
  venuesRendered: 0,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function JapanMap({
  eventIds,
  events,
  venues,
}: {
  eventIds?: string[];
  events: EventSummary[];
  venues: VenueSummary[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const issueKeysRef = useRef(new Set<string>());
  const [selected, setSelected] = useState<string | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<MapIssue[]>([]);
  const [layerStatus, setLayerStatus] = useState<LayerStatus>(INITIAL_STATUS);
  const eventIdsKey = eventIds ? `filtered:${eventIds.join("|")}` : "all";
  const venueById = useMemo(
    () => new Map(venues.map((venue) => [venue.id, venue])),
    [venues],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let disposed = false;
    let activeStep: string | null = "初始化底图";
    let renderTimeoutId: number | null = null;

    const reportIssue = (step: string, error: unknown) => {
      const message = errorMessage(error);
      const key = `${step}:${message}`;
      console.error(`[地图] ${step}: ${message}`, error);
      if (disposed || issueKeysRef.current.has(key)) return;
      issueKeysRef.current.add(key);
      setIssues((current) => [...current, { step, message }]);
    };

    setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

    const map = new MLMap({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          gsi: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "地理院タイル(国土地理院)",
          },
        },
        layers: [
          {
            id: "base",
            type: "raster",
            source: "gsi",
            paint: { "raster-saturation": -0.85, "raster-opacity": 0.75 },
          },
        ],
      },
      bounds: [
        [122.5, 24.0],
        [149.5, 46.2],
      ],
      fitBoundsOptions: { padding: 28 },
      minZoom: 4,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // 调试用句柄(demo 应用,保留无妨)
    (window as unknown as { __enseiMap?: MLMap }).__enseiMap = map;

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("error", (event) => {
      const sourceId =
        "sourceId" in event && typeof event.sourceId === "string"
          ? event.sourceId
          : null;
      reportIssue(
        activeStep ?? (sourceId ? `数据源 ${sourceId}` : "MapLibre 运行时"),
        event.error,
      );
    });

    map.on("load", async () => {
      const runSourceStep = (
        id: string,
        specification: GeoJSONSourceSpecification,
      ): boolean => {
        activeStep = `创建数据源 ${id}`;
        try {
          map.addSource(id, specification);
          if (!map.getSource(id)) {
            throw new Error(`数据源 ${id} 未注册`);
          }
          console.info(`[地图] 数据源 ${id} 已创建`);
          return true;
        } catch (error) {
          reportIssue(activeStep, error);
          return false;
        } finally {
          activeStep = null;
        }
      };

      const runLayerStep = (layer: AddLayerObject): boolean => {
        activeStep = `创建图层 ${layer.id}`;
        try {
          map.addLayer(layer);
          if (!map.getLayer(layer.id)) {
            throw new Error(`图层 ${layer.id} 未注册，可能未通过样式校验`);
          }
          map.moveLayer(layer.id);
          const visibility =
            map.getLayoutProperty(layer.id, "visibility") ?? "visible";
          if (visibility !== "visible") {
            throw new Error(`图层 ${layer.id} 创建后不可见`);
          }
          console.info(`[地图] 图层 ${layer.id} 已创建并可见`);
          return true;
        } catch (error) {
          reportIssue(activeStep, error);
          return false;
        } finally {
          activeStep = null;
        }
      };

      try {
        // ---- 都道府县热力 choropleth ----
        activeStep = "下载都道府县 GeoJSON";
        const filteredMode = eventIdsKey.startsWith("filtered:");
        const selectedEventIds = new Set(
          filteredMode ? eventIdsKey.slice("filtered:".length).split("|").filter(Boolean) : [],
        );
        const selectedEvents = filteredMode
          ? events.filter((event) => selectedEventIds.has(event.id))
          : events.filter((event) => event.date >= todayJst());
        const heat = (() => {
          const byPrefecture = new Map<string, { count: number; heat: number }>();
          for (const event of selectedEvents) {
            const prefectureId = venueById.get(event.venueId)?.prefecture;
            if (!prefectureId) continue;
            const current = byPrefecture.get(prefectureId) ?? { count: 0, heat: 0 };
            current.count += 1;
            current.heat += 1;
            byPrefecture.set(prefectureId, current);
          }
          return byPrefecture;
        })();
        const maxHeat = Math.max(1, ...[...heat.values()].map((h) => h.heat));
        const codeToId = new Map(prefectures.map((p) => [p.code, p.id]));
        let heatReady = false;

        try {
          const res = await fetch("/data/japan-simplified.geojson");
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }
          const geo = await res.json();
          if (!Array.isArray(geo.features) || geo.features.length !== 47) {
            throw new Error(
              `GeoJSON 应包含 47 个都道府县，实际为 ${geo.features?.length ?? 0}`,
            );
          }
          for (const f of geo.features) {
            const prefId = codeToId.get(f.properties.id);
            const h = prefId ? heat.get(prefId) : undefined;
            f.properties.heat = h ? h.heat / maxHeat : 0;
            f.properties.count = h?.count ?? 0;
            f.properties.prefId = prefId ?? "";
            const p = prefectures.find((x) => x.id === prefId);
            f.properties.nameZh = p?.nameZh ?? f.properties.nameJa;
          }

          const sourceReady = runSourceStep("prefs", {
            type: "geojson",
            data: geo,
          });
          const fillReady =
            sourceReady &&
            runLayerStep({
              id: "pref-fill",
              type: "fill",
              source: "prefs",
              paint: {
                "fill-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "heat"],
                  0,
                  "#e4e4e7",
                  0.05,
                  "#ddd6fe",
                  0.25,
                  "#a78bfa",
                  0.55,
                  "#7c3aed",
                  1,
                  "#5b21b6",
                ],
                "fill-opacity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  0.68,
                  6.5,
                  0.58,
                  8.5,
                  0.18,
                ],
              },
            });
          const lineReady =
            fillReady &&
            runLayerStep({
              id: "pref-line",
              type: "line",
              source: "prefs",
              paint: {
                "line-color": "#7c3aed",
                "line-width": 1,
                "line-opacity": 0.62,
              },
            });
          heatReady = sourceReady && fillReady && lineReady;
        } catch (error) {
          reportIssue(activeStep ?? "初始化都道府县热力图层", error);
        } finally {
          activeStep = null;
        }

        // ---- 场地 pin(带聚合)----
        const upcoming = selectedEvents;
        const countByVenue = new Map<string, number>();
        for (const e of upcoming) {
          countByVenue.set(e.venueId, (countByVenue.get(e.venueId) ?? 0) + 1);
        }

        const venuesSourceReady = runSourceStep("venues", {
          type: "geojson",
          cluster: true,
          clusterRadius: 42,
          clusterMaxZoom: 10,
          data: {
            type: "FeatureCollection",
            features: venues
              .filter((v) => Number.isFinite(v.lng) && Number.isFinite(v.lat))
              .map((v) => ({
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [v.lng as number, v.lat as number],
              },
              properties: {
                id: v.id,
                name: v.nameJa,
                tier: v.tier,
                upcoming: countByVenue.get(v.id) ?? 0,
                color: v.tier ? TIER_COLOR[v.tier] : "#71717a",
                radius: v.tier ? TIER_RADIUS[v.tier] : 6,
              },
            })),
          },
        });

        const clustersReady =
          venuesSourceReady &&
          runLayerStep({
            id: "clusters",
            type: "circle",
            source: "venues",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#7c3aed",
              "circle-opacity": 0.92,
              "circle-radius": [
                "step",
                ["get", "point_count"],
                15,
                5,
                19,
                12,
                25,
              ],
              "circle-stroke-width": 2.5,
              "circle-stroke-color": "#ffffff",
            },
          });
        const clusterCountReady =
          clustersReady &&
          runLayerStep({
            id: "cluster-count",
            type: "symbol",
            source: "venues",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Open Sans Semibold"],
              "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
          });
        const venuePointsReady =
          clusterCountReady &&
          runLayerStep({
            id: "venue-pt",
            type: "circle",
            source: "venues",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": ["get", "radius"],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
              "circle-opacity": 0.96,
            },
          });
        const pinsReady =
          venuesSourceReady &&
          clustersReady &&
          clusterCountReady &&
          venuePointsReady;

        // ---- 交互 ----
        const hoverPopup = new Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
        });

        if (pinsReady) {
          map.on("click", "clusters", (e: MapMouseEvent) => {
            const f = map.queryRenderedFeatures(e.point, {
              layers: ["clusters"],
            })[0];
            if (!f) return;
            const clusterId = f.properties!.cluster_id as number;
            const src = map.getSource("venues") as GeoJSONSource;
            src
              .getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                map.easeTo({
                  center: (f.geometry as GeoJSON.Point).coordinates as [
                    number,
                    number,
                  ],
                  zoom: zoom + 0.3,
                });
              })
              .catch((error) => reportIssue("展开场馆聚合点", error));
          });

          map.on("click", "venue-pt", (e: MapMouseEvent) => {
            const f = map.queryRenderedFeatures(e.point, {
              layers: ["venue-pt"],
            })[0];
            if (!f) return;
            setSelected(f.properties!.id as string);
            map.easeTo({
              center: (f.geometry as GeoJSON.Point).coordinates as [
                number,
                number,
              ],
              padding: { right: 60 },
            });
          });

          map.on("mousemove", "venue-pt", (e: MapMouseEvent) => {
            map.getCanvas().style.cursor = "pointer";
            const f = map.queryRenderedFeatures(e.point, {
              layers: ["venue-pt"],
            })[0];
            if (!f) return;
            hoverPopup
              .setLngLat(
                (f.geometry as GeoJSON.Point).coordinates as [number, number],
              )
              .setHTML(
                `<div style="font: 600 12px sans-serif; color:#18181b">${f.properties!.name}</div><div style="font: 11px sans-serif; color:#71717a">${f.properties!.upcoming} 场未来公演</div>`,
              )
              .addTo(map);
          });
          map.on("mouseleave", "venue-pt", () => {
            map.getCanvas().style.cursor = "";
            hoverPopup.remove();
          });
          map.on("mouseenter", "clusters", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            map.getCanvas().style.cursor = "";
          });
        }

        if (heatReady) {
          // 低缩放点击都道府县 → 飞入
          map.on("click", "pref-fill", (e: MapMouseEvent) => {
            if (map.getZoom() >= 7.5) return;
            const layers = pinsReady ? ["venue-pt", "clusters"] : [];
            const hit =
              layers.length > 0
                ? map.queryRenderedFeatures(e.point, { layers })
                : [];
            if (hit.length > 0) return;
            map.easeTo({ center: e.lngLat, zoom: 8.2, duration: 900 });
          });
        }

        let heatRenderedOnce = false;
        let venuesRenderedOnce = false;
        const updateRenderedStatus = () => {
          if (disposed) return;
          const heatRendered = heatReady
            ? map.queryRenderedFeatures({ layers: ["pref-fill"] }).length
            : 0;
          const venuesRendered = pinsReady
            ? map.queryRenderedFeatures({
                layers: ["clusters", "venue-pt"],
              }).length
            : 0;
          heatRenderedOnce ||= Boolean(
            heatReady && map.isSourceLoaded("prefs") && heatRendered > 0,
          );
          venuesRenderedOnce ||= Boolean(
            pinsReady && map.isSourceLoaded("venues") && venuesRendered > 0,
          );
          setLayerStatus({
            heatReady: heatRenderedOnce,
            pinsReady: venuesRenderedOnce,
            heatRendered,
            venuesRendered,
          });
          if (
            heatRenderedOnce &&
            venuesRenderedOnce &&
            renderTimeoutId !== null
          ) {
            window.clearTimeout(renderTimeoutId);
            renderTimeoutId = null;
          }
        };
        map.on("idle", updateRenderedStatus);
        map.on("moveend", updateRenderedStatus);
        map.on("sourcedata", updateRenderedStatus);
        renderTimeoutId = window.setTimeout(() => {
          if (!heatRenderedOnce) {
            reportIssue(
              "验证图层 pref-fill",
              "图层已创建，但都道府县数据在 8 秒内没有完成可见渲染",
            );
          }
          if (!venuesRenderedOnce) {
            reportIssue(
              "验证图层 clusters / venue-pt",
              "图层已创建，但场馆数据在 8 秒内没有完成可见渲染",
            );
          }
        }, 8000);
        map.triggerRepaint();
        updateRenderedStatus();
      } catch (error) {
        reportIssue(activeStep ?? "初始化地图业务图层", error);
      } finally {
        activeStep = null;
        if (!disposed) setLoading(false);
      }
    });

    return () => {
      disposed = true;
      if (renderTimeoutId !== null) {
        window.clearTimeout(renderTimeoutId);
      }
      map.remove();
      mapRef.current = null;
      const debugWindow = window as unknown as { __enseiMap?: MLMap };
      if (debugWindow.__enseiMap === map) {
        delete debugWindow.__enseiMap;
      }
    };
  }, [eventIdsKey, events, venueById, venues]);

  // 图层开关
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerStatus.heatReady) return;
    const vis = showHeat ? "visible" : "none";
    map.setLayoutProperty("pref-fill", "visibility", vis);
    map.setLayoutProperty("pref-line", "visibility", vis);
  }, [layerStatus.heatReady, showHeat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerStatus.pinsReady) return;
    const vis = showPins ? "visible" : "none";
    map.setLayoutProperty("venue-pt", "visibility", vis);
    map.setLayoutProperty("clusters", "visibility", vis);
    map.setLayoutProperty("cluster-count", "visibility", vis);
  }, [layerStatus.pinsReady, showPins]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="map-runtime-status"
      data-map-ready={layerStatus.heatReady && layerStatus.pinsReady}
      data-heat-layer={layerStatus.heatReady}
      data-cluster-layer={layerStatus.pinsReady}
      data-venue-layer={layerStatus.pinsReady}
      data-heat-rendered={layerStatus.heatRendered}
      data-venue-rendered={layerStatus.venuesRendered}
      data-selected-venue={selected ?? ""}
    >
      <div ref={containerRef} className="h-full w-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/60 dark:bg-surface-dark/60">
          <p className="animate-pulse text-sm text-zinc-500">地图加载中…</p>
        </div>
      )}

      {issues.length > 0 && (
        <div
          role="alert"
          className="absolute top-14 left-3 z-30 max-w-sm rounded-xl border border-red-200 bg-white/96 p-3 text-xs shadow-xl backdrop-blur dark:border-red-900 dark:bg-zinc-900/96"
        >
          <p className="font-bold text-red-600 dark:text-red-400">
            地图图层加载失败
          </p>
          <ul className="mt-1.5 space-y-1 text-zinc-600 dark:text-zinc-300">
            {issues.slice(-3).map((issue) => (
              <li key={`${issue.step}:${issue.message}`}>
                <b>{issue.step}</b>：{issue.message}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-red-50 px-2.5 py-1 font-semibold text-red-600 hover:bg-red-100 dark:bg-red-950 dark:text-red-300"
          >
            重新加载地图
          </button>
        </div>
      )}

      {/* 图层切换 */}
      <div className="absolute top-3 left-3 z-20 flex gap-2">
        <button
          type="button"
          disabled={!layerStatus.heatReady}
          aria-pressed={showHeat}
          onClick={() => setShowHeat(!showHeat)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-45 ${
            showHeat
              ? "bg-brand text-white"
              : "bg-white/90 text-zinc-500 dark:bg-zinc-800/90 dark:text-zinc-300"
          }`}
        >
          热力图层
        </button>
        <button
          type="button"
          disabled={!layerStatus.pinsReady}
          aria-pressed={showPins}
          onClick={() => setShowPins(!showPins)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-45 ${
            showPins
              ? "bg-brand text-white"
              : "bg-white/90 text-zinc-500 dark:bg-zinc-800/90 dark:text-zinc-300"
          }`}
        >
          场地图层
        </button>
      </div>

      {/* 图例 */}
      <div className="absolute bottom-6 left-3 hidden rounded-xl bg-white/92 p-3 text-[10px] leading-relaxed shadow-lg backdrop-blur sm:block dark:bg-zinc-900/92 dark:text-zinc-300">
        <p className="mb-1 font-bold text-zinc-500 dark:text-zinc-400">地区热度</p>
        <div className="flex items-center gap-0.5">
          {["#e4e4e7", "#ddd6fe", "#a78bfa", "#7c3aed", "#5b21b6"].map((c) => (
            <span key={c} className="h-2.5 w-6" style={{ background: c }} />
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-zinc-400">
          <span>冷</span>
          <span>热</span>
        </div>
        <p className="mt-2 mb-1 font-bold text-zinc-500 dark:text-zinc-400">场地类型</p>
        {Object.entries(TIER_COLOR).map(([tier, color]) => (
          <p key={tier} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {{ dome: "巨蛋", stadium: "体育场", arena: "竞技馆", hall: "音乐厅", livehouse: "Livehouse" }[tier]}
          </p>
        ))}
      </div>

      {/* 场地面板 */}
      {selected && venueById.get(selected) && (
        <VenuePanel
          venue={venueById.get(selected)!}
          events={events}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
