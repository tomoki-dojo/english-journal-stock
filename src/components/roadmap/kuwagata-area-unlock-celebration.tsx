"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KuwagataAreaMap } from "./kuwagata-area-map";
import { KUWAGATA_AREA_NAMES } from "@/lib/kuwagata-area-names";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

// 新しいエリアが解放されたとき、暗転したポップアップでマップを見せ、雲が晴れて新エリアが現れる演出。
// 閉じたら「見た」と記録して、次からは出さない。
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-xl">
        <p className="mb-2 text-center text-sm font-bold text-amber-800">
          新エリア「{newAreas.map((a) => KUWAGATA_AREA_NAMES[a]).join("」「")}」が解放された！
        </p>
        <KuwagataAreaMap
          unlockedAreas={unlockedAreas}
          labels={KUWAGATA_AREA_NAMES}
          revealAreas={newAreas}
          onSelect={() => {}}
        />
        <button
          type="button"
          onClick={() => void close()}
          className="mt-3 w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          とじる
        </button>
      </div>
    </div>
  );
}
