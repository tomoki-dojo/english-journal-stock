"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { micPermissionHelpMessage } from "@/lib/mic-permission-help";

// ブラウザ内蔵のWeb Speech API（SpeechRecognition）を最小限ラップしたフック。
// サーバー側STTを使わないため追加コスト・レイテンシがゼロ（Stage3設計の前提）。
// Safari（特にiOS）は対応が弱い既知の制約。TypeScript標準libにSpeechRecognitionの型がないため、
// このファイル内だけで最小限の型を定義する（他ファイルへの汚染を避ける）。

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionAlternativeList = { 0: SpeechRecognitionResultLike; isFinal?: boolean };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionAlternativeList> };
type SpeechRecognitionErrorEventLike = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
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
  // continuous時の聞き取り中の途中経過（終了後はtranscriptに確定される）
  liveText: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  errorMessage: string | null;
};

export type UseSpeechRecognitionOptions = {
  lang?: string;
  // true: 途中で言葉に詰まっても止まらず、ユーザーが停止をタップするまで聞き続ける（Stage4/5の会話用）。
  // 停止後にまとめてtranscriptへ反映する。falseは従来どおり1フレーズで自動終了。
  continuous?: boolean;
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const { lang = "en-US", continuous = false } = options;
  const [status, setStatus] = useState<SpeechRecognitionStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = continuous;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (continuous) {
        // 聞き取り中は途中経過を保持するだけ。画面への反映は終了(onend)で行う。
        liveTextRef.current = text;
        setLiveText(text);
        return;
      }
      setTranscript(text);
      setStatus("idle");
    };

    recognition.onerror = (event) => {
      // ブラウザのSpeechRecognitionErrorEvent.errorの値ごとに、原因が伝わる文言に出し分ける
      // （2026-09-11 実機フィードバック：「エラーが発生しました」だけでは原因不明で不親切だった。
      // 特に"not-allowed"はマイク権限がブロックされている場合に頻発するため、対処法まで示す）。
      const message: Record<string, string> = {
        "no-speech": "発話が聞き取れませんでした。もう一度お試しください",
        // 許可の場所は端末・ブラウザで違う（iPhoneは「音声認識」の許可も要る）ので出し分ける。lib/mic-permission-help.ts
        "not-allowed": micPermissionHelpMessage(),
        "service-not-allowed": micPermissionHelpMessage(),
        "audio-capture": "マイクが見つかりませんでした。マイクが接続されているか確認してください",
        network: "音声認識サービスに接続できませんでした。通信環境を確認してもう一度お試しください",
        aborted: "音声入力が中断されました。もう一度お試しください",
      };
      setErrorMessage(message[event.error] ?? "音声認識でエラーが発生しました");
      setStatus("error");
    };

    recognition.onend = () => {
      if (continuous && liveTextRef.current) {
        setTranscript(liveTextRef.current);
      }
      setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, [lang, continuous]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setErrorMessage(null);
    setTranscript("");
    liveTextRef.current = "";
    setLiveText("");
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
    liveTextRef.current = "";
    setLiveText("");
    setErrorMessage(null);
  }, []);

  return { status, transcript, liveText, start, stop, reset, errorMessage };
}
