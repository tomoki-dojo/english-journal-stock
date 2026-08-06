import Link from "next/link";

export const metadata = {
  title: "特定商取引法に基づく表記 | English Journal Stock",
};

// 特定商取引法に基づく表記のたたき台。
// 価格・税務（インボイス対応の要否等）は運営者の事業状況に応じて要確認。
// 正式公開・本番課金開始前に内容を再確認することを推奨する。
// 公開ページ（未ログインでも閲覧可能）。ダッシュボードのレイアウトは通さず単体で構成する。
export default function TokushohoPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-zinc-700">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-700 hover:underline">
        ← トップに戻る
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">
        特定商取引法に基づく表記
      </h1>

      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
        このページはたたき台（ドラフト）です。特に税務（消費税・インボイス対応の要否）については、本番課金の開始前に税理士等の専門家にご確認ください。
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <dl className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">販売事業者</dt>
            <dd className="text-zinc-800">
              銅城智樹（どうじょう ともき）（屋号：Bear-Fruit）
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">運営統括責任者</dt>
            <dd className="text-zinc-800">銅城智樹</dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">所在地</dt>
            <dd className="text-zinc-800">
              ご請求いただければ遅滞なく開示いたします（下記メールアドレスまでご連絡ください）。
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">電話番号</dt>
            <dd className="text-zinc-800">
              ご請求いただければ遅滞なく開示いたします（下記メールアドレスまでご連絡ください）。
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">メールアドレス</dt>
            <dd className="text-zinc-800">
              <a
                href="mailto:tomoki.dojo@bear-fruit.online"
                className="text-accent hover:underline"
              >
                tomoki.dojo@bear-fruit.online
              </a>
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">販売価格</dt>
            <dd className="text-zinc-800">
              <ul className="list-disc space-y-1 pl-5">
                <li>Freeプラン：¥0/月</li>
                <li>Proプラン：¥680/月（税込）、または¥6,800/年（税込・年払い）</li>
              </ul>
              <p className="mt-1 text-xs text-zinc-500">
                各プランの詳細・最新の料金は、サービス内の設定画面にてご確認いただけます。
              </p>
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">
              商品代金以外の
              <br className="hidden sm:block" />
              必要料金
            </dt>
            <dd className="text-zinc-800">
              インターネット接続料金・通信料金等は利用者のご負担となります。
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">支払方法</dt>
            <dd className="text-zinc-800">
              クレジットカード決済（決済代行：Stripe, Inc.）
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">支払時期</dt>
            <dd className="text-zinc-800">
              有料プランへの登録時に初回のお支払いが発生し、以後は選択した契約期間（毎月または毎年）ごとに同日で自動的に決済されます（サブスクリプション）。
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">
              サービスの
              <br className="hidden sm:block" />
              提供時期
            </dt>
            <dd className="text-zinc-800">決済完了後、直ちにご利用いただけます。</dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">
              返品・キャンセル
              <br className="hidden sm:block" />
              について
            </dt>
            <dd className="text-zinc-800">
              サービスの性質上、お支払い済み料金の返金は行っておりません。有料プランは設定画面からいつでも解約できます。解約した場合、既にお支払い済みの期間についての日割り返金は行わず、当該期間の終了をもってプランが終了します。運営者の責めに帰すべき事由がある場合は、この限りではありません。
            </dd>
          </div>

          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-zinc-500">動作環境</dt>
            <dd className="text-zinc-800">
              最新版のGoogle Chrome、Safari、Microsoft Edge等、主要なモダンブラウザでのご利用を推奨します。
            </dd>
          </div>
        </dl>

        <section className="space-y-2">
          <p className="text-xs text-zinc-500">
            本ページに関するお問い合わせは、
            <a
              href="mailto:tomoki.dojo@bear-fruit.online"
              className="text-accent hover:underline"
            >
              tomoki.dojo@bear-fruit.online
            </a>
            までご連絡ください。
          </p>
        </section>
      </div>
    </div>
  );
}
