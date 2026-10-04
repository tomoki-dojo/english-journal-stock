// Illustrator用：アートボード名の「KW-〇〇〇〇」の数字部分を一括で入れ替える。
// 使い方：対象のドキュメントを開いて、ファイル > スクリプト > その他のスクリプト… からこのファイルを選ぶ。
// → 表示されるダイアログに数字だけ入力する（例：3 または 0003 → KW-0003 になる）。
// アートボード名の中の「KW-」に続く数字(何桁でも)が、入力した番号(4桁にそろえる)に置き換わる。

var doc = app.activeDocument;

var input = prompt("新しいコードの数字を入力してください（KW- に続く部分。例：0003 または 3）", "");

if (input !== null) {
  var digits = String(input).replace(/[^0-9]/g, ""); // 数字以外(全角の数字や空白など)は無視
  // 全角数字が入力された場合に備えて変換
  var full = String(input);
  var converted = "";
  for (var c = 0; c < full.length; c++) {
    var code = full.charCodeAt(c);
    if (code >= 0xff10 && code <= 0xff19) converted += String.fromCharCode(code - 0xfee0);
    else if (code >= 0x30 && code <= 0x39) converted += full.charAt(c);
  }
  digits = converted;

  if (digits.length === 0 || digits.length > 4) {
    alert("数字は1〜4桁で入力してください（入力: " + input + "）");
  } else {
    while (digits.length < 4) digits = "0" + digits; // 4桁にそろえる
    var newCode = "KW-" + digits;

    var changed = 0;
    for (var i = 0; i < doc.artboards.length; i++) {
      var artboard = doc.artboards[i];
      var renamed = artboard.name.replace(/KW-\d+/g, newCode);
      if (renamed !== artboard.name) {
        artboard.name = renamed;
        changed++;
      }
    }

    alert(changed + " 個のアートボード名を " + newCode + " に変更しました");
  }
}
