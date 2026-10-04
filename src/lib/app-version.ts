// アプリのバージョンと更新履歴。リリースのたびに、先頭に新しい版を足してAPP_VERSIONを更新する。
// バージョンの付け方: 機能追加=マイナー(0.X.0)、修正・調整=パッチ(0.0.X)。
export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-10-05",
    changes: [
      "クワたんの成長ゲージを追加（経過日数と練習のブーストを2色で表示）",
      "フレーズ卒業時、結果画面で育成中のクワたんの成長を表示",
      "テッペンクワたんはStage5卒業で羽化（専用の羽化演出）",
      "Stage解放時に「Stage◯が解放された！」の演出を追加",
      "Stage4・5の音声入力を連続認識に対応",
      "Stage4の最終フィードバックに表現の添削を追加",
      "図鑑をめくる効果音を追加",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-01",
    changes: [
      "アーサーの飼育部屋（ロードマップ）を公開準備版として実装",
      "Stage0〜5の練習、クワたんの採集・育成・図鑑",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
