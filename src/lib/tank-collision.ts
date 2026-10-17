// 水槽内の当たり判定(置物・個体同士)。
// 個体の移動は「目的地を決めてCSSのtransitionで滑らせる」作りで、出発時に終点・開始時刻・所要時間・
// イージングがすべて決まる。そこで毎フレーム位置を計算する代わりに、出発時に「経路上の各時刻」の
// 自分と相手(置物・動いている他個体)の位置を先回りして調べ、どこで触れるか(または触れないか)を求める。
// 触れる場合は、その手前まで歩いて止まり、ぶつかった反応(怒る・コメたんは裏返る)をさせる。
// 位置の反映は従来どおりCSSに任せるので、移動中のJavaScript負荷は増えない。
// 当たり判定は、絵(正方形・足元が下端中央)の胴体あたりに置いた円で行う。画面上の距離は、
// 水槽が横長(縦は横の75%)であることを考慮して測る。

// 円の半径(絵の幅に対する割合)。0.5=円の直径が絵の幅と同じ。調整ポイント: 大きいほど離れて歩き(ぶつかる回数が増え)、小さいほど近寄れる(重なって見えやすい)。
// シミュレーション(絵の矩形の重なりで評価)では、0.4だと6匹で重なりが残り、0.5でほぼ無くなった。
export const BODY_RADIUS_FACTOR = 0.5;
// 円の中心を、足元(アンカー)から絵の幅の何割だけ上に置くか。絵の胴体が足元より上にあるため。
export const BODY_RISE_FACTOR = 0.4;

// 個体の当たり判定の形。円を並べたもので表す(円1つ=丸、斜めに3つ並べる=斜めの楕円)。
// dx=足元(アンカー)から右へ、dy=足元から上へ、r=半径。どれも絵の幅(widthPct)に対する割合。
export type BodyCircle = { dx: number; dy: number; r: number };
export type BodyShape = BodyCircle[];
export const DEFAULT_BODY_SHAPE: BodyShape = [{ dx: 0, dy: BODY_RISE_FACTOR, r: BODY_RADIUS_FACTOR }];

// 楕円(中心(cx,cy)・長い半径a・短い半径b・長軸の角度angleDeg)を、長軸に沿って並べた3つの円で近似する。
// angleDegは右が0度、上向きが正(画面で「／」の向きなら正)。
export function ellipseShape(cx: number, cy: number, a: number, b: number, angleDeg: number): BodyShape {
  const th = (angleDeg * Math.PI) / 180;
  const step = Math.max(0, a - b);
  return [-1, 0, 1].map((k) => ({ dx: cx + k * step * Math.cos(th), dy: cy + k * step * Math.sin(th), r: b }));
}

export type Pt = { left: number; top: number };
export type Ease = "inout" | "linear";
export type Projector = (u: number, v: number) => Pt;

// 他個体が今どこへ向かっているか。track無し=その場に止まっている(終点の(u,v)にいる)。
export type WorldTrack = { fromU: number; fromV: number; t0: number; durMs: number; ease: Ease };
export type WorldEntry = { u: number; v: number; widthPct: number; w?: number; track?: WorldTrack; shape?: BodyShape; onBump?: () => void };
// ground=true: 地面にある平たい障害物(川・倒木など)。立体の置物と違って高さがないので、
// 相手の胴体の円ではなく足元の小さな円(足が地面のどこを踏むか)と照合する。
export type Obstacle = { pt: Pt; radius: number; ground?: boolean };
// 足元の円: 足元から幅のFOOT_RISE_FACTOR倍だけ上に、半径は幅のFOOT_RADIUS_FACTOR倍。
export const FOOT_RADIUS_FACTOR = 0.18;
export const FOOT_RISE_FACTOR = 0.06;
export function footCircle(anchor: Pt, widthPct: number): Obstacle {
  return { pt: { left: anchor.left, top: anchor.top - (FOOT_RISE_FACTOR * widthPct) / 0.75 }, radius: FOOT_RADIUS_FACTOR * widthPct };
}
// 自分(足元の位置・幅・形)と、置物・背景の障害物1つとの余裕(円の距離−半径の和×factor)。groundなら足元の円で、そうでなければ胴体の円で測る。
export function slackToStatic(anchor: Pt, widthPct: number, shape: BodyShape | undefined, st: Obstacle, factor = 1): number {
  const own = st.ground ? [footCircle(anchor, widthPct)] : bodyCircles(anchor, widthPct, shape);
  return circlesSlack(own, [st], factor);
}

