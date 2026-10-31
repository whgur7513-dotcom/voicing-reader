(function () {
  'use strict';
  var E = window.ChordEngine;
  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'voicing-reader-v1';
  var FRETS = 15;
  var PIANO_LO = 36, PIANO_HI = 84; // C2 ~ C6 (49건반)
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };

  var DEFAULT = { mode: 'guitar', tuning: 'standard', guitar: [-1, 3, 2, 0, 0, 0], piano: [53, 57, 60, 64],
    sheetOpen: false, sheet: normSheet(null) };
  var state = load();
  var pick = null; // "다른 이름"에서 고른 이름
  var sel = -1; // 악보에서 선택한 칸

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.guitar) && s.guitar.length === 6 && Array.isArray(s.piano) && E.TUNINGS[s.tuning]) {
        var sheet = normSheet(s.sheet);
        return { mode: s.mode === 'piano' ? 'piano' : 'guitar', tuning: s.tuning, guitar: s.guitar, piano: s.piano,
          sheetOpen: !!s.sheetOpen, sheet: sheet, showInfo: !!s.showInfo };
      }
    } catch (e) { /* 저장소 사용 불가 — 기본값으로 */ }
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  // 예전 형식의 악보도 읽을 수 있게 빈 필드 채우기
  function normSheet(sh) {
    sh = sh && Array.isArray(sh.items) ? sh : {};
    var items = Array.isArray(sh.items) ? sh.items : [];
    items.forEach(function (it, i) { if (!it.id) it.id = 'i' + i + Date.now().toString(36); });
    return { title: sh.title || '', items: items, lyrics: typeof sh.lyrics === 'string' ? sh.lyrics : '',
      marks: Array.isArray(sh.marks) ? sh.marks : [], showDiagrams: !!sh.showDiagrams };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  function tuningMidis() { return E.TUNINGS[state.tuning].midis; }
  function currentMidis() {
    return state.mode === 'guitar' ? E.guitarMidis(tuningMidis(), state.guitar) : state.piano.slice();
  }

  // ---------- 오디오 ----------
  var ctx = null, master = null, ksCache = {};
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
  function playNote(m) {
    if (!ensureAudio()) return;
    var t = ctx.currentTime + 0.01;
    if (state.mode === 'guitar') playGuitar(m, t); else playPiano(m, t, 0.32);
  }
  function playAll() {
    if (!ensureAudio()) return;
    var t = ctx.currentTime + 0.02;
    var ms = currentMidis().sort(function (a, b) { return a - b; });
    if (state.mode === 'guitar') ms.forEach(function (m, i) { playGuitar(m, t + i * 0.04); });
    else ms.forEach(function (m) { playPiano(m, t, 0.32 / Math.sqrt(ms.length)); });
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
    $('infoToggle').textContent = state.showInfo ? '코드 설명 접기' : '코드 설명 보기';
    $('infoToggle').setAttribute('aria-expanded', !!state.showInfo);
    $('info').hidden = !paras.length || !state.showInfo;
    $('info').innerHTML = paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
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
  function renderGuitar() {
    var tm = tuningMidis(), ms = currentMidis(), bass = Math.min.apply(null, ms.length ? ms : [Infinity]);
    var h = ['<div></div>'];
    tm.forEach(function (m) { h.push('<div class="g-head">' + E.pretty(E.ROOT_NAMES[m % 12]) + '</div>'); });
    // 개방현 줄
    h.push('<div class="g-num">0</div>');
    state.guitar.forEach(function (f, s) {
      var m = tm[s] + 0, inner = '';
      if (f === 0) inner = '<span class="mark note' + (m === bass ? ' bass' : '') + '">' + noteName(m) + '</span>';
      else if (f < 0) inner = '<span class="mark">×</span>';
      h.push('<button class="g-cell g-open' + (f === 0 ? ' on' : '') + '" data-s="' + s + '" data-f="0" aria-label="' +
        (6 - s) + '번줄 개방현">' + inner + '</button>');
    });
    for (var f = 1; f <= FRETS; f++) {
      h.push('<div class="g-num">' + f + '</div>');
      for (var s = 0; s < 6; s++) {
        var on = state.guitar[s] === f, m2 = tm[s] + f, inlay = '';
        if ([3, 5, 7, 9, 15].indexOf(f) >= 0 && s === 2) inlay = '<span class="g-inlay" style="left:100%;transform:translateX(-50%)"></span>';
        if (f === 12 && (s === 1 || s === 3)) inlay = '<span class="g-inlay" style="left:100%;transform:translateX(-50%)"></span>';
        h.push('<button class="g-cell g-fret' + (f === 1 ? ' first' : '') + '" style="--sw:' + (3 - s * 0.35).toFixed(2) + 'px" data-s="' + s +
          '" data-f="' + f + '" aria-label="' + (6 - s) + '번줄 ' + f + '프렛">' + inlay +
          (on ? '<span class="dot' + (m2 === bass ? ' bass' : '') + '">' + noteName(m2) + '</span>' : '') + '</button>');
      }
    }
    $('guitarView').innerHTML = h.join('');
  }
  $('guitarView').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-s]');
    if (!b) return;
    var s = +b.dataset.s, f = +b.dataset.f;
    if (state.guitar[s] === f) state.guitar[s] = -1; // 같은 칸 다시 탭 → 뮤트
    else { state.guitar[s] = f; playNote(tuningMidis()[s] + f); }
    changed();
  });

  // ---------- 피아노 ----------
  function renderPiano() {
    var bass = Math.min.apply(null, state.piano.length ? state.piano : [Infinity]);
    // 한 줄에 한 옥타브씩, 마지막 줄에 C6 포함
    var rows = [];
    for (var lo = PIANO_LO; lo < PIANO_HI; lo += 12) {
      var hi = lo + 12 >= PIANO_HI ? PIANO_HI : lo + 11, oct = lo / 12 - 1;
      rows.push([lo, hi, 'C' + oct + ' – ' + (hi === PIANO_HI ? 'C' + (oct + 1) : 'B' + oct)]);
    }
    $('pianoView').innerHTML = rows.map(function (r) {
      var whites = [], blacks = [], wi = 0;
      for (var m = r[0]; m <= r[1]; m++) {
        var on = state.piano.indexOf(m) >= 0, cls = (on ? ' on' : '') + (on && m === bass ? ' bass' : '');
        var label = on ? noteName(m) : (m % 12 === 0 ? 'C' + (m / 12 - 1) : '');
        if (BLACK[m % 12]) {
          blacks.push('<button class="bkey' + cls + '" data-m="' + m + '" style="left:calc(100% / 8 * ' + wi + ' - 100% / 8 * .32)" aria-label="' +
            E.ROOT_NAMES[m % 12] + (Math.floor(m / 12) - 1) + '">' + (on ? label : '') + '</button>');
        } else {
          whites.push('<button class="wkey' + cls + '" data-m="' + m + '" aria-label="' + E.ROOT_NAMES[m % 12] + (Math.floor(m / 12) - 1) + '">' + label + '</button>');
          wi++;
        }
      }
      return '<div><div class="octave-label">' + r[2] + '</div><div class="keys">' + whites.join('') + blacks.join('') + '</div></div>';
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

  // ---------- 악보 ----------
  var D = window.ChordDiagram;
  function diagram(it) {
    return it.kind === 'guitar' ? D.guitar(it.frets) : D.piano(it.midis);
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function capture() {
    if (result.type === 'empty') return;
    var name = shown ? shown.name : result.type === 'single' ? result.tones[0].name
      : result.tones.map(function (t) { return t.name; }).join(' ');
    state.sheet.items.push({
      id: newId(), name: name, quality: shown ? shown.quality : result.label, kind: state.mode, tuning: state.tuning,
      frets: state.guitar.slice(), midis: currentMidis().sort(function (a, b) { return a - b; })
    });
    save();
    toast('악보에 담았어요 · ' + state.sheet.items.length + '개');
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
    if (sel >= items.length) sel = -1;
    $('sheetGrid').innerHTML = items.length ? items.map(function (it, i) {
      var tuning = it.kind === 'guitar' && it.tuning !== 'standard' ? '<span class="sc-tuning">' + esc(E.TUNINGS[it.tuning].label) + '</span>' : '';
      return '<button class="sheet-card' + (i === sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="sc-num">' + (i + 1) + '</span><span class="sc-name' + (it.name.length > 7 ? ' long' : '') + '">' + esc(E.pretty(it.name)) + '</span>' +
        '<span class="sc-diagram ' + it.kind + '">' + diagram(it).svg + '</span>' + tuning + '</button>';
    }).join('') : '<p class="sheet-empty">기타·피아노 화면에서 결과 카드의 ＋ 버튼을 누르면<br>코드가 여기에 차례로 담겨요.</p>';
    $('sheetBar').hidden = sel < 0;
    $('sheetPdf').disabled = $('sheetImgBtn').disabled = $('sheetClear').disabled = !hasContent();
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
        var chord = it ? '<span class="ly-name">' + esc(E.pretty(it.name)) + '</span>' +
          (state.sheet.showDiagrams ? '<span class="ly-diag ' + it.kind + '">' + diagram(it).svg + '</span>' : '') : '';
        return '<button class="ly-cell' + (it ? ' has' : '') + (on ? ' sel' : '') + '" data-l="' + l + '" data-c="' + c + '">' +
          '<span class="ly-chord">' + chord + '</span><span class="ly-ch">' + (ch === ' ' ? '&nbsp;' : esc(ch)) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
  }

  function renderPicker() {
    $('chordPicker').hidden = !pickPos;
    if (!pickPos) return;
    var ch = Array.from(lyricLines()[pickPos.l] || '')[pickPos.c] || '';
    $('pickerTitle').textContent = '‘' + (ch.trim() || '빈칸') + '’ 위에 넣을 코드';
    // 같은 이름·같은 보이싱은 한 번만
    var seen = {}, uniq = state.sheet.items.filter(function (it) {
      var k = it.name + '|' + diagram(it).svg;
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    $('pickerChips').innerHTML = uniq.length ? uniq.map(function (it) {
      return '<button class="pick-chip" data-id="' + it.id + '"><span class="pc-diag ' + it.kind + '">' + diagram(it).svg + '</span>' + esc(E.pretty(it.name)) + '</button>';
    }).join('') : '<p class="picker-empty">담은 코드가 없어요. 기타·피아노 화면에서 ＋ 버튼으로 먼저 담아 주세요.</p>';
    $('pickerRemove').hidden = !markAt(pickPos.l, pickPos.c);
  }

  $('sheetGrid').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (!b) return;
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
    else if (act === 'delete') {
      var gone = items.splice(sel, 1)[0];
      state.sheet.marks = state.sheet.marks.filter(function (m) { return m.id !== gone.id; });
      sel = -1;
    }
    else if (act === 'load') {
      var it = items[sel];
      state.mode = it.kind;
      if (it.kind === 'guitar') { state.tuning = it.tuning; state.guitar = it.frets.slice(); }
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
    pickPos = pickPos && pickPos.l === p.l && pickPos.c === p.c ? null : p;
    sel = -1;
    renderSheet();
  });
  $('pickerChips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b || !pickPos) return;
    var p = pickPos;
    state.sheet.marks = state.sheet.marks.filter(function (m) { return !(m.l === p.l && m.c === p.c); });
    state.sheet.marks.push({ l: p.l, c: p.c, id: b.dataset.id });
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
      var chars = Array.from(line), row = { cells: [], chord: false }, x = 0;
      chars.forEach(function (ch, ci) {
        var m = markAt(l, ci), it = m && itemById(m.id);
        c.font = LY_FONT;
        var w = c.measureText(ch).width;
        if (it) {
          c.font = CH_FONT;
          w = Math.max(w, c.measureText(E.pretty(it.name)).width + 10, diag ? DIAG_W + 6 : 0);
        }
        if (x + w > maxW && row.cells.length) { rows.push(row); row = { cells: [], chord: false }; x = 0; }
        row.cells.push({ x: x, ch: ch, it: it });
        if (it) row.chord = true;
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
        var size = 36, name = E.pretty(it.name);
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
            c.fillStyle = '#c56f12'; c.font = CH_FONT; c.fillText(E.pretty(cell.it.name), x, y + 20);
            if (state.sheet.showDiagrams) {
              var d = diagram(cell.it), k = Math.min(DIAG_W / d.w, DIAG_H / d.h);
              c.drawImage(imgById[cell.it.id], x, y + 26, d.w * k, d.h * k);
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

  // ---------- 공통 ----------
  function render() {
    var sh = state.sheetOpen, g = !sh && state.mode === 'guitar', p = !sh && state.mode === 'piano';
    $('modeGuitar').setAttribute('aria-selected', g);
    $('modePiano').setAttribute('aria-selected', p);
    $('modeSheet').setAttribute('aria-selected', sh);
    $('result').hidden = sh;
    $('guitarView').hidden = !g;
    $('pianoView').hidden = !p;
    $('sheetView').hidden = !sh;
    $('tuningWrap').hidden = !g;
    $('tuning').value = state.tuning;
    $('hint').textContent = sh ? '칸을 탭하면 순서 바꾸기·불러오기·삭제를 할 수 있어요'
      : g ? '같은 칸을 다시 탭하면 뮤트(×) · 맨 윗줄(0)은 개방현 O/× 전환' : '건반을 탭해 음을 켜고 끄세요 · 가장 낮은 음이 베이스';
    if (sh) { renderSheet(); return; }
    sel = -1; pickPos = null;
    $('sheetBar').hidden = true; $('chordPicker').hidden = true;
    renderResult();
    if (g) renderGuitar(); else renderPiano();
  }
  function changed() { pick = null; analyze(); save(); render(); }

  $('tuning').innerHTML = Object.keys(E.TUNINGS).map(function (k) {
    return '<option value="' + k + '">' + E.TUNINGS[k].label + '</option>';
  }).join('');
  $('tuning').addEventListener('change', function () { state.tuning = this.value; changed(); });
  document.querySelector('.segmented').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'sheet') { state.sheetOpen = true; sel = -1; }
    else { state.sheetOpen = false; state.mode = b.dataset.mode; }
    changed();
  });
  $('captureBtn').addEventListener('click', capture);
  $('infoToggle').addEventListener('click', function () { state.showInfo = !state.showInfo; save(); renderResult(); });
  $('alts').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-name]');
    if (!b) return;
    pick = b.dataset.name; analyze(); render();
    $('alts').scrollLeft = 0;
  });
  $('playBtn').addEventListener('click', playAll);
  $('clearBtn').addEventListener('click', function () {
    if (state.mode === 'guitar') state.guitar = [-1, -1, -1, -1, -1, -1]; else state.piano = [];
    changed();
  });

  analyze();
  render();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 캐시 없이 동작 */ });
  }
})();
