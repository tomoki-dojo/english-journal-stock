/** @type {import('next').NextConfig} */
const nextConfig = {
  // VPS上のDockerコンテナで自前運用するためのstandalone出力。
  // next start用の最小限のserver.js＋依存パッケージだけがビルド成果物にまとまる。
  // Vercelにデプロイする場合はVercel側が無視するので、Vercel運用と併用しても問題ない。
  output: "standalone",
};

export default nextConfig;
