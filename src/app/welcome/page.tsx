import type { Metadata } from "next";
import Link from "next/link";
import { Bug, MessageCircle, Mic } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { ROADMAP_TITLE_PATH } from "@/lib/roadmap-title";
import { GuestStartButton } from "@/components/roadmap/guest-start-button";
import { ShareButton } from "@/components/share-button";

// 紹介ページ(LP)。ログイン不要。シェアされたリンクの行き先になる。
// シェア時のプレビュー(OGP)画像は public/lp/ogp.png(1200×630)。
// 検索結果に出るタイトル・説明文。「英語 スピーキング 練習 アプリ」「英語 音読 アプリ」「瞬間英作文 アプリ」などで探す人に、何のアプリか伝わるように。
const TITLE = "喋って！育てろ！英クワたん｜声に出す英語スピーキング練習アプリ（無料）";
const SHARE_TITLE = "喋って！育てろ！英クワたん";
const DESCRIPTION =
  "英語を声に出して話す練習ができるスピーキングアプリ。音読・瞬間英作文から、AIとの英会話まで5つのステップで練習でき、練習するほどクワガタが育ちます。登録なしで無料で試せます。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/welcome" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/welcome",
    siteName: "英クワたん",
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: [{ url: "/lp/ogp.png", width: 1200, height: 630, alt: SHARE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: ["/lp/ogp.png"],
  },
};

const FEATURES = [
  { icon: Mic, title: "英語を練習してクワたんを育てよう", text: "全然英語が話せなくても大丈夫！沢山練習するほどクワたんが育っていくぞ！" },
  { icon: MessageCircle, title: "AIと練習できるから安心", text: "自分なりに英語を喋ればOK！AIが自然な会話とフィードバックをその場で返してくれるぞ！" },
  { icon: Bug, title: "50種類以上の仲間が待ってる", text: "色んなエリアに採集に行ける！英語の実力を上げればレアな種類をゲットできるチャンスが高まるぞ！" },
] as const;

// 声に出す練習の5つのステップ（アプリのStage1〜5の名前に合わせる）
const STEPS = [
  { stage: "Stage1", name: "音読・シャドーイング", text: "お手本を聞いて、そのまま声に出す" },
  { stage: "Stage2", name: "瞬間英作文", text: "日本語を見て、すぐ英語で言う" },
  { stage: "Stage3", name: "自分の言葉で言う", text: "覚えた表現を、自分の話に使ってみる" },
  { stage: "Stage4", name: "会話", text: "旅行など、場面ごとにアーサーと英会話" },
  { stage: "Stage5", name: "実践会話", text: "生活の手続きや仕事の交渉など、本番に近いロールプレイ" },
] as const;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "英クワたん",
  alternateName: "喋って！育てろ！英クワたん",
  url: "https://app.upskillenglish.bear-fruit.online/welcome",
  description: DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "ja",
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
};

const GALLERY = [
  { code: "KW-0001", name: "エークワたん" },
  { code: "KW-0006", name: "テントたん" },
  { code: "KW-0011", name: "チョウたん" },
  { code: "KW-0012", name: "ミツたん" },
  { code: "KW-0014", name: "カブたん" },
  { code: "KW-0048", name: "コメたん" },
  { code: "KW-0052", name: "クジャクたん" },
  { code: "KW-0002", name: "ヒビクワたん" },
] as const;

const primaryButton =
  "block w-full rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-6 py-3.5 text-center text-lg font-black tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";

const secondaryButton =
  "block w-full rounded-full border-4 border-[#eaaccb] bg-white px-6 py-3 text-center text-lg font-black tracking-wide text-[#e5215a] shadow-[0_4px_0_#d9a1bd] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";

