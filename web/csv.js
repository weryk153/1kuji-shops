export function csvEscape(field) {
  if (/[",\r\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

export function generateCsv(shops) {
  const rows = [['Name', 'Address']];
  for (const s of shops) rows.push([s.name, s.address]);
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export function generateFilename(lottery, pref) {
  const cleanName = lottery.name_ja
    .replace(/^一番くじ\s*/, '')
    .replace(/[\\\/:*?"<>|]/g, '_');
  return `一番くじ_${cleanName}_${pref.name_ja}_${lottery.release_date}発売_店舗リスト.csv`;
}
