/** @type {import('next').NextConfig} */
const nextConfig = {
  // VPS上のDockerコンテナで自前運用するためのstandalone出力。
  // next start用の最小限のserver.js＋依存パッケージだけがビルド成果物にまとまる。
  // Vercelにデプロイする場合はVercel側が無視するので、Vercel運用と併用しても問題ない。
  output: "standalone",
  // 和製英語の記事の音声API（/api/words/audio）は、実行時に記事のMarkdownを読んでフレーズを確かめるので、
  // standaloneの出力に content/words を含める。
  outputFileTracingIncludes: {
    "/api/words/audio/[slug]/[name]": ["./content/words/**/*"],
  },
};

export default nextConfig;
