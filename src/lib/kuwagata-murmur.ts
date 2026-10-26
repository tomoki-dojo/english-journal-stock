// 水槽の成虫が頭の上に出す「英語のつぶやき」。習得したStage1の表現から選ぶ。
// 色の実で色づけした個体は、そのシーンに近い表現を優先してつぶやく。

export type Murmur = {
  id: string;
  en: string;
  ja: string;
  sceneTags: string[];
};

// 色の実のシーン → 表現のシーンタグ。Stage4の12シーンは表現のタグと同じ名前。
// Stage5のシーンは近いタグに寄せる（住まい・手続き／銀行・契約／生活サービスは対応するタグがないので、優先なし）。
const TAGS_BY_TINT: Record<string, string[]> = {
  "トラブル対応": ["依頼・断り"],
  "プレゼン・面接": ["プレゼン"],
  "交渉・依頼": ["交渉", "依頼・断り"],
  "会議・報告": ["会議"],
  "電話・メール": ["電話", "メール"],
};

export function preferredTagsOf(tintKey: string | null): string[] {
  if (!tintKey) return [];
  return TAGS_BY_TINT[tintKey] ?? [tintKey];
}

// つぶやく表現を1つ選ぶ。色づけ個体は、そのシーンの表現が約7割。直前と同じものは避ける。
export function pickMurmur(murmurs: Murmur[], tintKey: string | null, previousId: string | null): Murmur | null {
  if (murmurs.length === 0) return null;
  const tags = preferredTagsOf(tintKey);
  const preferred = tags.length > 0 ? murmurs.filter((m) => m.sceneTags.some((t) => tags.includes(t))) : [];
  const pool = preferred.length > 0 && Math.random() < 0.7 ? preferred : murmurs;
  const candidates = pool.length > 1 ? pool.filter((m) => m.id !== previousId) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}
