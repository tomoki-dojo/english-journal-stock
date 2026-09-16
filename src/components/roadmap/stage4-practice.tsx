"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, PartyPopper, RotateCcw, Square, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { ARTHUR_NAME, ArthurAvatar } from "./arthur";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import {
  STAGE4_TURN_COUNT,
  type Stage4Scenario,
  type Stage4ScenarioListItem,
  type Stage4Turn,
  type Stage4TurnResult,
  type Stage4UsageInfo,
} from "./types";

type ViewState = "loading" | "picker" | "chat" | "limit_exceeded" | "error";
type AnswerPhase = "prompt" | "review" | "sending";

const STAGE_COLOR = STAGE_COLORS[4];

// Stage4（AIロールプレイ）の練習画面。Stage1〜3の「表現プールから動的に出題」とは違い、
// 固定シナリオ（stage4_scenarios）の一覧からユーザーがシーンを選んで会話する方式
// （2026-09-12 設計・_reference/speaking-roadmap-design.md参照）。
// 1セッション＝固定5ターンの会話。会話履歴はクライアント側で保持し、ターンごとにサーバーへ
// 丸ごと送る完全ステートレス設計（サーバーはDBに会話ログを一切保存しない）。
export function Stage4Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [scenarios, setScenarios] = useState<Stage4ScenarioListItem[]>([]);
  const [usage, setUsage] = useState<Stage4UsageInfo | null>(null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 選択中のシナリオと、進行中の会話状態
  const [activeScenario, setActiveScenario] = useState<Stage4Scenario | null>(null);
  const [history, setHistory] = useState<Stage4Turn[]>([]);
  const [turnIndex, setTurnIndex] = useState(1);
  const [answerPhase, setAnswerPhase] = useState<AnswerPhase>("prompt");
  const [manualText, setManualText] = useState("");
  const [sessionResult, setSessionResult] = useState<Stage4TurnResult | null>(null);

  const speech = useSpeechRecognition();

  async function loadScenarios() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/roadmap/stage4/scenarios", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "シナリオ一覧の取得に失敗しました");
      }
      setScenarios(json.scenarios as Stage4ScenarioListItem[]);
      setUsage(json.usage as Stage4UsageInfo);
      setState("picker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "シナリオ一覧の取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    loadScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (speech.status === "idle" && speech.transcript && answerPhase === "prompt") {
      setManualText(speech.transcript);
      setAnswerPhase("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.status, speech.transcript]);

  function startScenario(scenario: Stage4ScenarioListItem) {
    setActiveScenario(scenario);
    setHistory([{ role: "ai", text: scenario.openingLineEn }]);
    setTurnIndex(1);
    setSessionResult(null);
    setAnswerPhase("prompt");
    setManualText("");
    speech.reset();
    setState("chat");
  }

  function backToPicker() {
    setActiveScenario(null);
    setSessionResult(null);
    loadScenarios();
  }

  function retrySpeaking() {
    setManualText("");
    speech.reset();
    setAnswerPhase("prompt");
  }

  async function submitTurn() {
    if (!activeScenario || manualText.trim().length === 0) return;
    setAnswerPhase("sending");
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage4/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: activeScenario.id,
          turnIndex,
          history,
          userUtterance: manualText.trim(),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setLimit(json.limit ?? 0);
          setState("limit_exceeded");
          return;
        }
        throw new Error(json.error ?? "会話処理に失敗しました");
      }

      const result = json as Stage4TurnResult;
      const nextHistory: Stage4Turn[] = [
        ...history,
        { role: "user", text: manualText.trim() },
        { role: "ai", text: result.aiReplyEn },
      ];
      setHistory(nextHistory);
      setUsage(result.usage);

      if (result.sessionComplete) {
        setSessionResult(result);
      } else {
        setTurnIndex((i) => i + 1);
        setManualText("");
        speech.reset();
        setAnswerPhase("prompt");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話処理に失敗しました");
      setAnswerPhase("review");
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  if (state === "error") {
    return <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>;
  }

  if (state === "limit_exceeded") {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
        <p className="text-sm text-zinc-700">今日のセッションは{limit}回まで使い切りました。</p>
        <p className="mt-1 text-xs text-zinc-400">また明日挑戦できます。Proにすると上限が大きく緩和されます。</p>
        <Link
          href="/roadmap"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          街に戻る
        </Link>
      </div>
    );
  }

  if (state === "picker") {
    const usageLabel = usage ? `今日のセッション あと${usage.remaining}回` : "";
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700">話すシーンを選んでください</p>
          {usageLabel && <span className="text-xs text-zinc-400">{usageLabel}</span>}
        </div>

        {scenarios.length === 0 ? (
          <p className="text-sm text-zinc-400">現在、選べるシナリオがありません。</p>
        ) : (
          <div className="flex flex-col gap-3">
            {scenarios.map((scenario) => {
              const disabled = usage ? usage.remaining <= 0 : false;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => startScenario(scenario)}
                  className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GrowthBadge stage={4} warmth={scenario.warmth} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{scenario.titleJa}</p>
                      <span className="rounded-full bg-zinc-200/70 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        {scenario.sceneTag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{scenario.situationJa}</p>
                    {scenario.status === "習得済み" && (
                      <p className="mt-1.5 text-xs font-medium" style={{ color: STAGE_COLOR }}>
                        話せるようになりました
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!activeScenario) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  if (sessionResult) {
    return (
      <div>
        <RoundHeader stage={4} subFormatLabel={activeScenario.titleJa} usageLabel={usage ? `今日のセッション あと${usage.remaining}回` : ""} />
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 text-center">
          <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: sessionResult.overallPass ? STAGE_COLOR : "#a1a1aa" }} />
          <p className="text-sm font-medium text-zinc-800">
            {sessionResult.overallPass ? "会話を通じてゴールを達成できました" : "もう少しでゴール達成です"}
          </p>
          <p className="mt-2 text-sm text-zinc-600">{sessionResult.feedbackJa}</p>

          {sessionResult.graduated && (
            <div className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <PartyPopper className="h-4 w-4" />
              このシナリオ、話せるようになりました
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => startScenario({ ...activeScenario, status: "練習中", warmth: 0 })}
              style={{ backgroundColor: STAGE_COLOR }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97]"
            >
              もう一度話す
            </button>
            <button
              type="button"
              onClick={backToPicker}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97]"
            >
              シーン一覧に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const usageLabel = usage ? `今日のセッション あと${usage.remaining}回` : "";

  return (
    <div>
      <RoundHeader stage={4} subFormatLabel={activeScenario.titleJa} usageLabel={usageLabel} />

      <div
        className="mb-3 rounded-xl border p-4"
        style={{ borderColor: withAlpha(STAGE_COLOR, "40"), backgroundColor: withAlpha(STAGE_COLOR, "0d") }}
      >
        <p className="text-xs text-zinc-500">{activeScenario.situationJa}</p>
        <p className="mt-1 text-xs font-medium text-zinc-600">ゴール：{activeScenario.goalJa}</p>
      </div>

      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
        {history.map((turn, i) => (
          <div key={i} className={cn("flex items-start gap-2", turn.role === "user" && "flex-row-reverse")}>
            {turn.role === "ai" ? (
              <ArthurAvatar size={24} />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
                <User2 className="h-3.5 w-3.5" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-1.5 text-sm",
                turn.role === "ai" ? "bg-zinc-100 text-zinc-800" : "text-white"
              )}
              style={turn.role === "user" ? { backgroundColor: STAGE_COLOR } : undefined}
            >
              {turn.role === "ai" && (
                <p className="mb-0.5 text-[10px] font-semibold" style={{ color: STAGE_COLOR }}>
                  {ARTHUR_NAME}
                </p>
              )}
              {turn.text}
            </div>
          </div>
        ))}
      </div>

      <p className="mb-2 text-center text-xs text-zinc-400">
        {turnIndex}/{STAGE4_TURN_COUNT}ターン目
      </p>

      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4">
        {answerPhase === "prompt" && (
          <div className="text-center">
            {speech.status === "unsupported" ? (
              <div>
                <p className="mb-2 text-xs text-zinc-400">
                  お使いのブラウザは音声入力に対応していないため、テキストで入力してください。
                </p>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="声に出す代わりに、ここに英文を入力"
                  rows={2}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={manualText.trim().length === 0}
                  onClick={() => setAnswerPhase("review")}
                  style={{ backgroundColor: STAGE_COLOR }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
                >
                  この内容で進む
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={speech.status === "listening" ? speech.stop : speech.start}
                style={{ backgroundColor: speech.status === "listening" ? "#dc2626" : STAGE_COLOR }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                {speech.status === "listening" ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>
            )}
            <p className="mt-3 text-xs text-zinc-400">
              {speech.status === "listening" ? "聞き取り中...もう一度タップで終了" : "タップして声に出す"}
            </p>
            {speech.errorMessage && <p className="mt-2 text-xs text-red-600">{speech.errorMessage}</p>}
          </div>
        )}

        {(answerPhase === "review" || answerPhase === "sending") && (
          <div className="animate-question-card-enter">
            <p className="mb-1.5 text-xs text-zinc-400">この内容で送ります（間違っていれば修正できます）</p>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={answerPhase === "sending"}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                disabled={answerPhase === "sending" || manualText.trim().length === 0}
                onClick={submitTurn}
                style={{ backgroundColor: STAGE_COLOR }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
              >
                {answerPhase === "sending" ? "送信中..." : "送る"}
              </button>
              <button
                type="button"
                disabled={answerPhase === "sending"}
                onClick={retrySpeaking}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                言い直す
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
