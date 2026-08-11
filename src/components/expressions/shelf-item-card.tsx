import { AudioPlayButton } from "./audio-play-button";
import type { Expression, Level } from "./types";
import type { Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const levelBadgeClasses: Record<Level, string> = {
  初級: "bg-emerald-500/10 text-emerald-700",
  中級: "bg-amber-500/10 text-amber-700",
  上級: "bg-rose-500/10 text-rose-700",
};

type ShelfItemCardProps = {
  expression: Expression;
  plan: Plan;
  loggedIn?: boolean;
};

// ホーム画面の棚（横スクロール）で使う、簡易版の表現カード。
// 一覧画面のExpressionCardと違い、展開・保存は行わず「気になったら覗ける」程度に留める。
export function ShelfItemCard({ expression, plan, loggedIn = true }: ShelfItemCardProps) {
  return (
    <div className="flex w-[220px] shrink-0 flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 transition-colors hover:border-accent/40">
      <div>
        <p className="text-sm font-semibold leading-snug text-zinc-900">
          {expression.expressionEn}
        </p>
        {expression.meaningJa && (
          <p className="mt-1.5 line-clamp-2 text-xs text-zinc-500">{expression.meaningJa}</p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-medium",
            levelBadgeClasses[expression.level]
          )}
        >
          {expression.level}
        </span>
        <AudioPlayButton
          expressionId={expression.id}
          field="expression"
          plan={plan}
          loggedIn={loggedIn}
          hasAudio={expression.hasAudioExpression}
        />
      </div>
    </div>
  );
}
