import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWordArticle, phraseAudioName } from "@/lib/words";

// 和製英語の記事の「声に出すフレーズ」の音声。
// 最初に再生されたときに Google Cloud TTS で作って Supabase Storage（公開バケット words-audio）に置き、
// 以後はそのファイルへ転送するだけ。読ませられるのは記事に書いてあるフレーズだけ（勝手な文は作らない）。
// 声は表現の音声（scripts/generate-expression-audio.ts）と同じ en-US-Neural2-D。
export const dynamic = "force-dynamic";

const BUCKET = "words-audio";
const VOICE_NAME = "en-US-Neural2-D";
const NAME_PATTERN = /^[0-9a-f]{12}\.mp3$/;

// 同じ音声を同時に何度も作らないように（このサーバーの中だけ）
const inFlight = new Map<string, Promise<void>>();

async function exists(objectPath: string): Promise<boolean> {
  const [dir, name] = objectPath.split("/");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 1 });
  return !error && (data ?? []).some((o) => o.name === name);
}

async function synthesize(text: string): Promise<Buffer> {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new Error("GOOGLE_TTS_API_KEY が未設定");
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "en-US", name: VOICE_NAME },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) throw new Error(`Google Cloud TTS失敗 (${res.status}): ${await res.text()}`);
  return Buffer.from(((await res.json()) as { audioContent: string }).audioContent, "base64");
}

async function create(objectPath: string, text: string): Promise<void> {
  const audio = await synthesize(text);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`音声の保存に失敗: ${error.message}`);
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  if (!NAME_PATTERN.test(name)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const article = getWordArticle(slug);
  const phrase = article?.blocks
    .flatMap((b) => (b.type === "phrases" ? b.phrases : []))
    .find((p) => phraseAudioName(p.en) === name);
  if (!phrase) return NextResponse.json({ error: "not found" }, { status: 404 });

  const objectPath = `${slug}/${name}`;
  try {
    if (!(await exists(objectPath))) {
      let job = inFlight.get(objectPath);
      if (!job) {
        job = create(objectPath, phrase.en).finally(() => inFlight.delete(objectPath));
        inFlight.set(objectPath, job);
      }
      await job;
    }
  } catch (e) {
    console.error("[words-audio]", e);
    return NextResponse.json({ error: "音声を用意できませんでした" }, { status: 503 });
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
  const res = NextResponse.redirect(data.publicUrl, 302);
  // 同じ英文なら中身は変わらないので、ブラウザに1日覚えてもらう
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
