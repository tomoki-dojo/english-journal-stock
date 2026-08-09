// ダッシュボードのホーム画面（今日のピックアップ・シーン別の棚）で使う、
// 日替わりローテーションのロジック。
//
// 同じ日（JST基準）であれば全ユーザーに同じ内容が表示されるよう、
// 日付文字列から作った決定的なシード値で選択を行う（乱数は使わない）。

import type { Expression, SceneTag } from "@/components/expressions/types";
import { SceneTagValues } from "@/components/expressions/types";

const SHELVES_PER_DAY = 3;
const ITEMS_PER_SHELF = 3;

// JSTでの「今日」をYYYY-MM-DD形式で返す。
export function getTodayDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(date);
}

// 文字列から決定的な整数シードを作る（同じ入力なら常に同じ値）。
function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// その日に表示するシーンを、全シーンを順番に回しながら決定的に選ぶ。
// 例: 7シーン中3つずつなら、約2〜3日で全シーンが一巡する。
export function pickTodaysScenes(dateKey: string, count = SHELVES_PER_DAY): SceneTag[] {
  const total = SceneTagValues.length;
  const startIndex = hashKey(dateKey) % total;
  const scenes: SceneTag[] = [];
  for (let i = 0; i < Math.min(count, total); i++) {
    scenes.push(SceneTagValues[(startIndex + i) % total]);
  }
  return scenes;
}

// 指定シーン内で、その日ごとに表示するアイテムをローテーションして選ぶ。
export function pickShelfItems(
  expressions: Expression[],
  scene: SceneTag,
  dateKey: string,
  count = ITEMS_PER_SHELF
): Expression[] {
  const pool = expressions
    .filter((expression) => expression.sceneTags.includes(scene))
    .sort((a, b) => a.code.localeCompare(b.code));

  if (pool.length === 0) return [];

  const offset = hashKey(`${dateKey}:${scene}`) % pool.length;
  const result: Expression[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    result.push(pool[(offset + i) % pool.length]);
  }
  return result;
}

// 「今日のピックアップ」を全表現から1件、日替わりで選ぶ。
export function pickTodaysHighlight(expressions: Expression[], dateKey: string): Expression | null {
  if (expressions.length === 0) return null;

  const sorted = [...expressions].sort((a, b) => a.code.localeCompare(b.code));
  const index = hashKey(`${dateKey}:highlight`) % sorted.length;
  return sorted[index];
}
