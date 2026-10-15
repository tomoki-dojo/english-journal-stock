"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KuwagataAreaMap } from "./kuwagata-area-map";
import { CelebrationBurst } from "./celebration-overlay";
import { KUWAGATA_AREA_NAMES } from "@/lib/kuwagata-area-names";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

// 新しいエリアが解放されたとき、暗転したポップアップでマップを見せ、雲が晴れて新エリアが現れる演出。
// 最後は、普段のエリア選択と同じマップの形になる。閉じたら「見た」と記録して、次からは出さない。
export function KuwagataAreaUnlockCelebration({
  unlockedAreas,
  newAreas,
  onClose,
  skipRecord,
}: {
  unlockedAreas: KuwagataAreaCode[];
  newAreas: KuwagataAreaCode[];
  onClose?: () => void;
  // 確認用ページなど、記録しない場合
  skipRecord?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [revealed, setRevealed] = useState(false);
  if (!open || newAreas.length === 0) return null;

  async function close() {
    setOpen(false);
    if (!skipRecord) {
      try {
        await fetch("/api/roadmap/kuwagata/areas/celebrated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ areaCodes: newAreas }),
        });
      } catch {
        // 記録に失敗しても、次回もう一度出るだけ
      }
      router.refresh();
    }
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/85 p-4">
      <div className="unlock-rays" />
      {revealed && <div className="unlock-flash absolute inset-0 z-[80] bg-white" />}
      <div className="relative z-10 flex max-h-[96vh] w-full max-w-md flex-col items-center gap-3">
        <p
          className="unlock-title inline-block px-3 py-1 font-black italic leading-none"
          style={{
            fontSize: "clamp(2.4rem, 13vw, 3.6rem)",
            backgroundImage: "linear-gradient(180deg,#fef9c3 0%,#facc15 50%,#f59e0b 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            WebkitTextStroke: "0.06em #1c1917",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 0 0.25em #facc15) drop-shadow(0 0.06em 0 rgba(0,0,0,0.5))",
          }}
        >
          NEW AREA!
        </p>
        <div
          className="relative w-full rounded-2xl p-1 transition-shadow duration-1000"
          style={{
            boxShadow: revealed
              ? "0 0 60px 14px rgba(251,191,36,0.75)"
              : "0 0 30px 4px rgba(251,191,36,0.35)",
          }}
        >
          <KuwagataAreaMap
            unlockedAreas={unlockedAreas}
            labels={KUWAGATA_AREA_NAMES}
            revealAreas={newAreas}
            onSelect={() => {}}
            onRevealed={() => setRevealed(true)}
          />
          {revealed && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[70] h-56 w-56 -translate-x-1/2 -translate-y-1/2">
              <CelebrationBurst />
            </div>
          )}
        </div>
        <div className="min-h-[3.5rem] text-center">
          {revealed && (
            <p
              className="unlock-title text-xl font-black text-white"
              style={{ textShadow: "0 2px 0 #1c1917, 0 0 14px rgba(251,191,36,0.9)" }}
            >
              「{newAreas.map((a) => KUWAGATA_AREA_NAMES[a]).join("」「")}」が解放された！
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void close()}
          className={`w-full rounded-full bg-amber-500 py-3 text-base font-bold text-white transition-all active:scale-95 ${
            revealed ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          とじる
        </button>
      </div>
    </div>
  );
}
