// 和製英語の記事（/words/〜）。記事は content/words/<slug>.md に置く（Supabaseは使わない）。
// ビルド時に読んで静的ページにするので、記事の追加・修正はアプリの再ビルドで反映される。
//
// 記事ファイルの形:
// ---
// title: 検索結果に出るタイトル
// description: 検索結果の説明文（120字くらいまで）
// word: バイキング            ← 一覧に出す見出し語（和製英語）
// answer: 食べ放題は **buffet**  ← 冒頭の答え（Markdown可・1〜2文）
// published: 2026-11-08
// updated: 2026-11-08         ← 省略可
// related: [tension, drink-bar] ← 下に出す関連記事のslug（省略可）
// draft: true                 ← 下書き。本番のビルドでは出さない（npm run dev では見える）
// ---
// 本文（Markdown）。```talk と ```phrases の2つだけ、専用の書き方がある:
//
// ```talk
// クマ: Let's go to Viking!
// アーサー: Sure. Let me grab my axe. | ええよ。斧取ってくるけん
// ```
// → 会話の吹き出し（「話す人: 英語 | 字幕」。字幕は省略可）。背景つきの「会話」のかたまりになる
//
// ```balloon
// アーサー: When you think of Vikings, you usually picture axes, right? | バイキングといえば斧のイメージだよねぇ
// ```
// → 本文の途中に置く、ひとことの吹き出し（書き方は talk と同じ。背景なし）
//
// ```phrases
// Let's go to a buffet! | 食べ放題に行こう！
// ```
// → 声に出すフレーズのカード（音声の再生つき）
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORDS_DIR = path.join(process.cwd(), "content", "words");

export type TalkLine = { speaker: string; text: string; sub?: string };
// audio: 音声のURL（/api/words/audio/…。最初に再生されたときに作って Supabase の words-audio に置く）
export type Phrase = { en: string; ja?: string; audio?: string };

export type WordBlock =
  | { type: "markdown"; source: string }
  | { type: "talk"; lines: TalkLine[] }
  | { type: "balloon"; lines: TalkLine[] }
  | { type: "phrases"; phrases: Phrase[] };

export type WordMeta = {
  slug: string;
  title: string;
  description: string;
  word: string;
  answer: string;
  published: string;
  updated?: string;
  related: string[];
  draft: boolean;
  ogImage?: string;
};

export type WordArticle = WordMeta & { blocks: WordBlock[] };

// アイキャッチのURL：フロントマターに ogImage があればそれ（ショートの一場面など）、なければ自動で作る /words/og/<slug>
export function wordEyecatch(a: { slug: string; ogImage?: string }): string {
  return a.ogImage ?? `/words/og/${a.slug}`;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// フレーズの音声のファイル名（英文のハッシュ）。英文を直すと別ファイルになり、次に再生されたときに作り直される。
export function phraseAudioName(text: string): string {
  return `${crypto.createHash("sha1").update(text.trim()).digest("hex").slice(0, 12)}.mp3`;
}

function phraseAudioUrl(slug: string, text: string): string {
  return `/api/words/audio/${slug}/${phraseAudioName(text)}`;
}

function showDrafts(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.WORDS_SHOW_DRAFTS === "1";
}

function parseValue(raw: string): string | string[] | boolean {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return v.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(src: string): { data: Record<string, string | string[] | boolean>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string | string[] | boolean> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    data[line.slice(0, i).trim()] = parseValue(line.slice(i + 1));
  }
  return { data, body: m[2] };
}

function splitSub(line: string): [string, string | undefined] {
  const i = line.indexOf("|");
  if (i < 0) return [line.trim(), undefined];
  return [line.slice(0, i).trim(), line.slice(i + 1).trim() || undefined];
}

function parseBlocks(slug: string, body: string): WordBlock[] {
  const blocks: WordBlock[] = [];
  const fence = /^```(talk|balloon|phrases)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let last = 0;
  for (const m of body.matchAll(fence)) {
    const before = body.slice(last, m.index);
    if (before.trim()) blocks.push({ type: "markdown", source: before });
    const lines = m[2].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (m[1] === "talk" || m[1] === "balloon") {
      blocks.push({
        type: m[1],
        lines: lines.map((l) => {
          const c = l.search(/[:：]/);
          const speaker = c > 0 ? l.slice(0, c).trim() : "";
          const [text, sub] = splitSub(c > 0 ? l.slice(c + 1) : l);
          return { speaker, text, sub };
        }),
      });
    } else {
      blocks.push({
        type: "phrases",
        phrases: lines.map((l) => {
          const [en, ja] = splitSub(l);
          return { en, ja, audio: phraseAudioUrl(slug, en) };
        }),
      });
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = body.slice(last);
  if (rest.trim()) blocks.push({ type: "markdown", source: rest });
  return blocks;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function readArticle(slug: string): WordArticle | null {
  if (!SLUG_PATTERN.test(slug)) return null;
  const file = path.join(WORDS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: str(data.title) || slug,
    description: str(data.description),
    word: str(data.word) || slug,
    answer: str(data.answer),
    published: str(data.published),
    updated: str(data.updated) || undefined,
    related: Array.isArray(data.related) ? data.related : [],
    draft: data.draft === true,
    ogImage: str(data.ogImage) || undefined,
    blocks: parseBlocks(slug, body),
  };
}

export function allSlugs(): string[] {
  if (!fs.existsSync(WORDS_DIR)) return [];
  return fs
    .readdirSync(WORDS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => f.replace(/\.md$/, ""))
    .filter((s) => SLUG_PATTERN.test(s));
}

// 公開する記事（本番では下書きを除く）。新しい順。
export function listWordArticles(): WordMeta[] {
  return allSlugs()
    .map(readArticle)
    .filter((a): a is WordArticle => a !== null && (!a.draft || showDrafts()))
    .map((a): WordMeta => {
      const meta: Partial<WordArticle> = { ...a };
      delete meta.blocks;
      return meta as WordMeta;
    })
    .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : a.slug.localeCompare(b.slug)));
}

export function getWordArticle(slug: string): WordArticle | null {
  const a = readArticle(slug);
  if (!a || (a.draft && !showDrafts())) return null;
  return a;
}
