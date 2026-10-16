import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Container,
  SprayCan,
  Thermometer,
  Pipette,
  Microscope,
  StickyNote,
  Bug,
  Lock,
  Sparkles,
  Flame,
} from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { ProSkipButton } from "./pro-skip-button";
import { ArthurAvatar } from "./arthur";
import type { Plan } from "@/lib/plan";
import type { StreakStats } from "@/lib/supabase/speaking-roadmap";

const BOARD_COLOR = "#e11d48";
const SHELF_COLOR = "#92400e";

// 部屋背景の実アート配置先。brand/kuwagata-asset-spec.mdの命名規則どおり
// public/roadmap/room/room_bg.png にファイルを置くだけで反映される（コード変更不要）。
// ファイルが無い間は404になるが、下のbg-gradient-to-bが背景色として残るので崩れない。
const ROOM_BG_URL = "/roadmap/room/room_bg.png";

// 道具アイコン（Stage0〜5・コルクボード・棚）の実アート配置先。
// このコンポーネントはサーバーコンポーネントなので、リクエスト時にファイルの有無を
// 確認し、存在すればそのSVGを、無ければ従来のlucideアイコンをそのまま表示する
// （CSS背景レイヤーで重ねる部屋背景と違い、アイコンは差し替え＝置き換えなので
// 存在チェックが必要。brand/kuwagata-asset-spec.mdの命名規則に対応）。
const ROOM_ITEM_DIR = path.join(process.cwd(), "public", "roadmap", "room");

function roomItemImageSrc(fileBaseName: string): string | null {
  const candidate = `room_item_${fileBaseName}.svg`;
  try {
    if (fs.existsSync(path.join(ROOM_ITEM_DIR, candidate))) {
      return `/roadmap/room/${candidate}`;
    }
  } catch {
    // ファイルシステムが読めない環境（一部のサーバーレス実行環境等）では
    // 静かにフォールバックしてlucideアイコン表示を維持する
  }
  return null;
}

type StageNumber = 1 | 2 | 3 | 4 | 5;

// アイコンは「アーサーの飼育部屋」にある道具（初級→上級の飼育レベル準拠）に対応させている
// （Search=虫眼鏡、Container=虫カゴ、SprayCan=霧吹き、Thermometer=温度湿度計、
// Pipette=ピンセット、Microscope=顕微鏡。経緯は_reference/kuwagata-motif-exploration.md参照）。
const STAGE_META: Record<
  StageNumber,
  { label: string; caption: string; icon: LucideIcon; imageBase: string; href: string }
> = {
  1: { label: "Stage1", caption: "音読", icon: Container, imageBase: "container", href: "/roadmap/stage1" },
  2: { label: "Stage2", caption: "英作文", icon: SprayCan, imageBase: "spraycan", href: "/roadmap/stage2" },
  3: { label: "Stage3", caption: "言い換え", icon: Thermometer, imageBase: "thermometer", href: "/roadmap/stage3" },
  4: { label: "Stage4", caption: "会話", icon: Pipette, imageBase: "pipette", href: "/roadmap/stage4" },
  5: { label: "Stage5", caption: "実践", icon: Microscope, imageBase: "microscope", href: "/roadmap/stage5" },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];

// STAGE_COLORSのStage2（ライムグリーン #84cc16）はアイコン・バッジの発色としてはいいが、
// 白座布団の上のラベル文字としては明度が高すぎて読みにくいため、ラベル表示専用に
// 暗めの同系色（lime-800相当）へ差し替える。他のStageは特に問題ないのでcolorをそのまま使う。
const LABEL_COLOR_OVERRIDE: Partial<Record<StageNumber, string>> = {
  2: "#4d7c0f",
};

