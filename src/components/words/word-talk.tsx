import { ArthurAvatar } from "@/components/roadmap/arthur";
import type { TalkLine } from "@/lib/words";
import styles from "./word-article.module.css";

// 記事の吹き出し。クマは左、アーサーは右。マンガ風の吹き出し。
// WordTalk＝会話のかたまり（背景つき）、WordBalloon＝本文の途中のひとこと（背景なし）。
function Avatar({ speaker }: { speaker: string }) {
  if (speaker === "アーサー") return <ArthurAvatar size={52} />;
  if (speaker === "クマ") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/mascot/kuma-icon.png" alt="クマ" width={52} height={52} className="h-[52px] w-[52px] rounded-full bg-white ring-2 ring-[#f2d5b8]" />
    );
  }
  return <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-zinc-200 text-xs font-bold">{speaker.slice(0, 2)}</span>;
}

function TalkLineView({ line }: { line: TalkLine }) {
  const right = line.speaker === "アーサー";
  return (
    <div className={`flex items-end gap-4 ${right ? "flex-row-reverse" : ""}`}>
      <div className="flex shrink-0 flex-col items-center">
        <Avatar speaker={line.speaker} />
        <span className="mt-0.5 text-[10px] font-bold text-zinc-500">{line.speaker}</span>
      </div>
      <div className={`${styles.bubble} ${right ? styles.bubbleRight : styles.bubbleLeft} mb-4 max-w-[75%]`}>
        <p className="text-[15px] font-black leading-snug">{line.text}</p>
        {line.sub && <p className="mt-1 text-xs font-bold text-zinc-500">{line.sub}</p>}
      </div>
    </div>
  );
}

export function WordTalk({ lines }: { lines: TalkLine[] }) {
  return (
    <div className="my-6 space-y-4 rounded-3xl bg-[#fff1c9]/50 px-3 py-5">
      {lines.map((line, i) => (
        <TalkLineView key={i} line={line} />
      ))}
    </div>
  );
}

export function WordBalloon({ lines }: { lines: TalkLine[] }) {
  return (
    <div className="my-5 space-y-3">
      {lines.map((line, i) => (
        <TalkLineView key={i} line={line} />
      ))}
    </div>
  );
}
