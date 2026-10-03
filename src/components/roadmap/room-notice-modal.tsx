"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
import { ArthurAvatar } from "./arthur";
import { CelebrationOverlay } from "./celebration-overlay";
import {
  ADVICE_LINES,
  ADVICE_SPEAKER,
  ADVICE_TITLE,
  INTRO_LINES,
  type RoadmapAnnouncement,
  type RoadmapNewEgg,
} from "@/lib/roadmap-notices";

type Item =
  | { kind: "intro" }
  | { kind: "advice" }
  | { kind: "egg"; egg: RoadmapNewEgg }
  | { kind: "announcement"; announcement: RoadmapAnnouncement };

// 部屋に入ったときのポップアップ。初回はエークワ博士のアドバイス、以降は未読のお知らせを1件ずつ順に出す。
// 閉じるたびに既読をサーバーへ保存する（保存に失敗しても表示は先へ進める）。
export function RoomNoticeModal({
  showAdvice,
  announcements,
  newEggs,
}: {
  showAdvice: boolean;
  announcements: RoadmapAnnouncement[];
  newEggs: RoadmapNewEgg[];
}) {
  const [queue, setQueue] = useState<Item[]>(() => [
    ...(showAdvice ? ([{ kind: "intro" }, { kind: "advice" }] as Item[]) : []),
    ...newEggs.map((egg) => ({ kind: "egg" as const, egg })),
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
    const { egg } = current;
    const closeEgg = () => {
      void fetch("/api/roadmap/notices/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "egg", id: egg.id }),
      }).catch(() => {});
      setQueue((q) => q.slice(1));
    };
    return (
      <CelebrationOverlay
        key={egg.id}
        artSrc={`/roadmap/kuwagata/kuwagata_${egg.speciesCode}_egg.svg`}
        artClassName="animate-kuwagata-egg"
        message={`${egg.speciesName}のタマゴを手に入れた！`}
      >
        <button
          type="button"
          onClick={closeEgg}
          className="w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          OK
        </button>
      </CelebrationOverlay>
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
