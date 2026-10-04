// Illustrator用：「〇〇_ALL」アートボードの絵を、同じグループのパーツ用アートボードの同じ位置へコピーする。
// コピーは通常のコピー＆ペースト(その場にペースト)で行う。ペースト後、各アートボードで
// そのパーツ以外を選択ツールで消して残す。ガイド用の別レイヤー等は作らず、不透明度も変えない。
//
//   kuwagata_KW-0002_front_ALL  →  kuwagata_KW-0002_front_body / _front_leg_L1 / _front_mandible_01 …
//   kuwagata_KW-0002_back_ALL   →  kuwagata_KW-0002_back_*
//   kuwagata_KW-0002_larva_ALL  →  kuwagata_KW-0002_larva_*
//
// 使い方：ファイル > スクリプト > その他のスクリプト… から選ぶ（先に保存しておくと安心）。
// - すでに絵が入っているパーツ用アートボードはスキップする（二重コピー防止。再実行しても安全）。
// - ロック中・非表示のレイヤーや、ロック・非表示のオブジェクトはコピーしない。
// - ペーストされた絵は、元の絵のあったレイヤー(複数ある場合は先頭のもの)に入る。
// - 「kuwagata_KW-0002_ALL」のような全体用、egg/pupaなど「グループ名_ALL」でないものは対象外。

var GROUPS = ["front", "back", "larva"]; // 対象グループ。増やしたいときはここに足す

var doc = app.activeDocument;

function insideRect(item, rect) {
  var b = item.geometricBounds; // [left, top, right, bottom]
  var cx = (b[0] + b[2]) / 2;
  var cy = (b[1] + b[3]) / 2;
  var minY = Math.min(rect[1], rect[3]);
  var maxY = Math.max(rect[1], rect[3]);
  return cx >= rect[0] && cx <= rect[2] && cy >= minY && cy <= maxY;
}

// アートボード内にある、最上位(レイヤー直下)のアイテムを集める。ロック・非表示のレイヤーは除く。
function collectItems(rect) {
  var found = [];
  function walk(layer) {
    if (layer.locked || !layer.visible) return;
    for (var i = 0; i < layer.pageItems.length; i++) {
      var item = layer.pageItems[i];
      if (item.parent !== layer) continue; // グループの中身は、グループごと扱う
      if (item.hidden || item.locked) continue;
      if (insideRect(item, rect)) found.push(item);
    }
    for (var s = 0; s < layer.layers.length; s++) walk(layer.layers[s]);
  }
  for (var l = 0; l < doc.layers.length; l++) walk(doc.layers[l]);
  return found;
}

// アイテム群をひとまとめにした外枠 [left, top, right, bottom]
function unionBounds(items) {
  var left = Infinity;
  var top = -Infinity;
  var right = -Infinity;
  var bottom = Infinity;
  for (var i = 0; i < items.length; i++) {
    var b = items[i].geometricBounds;
    left = Math.min(left, b[0]);
    top = Math.max(top, b[1]);
    right = Math.max(right, b[2]);
    bottom = Math.min(bottom, b[3]);
  }
  return [left, top, right, bottom];
}

// 名前を比較用に正規化する：全角英数記号→半角、各種空白→除去、小文字化。
// (見た目は同じでも、全角の＿やＡＬＬ、前後の空白などが混ざっている場合に備える)
function normName(n) {
  var s = String(n);
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xff01 && c <= 0xff5e) c -= 0xfee0; // 全角ASCII → 半角
    if (c === 0x3000 || c === 0x00a0 || c === 0x20 || c === 0x09) continue; // 空白類は捨てる
    out += String.fromCharCode(c);
  }
  return out.toLowerCase();
}

var names = [];
for (var i0 = 0; i0 < doc.artboards.length; i0++) names.push(normName(doc.artboards[i0].name));

var report = [];

