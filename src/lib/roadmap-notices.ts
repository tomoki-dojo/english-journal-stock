// 部屋に入ったときに出すポップアップの中身。
// 新しいお知らせは ANNOUNCEMENTS の末尾に、idを増やして追加する（ユーザーごとに「最後に見たid」より
// 大きいものだけが、部屋に入ったときに順に表示される）。

export type RoadmapAnnouncement = { id: number; title: string; body: string };

// stageTrigger: そのタマゴを配る契機になったStage番号（2〜5＝そのStageの解放。1はサインアップ時で解放演出なし）
export type RoadmapNewEgg = {
  id: string;
  speciesCode: string;
  speciesName: string;
  stageTrigger: number | null;
  // 節目のイベントで配られたタマゴの「もらえた理由」（Stage解放・サインアップ時のタマゴはnull）
  reason: string | null;
};

// 節目のタマゴ（kuwagata_egg_events.event_key）の、もらえた理由。「days:7」「mastered:30」の形。
export function describeEggEvent(eventKey: string): string | null {
  const [kind, value] = eventKey.split(":");
  if (kind === "limited") return "シナリオを習得した！";
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  if (kind === "days") return `練習日数が${count}日になった！`;
  if (kind === "mastered") return `習得したフレーズが${count}個になった！`;
  return null;
}

// Stage5卒業で成虫になった（羽化した）テッペンクワたん。羽化の演出を出すために使う。
export type RoadmapNewHatch = {
  id: string;
  speciesCode: string;
  speciesName: string;
  mandibleVariant: number;
  // 羽化する直前の成長段階（卵・幼虫・蛹）。不明ならnull。
  hatchedFrom: string | null;
};

// 習得で手に入れた色の実（まだ演出を見せていないもの）。sceneKeyはシーン名、countはその個数。
export type RoadmapNewShizuku = { sceneKey: string; count: number };

// 成長段階が上がったクワたん（「〇〇が□に成長した！」の演出に使う）。
export type RoadmapStageUp = {
  id: string;
  speciesCode: string;
  speciesName: string;
  mandibleVariant: number;
  // 成長した先の段階
  stage: "幼虫" | "蛹" | "成虫";
};

export const ANNOUNCEMENTS: RoadmapAnnouncement[] = [];

export const LATEST_ANNOUNCEMENT_ID = ANNOUNCEMENTS.reduce((max, a) => Math.max(max, a.id), 0);

// 初回ログイン時の導入（世界観）。1行ずつ画面いっぱいに出して、タップで進める。
export const INTRO_LINES: string[] = [
  "ここには、英語を聞かせるとどんどん育つ「エークワたん」が住んでいる",
  "アーサーと一緒に沢山英語を喋って「エークワたん」を育てよう！",
];

// 導入のあとに出る「エークワ博士からの育成アドバイス」
export const ADVICE_SPEAKER = "エークワ博士";
export const ADVICE_TITLE = "育成アドバイス";
// **で囲んだ部分は太字で表示する
export const ADVICE_SPEAKER_IMAGE = "/roadmap/room/hakase.png";
export const ADVICE_LINES: string[] = [
  "英語は知識じゃなくて技術！（知識の面もあるけど）**とにかく声に出せ！**",
  "rやthを発音するのが恥ずかしい？英語喋る人は誰もそんなこと思ってねぇ！舌を巻け！歯に挟め！**カッコよく発音しろ！**",
  "間違えて当たり前だ！幸いこのアプリはAIがあなたの相手をしてくれる！**存分に間違えながら喋ろ！**",
];
