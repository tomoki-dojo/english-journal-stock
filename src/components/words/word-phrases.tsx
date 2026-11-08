"use client";

import { useRef } from "react";
import { Volume2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import type { Phrase } from "@/lib/words";

// 声に出すフレーズ。音声は scripts/generate-words-audio.ts で作ったmp3（アプリの表現と同じ声）。
// 音声がまだ無いフレーズは、再生ボタンを出さない。
export function WordPhrases({ phrases, slug }: { phrases: Phrase[]; slug: string }) {
  const playing = useRef<HTMLAudioElement | null>(null);

  const play = (src: string) => {
    playing.current?.pause();
    const audio = new Audio(src);
    playing.current = audio;
    void audio.play().catch(() => {});
    trackEvent("word_phrase_listen", { slug });
  };

  return (
    <ul className="words-plain my-5 space-y-2">
      {phrases.map((p) => (
        <li key={p.en} className="flex items-center gap-3 rounded-2xl border-2 border-[#f2d5b8] bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black leading-snug">{p.en}</p>
            {p.ja && <p className="text-sm font-semibold text-zinc-500">{p.ja}</p>}
          </div>
          {p.audio && (
            <button
              type="button"
              onClick={() => play(p.audio!)}
              aria-label={`${p.en} を聞く`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1c9] text-[#e5215a] transition-transform active:scale-95"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
