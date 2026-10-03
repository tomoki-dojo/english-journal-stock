"use client";

import { useState, type CSSProperties } from "react";
import { Bug } from "lucide-react";
import { ArthurAvatar } from "./arthur";
import {
  ADVICE_LINES,
  ADVICE_SPEAKER,
  ADVICE_TITLE,
  INTRO_LINES,
  type RoadmapAnnouncement,
} from "@/lib/roadmap-notices";

// タマゴ入手時の演出用。クラッカーのように、タマゴの位置から紙吹雪が扇状に弾けて、ひらひら落ちる。
// SSRとクライアントで同じ見た目になるよう、乱数は固定シードで生成する。
function seededRandom(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFETTI_COLORS = [
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
  "#34d399",
  "#f87171",
  "#a78bfa",
  "#fde68a",
  "#ffffff",
];
type ConfettiShape = "rect" | "circle" | "star";

function makeConfetti(
  count: number,
  seed: number,
  baseDelay: number,
  power: number,
) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    // 上向きの扇（-160°〜-20°）に打ち上げる
    const angle = ((-160 + rand() * 140) * Math.PI) / 180;
    const speed = (0.55 + rand() * 0.45) * power;
    const x = Math.cos(angle) * speed;
    const peak = Math.sin(angle) * speed; // 負＝上
    const shapeRoll = rand();
    const shape: ConfettiShape =
      shapeRoll < 0.5 ? "rect" : shapeRoll < 0.8 ? "circle" : "star";
    return {
      id: `${seed}-${i}`,
      x: Math.round(x),
      peak: Math.round(peak),
      fall: Math.round(120 + rand() * 180),
      rot: Math.round((rand() - 0.5) * 1080),
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      shape,
      size: 6 + Math.round(rand() * 6),
      delay: baseDelay + rand() * 0.12,
      duration: 1.6 + rand() * 0.8,
    };
  });
}

// 1発目（大きく）と、少し遅れての2発目（控えめ）
const CONFETTI = [
  ...makeConfetti(44, 11, 0.15, 260),
  ...makeConfetti(26, 29, 1.0, 200),
];
const TWINKLES = [
  { left: 8, top: 22, size: 14, delay: 0 },
  { left: 86, top: 18, size: 18, delay: 0.5 },
  { left: 92, top: 62, size: 12, delay: 1.0 },
  { left: 14, top: 74, size: 16, delay: 0.3 },
  { left: 50, top: 2, size: 12, delay: 0.8 },
  { left: 70, top: 88, size: 14, delay: 1.3 },
];

type Item =
  | { kind: "intro" }
  | { kind: "advice" }
  | { kind: "egg" }
  | { kind: "announcement"; announcement: RoadmapAnnouncement };

// 部屋に入ったときのポップアップ。初回はエークワ博士のアドバイス、以降は未読のお知らせを1件ずつ順に出す。
// 閉じるたびに既読をサーバーへ保存する（保存に失敗しても表示は先へ進める）。
export function RoomNoticeModal({
  showAdvice,
  announcements,
}: {
  showAdvice: boolean;
  announcements: RoadmapAnnouncement[];
}) {
  const [queue, setQueue] = useState<Item[]>(() => [
    ...(showAdvice
      ? ([{ kind: "intro" }, { kind: "advice" }, { kind: "egg" }] as Item[])
      : []),
    ...announcements.map((announcement) => ({
      kind: "announcement" as const,
      announcement,
    })),
  ]);

  const [introPage, setIntroPage] = useState(0);

  const current = queue[0];
  if (!current) return null;

  if (current.kind === "intro") {
    const isLast = introPage >= INTRO_LINES.length - 1;
    const advance = () => {
      if (isLast) setQueue((q) => q.slice(1));
      else setIntroPage((p) => p + 1);
    };
    return (
      <button
        type="button"
        onClick={advance}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-zinc-900/90 px-8 text-center"
      >
        <ArthurAvatar size={128} animated className="shadow-lg" />
        <p
          key={introPage}
          className="max-w-xs animate-question-card-enter text-lg font-bold leading-relaxed text-white"
        >
          {INTRO_LINES[introPage]}
        </p>
        <span className="text-2xl text-white/70">▼</span>
      </button>
    );
  }

  if (current.kind === "egg") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-hidden bg-black/75 px-8 text-center">
        <div className="relative flex h-56 w-56 items-center justify-center">
          <div className="animate-egg-glow absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(253,230,138,0.85)_0%,rgba(251,191,36,0.35)_45%,rgba(251,191,36,0)_70%)]" />
          {CONFETTI.map((c) => (
            <span
              key={c.id}
              className="animate-egg-confetti pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center leading-none"
              style={
                {
                  "--cx": `${c.x}px`,
                  "--cy-peak": `${c.peak}px`,
                  "--cy-end": `${c.peak + c.fall}px`,
                  "--rot": `${c.rot}deg`,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  width: c.size,
                  height: c.shape === "rect" ? c.size * 1.6 : c.size,
                  marginLeft: -c.size / 2,
                  marginTop: -c.size / 2,
                  backgroundColor: c.shape === "star" ? undefined : c.color,
                  borderRadius:
                    c.shape === "circle"
                      ? "9999px"
                      : c.shape === "rect"
                        ? 1
                        : undefined,
                  color: c.color,
                  fontSize: c.size * 1.6,
                } as CSSProperties
              }
            >
              {c.shape === "star" ? "✦" : null}
            </span>
          ))}
          {TWINKLES.map((t, i) => (
            <span
              key={`twinkle-${i}`}
              className="animate-egg-twinkle pointer-events-none absolute leading-none text-amber-200"
              style={{
                left: `${t.left}%`,
                top: `${t.top}%`,
                fontSize: t.size,
                animationDelay: `${t.delay}s`,
              }}
            >
              ✦
            </span>
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
          <img
            src="/roadmap/kuwagata/kuwagata_KW-0001_egg.svg"
            alt=""
            className="animate-egg-reveal relative h-28 w-28 object-contain drop-shadow-lg"
          />
        </div>
        <p className="text-lg font-bold leading-relaxed text-white">
          エークワたんのタマゴを手に入れた！
        </p>
        <button
          type="button"
          onClick={() => setQueue((q) => q.slice(1))}
          className="w-full max-w-xs rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          OK
        </button>
      </div>
    );
  }

  const close = () => {
    const body =
      current.kind === "advice"
        ? { kind: "advice" }
        : { kind: "announcement", id: current.announcement.id };
    void fetch("/api/roadmap/notices/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
      <div className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        {current.kind === "advice" ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-200">
                <Bug className="h-5 w-5 text-amber-700" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-zinc-800">
                  {ADVICE_SPEAKER}
                </p>
                <p className="text-[11px] text-zinc-500">{ADVICE_TITLE}</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {ADVICE_LINES.map((line) => (
                <li
                  key={line}
                  className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-zinc-800"
                >
                  {line}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-2 text-base font-bold text-zinc-800">
              {current.announcement.title}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {current.announcement.body}
            </p>
          </>
        )}
        <button
          type="button"
          onClick={close}
          className="mt-5 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          {current.kind === "advice" ? "はじめる" : "OK"}
        </button>
      </div>
    </div>
  );
}
