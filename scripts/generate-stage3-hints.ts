// Stage3「ヒント付き言い換え」の穴埋めヒントの一括生成スクリプト（手動実行・再実行可）
// 実行: npx tsx scripts/generate-stage3-hints.ts
//
// 公開中で stage3_hint_blank_en が未生成の表現だけを対象に、Claude(Haiku)で生成してDBに保存する。
// 何度実行しても安全（生成済みはスキップ）。新しい表現を追加したあとに実行しておけば、
// 本番でユーザーが初めて出会ったときのAI生成待ちが無くなる。
// 件数だけ確認したい場合は --dry-run。同時実行数は --concurrency=5（既定）。
//
// 事前準備: .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY。

import dotenv from "dotenv";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
// Node 20以下にはネイティブWebSocketが無くsupabase-jsの初期化が落ちるためwsで補う（generate-expression-audio.tsと同じ理由）。
import WebSocket from "ws";
import {
  buildHintBlankSystemPrompt,
  buildHintBlankUserPrompt,
  parseHintBlankJson,
} from "../src/lib/stage3-hint-blank-prompt";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5-20251001";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY を .env.local に設定してください");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 5);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: WebSocket as any },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type Row = { id: string; code: string; expression_en: string; meaning_ja: string | null };

async function fetchTargets(): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("expressions")
      .select("id, code, expression_en, meaning_ja")
      .eq("publish_status", "公開")
      .is("stage3_hint_blank_en", null)
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`取得に失敗: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function generate(row: Row): Promise<string | null> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildHintBlankSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildHintBlankUserPrompt({ expressionEn: row.expression_en, meaningJa: row.meaning_ja ?? "" }),
      },
    ],
  });
  const block = message.content[0];
  const raw = block?.type === "text" ? block.text : "";
  return parseHintBlankJson(raw, row.expression_en);
}

async function main() {
  const targets = await fetchTargets();
  console.log(`未生成: ${targets.length}件${dryRun ? "（--dry-run のため生成しません）" : ""}`);
  if (dryRun || targets.length === 0) return;

  let done = 0;
  let saved = 0;
  const failed: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const row = targets[cursor++];
      try {
        const blanked = await generate(row);
        if (!blanked) {
          failed.push(`${row.code}（生成結果が不正）`);
        } else {
          const { error } = await supabase.from("expressions").update({ stage3_hint_blank_en: blanked }).eq("id", row.id);
          if (error) failed.push(`${row.code}（保存失敗: ${error.message}）`);
          else saved++;
        }
      } catch (error) {
        failed.push(`${row.code}（${error instanceof Error ? error.message.slice(0, 80) : String(error)}）`);
      }
      done++;
      if (done % 50 === 0 || done === targets.length) console.log(`  ${done}/${targets.length}（保存${saved}・失敗${failed.length}）`);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  console.log(`完了: 保存${saved}件 / 失敗${failed.length}件`);
  if (failed.length > 0) {
    console.log("失敗した表現（もう一度実行すると再挑戦します）:");
    failed.forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
