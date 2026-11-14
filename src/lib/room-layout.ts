// 部屋（アーサーの飼育部屋）のスマホ用の配置。部屋の画面（components/roadmap/roadmap-room.tsx）と
// シェアカードの背景（components/share/share-card.tsx）で同じ並びを使うため、ここにまとめている。
// left・top は道具の中心の位置（背景の幅・高さに対する%）、widthPct は道具の幅（背景の幅に対する%）。

// スマホ(sm未満)用の縦長(3:4)背景（1081×1441）
export const ROOM_BG_MOBILE_URL = "/roadmap/room/room_bg_mobile.webp";
export const ROOM_BG_MOBILE_ASPECT = 1081 / 1441;

// スマホ(sm未満)用の縦長(3:4)背景に合わせた配置。
export const MOBILE_PLACEMENT: Record<string, { left: number; top: number; widthPct: number }> = {
  // 左右の矢印(画面の端)に重ならないよう、アイテムの中心は左右18〜82%の内側に置く。
  board: { left: 30, top: 15.5, widthPct: 49.6 },
  stage3: { left: 77, top: 19.5, widthPct: 19.6 },
  stage2: { left: 22, top: 50, widthPct: 14 },
  // 単語ノートの下端を、机の奥の縁(背景の上から50%)に合わせる。
  notebook: { left: 73, top: 40.3, widthPct: 26.5 },
  stage5: { left: 47, top: 51, widthPct: 20 },
  stage1: { left: 66, top: 77, widthPct: 28.7 },
  stage0: { left: 26, top: 85, widthPct: 22 },
  stage4: { left: 28, top: 69, widthPct: 17 },
};

// 配置のキー → 道具の絵（public/roadmap/room/room_item_<名前>.svg）
export const ROOM_ITEM_FILE: Record<string, string> = {
  stage0: "search",
  stage1: "container",
  stage2: "spraycan",
  stage3: "thermometer",
  stage4: "pipette",
  stage5: "microscope",
  board: "corkboard",
  notebook: "notebook",
};
