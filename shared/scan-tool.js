/*
 * NETAX 공용 스캔 도구 — 문서 스캔(원근보정 자동인식/수동보정, 회전, 흑백·대비)과
 * "문서 구분"(여러 장짜리 문서 여러 개를 한 번에 찍어도 각각 별도 PDF로 남게 하는 기능)을
 * 제공하는 독립 모듈. netax.kr에서 정적으로 서빙되며, 관리앱(job.netax.kr, Google Apps
 * Script)과 고객창구(netax.kr/my)가 동일한 <script src="https://netax.kr/shared/scan-tool.js">
 * 한 줄로 그대로 불러 쓴다 — 스캔 기능을 두 곳에 각각 복사해 넣지 않고 여기 한 곳만 고치면
 * 양쪽에 동시에 반영된다.
 *
 * 이 파일이 로드되기 전에 pdf-lib(https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/...)가
 * 먼저 로드되어 있어야 한다(window.PDFLib 필요).
 *
 * 사용법:
 *   NetaxScan.open({
 *     targetLabel: '신분증 사본',              // 모달 안내문에 표시될 이름
 *     defaultDocName: '신분증 사본',            // 첫 문서 이름칸이 비어있을 때 기본값(선택)
 *     allowScreenCapture: false,               // 화면 캡처 버튼 노출 여부(관리자용 PC 도구에서만 true)
 *     actions: [                               // 모달 하단 버튼들 — 여러 개 둘 수 있음
 *       {
 *         label: '완료 — 담은 자료를 추가',
 *         primary: true,                       // 남색 강조 버튼으로 표시
 *         handler: async function(docs) {       // docs: [{name, bytes:Uint8Array}]
 *           ...
 *           return true;                       // true를 반환하면 모달이 닫히고 상태가 초기화됨
 *         }
 *       }
 *     ]
 *   });
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'nxsc-style';
  var built = false;
  var els = {};

  var state = {
    docPages: [],          // 지금 촬영 중인 문서의 페이지들 [{type:'image'|'pdf', ...}]
    scanCompletedDocs: [], // "다른 문서 추가하기"로 확정된 문서들 [{name, bytes, allowRotate}]
    scanFileQueue: [],     // 갤러리에서 여러 장을 한 번에 골랐을 때 남은 파일들
    scanImageEl: null, scanDisplayScale: 1, scanDW: 0, scanDH: 0, scanCorners: null,
    opts: null
  };

  // ============================================================
  // 스타일 — 호스트 페이지의 CSS와 겹치지 않도록 전부 nxsc- 접두사를 쓴다.
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.nxsc-overlay{position:fixed;inset:0;background:rgba(13,27,61,0.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:12px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;}'
      + '.nxsc-overlay.nxsc-open{display:flex;}'
      + '.nxsc-panel{width:min(560px,100%);max-height:92vh;overflow-y:auto;background:#fff;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.25);}'
      + '.nxsc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#0D1B3D;color:#fff;font-weight:700;font-size:15px;border-radius:10px 10px 0 0;}'
      + '.nxsc-close{cursor:pointer;color:#fff;font-size:18px;font-weight:700;line-height:1;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;}'
      + '.nxsc-close:hover{background:rgba(255,255,255,0.18);}'
      + '.nxsc-body{padding:14px 16px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box;}'
      + '.nxsc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}'
      + '.nxsc-label{font-size:12.5px;color:#555;}'
      + '.nxsc-btn{font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;border-radius:6px;padding:8px 12px;border:1px solid #C8A244;background:rgba(200,162,68,0.10);color:#0D1B3D;}'
      + '.nxsc-btn:hover{background:rgba(200,162,68,0.22);}'
      + '.nxsc-btn:disabled{opacity:0.5;cursor:not-allowed;}'
      + '.nxsc-btn-primary{font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border-radius:8px;padding:10px 14px;border:none;background:#0D1B3D;color:#fff;width:100%;}'
      + '.nxsc-btn-primary:hover{background:#1A2B4D;}'
      + '.nxsc-btn-primary:disabled{opacity:0.5;cursor:not-allowed;}'
      + '.nxsc-input{flex:1;min-width:140px;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;}'
      + '#nxsc-stage-wrap{position:relative;display:none;flex-direction:column;gap:10px;}'
      + '#nxsc-stage{position:relative;touch-action:none;}'
      + '#nxsc-stage canvas{display:block;max-width:100%;border-radius:6px;}'
      + '.nxsc-handle{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:#C8A244;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);touch-action:none;cursor:grab;}'
      + '.nxsc-tray{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;}'
      + '.nxsc-tray-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:2px solid #C8A244;border-radius:6px;background:rgba(200,162,68,0.12);}'
      + '.nxsc-tray-item.nxsc-dragging{opacity:0.5;}'
      + '.nxsc-tray-grip{display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:grab;}'
      + '.nxsc-tray-grip img{width:36px;height:48px;object-fit:cover;border-radius:3px;}'
      + '.nxsc-tray-grip .nxsc-pdf-icon{font-size:20px;}'
      + '.nxsc-tray-item .nxsc-name{font-size:12px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.nxsc-tray-item button{border:none;background:none;cursor:pointer;font-size:15px;color:#888;padding:2px 6px;}'
      + '.nxsc-tray-item button:hover{color:#c0392b;}'
      + '.nxsc-doc-list{display:flex;flex-direction:column;gap:6px;}'
      + '.nxsc-doc-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #C8A244;border-radius:6px;background:rgba(200,162,68,0.08);font-size:12.5px;}'
      + '.nxsc-doc-item .nxsc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.nxsc-doc-item button{border:none;background:none;cursor:pointer;font-size:14px;color:#888;padding:2px 6px;}'
      + '.nxsc-doc-item button:hover{color:#c0392b;}'
      + '.nxsc-footer{border-top:1px solid #eee;padding-top:12px;display:flex;flex-direction:column;gap:8px;}';
    var styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ============================================================
  // 모달 DOM — 최초 open() 호출 시 한 번만 만들어서 재사용한다.
  // ============================================================
  function buildModal() {
    if (built) return;
    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = 'nxsc-overlay';
    overlay.innerHTML = ''
      + '<div class="nxsc-panel">'
      + '  <div class="nxsc-head"><span id="nxsc-title">📷 스캔</span><span class="nxsc-close" id="nxsc-btn-close">✕</span></div>'
      + '  <div class="nxsc-body">'
      + '    <div class="nxsc-label" id="nxsc-target-label"></div>'
      + '    <div class="nxsc-row">'
      + '      <button type="button" id="nxsc-btn-capture" class="nxsc-btn">📷 촬영하기</button>'
      + '      <button type="button" id="nxsc-btn-gallery" class="nxsc-btn">🖼 갤러리에서 불러오기</button>'
      + '      <button type="button" id="nxsc-btn-screencap" class="nxsc-btn" style="display:none;">🖥 화면 캡처</button>'
      + '      <button type="button" id="nxsc-btn-pdfinsert" class="nxsc-btn">📄 기존 PDF 삽입</button>'
      + '      <button type="button" id="nxsc-btn-skip" class="nxsc-btn" style="display:none;">다음 파일로 건너뛰기</button>'
      + '    </div>'
      + '    <input type="file" id="nxsc-file-capture" accept="image/*" capture="environment" style="display:none;">'
      + '    <input type="file" id="nxsc-file-gallery" accept="image/*" multiple style="display:none;">'
      + '    <input type="file" id="nxsc-file-pdfinsert" accept="application/pdf" style="display:none;">'
      + '    <div id="nxsc-stage-wrap">'
      + '      <div id="nxsc-stage">'
      + '        <canvas id="nxsc-canvas"></canvas>'
      + '        <svg id="nxsc-quad-svg" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;">'
      + '          <polygon id="nxsc-quad-poly" fill="rgba(200,162,68,0.25)" stroke="#C8A244" stroke-width="2"></polygon>'
      + '        </svg>'
      + '        <div class="nxsc-handle" id="nxsc-handle-tl" data-corner="tl"></div>'
      + '        <div class="nxsc-handle" id="nxsc-handle-tr" data-corner="tr"></div>'
      + '        <div class="nxsc-handle" id="nxsc-handle-br" data-corner="br"></div>'
      + '        <div class="nxsc-handle" id="nxsc-handle-bl" data-corner="bl"></div>'
      + '      </div>'
      + '      <div class="nxsc-row">'
      + '        <button type="button" id="nxsc-btn-rotate-src" class="nxsc-btn">↻ 회전</button>'
      + '        <button type="button" id="nxsc-btn-autodetect" class="nxsc-btn">자동 인식</button>'
      + '        <button type="button" id="nxsc-btn-wholeimage" class="nxsc-btn">전체 사용</button>'
      + '        <label class="nxsc-label"><input type="checkbox" id="nxsc-grayscale"> 흑백</label>'
      + '        <label class="nxsc-label">대비 <input type="range" id="nxsc-contrast" min="0" max="100" value="0"></label>'
      + '      </div>'
      + '      <button type="button" id="nxsc-btn-warpadd" class="nxsc-btn-primary">이 페이지 담기</button>'
      + '    </div>'
      + '    <div class="nxsc-tray" id="nxsc-tray"></div>'
      + '    <div class="nxsc-row" style="border-top:1px solid #eee;padding-top:12px;">'
      + '      <input type="text" id="nxsc-docname" class="nxsc-input" placeholder="이 문서의 이름">'
      + '      <button type="button" id="nxsc-btn-finishdoc" class="nxsc-btn" disabled>📑 다른 문서 추가하기</button>'
      + '    </div>'
      + '    <div class="nxsc-doc-list" id="nxsc-doclist"></div>'
      + '    <div class="nxsc-footer" id="nxsc-footer"></div>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(overlay);

    els.overlay = overlay;
    els.title = overlay.querySelector('#nxsc-title');
    els.targetLabel = overlay.querySelector('#nxsc-target-label');
    els.btnClose = overlay.querySelector('#nxsc-btn-close');
    els.btnCapture = overlay.querySelector('#nxsc-btn-capture');
    els.btnGallery = overlay.querySelector('#nxsc-btn-gallery');
    els.btnScreencap = overlay.querySelector('#nxsc-btn-screencap');
    els.btnPdfInsert = overlay.querySelector('#nxsc-btn-pdfinsert');
    els.btnSkip = overlay.querySelector('#nxsc-btn-skip');
    els.fileCapture = overlay.querySelector('#nxsc-file-capture');
    els.fileGallery = overlay.querySelector('#nxsc-file-gallery');
    els.filePdfInsert = overlay.querySelector('#nxsc-file-pdfinsert');
    els.stageWrap = overlay.querySelector('#nxsc-stage-wrap');
    els.stage = overlay.querySelector('#nxsc-stage');
    els.canvas = overlay.querySelector('#nxsc-canvas');
    els.quadSvg = overlay.querySelector('#nxsc-quad-svg');
    els.quadPoly = overlay.querySelector('#nxsc-quad-poly');
    els.btnRotateSrc = overlay.querySelector('#nxsc-btn-rotate-src');
    els.btnAutoDetect = overlay.querySelector('#nxsc-btn-autodetect');
    els.btnWholeImage = overlay.querySelector('#nxsc-btn-wholeimage');
    els.grayscale = overlay.querySelector('#nxsc-grayscale');
    els.contrast = overlay.querySelector('#nxsc-contrast');
    els.btnWarpAdd = overlay.querySelector('#nxsc-btn-warpadd');
    els.tray = overlay.querySelector('#nxsc-tray');
    els.docName = overlay.querySelector('#nxsc-docname');
    els.btnFinishDoc = overlay.querySelector('#nxsc-btn-finishdoc');
    els.docList = overlay.querySelector('#nxsc-doclist');
    els.footer = overlay.querySelector('#nxsc-footer');

    wireEvents();
    built = true;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  // 원근보정(호모그래피)·자동인식 — document-tools.js 이래로 검증된 로직 그대로.
  // ============================================================
  function toGrayscale(imageData) {
    var data = imageData.data, width = imageData.width, height = imageData.height;
    var gray = new Float32Array(width * height);
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return gray;
  }
  function scanEdgeLine(getVal, length) {
    var startSkip = Math.floor(length * 0.03);
    var maxDiff = 0, bestIdx = Math.floor(length * 0.06);
    for (var i = startSkip + 1; i < length * 0.5; i++) {
      var diff = Math.abs(getVal(i) - getVal(i - 1));
      if (diff > maxDiff) { maxDiff = diff; bestIdx = i; }
    }
    return { idx: bestIdx, strength: maxDiff };
  }
  function detectEdgeInset(gray, width, height) {
    var marginLimit = 0.35, THRESH = 15, N_SAMPLES = 7;
    var fallback = { top: height * 0.06, bottom: height * 0.06, left: width * 0.06, right: width * 0.06 };
    function sampleMedian(getVal, perpLength, alongLength) {
      var hits = [];
      for (var s = 1; s <= N_SAMPLES; s++) {
        var t = s / (N_SAMPLES + 1);
        var along = Math.round(t * (alongLength - 1));
        var r = scanEdgeLine(function (p) { return getVal(along, p); }, perpLength);
        if (r.strength > THRESH && r.idx < perpLength * marginLimit) hits.push(r.idx);
      }
      if (!hits.length) return null;
      hits.sort(function (a, b) { return a - b; });
      return hits[Math.floor(hits.length / 2)];
    }
    var top = sampleMedian(function (along, p) { return gray[p * width + along]; }, height, width);
    var bottom = sampleMedian(function (along, p) { return gray[(height - 1 - p) * width + along]; }, height, width);
    var left = sampleMedian(function (along, p) { return gray[along * width + p]; }, width, height);
    var right = sampleMedian(function (along, p) { return gray[along * width + (width - 1 - p)]; }, width, height);
    return {
      top: top !== null ? top : fallback.top, bottom: bottom !== null ? bottom : fallback.bottom,
      left: left !== null ? left : fallback.left, right: right !== null ? right : fallback.right
    };
  }
  function autoDetectCorners() {
    if (!state.scanImageEl) return;
    var ctx = els.canvas.getContext('2d');
    var imageData = ctx.getImageData(0, 0, state.scanDW, state.scanDH);
    var gray = toGrayscale(imageData);
    var inset = detectEdgeInset(gray, state.scanDW, state.scanDH);
    state.scanCorners = {
      tl: { x: inset.left, y: inset.top }, tr: { x: state.scanDW - inset.right, y: inset.top },
      br: { x: state.scanDW - inset.right, y: state.scanDH - inset.bottom }, bl: { x: inset.left, y: state.scanDH - inset.bottom }
    };
    renderScanHandles();
  }
  function renderScanHandles() {
    ['tl', 'tr', 'br', 'bl'].forEach(function (key) {
      var el = els.overlay.querySelector('#nxsc-handle-' + key);
      el.style.left = state.scanCorners[key].x + 'px';
      el.style.top = state.scanCorners[key].y + 'px';
    });
    els.quadPoly.setAttribute('points', ['tl', 'tr', 'br', 'bl'].map(function (k) { return state.scanCorners[k].x + ',' + state.scanCorners[k].y; }).join(' '));
  }
  function solveLinearSystem(A, B) {
    var n = B.length;
    for (var i = 0; i < n; i++) A[i] = A[i].concat([B[i]]);
    for (var col = 0; col < n; col++) {
      var maxRow = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[maxRow][col])) maxRow = r;
      var tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
      var pivot = A[col][col];
      if (Math.abs(pivot) < 1e-12) continue;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var factor = A[r2][col] / pivot;
        for (var c = col; c <= n; c++) A[r2][c] -= factor * A[col][c];
      }
    }
    var x = new Array(n);
    for (var i2 = 0; i2 < n; i2++) x[i2] = A[i2][n] / (A[i2][i2] || 1e-12);
    return x;
  }
  function computeHomography(srcPts, dstPts) {
    var A = [], B = [];
    for (var i = 0; i < 4; i++) {
      var sx = srcPts[i].x, sy = srcPts[i].y, dx = dstPts[i].x, dy = dstPts[i].y;
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]); B.push(dx);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]); B.push(dy);
    }
    var s = solveLinearSystem(A, B);
    return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
  }
  function invert3x3(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    var C00 = e * i - f * h, C01 = -(d * i - f * g), C02 = d * h - e * g;
    var C10 = -(b * i - c * h), C11 = a * i - c * g, C12 = -(a * h - b * g);
    var C20 = b * f - c * e, C21 = -(a * f - c * d), C22 = a * e - b * d;
    var det = a * C00 + b * C01 + c * C02;
    var invDet = 1 / (det || 1e-12);
    return [C00 * invDet, C10 * invDet, C20 * invDet, C01 * invDet, C11 * invDet, C21 * invDet, C02 * invDet, C12 * invDet, C22 * invDet];
  }
  function bilinearSample(imgData, sx, sy) {
    var w = imgData.width, h = imgData.height, data = imgData.data;
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) return [255, 255, 255];
    var x0 = Math.floor(sx), y0 = Math.floor(sy);
    var x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    var fx = sx - x0, fy = sy - y0;
    var i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    var r = [];
    for (var k = 0; k < 3; k++) {
      var top = data[i00 + k] * (1 - fx) + data[i10 + k] * fx;
      var bottom = data[i01 + k] * (1 - fx) + data[i11 + k] * fx;
      r.push(top * (1 - fy) + bottom * fy);
    }
    return r;
  }
  function applyEnhance(ctx, w, h, grayscale, contrastPct) {
    if (!grayscale && !contrastPct) return;
    var imgData = ctx.getImageData(0, 0, w, h);
    var d = imgData.data;
    var c = (contrastPct / 100) * 80;
    var factor = (259 * (c + 255)) / (255 * (259 - c));
    for (var p = 0; p < d.length; p += 4) {
      var r = d[p], g = d[p + 1], b = d[p + 2];
      if (grayscale) { var gray = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = gray; }
      d[p] = Math.max(0, Math.min(255, factor * (r - 128) + 128));
      d[p + 1] = Math.max(0, Math.min(255, factor * (g - 128) + 128));
      d[p + 2] = Math.max(0, Math.min(255, factor * (b - 128) + 128));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function setupScanStage(img) {
    state.scanImageEl = img;
    els.stageWrap.style.display = 'flex';
    var containerW = els.stageWrap.clientWidth || 400;
    var maxW = containerW - 4;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    state.scanDisplayScale = maxW / iw;
    state.scanDW = Math.max(1, Math.round(iw * state.scanDisplayScale));
    state.scanDH = Math.max(1, Math.round(ih * state.scanDisplayScale));
    els.canvas.width = state.scanDW;
    els.canvas.height = state.scanDH;
    els.stage.style.width = state.scanDW + 'px';
    els.stage.style.height = state.scanDH + 'px';
    els.quadSvg.setAttribute('viewBox', '0 0 ' + state.scanDW + ' ' + state.scanDH);
    var ctx = els.canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, state.scanDW, state.scanDH);
    autoDetectCorners();
  }

  function loadScanImage(file) {
    if (!els.docName.value.trim() && file && file.name) {
      var base = file.name.replace(/\.[^.]+$/, '');
      var digitsOnly = base.replace(/\D/g, '');
      var looksLikeMeaninglessNumber = digitsOnly.length >= 10 && digitsOnly.length >= base.length * 0.7;
      els.docName.value = looksLikeMeaninglessNumber
        ? ('스캔_' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''))
        : base;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () { setupScanStage(img); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function updateSkipVisibility() {
    els.btnSkip.style.display = state.scanFileQueue.length ? '' : 'none';
  }
  function loadNextQueuedFileIfAny() {
    updateSkipVisibility();
    if (!state.scanFileQueue.length) return;
    loadScanImage(state.scanFileQueue.shift());
    updateSkipVisibility();
  }

  function warpAndAddPage() {
    var scale = 1 / state.scanDisplayScale;
    var srcPts = ['tl', 'tr', 'br', 'bl'].map(function (k) { return { x: state.scanCorners[k].x * scale, y: state.scanCorners[k].y * scale }; });
    var dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
    var outW = Math.round(Math.max(dist(srcPts[0], srcPts[1]), dist(srcPts[3], srcPts[2])));
    var outH = Math.round(Math.max(dist(srcPts[0], srcPts[3]), dist(srcPts[1], srcPts[2])));
    var MAX_DIM = 2000;
    if (outW > MAX_DIM || outH > MAX_DIM) {
      var s = MAX_DIM / Math.max(outW, outH);
      outW = Math.round(outW * s); outH = Math.round(outH * s);
    }
    outW = Math.max(50, outW); outH = Math.max(50, outH);

    var dstPts = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
    var M = computeHomography(srcPts, dstPts);
    var Minv = invert3x3(M);

    var srcCanvas = document.createElement('canvas');
    srcCanvas.width = state.scanImageEl.naturalWidth; srcCanvas.height = state.scanImageEl.naturalHeight;
    var srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(state.scanImageEl, 0, 0);
    var srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    var outCanvas = document.createElement('canvas');
    outCanvas.width = outW; outCanvas.height = outH;
    var outCtx = outCanvas.getContext('2d');
    var outData = outCtx.createImageData(outW, outH);

    for (var Y = 0; Y < outH; Y++) {
      for (var X = 0; X < outW; X++) {
        var w = Minv[6] * X + Minv[7] * Y + Minv[8];
        var sx = (Minv[0] * X + Minv[1] * Y + Minv[2]) / w;
        var sy = (Minv[3] * X + Minv[4] * Y + Minv[5]) / w;
        var rgb = bilinearSample(srcData, sx, sy);
        var di = (Y * outW + X) * 4;
        outData.data[di] = rgb[0]; outData.data[di + 1] = rgb[1]; outData.data[di + 2] = rgb[2]; outData.data[di + 3] = 255;
      }
    }
    outCtx.putImageData(outData, 0, 0);
    applyEnhance(outCtx, outW, outH, els.grayscale.checked, Number(els.contrast.value));

    var dataUrl = outCanvas.toDataURL('image/jpeg', 0.88);
    state.docPages.push({ type: 'image', dataUrl: dataUrl, rotation: 0, name: String(state.docPages.length + 1).padStart(3, '0') });
    renderTray();

    els.fileCapture.value = ''; els.fileGallery.value = '';
    els.stageWrap.style.display = 'none';
    state.scanImageEl = null;
  }

  function dataUrlToUint8(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function getRotatedJpegBytes(item) {
    if (!item.rotation) return Promise.resolve(dataUrlToUint8(item.dataUrl));
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var swapped = item.rotation % 180 !== 0;
        var cw = swapped ? img.height : img.width, ch = swapped ? img.width : img.height;
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(item.rotation * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(function (blob) { blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }); }, 'image/jpeg', 0.9);
      };
      img.src = item.dataUrl;
    });
  }

  async function buildDocPagesIntoPdfBytes(pages) {
    var outDoc = await PDFLib.PDFDocument.create();
    for (var idx = 0; idx < pages.length; idx++) {
      var p = pages[idx];
      if (p.type === 'image') {
        var jpegBytes = await getRotatedJpegBytes(p);
        var embedded = await outDoc.embedJpg(jpegBytes);
        var page = outDoc.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      } else {
        var srcDoc = await PDFLib.PDFDocument.load(p.bytes);
        var copied = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        copied.forEach(function (cp) { outDoc.addPage(cp); });
      }
    }
    return outDoc.save();
  }

  // ============================================================
  // 문서 목록(트레이) 렌더링 — 페이지 단위(스캔 중)와 문서 단위(확정된 것들) 둘 다.
  // ============================================================
  function renderTray() {
    els.btnFinishDoc.disabled = state.docPages.length === 0;
    els.tray.innerHTML = '';
    state.docPages.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'nxsc-tray-item';
      row.dataset.idx = idx;
      if (item.type === 'image') {
        row.innerHTML = '<div class="nxsc-tray-grip"><img src="' + item.dataUrl + '" style="transform:rotate(' + item.rotation + 'deg)">' +
          '<span class="nxsc-name">' + escapeHtml(item.name) + '</span></div>' +
          '<button data-act="rotate" title="90도 회전">↻</button><button data-act="del" title="삭제">✕</button>';
      } else {
        row.innerHTML = '<div class="nxsc-tray-grip"><span class="nxsc-pdf-icon">📄</span>' +
          '<span class="nxsc-name">' + escapeHtml(item.name) + ' (' + item.pageCount + 'p)</span></div>' +
          '<button data-act="del" title="삭제">✕</button>';
      }
      row.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.dataset.act;
          if (act === 'del') state.docPages.splice(idx, 1);
          else if (act === 'rotate') item.rotation = (item.rotation + 90) % 360;
          renderTray();
        });
      });
      setupTrayDrag(row);
      els.tray.appendChild(row);
    });
  }
  function setupTrayDrag(row) {
    var grip = row.querySelector('.nxsc-tray-grip');
    function onMove(e) {
      var after = getTrayDragAfterElement(e.clientY);
      if (after == null) els.tray.appendChild(row);
      else if (after !== row) els.tray.insertBefore(row, after);
    }
    function onEnd() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      row.classList.remove('nxsc-dragging');
      var newOrder = Array.from(els.tray.children).map(function (el) { return Number(el.dataset.idx); });
      state.docPages = newOrder.map(function (i) { return state.docPages[i]; });
      renderTray();
    }
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      row.classList.add('nxsc-dragging');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    });
  }
  function getTrayDragAfterElement(y) {
    var items = Array.from(els.tray.querySelectorAll('.nxsc-tray-item:not(.nxsc-dragging)'));
    return items.reduce(function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
      return closest;
    }, { offset: -Infinity, element: null }).element;
  }

  function renderDocList() {
    els.docList.innerHTML = '';
    state.scanCompletedDocs.forEach(function (doc, idx) {
      var row = document.createElement('div');
      row.className = 'nxsc-doc-item';
      row.innerHTML = '<span>📎</span><span class="nxsc-name">' + escapeHtml(doc.name) + '</span><button title="삭제">✕</button>';
      row.querySelector('button').addEventListener('click', function () {
        state.scanCompletedDocs.splice(idx, 1);
        renderDocList();
      });
      els.docList.appendChild(row);
    });
  }

  // 지금까지 담은 페이지들을 문서 하나로 확정한다 — 여러 문서를 한 번에 스캔해도 서로
  // 섞이지 않고 각각 별도 파일로 남게 하기 위한 경계선 역할.
  async function finishCurrentDocumentGroup() {
    if (state.scanImageEl && state.scanCorners && els.stageWrap.style.display !== 'none') {
      try { warpAndAddPage(); } catch (err) { /* 무시 — 아래 길이 체크로 자연히 걸러짐 */ }
    }
    if (!state.docPages.length) return false;
    var allowRotate = state.docPages.every(function (p) { return p.type === 'pdf'; });
    var defaultName = state.scanCompletedDocs.length === 0 && state.opts.defaultDocName
      ? state.opts.defaultDocName
      : ('문서' + (state.scanCompletedDocs.length + 1));
    var name = els.docName.value.trim() || defaultName;
    var bytes = await buildDocPagesIntoPdfBytes(state.docPages);
    state.scanCompletedDocs.push({ name: name, bytes: bytes, allowRotate: allowRotate });
    state.docPages = [];
    renderTray();
    renderDocList();
    els.docName.value = '';
    return true;
  }

  // ============================================================
  // 이벤트 연결 — buildModal()에서 한 번만 호출.
  // ============================================================
  function wireEvents() {
    els.btnClose.addEventListener('click', function () {
      if ((state.docPages.length || state.scanCompletedDocs.length) &&
        !confirm('아직 저장하지 않은 자료가 있습니다. 닫으면 사라집니다. 닫을까요?')) return;
      closeModal();
    });
    els.btnCapture.addEventListener('click', function () { els.fileCapture.click(); });
    els.btnGallery.addEventListener('click', function () { els.fileGallery.click(); });
    els.btnPdfInsert.addEventListener('click', function () { els.filePdfInsert.click(); });

    els.fileCapture.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) loadScanImage(file);
    });
    els.fileGallery.addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []);
      if (!files.length) return;
      state.scanFileQueue = files.slice(1);
      loadScanImage(files[0]);
      updateSkipVisibility();
    });
    els.btnSkip.addEventListener('click', loadNextQueuedFileIfAny);

    els.btnAutoDetect.addEventListener('click', autoDetectCorners);
    els.btnWholeImage.addEventListener('click', function () {
      if (!state.scanImageEl) return;
      state.scanCorners = { tl: { x: 0, y: 0 }, tr: { x: state.scanDW, y: 0 }, br: { x: state.scanDW, y: state.scanDH }, bl: { x: 0, y: state.scanDH } };
      renderScanHandles();
    });
    els.btnRotateSrc.addEventListener('click', function () {
      if (!state.scanImageEl) return;
      var off = document.createElement('canvas');
      off.width = state.scanImageEl.naturalHeight; off.height = state.scanImageEl.naturalWidth;
      var octx = off.getContext('2d');
      octx.translate(off.width / 2, off.height / 2);
      octx.rotate(90 * Math.PI / 180);
      octx.drawImage(state.scanImageEl, -state.scanImageEl.naturalWidth / 2, -state.scanImageEl.naturalHeight / 2);
      var rotated = new Image();
      rotated.onload = function () { setupScanStage(rotated); };
      rotated.src = off.toDataURL('image/jpeg', 0.92);
    });

    Array.from(els.overlay.querySelectorAll('.nxsc-handle')).forEach(function (handle) {
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        var corner = handle.dataset.corner;
        function onMove(ev) {
          var rect = els.stage.getBoundingClientRect();
          var scaleX = state.scanDW / rect.width, scaleY = state.scanDH / rect.height;
          var x = (ev.clientX - rect.left) * scaleX, y = (ev.clientY - rect.top) * scaleY;
          x = Math.max(0, Math.min(state.scanDW, x)); y = Math.max(0, Math.min(state.scanDH, y));
          state.scanCorners[corner] = { x: x, y: y };
          renderScanHandles();
        }
        function onUp() {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
    });

    els.btnWarpAdd.addEventListener('click', function () {
      if (!state.scanImageEl || !state.scanCorners) { alert('먼저 사진을 불러와주세요.'); return; }
      els.btnWarpAdd.disabled = true; els.btnWarpAdd.textContent = '처리 중…';
      setTimeout(function () {
        try {
          warpAndAddPage();
          loadNextQueuedFileIfAny();
        } catch (err) { alert('처리 중 오류: ' + (err && err.message ? err.message : err)); }
        finally { els.btnWarpAdd.disabled = false; els.btnWarpAdd.textContent = '이 페이지 담기'; }
      }, 20);
    });

    els.filePdfInsert.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        return PDFLib.PDFDocument.load(bytes).then(function (doc) {
          state.docPages.push({ type: 'pdf', name: file.name, bytes: bytes, pageCount: doc.getPageCount() });
          renderTray();
        });
      }).catch(function (err) { alert('PDF를 읽는 중 오류: ' + (err && err.message ? err.message : err)); });
      e.target.value = '';
    });

    els.btnFinishDoc.addEventListener('click', async function () {
      els.btnFinishDoc.disabled = true;
      var originalText = els.btnFinishDoc.textContent;
      els.btnFinishDoc.textContent = '담는 중…';
      try { await finishCurrentDocumentGroup(); }
      catch (err) { alert('문서를 만드는 중 오류: ' + (err && err.message ? err.message : err)); }
      finally { els.btnFinishDoc.textContent = originalText; els.btnFinishDoc.disabled = state.docPages.length === 0; }
    });

    // ---- 화면 캡처(관리자용 PC 도구에서만 노출) ----
    els.btnScreencap.addEventListener('click', async function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert('이 브라우저는 화면 캡처를 지원하지 않습니다.');
        return;
      }
      var stream = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        var track = stream.getVideoTracks()[0];
        var bitmapSource, width, height;
        if ('ImageCapture' in window) {
          var capture = new ImageCapture(track);
          var bitmap = await capture.grabFrame();
          bitmapSource = bitmap; width = bitmap.width; height = bitmap.height;
        } else {
          var video = document.createElement('video');
          video.srcObject = stream;
          await video.play();
          await new Promise(function (r) { setTimeout(r, 200); });
          bitmapSource = video; width = video.videoWidth; height = video.videoHeight;
        }
        var canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(bitmapSource, 0, 0, width, height);
        var dataUrl = canvas.toDataURL('image/png');
        var img = new Image();
        img.onload = function () { setupScanStage(img); };
        img.src = dataUrl;
      } catch (err) {
        if (err && err.name !== 'NotAllowedError') alert('화면 캡처 중 오류: ' + (err && err.message ? err.message : err));
      } finally {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      }
    });
  }

  function closeModal() {
    els.overlay.classList.remove('nxsc-open');
    state.docPages = [];
    state.scanCompletedDocs = [];
    state.scanFileQueue = [];
    state.scanImageEl = null;
    els.stageWrap.style.display = 'none';
  }

  function renderFooter(actions) {
    els.footer.innerHTML = '';
    actions.forEach(function (action, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.primary ? 'nxsc-btn-primary' : 'nxsc-btn';
      btn.textContent = action.label;
      btn.addEventListener('click', async function () {
        var originalText = btn.textContent;
        Array.from(els.footer.children).forEach(function (b) { b.disabled = true; });
        btn.textContent = action.busyLabel || '처리 중…';
        try {
          await finishCurrentDocumentGroup(); // 마지막에 남은 페이지가 있으면 문서 하나로 마저 확정
          if (!state.scanCompletedDocs.length) {
            alert('담긴 자료가 없습니다.');
            return;
          }
          var docsForHandler = state.scanCompletedDocs.map(function (d) { return { name: d.name, bytes: d.bytes, allowRotate: d.allowRotate }; });
          var shouldClose = await action.handler(docsForHandler);
          if (shouldClose) closeModal();
        } catch (err) {
          alert('처리 중 오류: ' + (err && err.message ? err.message : err));
        } finally {
          btn.textContent = originalText;
          Array.from(els.footer.children).forEach(function (b) { b.disabled = false; });
        }
      });
      els.footer.appendChild(btn);
    });
  }

  // ============================================================
  // 공개 API
  // ============================================================
  function open(options) {
    options = options || {};
    buildModal();

    state.docPages = [];
    state.scanCompletedDocs = [];
    state.scanFileQueue = [];
    state.scanImageEl = null;
    state.opts = options;

    els.targetLabel.textContent = options.targetLabel ? ('「' + options.targetLabel + '」에 추가할 자료를 스캔합니다.') : '';
    els.docName.value = '';
    els.stageWrap.style.display = 'none';
    els.btnSkip.style.display = 'none';
    els.btnScreencap.style.display = options.allowScreenCapture ? '' : 'none';
    renderTray();
    renderDocList();
    renderFooter(options.actions || []);

    els.overlay.classList.add('nxsc-open');

    // 폴더에 이미 있는 파일(예: 증빙확보 목록의 📷 아이콘)을 곧바로 보정 단계로 이어서
    // 불러오고 싶을 때 — 카메라/갤러리를 거치지 않고 바로 크롭 화면부터 시작한다.
    if (options.initialFiles && options.initialFiles.length) {
      state.scanFileQueue = options.initialFiles.slice(1);
      loadScanImage(options.initialFiles[0]);
      updateSkipVisibility();
    }
  }

  global.NetaxScan = { open: open };
})(window);
