// 找店頁的資料來源：日本（1kuji.com）與台灣（全家地圖）共用 app.js 的畫面與互動，
// 差異都收在這裡。<body data-region="tw"> 用台灣，其他用日本。
import { generateFilename } from './csv.js';
import { buildSearchBlob } from './aliases.js';
import { loadSchedule, loadJson, todayJst, formatDay, formatPrice } from './common.js';

// ---------- 日本 ----------
const JST_FMT = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hour12: false,
});
const formatJst = (d) => JST_FMT.format(d).replace(/\//g, '-') + ' JST';

function jpSource() {
  let scheduleById = new Map();
  return {
    region: 'jp',
    labels: { pref: '都道府縣', city: '市区町村', choosePref: '選擇都道府縣…', locale: 'ja' },
    staleHours: 48,
    mapOptions: {},
    async load() {
      const [lJson, prefectures, sched] = await Promise.all([
        loadJson('data/lotteries.json'),
        loadJson('data/prefectures.json'),
        loadSchedule(),
      ]);
      scheduleById = new Map(sched.items.map((i) => [i.id, i]));
      return { lotteries: lJson.lotteries, prefectures, updatedAt: new Date(lJson.scraped_at), checkedAt: new Date(lJson.scraped_at) };
    },
    async loadShops(id) {
      const res = await fetch(`data/shops/${encodeURIComponent(id)}.json`);
      if (!res.ok) return null;
      return (await res.json()).shops;
    },
    pickerGroups(lotteries) {
      const today = todayJst();
      return [
        ['販售中', 'On sale', lotteries.filter((l) => l.release_date <= today)
          .sort((a, b) => b.release_date.localeCompare(a.release_date))],
        ['即將開賣', 'Coming soon', lotteries.filter((l) => l.release_date > today)
          .sort((a, b) => a.release_date.localeCompare(b.release_date))],
      ];
    },
    card(lottery) {
      const extra = scheduleById.get(lottery.id);
      const upcoming = lottery.release_date > todayJst();
      return {
        image: extra?.banner_url || lottery.image_url,
        pill: upcoming
          ? { text: `${formatDay(lottery.release_date, { weekday: false })} 開賣`, kind: 'red' }
          : { text: '販售中', kind: 'dark' },
        name: lottery.name_ja,
        sub: formatPrice(extra?.price) || `${formatDay(lottery.release_date)} 開賣`,
        moreHref: `kuji?id=${encodeURIComponent(lottery.id)}`,
      };
    },
    searchBlob: buildSearchBlob,
    shopBadge: () => null,
    mapsQuery: (shop) => shop.address,
    shopLine: (shop) => (shop.release_datetime ? `開賣 ${formatJst(new Date(shop.release_datetime))}` : ''),
    compareInGroup: () => 0,
    csvFilename: generateFilename,
    formatUpdated: formatJst,
  };
}

// ---------- 台灣 ----------
// 縣市由北到南
const TW_CITIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
const TW_FMT = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei',
});
const formatTw = (d) => TW_FMT.format(d).replace(/\//g, '-');
const LOW_QTY = 10;

function twSource() {
  let data = null;
  let scheduleIds = new Set();
  return {
    region: 'tw',
    labels: { pref: '縣市', city: '鄉鎮市區', choosePref: '選擇縣市…', locale: 'zh-Hant' },
    staleHours: 24,
    mapOptions: {
      center: [23.7, 120.95],
      zoom: 7,
      // 国土地理院的圖磚不涵蓋台灣，改用 OSM（CARTO 現在要 API key）
      tiles: {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        maxNativeZoom: 19,
      },
      minPinZoom: 0, // 一款最多幾百間店，全台都畫得下
      popupMeta: (s) => (s.qty > 0 ? `剩 ${s.qty} 籤` : null),
    },
    async load() {
      const [tw, sched] = await Promise.all([loadJson('data/tw-familymart.json'), loadSchedule()]);
      data = tw;
      scheduleIds = new Set(sched.items.map((i) => i.id));
      const lotteries = data.products.map((p) => ({
        id: p.code,
        // 跟日本頁同一款商品：有對到就用日本正式名，搜尋另外帶台灣品名
        name_ja: p.jp_name || p.short,
        tw_name: p.short,
        full_name: p.name,
        series: p.series,
        stores: p.stores,
        qty: p.qty,
        jp_id: p.jp_id ?? null,
        image_url: p.image_url ?? null,
        release_date: '',
      }));
      const prefectures = TW_CITIES.map((c) => ({ code: c, name_ja: c, name_zh: c }));
      return {
        lotteries,
        prefectures,
        updatedAt: data.source_updated ? new Date(data.source_updated) : new Date(data.scraped_at),
        checkedAt: new Date(data.scraped_at),
      };
    },
    async loadShops(code) {
      if (!data.products.some((p) => p.code === code)) return null;
      return data.stores
        .filter((s) => code in s.stock)
        .map((s) => ({
          name: s.name,
          address: s.address,
          prefecture_code: s.city,
          city: s.area,
          lat: s.lat,
          lon: s.lon,
          qty: s.stock[code],
          ...(s.stock[code] > 0 ? {} : { sellout_flag: 1 }),
        }));
    },
    pickerGroups(lotteries) {
      return [
        ['有貨', 'In stock', lotteries.filter((l) => l.stores > 0)],
        ['全台售完', 'Sold out', lotteries.filter((l) => l.stores === 0)],
      ];
    },
    card(l) {
      return {
        image: l.image_url,
        placeholder: l.series,
        pill: l.stores > 0 ? { text: `${l.stores} 家有貨`, kind: 'dark' } : { text: '全台售完', kind: 'red' },
        name: l.name_ja,
        sub: l.stores > 0 ? `全台剩 ${l.qty.toLocaleString()} 籤` : '目前沒有門市有貨',
        // 同一款日本也有賣：發售日曆裡有就連本站詳細頁，否則連日本官網
        moreHref: !l.jp_id ? null
          : scheduleIds.has(l.jp_id) ? `kuji?id=${encodeURIComponent(l.jp_id)}`
          : `https://1kuji.com/products/${encodeURIComponent(l.jp_id)}`,
      };
    },
    searchBlob: (l) => buildSearchBlob(l) + ` ${l.tw_name} ${l.full_name} ${l.series}`.toLowerCase(),
    shopBadge: (shop) => (shop.qty > 0 ? { text: `剩 ${shop.qty} 籤`, low: shop.qty <= LOW_QTY } : null),
    mapsQuery: (shop) => `${shop.name} ${shop.address}`,
    shopLine: () => '',
    // 同一區裡剩越少的排越前面（越接近最後賞）
    compareInGroup: (a, b) => (a.qty ?? 0) - (b.qty ?? 0),
    csvFilename(lottery, pref, cities) {
      const clean = lottery.tw_name.replace(/[\\/:*?"<>|]/g, '_');
      let region = pref.name_zh;
      if (cities?.length > 3) region += `_${cities.length}區`;
      else if (cities?.length) region += `_${cities.join('_')}`;
      return `一番賞_${clean}_${region}_全家門市.csv`;
    },
    formatUpdated: formatTw,
  };
}

export function pickSource() {
  return document.body.dataset.region === 'tw' ? twSource() : jpSource();
}
