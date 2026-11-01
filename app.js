(function () {
  'use strict';
  var E = window.ChordEngine;
  var $ = function (id) { return document.getElementById(id); };
  // 업데이트 중 예전 HTML과 새 스크립트가 섞여도 멈추지 않게
  var on = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };
  var STORE_KEY = 'voicing-reader-v1';
  var FRETS = 15;
  var PIANO_LO = 36, PIANO_HI = 84; // C2 ~ C6 (49건반)
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };

  var DEFAULT = { mode: 'guitar', tuning: 'standard', guitar: [-1, 3, 2, 0, 0, 0], piano: [53, 57, 60, 64],
    sheetOpen: false, sheets: [] };
  var state = load();
  var pick = null; // "다른 이름"에서 고른 이름
  var sel = -1; // 악보에서 선택한 칸

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.guitar) && s.guitar.length === 6 && Array.isArray(s.piano) && E.TUNINGS[s.tuning]) {
        // 악보 여러 개: 예전 한 개짜리(s.sheet)는 첫 악보로 옮김
        var sheets = Array.isArray(s.sheets) ? s.sheets.map(normSheet) : (s.sheet ? [normSheet(s.sheet)] : []);
        return withSheet({ mode: s.mode === 'piano' ? 'piano' : 'guitar', tuning: s.tuning, guitar: s.guitar, piano: s.piano,
          sheetOpen: !!s.sheetOpen, sheets: sheets, sheetId: s.sheetId, showInfo: !!s.showInfo, fingers: s.fingers || null });
      }
    } catch (e) { /* 저장소 사용 불가 — 기본값으로 */ }
    return withSheet(JSON.parse(JSON.stringify(DEFAULT)));
  }
  // state.sheet = 지금 열린 악보 (state.sheets 안의 같은 객체)
  function withSheet(st) {
    if (!st.sheets.length) st.sheets.push(normSheet(null));
    st.sheet = st.sheets.filter(function (x) { return x.id === st.sheetId; })[0] || st.sheets[0];
    st.sheetId = st.sheet.id;
    return st;
  }
  // 예전 형식의 악보도 읽을 수 있게 빈 필드 채우기
  function normSheet(sh) {
    sh = sh && Array.isArray(sh.items) ? sh : {};
    var items = Array.isArray(sh.items) ? sh.items : [];
    items.forEach(function (it, i) { if (!it.id) it.id = 'i' + i + Date.now().toString(36); });
    return { id: sh.id || 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: sh.title || '', items: items,
      lyrics: typeof sh.lyrics === 'string' ? sh.lyrics : '', marks: Array.isArray(sh.marks) ? sh.marks : [],
      showDiagrams: !!sh.showDiagrams, transpose: sh.transpose | 0, updated: sh.updated || Date.now() };
  }
  function save() {
    if (state.sheetOpen && state.sheet) state.sheet.updated = Date.now();
    // state.sheet 는 sheets 안의 객체를 가리키므로 따로 저장하지 않음
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state, function (k, v) { return k === 'sheet' ? undefined : v; })); } catch (e) { /* 무시 */ }
  }

  function tuningMidis() { return E.TUNINGS[state.tuning].midis; }
  function currentMidis() {
    return state.mode === 'guitar' ? E.guitarMidis(tuningMidis(), state.guitar) : state.piano.slice();
  }

  // ---------- 오디오 ----------
  var ctx = null, master = null, ksCache = {}, preloaded = false;
  function ensureAudio() {
    if (!ctx) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 미지원 */ }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      // iOS 잠금 해제용 무음 버퍼
      var b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    }
    if (ctx.state !== 'running') ctx.resume();
    if (!preloaded) { preloaded = true; preload(currentMidis()); }
    return ctx;
  }
  ['touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, ensureAudio, { capture: true, passive: true });
  });

  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Karplus-Strong 기타 음 (미리 계산해 캐시)
  function ksBuffer(m) {
    if (ksCache[m]) return ksCache[m];
    var sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / freq(m)));
    var len = Math.floor(sr * 2.4), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var ring = new Float32Array(N), prev = 0, i;
    for (i = 0; i < N; i++) { prev = 0.55 * prev + 0.45 * (Math.random() * 2 - 1); ring[i] = prev; }
    var decay = 0.9975 - (m - 40) * 0.00002, idx = 0, peak = 0;
    for (i = 0; i < len; i++) {
      var nx = (idx + 1) % N, v = ring[idx];
      d[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
      ring[idx] = (v + ring[nx]) * 0.5 * decay;
      idx = nx;
    }
    if (peak > 0) for (i = 0; i < len; i++) d[i] /= peak;
    return (ksCache[m] = buf);
  }
  function playGuitar(m, when) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = ksBuffer(m);
    g.gain.value = 0.5;
    src.connect(g); g.connect(master);
    src.start(when);
  }
  function playPiano(m, when, vol) {
    var f = freq(m), dur = Math.max(1.2, 3.2 - (m - 48) * 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.006);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, when + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(master);
    [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.05, 'sine']].forEach(function (p) {
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = p[2]; o.frequency.value = f * p[0]; og.gain.value = p[1];
      o.connect(og); og.connect(g);
      o.start(when); o.stop(when + dur + 0.05);
    });
  }
  // 실제 악기 샘플 (FluidR3_GM: 스틸 기타 D2~G5, 그랜드 피아노 C2~C6). 못 받으면 합성음으로
  var SAMPLE_RANGE = { guitar: [38, 79], piano: [36, 84] };
  var FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var samples = {};
  function sample(kind, m) {
    var r = SAMPLE_RANGE[kind];
    if (m < r[0] || m > r[1]) return Promise.reject(new Error('range'));
    var key = kind + m;
    if (!samples[key]) {
      samples[key] = fetch('sounds/' + kind + '/' + FLAT_NAMES[m % 12] + (Math.floor(m / 12) - 1) + '.mp3')
        .then(function (res) { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (ok, fail) { ctx.decodeAudioData(ab, ok, fail); }); });
      samples[key].catch(function () { delete samples[key]; }); // 다음에 다시 시도
    }
    return samples[key];
  }
  var ringing = {}; // 기타 줄마다 울리는 소리 (같은 줄을 다시 치면 이전 소리를 멈춤)
  function playBuffer(buf, when, vol, string) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start(when);
    if (string !== undefined) {
      var prev = ringing[string];
      if (prev) { prev.g.gain.setTargetAtTime(0, when, 0.03); prev.src.stop(when + 0.2); }
      ringing[string] = { src: src, g: g };
    }
  }
  function playSound(kind, m, when, vol, string) {
    sample(kind, m).then(function (buf) {
      playBuffer(buf, Math.max(when, ctx.currentTime), vol, string);
    }, function () {
      var t = Math.max(when, ctx.currentTime);
      if (kind === 'guitar') playGuitar(m, t); else playPiano(m, t, vol * 0.45);
    });
  }
  function preload(midis) {
    if (!ctx) return;
    midis.forEach(function (m) { sample(state.mode, m).catch(function () {}); });
  }
  function playNote(m, string) {
    if (!ensureAudio()) return;
    var t = ctx.currentTime + 0.01;
    if (state.mode === 'guitar') playSound('guitar', m, t, 0.9, string); else playSound('piano', m, t, 0.75);
  }
  function playAll() {
    if (!ensureAudio()) return;
    if (state.mode === 'guitar') {
      // 6번줄부터 스트럼: 모든 샘플이 준비된 뒤 한 번에 예약
      var tm = tuningMidis(), notes = [];
      state.guitar.forEach(function (f, s) { if (f >= 0) notes.push({ m: tm[s] + f, s: s }); });
      Promise.all(notes.map(function (n) { return sample('guitar', n.m).catch(function () { return null; }); })).then(function (bufs) {
        var t = ctx.currentTime + 0.02;
        notes.forEach(function (n, i) {
          if (bufs[i]) playBuffer(bufs[i], t + i * 0.035, 0.75, n.s); else playGuitar(n.m, t + i * 0.035);
        });
      });
    } else {
      var ms = currentMidis(), vol = 0.75 / Math.sqrt(Math.max(1, ms.length));
      Promise.all(ms.map(function (m) { return sample('piano', m).catch(function () { return null; }); })).then(function (bufs) {
        var t = ctx.currentTime + 0.02;
        ms.forEach(function (m, i) { if (bufs[i]) playBuffer(bufs[i], t, vol); else playPiano(m, t, 0.32 / Math.sqrt(ms.length)); });
      });
    }
  }

  // ---------- 결과 ----------
  var result = null, shown = null;
  function analyze() {
    result = E.identify(currentMidis());
    shown = null;
    if (result.type === 'chord') {
      shown = result.candidates.filter(function (c) { return c.name === pick; })[0] || result.best;
    }
  }
  function nameHtml(c) {
    return esc(E.pretty(c.root + c.suffix)) + (c.bass ? '<span class="slash">/' + esc(E.pretty(c.bass)) + '</span>' : '');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chipHtml(t) {
    return '<span class="chip' + (t.isBass ? ' bass' : '') + '">' + esc(E.pretty(t.name)) +
      (t.degree ? '<span class="deg">' + esc(E.prettyDeg(t.degree)) + '</span>' : '') + '</span>';
  }
  function renderResult() {
    var nameEl = $('chordName'), sub = $('chordSub');
    nameEl.className = 'result-name';
    var tones = [], alts = [];
    if (result.type === 'empty') {
      nameEl.textContent = '–';
      sub.textContent = state.mode === 'guitar' ? '지판에서 음을 찍어 보세요' : '건반에서 음을 찍어 보세요';
    } else if (result.type === 'chord') {
      nameEl.innerHTML = nameHtml(shown);
      if (shown.name.length > 10) nameEl.classList.add('long'); // 긴 이름은 작게
      else if (shown.name.length > 5) nameEl.classList.add('mid');
      sub.innerHTML = esc(shown.quality) + (shown.bass ? ' · 슬래시 코드' : '') +
        (shown.variant ? '<span class="tag">' + esc(E.pretty(shown.variant)) + '</span>' : '') +
        (shown.omit5 ? '<span class="tag">5음 생략</span>' : '');
      tones = shown.tones;
      alts = result.candidates.filter(function (c) { return c !== shown; }).slice(0, 8);
    } else {
      tones = result.tones;
      if (result.type === 'single') { nameEl.textContent = E.pretty(tones[0].name); sub.textContent = '단음'; }
      else if (result.type === 'interval') {
        nameEl.textContent = result.label; nameEl.classList.add('small');
        sub.textContent = '두 음의 음정';
      } else { nameEl.textContent = result.label; nameEl.classList.add('small'); sub.textContent = '구성음'; }
    }
    $('tones').innerHTML = tones.map(chipHtml).join('');
    var paras = E.describe({ type: result.type, label: result.label, best: result.best, shown: shown });
    $('infoToggle').hidden = !paras.length;
    if ($('shiftDown')) $('shiftDown').disabled = $('shiftUp').disabled = result.type === 'empty';
    $('infoToggle').textContent = state.showInfo ? '코드 설명 접기' : '코드 설명 보기';
    $('infoToggle').setAttribute('aria-expanded', !!state.showInfo);
    $('info').hidden = !paras.length || !state.showInfo;
    $('info').innerHTML = '<div class="info-head"><b>코드 설명</b><button class="info-close" type="button">닫기</button></div>' +
      paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    $('altsWrap').hidden = !alts.length;
    $('alts').innerHTML = alts.map(function (c) {
      return '<button class="alt" data-name="' + esc(c.name) + '">' + nameHtml(c).replace('class="slash"', '') + '</button>';
    }).join('');
  }

  function noteName(m) {
    var pc = ((m % 12) + 12) % 12;
    var src = shown ? shown.tones : (result && result.tones) || [];
    var t = src.filter(function (x) { return x.pc === pc; })[0];
    return E.pretty(t ? t.name : E.ROOT_NAMES[pc]);
  }

  // ---------- 기타 ----------
  // 가로 화면이면 지판을 실제 기타처럼 가로로
  var LAND = window.matchMedia('(orientation: landscape) and (min-width: 600px)');
  function renderGuitar() {
    var tm = tuningMidis(), ms = currentMidis(), bass = Math.min.apply(null, ms.length ? ms : [Infinity]);
    var land = LAND.matches;
    function openCell(s) {
      var f = state.guitar[s], m = tm[s], inner = '';
      if (f === 0) inner = '<span class="mark note' + (m === bass ? ' bass' : '') + '">' + noteName(m) + '</span>';
      else if (f < 0) inner = '<span class="mark">×</span>';
      return '<button class="g-cell g-open' + (f === 0 ? ' on' : '') + '" data-s="' + s + '" data-f="0" aria-label="' +
        (6 - s) + '번줄 개방현">' + inner + '</button>';
    }
    function fretCell(s, f) {
      var on = state.guitar[s] === f, m = tm[s] + f, inlay = '';
      // 인레이는 두 줄 사이 경계에 (세로: 오른쪽 경계, 가로: 아래쪽 경계)
      var pos = land ? 'top:100%;transform:translateY(-50%)' : 'left:100%;transform:translateX(-50%)';
      var single = land ? 3 : 2, dbl = land ? [2, 4] : [1, 3];
      if ([3, 5, 7, 9, 15].indexOf(f) >= 0 && s === single) inlay = '<span class="g-inlay" style="' + pos + '"></span>';
      if (f === 12 && dbl.indexOf(s) >= 0) inlay = '<span class="g-inlay" style="' + pos + '"></span>';
      return '<button class="g-cell g-fret' + (f === 1 ? ' first' : '') + '" style="--sw:' + (3 - s * 0.35).toFixed(2) + 'px" data-s="' + s +
        '" data-f="' + f + '" aria-label="' + (6 - s) + '번줄 ' + f + '프렛">' + inlay +
        (on ? '<span class="dot' + (m === bass ? ' bass' : '') + '">' + noteName(m) +
          (state.fingers && state.fingers.g[s] ? '<i class="fing">' + state.fingers.g[s] + '</i>' : '') + '</span>' : '') + '</button>';
    }
    var h = [], f, s;
    if (land) {
      // 위가 1번줄(고음 E), 아래가 6번줄, 왼쪽이 헤드
      for (s = 5; s >= 0; s--) {
        h.push('<div class="g-head">' + E.pretty(E.ROOT_NAMES[tm[s] % 12]) + '</div>', openCell(s));
        for (f = 1; f <= FRETS; f++) h.push(fretCell(s, f));
      }
      h.push('<div></div>');
      for (f = 0; f <= FRETS; f++) h.push('<div class="g-num">' + f + '</div>');
    } else {
      h.push('<div></div>');
      tm.forEach(function (m) { h.push('<div class="g-head">' + E.pretty(E.ROOT_NAMES[m % 12]) + '</div>'); });
      h.push('<div class="g-num">0</div>');
      for (s = 0; s < 6; s++) h.push(openCell(s));
      for (f = 1; f <= FRETS; f++) {
        h.push('<div class="g-num">' + f + '</div>');
        for (s = 0; s < 6; s++) h.push(fretCell(s, f));
      }
    }
    $('guitarView').classList.toggle('h', land);
    $('guitarView').innerHTML = h.join('');
  }
  // 손가락으로 줄을 가로질러 쓸면 스트럼 (세로 화면: 좌우로, 가로 화면: 위아래로)
  var strum = null, suppressClick = false;
  function stringAt(x, y) {
    var el = document.elementFromPoint(x, y), c = el && el.closest('#guitarView [data-s]');
    return c ? +c.dataset.s : null;
  }
  function pluck(s) {
    var f = state.guitar[s];
    if (f < 0) return; // 뮤트한 줄은 소리 없음
    playNote(tuningMidis()[s] + f, s);
    var dot = $('guitarView').querySelector('[data-s="' + s + '"][data-f="' + f + '"] .dot, [data-s="' + s + '"][data-f="0"] .mark.note');
    if (dot) { dot.classList.remove('hit'); void dot.offsetWidth; dot.classList.add('hit'); }
  }
  $('guitarView').addEventListener('pointerdown', function (e) {
    strum = { x: e.clientX, y: e.clientY, last: stringAt(e.clientX, e.clientY), active: false };
  });
  $('guitarView').addEventListener('pointermove', function (e) {
    if (!strum) return;
    var land = LAND.matches, dx = Math.abs(e.clientX - strum.x), dy = Math.abs(e.clientY - strum.y);
    var along = land ? dy : dx, across = land ? dx : dy;
    if (!strum.active) {
      if (along > 10 && along > across) {
        strum.active = true;
        if (!ensureAudio()) { strum = null; return; }
        if (strum.last !== null) pluck(strum.last);
      } else if (across > 10) strum = null; // 스크롤 방향 → 스트럼 아님
      return;
    }
    var s = stringAt(e.clientX, e.clientY);
    if (s === null || s === strum.last) return;
    if (strum.last === null) pluck(s);
    else for (var k = strum.last + (s > strum.last ? 1 : -1); ; k += s > strum.last ? 1 : -1) { pluck(k); if (k === s) break; } // 빨리 쓸어 건너뛴 줄도
    strum.last = s;
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    $('guitarView').addEventListener(ev, function () {
      if (strum && strum.active) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 350); }
      strum = null;
    });
  });
  $('guitarView').addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; } // 스트럼 끝의 탭은 무시
    var b = e.target.closest('button[data-s]');
    if (!b) return;
    var s = +b.dataset.s, f = +b.dataset.f;
    state.fingers = null; // 손으로 바꾸면 사전의 손가락 정보는 맞지 않음
    if (state.guitar[s] === f) state.guitar[s] = -1; // 같은 칸 다시 탭 → 뮤트
    else { state.guitar[s] = f; playNote(tuningMidis()[s] + f, s); }
    changed();
  });

  // ---------- 피아노 ----------
  function renderPiano() {
    var bass = Math.min.apply(null, state.piano.length ? state.piano : [Infinity]);
    // 세로: 한 줄에 한 옥타브, 가로: 두 옥타브. 마지막 줄에 C6 포함
    var span = LAND.matches ? 24 : 12, n = LAND.matches ? 15 : 8;
    var rows = [];
    for (var lo = PIANO_LO; lo < PIANO_HI; lo += span) {
      var hi = lo + span >= PIANO_HI ? PIANO_HI : lo + span - 1, oct = lo / 12 - 1, hiOct = Math.floor(hi / 12) - 1;
      rows.push([lo, hi, 'C' + oct + ' – ' + (hi === PIANO_HI ? 'C' + hiOct : 'B' + hiOct)]);
    }
    $('pianoView').innerHTML = rows.map(function (r) {
      var whites = [], blacks = [], wi = 0;
      for (var m = r[0]; m <= r[1]; m++) {
        var on = state.piano.indexOf(m) >= 0, cls = (on ? ' on' : '') + (on && m === bass ? ' bass' : '');
        var label = on ? noteName(m) : (m % 12 === 0 ? 'C' + (m / 12 - 1) : '');
        if (BLACK[m % 12]) {
          blacks.push('<button class="bkey' + cls + '" data-m="' + m + '" style="left:calc(100% / var(--n) * ' + wi + ' - 100% / var(--n) * .32)" aria-label="' +
            E.ROOT_NAMES[m % 12] + (Math.floor(m / 12) - 1) + '">' + (on ? label : '') + '</button>');
        } else {
          whites.push('<button class="wkey' + cls + '" data-m="' + m + '" aria-label="' + E.ROOT_NAMES[m % 12] + (Math.floor(m / 12) - 1) + '">' + label + '</button>');
          wi++;
        }
      }
      return '<div><div class="octave-label">' + r[2] + '</div><div class="keys" style="--n:' + n + '">' + whites.join('') + blacks.join('') + '</div></div>';
    }).reverse().join('');
  }
  $('pianoView').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-m]');
    if (!b) return;
    var m = +b.dataset.m, i = state.piano.indexOf(m);
    if (i >= 0) state.piano.splice(i, 1);
    else { state.piano.push(m); playNote(m); }
    changed();
  });

  // ---------- 반음 이동 ----------
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function transposeNote(nm, n) {
    var pc = LETTER_PC[nm[0]];
    for (var i = 1; i < nm.length; i++) pc += nm[i] === '#' ? 1 : -1;
    return E.ROOT_NAMES[(((pc + n) % 12) + 12) % 12];
  }
  // "Cmaj7/E" → "Dmaj7/F#", "A C"(구성음 나열) → "B D"
  function transposeName(name, n) {
    if (!n) return name;
    return name.split(' ').map(function (tok) {
      return tok.replace(/^[A-G](?:bb|##|b|#)?/, function (m) { return transposeNote(m, n); })
        .replace(/\/([A-G](?:bb|##|b|#)?)$/, function (_, m) { return '/' + transposeNote(m, n); });
    }).join(' ');
  }
  // 기타 모양을 n프렛 옮김 (개방현도 함께 이동). 지판을 벗어나면 null
  function shiftFrets(frets, n) {
    var out = frets.map(function (f) { return f < 0 ? f : f + n; });
    return out.every(function (f) { return f < 0 || f <= FRETS; }) && out.every(function (f) { return f >= -1; }) &&
      !frets.some(function (f, i) { return f >= 0 && out[i] < 0; }) ? out : null;
  }
  // 악보용: n, n±12 중 지판 안에 들어가는 가장 낮은 자리
  // 같은 코드·같은 베이스를 지판에서 잡기 쉬운 다른 모양으로
  function revoice(frets, n, tuning) {
    var ms = E.guitarMidis(tuning, frets).map(function (m) { return m + n; });
    if (!ms.length) return null;
    var r = E.identify(ms), p = r.type === 'chord' && E.parseChord(r.best.name);
    if (p) { var list = E.chordVoicings(tuning, p, 6); if (list.length) return list[0]; }
    var pcs = [];
    ms.forEach(function (m) { if (pcs.indexOf(m % 12) < 0) pcs.push(m % 12); });
    return E.findVoicing(tuning, pcs, Math.min.apply(null, ms) % 12, FRETS);
  }
  function fingersOf(v) { return v && v.fingers ? { g: v.fingers.slice(), b: (v.barres || []).slice() } : null; }
  function shiftFingers(fg, n) { return fg ? { g: fg.g.slice(), b: fg.b.map(function (x) { return x + n; }) } : null; }
  function fitFrets(frets, n, tuning) {
    var same = shiftFrets(frets, n);
    if (same) return same;
    var v = tuning && revoice(frets, n, tuning);
    if (v) return v;
    var c = [n + 12, n - 12, n + 24, n - 24].map(function (k) { return shiftFrets(frets, k); }).filter(Boolean);
    c.sort(function (a, b) { return Math.max.apply(null, a) - Math.max.apply(null, b); });
    return c[0] || frets;
  }
  function shiftCurrent(n) {
    if (state.mode === 'guitar') {
      var out = shiftFrets(state.guitar, n);
      if (out) state.fingers = shiftFingers(state.fingers, n);
      else {
        out = revoice(state.guitar, n, tuningMidis());
        if (!out) { toast('잡을 수 있는 모양을 찾지 못했어요'); return; }
        state.fingers = fingersOf(out);
        toast(n < 0 && state.guitar.indexOf(0) >= 0 ? '개방현이라 다른 모양으로 바꿨어요' : '다른 모양으로 바꿨어요');
      }
      state.guitar = out;
    } else {
      var ms = state.piano.map(function (m) { return m + n; });
      if (ms.some(function (m) { return m < PIANO_LO || m > PIANO_HI; })) { toast('건반 범위(C2~C6)를 벗어나요'); return; }
      state.piano = ms;
    }
    changed();
    playAll();
  }

  // ---------- 악보 ----------
  var D = window.ChordDiagram;
  function diagram(it) {
    it = tv(it);
    return it.kind === 'guitar' ? D.guitar(it.frets, it.fingers) : D.piano(it.midis);
  }
  // 키 바꾸기: 담은 코드는 그대로 두고 화면에 보일 때만 옮긴다
  // (t0 = 담을 때의 키 이동값 → 실제 이동 = 지금 값 − t0)
  function shiftOf(it) { return (state.sheet.transpose || 0) - (it.t0 || 0); }
  function tv(it) {
    var n = shiftOf(it);
    if (!n) return it;
    var fr = it.kind === 'guitar' ? fitFrets(it.frets, n, E.TUNINGS[it.tuning].midis) : it.frets, fg = null;
    if (it.kind === 'guitar') {
      var same = shiftFrets(it.frets, n);
      fg = same && same.join() === fr.join() ? shiftFingers(it.fingers, n) : fingersOf(fr);
    }
    return { id: it.id, kind: it.kind, tuning: it.tuning, name: transposeName(it.name, n), frets: fr, fingers: fg,
      midis: it.midis.map(function (m) { return m + n; }) };
  }
  function nameOf(it) { return tv(it).name; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function capture() {
    if (result.type === 'empty') return;
    var name = shown ? shown.name : result.type === 'single' ? result.tones[0].name
      : result.tones.map(function (t) { return t.name; }).join(' ');
    state.sheet.items.push({
      id: newId(), t0: state.sheet.transpose || 0, name: name, quality: shown ? shown.quality : result.label, kind: state.mode, tuning: state.tuning,
      frets: state.guitar.slice(), fingers: state.mode === 'guitar' ? state.fingers : null,
      midis: currentMidis().sort(function (a, b) { return a - b; })
    });
    save();
    state.sheet.updated = Date.now();
    toast('‘' + (state.sheet.title.trim() || '제목 없는 악보') + '’에 담았어요 · ' + state.sheet.items.length + '개');
  }
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1600);
  }

  // 가사: 줄/글자 위치(l, c)에 담은 코드(id)를 붙인다
  var lyricsEditing = false, pickPos = null;
  function lyricLines() { return state.sheet.lyrics.split('\n'); }
  function itemById(id) { return state.sheet.items.filter(function (it) { return it.id === id; })[0]; }
  function markAt(l, c) { return state.sheet.marks.filter(function (m) { return m.l === l && m.c === c; })[0]; }
  function hasContent() { return state.sheet.items.length > 0 || state.sheet.lyrics.trim() !== ''; }

  function renderSheet() {
    var items = state.sheet.items;
    if (document.activeElement !== $('sheetTitle')) $('sheetTitle').value = state.sheet.title;
    renderLibBtn();
    if (sel >= items.length) sel = -1;
    $('sheetGrid').innerHTML = items.map(function (it, i) {
      var tuning = it.kind === 'guitar' && it.tuning !== 'standard' ? '<span class="sc-tuning">' + esc(E.TUNINGS[it.tuning].label) + '</span>' : '';
      return '<button class="sheet-card' + (i === sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="sc-num">' + (i + 1) + '</span><span class="sc-name' + (nameOf(it).length > 7 ? ' long' : '') + '">' + esc(E.pretty(nameOf(it))) + '</span>' +
        '<span class="sc-diagram ' + it.kind + '">' + diagram(it).svg + '</span>' + tuning + '</button>';
    }).join('') + '<button class="sheet-card add-card" data-add="1"><b>＋</b><span>코드 추가</span></button>' +
      (items.length ? '' : '<p class="sheet-empty">＋ 코드 추가로 이름을 입력하거나 직접 그려서 넣을 수 있어요.<br>기타·피아노 화면의 ＋ 버튼으로 담아도 돼요.</p>');
    $('sheetBar').hidden = sel < 0;
    $('sheetPdf').disabled = $('sheetImgBtn').disabled = $('sheetClear').disabled = !hasContent();
    var t = state.sheet.transpose || 0;
    if ($('tLabel')) $('tLabel').textContent = t ? (t > 0 ? '+' : '−') + Math.abs(t) + ' (반음 ' + Math.abs(t) + '개 ' + (t > 0 ? '위' : '아래') + ')' : '원래 키';
    if ($('tReset')) $('tReset').disabled = !t;
    renderLyrics();
    renderPicker();
  }

  function renderLyrics() {
    $('lyricsEdit').hidden = !lyricsEditing;
    $('lyricsView').hidden = lyricsEditing;
    $('lyricsToggle').textContent = lyricsEditing ? '완료' : state.sheet.lyrics.trim() ? '가사 편집' : '가사 입력';
    $('lyricsDiag').checked = !!state.sheet.showDiagrams;
    if (lyricsEditing) return;
    if (!state.sheet.lyrics.trim()) {
      $('lyricsView').innerHTML = '<p class="sheet-empty small">‘가사 입력’을 눌러 가사를 쓴 뒤,<br>글자를 탭하면 그 위에 담은 코드를 넣을 수 있어요.</p>';
      return;
    }
    $('lyricsView').innerHTML = lyricLines().map(function (line, l) {
      var chars = Array.from(line);
      if (!chars.length) return '<div class="ly-line empty"></div>';
      return '<div class="ly-line">' + chars.map(function (ch, c) {
        var m = markAt(l, c), it = m && itemById(m.id);
        var on = pickPos && pickPos.l === l && pickPos.c === c;
        var chord = it ? '<span class="ly-name">' + esc(E.pretty(nameOf(it))) + '</span>' +
          (state.sheet.showDiagrams ? '<span class="ly-diag ' + it.kind + '">' + diagram(it).svg + '</span>' : '') : '';
        return '<button class="ly-cell' + (it ? ' has' : '') + (on ? ' sel' : '') + '" data-l="' + l + '" data-c="' + c + '">' +
          '<span class="ly-chord">' + (chord ? '<span class="ly-chord-in">' + chord + '</span>' : '') + '</span><span class="ly-ch">' + (ch === ' ' ? '&nbsp;' : esc(ch)) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    spaceChords();
  }
  // 코드는 폭 0으로 글자 위에 걸치므로, 앞 코드와 겹칠 때만 그 글자 앞을 띄움
  function spaceChords() {
    $('lyricsView').querySelectorAll('.ly-line').forEach(function (line) {
      var prev = null;
      line.querySelectorAll('.ly-cell.has').forEach(function (cell) { cell.style.marginLeft = ''; });
      line.querySelectorAll('.ly-cell.has').forEach(function (cell) {
        var box = cell.querySelector('.ly-chord-in'), r = box.getBoundingClientRect();
        if (prev && Math.abs(r.top - prev.top) < 4 && r.left < prev.right + 6) {
          cell.style.marginLeft = (prev.right + 6 - r.left) + 'px';
          r = box.getBoundingClientRect();
        }
        prev = r;
      });
    });
  }

  function renderPicker() {
    $('chordPicker').hidden = !pickPos;
    if (!pickPos) return;
    var ch = Array.from(lyricLines()[pickPos.l] || '')[pickPos.c] || '';
    $('pickerTitle').textContent = '‘' + (ch.trim() || '빈칸') + '’ 위에 넣을 코드';
    // 같은 이름·같은 보이싱은 한 번만
    var seen = {}, uniq = state.sheet.items.filter(function (it) {
      var k = nameOf(it) + '|' + diagram(it).svg;
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    $('pickerChips').innerHTML = '<button class="pick-chip new-chip" data-new="1"><b>＋</b>새 코드</button>' + uniq.map(function (it) {
      return '<button class="pick-chip" data-id="' + it.id + '"><span class="pc-diag ' + it.kind + '">' + diagram(it).svg + '</span>' + esc(E.pretty(nameOf(it))) + '</button>';
    }).join('');
    $('pickerRemove').hidden = !markAt(pickPos.l, pickPos.c);
    placePicker();
  }
  // 코드 고르기 창을 탭한 글자 바로 위에 (자리가 없으면 아래에) 띄움
  function placePicker() {
    var pk = $('chordPicker');
    if (!pickPos || pk.hidden) return;
    var cell = $('lyricsView').querySelector('[data-l="' + pickPos.l + '"][data-c="' + pickPos.c + '"]');
    if (!cell) return;
    var r = cell.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(360, vw - 24), h = pk.offsetHeight, cx = r.left + r.width / 2;
    var left = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
    var top = r.top - h - 10, below = top < 8;
    if (below) top = Math.min(vh - h - 8, r.bottom + 10);
    pk.style.width = w + 'px';
    pk.style.left = left + 'px';
    pk.style.top = top + 'px';
    pk.style.setProperty('--ax', (cx - left) + 'px'); // 꼬리 위치
    pk.classList.toggle('below', below);
  }
  window.addEventListener('scroll', placePicker, { passive: true });
  window.addEventListener('resize', function () { spaceChords(); placePicker(); });

  $('sheetGrid').addEventListener('click', function (e) {
    if (e.target.closest('[data-add]')) { sel = -1; pickPos = null; renderSheet(); openEditor({}); return; }
    var b = e.target.closest('button[data-i]');
    if (!b) return;
    playChord(tv(state.sheet.items[+b.dataset.i]));
    sel = sel === +b.dataset.i ? -1 : +b.dataset.i;
    pickPos = null;
    renderSheet();
  });
  $('sheetBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b || sel < 0) return;
    var items = state.sheet.items, act = b.dataset.act;
    if (act === 'left' && sel > 0) { items.splice(sel - 1, 0, items.splice(sel, 1)[0]); sel--; }
    else if (act === 'right' && sel < items.length - 1) { items.splice(sel + 1, 0, items.splice(sel, 1)[0]); sel++; }
    else if (act === 'edit') { openEditor({ item: items[sel] }); return; }
    else if (act === 'delete') {
      var gone = items.splice(sel, 1)[0];
      state.sheet.marks = state.sheet.marks.filter(function (m) { return m.id !== gone.id; });
      sel = -1;
    }
    else if (act === 'load') {
      var it = tv(items[sel]);
      state.mode = it.kind;
      if (it.kind === 'guitar') { state.tuning = it.tuning; state.guitar = it.frets.slice(); state.fingers = it.fingers || null; }
      else state.piano = it.midis.slice();
      state.sheetOpen = false; sel = -1;
      changed(); window.scrollTo(0, 0);
      return;
    }
    save(); renderSheet();
  });
  $('sheetTitle').addEventListener('input', function () { state.sheet.title = this.value; save(); });
  $('sheetClear').addEventListener('click', function () {
    if (!confirm('악보의 코드와 가사를 모두 지울까요?')) return;
    state.sheet.items = []; state.sheet.lyrics = ''; state.sheet.marks = [];
    sel = -1; pickPos = null; lyricsEditing = false; save(); renderSheet();
  });

  $('lyricsToggle').addEventListener('click', function () {
    lyricsEditing = !lyricsEditing; pickPos = null;
    if (lyricsEditing) {
      $('lyricsText').value = state.sheet.lyrics;
    } else {
      // 가사가 짧아져 사라진 위치의 코드는 정리
      var lens = lyricLines().map(function (x) { return Array.from(x).length; });
      state.sheet.marks = state.sheet.marks.filter(function (m) { return m.l < lens.length && m.c < lens[m.l]; });
      save();
    }
    renderSheet();
    if (lyricsEditing) $('lyricsText').focus();
  });
  $('lyricsText').addEventListener('input', function () { state.sheet.lyrics = this.value; save(); });
  $('lyricsDiag').addEventListener('change', function () { state.sheet.showDiagrams = this.checked; save(); renderLyrics(); });
  $('lyricsView').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-l]');
    if (!b) return;
    var p = { l: +b.dataset.l, c: +b.dataset.c };
    // 코드 이름·코드표를 탭하면 소리만, 글자를 탭하면 코드 고르기
    var m = e.target.closest('.ly-chord-in') && markAt(p.l, p.c), it = m && itemById(m.id);
    if (it) { playChord(tv(it)); return; }
    pickPos = pickPos && pickPos.l === p.l && pickPos.c === p.c ? null : p;
    sel = -1;
    renderSheet();
  });
  $('pickerChips').addEventListener('click', function (e) {
    if (e.target.closest('[data-new]')) { var place = pickPos; pickPos = null; renderSheet(); openEditor({ place: place }); return; }
    var b = e.target.closest('button[data-id]');
    if (!b || !pickPos) return;
    var p = pickPos;
    state.sheet.marks = state.sheet.marks.filter(function (m) { return !(m.l === p.l && m.c === p.c); });
    state.sheet.marks.push({ l: p.l, c: p.c, id: b.dataset.id });
    var it = itemById(b.dataset.id);
    if (it) playChord(tv(it));
    pickPos = null; save(); renderSheet();
  });
  $('pickerRemove').addEventListener('click', function () {
    var p = pickPos;
    state.sheet.marks = state.sheet.marks.filter(function (m) { return !(m.l === p.l && m.c === p.c); });
    pickPos = null; save(); renderSheet();
  });
  $('pickerClose').addEventListener('click', function () { pickPos = null; renderSheet(); });

  $('sheetPdf').addEventListener('click', function () {
    sel = -1; pickPos = null; lyricsEditing = false; renderSheet();
    window.print();
  });

  // 악보 전체(코드표 + 가사)를 PNG 한 장으로
  function loadImg(svg) {
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = fail;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/currentColor/g, '#1c1c1e'));
    });
  }
  var FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
  var LY_FONT = '400 26px ' + FONT, CH_FONT = '700 21px ' + FONT;
  var DIAG_W = 56, DIAG_H = 64;
  // 가사를 폭에 맞춰 줄바꿈한 행 목록
  function lyricRows(c, maxW) {
    var rows = [], diag = !!state.sheet.showDiagrams;
    if (!state.sheet.lyrics.trim()) return rows;
    lyricLines().forEach(function (line, l) {
      // 코드는 글자 폭을 넓히지 않고 글자 왼쪽에서 시작. 앞 코드와 겹칠 때만 글자를 민다.
      var chars = Array.from(line), row = { cells: [], chord: false }, x = 0, chordEnd = 0;
      chars.forEach(function (ch, ci) {
        var m = markAt(l, ci), it = m && itemById(m.id);
        c.font = LY_FONT;
        var w = c.measureText(ch).width, cw = 0;
        if (it) {
          c.font = CH_FONT;
          cw = Math.max(c.measureText(E.pretty(nameOf(it))).width + 10, diag ? DIAG_W + 6 : 0);
          x = Math.max(x, chordEnd);
        }
        if (x + w > maxW && row.cells.length) { rows.push(row); row = { cells: [], chord: false }; x = 0; chordEnd = 0; }
        row.cells.push({ x: x, ch: ch, it: it });
        if (it) { row.chord = true; chordEnd = x + cw; }
        x += w;
      });
      rows.push(row);
    });
    rows.forEach(function (r) {
      r.chordH = r.chord ? 26 + (diag ? DIAG_H + 4 : 0) : 0;
      r.h = r.cells.length ? r.chordH + 40 : 22;
    });
    return rows;
  }
  function sheetPng() {
    var items = state.sheet.items, title = state.sheet.title.trim();
    var cols = 4, cw = 250, ch = 290, pad = 36, head = title ? 96 : 30, sc = 2;
    var W = pad * 2 + cols * cw;
    var gridH = Math.ceil(items.length / cols) * ch;
    var cv = document.createElement('canvas');
    var c = cv.getContext('2d');
    var rows = lyricRows(c, W - pad * 2);
    var lyricsH = rows.reduce(function (a, r) { return a + r.h; }, 0);
    var H = head + gridH + (rows.length ? 24 + lyricsH : 0) + pad;
    cv.width = W * sc; cv.height = H * sc;
    c.scale(sc, sc);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    if (title) { c.fillStyle = '#1c1c1e'; c.font = '700 40px ' + FONT; c.fillText(title, pad, pad + 40); }
    return Promise.all(items.map(function (it) { return loadImg(diagram(it).svg); })).then(function (imgs) {
      var imgById = {};
      items.forEach(function (it, i) {
        imgById[it.id] = imgs[i];
        var x = pad + (i % cols) * cw, y = head + Math.floor(i / cols) * ch;
        c.strokeStyle = '#d0ccc4'; c.lineWidth = 1.5;
        c.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
        c.fillStyle = '#8a8a90'; c.font = '600 15px ' + FONT; c.fillText(String(i + 1), x + 18, y + 30);
        var size = 36, name = E.pretty(nameOf(it));
        c.fillStyle = '#1c1c1e'; c.font = '750 ' + size + 'px ' + FONT;
        while (c.measureText(name).width > cw - 40 && size > 18) { size -= 2; c.font = '750 ' + size + 'px ' + FONT; }
        c.fillText(name, x + 18, y + 70);
        var d = diagram(it), k = Math.min((cw - 60) / d.w, (ch - 110) / d.h);
        c.drawImage(imgs[i], x + (cw - d.w * k) / 2, y + 88, d.w * k, d.h * k);
      });
      var y = head + gridH + 24;
      rows.forEach(function (r) {
        r.cells.forEach(function (cell) {
          var x = pad + cell.x;
          if (cell.it) {
            c.fillStyle = '#c56f12'; c.font = CH_FONT; c.fillText(E.pretty(nameOf(cell.it)), x, y + 20);
            if (state.sheet.showDiagrams) {
              var d = diagram(cell.it), k = Math.min(DIAG_W / d.w, DIAG_H / d.h);
              // 코드표 왼쪽 끝 줄(기타 sx(0)=22, 건반 1)을 글자 왼쪽에 맞춤
              var ox = (cell.it.kind === 'guitar' ? 22 : 1) * k;
              c.drawImage(imgById[cell.it.id], x - ox, y + 26, d.w * k, d.h * k);
            }
          }
          c.fillStyle = '#1c1c1e'; c.font = LY_FONT; c.fillText(cell.ch, x, y + r.chordH + 28);
        });
        y += r.h;
      });
      return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
    });
  }
  var pngBlob = null;
  $('sheetImgBtn').addEventListener('click', function () {
    sel = -1; pickPos = null; renderSheet();
    sheetPng().then(function (blob) {
      pngBlob = blob;
      $('sheetImg').src = URL.createObjectURL(blob);
      $('imgOverlay').hidden = false;
    }).catch(function () { toast('이미지를 만들지 못했어요'); });
  });
  function pngFile() {
    return new File([pngBlob], (state.sheet.title.trim() || '코드 악보') + '.png', { type: 'image/png' });
  }
  $('shareImg').addEventListener('click', function () {
    var f = pngFile();
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f], title: f.name }).catch(function () { /* 취소 */ });
    } else {
      var a = document.createElement('a');
      a.href = $('sheetImg').src; a.download = f.name; a.click();
    }
  });
  $('closeImg').addEventListener('click', function () { $('imgOverlay').hidden = true; });

  function setTranspose(t) {
    state.sheet.transpose = Math.max(-12, Math.min(12, t));
    save(); renderSheet();
  }
  on('tDown', 'click', function () { setTranspose((state.sheet.transpose || 0) - 1); });
  on('tUp', 'click', function () { setTranspose((state.sheet.transpose || 0) + 1); });
  on('tReset', 'click', function () { setTranspose(0); });

  // 개방현을 쓰거나 1~3프렛 안이면 '개방', 아니면 가장 낮은 프렛
  function posText(frets) {
    var fv = frets.filter(function (f) { return f > 0; });
    if (!fv.length || frets.indexOf(0) >= 0 || Math.max.apply(null, fv) <= 3) return '개방';
    return Math.min.apply(null, fv) + '프렛';
  }
  // ---------- 내 악보 (여러 곡 보관) ----------
  function sheetTitle(sh) { return sh.title.trim() || '제목 없는 악보'; }
  function openSheet(id) {
    state.sheet = state.sheets.filter(function (x) { return x.id === id; })[0] || state.sheets[0];
    state.sheetId = state.sheet.id;
    sel = -1; pickPos = null; lyricsEditing = false;
    save(); renderSheet(); renderLibBtn();
  }
  function renderLibBtn() {
    if ($('libBtn')) $('libBtn').textContent = '📂 내 악보 (' + state.sheets.length + ')';
  }
  function dateText(t) {
    var d = new Date(t), now = new Date();
    return d.toDateString() === now.toDateString() ? d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2)
      : (d.getMonth() + 1) + '/' + d.getDate();
  }
  function renderLib() {
    var list = state.sheets.slice().sort(function (a, b) { return b.updated - a.updated; });
    $('libBox').innerHTML = '<div class="ed-head"><b>내 악보 (' + state.sheets.length + ')</b><button type="button" data-lib="close">닫기</button></div>' +
      '<button type="button" class="lib-new" data-lib="new">＋ 새 악보 만들기</button>' +
      list.map(function (sh) {
        var info = '코드 ' + sh.items.length + '개' + (sh.lyrics.trim() ? ' · 가사' : '') + (sh.transpose ? ' · 키 ' + (sh.transpose > 0 ? '+' : '−') + Math.abs(sh.transpose) : '') + ' · ' + dateText(sh.updated);
        return '<div class="lib-row' + (sh.id === state.sheetId ? ' cur' : '') + '">' +
          '<button type="button" class="lib-main" data-lib="open" data-id="' + sh.id + '"><b>' + esc(sheetTitle(sh)) + '</b><span>' +
          (sh.id === state.sheetId ? '지금 열린 악보 · ' : '') + info + '</span></button>' +
          '<button type="button" data-lib="rename" data-id="' + sh.id + '">이름</button>' +
          '<button type="button" data-lib="dup" data-id="' + sh.id + '">복제</button>' +
          '<button type="button" class="danger" data-lib="del" data-id="' + sh.id + '">삭제</button></div>';
      }).join('');
  }
  function newSheet() {
    var sh = normSheet(null);
    state.sheets.push(sh);
    openSheet(sh.id);
    toast('새 악보를 만들었어요');
  }
  on('libBtn', 'click', function () { renderLib(); $('libOverlay').hidden = false; });
  on('newSheet', 'click', newSheet);
  on('libOverlay', 'click', function (e) {
    if (e.target === $('libOverlay')) { $('libOverlay').hidden = true; return; }
    var b = e.target.closest('[data-lib]');
    if (!b) return;
    var act = b.dataset.lib, id = b.dataset.id;
    var sh = state.sheets.filter(function (x) { return x.id === id; })[0];
    if (act === 'close') { $('libOverlay').hidden = true; return; }
    if (act === 'new') { $('libOverlay').hidden = true; newSheet(); return; }
    if (act === 'open') { $('libOverlay').hidden = true; openSheet(id); return; }
    if (act === 'rename') {
      var t = prompt('악보 이름', sh.title);
      if (t === null) return;
      sh.title = t.trim(); sh.updated = Date.now();
      save(); if (sh === state.sheet) renderSheet();
    } else if (act === 'dup') {
      var copy = normSheet(JSON.parse(JSON.stringify(sh)));
      copy.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      copy.title = sheetTitle(sh) + ' 복사본'; copy.updated = Date.now();
      state.sheets.push(copy); save(); toast('복제했어요');
    } else if (act === 'del') {
      if (!confirm('‘' + sheetTitle(sh) + '’ 악보를 지울까요? 되돌릴 수 없어요.')) return;
      state.sheets = state.sheets.filter(function (x) { return x !== sh; });
      if (!state.sheets.length) state.sheets.push(normSheet(null));
      if (sh === state.sheet) {
        var next = state.sheets.slice().sort(function (a, b) { return b.updated - a.updated; })[0];
        openSheet(next.id);
      } else save();
    }
    renderLib(); renderLibBtn();
  });

  // ---------- 악보에서 직접 코드 추가·수정 (이름 입력 / 작은 코드표에 그리기) ----------
  var ed = null;
  function autoStart(fr) {
    var fv = fr.filter(function (f) { return f > 0; });
    if (!fv.length) return 1;
    var mx = Math.max.apply(null, fv), mn = Math.min.apply(null, fv);
    return mx <= 5 ? 1 : Math.min(mn, FRETS - 4);
  }
  function openEditor(opt) {
    var base = opt.item ? tv(opt.item) : null;
    ed = { item: opt.item || null, place: opt.place || null,
      kind: base ? base.kind : state.mode, tuning: base && base.tuning ? base.tuning : state.tuning,
      frets: base && base.kind === 'guitar' ? base.frets.slice() : [-1, -1, -1, -1, -1, -1],
      fingers: base && base.fingers ? { g: base.fingers.g.slice(), b: base.fingers.b.slice() } : null,
      midis: base && base.kind === 'piano' ? base.midis.slice() : [], p: null, list: null, li: 0, query: base ? nameOf(opt.item) : '' };
    ed.start = autoStart(ed.frets);
    $('chordEditor').hidden = false;
    renderEditor();
  }
  function closeEditor() { ed = null; $('chordEditor').hidden = true; }
  function edMidis() {
    return ed.kind === 'guitar' ? E.guitarMidis(E.TUNINGS[ed.tuning].midis, ed.frets) : ed.midis.slice();
  }
  function edName() {
    var ms = edMidis();
    if (!ms.length) return null;
    var r = E.identify(ms);
    if (r.type !== 'chord') return r.type === 'single' ? r.tones[0].name : r.tones.map(function (t) { return t.name; }).join(' ');
    if (ed.p) {
      var p = ed.p, hit = r.candidates.filter(function (c) {
        return c.suffix === p.suffix && E.parseChord(c.root).rootPc === p.rootPc && (c.bass ? E.parseChord(c.bass).rootPc : p.rootPc) === p.bassPc;
      })[0];
      if (hit) return hit.name;
    }
    return r.best.name;
  }
  function edApply() {
    var v = ed.list[ed.li];
    if (ed.kind === 'guitar') { ed.frets = v.slice(); ed.fingers = fingersOf(v); ed.start = autoStart(ed.frets); }
    else ed.midis = v.slice();
  }
  function edBuild() {
    if (!ed.p) { ed.list = null; return; }
    if (ed.kind === 'guitar') {
      ed.list = E.chordVoicings(E.TUNINGS[ed.tuning].midis, ed.p, 6);
      ed.li = 0;
    } else {
      ed.list = E.pianoInversions(ed.p);
      if (!ed.list.length) ed.list = [E.pianoVoicing(ed.p)];
      ed.li = E.nearestInversion(ed.list, ed.midis.length ? ed.midis : state.piano);
    }
    if (ed.list.length) edApply(); else { ed.list = null; toast('잡을 수 있는 모양을 찾지 못했어요'); }
  }
  function edPlay() { playChord(ed); }
  // 기타는 6번줄부터 스트럼, 피아노는 한 번에. c = { kind, tuning, frets, midis }
  function playChord(c) {
    if (!ensureAudio()) return;
    var notes = c.kind === 'guitar'
      ? c.frets.map(function (f, s) { return f < 0 ? null : { m: E.TUNINGS[c.tuning].midis[s] + f, s: s }; }).filter(Boolean)
      : c.midis.map(function (m) { return { m: m }; });
    var kind = c.kind;
    Promise.all(notes.map(function (n) { return sample(kind, n.m).catch(function () { return null; }); })).then(function (bufs) {
      var t = ctx.currentTime + 0.02, vol = kind === 'guitar' ? 0.75 : 0.75 / Math.sqrt(Math.max(1, notes.length));
      notes.forEach(function (n, i) {
        var w = kind === 'guitar' ? t + i * 0.035 : t;
        if (bufs[i]) playBuffer(bufs[i], w, vol, kind === 'guitar' ? n.s : undefined);
        else if (kind === 'guitar') playGuitar(n.m, w); else playPiano(n.m, w, 0.3);
      });
    });
  }
  function renderEditor() {
    if (!ed) return;
    var name = edName(), h = [];
    h.push('<div class="ed-head"><b>' + (ed.item ? '코드 수정' : '코드 추가') + '</b><button type="button" data-ed="close">닫기</button></div>');
    h.push('<form class="chord-find" id="edFind" autocomplete="off"><input id="edQuery" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
      'placeholder="코드 이름 (예: Am7, G/B)" value="' + esc(ed.query) + '"><button type="submit">보기</button></form>');
    h.push('<div class="segmented ed-kind"><button type="button" data-ed="kind" data-v="guitar" aria-selected="' + (ed.kind === 'guitar') + '">기타</button>' +
      '<button type="button" data-ed="kind" data-v="piano" aria-selected="' + (ed.kind === 'piano') + '">피아노</button></div>');
    if (ed.list && ed.list.length > 1) {
      var lab;
      if (ed.kind === 'guitar') {
        lab = '포지션 ' + (ed.li + 1) + '/' + ed.list.length + ' · ' + posText(ed.frets);
      } else lab = (ed.li ? ed.li + '전위' : '기본형') + ' (' + (ed.li + 1) + '/' + ed.list.length + ')';
      h.push('<div class="pos-nav"><button type="button" data-ed="prev" aria-label="이전">◀</button><span>' + lab + '</span><button type="button" data-ed="next" aria-label="다음">▶</button></div>');
    }
    if (ed.kind === 'guitar') {
      var tm = E.TUNINGS[ed.tuning].midis, g = ['<div class="ed-grid"><div></div>'];
      for (var s = 0; s < 6; s++) {
        var f0 = ed.frets[s];
        g.push('<button type="button" class="ed-open" data-ed="open" data-s="' + s + '" aria-label="' + (6 - s) + '번줄 개방/뮤트">' +
          (f0 === 0 ? 'O' : f0 < 0 ? '×' : '') + '</button>');
      }
      for (var r = 0; r < 5; r++) {
        var fr = ed.start + r;
        g.push('<div class="ed-num">' + fr + '</div>');
        for (s = 0; s < 6; s++) {
          var on = ed.frets[s] === fr, fn = on && ed.fingers && ed.fingers.g[s];
          g.push('<button type="button" class="ed-cell' + (fr === 1 ? ' first' : '') + '" data-ed="fret" data-s="' + s + '" data-f="' + fr + '" aria-label="' +
            (6 - s) + '번줄 ' + fr + '프렛">' + (on ? '<span class="ed-dot">' + (fn || '') + '</span>' : '') + '</button>');
        }
      }
      g.push('</div>');
      h.push(g.join(''));
      h.push('<div class="ed-start"><button type="button" data-ed="up"' + (ed.start <= 1 ? ' disabled' : '') + '>▲</button><span>' +
        (ed.start === 1 ? '1~5프렛' : ed.start + '~' + (ed.start + 4) + '프렛') + (ed.tuning !== 'standard' ? ' · ' + esc(E.TUNINGS[ed.tuning].label) : '') +
        '</span><button type="button" data-ed="down"' + (ed.start >= FRETS - 4 ? ' disabled' : '') + '>▼</button></div>');
    } else {
      h.push('<div class="ed-piano">' + (ed.midis.length ? D.piano(ed.midis).svg : '<p class="picker-empty">코드 이름을 입력하면 건반이 표시돼요.</p>') + '</div>');
    }
    h.push('<div class="ed-name">' + (name ? esc(E.pretty(name)) : '<span>' + (ed.kind === 'guitar' ? '코드표를 탭하거나 이름을 입력하세요' : '이름을 입력하세요') + '</span>') + '</div>');
    h.push('<div class="overlay-actions"><button type="button" data-ed="play"' + (name ? '' : ' disabled') + '>▶ 소리</button>' +
      '<button type="button" class="primary" data-ed="save"' + (name ? '' : ' disabled') + '>' + (ed.item ? '저장' : '악보에 추가') + '</button></div>');
    $('edBox').innerHTML = h.join('');
  }
  $('chordEditor').addEventListener('click', function (e) {
    if (e.target === $('chordEditor')) { closeEditor(); return; } // 바깥 탭 → 닫기
    var b = e.target.closest('[data-ed]');
    if (!b || !ed) return;
    var act = b.dataset.ed, s = +b.dataset.s;
    if (act === 'close') { closeEditor(); return; }
    if (act === 'kind') {
      if (ed.kind === b.dataset.v) return;
      var prevMidis = edMidis();
      ed.kind = b.dataset.v;
      if (ed.p) edBuild();
      else if (ed.kind === 'piano') ed.midis = prevMidis;
      else if (prevMidis.length) { // 피아노 → 기타: 같은 코드의 기타 모양
        var r = E.identify(prevMidis), p = r.type === 'chord' && E.parseChord(r.best.name);
        if (p) { ed.p = p; edBuild(); }
      }
    } else if (act === 'prev' || act === 'next') {
      ed.li = (ed.li + (act === 'next' ? 1 : ed.list.length - 1)) % ed.list.length; edApply(); edPlay();
    } else if (act === 'open') {
      ed.frets[s] = ed.frets[s] === 0 ? -1 : 0; ed.fingers = null; ed.list = null;
      if (ed.frets[s] === 0 && ensureAudio()) playSound('guitar', E.TUNINGS[ed.tuning].midis[s], ctx.currentTime + 0.01, 0.9, s);
    } else if (act === 'fret') {
      var f = +b.dataset.f;
      ed.frets[s] = ed.frets[s] === f ? -1 : f; ed.fingers = null; ed.list = null;
      if (ed.frets[s] === f && ensureAudio()) playSound('guitar', E.TUNINGS[ed.tuning].midis[s] + f, ctx.currentTime + 0.01, 0.9, s);
    } else if (act === 'up') ed.start = Math.max(1, ed.start - 1);
    else if (act === 'down') ed.start = Math.min(FRETS - 4, ed.start + 1);
    else if (act === 'play') { edPlay(); return; }
    else if (act === 'save') { saveEditor(); return; }
    renderEditor();
  });
  $('chordEditor').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!ed) return;
    ed.query = $('edQuery').value;
    var p = E.parseChord(ed.query);
    if (!p) { toast('코드 이름을 알아보지 못했어요'); return; }
    ed.p = p;
    edBuild();
    renderEditor();
    edPlay();
  });
  function saveEditor() {
    var ms = edMidis().sort(function (a, b) { return a - b; }), name = edName();
    if (!ms.length || !name) { toast('음을 먼저 찍어 주세요'); return; }
    var r = E.identify(ms), c = r.type === 'chord' ? r.candidates.filter(function (x) { return x.name === name; })[0] : null;
    var data = { name: name, quality: c ? c.quality : (r.label || ''), kind: ed.kind, tuning: ed.tuning,
      frets: ed.kind === 'guitar' ? ed.frets.slice() : [-1, -1, -1, -1, -1, -1], fingers: ed.kind === 'guitar' ? ed.fingers : null,
      midis: ms, t0: state.sheet.transpose || 0 };
    if (ed.item) { Object.keys(data).forEach(function (k) { ed.item[k] = data[k]; }); toast('코드를 고쳤어요'); }
    else {
      data.id = newId();
      state.sheet.items.push(data);
      if (ed.place) {
        var pl = ed.place;
        state.sheet.marks = state.sheet.marks.filter(function (m) { return !(m.l === pl.l && m.c === pl.c); });
        state.sheet.marks.push({ l: pl.l, c: pl.c, id: data.id });
      }
      toast('악보에 추가했어요 · ' + state.sheet.items.length + '개');
    }
    closeEditor();
    save(); renderSheet();
  }

  // ---------- 코드 이름으로 찾기 ----------
  var found = null; // { name, list, idx } 기타 포지션 목록
  function showFound() {
    var nav = $('posNav');
    if (!nav) return;
    var on = found && state.mode === found.kind && !state.sheetOpen && found.list.length > 0;
    nav.hidden = !on;
    if (!on) return;
    if (found.kind === 'piano') {
      var v = found.list[found.idx], top = v[v.length - 1];
      $('posLabel').textContent = (found.idx ? found.idx + '전위' : '기본형') + ' · 맨 위 ' +
        E.pretty(E.ROOT_NAMES[top % 12]) + (Math.floor(top / 12) - 1) + ' (' + (found.idx + 1) + '/' + found.list.length + ')';
      return;
    }
    $('posLabel').textContent = '포지션 ' + (found.idx + 1) + '/' + found.list.length + ' · ' + posText(found.list[found.idx]);
  }
  function applyFound() {
    if (found.kind === 'piano') state.piano = found.list[found.idx].slice();
    else { state.guitar = found.list[found.idx].slice(); state.fingers = fingersOf(found.list[found.idx]); }
    found.keep = true; // 이번 변경으로는 목록을 닫지 않음
    changed();
    pickName(found.p);
    playAll();
  }
  // 입력한 이름과 같은 해석이 후보에 있으면 그 이름으로 보여 줌 (예: C6 ↔ Am7/C)
  function pickName(p) {
    if (!result || result.type !== 'chord') return;
    var hit = result.candidates.filter(function (c) {
      return c.suffix === p.suffix && E.parseChord(c.root).rootPc === p.rootPc &&
        (c.bass ? E.parseChord(c.bass).rootPc : p.rootPc) === p.bassPc;
    })[0];
    if (hit) { pick = hit.name; analyze(); render(); }
  }
  on('chordFind', 'submit', function (e) {
    e.preventDefault();
    var q = $('chordQuery').value, p = E.parseChord(q);
    if (!p) { toast('코드 이름을 알아보지 못했어요'); return; }
    $('chordQuery').blur();
    ensureAudio();
    if (state.mode === 'piano') {
      // 자리바꿈 목록. 처음 보여 줄 모양은 지금 건반과 오른손 이동이 가장 적은 것
      var inv = E.pianoInversions(p);
      if (!inv.length) { state.piano = E.pianoVoicing(p); found = null; changed(); pickName(p); playAll(); return; }
      found = { kind: 'piano', p: p, list: inv, idx: E.nearestInversion(inv, state.piano) };
      applyFound();
      return;
    }
    var list = E.chordVoicings(tuningMidis(), p, 6);
    if (!list.length) { toast('이 튜닝에서 잡을 수 있는 모양을 찾지 못했어요'); return; }
    found = { kind: 'guitar', p: p, list: list, idx: 0 };
    applyFound();
  });
  on('posPrev', 'click', function () { if (!found) return; found.idx = (found.idx + found.list.length - 1) % found.list.length; applyFound(); });
  on('posNext', 'click', function () { if (!found) return; found.idx = (found.idx + 1) % found.list.length; applyFound(); });

  // ---------- 공통 ----------
  function render() {
    var sh = state.sheetOpen, g = !sh && state.mode === 'guitar', p = !sh && state.mode === 'piano';
    $('modeGuitar').setAttribute('aria-selected', g);
    $('modePiano').setAttribute('aria-selected', p);
    $('modeSheet').setAttribute('aria-selected', sh);
    $('result').hidden = sh;
    document.body.dataset.view = sh ? 'sheet' : state.mode;
    // 가로 화면에서는 악기·튜닝 선택을 왼쪽 패널로 옮겨 지판 높이를 확보
    var controls = document.querySelector('.controls'), main = document.querySelector('main');
    if (LAND.matches && !sh) { if (controls.parentNode !== $('result')) $('result').insertBefore(controls, $('result').firstChild); }
    else if (controls.parentNode !== main) main.insertBefore(controls, main.firstChild);
    $('guitarView').hidden = !g;
    $('pianoView').hidden = !p;
    $('sheetView').hidden = !sh;
    $('tuningWrap').hidden = !g;
    $('tuning').value = state.tuning;
    $('hint').textContent = sh ? '코드를 탭하면 소리가 나고, 순서 바꾸기·불러오기·삭제를 할 수 있어요'
      : g ? '줄을 좌우로 쓸면 스트럼 · 같은 칸 다시 탭하면 뮤트(×) · 0번 줄은 개방현 O/×' : '건반을 탭해 음을 켜고 끄세요 · 가장 낮은 음이 베이스';
    if (sh) { renderSheet(); return; }
    sel = -1; pickPos = null;
    $('sheetBar').hidden = true; $('chordPicker').hidden = true;
    renderResult();
    if (g) renderGuitar(); else renderPiano();
  }
  function changed() {
    pick = null; analyze(); save(); render();
    if (found && !found.keep) found = null;
    if (found) found.keep = false;
    showFound();
  }
  LAND.addEventListener('change', render);

  $('tuning').innerHTML = Object.keys(E.TUNINGS).map(function (k) {
    return '<option value="' + k + '">' + E.TUNINGS[k].label + '</option>';
  }).join('');
  $('tuning').addEventListener('change', function () { state.tuning = this.value; state.fingers = null; changed(); });
  document.querySelector('.segmented').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'sheet') { state.sheetOpen = true; sel = -1; }
    else { state.sheetOpen = false; state.mode = b.dataset.mode; }
    changed();
  });
  $('captureBtn').addEventListener('click', capture);
  on('shiftDown', 'click', function () { shiftCurrent(-1); });
  on('shiftUp', 'click', function () { shiftCurrent(1); });
  $('infoToggle').addEventListener('click', function () { state.showInfo = !state.showInfo; save(); renderResult(); });
  $('info').addEventListener('click', function (e) {
    if (e.target.closest('.info-close')) { state.showInfo = false; save(); renderResult(); }
  });
  $('alts').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-name]');
    if (!b) return;
    pick = b.dataset.name; analyze(); render();
    $('alts').scrollLeft = 0;
  });
  $('playBtn').addEventListener('click', playAll);
  $('clearBtn').addEventListener('click', function () {
    if (state.mode === 'guitar') { state.guitar = [-1, -1, -1, -1, -1, -1]; state.fingers = null; } else state.piano = [];
    changed();
  });

  analyze();
  render();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 캐시 없이 동작 */ });
  }
})();
