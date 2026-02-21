/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Parses all source question data and generates SQL migration files
 * for seeding into the question_banks table.
 *
 * Usage: node scripts/generate-seed-sql.js
 * Output: scripts/sql/*.sql files
 */

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'sql');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

/** Escape single quotes for SQL */
function esc(s) {
  return s.replace(/'/g, "''");
}

// ─────────────────────────────────────────────────────
// C1: Monosyllabic characters with pinyin
// ─────────────────────────────────────────────────────
function parseC1() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'monosyllabic_pinyin.md'), 'utf8');
  const entries = [];
  const re = /([\u4e00-\u9fff])\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    entries.push({ char: m[1], pinyin: m[2].trim() });
  }
  console.log(`C1: parsed ${entries.length} characters`);

  // Split into batches of 200 for manageable migration sizes
  const batches = [];
  for (let i = 0; i < entries.length; i += 200) {
    batches.push(entries.slice(i, i + 200));
  }

  batches.forEach((batch, idx) => {
    const startSet = idx * 200 + 1;
    const values = batch.map((e, i) =>
      `(1, ${startSet + i}, '${esc(e.char)}', '${esc(e.pinyin)}', NULL)`
    ).join(',\n');
    const sql = `-- C1 monosyllabic characters batch ${idx + 1}\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${values};\n`;
    fs.writeFileSync(path.join(outDir, `c1_batch${idx + 1}.sql`), sql);
  });
  return entries.length;
}

// ─────────────────────────────────────────────────────
// C2: Multisyllabic words with pinyin
// ─────────────────────────────────────────────────────
function parseC2() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'multisyllabic_pinyin.md'), 'utf8');

  // Strategy: extract all char(pinyin) pairs, then reconstruct words
  // The file has words like 国王(guo2 wang2), but some words split across lines:
  // e.g., "一辈(yi1 bei4)\n子(zi5)" should be "一辈子(yi1 bei4 zi5)"

  // First, get the word list from egquestions.md (Set 1 which has the canonical word list)
  const egRaw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'egquestions.md'), 'utf8');

  // Extract C2 Set 1 words (between "### Set 1" and next section)
  const set1Match = egRaw.match(/### Set 1[\s\S]*?```text\n([\s\S]*?)```/);
  const wordList = set1Match ? set1Match[1].trim().split(/\s+/).filter(w => /[\u4e00-\u9fff]/.test(w)) : [];

  // Now parse the pinyin file: extract all char-pinyin pairs in sequence
  const lines = raw.split('\n').slice(2); // skip header
  const pairs = []; // { char, pinyin }
  for (const line of lines) {
    const re = /([\u4e00-\u9fff]+)\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      // Some entries have multi-char like 国王(guo2 wang2) - split chars
      const chars = [...m[1]];
      const syllables = m[2].trim().split(/\s+/);
      for (let i = 0; i < chars.length; i++) {
        pairs.push({ char: chars[i], pinyin: syllables[i] || '' });
      }
    }
  }

  // Build word list from the pinyin file directly by matching against known words
  // Actually, let's use a simpler approach: the pinyin file format is
  // word(pinyin) where word can be 2-4 chars, but line breaks can split them
  // Let's re-parse more carefully

  // Join all text after header, remove line breaks
  const allText = lines.join(' ');
  const wordRe = /([\u4e00-\u9fff\u5140-\u9FFF]{1,6})\(([^)]+)\)/g;
  const rawWords = [];
  let wm;
  while ((wm = wordRe.exec(allText)) !== null) {
    rawWords.push({ word: wm[1], pinyin: wm[2].trim() });
  }

  // Now we need to reconstruct split words.
  // A split word is when a multi-char word gets broken so only part has pinyin on one line
  // e.g., "一辈(yi1 bei4)" followed by "子(zi5)" should be "一辈子(yi1 bei4 zi5)"
  // Known compound words from the word list help us decide when to merge

  // Build a set of known words for lookup
  const knownWords = new Set(wordList);

  const mergedWords = [];
  let i = 0;
  while (i < rawWords.length) {
    const curr = rawWords[i];
    // Check if merging with next makes a known word
    if (i + 1 < rawWords.length) {
      const merged2 = curr.word + rawWords[i + 1].word;
      if (i + 2 < rawWords.length) {
        const merged3 = merged2 + rawWords[i + 2].word;
        if (knownWords.has(merged3)) {
          mergedWords.push({
            word: merged3,
            pinyin: curr.pinyin + ' ' + rawWords[i + 1].pinyin + ' ' + rawWords[i + 2].pinyin
          });
          i += 3;
          continue;
        }
      }
      if (knownWords.has(merged2)) {
        mergedWords.push({
          word: merged2,
          pinyin: curr.pinyin + ' ' + rawWords[i + 1].pinyin
        });
        i += 2;
        continue;
      }
    }
    mergedWords.push(curr);
    i++;
  }

  console.log(`C2: parsed ${mergedWords.length} words (raw: ${rawWords.length} fragments)`);

  // Generate SQL
  const values = mergedWords.map((e, i) =>
    `(2, ${i + 1}, '${esc(e.word)}', '${esc(e.pinyin)}', NULL)`
  ).join(',\n');
  const sql = `-- C2 multisyllabic words\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${values};\n`;
  fs.writeFileSync(path.join(outDir, 'c2.sql'), sql);
  return mergedWords.length;
}

