import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "English Journal Stock";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// TODO: 仮のOGP画像。デザイン・コピーが決まったら差し替える。
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #fafafa 0%, #f0f9ff 60%, #e0f2fe 100%)",
          color: "#18181b",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 4,
            color: "#52525b",
            marginBottom: 24,
          }}
        >
          ENGLISH JOURNAL STOCK
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.3,
            maxWidth: 900,
          }}
        >
          使える英語を、ストックする。
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#52525b",
            marginTop: 32,
            maxWidth: 880,
            lineHeight: 1.5,
          }}
        >
          ネイティブ表現・ビジネス英語をシーン別に管理できる学習アプリ（開発中）
        </div>
      </div>
    ),
    { ...size }
  );
}
