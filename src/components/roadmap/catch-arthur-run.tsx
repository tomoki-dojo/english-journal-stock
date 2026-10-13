"use client";

import { useEffect, useState } from "react";

const DIR = "/roadmap/minigame";

// 振り下ろしの1コマの長さ(ms)
export const SWING_FRAME_MS = 90;
// 振り下ろし開始から、ホワイトアウトが始まるまで・ホワイトアウトの長さ(ms)
export const WHITEOUT_DELAY_MS = 300;
export const WHITEOUT_MS = 450;
// 振り下ろし開始から、ミニゲームを終えるまで(ms)
export const SWING_TOTAL_MS = WHITEOUT_DELAY_MS + WHITEOUT_MS;

// 採集ミニゲームのアーサー。画面の奥(消失点)から、虫網を持って手前に走ってくる。
//  far: 遠くで小さく走っている(カウントダウン中) / approach: durationSec秒かけて手前に近づく / swing: 網を振り下ろす
// 絵は640×960の同じキャンバス(足元中心が下寄りの中央)なので、重ねて切り替えるだけで動く。
export function CatchArthurRun({
  mode,
  durationSec = 10,
}: {
  mode: "far" | "approach" | "swing";
  durationSec?: number;
}) {
  const [swingFrame, setSwingFrame] = useState(1);

  useEffect(() => {
    if (mode !== "swing") return;
    setSwingFrame(1);
    const timers = [2, 3, 4].map((frame, i) => setTimeout(() => setSwingFrame(frame), SWING_FRAME_MS * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [mode]);

  const imgClass = "absolute inset-0 h-full w-full select-none";

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <div
        className={`catch-arthur absolute left-1/2 ${
          mode === "far" ? "catch-arthur-far" : mode === "approach" ? "catch-arthur-approach" : "catch-arthur-swing"
        }`}
        style={mode === "approach" ? { animationDuration: `${durationSec}s` } : undefined}
      >
        {mode === "swing" ? (
          <div className="relative h-full w-full">
            {[1, 2, 3, 4].map((frame) => (
              // eslint-disable-next-line @next/next/no-img-element -- ミニゲーム用の1枚絵
              <img
                key={frame}
                src={`${DIR}/arthur_swing_${frame}.png`}
                alt=""
                draggable={false}
                className={imgClass}
                style={{ opacity: frame === swingFrame ? 1 : 0 }}
              />
            ))}
            {/* 帽子は、振り下ろしの勢いで軽く飛んでいく */}
            {/* eslint-disable-next-line @next/next/no-img-element -- ミニゲーム用の1枚絵 */}
            <img src={`${DIR}/hat_1.png`} alt="" draggable={false} className={`${imgClass} catch-arthur-hat-fly`} />
          </div>
        ) : (
          <div className="catch-arthur-bounce relative h-full w-full">
            {/* eslint-disable @next/next/no-img-element -- ミニゲーム用の1枚絵 */}
            <img src={`${DIR}/arthur_run_1.png`} alt="" draggable={false} className={`${imgClass} catch-arthur-swap-a`} />
            <img src={`${DIR}/arthur_run_2.png`} alt="" draggable={false} className={`${imgClass} catch-arthur-swap-b`} />
            {/* 帽子1・2は、体より少し遅れて浮きながら切り替わる */}
            <div className="catch-arthur-hat-hop absolute inset-0">
              <img src={`${DIR}/hat_1.png`} alt="" draggable={false} className={`${imgClass} catch-hat-swap-a`} />
              <img src={`${DIR}/hat_2.png`} alt="" draggable={false} className={`${imgClass} catch-hat-swap-b`} />
            </div>
            {/* eslint-enable @next/next/no-img-element */}
          </div>
        )}
      </div>
      {mode === "swing" && (
        <div
          className="catch-whiteout fixed inset-0 z-[6] bg-white"
          style={{ animationDelay: `${WHITEOUT_DELAY_MS}ms`, animationDuration: `${WHITEOUT_MS}ms` }}
        />
      )}
    </div>
  );
}

// 説明画面の「採集アーサー」(バストアップ512×512)。口パクで話す。frame1=前歯が大きく見える、2=前歯が小さい、3=口を開けて歯が見えない。
const TALK_FRAMES = [3, 2, 1, 2];

export function CatchArthurTalk({ size = 200 }: { size?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % TALK_FRAMES.length), 140);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {[1, 2, 3].map((frame) => (
        // eslint-disable-next-line @next/next/no-img-element -- ミニゲーム用の1枚絵
        <img
          key={frame}
          src={`${DIR}/arthur_catch_${frame}.png`}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
          style={{ opacity: TALK_FRAMES[index] === frame ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

// 道の両脇の草。消失点から左右に広がりながら、どんどん大きくなって手前へ流れ(疾走感)、画面の外へ消える。
const GRASS_CYCLE_SEC = 1.2;
const GRASS = [
  { side: "left", gx: -34, delay: 0 },
  { side: "right", gx: 40, delay: 0.1 },
  { side: "left", gx: -46, delay: 0.3 },
  { side: "right", gx: 30, delay: 0.4 },
  { side: "left", gx: -28, delay: 0.6 },
  { side: "right", gx: 48, delay: 0.7 },
  { side: "left", gx: -40, delay: 0.9 },
  { side: "right", gx: 36, delay: 1.0 },
] as const;

export function CatchGrass() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
      {GRASS.map((g, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- ミニゲーム用の1枚絵
        <img
          key={i}
          src={`${DIR}/grass_${g.side}.png`}
          alt=""
          draggable={false}
          className="catch-grass absolute"
          style={
            {
              "--gx": `${g.gx}vw`,
              "--gx0": `${g.gx > 0 ? 5 : -5}vw`,
              animationDuration: `${GRASS_CYCLE_SEC}s`,
              animationDelay: `-${g.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
