"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ブラウザ内蔵のWeb Speech API（SpeechRecognition）を最小限ラップしたフック。
// サーバー側STTを使わないため追加コスト・レイテンシがゼロ（Stage3設計の前提）。
// Safari（特にiOS）は対応が弱い既知の制約。TypeScript標準libにSpeechRecognitionの型がないため、
// このファイル内だけで最小限の型を定義する（他ファイルへの汚染を避ける）。

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionAlternativeList = { 0: SpeechRecognitionResultLike };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionAlternativeList> };
type SpeechRecognitionErrorEventLike = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type SpeechRecognitionStatus = "idle" | "listening" | "unsupported" | "error";

export type UseSpeechRecognitionResult = {
  status: SpeechRecognitionStatus;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  errorMessage: string | null;
};

export function useSpeechRecognition(lang = "en-US"): UseSpeechRecognitionResult {
  const [status, setStatus] = useState<SpeechRecognitionStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setTranscript(text);
      setStatus("idle");
    };

    recognition.onerror = (event) => {
      // ブラウザのSpeechRecognitionErrorEvent.errorの値ごとに、原因が伝わる文言に出し分ける
      // （2026-09-11 実機フィードバック：「エラーが発生しました」だけでは原因不明で不親切だった。
      // 特に"not-allowed"はマイク権限がブロックされている場合に頻発するため、対処法まで示す）。
      const message: Record<string, string> = {
        "no-speech": "発話が聞き取れませんでした。もう一度お試しください",
        "not-allowed": "マイクの使用が許可されていません。ブラウザのアドレスバーからマイクの許可を確認してください",
        "service-not-allowed": "マイクの使用が許可されていません。ブラウザのアドレスバーからマイクの許可を確認してください",
        "audio-capture": "マイクが見つかりませんでした。マイクが接続されているか確認してください",
        network: "音声認識サービスに接続できませんでした。通信環境を確認してもう一度お試しください",
        aborted: "音声入力が中断されました。もう一度お試しください",
      };
      setErrorMessage(message[event.error] ?? "音声認識でエラーが発生しました");
      setStatus("error");
    };

    recognition.onend = () => {
      setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setErrorMessage(null);
    setTranscript("");
    setStatus("listening");
    try {
      recognitionRef.current.start();
    } catch {
      // 既に開始中の場合など。ブラウザ側の例外なので無視して構わない。
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setErrorMessage(null);
  }, []);

  return { status, transcript, start, stop, reset, errorMessage };
}
