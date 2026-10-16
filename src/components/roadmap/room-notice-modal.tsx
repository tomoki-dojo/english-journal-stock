"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
import { ArthurAvatar } from "./arthur";
import { CelebrationOverlay } from "./celebration-overlay";
import { StageUnlockOverlay } from "./stage-unlock-overlay";
import {
  ADVICE_LINES,
  ADVICE_SPEAKER,
  ADVICE_SPEAKER_IMAGE,
  ADVICE_TITLE,
  INTRO_LINES,
  type RoadmapAnnouncement,
  type RoadmapNewEgg,
  type RoadmapNewHatch,
  type RoadmapStageUp,
} from "@/lib/roadmap-notices";
import { HatchOverlay } from "./hatch-overlay";
import { GrowthStageOverlay } from "./growth-stage-overlay";

type Item =
  | { kind: "intro" }
  | { kind: "advice" }
  | { kind: "stageUnlock"; stage: 2 | 3 | 4 | 5; key: string }
  | { kind: "eggReason"; reason: string; key: string }
  | { kind: "egg"; egg: RoadmapNewEgg }
  | { kind: "hatch"; hatch: RoadmapNewHatch }
  | { kind: "growth"; stageUps: RoadmapStageUp[] }
  | { kind: "announcement"; announcement: RoadmapAnnouncement }
  | { kind: "trivia"; trivia: { id: string; body: string } };

// 「**太字**」の記法を<strong>に変換して表示する。
function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-extrabold text-zinc-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

// エークワ博士のアイコン。画像(ADVICE_SPEAKER_IMAGE)が無い間はBugアイコンで代用する。
function AdviceSpeakerIcon() {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-200">
      <Bug className="h-5 w-5 text-amber-700" />
    </span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- 自前の画像
    <img
      src={ADVICE_SPEAKER_IMAGE}
      alt=""
      onError={() => setFailed(true)}
      className="h-9 w-9 rounded-full bg-amber-100 object-cover ring-1 ring-amber-200"
    />
  );
}

// 部屋に入ったときのポップアップ。初回はエークワ博士のアドバイス、以降は未読のお知らせを1件ずつ順に出す。
// 閉じるたびに既読をサーバーへ保存する（保存に失敗しても表示は先へ進める）。
export function RoomNoticeModal({
  showAdvice,
  announcements,
  newEggs,
  newHatches = [],
  stageUps = [],
  trivia = null,
}: {
  showAdvice: boolean;
  announcements: RoadmapAnnouncement[];
  newEggs: RoadmapNewEgg[];
  newHatches?: RoadmapNewHatch[];
  stageUps?: RoadmapStageUp[];
  trivia?: { id: string; body: string } | null;
}) {
  const [queue, setQueue] = useState<Item[]>(() => [
    ...(showAdvice ? ([{ kind: "intro" }, { kind: "advice" }] as Item[]) : []),
    // Stage解放で配られたタマゴは、タマゴ入手の演出の前に「Stage◯が解放された！」を挟む。
    // 節目のイベントで配られたタマゴは、先に「もらえた理由」を見せてからタマゴを渡す。
    ...newEggs.flatMap((egg): Item[] => {
      const stage = egg.stageTrigger;
      const eggItem: Item = { kind: "egg", egg };
      if (egg.reason) return [{ kind: "eggReason", reason: egg.reason, key: egg.id }, eggItem];
      return stage !== null && stage >= 2 && stage <= 5
        ? [
            { kind: "stageUnlock", stage: stage as 2 | 3 | 4 | 5, key: egg.id },
            eggItem,
          ]
        : [eggItem];
    }),
    ...newHatches.map((hatch) => ({ kind: "hatch" as const, hatch })),
    // 日数がたって成長したクワたん（練習のご褒美で成長した分は、結果画面でその場で見せる）
    ...(stageUps.length > 0 ? ([{ kind: "growth", stageUps }] as Item[]) : []),
    ...announcements.map((announcement) => ({
      kind: "announcement" as const,
      announcement,
    })),
    // お知らせのあとに、その日のアーサーの豆知識（1日1回）
    ...(trivia ? ([{ kind: "trivia", trivia }] as Item[]) : []),
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
        <ArthurAvatar size={128} animated mood="talk" talkKey={introPage} className="shadow-lg" />
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

  if (current.kind === "trivia") {
    const { trivia: item } = current;
    const closeTrivia = () => {
      void fetch("/api/roadmap/notices/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "trivia", id: item.id }),
      }).catch(() => {});
      setQueue((q) => q.slice(1));
    };
    return (
      <button
        key={`trivia-${item.id}`}
        type="button"
        onClick={closeTrivia}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-zinc-900/90 px-8 text-center"
      >
        <ArthurAvatar size={128} animated mood="talk" talkKey={item.id} className="shadow-lg" />
        <p className="max-w-xs animate-question-card-enter text-base font-bold leading-relaxed text-white">
          {item.body}
        </p>
        <span className="text-2xl text-white/70">▼</span>
      </button>
    );
  }

  if (current.kind === "growth") {
    const { stageUps: items } = current;
    const closeGrowth = () => {
      void fetch("/api/roadmap/notices/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "growth", ids: items.map((item) => item.id) }),
      }).catch(() => {});
      setQueue((q) => q.slice(1));
    };
    return <GrowthStageOverlay key={`growth-${items[0].id}`} stageUps={items} onClose={closeGrowth} />;
  }

  if (current.kind === "eggReason") {
    return (
      <button
        key={`egg-reason-${current.key}`}
        type="button"
        onClick={() => setQueue((q) => q.slice(1))}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-zinc-900/90 px-8 text-center"
      >
        <p className="max-w-xs animate-question-card-enter text-lg font-bold leading-relaxed text-white">
          {current.reason}
        </p>
        <span className="text-2xl text-white/70">▼</span>
      </button>
    );
  }

  if (current.kind === "stageUnlock") {
    return (
      <StageUnlockOverlay
        key={`unlock-${current.key}`}
        stage={current.stage}
        onClose={() => setQueue((q) => q.slice(1))}
      />
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

  if (current.kind === "hatch") {
    const { hatch } = current;
    const closeHatch = () => {
      void fetch("/api/roadmap/notices/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hatch", id: hatch.id }),
      }).catch(() => {});
      setQueue((q) => q.slice(1));
    };
    return (
      <HatchOverlay
        key={`hatch-${hatch.id}`}
        speciesCode={hatch.speciesCode}
        speciesName={hatch.speciesName}
        mandibleVariant={hatch.mandibleVariant}
        hatchedFrom={hatch.hatchedFrom}
      >
        <button
          type="button"
          onClick={closeHatch}
          className="w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          OK
        </button>
      </HatchOverlay>
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
              <AdviceSpeakerIcon />
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
                  {renderEmphasis(line)}
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
