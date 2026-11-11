"use client";

import { ArthurAvatar } from "./arthur";
import { KuwagataAreaMap } from "./kuwagata-area-map";
import { KUWAGATA_AREA_NAMES } from "@/lib/kuwagata-area-names";

// ゲスト向けの軽いチュートリアル。画面を暗くして、アーサーがひとこと説明する。タップで閉じる（次へ進む）。
// 見た目は部屋のお知らせ（room-notice-modal の博士の話）とそろえる。
// 一度見たものは端末に記録して、二度は出さない（記録できない環境でも、表示と進行は動く）。
export type GuestTutorialStep = 1 | 2 | 3 | 4;

const STORAGE_KEY = (step: GuestTutorialStep) => `guest_tutorial_seen_${step}`;

export function hasSeenGuestTutorial(step: GuestTutorialStep): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY(step)) === "1";
  } catch {
    return false;
  }
}

export function markGuestTutorialSeen(step: GuestTutorialStep): void {
  try {
    window.localStorage.setItem(STORAGE_KEY(step), "1");
  } catch {
    // 保存できなくても続行する
  }
}

function Message({ step }: { step: GuestTutorialStep }) {
  const em = "font-black text-amber-300";
  switch (step) {
    case 1:
      return (
        <>
          <p>
            英語を<span className={em}>声に出して練習</span>するのが
            <br />
            このアプリの特徴！
          </p>
          <p className="mt-3">
            まずは自分で声に出して、自分で判断！
            <br />
            言えたら「言えた」を押そう
          </p>
        </>
      );
    case 2:
      return (
        <>
          <p className="text-2xl font-black text-amber-300">虫を採集しにいくぞ！</p>
          <p className="mt-2">ミニゲーム開始だ</p>
        </>
      );
    case 3:
      return (
        <>
          <p>本当のStage1は5問1セット。</p>
          <p className="mt-2">
            言える表現が増えるほど、
            <br />
            虫が育っていくぞ
          </p>
        </>
      );
    case 4:
      return (
        <>
          <p>Stageが進むほど、採集できるエリアが増える！</p>
          <p className="mt-2">AIを使った会話練習もできるぞ！</p>
          <p className={`mt-3 ${em}`}>続きは無料登録で</p>
        </>
      );
  }
}

// 4で見せる採集エリアの地図。ゲストは「庭」（area1）だけ開いていて、ほかは雲に隠れている。
function GuestAreaMapPreview() {
  return (
    <div className="pointer-events-none w-56 overflow-hidden rounded-xl shadow-lg ring-1 ring-white/20">
      <KuwagataAreaMap unlockedAreas={["area1"]} labels={KUWAGATA_AREA_NAMES} onSelect={() => {}} disabled />
    </div>
  );
}

export function GuestTutorialOverlay({ step, onClose }: { step: GuestTutorialStep; onClose: () => void }) {
  // 地図の中にボタンがあるので、外側は <button> ではなく、押せる div にする
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose();
      }}
      className="fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center gap-6 bg-zinc-900/90 px-8 text-center"
    >
      <ArthurAvatar size={step === 4 ? 96 : 128} animated mood="talk" talkKey={step} className="shadow-lg" />
      {step === 4 && <GuestAreaMapPreview />}
      <div key={step} className="max-w-xs animate-question-card-enter text-base font-bold leading-relaxed text-white">
        <Message step={step} />
      </div>
      <span className="text-2xl text-white/70">▼</span>
    </div>
  );
}
