"use client";

import { useState } from "react";
import { Bug, Lock, Crown } from "lucide-react";
import type {
  KuwagataAreaCode,
  KuwagataEncyclopedia,
  KuwagataEncyclopediaEntry,
} from "@/lib/supabase/kuwagata";

// クワガタ育成機能：図鑑UI（タスク#254）。棚（捕まえた順に埋まる「見た目」用の画面）とは
// 役割を分け、ここは「進捗管理」に専念する。設計doc「UI構成」の通り、
// エリアタブ＋そのエリアの新種コンプリート進捗を見せるカード形式のアルバム型にする。
// 既知種（クワたんシリーズ）はどのエリアにも紐づかないため、タブの外に固定セクションとして出す。
//
// アート未制作のため、発見済みの見た目は棚と同じ色付きBugアイコンで代替、未発見はLockアイコン
// ＋「？」のシルエット風カードにする。実イラストが揃ったら、EntryCard内の
// Bugアイコン部分と、未発見時のシルエット部分をそれぞれ差し替える想定。

const AREA_LABEL: Record<KuwagataAreaCode, string> = {
  area1: "エリア1・庭・裏庭",
  area2: "エリア2・里山・雑木林",
  area3: "エリア3・川",
  area4: "エリア4・ジャングル・秘境",
  aquarium: "Pro限定・水中アクアリウム",
};

// 既知種の入手経緯テキスト（UI文言：「既知種」というカテゴリ名はプレイヤーには出さず、
// 個体カードの入手経緯テキストで特別感を出す、という設計doc方針に沿ったもの）。
// stage_triggerの値ごとに固定のコピーを用意する。1はサインアップ時点での確定入手。
const KNOWN_ACQUISITION_TEXT: Record<number, string> = {
  1: "アカウント作成の日に届いた1匹",
  2: "Stage2解放の日に届いた1匹",
  3: "Stage3解放の日に届いた1匹",
  4: "Stage4解放の日に届いた1匹",
  5: "Stage5解放の日に届いた卵",
};

const KNOWN_LOCKED_HINT: Record<number, string> = {
  1: "アカウント作成と同時に出会える",
  2: "Stage2を解放すると出会える",
  3: "Stage3を解放すると出会える",
  4: "Stage4を解放すると出会える",
  5: "Stage5を解放すると出会える",
};

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

const KNOWN_SPECIES_COLOR = "#92400e";

function entryColor(entry: KuwagataEncyclopediaEntry): string {
  if (entry.species.kind === "known") return KNOWN_SPECIES_COLOR;
  return `hsl(${hashHue(entry.species.name)}, 55%, 40%)`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function EntryCard({ entry, areaLocked }: { entry: KuwagataEncyclopediaEntry; areaLocked?: boolean }) {
  const isKnown = entry.species.kind === "known";

  // Pro限定種をFreeで見ている場合：採集プール自体から除外済みのため「？？？」という
  // 伏せ字（＝そのうち会えるかも、という期待）は誤解を招く。はっきり「Pro限定」と伝える。
  if (entry.proLocked) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-2 py-4">
        <Crown className="h-6 w-6 text-amber-400" strokeWidth={1.75} />
        <span className="text-xs font-semibold text-amber-600">Pro限定</span>
        <span className="text-center text-[10px] leading-tight text-amber-600/80">
          Proにすると出会える1匹
        </span>
      </div>
    );
  }

  // エリア自体が未解放の場合は、そのエリアの新種を一律シルエット表示にする
  // （種類ごとの発見状況ではなく、エリア解放自体がゲートのため）。
  const locked = areaLocked || !entry.discovered;

  if (locked) {
    const hint = isKnown
      ? KNOWN_LOCKED_HINT[entry.species.stageTrigger ?? 0]
      : areaLocked
        ? "エリア解放後に出会えるかもしれない"
        : "このエリアのどこかにいるらしい";

    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-2 py-4">
        <Lock className="h-6 w-6 text-zinc-300" strokeWidth={1.75} />
        <span className="text-xs font-semibold text-zinc-400">？？？</span>
        <span className="text-center text-[10px] leading-tight text-zinc-400">{hint}</span>
      </div>
    );
  }

  const color = entryColor(entry);
  const acquisitionText = isKnown
    ? KNOWN_ACQUISITION_TEXT[entry.species.stageTrigger ?? 0]
    : `野生で発見・${entry.firstObtainedAt ? formatDate(entry.firstObtainedAt) : ""}`;

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-200 bg-gradient-to-b from-sky-50 to-white px-2 py-4 shadow-sm">
      <Bug className="h-7 w-7" style={{ color }} strokeWidth={1.75} />
      <span className="text-xs font-semibold text-zinc-700">{entry.species.name}</span>
      {entry.species.flavorTextJa && (
        <p className="text-center text-[10px] leading-tight text-zinc-500">{entry.species.flavorTextJa}</p>
      )}
      <span className="text-[10px] text-zinc-400">{acquisitionText}</span>
    </div>
  );
}

export function KuwagataEncyclopediaView({ encyclopedia }: { encyclopedia: KuwagataEncyclopedia }) {
  const [selectedArea, setSelectedArea] = useState<KuwagataAreaCode>("area1");
  const currentArea = encyclopedia.areas.find((a) => a.areaCode === selectedArea) ?? encyclopedia.areas[0];

  return (
    <div>
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold text-zinc-500">クワたんシリーズ</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {encyclopedia.known.map((entry) => (
            <EntryCard key={entry.species.id} entry={entry} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {encyclopedia.areas.map((area) => (
            <button
              key={area.areaCode}
              type="button"
              onClick={() => setSelectedArea(area.areaCode)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                area.areaCode === selectedArea
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {AREA_LABEL[area.areaCode]}
              {area.unlocked && (
                <span className="ml-1 opacity-70">
                  {area.discoveredCount}/{area.totalCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {!currentArea.unlocked && (
          <p className="mb-3 text-xs text-zinc-400">
            {currentArea.areaCode === "aquarium"
              ? "Proにすると解放される特別なエリア。水中アクアリウム表示でいきものを飼える。"
              : "前のエリアの新種をすべて発見するとこのエリアが解放されます。"}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {currentArea.entries.map((entry) => (
            <EntryCard key={entry.species.id} entry={entry} areaLocked={!currentArea.unlocked} />
          ))}
        </div>
      </section>
    </div>
  );
}
