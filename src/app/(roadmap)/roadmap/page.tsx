import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Sparkles, ClipboardList, ChevronRight, PartyPopper } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import {
  getCurrentStreak,
  getRoadmapStageReadiness,
  getTodayActivityCount,
  getUserRoadmapState,
} from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoadmapMap } from "@/components/roadmap/roadmap-map";
import { ProSkipButton } from "@/components/roadmap/pro-skip-button";

// スピーキング・ロードマップのホーム（「箱庭画面」）。
// 練習画面（クイズ）とは別画面に分離し、ここは箱庭ビジュアル＋各Stageへの入り口だけを持つ拠点画面にする。
// 各Stageへの入り口はRoadmapMap内に直接埋め込まれており、ページ側に別途リンク一覧は置かない。
export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }

  const state = await getUserRoadmapState(user.id);

  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const streak = await getCurrentStreak(user.id);
  const activityCount = await getTodayActivityCount(user.id);
  const stageReadiness = await getRoadmapStageReadiness(user.id);
  const plan = await getPlan(user.id);

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">スピーキング・ロードマップ</h1>
        <p className="mt-2 text-sm text-zinc-500">
          街を育てながら、話す力を少しずつ積み上げていきます。
        </p>
      </div>

      {/*
        Stageスキップ（#156、Pro限定・2026-09-14実装）。日常会話パート（Stage1〜3）を飛ばして
        先のStageから始めたい人向けの常設ボタン。地図の直上に配置する（地図コンテナは
        overflow-hiddenのため、展開パネルがはみ出ないよう地図の外に置く）。
      */}
      <ProSkipButton
        plan={plan}
        proSkipEnabled={state.proSkipEnabled}
        proSkipStartStage={state.proSkipStartStage}
      />

      {/*
        箱庭ビジュアル本体。Stage1〜5の建物/ボタンに加えて、Stage0（使い分けパーツ）の入り口も
        1枚のマップ上に直接重ねる構成（下にボタン一覧は並べない）。Stage0は一本道の解放判定とは
        無関係に常にクリック可能な独立エリアとして、道から外れた位置に単独で表示する。
        実イラスト（brand/isometric-city-asset-spec.md）は別タスク（#150）で差し替える前提で、
        ここでは配置・解放状態のロジックだけ実装している。
      */}
      <RoadmapMap stageReadiness={stageReadiness} proSkipStartStage={state.proSkipStartStage} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-2xl font-semibold text-accent">{state.totalMasteredCount}</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">累計習得フレーズ</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Flame className="h-4 w-4 text-accent" />
            <p className="text-2xl font-semibold text-accent">{streak}</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">連続practice日数</p>
        </div>
        {/*
          今日の賑わい度（タスク#154）。Stage0〜3の練習・復習をこなすほど増える、日次リセットの
          一時的な指標。恒久的な建物成長（Stage卒業）とは切り離す。アイソメ都市ビジュアル
          （タスク#150）が未実装のため、今は数値バッジとしてのみ表示し、実イラスト
          （人通り・自転車・屋台など）は#150で差し替える想定。
        */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <PartyPopper className="h-4 w-4 text-accent" />
            <p className="text-2xl font-semibold text-accent">{activityCount}</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">今日の賑わい度</p>
        </div>
      </div>

      {/*
        街の掲示板（タスク#153）。アイソメ都市ビジュアル（タスク#150）が未実装のため、
        マップ上のマーカーとしてではなく、統計カードの下に簡易な導線として置く。
        実イラスト実装時に、マップ上の「掲示板」建物へ差し替える想定。
      */}
      <Link
        href="/roadmap/board"
        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 transition-colors hover:border-accent/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <ClipboardList className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">街の掲示板</p>
            <p className="text-xs text-zinc-500">習得した表現を検索・復習できます</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-400" />
      </Link>
    </div>
  );
}
