import Link from "next/link";

export const metadata = {
  title: "利用規約 | UpskillEnglish",
};

// 利用規約のたたき台。正式公開・商用利用前に弁護士等の専門家によるレビューを推奨する。
// 公開ページ（未ログインでも閲覧可能）。ダッシュボードのレイアウトは通さず単体で構成する。
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-zinc-700">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-700 hover:underline">
        ← トップに戻る
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">利用規約</h1>

      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
        このページはたたき台（ドラフト）です。内容は今後変更される可能性があり、弁護士等の専門家によるレビューを経た正式な規約ではありません。
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第1条（適用）</h2>
          <p>
            本規約は、UpskillEnglish（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意のうえ、本サービスを利用するものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第2条（利用登録・利用資格）</h2>
          <p>
            本サービスの利用を希望する者は、本規約に同意のうえ、運営者の定める方法によりアカウント登録を行うものとします。運営者は、登録希望者が虚偽の情報を届け出た場合その他運営者が利用登録を適当でないと判断した場合、登録を拒否することがあります。
          </p>
          <p>
            利用者は、自己の責任においてログイン情報（メールアドレス・パスワード等）を管理するものとし、第三者への譲渡・貸与・共有はできません。ログイン情報の管理不十分による損害について、運営者は責任を負いません。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">
            第3条（有料プラン・料金・支払い）
          </h2>
          <p>
            本サービスは、無料プランのほか、機能を拡張した有料プラン（Pro）を提供します。有料プランの料金は、設定画面に表示する金額によるものとし、月払いまたは年払いを利用者が選択できます。決済代行会社Stripe, Inc.を通じたクレジットカード決済により、選択した契約期間に応じて自動的に継続課金されます。
          </p>
          <p>
            利用者は、設定画面からいつでも有料プランを解約できます。解約した場合、既に支払い済みの期間についての日割り返金は行わないものとし、当該期間の終了をもってプランが終了します。運営者の責めに帰すべき事由がある場合を除き、支払い済み料金の返金は行いません。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第4条（コンテンツの著作権）</h2>
          <p>
            本サービス内で提供する表現・意味・例文・音声等のコンテンツ（以下「本コンテンツ」）の著作権その他の権利は、運営者または正当な権利を有する第三者に帰属します。利用者は、本サービスの利用範囲を超えて、本コンテンツを複製・転載・再配布・商用利用することはできません。
          </p>
          <p>
            利用者が本サービス上で行う「マイリスト（お気に入り）」への保存は、利用者自身の学習・復習を目的とした個人利用の範囲内でのみ行うものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第5条（音声コンテンツについて）</h2>
          <p>
            本サービスの例文音声は、外部の音声合成サービス（Google Cloud Text-to-Speech等）を用いて生成しています。音声の発音・イントネーション等について、運営者はその完全性を保証しません。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第6条（禁止事項）</h2>
          <p>利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>法令または公序良俗に違反する行為</li>
            <li>他者の著作権・商標権その他の知的財産権を侵害する行為</li>
            <li>他の利用者、運営者、または第三者に不利益・損害を与える行為</li>
            <li>本サービスの運営を妨げる行為（不正アクセス、過度な負荷をかける行為など）</li>
            <li>虚偽の情報を登録する行為、他者になりすます行為</li>
            <li>
              本コンテンツをスクレイピング等の手段により組織的に取得し、第三者に提供・再配布する行為
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第7条（反社会的勢力の排除）</h2>
          <p>
            利用者は、自らが暴力団、暴力団員、暴力団準構成員、暴力団関係企業その他の反社会的勢力に該当しないこと、また、これらと交流・関与していないことを表明し、保証するものとします。運営者は、利用者がこれに違反すると判断した場合、事前の通知なくアカウントの利用停止・登録抹消の措置をとることができます。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">
            第8条（利用制限・登録抹消）
          </h2>
          <p>
            運営者は、利用者が本規約に違反した、または違反するおそれがあると判断した場合、利用者への事前の通知なく、当該利用者のアカウントの利用制限・登録抹消の措置をとることができるものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第9条（免責事項）</h2>
          <p>
            本サービスで提供する本コンテンツの正確性・完全性について、運営者は保証しません。学習目的での利用にあたっては、内容を利用者自身の責任で確認してください。
          </p>
          <p>
            本サービスの利用により利用者に生じた損害について、運営者は故意または重過失による場合を除き、責任を負わないものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">
            第10条（サービスの停止・変更・終了）
          </h2>
          <p>
            運営者は、システムの保守・障害、天災地変その他やむを得ない事由がある場合、利用者への事前の通知なく本サービスの全部または一部の提供を停止・中断することができます。また、運営者の判断により、本サービスの内容を変更し、または提供を終了することがあります。これらにより利用者に生じた損害について、運営者は故意または重過失による場合を除き、責任を負いません。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第11条（規約の変更）</h2>
          <p>
            運営者は、必要に応じて本規約を変更できるものとします。変更後の規約は、本ページに掲載した時点から効力を生じるものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">第12条（準拠法・合意管轄）</h2>
          <p>
            本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して利用者と運営者との間で紛争が生じた場合には、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">
            個人情報の取り扱いについて
          </h2>
          <p>
            利用者の個人情報は、
            <Link href="/privacy" className="text-accent hover:underline">
              プライバシーポリシー
            </Link>
            に従って適切に取り扱います。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">お問い合わせ</h2>
          <p>
            本規約に関するお問い合わせは、
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
