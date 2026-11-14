"use client";

import { KnownCreatureSprite } from "@/components/roadmap/kuwagata-shelf";
import { individualFilter, type RimKey } from "@/lib/kuwagata-tint";
import { MOBILE_PLACEMENT, ROOM_BG_MOBILE_ASPECT, ROOM_BG_MOBILE_URL, ROOM_ITEM_FILE } from "@/lib/room-layout";

// シェア用の画像カード。画面には出さず、シェアするときだけ裏で描いて画像にする（lib/share-image.ts）。
// 縦長（portrait 540×675 → 2倍で1080×1350）は、共有シートで画像として送る用（Instagram・LINE）。
// 横長（landscape 600×315 → 2倍で1200×630）は、リンクを貼ったときのプレビュー（OGP）用。
export type ShareCardData =
  | {
      kind: "bug";
      eyebrow: string;
      title: string;
      subtitle?: string;
      speciesCode: string;
      mandibleVariant?: number;
      tintKey?: string | null;
      rimKey?: RimKey | null;
      tone?: "common" | "rare" | "superRare" | "hatch";
      // 背景に薄く敷くアプリの絵（採集したエリアのマップなど）。"room" または省略で部屋（道具つき）
      background?: string;
    }
  | {
      kind: "text";
      eyebrow: string;
      title: string;
      subtitle?: string;
      mascot?: "kuma" | "arthur";
      // マスコットの代わりに出す横長の絵（新エリア解放のエリアマップなど）
      image?: string;
      tone?: "common" | "rare" | "superRare" | "hatch";
      background?: string;
    };

// 採集エリアのマップの絵（public/roadmap/map）。水の底の秘境は絵がないので森で代用。
export function areaMapImage(areaCode: string): string {
  if (areaCode === "ancient") return "/roadmap/map/map_ancient.webp";
  if (/^area[1-5]$/.test(areaCode)) return `/roadmap/map/map_${areaCode}.webp`;
  return "/roadmap/map/map_area2.webp";
}

// 羽化・Stage解放・単語ノートなど、エリアに結びつかないカードは、部屋（道具も置いた形）を敷く
const DEFAULT_BACKGROUND = "room";

export type ShareCardLayout = "portrait" | "landscape";

export const SHARE_CARD_SIZE: Record<ShareCardLayout, { width: number; height: number }> = {
  portrait: { width: 540, height: 675 },
  landscape: { width: 600, height: 315 },
};

const TONE: Record<NonNullable<ShareCardData["tone"]>, { bg: string; glow: string; accent: string }> = {
  common: { bg: "linear-gradient(160deg, #3b2408 0%, #2a1a05 60%, #1c1103 100%)", glow: "rgba(251,191,36,0.45)", accent: "#fbbf24" },
  rare: { bg: "linear-gradient(160deg, #0c3b5e 0%, #0b2540 60%, #071729 100%)", glow: "rgba(125,211,252,0.55)", accent: "#7dd3fc" },
  superRare: { bg: "linear-gradient(160deg, #5b0f3c 0%, #3a0a33 55%, #1f0626 100%)", glow: "rgba(249,168,212,0.6)", accent: "#f9a8d4" },
  hatch: { bg: "linear-gradient(160deg, #4a3205 0%, #2a1a05 55%, #1c1103 100%)", glow: "rgba(253,230,138,0.7)", accent: "#fde68a" },
};

const BRAND = "喋って！育てろ！英クワたん";
const BG_OPACITY = 0.14;
// 部屋は明るい色の絵なので、マップより少し濃くしても文字の邪魔にならない
const ROOM_OPACITY = 0.2;
const TAGLINE = "英語を喋って、クワガタを育てるゲーム";

// 光のボケ（絶対配置）より手前に出すため、絵は position:relative＋zIndex で重ねる
function Art({ data, size }: { data: ShareCardData; size: number }) {
  if (data.kind === "bug") {
    return (
      <div style={{ width: size, height: size, position: "relative", zIndex: 1, filter: individualFilter(data.tintKey, data.speciesCode, data.rimKey ?? null) }}>
        <KnownCreatureSprite code={data.speciesCode} facing="front" mandibleVariant={data.mandibleVariant ?? 1} still />
      </div>
    );
  }
  if (data.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data.image} alt="" style={{ position: "relative", zIndex: 1, width: size * 1.45, height: size, objectFit: "contain", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.45))" }} />;
  }
  const src = data.mascot === "arthur" ? "/mascot/arthur.png" : "/mascot/bear-suit.png";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ position: "relative", zIndex: 1, width: size, height: size, objectFit: "contain" }} />;
}

