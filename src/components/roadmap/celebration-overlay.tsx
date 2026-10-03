"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Bug } from "lucide-react";

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

// タマゴ入手・採集などの「ゲットした！」演出。暗転した背景に、光・クラッカー風の紙吹雪・瞬く星を出す。
// 絵（artSrc）が無い／読み込めないときはBugアイコンで代用する。
export function CelebrationOverlay({
  artSrc,
  artClassName,
  accentClassName = "text-amber-300",
  eyebrow,
  message,
  description,
  children,
}: {
  artSrc?: string;
  artClassName?: string;
  accentClassName?: string;
  eyebrow?: string;
  message: string;
  description?: string | null;
  children: ReactNode;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const showArt = artSrc && !artFailed;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden bg-black/75 px-8 text-center">
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
        {showArt ? (
          // eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート
          <img
            src={artSrc}
            alt=""
            onError={() => setArtFailed(true)}
            className={`animate-egg-reveal relative h-28 w-28 object-contain drop-shadow-lg ${artClassName ?? ""}`}
          />
        ) : (
          <Bug
            className={`animate-egg-reveal relative h-24 w-24 drop-shadow-lg ${accentClassName}`}
            strokeWidth={1.5}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {eyebrow && (
          <p className={`text-sm font-bold ${accentClassName}`}>{eyebrow}</p>
        )}
        <p className="text-lg font-bold leading-relaxed text-white">
          {message}
        </p>
        {description && (
          <p className="mx-auto max-w-xs text-xs leading-relaxed text-white/70">
            {description}
          </p>
        )}
      </div>
      <div className="flex w-full max-w-xs flex-col items-center gap-2">
        {children}
      </div>
    </div>
  );
}
