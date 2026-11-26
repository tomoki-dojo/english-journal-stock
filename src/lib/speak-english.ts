// 単語の読み上げ（ブラウザの読み上げ機能 speechSynthesis を使う。音声ファイルもAIも使わない）。
// 声は端末ごとに違うので、聞きやすい英語（米国）の声から順に探す。

const PREFERRED_VOICE_NAMES = [
  "Samantha", // iPhone・Mac
  "Google US English", // Chrome
  "Microsoft Aria", // Edge
  "Microsoft Jenny",
  "Microsoft Zira",
];

let cachedVoice: SpeechSynthesisVoice | null | undefined;

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  // 声の一覧はあとから読み込まれることがある。空のうちは覚えずに、lang の指定だけで読ませる
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("en"));
  const us = english.filter((v) => v.lang.replace("_", "-").toLowerCase() === "en-us");
  cachedVoice =
    PREFERRED_VOICE_NAMES.map((name) => us.find((v) => v.name.startsWith(name))).find(Boolean) ??
    us.find((v) => v.localService) ??
    us[0] ??
    english[0] ??
    null;
  return cachedVoice;
}

if (canSpeak()) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cachedVoice = undefined;
  });
}

export function speakEnglish(
  text: string,
  handlers: { onStart?: () => void; onEnd?: () => void } = {}
): boolean {
  if (!canSpeak() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  // 前の読み上げが残っていたら止めてから読む（連打したときに溜まらないように）
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => handlers.onStart?.();
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = () => handlers.onEnd?.();
  synth.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
