// 보이싱 판독기 — 코드 판별 엔진 (브라우저/ jsc 공용, 의존성 없음)
(function (global) {
  'use strict';

  var ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  var DEG_BASE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };

  var TUNINGS = {
    standard: { label: 'Standard', midis: [40, 45, 50, 55, 59, 64] },
    dropd: { label: 'Drop D', midis: [38, 45, 50, 55, 59, 64] },
    dadgad: { label: 'DADGAD', midis: [38, 45, 50, 55, 57, 62] },
    openg: { label: 'Open G', midis: [38, 43, 50, 55, 59, 62] }
  };

  function parseDeg(label) {
    var m = /^(bb|b|#)?(\d+)$/.exec(label);
    var acc = m[1] === 'bb' ? -2 : m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    var num = +m[2];
    return { label: label, num: num, semi: (((DEG_BASE[num] + acc) % 12) + 12) % 12 };
  }

  // rank: 작을수록 흔한 코드
  function T(suffix, degs, ko, rank, variant) {
    var d = degs.split(' ').map(parseDeg);
    return { suffix: suffix, degs: d, ko: ko, rank: rank, variant: variant || '',
      set: new Set(d.map(function (x) { return x.semi; })) };
  }

  var TEMPLATES = [
    T('', '1 3 5', '메이저', 0),
    T('m', '1 b3 5', '마이너', 0),
    T('5', '1 5', '파워 코드', 1),
    T('sus2', '1 2 5', '서스 투', 2),
    T('sus4', '1 4 5', '서스 포', 2),
    T('7', '1 3 5 b7', '도미넌트 세븐스', 1),
    T('maj7', '1 3 5 7', '메이저 세븐스', 1),
    T('m7', '1 b3 5 b7', '마이너 세븐스', 1),
    T('6', '1 3 5 6', '메이저 식스', 2),
    T('m6', '1 b3 5 6', '마이너 식스', 3),
    T('add9', '1 3 5 9', '애드 나인', 2),
    T('madd9', '1 b3 5 9', '마이너 애드 나인', 3),
    T('dim', '1 b3 b5', '디미니시', 3),
    T('aug', '1 3 #5', '오그먼트', 3),
    T('m7b5', '1 b3 b5 b7', '하프 디미니시', 2),
    T('dim7', '1 b3 b5 bb7', '디미니시 세븐스', 2),
    T('7sus4', '1 4 5 b7', '세븐 서스 포', 3),
    T('mMaj7', '1 b3 5 7', '마이너 메이저 세븐스', 4),
    T('9', '1 3 5 b7 9', '도미넌트 나인스', 3),
    T('maj9', '1 3 5 7 9', '메이저 나인스', 3),
    T('m9', '1 b3 5 b7 9', '마이너 나인스', 3),
    T('6/9', '1 3 5 6 9', '식스 나인', 4),
    T('m6/9', '1 b3 5 6 9', '마이너 식스 나인', 5),
    T('add11', '1 3 5 11', '애드 일레븐', 4),
    T('madd11', '1 b3 5 11', '마이너 애드 일레븐', 5),
    T('7#5', '1 3 #5 b7', '세븐 샵 파이브', 4),
    T('maj7#5', '1 3 #5 7', '메이저 세븐 샵 파이브', 5),
    T('7b9', '1 3 5 b7 b9', '세븐 플랫 나인', 4),
    T('7#9', '1 3 5 b7 #9', '세븐 샵 나인', 4),
    T('11', '1 3 5 b7 9 11', '일레븐스', 5),
    T('11', '1 5 b7 9 11', '일레븐스', 5, '3음 없는 형태'),
    T('m11', '1 b3 5 b7 9 11', '마이너 일레븐스', 5),
    T('7#11', '1 3 5 b7 #11', '세븐 샵 일레븐', 5),
    T('maj7#11', '1 3 5 7 #11', '메이저 세븐 샵 일레븐', 5),
    T('13', '1 3 5 b7 9 13', '서틴스', 5),
    T('13', '1 3 5 b7 13', '서틴스', 5, '9음 없는 형태'),
    T('maj13', '1 3 5 7 9 13', '메이저 서틴스', 5),
    T('maj13', '1 3 5 7 13', '메이저 서틴스', 5, '9음 없는 형태'),
    T('m13', '1 b3 5 b7 9 13', '마이너 서틴스', 5),
    T('m13', '1 b3 5 b7 13', '마이너 서틴스', 5, '9음 없는 형태'),
    T('7b5', '1 3 b5 b7', '세븐 플랫 파이브', 4),
    T('7sus2', '1 2 5 b7', '세븐 서스 투', 4),
    T('9sus4', '1 4 5 b7 9', '나인 서스 포', 4),
    T('13sus4', '1 4 5 b7 9 13', '서틴 서스 포', 6),
    T('7b13', '1 3 5 b7 b13', '세븐 플랫 서틴', 5),
    T('7#5#9', '1 3 #5 b7 #9', '얼터드 도미넌트', 5),
    T('9#11', '1 3 5 b7 9 #11', '나인 샵 일레븐', 5),
    T('13#11', '1 3 5 b7 9 #11 13', '서틴 샵 일레븐', 6),
    T('13b9', '1 3 5 b7 b9 13', '서틴 플랫 나인', 6),
    T('add#11', '1 3 5 #11', '애드 샵 일레븐', 5),
    T('m(maj9)', '1 b3 5 7 9', '마이너 메이저 나인스', 5),
    T('maj7sus2', '1 2 5 7', '메이저 세븐 서스 투', 5),
    T('m7#5', '1 b3 #5 b7', '마이너 세븐 샵 파이브', 6)
  ];

  // 정확히 맞는 코드가 없을 때 쓰는 기본 코드 + 텐션 표기
  var BASE_SUFFIXES = ['', 'm', 'sus2', 'sus4', '7', 'maj7', 'm7', '6', 'm6', 'dim', 'aug',
    'm7b5', 'dim7', '7sus4', 'mMaj7', '7b5'];
  var BASES = TEMPLATES.filter(function (t) { return !t.variant && BASE_SUFFIXES.indexOf(t.suffix) >= 0; });
  // 반음 → 텐션 이름 (순서 = 표기 순서)
  var TENSIONS = [[1, 'b9'], [2, '9'], [3, '#9'], [5, '11'], [6, '#11'], [8, 'b13'], [9, '13']];
  var TENSION_PENALTY = 3;

  var INTERVAL_KO = ['완전1도', '단2도', '장2도', '단3도', '장3도', '완전4도',
    '증4도(트라이톤)', '완전5도', '단6도', '장6도', '단7도', '장7도'];

  function mod12(n) { return ((n % 12) + 12) % 12; }

  // 루트 이름 표 기준으로 도수에 맞는 글자로 철자
  function spell(rootPc, deg) {
    var rl = LETTERS.indexOf(ROOT_NAMES[rootPc][0]);
    var li = (rl + deg.num - 1) % 7;
    var acc = mod12(rootPc + deg.semi - LETTER_PC[li]);
    if (acc > 6) acc -= 12;
    return LETTERS[li] + (acc > 0 ? new Array(acc + 1).join('#') : new Array(-acc + 1).join('b'));
  }

  // 화면용: # → ♯, b → ♭ (첫 글자는 음 이름이므로 그대로)
  function pretty(s) {
    if (!s) return s;
    return s.replace(/#/g, '♯').replace(/(.)b/g, function (_, c) { return c + '♭'; })
      .replace(/(.)b/g, function (_, c) { return c + '♭'; });
  }

  function identify(midis) {
    var notes = Array.from(new Set(midis)).sort(function (a, b) { return a - b; });
    if (!notes.length) return { type: 'empty', candidates: [] };
    var bassPc = mod12(notes[0]);
    var pcs = [];
    notes.forEach(function (n) { if (pcs.indexOf(mod12(n)) < 0) pcs.push(mod12(n)); });

    // 템플릿 t(+텐션)로 해석한 후보 하나 만들기
    function build(root, t, ints, omit5, tens, extra) {
      var tones = t.degs.concat(tens).filter(function (d) { return ints.has(d.semi); }).map(function (d) {
        var pc = mod12(root + d.semi);
        return { pc: pc, name: spell(root, d), degree: d.label === '1' ? 'R' : d.label, isBass: pc === bassPc };
      });
      var rootName = ROOT_NAMES[root];
      var slash = root !== bassPc;
      var bassName = tones.filter(function (x) { return x.isBass; })[0].name;
      if (/bb|##/.test(bassName.slice(1))) bassName = ROOT_NAMES[bassPc]; // 겹임시표 베이스는 읽기 쉬운 이름으로
      var tensLabel = tens.map(function (d) { return d.label; }).join(',');
      var suffix = t.suffix + (tens.length ? '(' + tensLabel + ')' : '');
      var score = t.rank + 0.2 * (t.degs.length + tens.length) + (omit5 ? 2.5 : 0) + (slash ? 10 : 0) + extra;
      return {
        name: rootName + suffix + (slash ? '/' + bassName : ''),
        root: rootName, suffix: suffix, base: t.suffix, tensions: tens.map(function (d) { return d.label; }), bass: slash ? bassName : null,
        quality: t.ko, variant: tens.length ? '텐션 ' + tensLabel : t.variant, omit5: omit5, tones: tones, score: score
      };
    }
    // 빠진 음이 없거나 5도 하나뿐인지 → { omit5 } 또는 null
    function fits(t, ints) {
      var missing = t.degs.filter(function (d) { return !ints.has(d.semi); });
      if (missing.length > 1 || (missing.length === 1 && missing[0].label !== '5')) return null;
      return { omit5: missing.length === 1 };
    }

    var cands = [];
    if (pcs.length >= 2) {
      pcs.forEach(function (root) {
        var ints = new Set(pcs.map(function (p) { return mod12(p - root); }));
        TEMPLATES.forEach(function (t) {
          var ok = true;
          ints.forEach(function (i) { if (!t.set.has(i)) ok = false; });
          if (!ok) return;
          var f = fits(t, ints);
          if (!f) return;
          if (pcs.length === 2 && f.omit5) return; // 두 음은 정확히 맞는 것(파워 코드)만
          cands.push(build(root, t, ints, f.omit5, [], 0));
        });
      });
    }

    // 루트=베이스로 정확히 맞는 코드가 없으면: 기본 코드 + 남는 음을 텐션으로
    if (pcs.length >= 3 && !cands.some(function (c) { return !c.bass; })) {
      pcs.forEach(function (root) {
        var ints = new Set(pcs.map(function (p) { return mod12(p - root); }));
        BASES.forEach(function (t) {
          var f = fits(t, ints);
          if (!f) return;
          if (t.degs.length - (f.omit5 ? 1 : 0) < 3) return; // 기본 코드 음이 3개 이상 있어야
          var extras = Array.from(ints).filter(function (i) { return !t.set.has(i); });
          if (!extras.length || extras.length > 3) return;
          var tens = [];
          TENSIONS.forEach(function (x) {
            if (extras.indexOf(x[0]) < 0) return;
            if (x[0] === 3 && !t.set.has(4)) return; // #9 는 장3도 있을 때만
            if (x[0] === 9 && !(t.set.has(10) || t.set.has(11))) return; // 13 은 7음 있을 때만
            tens.push(parseDeg(x[1]));
          });
          if (tens.length !== extras.length) return;
          cands.push(build(root, t, ints, f.omit5, tens, 10 + TENSION_PENALTY * tens.length));
        });
      });
    }

    if (cands.length) {
      cands.sort(function (a, b) { return a.score - b.score; });
      var seen = {};
      cands = cands.filter(function (c) { if (seen[c.name]) return false; seen[c.name] = 1; return true; });
      return { type: 'chord', best: cands[0], candidates: cands };
    }

    var plain = pcs.map(function (pc) { return { pc: pc, name: ROOT_NAMES[pc], degree: '', isBass: pc === bassPc }; });
    if (pcs.length === 1) return { type: 'single', label: '단음', tones: plain, candidates: [] };
    if (pcs.length === 2) {
      return { type: 'interval', label: INTERVAL_KO[mod12(pcs[1] - pcs[0])], tones: plain, candidates: [] };
    }
    return { type: 'unknown', label: '이름 붙이기 어려운 조합', tones: plain, candidates: [] };
  }

  // 코드 설명 (구성 · 느낌 · 주로 쓰이는 곳)
  var DESC = {
    '': '장3도와 완전5도로 된 기본 화음입니다. 밝고 안정된 소리라 곡의 시작과 끝, 대부분의 진행에서 뼈대가 됩니다.',
    'm': '단3도와 완전5도로 된 화음입니다. 어둡고 차분한 느낌이라 메이저 키의 ii·iii·vi, 마이너 키의 i에서 자주 나옵니다.',
    '5': '루트와 5도만 있는 파워 코드입니다. 3도가 없어 메이저인지 마이너인지 정해지지 않고, 디스토션 기타의 록·메탈 리프에 많이 씁니다.',
    'sus2': '3도 대신 2도를 둔 코드입니다. 맑고 열린 소리에 어느 쪽으로도 풀리지 않은 듯한 공간감이 있어, 어쿠스틱 팝에서 메이저 코드 대신 자주 씁니다.',
    'sus4': '3도 대신 4도를 둔 코드입니다. 매달린 듯한 긴장이 있어 보통 같은 루트의 메이저나 7 코드로 풀립니다(예: Gsus4 → G).',
    '7': '메이저 화음에 단7도를 더한 도미넌트 세븐스입니다. 3도와 ♭7도 사이의 트라이톤 때문에 완전4도 위 코드로 가려는 힘이 강합니다(G7 → C). 블루스에서는 해결 없이 I·IV·V에 모두 씁니다.',
    'maj7': '메이저 화음에 장7도를 더한 코드입니다. 부드럽고 세련된, 조금 몽환적인 소리라 재즈·시티팝·R&B의 I·IV 코드로 많이 씁니다.',
    'm7': '마이너 화음에 단7도를 더한 코드입니다. 부드러운 마이너 소리로, ii–V–I 진행의 ii나 펑크·소울의 마이너 코드로 흔히 씁니다.',
    '6': '메이저 화음에 장6도를 더한 코드입니다. maj7보다 덜 날카롭고 복고적인 따뜻함이 있어 스윙·올드팝의 끝 코드로 자주 씁니다. 구성음이 같은 m7(예: C6 = Am7/C)과는 베이스로 구분합니다.',
    'm6': '마이너 화음에 장6도를 더한 코드입니다. 신비롭고 쓸쓸한 느낌이라 마이너 키의 i, 집시 재즈·보사노바에 자주 나옵니다.',
    'add9': '메이저 화음에 7도 없이 9도만 더한 코드입니다. 반짝이고 풍성한 메이저 소리라 팝·발라드에서 많이 씁니다.',
    'madd9': '마이너 화음에 9도를 더한 코드입니다. 애틋하고 서정적인 소리라 발라드 인트로에 자주 쓰입니다.',
    'dim': '단3도 두 개를 쌓은 코드(R·♭3·♭5)입니다. 불안정한 긴장감이 있어 반음 위 코드로 이어지는 경과 코드로 많이 씁니다(예: C♯dim → Dm).',
    'aug': '장3도 두 개를 쌓은 코드(R·3·♯5)입니다. 붕 뜬 듯한 긴장감이 있어 5도가 반음씩 올라가는 진행(C → Caug → C6)이나 V7 대신 씁니다.',
    'm7b5': '하프 디미니시(ø)라고도 합니다. 마이너 키 ii–V–i 진행의 ii 코드로 가장 많이 씁니다(예: Bm7♭5 → E7 → Am).',
    'dim7': '단3도를 세 번 쌓은 대칭 코드입니다. 네 음 중 어느 것을 루트로 봐도 모양이 같아 이름이 네 개입니다. 강한 긴장감이 있어 반음 위 코드로 풀리는 경과 코드로 씁니다.',
    '7sus4': '도미넌트 7에서 3도를 4도로 바꾼 코드입니다. 해결을 미루는 긴장감이 있어 V7 앞에 두거나(G7sus4 → G7) 퓨전·가스펠에서 단독으로 씁니다.',
    'mMaj7': '마이너 화음에 장7도를 더한 코드입니다. 스릴러·첩보 영화풍의 긴장된 마이너 소리이고, 마이너 라인 클리셰(Am → AmMaj7 → Am7 → Am6)에서 자주 나옵니다.',
    '9': '도미넌트 7에 9도를 더한 코드입니다. 7의 긴장감에 풍성함이 더해져 펑크·블루스·재즈에서 7 대신 많이 씁니다.',
    'maj9': 'maj7에 9도를 더한 코드입니다. 아주 부드럽고 공간감 있는 소리라 네오소울·시티팝의 I·IV 코드에 잘 어울립니다.',
    'm9': 'm7에 9도를 더한 코드입니다. 따뜻하고 세련된 마이너 소리라 R&B·네오소울·재즈의 ii 코드로 자주 씁니다.',
    '6/9': '메이저 화음에 6도와 9도를 더한 코드입니다. 7도가 없어 안정적이면서도 화려해 재즈·보사노바의 끝 코드로 사랑받습니다.',
    'm6/9': '마이너 화음에 6도와 9도를 더한 코드입니다. 차분하고 세련된 마이너 토닉 코드입니다.',
    'add11': '메이저 화음에 11도(4도)를 더한 코드입니다. 3도와 4도가 부딪혀 독특한 울림이 납니다.',
    'madd11': '마이너 화음에 11도를 더한 코드입니다. 마이너에서는 부딪힘이 적어 개방적이고 모던한 소리가 나고, 기타 개방현 보이싱에서 자주 나옵니다.',
    '7#5': '도미넌트 7의 5도를 반음 올린 코드(7aug)입니다. 해결할 코드의 3도로 끌어당기는 긴장감이 강합니다.',
    'maj7#5': 'maj7의 5도를 반음 올린 코드입니다. 몽환적이고 떠 있는 소리라 재즈에서 가끔 씁니다.',
    '7b9': '도미넌트 7에 ♭9를 더한 코드입니다. 어둡고 강한 긴장감이 있어 마이너 코드로 풀리는 V7(예: E7♭9 → Am)에 특히 잘 어울립니다.',
    '7#9': '도미넌트 7에 ♯9를 더한 코드입니다. 장3도와 단3도가 함께 들려 거칠고 블루지한 소리라 "지미 헨드릭스 코드"라고도 부릅니다.',
    '11': '도미넌트 9에 11도를 더한 코드입니다. 실제로는 3도를 빼고 치는 경우가 많고, 그러면 B♭/C처럼 ♭VII/I로 들립니다. 가스펠·퓨전에서 sus 느낌으로 씁니다.',
    'm11': 'm9에 11도를 더한 코드입니다. 넓게 퍼지는 모던한 마이너 소리라 4도 쌓기 보이싱과 잘 맞습니다.',
    '7#11': '도미넌트 7에 ♯11을 더한 리디안 도미넌트 코드입니다. 밝고 묘한 긴장감이 있어 트라이톤 대리 코드나 IV7에서 자주 씁니다.',
    'maj7#11': 'maj7에 ♯11을 더한 리디안 사운드입니다. 반짝이고 신비로운 소리라 영화음악·재즈의 IV 코드에 잘 어울립니다.',
    '13': '도미넌트 7에 13도를 더한 코드입니다. 꽉 차고 화려한 도미넌트 소리라 재즈·펑크·블루스에서 많이 씁니다. 보통 5도와 11도는 뺍니다.',
    'maj13': 'maj7에 9도·13도를 더한 코드입니다. 매우 풍성하고 부드러운 메이저 토닉 소리입니다.',
    'm13': 'm7에 9도·13도를 더한 코드입니다. 도리안 느낌의 세련된 마이너 소리라 펑크·재즈에서 씁니다.',
    '7b5': '도미넌트 7의 5도를 반음 내린 코드입니다. 트라이톤이 두 개 들어 있어 반음 위·아래 어느 쪽으로도 풀릴 수 있는 긴장감이 있습니다.',
    '7sus2': '도미넌트 7에서 3도 대신 2도를 둔 코드입니다. 열린 느낌의 도미넌트 소리입니다.',
    '9sus4': '7sus4에 9도를 더한 코드입니다. 해결을 미루는 부드러운 긴장감이 있어 가스펠·퓨전·모던 재즈에서 V 대신 자주 씁니다.',
    '13sus4': '9sus4에 13도를 더한 코드입니다. 넓고 풍성한 sus 사운드입니다.',
    '7b13': '도미넌트 7에 ♭13을 더한 코드입니다. 마이너 키의 V7에서 어둡고 애절한 긴장감을 만듭니다.',
    '7#5#9': '얼터드 도미넌트(7alt)의 대표 형태입니다. ♯5와 ♯9가 함께 있어 긴장감이 매우 강하고, 재즈에서 해결 직전의 V 코드로 씁니다.',
    '9#11': '도미넌트 9에 ♯11을 더한 코드입니다. 리디안 도미넌트의 화려한 소리입니다.',
    '13#11': '도미넌트 13에 ♯11을 더한 코드입니다. 가장 풍성한 리디안 도미넌트 사운드입니다.',
    '13b9': '13 코드에 ♭9를 더한 코드입니다. 화려하면서도 어두운 긴장감이 있어 마이너로 풀리는 V7에 씁니다.',
    'add#11': '메이저 화음에 ♯11을 더한 코드입니다. 리디안 느낌의 반짝이는 메이저 소리입니다.',
    'm(maj9)': 'mMaj7에 9도를 더한 코드입니다. 몽환적이고 긴장된 마이너 소리라 영화음악에 잘 어울립니다.',
    'maj7sus2': 'maj7에서 3도 대신 2도를 둔 코드입니다. 맑고 공간감 있는 소리라 앰비언트·모던 팝에서 씁니다.',
    'm7#5': 'm7의 5도를 반음 올린 코드입니다. 실제로는 다른 코드의 전위(예: Cm7♯5 = A♭add9/C)로 들리는 경우가 많습니다.'
  };
  var TENSION_DESC = {
    'b9': '♭9는 루트 반음 위의 음으로 어둡고 강한 긴장을 줍니다.',
    '9': '9는 코드를 풍성하게 만드는 가장 무난한 텐션입니다.',
    '#9': '♯9는 3도와 부딪혀 블루지하고 거친 색을 냅니다.',
    '11': '11은 3도와 부딪혀 sus 같은 느낌을 줍니다(마이너 코드에서는 잘 어울립니다).',
    '#11': '♯11은 리디안 특유의 밝고 묘한 긴장을 줍니다.',
    'b13': '♭13은 어둡고 애절한 긴장을 줍니다.',
    '13': '13(=6도)은 화려하고 꽉 찬 색을 더합니다.'
  };
  var INTERVAL_DESC = [
    '같은 음(옥타브)입니다.',
    '반음 차이로 가장 강하게 부딪히는 음정입니다.',
    '온음 차이로 살짝 부딪히는 음정입니다. sus2·add9의 재료가 됩니다.',
    '마이너 코드의 핵심 음정으로 어둡고 차분한 느낌입니다.',
    '메이저 코드의 핵심 음정으로 밝은 느낌입니다.',
    '안정적이지만 비어 있는 듯한 음정입니다. sus4·4도 쌓기의 재료가 됩니다.',
    '트라이톤이라 부르는 가장 불안정한 음정입니다. 도미넌트 7 코드의 긴장을 만드는 핵심입니다.',
    '가장 잘 어울리는 음정으로 파워 코드의 재료입니다.',
    '장3도를 뒤집은 음정으로 부드럽지만 조금 어두운 느낌입니다.',
    '단3도를 뒤집은 음정으로 밝고 달콤한 느낌입니다.',
    '도미넌트·마이너 7 코드의 7도에 해당하는 음정입니다.',
    '반음만큼 옥타브에 모자라 날카롭게 부딪히는 음정입니다. maj7의 7도입니다.'
  ];
  var INVERSION = { '3': '첫째 자리바꿈(3음이 베이스)', 'b3': '첫째 자리바꿈(3음이 베이스)', '5': '둘째 자리바꿈(5음이 베이스)',
    '#5': '둘째 자리바꿈(5음이 베이스)', 'b5': '둘째 자리바꿈(5음이 베이스)', 'b7': '셋째 자리바꿈(7음이 베이스)',
    '7': '셋째 자리바꿈(7음이 베이스)', 'bb7': '셋째 자리바꿈(7음이 베이스)', '6': '셋째 자리바꿈(6음이 베이스)' };

  function prettyDeg(d) { return d.replace(/b/g, '♭').replace(/#/g, '♯'); }

  // 판별 결과 하나에 대한 설명 문단 목록
  function describe(r) {
    if (!r || r.type === 'empty') return [];
    if (r.type === 'single') return ['음 하나만 선택했어요. 두 음 이상을 찍으면 음정이나 코드 이름을 알려 드려요.'];
    if (r.type === 'interval') return [r.label + ': ' + INTERVAL_DESC[INTERVAL_KO.indexOf(r.label)]];
    if (r.type === 'unknown') return ['어떤 코드를 기준으로 봐도 남는 음이 많은 조합이에요. 반음이 몰린 클러스터이거나 두 코드를 겹친 폴리코드일 수 있어요.'];
    var c = r.shown || r.best, out = [];
    if (DESC[c.base] !== undefined) out.push(DESC[c.base]);
    if (c.tensions && c.tensions.length) {
      out.push(pretty(c.root + c.base) + '에 텐션 ' + c.tensions.map(prettyDeg).join(', ') +
        '이 더해진 것으로 해석했어요. 텐션은 코드의 성격은 그대로 두고 색을 더하는 음입니다. ' +
        c.tensions.map(function (t) { return pretty(TENSION_DESC[t]); }).join(' '));
    }
    if (c.bass) {
      var b = c.tones.filter(function (t) { return t.isBass; })[0];
      var inv = INVERSION[b.degree];
      out.push('슬래시 코드: 루트는 ' + pretty(c.root) + '이지만 가장 낮은 음(베이스)이 ' + pretty(c.bass) + '입니다' +
        (inv ? ' — ' + inv + '.' : ' — 베이스가 텐션음이에요.') +
        ' 베이스 라인을 매끄럽게 잇거나(C → C/B → Am) 색다른 울림을 낼 때 씁니다.');
    }
    if (c.omit5) out.push('5음이 빠졌지만 코드 성격에는 거의 영향이 없어서 기타·피아노 보이싱에서 흔히 생략합니다.');
    return out;
  }

  // 기타에서 같은 코드(구성음 pcs, 베이스 bassPc)를 잡기 쉬운 모양으로 찾기.
  // 4프렛 폭 안에서 손가락 4개(바레는 1개로) 이하, 베이스가 맞는 것 중 낮은 자리·개방현 많은 쪽 우선
  function searchVoicings(tuning, pcs, bassPc, maxFret) {
    maxFret = maxFret || 15;
    var want = {}, all = [], seen = {}, cur = [];
    pcs.forEach(function (p) { want[mod12(p)] = 1; });
    var need = Math.max(3, Math.min(pcs.length, 4));
    function evaluate(fr) {
      var idx = [], i;
      for (i = 0; i < 6; i++) if (fr[i] >= 0) idx.push(i);
      if (idx.length < need) return;
      var have = {}, low = Infinity;
      idx.forEach(function (j) { var m = tuning[j] + fr[j]; have[mod12(m)] = 1; if (m < low) low = m; });
      if (pcs.some(function (p) { return !have[mod12(p)]; })) return;
      if (bassPc !== null && mod12(low) !== mod12(bassPc)) return;
      var fretted = idx.filter(function (j) { return fr[j] > 0; });
      var fv = fretted.map(function (j) { return fr[j]; });
      var minF = fv.length ? Math.min.apply(null, fv) : 0, maxF = fv.length ? Math.max.apply(null, fv) : 0;
      if (maxF - minF > 3) return;
      var atMin = fretted.filter(function (j) { return fr[j] === minF; });
      var fingers = fv.length - (atMin.length >= 2 ? atMin.length - 1 : 0);
      if (fingers > 4) return;
      // 바레를 쓰면 바레 첫 줄보다 높은 줄은 개방현일 수 없음
      if (fv.length > 4 && idx.some(function (j) { return fr[j] === 0 && j > atMin[0]; })) return;
      var inner = 0;
      for (i = idx[0]; i <= idx[idx.length - 1]; i++) if (fr[i] < 0) inner++;
      var opens = idx.filter(function (j) { return fr[j] === 0; }).length;
      // 넓게 벌리는 모양보다 표준 바레 모양이 이기도록 폭(span)에 무게
      // 개방현은 낮은 자리(4프렛 이내)에서만. 높은 자리는 옮겨 쓸 수 있는 막힌 모양으로
      if (opens && maxF > 4) return;
      var score = maxF * 0.6 + (maxF - minF) * 1.3 + (6 - idx.length) * 1.2 + inner * 6 - opens * 0.4 + fingers * 0.5;
      var key = fr.join(',');
      if (!seen[key]) { seen[key] = 1; all.push({ frets: fr.slice(), score: score, minF: fv.length ? minF : 0 }); }
    }
    for (var pos = 0; pos <= maxFret - 3; pos++) {
      var lo = Math.max(1, pos), hi = Math.min(maxFret, pos === 0 ? 3 : pos + 3);
      var opts = tuning.map(function (open) {
        var o = [-1];
        if (want[mod12(open)]) o.push(0);
        for (var f = lo; f <= hi; f++) if (want[mod12(open + f)]) o.push(f);
        return o;
      });
      (function rec(i) {
        if (i === 6) { evaluate(cur); return; }
        for (var k = 0; k < opts[i].length; k++) { cur[i] = opts[i][k]; rec(i + 1); }
      })(0);
    }
    return all;
  }
  function findVoicing(tuning, pcs, bassPc, maxFret) {
    var all = searchVoicings(tuning, pcs, bassPc, maxFret);
    if (!all.length && bassPc !== null) all = searchVoicings(tuning, pcs, null, maxFret);
    if (!all.length) return null;
    all.sort(function (a, b) { return a.score - b.score; });
    return all[0].frets;
  }
  // 지판 위 여러 자리(포지션)의 모양: 자리마다 가장 쉬운 것 하나, 낮은 자리부터
  function findVoicings(tuning, pcs, bassPc, limit) {
    var all = searchVoicings(tuning, pcs, bassPc);
    if (!all.length && bassPc !== null) all = searchVoicings(tuning, pcs, null);
    all.sort(function (a, b) { return a.score - b.score; });
    var byPos = {}, out = [];
    all.forEach(function (v) {
      var p = v.minF <= 3 ? 0 : v.minF; // 개방 자리(1~3프렛)는 하나로
      if (byPos[p] === undefined) { byPos[p] = out.length; out.push(v); }
    });
    out.sort(function (a, b) { return a.minF - b.minF; });
    return out.slice(0, limit || 6).map(function (v) { return v.frets; });
  }

  // 코드 이름 해석: "Cmaj7", "F#m7b5", "G/B", "Bb7(#9)", "CΔ7", "Dø" … → 구성음
  var ALIASES = [
    [/^(maj|M|Δ)$/, ''], [/^(min|mi|-)$/, 'm'], [/^(M7|Maj7|ma7|Δ7|j7)$/, 'maj7'], [/^(M9|Maj9|Δ9)$/, 'maj9'],
    [/^(m7-5|m7\(b5\)|ø|ø7|-7b5|min7b5)$/, 'm7b5'], [/^(°|o)$/, 'dim'], [/^(°7|o7)$/, 'dim7'], [/^(\+|\+5|#5)$/, 'aug'],
    [/^sus$/, 'sus4'], [/^7sus$/, '7sus4'], [/^add2$/, 'add9'], [/^(69|6add9)$/, '6/9'], [/^(m69|m6add9)$/, 'm6/9'],
    [/^(mM7|mmaj7|m\(maj7\)|-maj7|minmaj7)$/, 'mMaj7'], [/^(min7|mi7|-7)$/, 'm7'], [/^(min9|-9)$/, 'm9'], [/^(min6|-6)$/, 'm6'],
    [/^(7-5|7\(b5\))$/, '7b5'], [/^(7\+5|\+7|aug7|7\(#5\))$/, '7#5'], [/^(7-9|7\(b9\))$/, '7b9'], [/^(7\+9|7\(#9\))$/, '7#9'],
    [/^(5|no3)$/, '5'], [/^(dim5)$/, 'dim'], [/^alt$/, '7#5#9'], [/^(maj7\(#11\)|Δ#11)$/, 'maj7#11'], [/^(m\(add9\))$/, 'madd9']
  ];
  function parseChord(text) {
    var t = String(text || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
    var m = /^([A-Ga-g])(#|b)?(.*)$/.exec(t);
    if (!m) return null;
    var letter = m[1].toUpperCase(), rest = m[3], bassPc = null;
    var rootPc = mod12(LETTER_PC[LETTERS.indexOf(letter)] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
    var sl = /\/([A-Ga-g])(#|b)?$/.exec(rest);
    if (sl) {
      bassPc = mod12(LETTER_PC[LETTERS.indexOf(sl[1].toUpperCase())] + (sl[2] === '#' ? 1 : sl[2] === 'b' ? -1 : 0));
      rest = rest.slice(0, sl.index);
    }
    var suffix = rest;
    ALIASES.forEach(function (a) { if (a[0].test(suffix)) suffix = a[1]; });
    var tpl = TEMPLATES.filter(function (x) { return x.suffix === suffix && !x.variant; })[0], tens = [];
    if (!tpl) { // 기본 코드(텐션) 꼴: Cmaj7(b13), C7(9,13)
      var tm = /^(.*?)\(([^)]*)\)$/.exec(suffix);
      if (!tm) return null;
      var base = tm[1];
      ALIASES.forEach(function (a) { if (a[0].test(base)) base = a[1]; });
      tpl = TEMPLATES.filter(function (x) { return x.suffix === base && !x.variant; })[0];
      if (!tpl) return null;
      var bad = false;
      tens = tm[2].split(/[,\s]+/).filter(Boolean).map(function (l) {
        l = l.replace(/^add/, '');
        if (!/^(bb|b|#)?(2|4|6|9|11|13)$/.test(l)) { bad = true; return null; }
        return parseDeg(l.replace(/^(b|#)?2$/, '$19').replace(/^(b|#)?4$/, '$111').replace(/^(b|#)?6$/, '$113'));
      });
      if (bad) return null;
    }
    var degs = tpl.degs.concat(tens);
    var pcs = [];
    degs.forEach(function (d) { var p = mod12(rootPc + d.semi); if (pcs.indexOf(p) < 0) pcs.push(p); });
    if (bassPc !== null && pcs.indexOf(bassPc) < 0) pcs.push(bassPc); // 코드 밖 베이스(C/D 등)
    // 기타에서 잡기 어려우면 뺄 수 있는 음 (5도 → 11도 → 9도 순)
    var optional = ['5', '11', '9'].map(function (l) {
      var d = degs.filter(function (x) { return x.label === l; })[0];
      return d ? mod12(rootPc + d.semi) : null;
    }).filter(function (p) { return p !== null && p !== bassPc; });
    var name = ROOT_NAMES[rootPc] + tpl.suffix + (tens.length ? '(' + tens.map(function (d) { return d.label; }).join(',') + ')' : '') +
      (bassPc !== null && bassPc !== rootPc ? '/' + ROOT_NAMES[bassPc] : '');
    return { rootPc: rootPc, bassPc: bassPc === null ? rootPc : bassPc, suffix: tpl.suffix, pcs: pcs, optional: optional, name: name };
  }
  // 이름 → 기타 포지션 목록 (다 못 잡으면 5도·11도·9도를 차례로 빼고 다시)
  function chordVoicings(tuning, p, limit) {
    var pcs = p.pcs.slice(), list = findVoicings(tuning, pcs, p.bassPc, limit);
    for (var i = 0; !list.length && i < p.optional.length; i++) {
      pcs = pcs.filter(function (x) { return x !== p.optional[i]; });
      list = findVoicings(tuning, pcs, p.bassPc, limit);
    }
    return list;
  }
  // 이름 → 피아노 자리바꿈 목록: 왼손은 C2 옥타브의 베이스(루트 또는 슬래시 베이스),
  // 오른손은 코드음을 G3(55) 이상에서 촘촘히 쌓되 시작음을 바꿔 가며 (기본형, 1전위, 2전위 …)
  function pianoInversions(p) {
    var lh = 36 + p.bassPc;
    var tones = p.pcs.filter(function (x) { return x !== p.bassPc || p.bassPc === p.rootPc || p.pcs.indexOf(x) < p.pcs.length - 1; })
      .sort(function (a, b) { return mod12(a - p.rootPc) - mod12(b - p.rootPc); });
    var out = [];
    for (var k = 0; k < tones.length; k++) {
      var rot = tones.slice(k).concat(tones.slice(0, k));
      var m = 55 + mod12(rot[0] - 55), last, rh = [m];
      last = m;
      for (var i = 1; i < rot.length; i++) { var n = 48 + rot[i]; while (n <= last) n += 12; rh.push(n); last = n; }
      if (last <= 84) out.push([lh].concat(rh));
    }
    return out;
  }
  // 앞 보이싱과 오른손 이동이 가장 적은 자리바꿈의 번호
  function nearestInversion(list, prev) {
    if (!prev || prev.length < 2) return 0;
    var pr = prev.slice().sort(function (a, b) { return a - b; }).slice(1);
    var best = 0, bestCost = Infinity;
    list.forEach(function (v, i) {
      var rh = v.slice(1), cost = 0;
      rh.forEach(function (m) { cost += Math.min.apply(null, pr.map(function (q) { return Math.abs(q - m); })); });
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    return best;
  }

  // 이름 → 피아노 보이싱: 베이스는 C3 옥타브, 나머지는 그 위로 차례로
  function pianoVoicing(p) {
    var bass = 48 + p.bassPc, out = [bass], last = bass;
    var rest = p.pcs.filter(function (x) { return x !== p.bassPc; })
      .sort(function (a, b) { return mod12(a - p.rootPc) - mod12(b - p.rootPc); });
    // 루트를 베이스로 쓰지 않았다면 루트부터 위로 쌓기
    if (p.bassPc !== p.rootPc) { var r = 48 + p.rootPc; while (r <= last) r += 12; out.push(r); last = r; rest = rest.filter(function (x) { return x !== p.rootPc; }); }
    rest.forEach(function (pc) { var m = 48 + pc; while (m <= last) m += 12; out.push(m); last = m; });
    return out;
  }

  // frets: 6번줄(저음)부터, -1 = 뮤트
  function guitarMidis(tuningMidis, frets) {
    var out = [];
    frets.forEach(function (f, i) { if (f >= 0) out.push(tuningMidis[i] + f); });
    return out;
  }

  global.ChordEngine = {
    ROOT_NAMES: ROOT_NAMES, TUNINGS: TUNINGS, TEMPLATES: TEMPLATES,
    identify: identify, findVoicing: findVoicing, findVoicings: findVoicings, parseChord: parseChord,
    chordVoicings: chordVoicings, pianoVoicing: pianoVoicing, pianoInversions: pianoInversions, nearestInversion: nearestInversion, describe: describe, DESC: DESC, prettyDeg: prettyDeg, guitarMidis: guitarMidis, pretty: pretty, spell: spell
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
