import Link from "next/link";

export const metadata = {
  title: "プライバシーポリシー | English Journal Stock",
};

// プライバシーポリシーのたたき台。正式公開・商用利用前に弁護士等の専門家によるレビューを推奨する。
// 公開ページ（未ログインでも閲覧可能）。ダッシュボードのレイアウトは通さず単体で構成する。
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-zinc-700">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-700 hover:underline">
        ← トップに戻る
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">
        プライバシーポリシー
      </h1>

      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
        このページはたたき台（ドラフト）です。内容は今後変更される可能性があり、弁護士等の専門家によるレビューを経た正式なポリシーではありません。
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">1. 事業者情報</h2>
          <p>
            本サービス「English Journal Stock」（以下「本サービス」）は、個人事業主
            銅城智樹（以下「運営者」）が運営しています。本ポリシーに関するお問い合わせは、本ページ末尾の連絡先までご連絡ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">2. 取得する情報</h2>
          <p>運営者は、本サービスの提供にあたり、以下の情報を取得します。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>メールアドレス（アカウント登録・ログイン認証のため）</li>
            <li>表示名など、利用者が任意で入力するプロフィール情報</li>
            <li>マイリスト（お気に入り）への保存状況等、本サービスの利用・閲覧履歴</li>
            <li>
              決済情報（有料プランご利用時）。ただし、クレジットカード番号等は決済代行会社（Stripe, Inc.）が直接取得・管理し、運営者はこれを保持しません。
            </li>
            <li>
              ログイン試行履歴・IPアドレス等のアクセスログ（不正アクセス防止・アカウント保護のため）
            </li>
            <li>Cookie等を用いたログインセッションの識別情報</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">3. 利用目的</h2>
          <p>取得した情報は、以下の目的で利用します。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>本サービスの提供、本人認証、利用者アカウントの管理</li>
            <li>有料プランの契約管理・決済処理</li>
            <li>不正利用・不正アクセスの検知および防止</li>
            <li>お問い合わせへの対応</li>
            <li>本サービスの維持・改善、利用状況の分析</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">4. 第三者への提供・外部サービスの利用</h2>
          <p>
            運営者は、法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者に販売・提供しません。ただし、本サービスの提供にあたり、以下の外部サービス（データ処理の委託先）を利用しており、必要な範囲で情報が送信されます。
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-zinc-800">Supabase</span>
              （データベース・認証基盤・ファイルストレージ）
            </li>
            <li>
              <span className="text-zinc-800">ConoHa VPS</span>（アプリケーションのホスティング）
            </li>
            <li>
              <span className="text-zinc-800">Stripe, Inc.</span>（有料プランの決済処理）
            </li>
            <li>
              <span className="text-zinc-800">Google Cloud（Text-to-Speech API）</span>
              （例文音声データの生成。個人情報を含まない、コンテンツ本文のみを処理します）
            </li>
            <li>
              <span className="text-zinc-800">Google LLC</span>
              （Google Analytics：利用状況の分析。Google AdSense：無料プラン・未ログイン時の広告配信）
            </li>
          </ul>
          <p>
            これらの外部サービスは、それぞれ独自のプライバシーポリシーに基づきデータを取り扱います。サービスの海外事業者に情報が保管・処理される場合があります。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">5. Cookieの利用</h2>
          <p>本サービスでは、以下の目的でCookie等を使用します。</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>ログイン状態を維持するための、本サービスの提供に必要なCookie</li>
            <li>
              Google Analyticsによる、本サービスの利用状況分析のためのCookie（ページ閲覧・機能利用状況等を把握し、サービス改善に利用します）
            </li>
            <li>
              Google AdSenseによる広告配信のためのCookie（無料プラン・未ログイン時のみ。利用者の興味関心に応じた広告表示のため、Googleおよび提携先が使用する場合があります）
            </li>
          </ul>
          <p>
            Google Analytics・Google AdSenseで取得される情報の取り扱いについては、
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Googleのプライバシーとポリシー
            </a>
            をご確認ください。パーソナライズ広告は、
            <a
              href="https://adssettings.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Google広告設定
            </a>
            から無効化できます。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">6. 安全管理措置</h2>
          <p>
            運営者は、取得した情報への不正アクセス・漏えい・滅失・毀損を防止するため、通信の暗号化（HTTPS）、ログイン試行回数の制限によるアカウントロック等、合理的な安全管理措置を講じています。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">7. 保有期間・開示等の請求</h2>
          <p>
            取得した個人情報は、本サービスの提供に必要な期間保有します。利用者は、自己の個人情報について、開示・訂正・削除・利用停止を求めることができます。ご希望の場合は、下記の連絡先までご連絡ください。本人確認のうえ、合理的な期間内に対応します。アカウントの削除をご希望の場合も同様にご連絡ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">8. ポリシーの変更</h2>
          <p>
            運営者は、必要に応じて本ポリシーを変更できるものとします。変更後の内容は、本ページに掲載した時点から効力を生じるものとします。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせ、個人情報の開示等の請求は、
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