// 部屋に「転がっている」感じを出すため、グリッド整列ではなく各アイテムに
// 個別の座標（%）と傾きを持たせて散らした配置にする。実イラスト差し替え時は
// ここの座標を実際の部屋イラストに合わせて手動で再調整する前提
// （_reference/kuwagata-motif-exploration.md参照）。
// widthPctは部屋の幅に対するそのアイテムの表示幅の割合。アイテムごとに実物の
// 大きさが違う（コルクボード・棚は大きい、霧吹き・虫眼鏡は小さい等）ため、
// 全アイテム共通の固定pxではなく個別に持たせる。高さは画像自体の縦横比に
// 追従（object-contain）するので、widthPctだけ合わせればよい。
// 値はユーザーが描いた部屋背景の下書きから実測した比率を初期値にしている
// （実イラスト差し替え時に微調整する前提。ロック中は従来通り固定48px丸バッジ表示のまま）。
// labelPositionは"below"（デフォルト、画像の下端に少し重ねる）か
// "center"（画像の中央に完全に重ねる。棚のような縦長アイテム向け）。
// labelOverlapPxは"below"時の重ね幅（px）。デフォルト12で、アイテムによってもっと
// 深く被せたい場合はここで調整する（コルクボードなど大きいアイテム向け）。
type ItemPlacement = {
  left: number;
  top: number;
  rotate: number;
  widthPct: number;
  labelPosition?: "below" | "center";
  labelOverlapPx?: number;
};

const ITEM_PLACEMENT: Record<string, ItemPlacement> = {
  stage0: { left: 22, top: 82, rotate: 0, widthPct: 13 },
  stage1: { left: 64, top: 79, rotate: 0, widthPct: 21 },
  stage2: { left: 20, top: 57, rotate: 0, widthPct: 14 },
  stage3: { left: 62, top: 22, rotate: 0, widthPct: 13 },
  stage4: { left: 39, top: 70, rotate: 0, widthPct: 12 },
  // 机面に接地して見えるよう、widthPct拡大に合わせてtopも下げて調整
  stage5: { left: 53, top: 56, rotate: 0, widthPct: 13 },
  board: { left: 25, top: 23, rotate: 0, widthPct: 40, labelOverlapPx: 50 },
  // 棚は一回り大きくして、画像自体をほぼ床に接地するまで下げる。
  // ラベルは画像下端ではなく中央に完全に重ねる表示にする。
  shelf: { left: 92, top: 64, rotate: 0, widthPct: 22, labelPosition: "center" },
};

type RoadmapRoomProps = {
  stageReadiness: {
    stage2Ready: boolean;
    stage3Ready: boolean;
    stage4Ready: boolean;
    stage5DailyReady: boolean;
    stage5BusinessReady: boolean;
  };
  proSkipStartStage?: 2 | 3 | 4 | null;
  plan: Plan;
  proSkipEnabled: boolean;
  totalMasteredCount: number;
  streakStats: StreakStats;
};

