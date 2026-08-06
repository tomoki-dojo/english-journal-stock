import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// TODO: 仮の名称・ドメイン・説明文。アプリの正式名称とドメインが決まったら差し替える。
const siteUrl = "https://app.english-journal.bear-fruit.online";
const siteTitle = "English Journal Stock（仮）";
const siteDescription =
  "ネイティブ表現・ビジネス英語をシーン別にストックして学べる学習アプリ（開発中）。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${siteTitle}`,
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteUrl,
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
