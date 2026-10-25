"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrowthBadge } from "./growth-badge";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import type { WarmthLevel } from "./types";

type PickerScenario = {
  id: string;
  sceneTag: string;
  titleJa: string;
  situationJa: string;
  status: "未着手" | "練習中" | "習得済み";
  warmth: WarmthLevel;
  lastPracticedAt: string | null;
};

type Scene<T extends PickerScenario> = {
  name: string;
  scenarios: T[];
  masteredCount: number;
};

function groupByScene<T extends PickerScenario>(scenarios: T[]): Scene<T>[] {
  const map = new Map<string, T[]>();
  for (const s of scenarios) {
    const list = map.get(s.sceneTag);
    if (list) list.push(s);
    else map.set(s.sceneTag, [s]);
  }
  return Array.from(map, ([name, list]) => ({
    name,
    scenarios: list,
    masteredCount: list.filter((s) => s.status === "習得済み").length,
  }));
}

// 「おまかせ」：練習中のシナリオを優先し、なければ未着手、全部習得済みならそのシーンの全体からランダムに1つ選ぶ。
function pickRandom<T extends PickerScenario>(scene: Scene<T>): T {
  const inProgress = scene.scenarios.filter((s) => s.status === "練習中");
  const notStarted = scene.scenarios.filter((s) => s.status === "未着手");
  const pool = inProgress.length > 0 ? inProgress : notStarted.length > 0 ? notStarted : scene.scenarios;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Stage4・5共通の、シーン（分類）→シナリオ（お題）の選択UI。同じ画面でシーンを開閉でき、
// 各シーンの「おまかせ」で、開かずにそのまま会話を始められる。
export function SceneScenarioPicker<T extends PickerScenario>({
  stage,
  scenarios,
  disabled,
  onStart,
}: {
  stage: 4 | 5;
  scenarios: T[];
  disabled: boolean;
  onStart: (scenario: T) => void;
}) {
  const color = STAGE_COLORS[stage];
  const scenes = useMemo(() => groupByScene(scenarios), [scenarios]);

  // 直近で練習したシーン（なければ、最初の未習得シーン）を最初に開いておく。
  const [openScenes, setOpenScenes] = useState<Set<string>>(() => {
    let recent: Scene<T> | null = null;
    let recentTime = 0;
    for (const scene of scenes) {
      for (const s of scene.scenarios) {
        const t = s.lastPracticedAt ? Date.parse(s.lastPracticedAt) : 0;
        if (t > recentTime) {
          recentTime = t;
          recent = scene;
        }
      }
    }
    const initial = recent ?? scenes.find((sc) => sc.masteredCount < sc.scenarios.length) ?? scenes[0] ?? null;
    return new Set(initial ? [initial.name] : []);
  });

  function toggle(name: string) {
    setOpenScenes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {scenes.map((scene) => {
        const open = openScenes.has(scene.name);
        const complete = scene.masteredCount === scene.scenarios.length;
        return (
          <div
            key={scene.name}
            className="overflow-hidden rounded-xl border bg-white"
            style={{ borderColor: open ? color : "#e4e4e7" }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onClick={() => toggle(scene.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(scene.name);
                }
              }}
              className="flex cursor-pointer items-center gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-zinc-900">{scene.name}</p>
                  {complete && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: withAlpha(color, "26"), color }}
                    >
                      コンプ
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex gap-1">
                  {scene.scenarios.map((s) => (
                    <span
                      key={s.id}
                      className="h-1.5 flex-1 rounded-full"
                      style={{ backgroundColor: s.status === "習得済み" ? color : "#e4e4e7" }}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-zinc-400">
                  {scene.masteredCount} / {scene.scenarios.length}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onStart(pickRandom(scene));
                }}
                style={{ backgroundColor: color }}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                おまかせ
              </button>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
            </div>

            {open && (
              <div className="flex flex-col gap-2 border-t border-zinc-100 bg-zinc-50 p-2">
                {scene.scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onStart(scenario)}
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <GrowthBadge stage={stage} warmth={scenario.warmth} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-zinc-900">{scenario.titleJa}</p>
                      <p className="mt-1 text-xs text-zinc-500">{scenario.situationJa}</p>
                      {scenario.status === "習得済み" && (
                        <p className="mt-1.5 text-xs font-medium" style={{ color }}>
                          話せるようになりました
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
