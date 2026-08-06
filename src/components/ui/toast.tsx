"use client";

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

type ToastProps = {
  message: string;
  onClose: () => void;
  durationMs?: number;
};

// 生成完了などの一時的な完了通知用。画面右下に出て、数秒後に自動で消える。
export function Toast({ message, onClose, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2.5 rounded-lg border border-accent/30 bg-white px-4 py-3 text-sm text-zinc-900 shadow-lg shadow-zinc-300/40">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-700"
        aria-label="閉じる"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