export default async function WelcomePage() {
  const user = await getCurrentUser();

  // サインアップ・サインインの行き先は、タイトル画面と同じ(ログイン後はタイトル画面→ロードマップへ)。
  const titleUrl = `${ROADMAP_TITLE_PATH}?next=${encodeURIComponent("/roadmap")}`;
  const loginHref = `/login?reason=roadmap&next=${encodeURIComponent(titleUrl)}`;
  const signupHref = `${loginHref}&mode=magic`;

  const cta = user ? (
    <Link href="/roadmap" className={primaryButton}>
      続きを始める
    </Link>
  ) : (
    <>
      <GuestStartButton className={primaryButton} />
      <Link href={signupHref} className={`${secondaryButton} mt-3`}>
        無料で始める
      </Link>
      <p className="mt-3 text-center text-sm font-semibold text-zinc-500">
        登録済みの方は{" "}
        <Link href={loginHref} className="text-[#e5215a] underline underline-offset-4">
          サインイン
        </Link>
      </p>
    </>
  );

  return (
    <div className="min-h-dvh bg-[#fffaeb] text-[#3c2819]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <main className="mx-auto max-w-xl px-5 pb-10">
        <section className="pt-6 text-center">
          <div className="relative mx-auto w-full max-w-sm overflow-hidden" style={{ aspectRatio: "1080 / 1180" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/roadmap/title/title_bg.webp"
              alt="英クワたん 喋って！育てろ！"
              className="absolute left-0 w-full select-none"
              style={{ top: "-18.6%" }}
              draggable={false}
            />
          </div>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            英語を話して、
            <br />
            <span className="text-[#e5215a]">クワたんを育てよう！</span>
          </h1>
          <p className="mt-3 text-base font-bold text-zinc-600">AIがフィードバックしてくれる、英語を話すことに特化した育成×英会話アプリ</p>
          <div className="mx-auto mt-6 max-w-sm">{cta}</div>
        </section>

        <section className="mt-12 space-y-3">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="flex items-center gap-4 rounded-3xl border-2 border-[#f2d5b8] bg-white px-4 py-4 shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e5215a] text-white shadow">
                <feature.icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-black text-[#e5215a]">楽しく英会話が学べる仕組み{i + 1}</p>
                <p className="text-lg font-black leading-snug">{feature.title}</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-500">{feature.text}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-center text-xl font-black">声に出す練習が、5つのステップ</h2>
          <ol className="space-y-2">
            {STEPS.map((step) => (
              <li key={step.stage} className="flex items-center gap-3 rounded-2xl border-2 border-[#f2d5b8] bg-white px-4 py-3">
                <span className="shrink-0 rounded-full bg-[#fff1c9] px-2.5 py-1 text-xs font-black text-[#e5215a]">{step.stage}</span>
                <div className="min-w-0">
                  <p className="font-black leading-snug">{step.name}</p>
                  <p className="text-sm font-semibold text-zinc-500">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-center text-xl font-black">水槽で、のんびり眺める</h2>
          <p className="mb-3 mt-1 text-center text-sm font-bold text-zinc-600">眺めるだけでも楽しい！じっと見てたら面白い行動をする種もいるぞ！</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lp/tank_preview.webp"
            alt="水槽で暮らす英クワたん"
            className="w-full rounded-3xl border-4 border-[#f2d5b8] shadow-md"
          />
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-center text-xl font-black">こんな虫たちが待ってる</h2>
          <div className="grid grid-cols-4 gap-2">
            {GALLERY.map((creature) => (
              <div key={creature.code} className="rounded-2xl bg-white p-1.5 text-center shadow-sm ring-1 ring-[#f2d5b8]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/lp/creatures/${creature.code}.webp`} alt={creature.name} className="w-full" loading="lazy" />
                <p className="pb-1 text-[10px] font-bold leading-tight text-zinc-600 sm:text-xs">{creature.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-3xl bg-gradient-to-br from-[#fff1c9] to-[#ffe3ec] px-5 py-7 text-center">
          <h2 className="mb-4 text-2xl font-black">喋って！育てろ！英クワたん！</h2>
          <div className="mx-auto max-w-sm">{cta}</div>
        </section>

        <div className="mt-6 text-center">
          <ShareButton
            campaign="lp"
            text="英語を話して、クワたんを育てよう！AIがフィードバックしてくれる育成×英会話アプリ「喋って！育てろ！英クワたん」 #英クワたん"
          />
        </div>
      </main>

      <footer className="border-t border-[#f2d5b8] px-5 py-6 text-center text-xs text-zinc-500">
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/terms" className="underline underline-offset-2">
            利用規約
          </Link>
          <Link href="/privacy" className="underline underline-offset-2">
            プライバシーポリシー
          </Link>
          <Link href="/tokushoho" className="underline underline-offset-2">
            特定商取引法に基づく表記
          </Link>
        </nav>
      </footer>
    </div>
  );
}
