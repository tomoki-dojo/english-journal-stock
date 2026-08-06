// リバースプロキシ（CaddyやNginxなど）経由のとき、Next.jsサーバー自体が認識する
// request.urlのorigin（standaloneサーバーのバインドアドレス。このプロジェクトでは
// Dockerfileで HOSTNAME=0.0.0.0 に設定しているため http://0.0.0.0:3000 になる）は、
// 実際に外部から見えている公開ドメインとズレることがある。
// Vercelのようなプラットフォームでは問題にならないが、VPS+Caddyの自前運用では
// この関数を使わないとメールのマジックリンクやStripeのリダイレクト先が壊れる。
//
// Caddyはデフォルトでリバースプロキシ時にX-Forwarded-Host/X-Forwarded-Protoを
// 自動付与するので、それがあれば優先的に使う。
export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