function StageCase({
  color,
  labelColor,
  icon: Icon,
  imageSrc,
  label,
  caption,
  href,
  locked,
  current,
  placement,
}: {
  color: string;
  // ラベル文字色だけを上書きしたい場合（例：Stage2のライムグリーンは白座布団の上だと
  // 明度が高すぎて読みにくいので、ラベルだけ暗めの色にする）。省略時はcolorを使う。
  labelColor?: string;
  icon: LucideIcon;
  imageSrc: string | null;
  label: string;
  caption: string;
  href: string;
  locked: boolean;
  current: boolean;
  placement: ItemPlacement;
}) {
  // 解放済み＋実アート有りの場合だけ、アイテムごとのwidthPctで実寸表示する
  // （丸バッジを外し、縦横比はobject-containで画像任せ）。それ以外（未解放／
  // アート未制作でlucideアイコンのまま）は、従来通り固定48pxの丸バッジ表示。
  const showRealArt = !!imageSrc;

  // ラベルは半透明の白ピル（「座布団」）を敷いて、どんな背景の上でも読めるようにする。
  // 画像より手前（DOM順で後＝視覚的に上）に重ねるが、座布団自体は透かして背景の絵を感じられる程度の濃さにする。
  const labelEl = (
    <span
      className={`whitespace-nowrap rounded-full bg-white/50 px-2.5 py-0.5 text-xs font-bold shadow-sm backdrop-blur-[1px] ${locked ? "opacity-40" : ""}`}
      style={{ color: locked ? "#71717a" : labelColor ?? color }}
    >
      {label}
    </span>
  );

  // 未解放はアートをグレーアウトして中央に鍵を重ねる（リンクなし・hover演出なし）。
  const itemImage = (
    <div
      style={{ transform: `rotate(${placement.rotate}deg)`, width: "100%" }}
      className={`relative ${locked ? "" : "transition-transform hover:scale-105 active:scale-95"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 任意形状・任意サイズの自前アートなのでnext/imageの固定枠は使わない */}
      <img
        src={imageSrc ?? undefined}
        alt=""
        className={`block w-full object-contain ${locked ? "opacity-25 grayscale" : "drop-shadow-md"}`}
      />
      {locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/60 shadow-sm">
            <Lock className="h-4 w-4 text-zinc-400" strokeWidth={2} />
          </span>
        </div>
      )}
    </div>
  );

  const content = showRealArt ? (
    placement.labelPosition === "center" ? (
      <div className="relative" style={{ width: "100%" }}>
        {itemImage}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{labelEl}</div>
      </div>
    ) : (
      <div className="flex flex-col items-center">
        {itemImage}
        <div style={{ marginTop: -(placement.labelOverlapPx ?? 12) }}>{labelEl}</div>
      </div>
    )
  ) : (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
        style={{
          transform: `rotate(${placement.rotate}deg)`,
          backgroundColor: locked ? "#f4f4f5" : withAlpha(color, "1a"),
          boxShadow: current
            ? `0 0 0 3px ${withAlpha(color, "33")}, 0 3px 6px rgba(0,0,0,0.12)`
            : "0 3px 6px rgba(0,0,0,0.12)",
        }}
      >
        {locked ? <Lock className="h-5 w-5 text-zinc-300" strokeWidth={1.75} /> : <Icon className="h-6 w-6" style={{ color }} strokeWidth={2} />}
      </div>
      <span className={`text-[10px] font-semibold ${locked ? "text-zinc-400" : ""}`} style={locked ? undefined : { color }}>
        {label}
      </span>
      {!locked && <span className="text-[9px] text-zinc-400">{caption}</span>}
    </div>
  );

  return (
    <div
      className="absolute"
      style={{
        left: `${placement.left}%`,
        top: `${placement.top}%`,
        transform: "translate(-50%, -50%)",
        width: showRealArt ? `${placement.widthPct}%` : undefined,
      }}
    >
      {locked ? content : (
        <Link href={href} className="block">
          {content}
        </Link>
      )}
    </div>
  );
}

// スピーキング・ロードマップのホーム。
// アイソメ都市マップ（RoadmapMap）に代わる新しい入口。マップはカメラズーム・グリッドロックで
// 「探して見つける」操作を要求していたが、Stage0〜5への直接アプローチができない問題が
// 起きていたため、探索不要の固定グリッド（アーサーの飼育部屋）に置き換えた
// （検討の経緯は_reference/kuwagata-motif-exploration.md参照）。
// 道具は「UIアイコンのグリッド」ではなく、部屋に転がっている小物として見せたいため、
// ITEM_PLACEMENTで各アイテムに個別の座標(%)と傾きを持たせ、散らした配置にしている
// （経緯は_reference/kuwagata-motif-exploration.md参照）。
// アート未制作のため、各Stageは色付きアイコンの丸バッジで暫定表示。専用イラストが
// 揃い次第、StageCaseの中身とITEM_PLACEMENTの座標を実際の部屋イラストに合わせて
// 差し替えればよい構造にしてある。
export function RoadmapRoom({
  stageReadiness,
  proSkipStartStage = null,
  plan,
  proSkipEnabled,
  totalMasteredCount,
  streakStats,
}: RoadmapRoomProps) {
  const hasAnyRecord = streakStats.totalDays > 0;
  const hasCurrentStreak = streakStats.current > 0;
  const isRecordTying =
    hasCurrentStreak &&
    streakStats.current >= 2 &&
    streakStats.current === streakStats.longest &&
    streakStats.totalDays > streakStats.current;
  const streakHeadline = !hasAnyRecord
    ? "今日から練習を始めよう"
    : hasCurrentStreak
      ? `${streakStats.totalDays}日練習して、${streakStats.current}日連続練習中！`
      : `${streakStats.totalDays}日練習しています、今日から再開しよう！`;

  const UNLOCKED: Record<StageNumber, boolean> = {
    1: true,
    2: stageReadiness.stage2Ready,
    3: stageReadiness.stage3Ready,
    4: stageReadiness.stage4Ready,
    5: stageReadiness.stage5DailyReady || stageReadiness.stage5BusinessReady,
  };
  const currentStage = proSkipStartStage ?? [...STAGE_NUMBERS].reverse().find((s) => UNLOCKED[s]) ?? 1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-md bg-zinc-900/90 px-2.5 py-1.5 text-white shadow-sm">
          <ArthurAvatar size={22} animated />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-semibold">{totalMasteredCount}</span>
              <span className="text-[10px] text-zinc-300">習得フレーズ</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-semibold">{streakHeadline}</span>
            </div>
          </div>
        </div>
      </div>

      {isRecordTying && <p className="mb-2 text-right text-[10px] font-bold text-amber-600">連続記録更新中！</p>}

      <ProSkipButton plan={plan} proSkipEnabled={proSkipEnabled} proSkipStartStage={proSkipStartStage} />

      {/*
        縦横比はCSSのaspect-ratioで固定し、幅に応じて高さも連動して伸縮するようにしている。
        これにより背景アートの縦横比と箱の縦横比が常に一致し、object-fit:coverによる
        画面サイズごとの切り取られ方の違いが起きない。
        比率は正方形(1:1)ではなく4:3にした。このカードの幅はスマホ(〜330px程度)〜
        PC(max-w-3xlで〜720px)まで変わるため、1:1だとPCで720px角というかなり縦長な箱になり、
        スマホでは逆にちょうどよい高さになる、という非対称な結果になる。4:3なら
        PCで720×540px、スマホで330×248px程度となり、PC側の間延びを抑えつつ
        スマホ側も道具8個を置くのに十分な高さを確保できる
        （検討の経緯は_reference/kuwagata-motif-exploration.md参照）。
      */}
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-amber-200 bg-cover bg-center p-4"
        style={{ backgroundImage: `url(${ROOM_BG_URL}), linear-gradient(to bottom, #fffbeb, #ffffff)` }}
      >
        <StageCase
          color={STAGE_COLORS[0]}
          icon={Search}
          imageSrc={roomItemImageSrc("search")}
          label="Stage0"
          caption="感覚"
          href="/roadmap/stage0"
          locked={false}
          current={false}
          placement={ITEM_PLACEMENT.stage0}
        />
        {STAGE_NUMBERS.map((stage) => {
          const meta = STAGE_META[stage];
          return (
            <StageCase
              key={stage}
              color={STAGE_COLORS[stage]}
              labelColor={LABEL_COLOR_OVERRIDE[stage]}
              icon={meta.icon}
              imageSrc={roomItemImageSrc(meta.imageBase)}
              label={meta.label}
              caption={meta.caption}
              href={meta.href}
              locked={!UNLOCKED[stage]}
              current={stage === currentStage}
              placement={ITEM_PLACEMENT[`stage${stage}`]}
            />
          );
        })}
        <StageCase
          color={BOARD_COLOR}
          icon={StickyNote}
          imageSrc={roomItemImageSrc("corkboard")}
          label="表現一覧"
          caption="表現一覧"
          href="/roadmap/board"
          locked={false}
          current={false}
          placement={ITEM_PLACEMENT.board}
        />
        <StageCase
          color={SHELF_COLOR}
          icon={Bug}
          imageSrc={roomItemImageSrc("shelf")}
          label="飼育棚"
          caption="クワたん一覧"
          href="/roadmap/shelf"
          locked={false}
          current={false}
          placement={ITEM_PLACEMENT.shelf}
        />
      </div>
    </div>
  );
}
