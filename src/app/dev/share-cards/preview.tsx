"use client";

import { useState } from "react";
import { ShareButton } from "@/components/share-button";
import { ShareCard, areaMapImage, type ShareCardData, type ShareCardLayout } from "@/components/share/share-card";
import { renderShareCard } from "@/lib/share-image";

// 開発用：全種類のシェアカードを並べ、「画像にする」で実際に書き出したPNG（シェアで送られるもの）を見る。
// 「シェアを試す」は本物のシェアボタン（画像のアップロード・/s/<id> のリンク作成まで本当に動く）。
const SAMPLES: { name: string; campaign: string; data: ShareCardData }[] = [
  {
    name: "採集（激レア・渓流）",
    campaign: "dev_catch",
    data: { kind: "bug", eyebrow: "激レアをゲット！", title: "エークワたん", subtitle: "英語の練習で採集したよ", speciesCode: "KW-0001", tone: "superRare", background: areaMapImage("area3") },
  },
  {
    name: "採集（レア・森）",
    campaign: "dev_catch",
    data: { kind: "bug", eyebrow: "レアをゲット！", title: "カブたん", subtitle: "英語の練習で採集したよ", speciesCode: "KW-0014", tone: "rare", background: areaMapImage("area2") },
  },
  {
    name: "羽化",
    campaign: "dev_hatch",
    data: { kind: "bug", eyebrow: "Stage5卒業！", title: "エークワたん", subtitle: "成虫に羽化した！", speciesCode: "KW-0001", mandibleVariant: 2, tone: "hatch" },
  },
  {
    name: "新エリア解放",
    campaign: "dev_area",
    data: { kind: "text", eyebrow: "新エリア解放！", title: "渓流", subtitle: "採集に行ける場所が増えた", image: areaMapImage("area3"), background: areaMapImage("area3") },
  },
  {
    name: "Stage解放",
    campaign: "dev_stage",
    data: { kind: "text", eyebrow: "Stage解放！", title: "Stage3", subtitle: "英語の練習で次のステージへ", mascot: "arthur" },
  },
  {
    name: "単語ノート",
    campaign: "dev_notebook",
    data: { kind: "text", eyebrow: "単語ノート", title: "9/10問正解！", mascot: "arthur" },
  },
];

function Sample({ name, campaign, data }: (typeof SAMPLES)[number]) {
  const [png, setPng] = useState<Record<ShareCardLayout, string | null>>({ portrait: null, landscape: null });
  async function exportPng() {
    const [p, l] = await Promise.all([renderShareCard(data, "portrait"), renderShareCard(data, "landscape")]);
    setPng({ portrait: p ? URL.createObjectURL(p) : null, landscape: l ? URL.createObjectURL(l) : null });
  }
  return (
    <section className="rounded-2xl bg-white p-4 shadow">
      <h2 className="text-lg font-black">{name}</h2>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <ShareCard data={data} layout="portrait" />
        <ShareCard data={data} layout="landscape" />
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => void exportPng()} className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-white">
          画像にする（送られるPNG）
        </button>
        <ShareButton text={`シェアのテスト：${name} #英クワたん`} campaign={campaign} card={data} prefetch={false} label="シェアを試す" />
      </div>
      {(png.portrait || png.landscape) && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {png.portrait && <img src={png.portrait} alt="" style={{ width: 270 }} className="border" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {png.landscape && <img src={png.landscape} alt="" style={{ width: 300 }} className="border" />}
        </div>
      )}
    </section>
  );
}

export function ShareCardsPreview() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-zinc-100 p-6">
      <h1 className="text-2xl font-black">シェアカードの確認（開発用）</h1>
      <p className="text-sm text-zinc-600">
        上はカードそのもの、「画像にする」で出る画像が実際に送られるPNGです（虫の写り・背景の濃さを確認）。
        「シェアを試す」は本物のシェアボタンで、画像をアップロードして /s/〜 のリンクを作ります（PCではリンクのコピー）。
      </p>
      {SAMPLES.map((s) => (
        <Sample key={s.name} {...s} />
      ))}
    </main>
  );
}
