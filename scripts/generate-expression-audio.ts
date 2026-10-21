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
// 表現の音声だけ作りたい場合は（Stage1練習用。例文は作らない）:
//   npx tsx scripts/generate-expression-audio.ts --fields=expression
// 日常会話のシーン（買い物・外食・旅行・友人・体調）の表現だけ作りたい場合は:
//   npx tsx scripts/generate-expression-audio.ts --fields=expression --daily
// 件数だけ確認したい（生成しない）場合は --dry-run を付ける。
// 1回に作る件数を絞りたい場合は --limit=50 のように付ける（未作成の分から先頭50件だけ作る）。
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
const dailyOnly = args.includes("--daily");
const dryRun = args.includes("--dry-run");
// 1回の実行で生成する最大件数（無料枠を少しずつ使うため。例: --limit=50）。未指定なら全件。
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.replace("--limit=", "")) : Infinity;
if (!(limit > 0)) {
  console.error("--limitには1以上の数を指定してください");
  process.exit(1);
}
const fieldsArg = args.find((a) => a.startsWith("--fields="));
const ALL_FIELDS = ["expression", "example1", "example2"] as const;
const targetFields: readonly (typeof ALL_FIELDS)[number][] = fieldsArg
  ? ALL_FIELDS.filter((f) => fieldsArg.replace("--fields=", "").split(",").map((x) => x.trim()).includes(f))
  : ALL_FIELDS;
if (targetFields.length === 0) {
  console.error("--fieldsにはexpression,example1,example2のいずれかを指定してください");
  process.exit(1);
}
// ロードマップStage1の日常会話シーン（src/components/roadmap/types.tsのSTAGE1_SCENE_OPTIONSの前半5つと同じ）
const DAILY_SCENE_TAGS = ["買い物", "外食", "旅行", "友人", "体調"];

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

// Supabaseは1回の取得が最大1000件までなので、range()でページ分けして全件取得する
// （1000件を超えると、コード順の後ろの表現が対象から漏れていた）。
async function fetchAllRows(): Promise<ExpressionRow[]> {
  const PAGE_SIZE = 1000;
  const all: ExpressionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("expressions")
      .select(
        "id, code, expression_en, example_1_en, example_2_en, audio_expression_path, audio_example_1_path, audio_example_2_path"
      )
      .eq("publish_status", "公開")
      .order("code")
      .range(from, from + PAGE_SIZE - 1);

    if (dailyOnly) {
      query = query.overlaps("scene_tags", DAILY_SCENE_TAGS);
    }

    if (onlyCodes) {
      query = query.in("code", onlyCodes);
    }

    const { data, error } = await query;
    if (error) {
      console.error("表現の取得に失敗:", error.message);
      process.exit(1);
    }
    const page = data as ExpressionRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

async function main() {
  const rows = await fetchAllRows();
  console.log(
    `対象: ${rows.length}件${onlyCodes ? ` (--only=${onlyCodes.join(",")})` : ""}${dailyOnly ? " (--daily)" : ""} / フィールド: ${targetFields.join(",")}`
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalChars = 0;

  for (const row of rows) {
    if (generated >= limit) break;
    for (const field of targetFields) {
      if (generated >= limit) break;
      const { textKey, pathKey, fileName } = FIELD_CONFIG[field];
      const text = row[textKey] as string | null;
      const existingPath = row[pathKey] as string | null;

      if (!text) continue; // example_2など未入力ならスキップ
      if (existingPath && !force) {
        skipped++;
        continue;
      }

      const storagePath = `${row.code}/${fileName}`;

      if (dryRun) {
        generated++;
        totalChars += text.length;
        continue;
      }

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

  if (dryRun) {
    console.log(`\n[dry-run] 生成予定: ${generated}件 / 約${totalChars}文字（実際には生成していません）`);
    return;
  }
  console.log(`\n完了: 生成${generated}件 / スキップ${skipped}件（既存あり） / 失敗${failed}件`);
}

main();
