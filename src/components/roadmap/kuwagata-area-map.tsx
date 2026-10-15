"use client";

import { useEffect, useRef, useState } from "react";
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

// 雲。中心がどの解放済みエリアの矩形にも入っていない間だけ表示する（未解放エリアの上に浮かべる）。
const MAP_CLOUDS = [
  { src: "/roadmap/map/cloud3.webp", x: 227, y: -1140, w: 646, h: 440 },
  { src: "/roadmap/map/cloud2.webp", x: 864, y: -1057, w: 407, h: 203 },
  { src: "/roadmap/map/cloud1.webp", x: 944, y: -766, w: 257, h: 173 },
];

const PAD = 40;
const MIN_X = Math.min(...MAP_AREAS.map((a) => a.x)) - PAD;
const MIN_Y = Math.min(...MAP_AREAS.map((a) => a.y)) - PAD;
const VIEW_W = Math.max(...MAP_AREAS.map((a) => a.x + a.w)) + PAD - MIN_X;
const VIEW_H = Math.max(...MAP_AREAS.map((a) => a.y + a.h)) + PAD - MIN_Y;

export const KUWAGATA_MAP_AREA_CODES = MAP_AREAS.map((a) => a.code);

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

export function KuwagataAreaMap({
  unlockedAreas,
  labels,
  onSelect,
  disabled,
}: {
  unlockedAreas: KuwagataAreaCode[];
  labels: Record<KuwagataAreaCode, string>;
  onSelect: (areaCode: KuwagataAreaCode) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 透明部分をクリックしても下のエリアに届くよう、画像のアルファ値でクリック判定する。
  const alphaRef = useRef<Map<KuwagataAreaCode, ImageData>>(new Map());
  const [hovered, setHovered] = useState<KuwagataAreaCode | null>(null);

  const visibleAreas = MAP_AREAS.filter((a) => unlockedAreas.includes(a.code));

  useEffect(() => {
    let cancelled = false;
    for (const area of visibleAreas) {
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
      };
      img.src = area.src;
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedAreas.join(",")]);

  function hitTest(clientX: number, clientY: number): KuwagataAreaCode | null {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const lx = MIN_X + ((clientX - rect.left) / rect.width) * VIEW_W;
    const ly = MIN_Y + ((clientY - rect.top) / rect.height) * VIEW_H;
    for (let i = visibleAreas.length - 1; i >= 0; i--) {
      const area = visibleAreas[i];
      if (lx < area.x || ly < area.y || lx >= area.x + area.w || ly >= area.y + area.h) continue;
      const data = alphaRef.current.get(area.code);
      if (!data) continue;
      const px = Math.floor(((lx - area.x) / area.w) * data.width);
      const py = Math.floor(((ly - area.y) / area.h) * data.height);
      if (data.data[(py * data.width + px) * 4 + 3] > 16) return area.code;
    }
    return null;
  }

  const unlockedRects = visibleAreas;
  const visibleClouds = MAP_CLOUDS.filter((c) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    return !unlockedRects.some((a) => cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h);
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl bg-[#c9dff0]"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, cursor: hovered && !disabled ? "pointer" : "default" }}
        onPointerMove={(e) => setHovered(hitTest(e.clientX, e.clientY))}
        onPointerLeave={() => setHovered(null)}
        onClick={(e) => {
          if (disabled) return;
          const hit = hitTest(e.clientX, e.clientY);
          if (hit) onSelect(hit);
        }}
      >
        {visibleAreas.map((area) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={area.code}
            src={area.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none transition-[filter] duration-150"
            style={{
              left: pct(area.x - MIN_X, VIEW_W),
              top: pct(area.y - MIN_Y, VIEW_H),
              width: pct(area.w, VIEW_W),
              height: pct(area.h, VIEW_H),
              zIndex: MAP_AREAS.findIndex((a) => a.code === area.code),
              filter: hovered === area.code ? "brightness(1.08) drop-shadow(0 0 10px rgba(255,255,255,0.95))" : undefined,
            }}
          />
        ))}
        {visibleClouds.map((cloud) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cloud.src}
            src={cloud.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={{
              left: pct(cloud.x - MIN_X, VIEW_W),
              top: pct(cloud.y - MIN_Y, VIEW_H),
              width: pct(cloud.w, VIEW_W),
              height: pct(cloud.h, VIEW_H),
              zIndex: 50,
            }}
          />
        ))}
        {hovered && (
          <span className="pointer-events-none absolute left-2 top-2 z-[60] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-amber-800 shadow">
            {labels[hovered]}
          </span>
        )}
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
