// SVG 日本地圖（都道府縣 → 市区町村）
// 資料：web/geo/japan.geojson、web/geo/cities/XX.geojson
// GeoJSON property 規約：
//   都道府縣：properties.id (數字 1-47)、properties.nam_ja
//   市区町村：properties.N03_007（5 碼 city code）、N03_003 (政令都市)、N03_004（市区町村名）

const NS = 'http://www.w3.org/2000/svg';
const TARGET_W = 600; // SVG viewBox 寬度（高度依內容 bbox 比例計算）
const PAD = 6;

function walkCoords(features, fn) {
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) for (const p of ring) fn(p);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) for (const ring of poly) for (const p of ring) fn(p);
    }
  }
}

// 移除離主體太遠的零散離島（如 Tokyo 的小笠原村），
// 否則 bbox 被拉太大、主島被擠成一條線
function dropOutliers(features, toleranceDeg) {
  if (features.length <= 3) return features;
  const centroids = features.map((f) => {
    let sx = 0, sy = 0, n = 0;
    const g = f.geometry;
    if (!g) return null;
    if (g.type === 'Polygon') for (const r of g.coordinates) for (const p of r) { sx += p[0]; sy += p[1]; n++; }
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) for (const r of poly) for (const p of r) { sx += p[0]; sy += p[1]; n++; }
    return n > 0 ? { f, cx: sx / n, cy: sy / n } : null;
  }).filter(Boolean);
  if (centroids.length === 0) return features;
  const lats = centroids.map((c) => c.cy).sort((a, b) => a - b);
  const lons = centroids.map((c) => c.cx).sort((a, b) => a - b);
  const medLat = lats[Math.floor(lats.length / 2)];
  const medLon = lons[Math.floor(lons.length / 2)];
  return centroids
    .filter((c) => Math.abs(c.cy - medLat) <= toleranceDeg && Math.abs(c.cx - medLon) <= toleranceDeg)
    .map((c) => c.f);
}

function makeProjection(features, opts = {}) {
  const useFeatures = opts.dropOutliers
    ? dropOutliers(features, opts.dropOutliers)
    : features;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  walkCoords(useFeatures, ([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  const centerLat = (minLat + maxLat) / 2;
  const k = Math.cos((centerLat * Math.PI) / 180);
  const wLon = (maxLon - minLon) * k;
  const hLat = maxLat - minLat;
  const innerW = TARGET_W - 2 * PAD;
  const s = innerW / wLon;
  const innerH = hLat * s;
  const TARGET_H = innerH + 2 * PAD;
  const project = ([lon, lat]) => [
    PAD + (lon - minLon) * k * s,
    PAD + (maxLat - lat) * s,
  ];
  return { project, viewBox: [TARGET_W, TARGET_H], features: useFeatures };
}

function pathD(geom, project) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let d = '';
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }
      d += 'Z';
    }
  }
  return d;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

// 取最大子多邊形的「外環頂點平均」作為 label 錨點 — 計算便宜，視覺夠用
function labelAnchor(geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let largest = null;
  let largestArea = -Infinity;
  for (const rings of polys) {
    const outer = rings[0];
    if (!outer || outer.length === 0) continue;
    const a = ringArea(outer);
    if (a > largestArea) {
      largestArea = a;
      largest = outer;
    }
  }
  if (!largest) return null;
  let sx = 0, sy = 0;
  for (const p of largest) { sx += p[0]; sy += p[1]; }
  return [sx / largest.length, sy / largest.length, largestArea];
}

