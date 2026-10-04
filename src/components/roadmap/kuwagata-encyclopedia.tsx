"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Lock } from "lucide-react";
import type {
  KuwagataAreaCode,
  KuwagataEncyclopedia,
  KuwagataEncyclopediaEntry,
} from "@/lib/supabase/kuwagata";
import { TankOccupant } from "@/components/roadmap/kuwagata-shelf";

const AREA_LABEL: Record<KuwagataAreaCode, string> = {
  area1: "エリア1・庭・裏庭",
  area2: "エリア2・里山・雑木林",
  area3: "エリア3・川",
  area4: "エリア4・ジャングル・秘境",
  aquarium: "Pro限定・水中アクアリウム",
};

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

// 図鑑番号。種類コード(KW-0001)の数字部分をそのまま使う。
function entryNumber(entry: KuwagataEncyclopediaEntry): string {
  return `No.${entry.species.code.replace(/^KW-/, "")}`;
}

// 図鑑の1ページ分。絵の枠・名前・解説・入手の記録を、ページ紙の上に並べる。
function BookPage({
  entry,
  areaLocked,
  pageNumber,
}: {
  entry?: KuwagataEncyclopediaEntry;
  areaLocked?: boolean;
  pageNumber: number;
}) {
  if (!entry) {
    return <div className="flex min-h-[320px] flex-1 flex-col px-3 py-3 sm:px-5" />;
  }

  const isKnown = entry.species.kind === "known";
  const proLocked = entry.proLocked;
  const locked = proLocked || areaLocked || !entry.discovered;
  const color = entryColor(entry);

  let name = entry.species.name;
  let body: string | null = entry.species.flavorTextJa;
  let footnote = "";
  if (proLocked) {
    name = "Pro限定";
    body = "Proにすると出会える1匹";
  } else if (locked) {
    name = "？？？";
    body = isKnown
      ? KNOWN_LOCKED_HINT[entry.species.stageTrigger ?? 0]
      : areaLocked
        ? "エリア解放後に出会えるかもしれない"
        : "このエリアのどこかにいるらしい";
  } else {
    footnote = isKnown
      ? KNOWN_ACQUISITION_TEXT[entry.species.stageTrigger ?? 0]
      : `野生で発見・${entry.firstObtainedAt ? formatDate(entry.firstObtainedAt) : ""}`;
  }

  return (
    <div className="flex min-h-[320px] flex-1 flex-col px-3 py-3 sm:px-5">
      <div className="mb-2 flex items-baseline justify-between border-b border-amber-900/20 pb-1">
        <span className="font-serif text-[11px] font-bold tracking-wider text-amber-900/70">
          {entryNumber(entry)}
        </span>
      </div>

      <div className="relative mx-auto mb-3 flex aspect-square w-full max-w-[150px] items-center justify-center rounded-md border-2 border-amber-900/30 bg-white/70 p-1 shadow-inner">
        <div className="absolute inset-1 rounded-[3px] border border-amber-900/15" />
        {proLocked ? (
          <Crown className="h-9 w-9 text-amber-400" strokeWidth={1.5} />
        ) : locked && !isKnown ? (
          <Lock className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
        ) : (
          <div style={locked ? { filter: "brightness(0)", opacity: 0.15 } : undefined}>
            <TankOccupant
              color={color}
              sizeScale={3.2}
              speciesCode={entry.species.code}
              growthStage="成虫"
            />
          </div>
        )}
      </div>

      <h3
        className={`mb-1 text-center font-serif text-sm font-bold ${locked ? "text-zinc-400" : "text-amber-950"}`}
      >
        {name}
      </h3>
      {body && (
        <p className={`text-center text-[11px] leading-snug ${locked ? "text-zinc-400" : "text-zinc-600"}`}>{body}</p>
      )}
      {footnote && (
        <p className="mt-auto pt-3 text-center text-[10px] text-amber-900/60">{footnote}</p>
      )}
      <span className="mt-auto pt-2 text-center font-serif text-[10px] text-amber-900/40">{pageNumber}</span>
    </div>
  );
}

type ChapterKey = "known" | KuwagataAreaCode;

export function KuwagataEncyclopediaView({ encyclopedia }: { encyclopedia: KuwagataEncyclopedia }) {
  const [chapter, setChapter] = useState<ChapterKey>("known");
  const [spread, setSpread] = useState(0);

  const currentArea = chapter === "known" ? null : encyclopedia.areas.find((a) => a.areaCode === chapter) ?? null;
  const entries = chapter === "known" ? encyclopedia.known : (currentArea?.entries ?? []);
  const areaLocked = currentArea ? !currentArea.unlocked : false;

  const spreadCount = Math.max(1, Math.ceil(entries.length / 2));
  const safeSpread = Math.min(spread, spreadCount - 1);
  const left = entries[safeSpread * 2];
  const right = entries[safeSpread * 2 + 1];

  const chapters: { key: ChapterKey; label: string; badge?: string }[] = [
    { key: "known", label: "クワたんシリーズ" },
    ...encyclopedia.areas.map((area) => ({
      key: area.areaCode as ChapterKey,
      label: AREA_LABEL[area.areaCode],
      badge: area.unlocked ? `${area.discoveredCount}/${area.totalCount}` : undefined,
    })),
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {chapters.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setChapter(c.key);
              setSpread(0);
            }}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              c.key === chapter ? "bg-amber-900 text-amber-50" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
            }`}
          >
            {c.label}
            {c.badge && <span className="ml-1 opacity-70">{c.badge}</span>}
          </button>
        ))}
      </div>

      <div className="rounded-xl rounded-tl-none bg-amber-900 p-2 shadow-md sm:p-3">
        <div className="flex overflow-hidden rounded-md bg-[#fbf6e9]">
          <BookPage entry={left} areaLocked={areaLocked} pageNumber={safeSpread * 2 + 1} />
          <div
            className="w-4 shrink-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(120,53,15,0.05), rgba(120,53,15,0.35) 50%, rgba(120,53,15,0.05))",
            }}
          />
          <BookPage entry={right} areaLocked={areaLocked} pageNumber={safeSpread * 2 + 2} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setSpread(Math.max(0, safeSpread - 1))}
          disabled={safeSpread === 0}
          aria-label="前のページ"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-900 text-amber-50 transition-opacity disabled:opacity-25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-serif text-xs text-amber-900/70">
          {safeSpread + 1} / {spreadCount}
        </span>
        <button
          type="button"
          onClick={() => setSpread(Math.min(spreadCount - 1, safeSpread + 1))}
          disabled={safeSpread >= spreadCount - 1}
          aria-label="次のページ"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-900 text-amber-50 transition-opacity disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
