// 英単語の原形候補を作る（辞書引き用）。優先度の高い順に返す。先頭は入力そのもの（小文字化）。

const IRREGULAR: Record<string, string[]> = {
  was: ["be"], were: ["be"], been: ["be"], am: ["be"], is: ["be"], are: ["be"],
  had: ["have"], has: ["have"], did: ["do"], does: ["do"], done: ["do"],
  went: ["go"], gone: ["go"], goes: ["go"],
  got: ["get"], gotten: ["get"], made: ["make"], took: ["take"], taken: ["take"],
  came: ["come"], saw: ["see"], seen: ["see"], knew: ["know"], known: ["know"],
  gave: ["give"], given: ["give"], found: ["find"], thought: ["think"],
  told: ["tell"], said: ["say"], felt: ["feel"], left: ["leave"], kept: ["keep"],
  brought: ["bring"], bought: ["buy"], taught: ["teach"], caught: ["catch"],
  held: ["hold"], heard: ["hear"], met: ["meet"], paid: ["pay"], ran: ["run"],
  sat: ["sit"], stood: ["stand"], understood: ["understand"], wrote: ["write"],
  written: ["write"], spoke: ["speak"], spoken: ["speak"], ate: ["eat"], eaten: ["eat"],
  began: ["begin"], begun: ["begin"], chose: ["choose"], chosen: ["choose"],
  drove: ["drive"], driven: ["drive"], flew: ["fly"], flown: ["fly"],
  forgot: ["forget"], forgotten: ["forget"], lost: ["lose"], lent: ["lend"],
  sent: ["send"], spent: ["spend"], built: ["build"], sold: ["sell"], won: ["win"],
  wore: ["wear"], worn: ["wear"], broke: ["break"], broken: ["break"],
  fell: ["fall"], fallen: ["fall"], grew: ["grow"], grown: ["grow"],
  rose: ["rise"], risen: ["rise"], sang: ["sing"], sung: ["sing"], swam: ["swim"],
  threw: ["throw"], thrown: ["throw"], woke: ["wake"], woken: ["wake"],
  slept: ["sleep"], meant: ["mean"], led: ["lead"], read: ["read"], put: ["put"],
  children: ["child"], men: ["man"], women: ["woman"], people: ["person"],
  feet: ["foot"], teeth: ["tooth"], mice: ["mouse"],
  better: ["good", "well"], best: ["good", "well"], worse: ["bad"], worst: ["bad"],
  me: ["I"], my: ["I"], him: ["he"], his: ["he"], her: ["she"], us: ["we"],
  our: ["we"], them: ["they"], their: ["they"], an: ["a"],
  cannot: ["can"], gonna: ["go"], wanna: ["want"],
};

export function lemmaCandidates(raw: string): string[] {
  let w = raw.toLowerCase().replace(/[’]/g, "'");
  // 所有格・短縮形の語尾を外す（it's / John's / don't は本体だけ引く）
  w = w.replace(/'(s|re|ve|ll|d|m)$/, "").replace(/n't$/, "");
  if (w === "ca") w = "can";
  if (w === "wo") w = "will";
  if (w.length === 0) return [];

  const out: string[] = [w];
  const add = (c: string) => {
    if (c.length >= 2 && !out.includes(c)) out.push(c);
  };

  for (const base of IRREGULAR[w] ?? []) {
    const b = base.toLowerCase();
    if (!out.includes(b)) out.push(b); // "I" や "a" のように1文字の原形も許す
  }

  const undouble = (s: string) => (s.length > 2 && s[s.length - 1] === s[s.length - 2] ? s.slice(0, -1) : s);

  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ed")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    add(undouble(w.slice(0, -2)));
  }
  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    add(stem);
    add(stem + "e");
    add(undouble(stem));
    if (w.endsWith("ying")) add(w.slice(0, -4) + "ie");
  }
  if (w.endsWith("ier") || w.endsWith("iest")) add(w.replace(/ier$|iest$/, "y"));
  if (w.endsWith("er")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    add(undouble(w.slice(0, -2)));
  }
  if (w.endsWith("est")) {
    add(w.slice(0, -3));
    add(w.slice(0, -2));
    add(undouble(w.slice(0, -3)));
  }
  if (w.endsWith("ily")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ly")) add(w.slice(0, -2));
  if (w.endsWith("ally")) add(w.slice(0, -4));
  return out;
}
