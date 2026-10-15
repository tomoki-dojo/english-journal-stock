"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

// public/roadmap/map/map_layout.json と同じ座標系（原点＝エリア1の中心＝4000x4000アートボードの中心）。
// 配列の後ろほど手前に描く。
type MapArea = { code: KuwagataAreaCode; src: string; x: number; y: number; w: number; h: number };

const MAP_AREAS: MapArea[] = [
  { code: "area5", src: "/roadmap/map/map_area5.webp", x: 129, y: -1679, w: 1011, h: 1019 },
  { code: "area4", src: "/roadmap/map/map_area4.webp", x: -928, y: -1763, w: 1230, h: 1105 },
  { code: "area3", src: "/roadmap/map/map_area3.webp", x: -913, y: -978, w: 1223, h: 804 },
  { code: "area2", src: "/roadmap/map/map_area2.webp", x: 44, y: -1103, w: 1113, h: 1139 },
  { code: "area1", src: "/roadmap/map/map_area1.webp", x: -535, y: -489, w: 1141, h: 700 },
  { code: "ancient", src: "/roadmap/map/map_ancient.webp", x: -1349, y: -264, w: 1608, h: 1275 },
];

const CLOUD_TYPES = [
  { src: "/roadmap/map/cloud1.webp", w: 257, h: 173 },
  { src: "/roadmap/map/cloud2.webp", w: 407, h: 203 },
  { src: "/roadmap/map/cloud3.webp", w: 646, h: 440 },
];

export const KUWAGATA_MAP_AREA_CODES = MAP_AREAS.map((a) => a.code);

type View = { x: number; y: number; w: number; h: number };

const VIEW_PAD = 140;
const MIN_VIEW_SIZE = 1500;

// 解放済みエリア全体が収まる表示範囲。縦横比は0.8〜1.25に収めて、足りない側は中央に寄せて広げる。
function computeView(areas: MapArea[]): View {
  const target = areas.length > 0 ? areas : MAP_AREAS;
  const minX = Math.min(...target.map((a) => a.x)) - VIEW_PAD;
  const minY = Math.min(...target.map((a) => a.y)) - VIEW_PAD;
  const maxX = Math.max(...target.map((a) => a.x + a.w)) + VIEW_PAD;
  const maxY = Math.max(...target.map((a) => a.y + a.h)) + VIEW_PAD;
  let w = Math.max(maxX - minX, MIN_VIEW_SIZE);
  let h = Math.max(maxY - minY, MIN_VIEW_SIZE);
  const aspect = Math.min(1.25, Math.max(0.8, w / h));
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function hash(i: number, j: number, salt: number): number {
  let n = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0;
  return (n % 10000) / 10000;
}

type Cloud = { key: string; src: string; x: number; y: number; w: number; h: number };

const CLOUD_GRID = 110; // 雲を置く間隔

// 未解放エリアの形の上に雲を敷き詰める（「何かある」と見せる）。解放済みエリアの絵にはかけない。
// isLocked: その座標が未解放エリアの絵の不透明部分か / isOpen: 解放済みエリアの絵の不透明部分か
function buildClouds(
  view: View,
  isLocked: (x: number, y: number) => boolean,
  isOpen: (x: number, y: number) => boolean
): Cloud[] {
  const clouds: Cloud[] = [];
  const i0 = Math.floor(view.x / CLOUD_GRID) - 1;
  const i1 = Math.ceil((view.x + view.w) / CLOUD_GRID) + 1;
  const j0 = Math.floor(view.y / CLOUD_GRID) - 1;
  const j1 = Math.ceil((view.y + view.h) / CLOUD_GRID) + 1;
  const reach = CLOUD_GRID * 0.5;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const cx = (i + 0.5 + (hash(i, j, 1) - 0.5) * 0.6) * CLOUD_GRID;
      const cy = (j + 0.5 + (hash(i, j, 2) - 0.5) * 0.6) * CLOUD_GRID;
      if (isOpen(cx, cy)) continue;
      // 形の縁まで覆うため、中心の近傍のどこかが未解放エリアに入っていればよい
      const locked =
        isLocked(cx, cy) ||
        isLocked(cx - reach, cy) ||
        isLocked(cx + reach, cy) ||
        isLocked(cx, cy - reach) ||
        isLocked(cx, cy + reach);
      // 未解放エリアは全部覆い、それ以外の余白にも雲を浮かべる
      if (!locked && hash(i, j, 5) > 0.8) continue;
      const type = CLOUD_TYPES[Math.floor(hash(i, j, 3) * CLOUD_TYPES.length)];
      const scale = (type.w > 500 ? 0.55 : 0.8) + hash(i, j, 4) * 0.35;
      const w = type.w * scale;
      const h = type.h * scale;
      // 解放済みエリアの絵には一切かからないよう、雲の輪郭付近のどこかが絵に入るものは置かない。
      const hw = w * 0.5;
      const hh = h * 0.5;
      const cw = w * 0.32;
      const ch = h * 0.32;
      const touchesOpen =
        isOpen(cx - hw, cy) ||
        isOpen(cx + hw, cy) ||
        isOpen(cx, cy - hh) ||
        isOpen(cx, cy + hh) ||
        isOpen(cx - cw, cy - ch) ||
        isOpen(cx + cw, cy - ch) ||
        isOpen(cx - cw, cy + ch) ||
        isOpen(cx + cw, cy + ch);
      if (touchesOpen) continue;
      clouds.push({ key: `${i},${j}`, src: type.src, x: cx - w / 2, y: cy - h / 2, w, h });
    }
  }
  return clouds;
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

