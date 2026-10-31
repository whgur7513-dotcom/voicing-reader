// 판별 로직 단위 테스트. 실행: jsc chord.js tests/chord.test.js  (또는 tests/index.html)
(function (global) {
  var E = global.ChordEngine;
  var out = typeof print === 'function' ? print : function (s) { console.log(s); };
  var std = E.TUNINGS.standard.midis;
  // C3 = 48
  var C3 = 48, D3 = 50, Eb3 = 51, E3 = 52, Gb3 = 54, G3 = 55, A2 = 45, A3 = 57, Bb3 = 58, D4 = 62;
  var pass = 0, fail = 0;

  function names(r) { return r.candidates.map(function (c) { return c.name; }); }
  function check(desc, cond, detail) {
    if (cond) { pass++; out('  ✓ ' + desc); }
    else { fail++; out('  ✗ ' + desc + '  → ' + detail); }
  }
  function best(midis) { var r = E.identify(midis); return r.best ? r.best.name : '(' + r.type + ')'; }

  out('보이싱 판독기 판별 테스트');
  var r;
  r = E.identify(E.guitarMidis(std, [-1, 3, 2, 0, 0, 0]));
  check('x32000 → Cmaj7', r.best.name === 'Cmaj7', r.best.name);

  check('C E G A (베이스 C) → C6', best([C3, E3, G3, A3]) === 'C6', best([C3, E3, G3, A3]));
  check('C E G A (베이스 A) → Am7', best([A2, C3, E3, G3]) === 'Am7', best([A2, C3, E3, G3]));

  r = E.identify([C3, D3, G3]);
  check('C D G → Csus2', r.best.name === 'Csus2', r.best.name);
  check('C D G 후보에 Gsus4/C', names(r).indexOf('Gsus4/C') >= 0, names(r).join(', '));

  check('C E G Bb D → C9', best([C3, E3, G3, Bb3, D4]) === 'C9', best([C3, E3, G3, Bb3, D4]));

  r = E.identify([C3, Eb3, Gb3, A3]);
  check('C Eb Gb A → Cdim7', r.best.name === 'Cdim7', r.best.name);
  var dimRoots = ['Cdim7', 'Ebdim7/C', 'F#dim7/C', 'Adim7/C'];
  check('Cdim7 후보에 네 루트 모두', dimRoots.every(function (n) { return names(r).indexOf(n) >= 0; }), names(r).join(', '));

  r = E.identify(E.guitarMidis(std, [0, 2, 2, -1, -1, -1]));
  check('022xxx (E B) → E5', r.best.name === 'E5', r.best && r.best.name);

  out('추가 확인');
  r = E.identify([G3, Bb3, D4]);
  check('Gm 철자 G Bb D', r.best.tones.map(function (t) { return t.name; }).join(' ') === 'G Bb D', r.best.tones.map(function (t) { return t.name; }).join(' '));
  r = E.identify([C3, E3, G3, Bb3, 63]);
  check('C7#9 의 #9 는 D#', r.best.name === 'C7#9' && r.best.tones.some(function (t) { return t.name === 'D#'; }), r.best.name + ' ' + r.best.tones.map(function (t) { return t.name; }).join(' '));
  check('E G C → C/E', best([E3, G3, 60]) === 'C/E', best([E3, G3, 60]));
  check('x02010 → Am', best(E.guitarMidis(std, [-1, 0, 2, 2, 1, 0])) === 'Am', best(E.guitarMidis(std, [-1, 0, 2, 2, 1, 0])));
  r = E.identify([C3, E3, Bb3]);
  check('C E Bb → C7 (5음 생략)', r.best.name === 'C7' && r.best.omit5, r.best.name + ' omit5=' + r.best.omit5);
  r = E.identify([C3, E3]);
  check('C E → 장3도', r.type === 'interval' && r.label === '장3도', r.type + ' ' + r.label);
  r = E.identify([C3, 60]);
  check('C C → 단음', r.type === 'single', r.type);
  r = E.identify([C3, 49, D3]);
  check('C Db D → 이름 붙이기 어려운 조합', r.type === 'unknown', r.type);

  out('새 코드 템플릿');
  var Gb3x = 54, F3 = 53, B3 = 59, Ab3 = 56, Db3 = 49;
  [[[C3, E3, Gb3x, Bb3], 'C7b5'], [[C3, D3, G3, Bb3], 'C7sus2'], [[C3, F3, G3, Bb3, D4], 'C9sus4'],
   [[C3, E3, G3, Bb3, 68], 'C7b13'], [[C3, E3, Ab3, Bb3, 63], 'C7#5#9'], [[C3, Eb3, G3, B3, D4], 'Cm(maj9)'],
   [[C3, E3, G3, 66], 'Cadd#11'], [[C3, D3, G3, B3], 'Cmaj7sus2']].forEach(function (c) {
    check(c[0].join(' ') + ' → ' + c[1], best(c[0]) === c[1], best(c[0]));
  });

  out('텐션 표기 (정확히 맞는 코드가 없을 때)');
  check('C E G B Ab → Cmaj7(b13)', best([C3, E3, G3, B3, 68]) === 'Cmaj7(b13)', best([C3, E3, G3, B3, 68]));
  check('C Db E G → C(b9)', best([C3, Db3, E3, G3]) === 'C(b9)', best([C3, Db3, E3, G3]));
  check('C Eb G Db → Cm(b9)', best([C3, Eb3, G3, 61]) === 'Cm(b9)', best([C3, Eb3, G3, 61]));
  r = E.identify([C3, E3, G3, B3, 63]);
  check('C E G B D# → Cmaj7(#9)', r.best.name === 'Cmaj7(#9)' && r.best.tones.some(function (t) { return t.name === 'D#' && t.degree === '#9'; }), r.best.name);
  check('E G Bb C → C7/E 유지 (텐션 해석보다 우선)', best([E3, G3, Bb3, 60]) === 'C7/E', best([E3, G3, Bb3, 60]));
  check('C Db D 는 여전히 이름 붙이기 어려움', E.identify([C3, Db3, D3]).type === 'unknown', E.identify([C3, Db3, D3]).type);

  out('코드 설명');
  var noDesc = E.TEMPLATES.filter(function (t) { return E.DESC[t.suffix] === undefined; }).map(function (t) { return t.suffix; });
  check('모든 코드 종류에 설명이 있음', noDesc.length === 0, noDesc.join(', '));
  r = E.identify([E3, G3, Bb3, 60]);
  var d = E.describe(r).join(' ');
  check('C7/E 설명에 자리바꿈 안내', d.indexOf('첫째 자리바꿈') >= 0, d);
  r = E.identify([C3, E3, G3, B3, 68]);
  d = E.describe(r).join(' ');
  check('Cmaj7(b13) 설명에 텐션 안내', d.indexOf('텐션 ♭13') >= 0, d);
  check('음정 설명', E.describe(E.identify([C3, E3])).join('').indexOf('밝은') >= 0, E.describe(E.identify([C3, E3])).join(''));

  out('개방현 코드 키 내리기 (다른 모양 찾기)');
  function vcheck(desc, frets, n, expect) {
    var ms = E.guitarMidis(std, frets).map(function (m) { return m + n; });
    var pcs = []; ms.forEach(function (m) { if (pcs.indexOf(m % 12) < 0) pcs.push(m % 12); });
    var v = E.findVoicing(std, pcs, Math.min.apply(null, ms) % 12);
    var got = v ? v.map(function (f) { return f < 0 ? 'x' : f; }).join('') : 'null';
    var name = v ? E.identify(E.guitarMidis(std, v)).best.name : '-';
    check(desc + ' → ' + expect, got === expect, got + ' (' + name + ')');
  }
  vcheck('C x32010 반음 내림 B', [-1, 3, 2, 0, 1, 0], -1, 'x24442');
  vcheck('G 320003 반음 내림 F#', [3, 2, 0, 0, 0, 3], -1, '244322');
  vcheck('A x02220 반음 내림 Ab', [-1, 0, 2, 2, 2, 0], -1, '466544');
  vcheck('Am x02210 반음 내림 G#m', [-1, 0, 2, 2, 1, 0], -1, '466444');
  vcheck('D xx0232 반음 내림 Db', [-1, -1, 0, 2, 3, 2], -1, 'x46664');

  out('코드 이름 입력 → 포지션');
  function pcheck(text, expectName) {
    var p = E.parseChord(text);
    if (!p) { check(text + ' 해석', false, 'null'); return; }
    var v = E.chordVoicings(std, p, 6);
    var got = v.length ? E.identify(E.guitarMidis(std, v[0])) : null;
    var names = got ? got.candidates.map(function (c) { return c.name; }) : [];
    var pn = E.identify(E.pianoVoicing(p)).candidates.map(function (c) { return c.name; });
    check(text + ' → 기타 ' + (v[0] || []).map(function (f) { return f < 0 ? 'x' : f; }).join('') + ' (' + v.length + '자리), 피아노',
      names.indexOf(expectName) >= 0 && pn.indexOf(expectName) >= 0, names.slice(0, 3).join('/') + ' | ' + pn.slice(0, 3).join('/'));
  }
  pcheck('C', 'C'); pcheck('Am7', 'Am7'); pcheck('Cmaj7', 'Cmaj7'); pcheck('F#m7b5', 'F#m7b5'); pcheck('G/B', 'G/B');
  pcheck('Bb7(#9)', 'Bb7#9'); pcheck('CΔ7', 'Cmaj7'); pcheck('Dø', 'Dm7b5'); pcheck('E7sus', 'E7sus4'); pcheck('G13', 'G13');
  check('알 수 없는 이름 → null', E.parseChord('Hello') === null && E.parseChord('Cxyz') === null, 'not null');

  out('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
  global.__testResult = { pass: pass, fail: fail };
})(typeof globalThis !== 'undefined' ? globalThis : this);
