import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getWordArticle, listWordArticles } from "@/lib/words";

// 和製英語の記事のアイキャッチ（OGP兼用、1200×630）。記事の見出し語と、会話のクマの最初のセリフから自動で作る。
// 答えは出さない（「英語で言うと…？」で止めて、続きを読んでもらう）。ビルド時に静的なPNGになる。
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return listWordArticles().map((a) => ({ slug: a.slug }));
}

const ASSETS = path.join(process.cwd(), "assets", "words-og");
const dataUrl = (file: string) => `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, file)).toString("base64")}`;

const INK = "#3c2819";
const RED = "#e5215a";

function bubbleLine(slug: string): string {
  const a = getWordArticle(slug);
  for (const b of a?.blocks ?? []) {
    if (b.type !== "talk") continue;
    const line = b.lines.find((l) => l.speaker === "クマ");
    if (line) return line.text;
  }
  return "";
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getWordArticle(slug);
  if (!a) return new Response("Not found", { status: 404 });

  const word = a.word;
  const bubble = bubbleLine(slug);
  // 見出し語は左の幅520pxに収める（右の吹き出しと重ねない）
  const wordSize = Math.min(128, Math.floor(520 / Math.max(word.length, 1)));
  // 吹き出しは1行に収める（全角1文字＝1、半角＝0.55で幅を見積もる）
  const bubbleUnits = [...bubble].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);
  const bubbleSize = Math.min(38, Math.floor(470 / Math.max(bubbleUnits, 1)));
  const bubbleTop = 96;
  const bubbleHeight = bubbleSize * 1.3 + 32 + 10;
  const font = fs.readFileSync(path.join(ASSETS, "NotoSansJP-Black-subset.otf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#ffdbe5",
          color: INK,
          fontFamily: "NotoJP",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 22, background: RED }} />
        <div style={{ position: "absolute", left: 70, top: 76, fontSize: 34, color: RED, display: "flex" }}>英語で通じない和製英語</div>
        <div style={{ position: "absolute", left: 62, top: 128, width: 580, fontSize: wordSize, lineHeight: 1.15, letterSpacing: -3, display: "flex" }}>
          {word}
        </div>
        <div style={{ position: "absolute", left: 70, top: 132 + wordSize * 1.15 + 34, fontSize: 46, display: "flex" }}>英語で言うと…？</div>
        <div style={{ position: "absolute", left: 70, top: 536, fontSize: 30, color: "#9b6b7a", display: "flex" }}>英クワたん</div>

        {bubble && (
          <div
            style={{
              position: "absolute",
              right: 60,
              top: bubbleTop,
              display: "flex",
              background: "#fff",
              border: `5px solid ${INK}`,
              borderRadius: 34,
              padding: "16px 28px",
              fontSize: bubbleSize,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
            }}
          >
            {bubble}
          </div>
        )}
        {/* 吹き出しのしっぽ。クマの頭の上（x≈790）に固定 */}
        {bubble && (
          <div
            style={{
              position: "absolute",
              left: 780,
              top: bubbleTop + bubbleHeight - 20,
              width: 30,
              height: 30,
              background: "#fff",
              borderRight: `5px solid ${INK}`,
              borderBottom: `5px solid ${INK}`,
              transform: "rotate(45deg)",
            }}
          />
        )}

        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={dataUrl("kuma.png")} width={300} height={300} style={{ position: "absolute", left: 650, top: 300 }} />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={dataUrl("arthur.png")} width={330} height={330} style={{ position: "absolute", left: 880, top: 270 }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "NotoJP", data: font, weight: 900, style: "normal" }],
    }
  );
}
