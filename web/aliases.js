// 一番賞作品中文/英文別名對照
// key 是日文標題的子字串（會用 includes 比對），value 是該作品在中文圈常見的譯名與英文名
// 用於搜尋：lottery.name_ja 包含 key → 把對應的別名加入 search blob
// 搜尋「海賊」可命中「ワンピース（海賊王 / 航海王）」

const ALIASES = [
  // 少年漫畫/王道
  ['ワンピース', ['海賊王', '航海王', 'One Piece', 'onepiece']],
  ['ドラゴンボール', ['七龍珠', '龍珠', '七龙珠', 'Dragon Ball', 'dragonball']],
  ['呪術廻戦', ['咒術迴戰', '咒術回戰', 'Jujutsu Kaisen']],
  ['進撃の巨人', ['進擊的巨人', '进击的巨人', 'Attack on Titan', 'AOT']],
  ['鬼滅の刃', ['鬼滅之刃', '鬼灭之刃', 'Demon Slayer', 'Kimetsu']],
  ['機動戦士ガンダム', ['機動戰士鋼彈', '高達', '钢弹', 'Gundam']],
  ['ジョジョ', ['JoJo', '喬喬', '乔乔', '奇妙冒險']],
  ['ブルーロック', ['藍色監獄', '蓝色监狱', '藍鎖', 'Blue Lock', 'bluelock']],
  ['ブルーアーカイブ', ['蔚藍檔案', '碧蓝档案', 'Blue Archive']],
  ['キングダム', ['王者天下', '春秋戰國大戰', 'Kingdom']],
  ['WIND BREAKER', ['防風少年', 'WindBreaker', 'WB']],
  ['葬送のフリーレン', ['葬送的芙莉蓮', '葬送的芙莉莲', 'Frieren']],
  ['フリーレン', ['芙莉蓮', '芙莉莲', 'Frieren']],
  ['NIKKE', ['勝利女神', '胜利女神', 'NIKKE']],
  ['勝利の女神', ['勝利女神', '胜利女神', 'NIKKE']],
  ['モンスターストライク', ['怪物彈珠', '怪物弹珠', 'Monster Strike', 'monst']],
  ['メダリスト', ['金牌得主', 'Medalist']],

  // 任天堂 / 馬力歐家族
  ['星のカービィ', ['星之卡比', '星のカービィ', 'Kirby']],
  ['カービィ', ['卡比', 'Kirby']],
  ['マリオ', ['瑪利歐', '瑪莉歐', '马里奥', 'Mario']],
  ['スーパーマリオ', ['瑪利歐', '超級瑪利歐', 'Super Mario']],
  ['どうぶつの森', ['動物森友會', '动物森友会', '動物之森', 'Animal Crossing', 'doubutsu']],

  // 兒童 / 美卡通
  ['たまごっち', ['電子雞', '塔麻可吉', '塔麻哥吉', 'Tamagotchi']],
  ['スポンジ・ボブ', ['海綿寶寶', '海绵宝宝', 'SpongeBob', 'spongebob']],
  ['スポンジボブ', ['海綿寶寶', '海绵宝宝', 'SpongeBob', 'spongebob']],
  ['トムとジェリー', ['湯姆貓與傑利鼠', '湯姆貓', '貓和老鼠', 'Tom and Jerry', 'tomandjerry']],
  ['パワーパフ ガールズ', ['飛天小女警', '飞天小女警', 'Powerpuff Girls', 'PPG']],
  ['パンどろぼう', ['麵包小偷', '面包小偷']],
  ['お文具といっしょ', ['文具公司', '文具']],
  ['歌川一門', ['歌川派', '歌川一門']],

  // 偶像 / 音樂
  ['FRUITS ZIPPER', ['水果拉鍊', 'Fruits Zipper']],

  // 雜
  ['魔法の天使クリィミーマミ', ['魔法天使', 'Creamy Mami']],
  ['魔法の姉妹', ['魔法姊妹']],
  ['THE CHRONICLE OF GOKU', ['悟空傳', '孙悟空', 'Goku']],
];

export function buildSearchBlob(lottery) {
  const parts = [lottery.name_ja, lottery.id || ''];
  const name = lottery.name_ja || '';
  for (const [jp, alts] of ALIASES) {
    if (name.includes(jp)) parts.push(...alts);
  }
  return parts.join(' ').toLowerCase();
}