export function ShareCard({ data, layout }: { data: ShareCardData; layout: ShareCardLayout }) {
  const tone = TONE[data.tone ?? "common"];
  const { width, height } = SHARE_CARD_SIZE[layout];
  const portrait = layout === "portrait";
  const wideArt = data.kind === "text" && Boolean(data.image);
  // 横長の絵（エリアマップ）は高さを抑える（幅＝高さ×1.45）
  const artSize = wideArt ? (portrait ? 290 : 150) : portrait ? 300 : 210;
  const artBoxWidth = wideArt ? Math.round(artSize * 1.45) + 20 : artSize + 60;
  const titleSize = Math.min(portrait ? 40 : 32, Math.floor((portrait ? 460 : 300) / Math.max([...data.title].length, 1)));

  return (
    <div
      style={{
        width,
        height,
        background: tone.bg,
        color: "#fff",
        display: "flex",
        flexDirection: portrait ? "column" : "row",
        alignItems: "center",
        justifyContent: portrait ? "flex-start" : "center",
        gap: portrait ? 0 : 18,
        padding: portrait ? "34px 30px 26px" : "22px 28px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {/* 背景：アプリの絵を薄く敷く（濃さは BG_OPACITY で調整） */}
      {(data.background ?? DEFAULT_BACKGROUND) === "room" ? (
        <RoomScene width={width} height={height} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.background}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: BG_OPACITY, filter: "saturate(0.7)" }}
        />
      )}
      <div
        style={{
          position: "relative",
          width: artBoxWidth,
          height: artSize + 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          order: portrait ? 1 : 0,
          // 縦長は、見出しと下のロゴの間の真ん中に置く
          margin: portrait ? "auto 0" : 0,
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle, ${tone.glow} 0%, rgba(0,0,0,0) 68%)` }} />
        <Art data={data} size={artSize} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: portrait ? "center" : "flex-start",
          textAlign: portrait ? "center" : "left",
          order: portrait ? 0 : 1,
          flex: portrait ? "none" : 1,
          minWidth: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            borderRadius: 999,
            border: `2px solid ${tone.accent}`,
            color: tone.accent,
            padding: "4px 14px",
            fontSize: portrait ? 18 : 15,
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          {data.eyebrow}
        </span>
        <div style={{ marginTop: portrait ? 14 : 10, fontSize: titleSize, fontWeight: 900, lineHeight: 1.2 }}>{data.title}</div>
        {data.subtitle && (
          <div style={{ marginTop: 6, fontSize: portrait ? 17 : 14, fontWeight: 700, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
            {data.subtitle}
          </div>
        )}
        {!portrait && <Footer accent={tone.accent} compact />}
      </div>

      {portrait && (
        <div style={{ order: 2, width: "100%", position: "relative", zIndex: 1 }}>
          <Footer accent={tone.accent} />
        </div>
      )}
    </div>
  );
}

// 部屋の絵に道具を置いた形（部屋の画面のスマホ用の配置と同じ）。カードを覆うように拡大し、真ん中で切る。
function RoomScene({ width, height }: { width: number; height: number }) {
  const sceneWidth = Math.max(width, height * ROOM_BG_MOBILE_ASPECT);
  const sceneHeight = sceneWidth / ROOM_BG_MOBILE_ASPECT;
  return (
    <div
      style={{
        position: "absolute",
        left: (width - sceneWidth) / 2,
        top: (height - sceneHeight) / 2,
        width: sceneWidth,
        height: sceneHeight,
        opacity: ROOM_OPACITY,
        filter: "saturate(0.7)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ROOM_BG_MOBILE_URL} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {Object.entries(MOBILE_PLACEMENT).map(([key, p]) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={`/roadmap/room/room_item_${ROOM_ITEM_FILE[key]}.svg`}
          alt=""
          style={{ position: "absolute", left: `${p.left}%`, top: `${p.top}%`, width: `${p.widthPct}%`, transform: "translate(-50%, -50%)" }}
        />
      ))}
    </div>
  );
}

function Footer({ accent, compact = false }: { accent: string; compact?: boolean }) {
  return (
    <div
      style={{
        marginTop: compact ? 16 : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: compact ? "flex-start" : "center",
        gap: 10,
        borderTop: compact ? "none" : "1px solid rgba(255,255,255,0.18)",
        paddingTop: compact ? 0 : 14,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot/kuma-icon.png" alt="" style={{ width: compact ? 34 : 42, height: compact ? 34 : 42, borderRadius: "50%" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ fontSize: compact ? 16 : 20, fontWeight: 900, color: accent }}>{BRAND}</span>
        <span style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{TAGLINE}・登録なしで遊べる</span>
      </div>
    </div>
  );
}
