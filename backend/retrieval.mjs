export function tokenize(text) {
  if (!text) return [];
  const stopwords = new Set(['hai', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'par', 'aur', 'ye', 'wo', 'kya', 'toh', 'bhi', 'ho', 'na']);
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopwords.has(w));
}

export function selectTopic(question, index, sessionState = null) {
  const tokens = tokenize(question);
  if (tokens.length === 0) return null;
  
  let allTopics = [];
  for (const chapter of (index?.chapters || [])) {
    for (const topic of (chapter.topics || [])) {
      allTopics.push({ ...topic, chapter: chapter.id });
    }
  }
  
  if (sessionState?.currentTopic && tokens.length < 4) {
    const currentTopicObj = allTopics.find(t => t.id === sessionState.currentTopic);
    if (currentTopicObj) return currentTopicObj;
  }
  
  const matches = allTopics.map(topic => {
    let score = 0;
    const topicTokens = new Set([
      ...tokenize(topic.title), 
      ...(topic.aliases || []).flatMap(tokenize), 
      ...(topic.keywords || []).flatMap(tokenize)
    ]);
    for (const t of tokens) {
      if (topicTokens.has(t)) score++;
    }
    return { topic, score };
  }).sort((a, b) => b.score - a.score);
  
  return matches.length > 0 && matches[0].score > 0 ? matches[0].topic : null;
}

export function rankPassages(question, passages, limit = 4) {
  const tokens = tokenize(question);
  if (tokens.length === 0) return [];
  
  const matches = passages.map(p => {
    let score = 0;
    const docTokens = [
      ...tokenize(p.title), 
      ...tokenize(p.text), 
      ...(p.keywords || []).flatMap(tokenize)
    ];
    const docTokenSet = new Set(docTokens);
    for (const t of tokens) {
      if (docTokenSet.has(t)) score++;
    }
    return { passage: p, score };
  }).filter(m => m.score >= 1).sort((a, b) => b.score - a.score);
  
  return matches.slice(0, limit).map(m => m.passage);
}

export function selectSkills(question, skillIndex) {
  const tokens = tokenize(question);
  const selected = new Set();
  
  for (const skill of (skillIndex || [])) {
    const skillTokens = new Set((skill.keywords || []).flatMap(tokenize));
    for (const t of tokens) {
      if (skillTokens.has(t)) {
        selected.add(skill.id);
        break;
      }
    }
  }
  
  const qStr = String(question).toLowerCase();
  if (/\b(draw|diagram|sketch)\b/.test(qStr)) selected.add('draw-diagram');
  if (/\b(marks|exam|paper)\b/.test(qStr)) selected.add('exam-coaching');
  if (/\b(galat|wrong|mistake|nahi)\b/.test(qStr)) selected.add('correct-misconception');
  
  return Array.from(selected);
}
