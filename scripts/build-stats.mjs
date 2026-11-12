// 建置時從 data/shops/*.json 算各一番賞的販售店數與售完數，寫到 web/data/stats.json
// 給排名頁用（瀏覽器不用為了排名下載上萬筆店舖資料）
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SHOPS_DIR = 'data/shops';
const out = { generated_at: new Date().toISOString(), lotteries: {} };
for (const f of await readdir(SHOPS_DIR)) {
  if (!f.endsWith('.json')) continue;
  const data = JSON.parse(await readFile(join(SHOPS_DIR, f), 'utf8'));
  const shops = data.shops || [];
  const prefs = new Set(shops.map((s) => s.prefecture_code));
  out.lotteries[data.lottery_id] = {
    shops: shops.length,
    soldout: shops.filter((s) => s.sellout_flag === 1).length,
    prefectures: prefs.size,
    scraped_at: data.scraped_at,
  };
}
await writeFile('web/data/stats.json', JSON.stringify(out) + '\n');
console.log(`stats: ${Object.keys(out.lotteries).length} lotteries`);
