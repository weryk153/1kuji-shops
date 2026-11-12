// 街道地圖（Leaflet + 国土地理院 淡色地図）
// 一個一番賞最多約 1.8 萬間店，不能全部畫 —— 只畫目前畫面範圍內的店，
// 縮太遠或畫面內太多間時改顯示提示，請使用者放大。
// L 由 index.html 以 <script> 載入（全域）

import { translateShopName } from './translate.js';
import { haversineKm, formatDistance } from './geo-utils.js';

const JAPAN_CENTER = [36.5, 137.5];
const JAPAN_ZOOM = 5;
const NEARBY_ZOOM = 15;
const MIN_PIN_ZOOM = 10;
const MAX_PINS = 3000;

const PIN_STYLE = { radius: 7, weight: 2, color: '#ffffff', fillColor: '#c8342a', fillOpacity: 0.95 };
const PIN_SOLDOUT = { ...PIN_STYLE, fillColor: '#9aa3ad', fillOpacity: 0.85 };

const JST_FMT = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Tokyo', hour12: false,
});

function hasCoord(s) {
  return Number.isFinite(s.lat) && Number.isFinite(s.lon);
}

export function createMap({ container, onLocate }) {
  container.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'leaflet-map';
  container.appendChild(el);

  const map = L.map(el, {
    center: JAPAN_CENTER,
    zoom: JAPAN_ZOOM,
    minZoom: 4,
    maxZoom: 18,
    // 嵌在頁面裡的地圖：滾輪預設不縮放，避免捲頁時被地圖吃掉；點過地圖才啟用
    scrollWheelZoom: false,
    preferCanvas: true,
  });
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
    maxNativeZoom: 18,
    maxZoom: 18,
  }).addTo(map);
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());

  const renderer = L.canvas({ padding: 0.3 });
  const pinLayer = L.layerGroup().addTo(map);
  let userMarker = null;

  // 提示（畫面上方中央）
  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.hidden = true;
  el.appendChild(hint);

  // 「◎ 我的位置」按鈕（右下）
  const LocateControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'map-locate-pill');
      btn.type = 'button';
      btn.innerHTML = '<span aria-hidden="true">◎</span> 我的位置';
      L.DomEvent.disableClickPropagation(btn);
      btn.addEventListener('click', () => locate(btn));
      return btn;
    },
  });
  map.addControl(new LocateControl());

  let shops = [];
  let user = null; // { lat, lon }
  let hasLottery = false;
  let openShopKey = null;

  async function locate(btn) {
    if (!navigator.geolocation) {
      onLocate({ error: 'unsupported' });
      return;
    }
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          reject,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
      onLocate({ coords });
    } catch (err) {
      const code = err && err.code === 1 ? 'denied'
        : err && err.code === 3 ? 'timeout'
        : 'unavailable';
      onLocate({ error: code });
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  function shopKey(s) {
    return `${s.name}|${s.address}`;
  }

  function popupContent(s) {
    const box = document.createElement('div');
    box.className = 'shop-popup';
    const name = document.createElement('div');
    name.className = 'shop-popup-name';
    name.textContent = translateShopName(s.name);
    if (s.sellout_flag === 1) {
      const b = document.createElement('span');
      b.className = 'sellout-badge';
      b.textContent = '售完';
      name.appendChild(b);
    }
    const meta = document.createElement('div');
    meta.className = 'shop-popup-meta';
    const parts = [];
    if (user) parts.push(formatDistance(haversineKm(user.lat, user.lon, s.lat, s.lon)));
    if (s.release_datetime) {
      const d = new Date(s.release_datetime);
      if (!isNaN(d.valueOf())) parts.push(`${JST_FMT.format(d)} 開賣`);
    }
    meta.textContent = parts.join('・');
    const addr = document.createElement('div');
    addr.className = 'shop-popup-addr';
    addr.textContent = s.address;
    const nav = document.createElement('a');
    nav.className = 'shop-popup-nav';
    nav.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`;
    nav.target = '_blank';
    nav.rel = 'noopener';
    nav.textContent = 'Google Maps 導航 ↗';
    box.append(name, meta, addr, nav);
    return box;
  }

  function showHint(text) {
    hint.textContent = text;
    hint.hidden = !text;
  }

  // 重畫時移除舊圖釘會觸發 popupclose；用旗標分辨「使用者關掉」和「重畫」，
  // 否則 popup 自動平移觸發 moveend → 重畫 → popup 就被關掉
  let redrawing = false;
  function drawPins() {
    redrawing = true;
    pinLayer.clearLayers();
    redrawing = false;
    if (!hasLottery) {
      showHint('先選一番賞，地圖會標出販售店舖');
      return;
    }
    if (map.getZoom() < MIN_PIN_ZOOM) {
      showHint('放大地圖，或按「◎ 我的位置」看附近的店');
      return;
    }
    const b = map.getBounds().pad(0.2);
    const inView = shops.filter((s) => hasCoord(s) && b.contains([s.lat, s.lon]));
    if (inView.length > MAX_PINS) {
      showHint(`這個範圍有 ${inView.length} 間店，再放大一點`);
      return;
    }
    showHint(inView.length === 0 ? '這個範圍沒有販售店舖' : '');
    // 售完的先畫，未售完的疊在上面
    inView.sort((a, b2) => (b2.sellout_flag === 1) - (a.sellout_flag === 1));
    for (const s of inView) {
      const m = L.circleMarker([s.lat, s.lon], {
        ...(s.sellout_flag === 1 ? PIN_SOLDOUT : PIN_STYLE),
        renderer,
      });
      m.bindPopup(() => popupContent(s), { maxWidth: 260 });
      m.on('popupopen', () => { openShopKey = shopKey(s); });
      m.on('popupclose', () => {
        if (!redrawing && openShopKey === shopKey(s)) openShopKey = null;
      });
      m.addTo(pinLayer);
      if (openShopKey === shopKey(s)) {
        // 重畫時重開不要再自動平移，否則平移 → moveend → 重畫 會一直循環
        m.bindPopup(() => popupContent(s), { maxWidth: 260, autoPan: false });
        m.openPopup();
      }
    }
  }
  map.on('moveend', drawPins);

  // 地圖在 display:none 或版面改變後尺寸會錯，container 一變就重算
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => map.invalidateSize()).observe(el);
  }

  return {
    init() {
      drawPins();
    },
    // 目前一番賞的所有店舖（圖釘來源）
    setShops(list) {
      shops = list || [];
      hasLottery = !!list;
      openShopKey = null;
      map.closePopup();
      drawPins();
    },
    // 移到這些店的範圍（選了都道府縣 / 市区町村時）
    fitShops(list) {
      const pts = (list || []).filter(hasCoord).map((s) => [s.lat, s.lon]);
      if (pts.length === 0) return;
      if (pts.length === 1) map.setView(pts[0], NEARBY_ZOOM);
      else map.fitBounds(pts, { padding: [24, 24], maxZoom: NEARBY_ZOOM });
    },
    // 標出使用者位置；nearest 是最近的幾間店，太遠時改成框住「我 + 最近的店」
    setUser(coords, nearest = []) {
      user = coords;
      if (userMarker) userMarker.remove();
      userMarker = L.marker([coords.lat, coords.lon], {
        icon: L.divIcon({ className: 'user-dot', iconSize: [18, 18] }),
        keyboard: false,
        interactive: false,
      }).addTo(map);
      const far = nearest.length > 0 && nearest[0].km > 3;
      if (far) {
        const pts = [[coords.lat, coords.lon], ...nearest.slice(0, 5).map((r) => [r.shop.lat, r.shop.lon])];
        map.fitBounds(pts, { padding: [32, 32], maxZoom: NEARBY_ZOOM });
      } else {
        map.setView([coords.lat, coords.lon], NEARBY_ZOOM);
      }
    },
    // 清單上點「在地圖上看」
    focusShop(s) {
      if (!hasCoord(s)) return;
      openShopKey = shopKey(s);
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 16));
      // setView 若沒有移動不會觸發 moveend，手動重畫一次讓 popup 打開
      drawPins();
    },
  };
}
