// 色の実（習得したシナリオのシーンごとに1つ手に入る持ち物）と、個体の色づけの定義。
// サーバー・ブラウザの両方から使うので、ブラウザ専用の処理は書かない。
//
// 色づけは、その個体の絵の「全部の色の色相」を同じ角度だけ回す（CSSのhue-rotate）。
// 体・羽・ツノの色の違いはそのまま保たれ、全体の色味だけが変わる。
// 回す角度はシーンごとに決まっていて、元の色によって仕上がりの色は変わる。

import { KUWAGATA_BASE_HUE } from "./kuwagata-base-hue";

export const ITEM_TYPE_SHIZUKU = "shizuku";

// 色の実が出るシーン（scene_tag）。Stage5（8）→Stage4（12）の順。
// 並び順は色の角度の決め方に使うので、途中に挿入せず、末尾に足す。
export const SHIZUKU_SCENES = [
  // Stage5
  "住まい・手続き",
  "銀行・契約",
  "生活サービス",
  "トラブル対応",
  "プレゼン・面接",
  "交渉・依頼",
  "会議・報告",
  "電話・メール",
  // Stage4
  "旅行",
  "外食",
  "買い物",
  "友人",
  "体調",
  "雑談",
  "会議",
  "メール",
  "電話",
  "プレゼン",
  "交渉",
  "依頼・断り",
] as const;

// 隣り合うシーンの角度が大きく離れるように、7刻み（18°×7=126°）で散らす。
// 20個で1周するので、20個までは角度が重ならない。
const HUE_STEP_DEG = 18;
const HUE_SPREAD = 7;

export function isShizukuScene(key: string): boolean {
  return (SHIZUKU_SCENES as readonly string[]).includes(key);
}

// そのシーンの色の、色相を回す角度（度）。未知のシーンはnull。
export function shizukuHueDeg(key: string): number | null {
  const index = (SHIZUKU_SCENES as readonly string[]).indexOf(key);
  if (index < 0) return null;
  const slot = (index * HUE_SPREAD) % SHIZUKU_SCENES.length;
  // 0°（変化なし）は避けて、1つ目から始める
  return ((slot + 1) * HUE_STEP_DEG) % 360;
}

// 色の実そのものの色相（度）。実のイラスト（オレンジ）を shizukuHueDeg だけ回した色になる。
const FRUIT_BASE_HUE = 35;
export function shizukuTargetHue(key: string): number | null {
  const deg = shizukuHueDeg(key);
  return deg === null ? null : (FRUIT_BASE_HUE + deg) % 360;
}

// 色づけした個体に当てるCSSのfilter。色づけなし・未知のキーはundefined。
// speciesCodeを渡すと、その種の体のおもな色が、色の実と同じ色相になるように回す角度を決める
// （体と羽の色の違いは保たれる）。灰色が主体の種は、いったんセピア色にしてから回す。
// 渡さない場合（実そのもののイラストなど）は、色の実ごとの固定の角度で回す。
export function tintFilter(key: string | null | undefined, speciesCode?: string): string | undefined {
  if (!key) return undefined;
  const deg = shizukuHueDeg(key);
  if (deg === null) return undefined;
  if (speciesCode && speciesCode in KUWAGATA_BASE_HUE) {
    const target = shizukuTargetHue(key);
    const base = KUWAGATA_BASE_HUE[speciesCode];
    if (target !== null) {
      if (base === null) {
        // セピア色の色相はおよそ38度
        return `sepia(1) saturate(1.6) hue-rotate(${(((target - 38) % 360) + 360) % 360}deg)`;
      }
      return `hue-rotate(${(((target - base) % 360) + 360) % 360}deg)`;
    }
  }
  return `hue-rotate(${deg}deg)`;
}

// 持ち物一覧・演出で色の実の「しるし」に使う色（実そのものの色）。
export function shizukuSwatchColor(key: string): string {
  return `hsl(${shizukuTargetHue(key) ?? 0} 80% 55%)`;
}

export type KuwagataItem = {
  itemType: string;
  itemKey: string;
  quantity: number;
};
