// 単語ノートの難易度(1〜5)の表示定義。1・2=初級(中学)、3・4=中級(高校)、5=上級(大学)。
export const NOTEBOOK_DIFFICULTIES_UI = [1, 2, 3, 4, 5] as const;
export type NotebookDifficultyUi = (typeof NOTEBOOK_DIFFICULTIES_UI)[number];

export const DIFFICULTY_STYLE: Record<NotebookDifficultyUi, { caption: string; className: string }> = {
  1: { caption: "中学レベル", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  2: { caption: "中学レベル", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  3: { caption: "高校レベル", className: "border-sky-300 bg-sky-50 text-sky-800" },
  4: { caption: "高校レベル", className: "border-sky-300 bg-sky-50 text-sky-800" },
  5: { caption: "大学レベル", className: "border-violet-300 bg-violet-50 text-violet-800" },
};