export function distPct(a: Pt, b: Pt): number {
  return Math.hypot(a.left - b.left, (a.top - b.top) * 0.75);
}

// 足元の位置(アンカー)と絵の幅から、胴体の円(中心と半径)を求める。置物も同じ式で円にする。
export function bodyCircle(anchor: Pt, widthPct: number): Obstacle {
  return {
    pt: { left: anchor.left, top: anchor.top - (BODY_RISE_FACTOR * widthPct) / 0.75 },
    radius: BODY_RADIUS_FACTOR * widthPct,
  };
}

// 足元の位置(アンカー)と絵の幅・形から、胴体を表す円のリストを求める。
export function bodyCircles(anchor: Pt, widthPct: number, shape: BodyShape = DEFAULT_BODY_SHAPE): Obstacle[] {
  return shape.map((c) => ({
    pt: { left: anchor.left + c.dx * widthPct, top: anchor.top - (c.dy * widthPct) / 0.75 },
    radius: c.r * widthPct,
  }));
}

// 2つの形(円のリスト)の「円の距離 − 半径の和×factor」の最小値。0未満なら触れている。
export function circlesSlack(a: Obstacle[], b: Obstacle[], factor = 1): number {
  let m = Infinity;
  for (const p of a) for (const q of b) m = Math.min(m, distPct(p.pt, q.pt) - (p.radius + q.radius) * factor);
  return m;
}

// CSSの cubic-bezier(0.42,0,0.58,1)(=ease-in-out)。時間の割合xから進み具合(0〜1)を返す。
function bezierY(x: number): number {
  const x1 = 0.42;
  const y1 = 0;
  const x2 = 0.58;
  const y2 = 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(xt) < 1e-5 || Math.abs(dx) < 1e-6) break;
    t -= xt / dx;
  }
  t = Math.min(1, Math.max(0, t));
  return ((ay * t + by) * t + cy) * t;
}

export function progress(ease: Ease, x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return ease === "linear" ? c : bezierY(c);
}

export function entryPointAt(entry: WorldEntry, tMs: number, proj: Projector): Pt {
  const end = proj(entry.u, entry.v);
  const tr = entry.track;
  if (!tr || tMs >= tr.t0 + tr.durMs) return end;
  const start = proj(tr.fromU, tr.fromV);
  if (tMs <= tr.t0) return start;
  const p = progress(tr.ease, (tMs - tr.t0) / tr.durMs);
  return { left: start.left + (end.left - start.left) * p, top: start.top + (end.top - start.top) * p };
}

export type ScanResult = {
  // 経路上(到着後の休憩中を含む)の「円の距離 − 半径の和×factor」の最小値。0以上なら一度も触れない。
  minSlack: number;
  // hitモードのみ: 最初に触れる直前の地点が、移動時間のどこか(0〜1。出発=0、到着=1)。触れなければnull。
  hitFrac: number | null;
  // 時間刻みの数(hitFracの精度の目安)。
  hitSteps: number;
  // hitモードのみ: 最初にぶつかる相手。置物(static)か、他の個体(other。idは呼び出し側が渡したもの)。
  // 将来「仲の悪い種類がぶつかったら小競り合い」のように、相手によって反応を変えるために返している。
  hitWith: { kind: "static" } | { kind: "other"; id?: string } | null;
};