type AlphaMap = Map<KuwagataAreaCode, ImageData>;

function opaqueAt(alpha: AlphaMap, area: MapArea, lx: number, ly: number): boolean {
  if (lx < area.x || ly < area.y || lx >= area.x + area.w || ly >= area.y + area.h) return false;
  const data = alpha.get(area.code);
  if (!data) return false;
  const px = Math.floor(((lx - area.x) / area.w) * data.width);
  const py = Math.floor(((ly - area.y) / area.h) * data.height);
  return data.data[(py * data.width + px) * 4 + 3] > 16;
}

const REVEAL_DELAY_MS = 900;
const REVEAL_MS = 1600;
const CLOUD_DRIFT = 520; // 晴れるとき、雲が外へ流れる距離（マップ座標）

export function KuwagataAreaMap({
  unlockedAreas,
  labels,
  onSelect,
  disabled,
  revealAreas,
  onRevealed,
}: {
  unlockedAreas: KuwagataAreaCode[];
  labels: Record<KuwagataAreaCode, string>;
  onSelect: (areaCode: KuwagataAreaCode) => void;
  disabled?: boolean;
  // 指定したエリアは、最初は雲に覆われていて、少し待つと雲が晴れて現れる（解放演出用。unlockedAreasに含めておく）。
  revealAreas?: KuwagataAreaCode[];
  // 雲が晴れ始めた瞬間に呼ばれる（演出の紙吹雪などを重ねる用）
  onRevealed?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 透明部分をクリックしても下のエリアに届くよう、画像のアルファ値でクリック判定する。
  const alphaRef = useRef<AlphaMap>(new Map());
  const [hovered, setHovered] = useState<KuwagataAreaCode | null>(null);
  const [maskTick, setMaskTick] = useState(0);

  const unlockedKey = unlockedAreas.join(",");
  const revealKey = (revealAreas ?? []).join(",");
  const visibleAreas = useMemo(
    () => MAP_AREAS.filter((a) => unlockedAreas.includes(a.code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unlockedKey]
  );
  const revealList = useMemo(
    () => visibleAreas.filter((a) => revealKey.split(",").includes(a.code)),
    [visibleAreas, revealKey]
  );
  const settledAreas = useMemo(() => visibleAreas.filter((a) => !revealList.includes(a)), [visibleAreas, revealList]);
  const view = useMemo(() => computeView(visibleAreas), [visibleAreas]);

  const [revealed, setRevealed] = useState(revealList.length === 0);
  const masksReady = maskTick >= MAP_AREAS.length;
  useEffect(() => {
    if (revealed && revealList.length > 0) onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);
  useEffect(() => {
    if (revealed || !masksReady) return;
    const timer = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revealed, masksReady]);

  const clouds = useMemo(() => {
    const alpha = alphaRef.current;
    const build = (settled: MapArea[]) => {
      const lockedAreas = MAP_AREAS.filter((a) => !settled.includes(a));
      return buildClouds(
        view,
        (lx, ly) => lockedAreas.some((a) => opaqueAt(alpha, a, lx, ly)),
        (lx, ly) => settled.some((a) => opaqueAt(alpha, a, lx, ly))
      );
    };
    // 解放後の雲（＝普段のマップの雲）
    const finalClouds = build(visibleAreas);
    if (revealList.length === 0) return finalClouds.map((c) => ({ ...c, drift: null as null | { dx: number; dy: number } }));
    // 解放前の雲のうち、解放後には無い雲だけを、新エリアの中心から外へ流して消す。最後は普段のマップと同じ雲の並びになる。
    const finalKeys = new Set(finalClouds.map((c) => c.key));
    return build(settledAreas).map((cloud) => {
      if (finalKeys.has(cloud.key)) return { ...cloud, drift: null as null | { dx: number; dy: number } };
      const cx = cloud.x + cloud.w / 2;
      const cy = cloud.y + cloud.h / 2;
      let best = revealList[0];
      let bestDist = Infinity;
      for (const a of revealList) {
        const d = Math.hypot(cx - (a.x + a.w / 2), cy - (a.y + a.h / 2));
        if (d < bestDist) {
          bestDist = d;
          best = a;
        }
      }
      const dx = cx - (best.x + best.w / 2);
      const dy = cy - (best.y + best.h / 2);
      const len = Math.hypot(dx, dy) || 1;
      return { ...cloud, drift: { dx: (dx / len) * CLOUD_DRIFT, dy: (dy / len) * CLOUD_DRIFT } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, visibleAreas, settledAreas, revealList, maskTick]);

  // 各エリアの名前札を置く位置（他のエリアに隠れていない部分の重心）
  const labelPositions = useMemo(() => {
    const alpha = alphaRef.current;
    const result = new Map<KuwagataAreaCode, { x: number; y: number }>();
    for (const area of visibleAreas) {
      const data = alpha.get(area.code);
      if (!data) continue;
      const front = visibleAreas.filter((o) => MAP_AREAS.indexOf(o) > MAP_AREAS.indexOf(area));
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let py = 0; py < data.height; py += 12) {
        for (let px = 0; px < data.width; px += 12) {
          if (data.data[(py * data.width + px) * 4 + 3] <= 16) continue;
          const lx = area.x + (px / data.width) * area.w;
          const ly = area.y + (py / data.height) * area.h;
          if (front.some((o) => opaqueAt(alpha, o, lx, ly))) continue;
          sx += lx;
          sy += ly;
          n++;
        }
      }
      if (n > 0) result.set(area.code, { x: sx / n, y: sy / n });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAreas, maskTick]);

  useEffect(() => {
    let cancelled = false;
    for (const area of MAP_AREAS) {
      if (alphaRef.current.has(area.code)) continue;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        alphaRef.current.set(area.code, ctx.getImageData(0, 0, canvas.width, canvas.height));
        setMaskTick((t) => t + 1);
      };
      img.src = area.src;
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function hitTest(clientX: number, clientY: number): KuwagataAreaCode | null {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const lx = view.x + ((clientX - rect.left) / rect.width) * view.w;
    const ly = view.y + ((clientY - rect.top) / rect.height) * view.h;
    for (let i = visibleAreas.length - 1; i >= 0; i--) {
      const area = visibleAreas[i];
      if (!revealed && revealList.includes(area)) continue;
      if (opaqueAt(alphaRef.current, area, lx, ly)) return area.code;
    }
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl bg-[#c9dff0]"
        style={{ aspectRatio: `${view.w} / ${view.h}`, cursor: hovered && !disabled ? "pointer" : "default" }}
        onPointerMove={(e) => setHovered(hitTest(e.clientX, e.clientY))}
        onPointerLeave={() => setHovered(null)}
        onClick={(e) => {
          if (disabled) return;
          const hit = hitTest(e.clientX, e.clientY);
          if (hit) onSelect(hit);
        }}
      >
        {clouds.map((cloud) => {
          const gone = revealed && cloud.drift;
          const x = cloud.x + (gone && cloud.drift ? cloud.drift.dx : 0);
          const y = cloud.y + (gone && cloud.drift ? cloud.drift.dy : 0);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cloud.key}
              src={cloud.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: pct(x - view.x, view.w),
                top: pct(y - view.y, view.h),
                width: pct(cloud.w, view.w),
                height: pct(cloud.h, view.h),
                zIndex: 50,
                opacity: gone ? 0 : 1,
                transition: cloud.drift ? `left ${REVEAL_MS}ms ease-in, top ${REVEAL_MS}ms ease-in, opacity ${REVEAL_MS}ms ease-in` : undefined,
              }}
            />
          );
        })}
        {visibleAreas.map((area) => {
          const hidden = !revealed && revealList.includes(area);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={area.code}
              src={area.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: pct(area.x - view.x, view.w),
                top: pct(area.y - view.y, view.h),
                width: pct(area.w, view.w),
                height: pct(area.h, view.h),
                zIndex: 1 + MAP_AREAS.findIndex((a) => a.code === area.code),
                opacity: hidden ? 0 : 1,
                transform: hidden ? "scale(0.9)" : "scale(1)",
                transition: `opacity ${REVEAL_MS}ms ease-out, transform ${REVEAL_MS}ms cubic-bezier(0.2, 1.3, 0.4, 1), filter 150ms`,
                filter: hovered === area.code ? "brightness(1.08) drop-shadow(0 0 10px rgba(255,255,255,0.95))" : undefined,
              }}
            />
          );
        })}
        {visibleAreas.map((area) => {
          const pos = labelPositions.get(area.code);
          if (!pos) return null;
          const hidden = !revealed && revealList.includes(area);
          return (
            <span
              key={`label-${area.code}`}
              className="pointer-events-none absolute z-[55] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-amber-200 bg-white/90 px-2 py-0.5 text-[10px] font-bold leading-tight text-amber-800 shadow"
              style={{
                left: pct(pos.x - view.x, view.w),
                top: pct(pos.y - view.y, view.h),
                opacity: hidden ? 0 : 1,
                transition: `opacity ${REVEAL_MS}ms ease-out`,
              }}
            >
              {labels[area.code]}
            </span>
          );
        })}
      </div>
      {/* キーボード・スクリーンリーダー用 */}
      <div className="sr-only">
        {visibleAreas.map((area) => (
          <button key={area.code} type="button" disabled={disabled} onClick={() => onSelect(area.code)}>
            {labels[area.code]}
          </button>
        ))}
      </div>
    </div>
  );
}
