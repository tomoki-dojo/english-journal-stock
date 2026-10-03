// Illustrator用：アートボード名のコード部分を一括置換する。
// 使い方：対象のドキュメントを開いて、ファイル > スクリプト > その他のスクリプト… からこのファイルを選ぶ。
// 変更前後のコードは下の2行を書き換える（例：KW-0001 → KW-0002）。
var FROM = "KW-0001";
var TO = "KW-0002";

var doc = app.activeDocument;
var changed = 0;

for (var i = 0; i < doc.artboards.length; i++) {
  var artboard = doc.artboards[i];
  if (artboard.name.indexOf(FROM) !== -1) {
    artboard.name = artboard.name.split(FROM).join(TO);
    changed++;
  }
}

alert(changed + " 個のアートボード名を " + FROM + " → " + TO + " に変更しました");
