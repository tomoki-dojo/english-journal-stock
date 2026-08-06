// 例文音声の一括生成スクリプト（使い捨て・手動実行用）
// 実行: npx tsx scripts/generate-expression-audio.ts
//
// 事前準備:
//   1. .env.localに GOOGLE_TTS_API_KEY を設定（Google CloudでText-to-Speech APIを有効化し、APIキーを発行）
//   2. Supabase側で _reference/expressions_add_audio_2026-08-01.sql を実行済みであること
//      （audio_*_path列・expression-audioバケットの作成）
//
// デフォルトでは「まだ音声が無い行」だけを対象に生成する（何度実行しても安全・再実行可）。
// 特定の表現だけ対象にしたい場合は: npx tsx scripts/generate-expression-audio.ts --only=EX-0001,EX-0003
// 既存の音声を作り直したい場合は:   npx tsx scripts/generate-expression-audio.ts --force
//
// 音声量の目安: 50件×最大3フィールド×数十文字なので、Google Cloud TTSの無料枠
// （Neural2ボイスで月100万文字まで無料）に収まる想定。心配なら--onlyで数件ずつ試すこと。

import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
// Node 20以下にはネイティブWebSocketが無く、supabase-jsのRealtimeクライアント初期化が
// 落ちてしまうため、wsパッケージで補ってやる（このスクリプトはRealtimeを使わないが、
// createClient()の内部で無条件に初期化されるため必要）。Node 22+に上げれば本来は不要。
import WebSocket from "ws";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URLとSUPABASE_SERVICE_ROLE_KEYを.env.localに設定してください");
  process.exit(1);
}
if (!GOOGLE_TTS_API_KEY) {
  console.error("GOOGLE_TTS_API_KEYを.env.localに設定してください（Google CloudのText-to-Speech APIキー）");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: WebSocket as any },
});

const AUDIO_BUCKET = "expression-audio";
const VOICE_NAME = "en-US-Neural2-D";
const LANGUAGE_CODE = "en-US";

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const onlyCodes = onlyArg ? onlyArg.replace("--only=", "").split(",").map((c) => c.trim()) : null;

type ExpressionRow = {
  id: string;
  code: string;
  expression_en: string;
  example_1_en: string | null;
  example_2_en: string | null;
  audio_expression_path: string | null;
  audio_example_1_path: string | null;
  audio_example_2_path: string | null;
};

type Field = "expression" | "example1" | "example2";

const FIELD_CONFIG: Record<
  Field,
  { textKey: keyof ExpressionRow; pathKey: keyof ExpressionRow; fileName: string }
> = {
  expression: { textKey: "expression_en", pathKey: "audio_expression_path", fileName: "expression.mp3" },
  example1: { textKey: "example_1_en", pathKey: "audio_example_1_path", fileName: "example1.mp3" },
  example2: { textKey: "example_2_en", pathKey: "audio_example_2_path", fileName: "example2.mp3" },
};

async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: LANGUAGE_CODE, name: VOICE_NAME },
        audioConfig: { audioEncoding: "MP3" },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Cloud TTS失敗 (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { audioContent: string };
  return Buffer.from(json.audioContent, "base64");
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let query = supabase
    .from("expressions")
    .select(
      "id, code, expression_en, example_1_en, example_2_en, audio_expression_path, audio_example_1_path, audio_example_2_path"
    )
    .eq("publish_status", "公開")
    .order("code");

  if (onlyCodes) {
    query = query.in("code", onlyCodes);
  }

  const { data, error } = await query;
  if (error) {
    console.error("表現の取得に失敗:", error.message);
    process.exit(1);
  }

  const rows = data as ExpressionRow[];
  console.log(`対象: ${rows.length}件${onlyCodes ? ` (--only=${onlyCodes.join(",")})` : ""}`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    for (const field of Object.keys(FIELD_CONFIG) as Field[]) {
      const { textKey, pathKey, fileName } = FIELD_CONFIG[field];
      const text = row[textKey] as string | null;
      const existingPath = row[pathKey] as string | null;

      if (!text) continue; // example_2など未入力ならスキップ
      if (existingPath && !force) {
        skipped++;
        continue;
      }

      const storagePath = `${row.code}/${fileName}`;

      try {
        console.log(`生成中: ${row.code} / ${field} — "${text.slice(0, 40)}${text.length > 40 ? "..." : ""}"`);
        const audioBuffer = await synthesize(text);

        const { error: uploadError } = await supabase.storage
          .from(AUDIO_BUCKET)
          .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

        if (uploadError) throw new Error(`アップロード失敗: ${uploadError.message}`);

        const { error: updateError } = await supabase
          .from("expressions")
          .update({ [pathKey]: storagePath })
          .eq("id", row.id);

        if (updateError) throw new Error(`DB更新失敗: ${updateError.message}`);

        generated++;
        await sleep(300); // API負荷を抑えるための軽いウェイト
      } catch (err) {
        failed++;
        console.error(`✗ ${row.code} / ${field}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`\n完了: 生成${generated}件 / スキップ${skipped}件（既存あり） / 失敗${failed}件`);
}

main();
