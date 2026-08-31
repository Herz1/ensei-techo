// 三座场馆的参数化分区定义(1 unit = 1 米,真实尺度近似)
// 每个分区是一块朝向舞台倾斜的座席平板 + 一个「视野」相机位

export type SectionTier = "arena" | "1F" | "2F";

export interface Section3D {
  id: string;
  label: string;
  tier: SectionTier;
  /** 平板中心 */
  pos: [number, number, number];
  /** [宽(切向), 厚, 深(径向)] */
  size: [number, number, number];
  /** 绕 Y 轴朝向中心的旋转 */
  yaw: number;
  /** 朝内俯角(弧度) */
  pitch: number;
  /** 视野相机位 */
  view: [number, number, number];
}

export interface VenueModel {
  key: "tokyo-dome" | "budokan" | "yokohama-arena";
  /** 舞台中心(视野 lookAt 目标) */
  stage: [number, number, number];
  stageSize: [number, number, number];
  /** 初始相机位 */
  home: [number, number, number];
  /** 场地地面半径(圆)或 [w, d](矩形) */
  floor: { type: "circle"; r: number } | { type: "rect"; w: number; d: number };
  shell: "dome" | "octagon" | "box";
  sections: Section3D[];
}

export const TIER_COLOR: Record<SectionTier, string> = {
  arena: "#a78bfa",
  "1F": "#60a5fa",
  "2F": "#fbbf24",
};

export const TIER_LABEL_3D: Record<SectionTier, string> = {
  arena: "アリーナ",
  "1F": "スタンド 1F",
  "2F": "スタンド 2F",
};

/** 环形均布看台 */
function ring(opts: {
  prefix: string;
  labelPrefix: string;
  tier: SectionTier;
  count: number;
  radius: number;
  y: number;
  pitch: number;
  size: [number, number, number];
  startAngle?: number;
}): Section3D[] {
  const out: Section3D[] = [];
  const start = opts.startAngle ?? 0;
  for (let i = 0; i < opts.count; i++) {
    const a = start + (Math.PI * 2 * i) / opts.count;
    const x = Math.sin(a) * opts.radius;
    const z = Math.cos(a) * opts.radius;
    // yaw 使平板宽边与切线一致、正面朝向中心
    const yaw = Math.atan2(x, z);
    out.push({
      id: `${opts.prefix}-${i + 1}`,
      label: `${opts.labelPrefix} ${i + 1}`,
      tier: opts.tier,
      pos: [x, opts.y, z],
      size: opts.size,
      yaw,
      pitch: opts.pitch,
      view: [x * 1.04, opts.y + 3.2, z * 1.04],
    });
  }
  return out;
}

/** アリーナ平面分块 */
function arenaGrid(opts: {
  prefix: string;
  cols: number;
  rows: number;
  cellW: number;
  cellD: number;
  gap: number;
  zStart: number;
}): Section3D[] {
  const out: Section3D[] = [];
  const rowNames = ["A", "B", "C", "D", "E"];
  const totalW = opts.cols * opts.cellW + (opts.cols - 1) * opts.gap;
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const x = -totalW / 2 + opts.cellW / 2 + c * (opts.cellW + opts.gap);
      const z = opts.zStart + opts.cellD / 2 + r * (opts.cellD + opts.gap);
      out.push({
        id: `${opts.prefix}-${rowNames[r]}${c + 1}`,
        label: `アリーナ ${rowNames[r]}${c + 1} ブロック`,
        tier: "arena",
        pos: [x, 0.6, z],
        size: [opts.cellW, 1.2, opts.cellD],
        yaw: 0,
        pitch: 0,
        view: [x, 2.4, z],
      });
    }
  }
  return out;
}

