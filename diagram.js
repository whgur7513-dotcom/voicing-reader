// 코드 다이어그램 SVG (기타 코드표 / 미니 건반). 색은 currentColor 기준.
(function (global) {
  'use strict';
  var ACCENT = '#e08a2e';
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };

  // frets: 6번줄(저음)부터, -1 = 뮤트
  function guitar(frets) {
    var fretted = frets.filter(function (f) { return f > 0; });
    var max = fretted.length ? Math.max.apply(null, fretted) : 0;
    var min = fretted.length ? Math.min.apply(null, fretted) : 0;
    var start = max <= 5 ? 1 : min;
    var rows = Math.max(5, max - start + 1);
    var top = 22, gap = 20, w = 100, h = top + rows * gap + 6;
    var sx = function (i) { return 22 + i * 12; };
    var s = [];
    for (var i = 0; i < 6; i++) s.push('<line x1="' + sx(i) + '" y1="' + top + '" x2="' + sx(i) + '" y2="' + (top + rows * gap) + '" stroke="currentColor" stroke-width="1"/>');
    for (var r = 0; r <= rows; r++) s.push('<line x1="' + sx(0) + '" y1="' + (top + r * gap) + '" x2="' + sx(5) + '" y2="' + (top + r * gap) + '" stroke="currentColor" stroke-width="1"/>');
    if (start === 1) s.push('<rect x="' + (sx(0) - 0.5) + '" y="' + (top - 3) + '" width="' + (sx(5) - sx(0) + 1) + '" height="4" fill="currentColor"/>');
    else s.push('<text x="' + (sx(0) - 5) + '" y="' + (top + gap / 2 + 4) + '" font-size="10" text-anchor="end" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">' + start + 'fr</text>');
    frets.forEach(function (f, i) {
      if (f < 0) s.push('<text x="' + sx(i) + '" y="' + (top - 8) + '" font-size="11" text-anchor="middle" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">×</text>');
      else if (f === 0) s.push('<circle cx="' + sx(i) + '" cy="' + (top - 12) + '" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3"/>');
      else s.push('<circle cx="' + sx(i) + '" cy="' + (top + (f - start) * gap + gap / 2) + '" r="5.6" fill="currentColor"/>');
    });
    return { w: w, h: h, svg: wrap(w, h, s.join('')) };
  }

  function piano(midis) {
    if (!midis.length) return { w: 70, h: 54, svg: wrap(70, 54, '') };
    var lo = Math.floor(Math.min.apply(null, midis) / 12) * 12;
    var hi = Math.floor(Math.max.apply(null, midis) / 12) * 12 + 11;
    var ww = 10, wh = 50, bw = 6, bh = 30, x = 1, whites = [], blacks = [];
    for (var m = lo; m <= hi; m++) {
      var on = midis.indexOf(m) >= 0;
      if (BLACK[m % 12]) {
        blacks.push('<rect x="' + (x - bw / 2) + '" y="1" width="' + bw + '" height="' + bh + '" rx="1" fill="' + (on ? ACCENT : 'currentColor') + '"/>');
      } else {
        whites.push('<rect x="' + x + '" y="1" width="' + ww + '" height="' + wh + '" rx="1.5" fill="' + (on ? ACCENT : 'none') + '" stroke="currentColor" stroke-width="0.8"/>');
        x += ww;
      }
    }
    var w = x + 1, h = wh + 3;
    return { w: w, h: h, svg: wrap(w, h, whites.join('') + blacks.join('')) };
  }

  function wrap(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + body + '</svg>';
  }

  global.ChordDiagram = { guitar: guitar, piano: piano };
})(typeof globalThis !== 'undefined' ? globalThis : this);
