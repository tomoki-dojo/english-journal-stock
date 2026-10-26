// Stage5の限定種。シーン（scene_tag）ごとに1種で、そのシーンのシナリオを習得するたびに卵が1つ届く。
// クワたんシリーズ扱い（kind=known）なので、Free棚の新種の枠には入らず、採集の抽選にも出ない。
// KW-0059以外は、今は仮の名前・仮の絵（既存の種の絵の複製）。本番の名前・絵ができたら、DBのnameと
// public/roadmap/kuwagata の絵、kuwagata-shelf.tsx の KNOWN_CREATURE_ART を差し替える。
export const LIMITED_SPECIES_BY_SCENE: Record<string, string> = {
  "住まい・手続き": "KW-0059", // ジュウクワたん（絵あり・卵/幼虫/蛹つき）
  "銀行・契約": "KW-0060", // ケイクワたん（絵あり・卵/幼虫/蛹つき）
  "生活サービス": "KW-0061", // ジョウクワたん（絵あり・卵/幼虫/蛹つき）
  "トラブル対応": "KW-0062", // タスクワたん（絵あり・卵/幼虫/蛹つき）
  "プレゼン・面接": "KW-0063", // プレクワたん（絵あり・卵/幼虫/蛹つき）
  "交渉・依頼": "KW-0064", // ネゴクワたん（絵あり・卵/幼虫/蛹つき）
  "会議・報告": "KW-0065", // モウクワたん（絵あり・卵/幼虫/蛹つき）
  "電話・メール": "KW-0066", // テレクワたん（絵あり・卵/幼虫/蛹つき）
};

export const LIMITED_SPECIES_CODES = Object.values(LIMITED_SPECIES_BY_SCENE);

// 台帳（kuwagata_egg_events）のキー。シナリオごとに1つなので、同じシナリオで二重に配られない。
export const LIMITED_EVENT_PREFIX = "limited:";