// ---------------- 東京ドーム ----------------
const tokyoDome: VenueModel = {
  key: "tokyo-dome",
  stage: [0, 6, -38],
  stageSize: [42, 13, 14],
  home: [0, 105, 128],
  floor: { type: "circle", r: 62 },
  shell: "dome",
  sections: [
    ...arenaGrid({ prefix: "td-ar", cols: 2, rows: 3, cellW: 19, cellD: 15, gap: 2.5, zStart: -22 }),
    ...ring({
      prefix: "td-1f",
      labelPrefix: "スタンド 1F",
      tier: "1F",
      count: 10,
      radius: 57,
      y: 10,
      pitch: -0.42,
      size: [31, 1.6, 22],
      startAngle: Math.PI / 10,
    }),
    ...ring({
      prefix: "td-2f",
      labelPrefix: "スタンド 2F(バルコニー)",
      tier: "2F",
      count: 10,
      radius: 67,
      y: 25,
      pitch: -0.5,
      size: [34, 1.6, 15],
      startAngle: Math.PI / 10,
    }),
  ],
};

// ---------------- 日本武道館 ----------------
const budokan: VenueModel = {
  key: "budokan",
  stage: [0, 3.5, -17],
  stageSize: [22, 7, 9],
  home: [0, 52, 62],
  floor: { type: "circle", r: 34 },
  shell: "octagon",
  sections: [
    ...arenaGrid({ prefix: "bk-ar", cols: 2, rows: 2, cellW: 10, cellD: 11, gap: 1.6, zStart: -10 }),
    ...ring({
      prefix: "bk-1f",
      labelPrefix: "1階席",
      tier: "1F",
      count: 8,
      radius: 26,
      y: 5.5,
      pitch: -0.48,
      size: [17, 1.2, 12],
      startAngle: Math.PI / 8,
    }),
    ...ring({
      prefix: "bk-2f",
      labelPrefix: "2階席",
      tier: "2F",
      count: 8,
      radius: 32.5,
      y: 13,
      pitch: -0.56,
      size: [20, 1.2, 11],
      startAngle: Math.PI / 8,
    }),
  ],
};

// ---------------- 横浜アリーナ ----------------
/** 矩形周边看台(横アリ) */
function yokohamaStands(): Section3D[] {
  const out: Section3D[] = [];
  // [x, z, 宽, 名称];yaw 统一按 atan2 计算(local +z 朝外,倾角才会朝向场地中心)
  const lower: [number, number, number, string][] = [
    [0, 46, 40, "北(正面)"],
    [34, 38, 22, "東北"],
    [-34, 38, 22, "西北"],
    [44, 8, 30, "東"],
    [-44, 8, 30, "西"],
    [40, -24, 22, "東南"],
    [-40, -24, 22, "西南"],
  ];
  lower.forEach(([x, z, w, name], i) => {
    const yaw = Math.atan2(x, z);
    out.push({
      id: `ya-1f-${i + 1}`,
      label: `スタンド 1F ${name}`,
      tier: "1F",
      pos: [x, 7.5, z],
      size: [w, 1.4, 16],
      yaw,
      pitch: -0.44,
      view: [x * 1.05, 10.5, z * 1.05],
    });
    out.push({
      id: `ya-2f-${i + 1}`,
      label: `スタンド 2F ${name}`,
      tier: "2F",
      pos: [x * 1.22, 16.5, z * 1.22],
      size: [w * 1.15, 1.4, 13],
      yaw,
      pitch: -0.52,
      view: [x * 1.28, 19.5, z * 1.28],
    });
  });
  return out;
}

const yokohamaArena: VenueModel = {
  key: "yokohama-arena",
  stage: [0, 4.5, -30],
  stageSize: [30, 9, 11],
  home: [0, 72, 92],
  floor: { type: "rect", w: 96, d: 100 },
  shell: "box",
  sections: [
    ...arenaGrid({ prefix: "ya-c", cols: 3, rows: 2, cellW: 13, cellD: 13, gap: 2, zStart: -18 }),
    ...yokohamaStands(),
  ],
};

export const VENUE_MODELS: Record<string, VenueModel> = {
  "tokyo-dome": tokyoDome,
  budokan: budokan,
  "yokohama-arena": yokohamaArena,
};
