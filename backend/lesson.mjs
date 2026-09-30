import { buildPrompt } from './context.mjs';
import { getSessionState, saveTurn, setSessionState } from './memory.mjs';
import { generateJSON } from './llm.mjs';
import fs from 'node:fs/promises';

const reasons = {
  outside_topic: 'This lecture covers diffraction. Please ask Sir Mahad about that other topic.',
  insufficient_source: 'The selected lecture does not give enough evidence. Please ask Sir Mahad.',
  conflicting_source: 'The lecture evidence conflicts. Please ask Sir Mahad to resolve it.',
  personal_judgement: 'That requires Sir Mahad’s own judgement.'
};

export const escalate = (reason) => ({
  status: 'escalate',
  reason,
  answer: reasons[reason] || reasons.insufficient_source,
  citations: [],
  check: null,
  board: null,
  speech_text: reasons[reason] || reasons.insufficient_source
});

export function validateLesson(o, corpus, allowedIds) {
  if (o.status === 'escalate') return escalate(reasons[o.reason] ? o.reason : 'insufficient_source');
  const ids = [...new Set(o.source_ids || [])];
  if (o.status !== 'answer' || !ids.length || ids.some(id => !allowedIds.includes(id))) {
    throw Error('The agent did not provide valid lecture citations.');
  }
  const cited = ids.map(id => corpus.passages.find(p => p.id === id));
  if (cited.some(p => !p || p.conflict)) return escalate('conflicting_source');
  
  const t = (s, n) => typeof s === 'string' ? s.trim().slice(0, n) : '';
  if (!t(o.answer, 1400) || !t(o.check_question, 300) || !t(o.check_answer, 400)) {
    throw Error('The agent omitted part of the lesson.');
  }
  
  const clamp = (v, a, b) => Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a;
  
  return {
    status: o.status,
    answer: t(o.answer, 1400),
    speech_text: t(o.speech_text, 1400) || t(o.answer, 1400),
    citations: cited.map(p => ({
      id: p.id,
      title: p.title,
      start: p.start,
      time: p.time,
      url: `/api/passage?id=${p.id}`,
      excerpt: p.text
    })),
    check: {
      question: t(o.check_question, 300),
      solution: t(o.check_answer, 400),
      speech: t(o.check_speech, 400) || t(o.check_question, 300)
    },
    board: {
      title: t(o.board?.title, 100),
      steps: (Array.isArray(o.board?.steps) ? o.board.steps : []).slice(0, 4).map(s => t(s, 180)),
      equation: t(o.board?.equation, 120),
      diagram: (Array.isArray(o.board?.diagram) ? o.board.diagram : []).slice(0, 30)
        .filter(p => ['line', 'arrow', 'circle', 'arc', 'text'].includes(p.type))
        .map(p => ({
          type: p.type,
          x: clamp(p.x, 0, 100),
          y: clamp(p.y, 0, 100),
          x2: clamp(p.x2, 0, 100),
          y2: clamp(p.y2, 0, 100),
          radius: clamp(p.radius, 0, 70),
          startAngle: clamp(p.startAngle, -360, 360),
          endAngle: clamp(p.endAngle, -360, 360),
          text: t(p.text, 60)
        }))
    },
    provider: 'local-llm'
  };
}

const lessonSchema = {
  type: "object",
  required: ["status", "answer", "speech_text"],
  properties: {
    status: { type: "string", enum: ["answer", "escalate", "clarify", "feedback", "greeting"] },
    reason: { type: "string" },
    answer: { type: "string" },
    speech_text: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
    check_question: { type: "string" },
    check_answer: { type: "string" },
    check_speech: { type: "string" },
    board: {
      type: "object",
      properties: {
        title: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        equation: { type: "string" },
        diagram: { type: "array", items: { type: "object" } }
      }
    }
  }
};

export async function teach(question, options = {}) {
  const state = await getSessionState();
  const q = question.toLowerCase();
  if (/\b(salary|wife|married|javeria|hassam|parents|should i quit|personal opinion)\b/.test(q)) {
    return escalate('personal_judgement');
  }
  
  const { messages, metadata } = await buildPrompt(question, options);
  if (!metadata.loadedTopic) {
    return escalate('outside_topic');
  }
  
  const output = await generateJSON(messages, lessonSchema, { signal: options.signal });
  
  let corpus = { passages: [] };
  try {
    const p = metadata.loadedTopic.passagesFile || 'data/passages.json';
    corpus = JSON.parse(await fs.readFile(new URL('../' + p, import.meta.url), 'utf8'));
  } catch (e) {}
  
  const validated = validateLesson(output, corpus, metadata.passageIds);
  
  await saveTurn({ role: 'user', content: question, sessionId: state.sessionId, timestamp: new Date().toISOString() });
  await saveTurn({ role: 'assistant', content: validated.answer, sessionId: state.sessionId, timestamp: new Date().toISOString() });
  
  const newState = await getSessionState();
  newState.currentTopic = metadata.loadedTopic.id;
  newState.pendingCheck = { question: validated.check?.question, solution: validated.check?.solution };
  await setSessionState(newState);
  
  return validated;
}