export function createMap({ container, onPrefectureClick, onCityToggle }) {
  const wrap = document.createElement('div');
  wrap.className = 'map-canvas';

  const toolbar = document.createElement('div');
  toolbar.className = 'map-toolbar';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'link-btn map-back';
  backBtn.textContent = '← 全國';
  backBtn.hidden = true;
  const titleEl = document.createElement('span');
  titleEl.className = 'map-title';
  // Zoom controls
  const zoomCtl = document.createElement('div');
  zoomCtl.className = 'map-zoom-ctl';
  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.className = 'map-zoom-btn';
  zoomInBtn.setAttribute('aria-label', '放大');
  zoomInBtn.textContent = '＋';
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.className = 'map-zoom-btn';
  zoomOutBtn.setAttribute('aria-label', '縮小');
  zoomOutBtn.textContent = '－';
  const zoomResetBtn = document.createElement('button');
  zoomResetBtn.type = 'button';
  zoomResetBtn.className = 'map-zoom-btn map-zoom-reset';
  zoomResetBtn.setAttribute('aria-label', '重置縮放');
  zoomResetBtn.textContent = '↺';
  zoomCtl.append(zoomOutBtn, zoomInBtn, zoomResetBtn);
  toolbar.append(backBtn, titleEl, zoomCtl);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${TARGET_W} ${TARGET_W}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('map-svg');
  svg.style.touchAction = 'none'; // 自己處理手勢，避免瀏覽器 pan/zoom 衝突

  // 灰色斜線 pattern 給「無店舖」city 用（顏色 + 紋理雙重編碼，符合 WCAG color-not-only）
  const defs = document.createElementNS(NS, 'defs');
  const pat = document.createElementNS(NS, 'pattern');
  pat.setAttribute('id', 'map-disabled-pattern');
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  pat.setAttribute('width', '5');
  pat.setAttribute('height', '5');
  pat.setAttribute('patternTransform', 'rotate(45)');
  pat.innerHTML = `<rect width="5" height="5" fill="#e0dcd5"/><line x1="0" y1="0" x2="0" y2="5" stroke="#b8b3a9" stroke-width="1.2"/>`;
  defs.appendChild(pat);
  svg.appendChild(defs);

  // legend chips（disabled 那項只在 prefecture view 顯示）
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-chip available"></span>可選</span>
    <span class="legend-item"><span class="legend-chip selected"></span>已選</span>
    <span class="legend-item legend-disabled" hidden><span class="legend-chip disabled"></span>無店舖</span>
  `;
  const legendDisabledItem = legend.querySelector('.legend-disabled');

  // 容納所有可縮放內容的 group，transform 由 zoom 控制
  const zoomGroup = document.createElementNS(NS, 'g');
  zoomGroup.classList.add('map-zoom-group');
  svg.appendChild(zoomGroup);

  // DEBUG — 暫時加的事件 log，定位 Pixel tap 不進下一層的問題；解完移除
  const dbgPanel = document.createElement('div');
  dbgPanel.style.cssText = 'font:11px ui-monospace,monospace;background:#111;color:#9fe;padding:4px 6px;max-height:140px;overflow-y:auto;white-space:pre;line-height:1.35;';
  const dbgLines = [];
  function dbg(msg) {
    const ts = new Date().toISOString().slice(17, 23);
    dbgLines.unshift(ts + ' ' + msg);
    if (dbgLines.length > 14) dbgLines.length = 14;
    dbgPanel.textContent = dbgLines.join('\n');
  }
  window.__mapDbg = dbg;

  wrap.append(toolbar, svg, legend, dbgPanel);
  container.appendChild(wrap);

  let japanData = null;
  const cityCache = new Map();
  const state = {
    prefectureCode: null,
    cityCodes: new Set(), // 已選市町村的 5 碼（有 city_code 才填）
    cityNames: new Set(), // 已選市町村名稱（總是填，給沒 code 時用）
    available: [], // [{ name, code, count }] 該縣可選清單
  };

  backBtn.addEventListener('click', () => {
    // 不清掉選擇 — 切換到全國視圖時保留現選中的縣作為高亮
    renderJapan();
  });

  async function ensureJapan() {
    if (japanData) return japanData;
    const res = await fetch('geo/japan.geojson');
    if (!res.ok) throw new Error('japan.geojson 載入失敗');
    japanData = await res.json();
    return japanData;
  }

  async function ensureCities(code) {
    if (cityCache.has(code)) return cityCache.get(code);
    try {
      const res = await fetch(`geo/cities/${code}.geojson`);
      if (!res.ok) {
        cityCache.set(code, null);
        return null;
      }
      const data = await res.json();
      cityCache.set(code, data);
      return data;
    } catch {
      cityCache.set(code, null);
      return null;
    }
  }

  function clearSvg() {
    while (zoomGroup.firstChild) zoomGroup.removeChild(zoomGroup.firstChild);
  }

  // 觸發切換 view 時的淡入動畫
  function triggerFade() {
    svg.classList.remove('fade-in');
    void svg.offsetWidth;
    svg.classList.add('fade-in');
  }

  // ========== Zoom & Pan ==========
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 8;
  let zoomState = { scale: 1, tx: 0, ty: 0 };

  function applyZoom() {
    zoomGroup.setAttribute(
      'transform',
      `translate(${zoomState.tx.toFixed(2)} ${zoomState.ty.toFixed(2)}) scale(${zoomState.scale.toFixed(3)})`
    );
    zoomOutBtn.disabled = zoomState.scale <= MIN_ZOOM + 0.001;
    zoomInBtn.disabled = zoomState.scale >= MAX_ZOOM - 0.001;
    zoomResetBtn.disabled = zoomState.scale === 1 && zoomState.tx === 0 && zoomState.ty === 0;
  }

  function resetZoom() {
    zoomState = { scale: 1, tx: 0, ty: 0 };
    applyZoom();
  }

  // 相對於 SVG viewBox 座標的縮放（pivot 在 viewBox 系，不是 zoomGroup local）
  function zoomBy(factor, pivotX, pivotY) {
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomState.scale * factor));
    const real = newScale / zoomState.scale;
    zoomState.tx = pivotX - (pivotX - zoomState.tx) * real;
    zoomState.ty = pivotY - (pivotY - zoomState.ty) * real;
    zoomState.scale = newScale;
    clampPan();
    applyZoom();
  }

  // 平移上限：縮放後內容不應超出 viewBox 太多（避免拖到看不見）
  function clampPan() {
    const [vbW, vbH] = svg.getAttribute('viewBox').split(' ').slice(2).map(Number);
    const contentW = vbW * zoomState.scale;
    const contentH = vbH * zoomState.scale;
    // 允許邊緣略微滑出（緩衝）
    const minTx = vbW - contentW;
    const maxTx = 0;
    const minTy = vbH - contentH;
    const maxTy = 0;
    if (contentW > vbW) zoomState.tx = Math.min(maxTx, Math.max(minTx, zoomState.tx));
    else zoomState.tx = (vbW - contentW) / 2;
    if (contentH > vbH) zoomState.ty = Math.min(maxTy, Math.max(minTy, zoomState.ty));
    else zoomState.ty = (vbH - contentH) / 2;
  }

  function clientToSvg(clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const x = clientX * inv.a + clientY * inv.c + inv.e;
    const y = clientX * inv.b + clientY * inv.d + inv.f;
    return { x, y };
  }

  zoomInBtn.addEventListener('click', () => {
    const [vbW, vbH] = svg.getAttribute('viewBox').split(' ').slice(2).map(Number);
    zoomBy(1.5, vbW / 2, vbH / 2);
  });
  zoomOutBtn.addEventListener('click', () => {
    const [vbW, vbH] = svg.getAttribute('viewBox').split(' ').slice(2).map(Number);
    zoomBy(1 / 1.5, vbW / 2, vbH / 2);
  });
  zoomResetBtn.addEventListener('click', resetZoom);

  // 滾輪縮放（pivot 在游標位置）
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = clientToSvg(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    zoomBy(factor, p.x, p.y);
  }, { passive: false });

  // Pointer events：1 指 pan、2 指 pinch
  const pointers = new Map();
  let pinch = null;
  let drag = null;
  let suppressNextClick = false;

  svg.addEventListener('pointerdown', (e) => {
    dbg('svg-down ' + e.pointerType + ' id=' + e.pointerId + ' tgt=' + (e.target.tagName || '?') + '.' + (e.target.dataset?.code || '-'));
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startScale: zoomState.scale,
        startTx: zoomState.tx,
        startTy: zoomState.ty,
        pivot: clientToSvg((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2),
      };
      drag = null;
    } else if (pointers.size === 1) {
      drag = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTx: zoomState.tx,
        startTy: zoomState.ty,
        moved: 0,
        // 觸控感測器抖動較大，閾值放寬避免單純 tap 被誤判為 pan 而吃掉 click
        threshold: e.pointerType === 'touch' ? 8 : 4,
      };
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.startScale * dist / pinch.startDist));
      const real = newScale / pinch.startScale;
      zoomState.tx = pinch.pivot.x - (pinch.pivot.x - pinch.startTx) * real;
      zoomState.ty = pinch.pivot.y - (pinch.pivot.y - pinch.startTy) * real;
      zoomState.scale = newScale;
      clampPan();
      applyZoom();
      suppressNextClick = true;
    } else if (drag && pointers.size === 1) {
      const dxClient = e.clientX - drag.startClientX;
      const dyClient = e.clientY - drag.startClientY;
      const moved = Math.hypot(dxClient, dyClient);
      drag.moved = Math.max(drag.moved, moved);
      drag.lastDx = dxClient;
      drag.lastDy = dyClient;
      if (moved > drag.threshold) {
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const inv = ctm.inverse();
          const dxSvg = dxClient * inv.a + dyClient * inv.c;
          const dySvg = dxClient * inv.b + dyClient * inv.d;
          zoomState.tx = drag.startTx + dxSvg;
          zoomState.ty = drag.startTy + dySvg;
          clampPan();
          applyZoom();
          // 不在這裡 suppress — 用 pointerup 當下的最終位移判定，
          // 避免 tap 中途瞬間抖出 > threshold 又回來時把第一次 click 吃掉
        }
      }
    }
  });

  function endPointer(e) {
    // 只有最終位移仍超過 threshold 才視為真 pan、suppress click；
    // 中途抖出又回來的 tap 不會被誤判
    let suppressed = false;
    if (drag && pointers.size === 1) {
      const finalMoved = Math.hypot(drag.lastDx || 0, drag.lastDy || 0);
      if (finalMoved > drag.threshold) {
        suppressNextClick = true;
        suppressed = true;
      }
      dbg('svg-' + e.type + ' id=' + e.pointerId + ' finalDx=' + (drag.lastDx || 0).toFixed(1) + ' dy=' + (drag.lastDy || 0).toFixed(1) + ' peak=' + drag.moved.toFixed(1) + ' suppress=' + suppressed);
    } else {
      dbg('svg-' + e.type + ' id=' + e.pointerId + ' (no drag)');
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', (e) => {
    if (pointers.has(e.pointerId)) endPointer(e);
  });

  // 拖曳後抑制隨之而來的 click，避免誤觸 polygon
  svg.addEventListener('click', (e) => {
    dbg('svg-click(capture) tgt=' + (e.target.tagName || '?') + '.' + (e.target.dataset?.code || '-') + ' suppress=' + suppressNextClick);
    if (suppressNextClick) {
      e.stopPropagation();
      e.preventDefault();
      suppressNextClick = false;
    }
  }, { capture: true });

  async function renderJapan() {
    backBtn.hidden = true;
    legendDisabledItem.hidden = true;
    titleEl.textContent = '點選都道府縣';
    let data;
    try {
      data = await ensureJapan();
    } catch {
      titleEl.textContent = '地圖資料尚未產生（執行 npm run fetch-geo）';
      return;
    }
    const proj = makeProjection(data.features, { dropOutliers: 12 });
    const project = proj.project;
    svg.setAttribute('viewBox', `0 0 ${proj.viewBox[0]} ${proj.viewBox[1]}`);
    resetZoom();
    clearSvg();
    triggerFade();
    const labels = [];
    for (const f of proj.features) {
      const code = String(f.properties.id).padStart(2, '0');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', pathD(f.geometry, project));
      path.classList.add('map-region', 'pref');
      if (code === state.prefectureCode) path.classList.add('selected');
      path.dataset.code = code;
      path.addEventListener('click', () => {
        dbg('path-click pref ' + code + ' → onPrefectureClick');
        onPrefectureClick(code);
      });
      const t = document.createElementNS(NS, 'title');
      t.textContent = f.properties.nam_ja;
      path.appendChild(t);
      zoomGroup.appendChild(path);
      const anchor = labelAnchor(f.geometry);
      if (anchor) labels.push({ name: f.properties.nam_ja, anchor, code });
    }
    drawLabels(labels, project, 8, 'pref');
  }

  async function renderPrefecture(code) {
    backBtn.hidden = false;
    legendDisabledItem.hidden = false;
    titleEl.textContent = '載入地圖中…';
    const data = await ensureCities(code);
    titleEl.textContent = '點選市区町村（可多選）';
    if (!data) {
      clearSvg();
      titleEl.textContent = '此縣無地圖資料';
      return;
    }
    const proj = makeProjection(data.features, { dropOutliers: 1 });
    const project = proj.project;
    svg.setAttribute('viewBox', `0 0 ${proj.viewBox[0]} ${proj.viewBox[1]}`);
    resetZoom();
    clearSvg();
    triggerFade();
    // 雙重 lookup：code 或 name 都可比對（city_code 在舊資料可能空）
    const codeToName = new Map();
    const nameSet = new Set();
    for (const c of state.available) {
      if (c.code) codeToName.set(c.code, c.name);
      if (c.name) nameSet.add(c.name);
    }
    const labels = [];
    for (const f of proj.features) {
      const cityCode = String(f.properties.N03_007 || '');
      const fullName = (f.properties.N03_003 || '') + (f.properties.N03_004 || '');
      const shortName = f.properties.N03_004 || '';
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', pathD(f.geometry, project));
      path.classList.add('map-region', 'city');
      // 優先 by code，其次 by 全名（札幌市中央区），最後 by 短名（中央区）
      let matchedName = codeToName.get(cityCode);
      if (!matchedName && nameSet.has(fullName)) matchedName = fullName;
      if (!matchedName && nameSet.has(shortName)) matchedName = shortName;
      const displayName = matchedName || fullName;
      if (!matchedName) {
        path.classList.add('disabled');
      } else {
        if (state.cityCodes.has(cityCode) || state.cityNames.has(matchedName)) {
          path.classList.add('selected');
        }
        path.dataset.code = cityCode;
        path.dataset.name = matchedName;
        path.addEventListener('click', () => {
          dbg('path-click city ' + matchedName + ' → onCityToggle');
          onCityToggle(matchedName);
        });
      }
      const t = document.createElementNS(NS, 'title');
      t.textContent = displayName;
      path.appendChild(t);
      zoomGroup.appendChild(path);
      const anchor = labelAnchor(f.geometry);
      if (anchor && displayName) {
        labels.push({ name: displayName, anchor, code: cityCode, disabled: !name });
      }
    }
    drawLabels(labels, project, 6, 'city');
  }

  // 畫 labels — 大的優先放，新 label 若與已放的 bbox 重疊就跳過
  function drawLabels(labels, project, fontSize, kind) {
    labels.sort((a, b) => b.anchor[2] - a.anchor[2]);
    const minAreaThreshold = kind === 'pref' ? 0 : 0.0008;
    const placed = []; // [x1,y1,x2,y2]
    const overlaps = (a, b) =>
      !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    for (const { name, anchor, disabled } of labels) {
      if (anchor[2] < minAreaThreshold) continue;
      const [px, py] = project([anchor[0], anchor[1]]);
      // 估算 bbox（中文字寬 ≈ fontSize × 1.0）
      const w = name.length * fontSize * 1.0;
      const h = fontSize * 1.1;
      const box = [px - w / 2, py - h / 2, px + w / 2, py + h / 2];
      if (placed.some((p) => overlaps(box, p))) continue;
      placed.push(box);
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', px.toFixed(1));
      text.setAttribute('y', py.toFixed(1));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', String(fontSize));
      text.classList.add('map-label');
      if (disabled) text.classList.add('disabled');
      text.textContent = name;
      zoomGroup.appendChild(text);
    }
  }

  function updateCityHighlights() {
    if (!state.prefectureCode) return;
    for (const path of zoomGroup.querySelectorAll('.map-region.city:not(.disabled)')) {
      const byCode = path.dataset.code && state.cityCodes.has(path.dataset.code);
      const byName = path.dataset.name && state.cityNames.has(path.dataset.name);
      path.classList.toggle('selected', byCode || byName);
    }
  }

  // 對外 API
  return {
    setPrefecture(code, available) {
      state.prefectureCode = code;
      state.available = available || [];
      if (code) renderPrefecture(code);
      else renderJapan();
    },
    setSelectedCities(cityNames, available) {
      state.available = available || state.available;
      state.cityNames = new Set(cityNames);
      state.cityCodes = new Set();
      for (const c of state.available) {
        if (cityNames.has(c.name) && c.code) state.cityCodes.add(c.code);
      }
      updateCityHighlights();
    },
    init() {
      renderJapan();
    },
  };
}
