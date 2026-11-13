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
const RECENT_RELEASED = 30;

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
      const [lineup, fm, sched] = await Promise.all([
        loadJson('data/tw-lineup.json'),
        loadJson('data/tw-familymart.json'),
        loadSchedule(),
      ]);
      data = fm;
      scheduleIds = new Set(sched.items.map((i) => i.id));
      // 全家品項掛到官方商品上（scraper/tw-jp-map.json 對照）；對不到的全家品項另外列
      const fmById = new Map(fm.products.filter((p) => p.jp_id).map((p) => [p.jp_id, p]));
      const toLottery = (item, status) => ({
        id: item.id,
        name_ja: item.name_ja,
        image_url: item.image_url,
        status,
        fm: fmById.get(item.id) ?? null,
        release_date: '',
      });
      const upcoming = lineup.upcoming.map((i) => toLottery(i, 'upcoming'));
      // 官方「販售中」會一路列到很舊的商品：取最新 RECENT_RELEASED 款，加上全家還有貨的
      const released = lineup.released
        .map((i) => toLottery(i, 'released'))
        .filter((l, idx) => idx < RECENT_RELEASED || (l.fm?.stores ?? 0) > 0);
      const lineupIds = new Set([...lineup.upcoming, ...lineup.released].map((i) => i.id));
      const orphans = fm.products
        .filter((p) => p.stores > 0 && !(p.jp_id && lineupIds.has(p.jp_id)))
        .map((p) => ({ id: `fm-${p.code}`, name_ja: p.short, image_url: null, placeholder: p.series, status: 'released', fm: p, release_date: '' }));
      return {
        lotteries: [...upcoming, ...released, ...orphans],
        prefectures: TW_CITIES.map((c) => ({ code: c, name_ja: c, name_zh: c })),
        updatedAt: fm.source_updated ? new Date(fm.source_updated) : new Date(fm.scraped_at),
        checkedAt: new Date(fm.scraped_at),
      };
    },
    async loadShops(id, lottery) {
      const code = lottery?.fm?.code;
      if (!code) return [];
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
    noShopsStatus: (l) => (l.status === 'upcoming'
      ? '還沒開賣，開賣後會顯示全家有貨的門市'
      : '全家沒有這款的庫存資料，可能只在官方認證店販售'),
    pickerGroups(lotteries) {
      return [
        // 找店頁：全家查得到有貨門市的排前面，其餘照官方順序（新的在前）
        ['販售中', 'On sale', lotteries.filter((l) => l.status === 'released')
          .sort((a, b) => Number((b.fm?.stores ?? 0) > 0) - Number((a.fm?.stores ?? 0) > 0))],
        ['即將開賣', 'Coming soon', lotteries.filter((l) => l.status === 'upcoming')],
      ];
    },
    card(l) {
      const fm = l.fm;
      const sub = l.status === 'upcoming' ? '開賣日以官方公告為準'
        : !fm ? '全家沒有販售'
        : fm.stores > 0 ? `全家 ${fm.stores} 家・剩 ${fm.qty.toLocaleString()} 籤`
        : '全家已售完';
      const official = l.id.startsWith('fm-') ? null : l.id;
      return {
        image: l.image_url,
        placeholder: l.placeholder,
        pill: l.status === 'upcoming' ? { text: '即將開賣', kind: 'red' } : { text: '販售中', kind: 'dark' },
        name: l.name_ja,
        sub,
        moreHref: !official ? null
          : scheduleIds.has(official) ? `kuji?id=${encodeURIComponent(official)}`
          : `https://1kuji.com/areas/tw/products/${encodeURIComponent(official)}`,
      };
    },
    searchBlob: (l) => `${buildSearchBlob(l)} ${l.fm?.short ?? ''} ${l.fm?.series ?? ''}`.toLowerCase(),
    shopBadge: (shop) => (shop.qty > 0 ? { text: `剩 ${shop.qty} 籤`, low: shop.qty <= LOW_QTY } : null),
    mapsQuery: (shop) => `${shop.name} ${shop.address}`,
    shopLine: () => '',
    // 同一區裡剩越少的排越前面（越接近最後賞）
    compareInGroup: (a, b) => (a.qty ?? 0) - (b.qty ?? 0),
    csvFilename(lottery, pref, cities) {
      const clean = lottery.name_ja.replace(/^一番くじ\s*/, '').replace(/[\\/:*?"<>|]/g, '_');
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
