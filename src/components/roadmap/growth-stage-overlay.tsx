"use client";

import type { RoadmapStageUp } from "@/lib/roadmap-notices";
import { TankOccupant } from "./kuwagata-shelf";

const STAGE_LABEL: Record<RoadmapStageUp["stage"], string> = { 幼虫: "幼虫", 蛹: "サナギ", 成虫: "成虫" };

// 並べて見せる最大数。超えた分は「+N匹」にまとめる。
const MAX_SHOWN = 4;

// 成長段階が上がったクワたんを、暗転した全画面で見せる。複数匹が同時に成長したときは1画面にまとめる。
export function GrowthStageOverlay({ stageUps, onClose }: { stageUps: RoadmapStageUp[]; onClose: () => void }) {
  const shown = stageUps.slice(0, MAX_SHOWN);
  const hiddenCount = stageUps.length - shown.length;
  const single = shown.length === 1;

  return (
    <button
      type="button"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-900/90 px-8 text-center"
    >
      <div className="flex flex-col items-center gap-6">
        {shown.map((item) => (
          <div key={item.id} className="flex animate-question-card-enter flex-col items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="animate-egg-glow absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(253,230,138,0.6)_0%,rgba(251,191,36,0.25)_45%,rgba(251,191,36,0)_70%)]" />
              <div className="relative">
                <TankOccupant
                  color="#f59e0b"
                  sizeScale={single ? 4 : 2.5}
                  speciesCode={item.speciesCode}
                  mandibleVariant={item.mandibleVariant}
                  growthStage={item.stage}
                />
              </div>
            </div>
            <p className={`max-w-xs font-bold leading-relaxed text-white ${single ? "text-lg" : "text-base"}`}>
              {item.speciesName}が{STAGE_LABEL[item.stage]}に成長した！
            </p>
          </div>
        ))}
        {hiddenCount > 0 && <p className="text-sm font-bold text-white/80">+{hiddenCount}匹</p>}
      </div>
      <span className="text-2xl text-white/70">▼</span>
    </button>
  );
}
