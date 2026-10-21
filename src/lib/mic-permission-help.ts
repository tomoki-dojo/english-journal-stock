// 音声入力でマイク／音声認識の許可エラー（not-allowed / service-not-allowed）になったときの案内文。
// 許可の場所が端末・ブラウザでまったく違うため、4パターンで出し分ける（2026-10-22 実機確認）。
//   - PC（Chrome・Edgeなど）：サイトのマイク許可だけ。アドレスバーから直せる
//   - Android（Chrome）：サイトのマイク許可＋Chromeアプリ自体のマイク許可
//   - iPhone・iPad（Chromeなど、Safari以外）：iOSの設定でアプリの「マイク」と「音声認識」の両方が必要。
//     「音声認識」がオフでも not-allowed になり、アドレスバーからは直せない
//   - iPhone・iPad（Safari）：Safariのマイク許可＋iOSの「音声入力」

export type MicPlatform = "pc" | "android" | "ios-chrome" | "ios-safari";

export function detectMicPlatform(): MicPlatform {
  if (typeof navigator === "undefined") return "pc";
  const ua = navigator.userAgent;
  // iPadOSはMacと同じUAを名乗るので、タッチ対応かどうかで見分ける
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  if (isIOS) {
    // iOSのChrome・Edge・Firefoxは、それぞれ CriOS / EdgiOS / FxiOS を含む
    return /CriOS|EdgiOS|FxiOS|OPiOS/.test(ua) ? "ios-chrome" : "ios-safari";
  }
  if (/Android/.test(ua)) return "android";
  return "pc";
}

function iosBrowserAppName(): string {
  if (typeof navigator === "undefined") return "Chrome";
  const ua = navigator.userAgent;
  if (/EdgiOS/.test(ua)) return "Edge";
  if (/FxiOS/.test(ua)) return "Firefox";
  if (/OPiOS/.test(ua)) return "Opera";
  return "Chrome";
}

export function micPermissionHelpMessage(platform: MicPlatform = detectMicPlatform()): string {
  switch (platform) {
    case "ios-chrome": {
      const app = iosBrowserAppName();
      return `マイクか音声認識が許可されていません。iPhoneの「設定」→「${app}」で「マイク」と「音声認識」の両方をオンにして、ページを再読み込みしてください`;
    }
    case "ios-safari":
      return "マイクか音声入力が許可されていません。iPhoneの「設定」→「アプリ」→「Safari」→「マイク」を許可し、「設定」→「一般」→「キーボード」の「音声入力」をオンにして、ページを再読み込みしてください";
    case "android":
      return "マイクの使用が許可されていません。アドレスバー左のアイコン →「権限」でマイクを許可してください。それでも使えないときは、スマホの「設定」→「アプリ」→「Chrome」→「権限」でマイクを許可してください";
    case "pc":
    default:
      return "マイクの使用が許可されていません。アドレスバーのマイク（または鍵）のアイコンから、このサイトのマイクを「許可」にして、ページを再読み込みしてください";
  }
}