// 出発から終点までの経路を時間刻みで調べる。
// avoidモード: 置物・他個体のどれとも触れない余裕(minSlack)を返す。出発時点で既に重なっている相手は、
//   「遠ざかる動きなら許す(これ以上近づく動きだけ減点)」とし、重なったまま動けなくなるのを防ぐ。
// hitモード: 出発時点で重なっていない相手のうち、最初に触れる直前の地点(hitFrac)を返す。
export function scanPath(o: {
  proj: Projector;
  from: Pt;
  to: Pt;
  startMs: number;
  durMs: number;
  ease: Ease;
  // 自分の絵の幅(%)。足元の位置から胴体の円を作る。
  ownWidthPct: number;
  ownShape?: BodyShape;
  // 置物など動かないもの(胴体の円を渡す)。
  statics: Obstacle[];
  others: { entry: WorldEntry; id?: string }[];
  // 到着後にその場で休む時間も、動いている他個体の経路と照合する。
  restMs?: number;
  // 半径の和にかける係数。1=円が触れる距離。小さいほど深く食い込むまで「触れた」とみなさない。
  factor?: number;
  mode?: "avoid" | "hit";
}): ScanResult {
  const factor = o.factor ?? 1;
  const mode = o.mode ?? "avoid";
  const steps = Math.min(60, Math.max(16, Math.ceil(o.durMs / 250)));
  const total = o.statics.length + o.others.length;
  const startSlack: number[] = new Array(total).fill(Infinity);
  const runMax: number[] = new Array(total).fill(-Infinity);
  let minSlack = Infinity;
  let hitFrac: number | null = null;
  let hitWith: ScanResult["hitWith"] = null;

  const check = (ownAnchor: Pt, t: number, k: number, frac: number, isRest: boolean) => {
    const own = bodyCircles(ownAnchor, o.ownWidthPct, o.ownShape);
    const ownFoot = [footCircle(ownAnchor, o.ownWidthPct)];
    for (let j = 0; j < total; j++) {
      const isStatic = j < o.statics.length;
      if (isRest && isStatic) continue; // 静止物は到着点の判定が経路の最終サンプルで済んでいる
      let target: Obstacle[];
      if (isStatic) {
        target = [o.statics[j]];
      } else {
        const entry = o.others[j - o.statics.length].entry;
        target = bodyCircles(entryPointAt(entry, t, o.proj), entry.widthPct, entry.shape);
      }
      const slack = circlesSlack(isStatic && o.statics[j].ground ? ownFoot : own, target, factor);
      if (k === 0 && !isRest) startSlack[j] = slack;
      if (mode === "hit") {
        if (startSlack[j] < 0) continue;
        if (slack < 0 && hitFrac === null) {
          hitFrac = frac;
          hitWith = isStatic ? { kind: "static" } : { kind: "other", id: o.others[j - o.statics.length].id };
        }
        minSlack = Math.min(minSlack, slack);
        continue;
      }
      let eff = slack;
      if (startSlack[j] < 0 && slack < 0) {
        // 重なった状態で出発した相手: 遠ざかっている間は減点しない
        eff = slack >= runMax[j] - 1e-9 ? 0 : slack - runMax[j];
      }
      runMax[j] = Math.max(runMax[j], slack);
      minSlack = Math.min(minSlack, eff);
    }
  };

  for (let k = 0; k <= steps; k++) {
    const x = k / steps;
    const p = progress(o.ease, x);
    const own = { left: o.from.left + (o.to.left - o.from.left) * p, top: o.from.top + (o.to.top - o.from.top) * p };
    check(own, o.startMs + x * o.durMs, k, x, false);
    if (mode === "hit" && hitFrac !== null) break;
  }
  const rest = mode === "avoid" ? (o.restMs ?? 0) : 0;
  if (rest > 0 && o.others.length > 0) {
    for (let m = 1; m * 400 <= rest; m++) {
      check(o.to, o.startMs + o.durMs + m * 400, 1, 1, true);
    }
  }
  // hitFrac: 触れた最初のサンプルの1つ手前(=触れる直前)で止まらせる
  const stopFrac = hitFrac === null ? null : Math.max(0, hitFrac - 1 / steps);
  return { minSlack: minSlack === Infinity ? 1000 : minSlack, hitFrac: stopFrac, hitSteps: steps, hitWith };
}
