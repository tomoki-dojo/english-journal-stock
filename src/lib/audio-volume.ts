// 音量の反映。iPhone(iOS)のブラウザは audio.volume を無視する(常に最大になる)ので、
// iOSだけ Web Audio のゲイン経由で音量を変える。PC・Androidは今まで通り audio.volume を使う。

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

let ctx: AudioContext | null = null;
const gains = new WeakMap<HTMLAudioElement, GainNode>();

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

// ユーザー操作(タップ)の中で呼ぶ。iOSでは操作の中で再開しないと、Web Audio経由の音が鳴らない。
export function unlockAudio() {
  if (!isIOS()) return;
  const c = getContext();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

export function setAudioVolume(audio: HTMLAudioElement, volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  if (!isIOS()) {
    audio.volume = v;
    return;
  }
  const c = getContext();
  if (!c) {
    audio.volume = v;
    return;
  }
  let gain = gains.get(audio);
  if (!gain) {
    try {
      const source = c.createMediaElementSource(audio);
      gain = c.createGain();
      source.connect(gain);
      gain.connect(c.destination);
      gains.set(audio, gain);
    } catch {
      audio.volume = v;
      return;
    }
  }
  audio.volume = 1;
  gain.gain.value = v;
  if (c.state !== "running") void c.resume().catch(() => {});
}