// ─────────────────────────────────────────────────────
// C3: Vocabulary/grammar judgment questions
// ─────────────────────────────────────────────────────
function parseC3() {
  // Parse existing questions from egquestions.md
  const egRaw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'egquestions.md'), 'utf8');

  // --- C3A: Word-choice (词语判断) ---
  // Format: "N standard / dialectal"
  const wcSection = egRaw.match(/### 3A 词语判断[\s\S]*?```text\n([\s\S]*?)```/);
  const wcExisting = [];
  if (wcSection) {
    const lines = wcSection[1].trim().split('\n');
    for (const line of lines) {
      const m = line.match(/^\d+\s+(.+?)\s+\/\s+(.+)/);
      if (m) {
        const standard = m[1].trim();
        const dialect = m[2].trim();
        // Randomly place correct answer (but keep it as index 0 for consistency,
        // the frontend will shuffle options)
        wcExisting.push({
          prompt: 'Which is more standard Putonghua?',
          options: [standard, dialect],
          correctIndex: 0,
          explanation: `'${standard}' is standard Putonghua; '${dialect}' is dialectal/non-standard.`
        });
      }
    }
  }
  console.log(`C3A existing: ${wcExisting.length} word-choice questions`);

  // Load generated additional word-choice questions
  const wcGenerated = JSON.parse(fs.readFileSync(path.join(__dirname, 'generated-c3-wordchoice.json'), 'utf8'));
  const allWC = [...wcExisting, ...wcGenerated];
  console.log(`C3A total: ${allWC.length} word-choice questions`);

  // --- C3B: Measure-word (量词搭配) ---
  // The egquestions.md only has prompts like "一___椅子", no answer options
  // Load fully formatted questions from generated file
  const mwGenerated = JSON.parse(fs.readFileSync(path.join(__dirname, 'generated-c3-measureword.json'), 'utf8'));

  // Also parse the existing measure-word prompts and generate proper questions
  const mwSection = egRaw.match(/### 3B 量词名词搭配[\s\S]*?```text\n([\s\S]*?)```/);
  const mwExisting = [];
  if (mwSection) {
    const lines = mwSection[1].trim().split('\n');
    // These only have prompts, we need to generate options
    // The measure word answers for common nouns
    const mwAnswers = {
      '椅子': { correct: '把', options: ['把', '个', '条', '张'] },
      '桌子': { correct: '张', options: ['张', '个', '条', '把'] },
      '纸': { correct: '张', options: ['张', '片', '条', '块'] },
      '狗': { correct: '只', options: ['只', '条', '个', '头'] },
      '猫': { correct: '只', options: ['只', '个', '条', '头'] },
      '鱼': { correct: '条', options: ['条', '只', '个', '尾'] },
      '车': { correct: '辆', options: ['辆', '台', '个', '部'] },
      '自行车': { correct: '辆', options: ['辆', '台', '个', '部'] },
      '公交车': { correct: '辆', options: ['辆', '台', '个', '部'] },
      '飞机': { correct: '架', options: ['架', '台', '辆', '个'] },
      '书': { correct: '本', options: ['本', '册', '个', '部'] },
      '杂志': { correct: '本', options: ['本', '份', '个', '册'] },
      '字典': { correct: '本', options: ['本', '部', '个', '册'] },
      '报纸': { correct: '份', options: ['份', '张', '本', '个'] },
      '信': { correct: '封', options: ['封', '个', '张', '份'] },
      '帽子': { correct: '顶', options: ['顶', '个', '只', '件'] },
      '鞋': { correct: '双', options: ['双', '只', '对', '个'] },
      '筷子': { correct: '双', options: ['双', '根', '把', '副'] },
      '眼镜': { correct: '副', options: ['副', '个', '双', '只'] },
      '手套': { correct: '双', options: ['双', '副', '只', '个'] },
      '裤子': { correct: '条', options: ['条', '件', '个', '双'] },
      '衣服': { correct: '件', options: ['件', '个', '条', '套'] },
      '毛衣': { correct: '件', options: ['件', '个', '条', '套'] },
      '裙子': { correct: '条', options: ['条', '件', '个', '套'] },
      '袜子': { correct: '双', options: ['双', '只', '对', '条'] },
      '水': { correct: '杯', options: ['杯', '瓶', '碗', '个'] },
      '茶': { correct: '杯', options: ['杯', '壶', '碗', '个'] },
      '咖啡': { correct: '杯', options: ['杯', '壶', '瓶', '个'] },
      '酒': { correct: '杯', options: ['杯', '瓶', '壶', '个'] },
      '汤': { correct: '碗', options: ['碗', '锅', '杯', '盆'] },
      '米饭': { correct: '碗', options: ['碗', '盘', '份', '盆'] },
      '面条': { correct: '碗', options: ['碗', '份', '盘', '根'] },
      '馒头': { correct: '个', options: ['个', '只', '块', '片'] },
      '蛋糕': { correct: '块', options: ['块', '个', '片', '份'] },
      '糖': { correct: '块', options: ['块', '颗', '粒', '个'] },
      '花': { correct: '朵', options: ['朵', '枝', '束', '棵'] },
      '云': { correct: '朵', options: ['朵', '片', '团', '块'] },
      '树': { correct: '棵', options: ['棵', '根', '个', '株'] },
      '草': { correct: '棵', options: ['棵', '根', '片', '株'] },
      '叶子': { correct: '片', options: ['片', '张', '个', '块'] },
      '河': { correct: '条', options: ['条', '道', '个', '根'] },
      '路': { correct: '条', options: ['条', '段', '个', '根'] },
      '街': { correct: '条', options: ['条', '段', '个', '根'] },
      '绳子': { correct: '根', options: ['根', '条', '段', '个'] },
      '裤带': { correct: '条', options: ['条', '根', '个', '副'] },
      '电影': { correct: '部', options: ['部', '场', '个', '片'] },
      '音乐': { correct: '首', options: ['首', '段', '个', '曲'] },
      '比赛': { correct: '场', options: ['场', '次', '个', '局'] },
      '活动': { correct: '场', options: ['场', '次', '个', '项'] },
      '会议': { correct: '场', options: ['场', '次', '个', '回'] },
      '意见': { correct: '条', options: ['条', '个', '项', '份'] },
      '办法': { correct: '个', options: ['个', '条', '种', '项'] },
      '计划': { correct: '个', options: ['个', '份', '项', '条'] },
      '工作': { correct: '份', options: ['份', '个', '项', '件'] },
      '生意': { correct: '笔', options: ['笔', '个', '桩', '份'] },
      '医院': { correct: '家', options: ['家', '个', '所', '座'] },
      '学校': { correct: '所', options: ['所', '家', '个', '座'] },
      '大学': { correct: '所', options: ['所', '家', '个', '座'] },
      '公司': { correct: '家', options: ['家', '个', '所', '间'] },
      '工厂': { correct: '家', options: ['家', '个', '座', '间'] },
      '房间': { correct: '间', options: ['间', '个', '套', '所'] },
      '教室': { correct: '间', options: ['间', '个', '所', '座'] },
      '商店': { correct: '家', options: ['家', '个', '间', '所'] },
      '餐厅': { correct: '家', options: ['家', '个', '间', '所'] },
      '旅馆': { correct: '家', options: ['家', '个', '间', '所'] },
      '钥匙': { correct: '把', options: ['把', '个', '串', '条'] },
      '刀': { correct: '把', options: ['把', '个', '条', '柄'] },
      '伞': { correct: '把', options: ['把', '个', '支', '顶'] },
      '枪': { correct: '支', options: ['支', '把', '杆', '个'] },
      '吉他': { correct: '把', options: ['把', '个', '支', '架'] },
      '灯': { correct: '盏', options: ['盏', '个', '台', '只'] },
      '床': { correct: '张', options: ['张', '个', '台', '架'] },
      '被子': { correct: '条', options: ['条', '床', '个', '块'] },
      '枕头': { correct: '个', options: ['个', '只', '条', '块'] },
      '窗户': { correct: '扇', options: ['扇', '个', '道', '面'] },
      '门': { correct: '扇', options: ['扇', '道', '个', '面'] },
      '桥': { correct: '座', options: ['座', '条', '道', '个'] },
      '山': { correct: '座', options: ['座', '个', '道', '条'] },
      '岛': { correct: '座', options: ['座', '个', '片', '块'] },
      '湖': { correct: '个', options: ['个', '片', '座', '条'] },
      '人': { correct: '个', options: ['个', '位', '名', '口'] },
      '孩子': { correct: '个', options: ['个', '位', '名', '口'] },
      '学生': { correct: '个', options: ['个', '名', '位', '口'] },
      '老师': { correct: '位', options: ['位', '个', '名', '人'] },
      '朋友': { correct: '个', options: ['个', '位', '名', '群'] },
      '队伍': { correct: '支', options: ['支', '个', '条', '队'] },
      '人群': { correct: '群', options: ['群', '堆', '帮', '个'] },
      '照片': { correct: '张', options: ['张', '个', '幅', '片'] },
      '画': { correct: '幅', options: ['幅', '张', '个', '副'] },
      '地图': { correct: '张', options: ['张', '幅', '个', '份'] },
      '电梯': { correct: '部', options: ['部', '台', '个', '架'] },
      '电脑': { correct: '台', options: ['台', '个', '部', '架'] },
      '手机': { correct: '部', options: ['部', '个', '台', '只'] },
      '电视': { correct: '台', options: ['台', '个', '部', '架'] },
      '空调': { correct: '台', options: ['台', '个', '部', '架'] },
      '电池': { correct: '节', options: ['节', '个', '块', '只'] },
      '电线': { correct: '根', options: ['根', '条', '段', '个'] },
      '问题': { correct: '个', options: ['个', '道', '条', '项'] },
      '困难': { correct: '个', options: ['个', '种', '项', '道'] },
      '机会': { correct: '个', options: ['个', '次', '种', '回'] },
    };

    for (const line of lines) {
      const m = line.match(/^\d+\s+一___([\u4e00-\u9fff]+)/);
      if (m) {
        const noun = m[1];
        if (mwAnswers[noun]) {
          const a = mwAnswers[noun];
          const correctIdx = a.options.indexOf(a.correct);
          mwExisting.push({
            prompt: `一___${noun}`,
            options: a.options,
            correctIndex: correctIdx >= 0 ? correctIdx : 0,
            explanation: `${noun}用「${a.correct}」作量词。`
          });
        }
      }
    }
  }
  console.log(`C3B existing: ${mwExisting.length} measure-word questions`);
  const allMW = [...mwExisting, ...mwGenerated];
  console.log(`C3B total: ${allMW.length} measure-word questions`);

  // --- C3C: Sentence-order (语序判断) ---
  const soSection = egRaw.match(/### 3C 语序\/表达判断[\s\S]*?```text\n([\s\S]*?)```/);
  const soExisting = [];
  if (soSection) {
    const lines = soSection[1].trim().split('\n');
    for (const line of lines) {
      const m = line.match(/^\d+A\s+(.+?)\s+\/\s+\d+B\s+(.+)/);
      if (m) {
        soExisting.push({
          prompt: 'Which sentence is correct?',
          options: [m[1].trim(), m[2].trim()],
          correctIndex: 0,
          explanation: `'${m[1].trim()}' follows standard Putonghua grammar.`
        });
      }
    }
  }
  console.log(`C3C existing: ${soExisting.length} sentence-order questions`);
  const soGenerated = JSON.parse(fs.readFileSync(path.join(__dirname, 'generated-c3-sentenceorder.json'), 'utf8'));
  const allSO = [...soExisting, ...soGenerated];
  console.log(`C3C total: ${allSO.length} sentence-order questions`);

  // Generate SQL for each C3 subtype
  function c3Values(items, type, startIdx) {
    return items.map((q, i) => {
      const meta = JSON.stringify({
        type,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation
      });
      return `(3, ${startIdx + i}, '${esc(q.prompt)}', NULL, '${esc(meta)}'::jsonb)`;
    }).join(',\n');
  }

  // Word-choice - split into batches of 100
  for (let b = 0; b < Math.ceil(allWC.length / 100); b++) {
    const batch = allWC.slice(b * 100, (b + 1) * 100);
    const sql = `-- C3 word-choice batch ${b + 1}\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${c3Values(batch, 'word-choice', b * 100 + 1)};\n`;
    fs.writeFileSync(path.join(outDir, `c3_wc_batch${b + 1}.sql`), sql);
  }

  // Measure-word - split into batches of 100
  for (let b = 0; b < Math.ceil(allMW.length / 100); b++) {
    const batch = allMW.slice(b * 100, (b + 1) * 100);
    const startSet = 1000 + b * 100 + 1; // offset to avoid collisions
    const sql = `-- C3 measure-word batch ${b + 1}\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${c3Values(batch, 'measure-word', startSet)};\n`;
    fs.writeFileSync(path.join(outDir, `c3_mw_batch${b + 1}.sql`), sql);
  }

  // Sentence-order
  const soSql = `-- C3 sentence-order\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${c3Values(allSO, 'sentence-order', 2001)};\n`;
  fs.writeFileSync(path.join(outDir, 'c3_so.sql'), soSql);

  return { wc: allWC.length, mw: allMW.length, so: allSO.length };
}

// ─────────────────────────────────────────────────────
// C4: Reading passages
// ─────────────────────────────────────────────────────
function parseC4() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'component4.md'), 'utf8');

  // Split by --- separator
  const sections = raw.split(/\n---\n/).filter(s => s.trim());
  const passages = [];

  for (const section of sections) {
    const titleMatch = section.match(/^##\s+(.+)/m);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    // Get content after the title line, clean up
    let content = section.substring(section.indexOf('\n', section.indexOf(titleMatch[0])) + 1).trim();
    // Remove // page break markers
    content = content.replace(/\/\//g, '');
    // Remove attribution lines (——节选自...)
    // Keep them as they're part of the reading
    // Clean up extra whitespace
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    if (content.length > 10) {
      passages.push({ title, content });
    }
  }

  console.log(`C4: parsed ${passages.length} passages`);

  // Split into batches of 10 for manageable migration sizes (passages are long)
  const batches = [];
  for (let i = 0; i < passages.length; i += 10) {
    batches.push(passages.slice(i, i + 10));
  }

  batches.forEach((batch, idx) => {
    const startSet = idx * 10 + 1;
    const values = batch.map((p, i) => {
      const meta = JSON.stringify({ title: p.title });
      return `(4, ${startSet + i}, '${esc(p.content)}', NULL, '${esc(meta)}'::jsonb)`;
    }).join(',\n');
    const sql = `-- C4 passages batch ${idx + 1}\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${values};\n`;
    fs.writeFileSync(path.join(outDir, `c4_batch${idx + 1}.sql`), sql);
  });

  return passages.length;
}

// ─────────────────────────────────────────────────────
// C5: Speaking topics (additional 50)
// ─────────────────────────────────────────────────────
function parseC5() {
  // Parse existing topics from egquestions.md
  const egRaw = fs.readFileSync(path.join(__dirname, '..', 'doc', 'ExampleQuestions', 'egquestions.md'), 'utf8');
  const topicSection = egRaw.match(/### A\) 200题题库[\s\S]*?```text\n([\s\S]*?)```/);
  const existing = [];
  if (topicSection) {
    const lines = topicSection[1].trim().split('\n');
    for (const line of lines) {
      const m = line.match(/^\d+\s+(.+)/);
      if (m) {
        existing.push(m[1].trim());
      }
    }
  }
  console.log(`C5 existing from doc: ${existing.length} topics`);

  // Load generated additional topics
  const generated = JSON.parse(fs.readFileSync(path.join(__dirname, 'generated-c5-topics.json'), 'utf8'));

  // DB already has 100 topics (set_number 1-100), so we need to check
  // We'll generate SQL for ALL topics and let the migration handle dedup
  // Actually, we'll just insert everything fresh - the migration will clear first

  const allTopics = [...existing, ...generated];
  // Deduplicate
  const uniqueTopics = [...new Set(allTopics)];
  console.log(`C5 total unique: ${uniqueTopics.length} topics`);

  const values = uniqueTopics.map((t, i) =>
    `(5, ${i + 1}, '${esc(t)}', NULL, NULL)`
  ).join(',\n');
  const sql = `-- C5 speaking topics (delete existing first to avoid dupes)\nDELETE FROM question_banks WHERE component = 5;\nINSERT INTO question_banks (component, set_number, content, pinyin, metadata) VALUES\n${values};\n`;
  fs.writeFileSync(path.join(outDir, 'c5.sql'), sql);
  return uniqueTopics.length;
}

// ─────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────
console.log('Generating SQL migration files...\n');
const c1Count = parseC1();
const c2Count = parseC2();
const c3Counts = parseC3();
const c4Count = parseC4();
const c5Count = parseC5();

console.log('\n=== Summary ===');
console.log(`C1: ${c1Count} characters`);
console.log(`C2: ${c2Count} words`);
console.log(`C3: ${c3Counts.wc} word-choice + ${c3Counts.mw} measure-word + ${c3Counts.so} sentence-order = ${c3Counts.wc + c3Counts.mw + c3Counts.so}`);
console.log(`C4: ${c4Count} passages`);
console.log(`C5: ${c5Count} topics`);
console.log(`\nSQL files written to: ${outDir}`);