for (var a = 0; a < doc.artboards.length; a++) {
  for (var g = 0; g < GROUPS.length; g++) {
    var tail = "_" + GROUPS[g] + "_all";
    var srcNorm = names[a];
    if (srcNorm.length <= tail.length || srcNorm.substr(srcNorm.length - tail.length) !== tail) continue;

    var prefix = srcNorm.substr(0, srcNorm.length - 3); // 末尾の "all" を除いた "…_front_"
    var srcName = doc.artboards[a].name;
    var srcRect = doc.artboards[a].artboardRect;
    var sources = collectItems(srcRect);
    var copied = 0;
    var skipped = 0;

    if (sources.length === 0) {
      report.push(srcName + " → コピーする絵が見つかりません（ロック・非表示のレイヤーにありませんか？）");
      continue;
    }

    // ペースト先のアートボードを先に決める(絵が入っていないものだけ)
    var targets = [];
    for (var t = 0; t < doc.artboards.length; t++) {
      if (t === a) continue;
      var targetNorm = names[t];
      if (targetNorm.indexOf(prefix) !== 0) continue; // 同じグループのパーツ用だけ
      if (targetNorm.substr(targetNorm.length - 4) === "_all") continue;
      if (collectItems(doc.artboards[t].artboardRect).length > 0) {
        skipped++; // すでに何か入っている
        continue;
      }
      targets.push(t);
    }

    if (targets.length > 0) {
      // 元の絵をまとめて選択してコピー(ペースト先のレイヤーは、元の絵のあるレイヤーに合わせる)
      var srcBounds = unionBounds(sources);
      try {
        doc.activeLayer = sources[0].layer;
      } catch (e) {}
      doc.selection = null;
      for (var k = 0; k < sources.length; k++) sources[k].selected = true;
      app.copy();

      for (var ti = 0; ti < targets.length; ti++) {
        var tgtRect = doc.artboards[targets[ti]].artboardRect;
        doc.selection = null;
        app.executeMenuCommand("pasteInPlace");

        var pasted = [];
        var sel = doc.selection;
        if (sel && sel.length) {
          for (var q = 0; q < sel.length; q++) pasted.push(sel[q]);
        }
        if (pasted.length === 0) {
          throw new Error("ペーストできませんでした（ペースト先のレイヤーがロック・非表示ではありませんか？）");
        }

        // 目標の位置(元の絵の位置 + アートボード間のずれ)に、ペーストされた絵の外枠を合わせる。
        // ペーストが元の位置に入る場合も、アクティブなアートボードの同じ位置に入る場合も、同じ結果になる。
        var pb = unionBounds(pasted);
        var wantLeft = srcBounds[0] + (tgtRect[0] - srcRect[0]);
        var wantTop = srcBounds[1] + (tgtRect[1] - srcRect[1]);
        var mx = wantLeft - pb[0];
        var my = wantTop - pb[1];
        for (var p = 0; p < pasted.length; p++) pasted[p].translate(mx, my);
        copied++;
      }
      doc.selection = null;
    }

    report.push(srcName + " → " + copied + " 枚にコピー" + (skipped ? "（絵が入っていてスキップ " + skipped + " 枚）" : "") + "／元の絵 " + sources.length + " 個");
  }
}

if (report.length === 0) {
  // 原因調査用：名前に "all" を含むアートボードの末尾の文字コードを出す
  var dbg = [];
  for (var n = 0; n < doc.artboards.length; n++) {
    var raw = String(doc.artboards[n].name);
    if (raw.toLowerCase().indexOf("all") === -1) continue;
    var codes = [];
    for (var ci = Math.max(0, raw.length - 6); ci < raw.length; ci++) codes.push(raw.charCodeAt(ci).toString(16));
    dbg.push("[" + raw + "] 末尾の文字コード: " + codes.join(" "));
  }
  alert(
    "対象のアートボード（例：kuwagata_KW-0002_front_ALL）が見つかりませんでした。\n\n" +
      "開いているドキュメント: " + doc.name + "\nアートボード数: " + doc.artboards.length + "\n\n" +
      dbg.join("\n")
  );
} else {
  alert("コピーしました\n\n" + report.join("\n"));
}
