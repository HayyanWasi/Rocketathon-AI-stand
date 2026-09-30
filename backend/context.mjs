import fs from 'node:fs/promises';
import { selectTopic, selectSkills, rankPassages } from './retrieval.mjs';
import { loadRelevantContext } from './memory.mjs';

const root = new URL('../', import.meta.url);
export const readJSON = async (name) => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));

let baseCache = null;

export async function loadBase() {
  if (baseCache) return baseCache;
  
  let persona = 'You are an AI physics teacher.';
  try { persona = await fs.readFile(new URL('teacher/AGENT.md', root), 'utf8'); } catch(e) {}
  
  let skillIndex = [];
  try { skillIndex = await readJSON('skills/index.json'); } catch(e) {}
  
  let syllabusIndex = { chapters: [] };
  try { 
    syllabusIndex = await readJSON('syllabus/index.json');
    for (const chapter of syllabusIndex.chapters) {
      try {
        const c = await readJSON(`syllabus/${chapter.id}/index.json`);
        chapter.topics = c.topics;
      } catch(e) {
        chapter.topics = [];
      }
    }
  } catch(e) {}
  
  baseCache = { persona, skillIndex, syllabusIndex };
  return baseCache;
}

export async function buildPrompt(question, options = {}) {
  const { persona, skillIndex, syllabusIndex } = await loadBase();
  const { sessionState, profile, progress, relevantMemories, recentTurns } = await loadRelevantContext(question, null);
  
  const topic = selectTopic(question, syllabusIndex, sessionState);
  const loadedSkills = selectSkills(question, skillIndex);
  
  let passages = [];
  let topicNotes = '';
  if (topic) {
    try {
      const topicData = await readJSON(topic.passagesFile || 'data/passages.json');
      passages = rankPassages(question, topicData.passages || []);
    } catch(e) {}
    try {
      topicNotes = await fs.readFile(new URL(`syllabus/${topic.chapter || topic.id.split('-')[0]}/${topic.id}/lesson.md`, root), 'utf8');
    } catch(e) {}
  }
  
  const ctx = await loadRelevantContext(question, topic ? topic.id : null);
  
  let skillInst = '';
  for (const s of loadedSkills) {
    try {
      skillInst += await fs.readFile(new URL(`skills/${s}/SKILL.md`, root), 'utf8') + '\n';
    } catch(e) {}
  }
  
  let systemMsg = `${persona}\n\n`;
  if (skillInst) systemMsg += `[SKILL INSTRUCTIONS]\n${skillInst}\n`;
  if (topicNotes) systemMsg += `[TOPIC NOTES]\n${topicNotes}\n`;
  
  systemMsg += `[STUDENT CONTEXT]\nName: ${ctx.profile.name}\nQualification: ${ctx.profile.qualification}\n`;
  if (ctx.progress) systemMsg += `Progress: Attempted ${ctx.progress.conceptsAttempted.length} concepts.\n`;
  if (ctx.relevantMemories.length > 0) systemMsg += `Memories: ${ctx.relevantMemories.map(m => m.summary).join('; ')}\n`;
  
  const history = ctx.recentTurns.map(t => `${t.role}: ${t.content}`).join('\n');
  
  const userMsg = `LECTURE EVIDENCE:
${passages.map(p => `[${p.id}] ${p.title}: ${p.text}`).join('\n')}

STUDENT QUESTION: ${question}

Return ONLY JSON with these fields:
- status: "answer"|"escalate"|"clarify"|"feedback"|"greeting"
- reason: escalation reason if status is escalate
- answer: Roman Urdu display text with English physics terms (2-4 sentences)
- speech_text: Same content in Urdu script for TTS. Tag English terms with <en>...</en>
- source_ids: array of passage IDs cited
- check_question: one short comprehension check
- check_answer: expected answer
- check_speech: Urdu script version of check_question  
- board: {title, steps: ["step 1", ...], equation: "", diagram: [{type, x, y, ...}]}

Cite only supplied passage IDs. Generate fresh board content. Escalate if evidence insufficient.`;

  let contextTokens = (systemMsg.length + userMsg.length) / 3.5;
  // Simplified token budgeting for this implementation

  return {
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg }
    ],
    metadata: { loadedSkills, loadedTopic: topic, contextTokens, passageIds: passages.map(p=>p.id) }
  };
}
