"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls, Edges, Html } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
import { Eye, MousePointerClick, RotateCcw } from "lucide-react";
import {
  TIER_COLOR,
  TIER_LABEL_3D,
  VENUE_MODELS,
  type Section3D,
  type VenueModel,
} from "./sections";

function SectionMesh({
  section,
  hovered,
  selected,
  onHover,
  onClick,
}: {
  section: Section3D;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const color = TIER_COLOR[section.tier];
  return (
    <mesh
      position={section.pos}
      rotation={[section.pitch, section.yaw, 0]}
      rotation-order="YXZ"
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(section.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(section.id);
      }}
    >
      <boxGeometry args={section.size} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.75 : hovered ? 0.45 : 0.08}
        roughness={0.7}
        metalness={0.1}
      />
      <Edges
        color={hovered || selected ? "#ffffff" : "#000000"}
        opacity={hovered || selected ? 1 : 0.33}
        transparent
      />
      {(hovered || selected) && (
        <Html center distanceFactor={120} className="pointer-events-none">
          <div className="rounded-lg bg-black/85 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white shadow-xl">
            {section.label}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function DebugHook() {
  const three = useThree();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__ensei3d = three;
  }, [three]);
  return null;
}

function Stage({ model }: { model: VenueModel }) {
  const [sx, sy, sz] = model.stageSize;
  const [px, , pz] = model.stage;
  return (
    <group position={[px, 0, pz]}>
      {/* 台体 */}
      <mesh position={[0, sy * 0.18, 0]}>
        <boxGeometry args={[sx, sy * 0.36, sz]} />
        <meshStandardMaterial color="#18181b" roughness={0.4} />
      </mesh>
      {/* 背景屏 */}
      <mesh position={[0, sy * 0.62, -sz * 0.42]}>
        <boxGeometry args={[sx * 0.92, sy * 0.85, 0.8]} />
        <meshStandardMaterial
          color="#e11d48"
          emissive="#f43f5e"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      {/* 桁架 */}
      {[-sx * 0.42, sx * 0.42].map((x) => (
        <mesh key={x} position={[x, sy * 0.55, 0]}>
          <boxGeometry args={[1, sy * 1.1, 1]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
      ))}
      <pointLight position={[0, sy + 6, 4]} intensity={900} color="#f9a8d4" />
    </group>
  );
}

function Shell({ model }: { model: VenueModel }) {
  if (model.shell === "dome") {
    const r = model.floor.type === "circle" ? model.floor.r + 17 : 80;
    return (
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#e4e4e7"
          transparent
          opacity={0.07}
          side={2}
          depthWrite={false}
        />
      </mesh>
    );
  }
  if (model.shell === "octagon") {
    return (
      <group>
        <mesh position={[0, 24, 0]}>
          <coneGeometry args={[42, 16, 8, 1, true]} />
          <meshStandardMaterial
            color="#a1a1aa"
            transparent
            opacity={0.1}
            side={2}
            depthWrite={false}
          />
        </mesh>
        {/* 擬宝珠 */}
        <mesh position={[0, 33.5, 0]}>
          <sphereGeometry args={[1.6, 12, 12]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.5} />
        </mesh>
      </group>
    );
  }
  return null;
}

function Floor({ model }: { model: VenueModel }) {
  return (
    <group>
      {model.floor.type === "circle" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <circleGeometry args={[model.floor.r, 48]} />
          <meshStandardMaterial color="#1c1c26" roughness={0.9} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[model.floor.w, model.floor.d]} />
          <meshStandardMaterial color="#1c1c26" roughness={0.9} />
        </mesh>
      )}
      {/* 外圈地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <circleGeometry args={[160, 48]} />
        <meshStandardMaterial color="#111118" roughness={1} />
      </mesh>
    </group>
  );
}

export default function Venue3DViewer({
  modelKey,
  venueName,
}: {
  modelKey: string;
  venueName: string;
}) {
  const model = VENUE_MODELS[modelKey];
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedSection = useMemo(
    () => model?.sections.find((s) => s.id === selected) ?? null,
    [model, selected],
  );

  const distance = useMemo(() => {
    if (!selectedSection || !model) return null;
    const [vx, vy, vz] = selectedSection.view;
    const [sx, sy, sz] = model.stage;
    return Math.round(Math.hypot(vx - sx, vy - sy, vz - sz));
  }, [selectedSection, model]);

  // 相机进入/退出视野模式
  useEffect(() => {
    const c = controlsRef.current;
    if (!c || !model) return;
    if (selectedSection) {
      c.setLookAt(
        selectedSection.view[0],
        selectedSection.view[1],
        selectedSection.view[2],
        model.stage[0],
        model.stage[1],
        model.stage[2],
        true,
      );
    } else {
      c.setLookAt(
        model.home[0],
        model.home[1],
        model.home[2],
        0,
        4,
        0,
        true,
      );
    }
  }, [selectedSection, model]);

  if (!model) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        该场馆暂无 3D 模型
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-[#0d0d16]">
      <Canvas
        camera={{ position: model.home, fov: 45, near: 0.5, far: 800 }}
        dpr={[1, 1.5]}
        onPointerMissed={() => setSelected(null)}
      >
        <DebugHook />
        <ambientLight intensity={0.55} />
        <directionalLight position={[60, 90, 40]} intensity={1.1} />
        <directionalLight position={[-50, 60, -60]} intensity={0.4} color="#c4b5fd" />
        <fog attach="fog" args={["#0d0d16", 220, 420]} />

        <Floor model={model} />
        <Stage model={model} />
        <Shell model={model} />
        {model.sections.map((s) => (
          <SectionMesh
            key={s.id}
            section={s}
            hovered={hovered === s.id}
            selected={selected === s.id}
            onHover={setHovered}
            onClick={(id) => setSelected(id === selected ? null : id)}
          />
        ))}

        <CameraControls
          ref={controlsRef}
          minDistance={4}
          maxDistance={320}
          maxPolarAngle={Math.PI / 2.05}
          dollySpeed={0.6}
        />
      </Canvas>

      {/* 顶部信息 */}
      <div className="pointer-events-none absolute top-4 left-4 text-white">
        <p className="text-xs font-semibold tracking-widest text-violet-300">
          3D 座位视野模拟
        </p>
        <h2 className="mt-0.5 text-lg font-bold drop-shadow">{venueName}</h2>
      </div>

      {/* 图例 */}
      <div className="pointer-events-none absolute top-4 right-4 space-y-1 rounded-xl bg-black/55 p-3 text-[10px] text-zinc-200 backdrop-blur">
        {(Object.keys(TIER_COLOR) as (keyof typeof TIER_COLOR)[]).map((t) => (
          <p key={t} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: TIER_COLOR[t] }}
            />
            {TIER_LABEL_3D[t]}
          </p>
        ))}
      </div>

      {/* 底部:操作提示 / 分区信息卡 */}
      {selectedSection ? (
        <div className="absolute right-4 bottom-4 left-4 flex flex-wrap items-center gap-3 rounded-2xl bg-black/70 p-4 text-white backdrop-blur sm:left-auto sm:w-96">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-violet-300">
              <Eye size={12} /> 视野模式 · {TIER_LABEL_3D[selectedSection.tier]}
            </p>
            <p className="mt-0.5 truncate text-base font-bold">
              {selectedSection.label}
            </p>
            <p className="text-xs text-zinc-300">
              距舞台约 <b className="text-white">{distance}m</b> ·
              几何模拟视角,实际视野以现场为准
            </p>
          </div>
          <button
            onClick={() => setSelected(null)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-zinc-900 transition hover:bg-zinc-200"
          >
            <RotateCcw size={13} /> 返回全景
          </button>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[11px] whitespace-nowrap text-zinc-200 backdrop-blur">
          <MousePointerClick size={13} className="text-violet-300" />
          点击任意座席分区查看该位置望向舞台的视野 · 拖拽旋转 · 滚轮缩放
        </div>
      )}

    </div>
  );
}
