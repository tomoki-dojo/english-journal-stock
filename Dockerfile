# math-journal-stock 本番用Dockerfile（VPS自前運用向け）
# Next.js公式のstandalone出力を使った3ステージビルド。
# 最終イメージにはビルドツールやソース全体を含めず、実行に必要な最小限だけを残す。

# ---------- 1. 依存関係のインストール専用ステージ ----------
FROM node:20-alpine AS deps
WORKDIR /app

# package.json / package-lock.json だけ先にコピーして、
# ソースコードの変更だけではこのレイヤーのキャッシュを破棄しないようにする
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. ビルド専用ステージ ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# このプロジェクトは public/ ディレクトリを使っていない（faviconはsrc/app/favicon.ico、
# フォントはnext/font/local経由で読み込んでいるため）。
# 将来publicフォルダが追加された場合にも対応できるよう、無ければ空のまま作っておく
# （後段のCOPY --from=builder /app/public が失敗しないようにするため）。
RUN mkdir -p public

# ビルド時にNext.jsが参照する環境変数（NEXT_PUBLIC_*）。
# これらはビルド成果物に埋め込まれるため、docker build時に --build-arg で渡す。
# サーバー専用のシークレット（Supabaseのservice role key、Stripeのkeyなど）は
# ビルドには不要で、コンテナ起動時にしか使わないためここでは扱わない。
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- 3. 実行専用ステージ ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# rootで実行しないための専用ユーザー
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone出力（next.config.mjsのoutput:"standalone"で生成される）だけをコピー。
# server.js・必要なnode_modulesの部分集合・.nextの実行用ファイルがまとまっている。
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
