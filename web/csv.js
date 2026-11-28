export function csvEscape(field) {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

export function generateCsv(shops) {
  const hasCity = shops.some((s) => s.city);
  const header = hasCity ? ['Name', 'City', 'Address'] : ['Name', 'Address'];
  const rows = [header];
  for (const s of shops) {
    rows.push(hasCity ? [s.name, s.city || '', s.address] : [s.name, s.address]);
  }
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export function generateFilename(lottery, pref, cities) {
  const cleanName = lottery.name_ja
    .replace(/^一番くじ\s*/, '')
    .replace(/[\\\/:*?"<>|]/g, '_');
  let region = pref.name_ja;
  if (cities && cities.length > 0 && cities.length <= 3) {
    region = `${pref.name_ja}_${cities.join('_')}`;
  } else if (cities && cities.length > 3) {
    region = `${pref.name_ja}_${cities.length}市区町村`;
  }
  return `一番くじ_${cleanName}_${region}_${lottery.release_date}発売_店舗リスト.csv`;
}
