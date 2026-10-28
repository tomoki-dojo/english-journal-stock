// 部屋の並びと、隣の部屋の求め方。左右の矢印(RoomArrows)が使う。
// 部屋は環状に並ぶ(飼育部屋 → 棚の部屋 → リスニングの部屋 → 飼育部屋)。右へ進むと次、左へ進むと前。
// リスニングの部屋は、解放されるまで並びに入れない(その間は2部屋で、端は行き止まりにする)。

export type RoomKey = "room" | "shelf" | "listening";

export const ROOMS: Record<RoomKey, { label: string; toLabel: string; href: string }> = {
  room: { label: "飼育部屋", toLabel: "飼育部屋へ", href: "/roadmap" },
  shelf: { label: "棚の部屋", toLabel: "棚の部屋へ", href: "/roadmap/shelf" },
  listening: { label: "リスニングの部屋", toLabel: "リスニングの部屋へ", href: "/roadmap/listening" },
};

export function roomFromPathname(pathname: string | null): RoomKey | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/roadmap") return "room";
  if (path === "/roadmap/shelf") return "shelf";
  if (path === "/roadmap/listening") return "listening";
  return null;
}

export function getRoomNeighbors(
  current: RoomKey,
  listeningUnlocked: boolean
): { left: RoomKey | null; right: RoomKey | null } {
  if (listeningUnlocked) {
    const ring: RoomKey[] = ["room", "shelf", "listening"];
    const i = ring.indexOf(current);
    return { left: ring[(i + ring.length - 1) % ring.length], right: ring[(i + 1) % ring.length] };
  }
  // 2部屋(飼育部屋 ⇄ 棚の部屋)。端は行き止まり。
  if (current === "room") return { left: null, right: "shelf" };
  if (current === "shelf") return { left: "room", right: null };
  return { left: null, right: null };
}
