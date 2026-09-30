import fs from 'node:fs/promises';
import path from 'node:path';

const studentDir = new URL('../runtime/student/', import.meta.url);

async function ensureDir(dirUrl) {
  await fs.mkdir(dirUrl, { recursive: true });
}

async function writeAtomic(fileUrl, data) {
  await ensureDir(new URL('./', fileUrl));
  const tmpUrl = new URL(fileUrl.pathname + '.tmp', fileUrl);
  await fs.writeFile(tmpUrl, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  await fs.rename(tmpUrl, fileUrl);
}

async function readJSON(fileUrl, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(fileUrl, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw e;
  }
}

export async function getProfile() {
  return readJSON(new URL('profile.json', studentDir), {
    name: 'Student',
    qualification: 'O Level',
    language: 'Roman Urdu',
    goals: [],
    preferences: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export async function updateProfile(fields) {
  const profile = await getProfile();
  const updated = { ...profile, ...fields, updatedAt: new Date().toISOString() };
  await writeAtomic(new URL('profile.json', studentDir), updated);
  return updated;
}

export async function getSessionState() {
  return readJSON(new URL('session-state.json', studentDir), {
    currentTopic: null,
    recentTurns: [],
    pendingCheck: null,
    lastActivity: new Date().toISOString(),
    sessionId: Date.now().toString()
  });
}

export async function setSessionState(state) {
  state.lastActivity = new Date().toISOString();
  await writeAtomic(new URL('session-state.json', studentDir), state);
}

export async function clearSession() {
  const state = await getSessionState();
  state.recentTurns = [];
  state.pendingCheck = null;
  state.sessionId = Date.now().toString();
  await setSessionState(state);
}

export async function loadRelevantContext(question, topicId = null) {
  const profile = await getProfile();
  const sessionState = await getSessionState();
  let progress = null;
  if (topicId) {
    progress = await readJSON(new URL(`progress/${topicId}.json`, studentDir), {
      topicId,
      conceptsAttempted: [],
      misconceptions: [],
      successfulAnswers: [],
      hintsNeeded: 0,
      suggestedNext: null,
      lastAttempt: null
    });
  }
  
  const memoryIndex = await readJSON(new URL('memories/index.json', studentDir), []);
  let relevantMemories = [];
  for (const mRef of memoryIndex) {
    if (relevantMemories.length >= 3) break;
    if (topicId && mRef.topicId === topicId) {
      relevantMemories.push(await readJSON(new URL(`memories/${mRef.id}.json`, studentDir)));
    }
  }
  
  return { profile, progress, recentTurns: sessionState.recentTurns, relevantMemories, sessionState };
}

export async function saveTurn(turn) {
  const state = await getSessionState();
  state.recentTurns.push(turn);
  if (state.recentTurns.length > 6) state.recentTurns = state.recentTurns.slice(-6);
  await setSessionState(state);
  
  const logUrl = new URL(`sessions/${state.sessionId}.jsonl`, studentDir);
  await ensureDir(new URL('./', logUrl));
  await fs.appendFile(logUrl, JSON.stringify(turn) + '\n');
}

export async function updateProgress(topicId, observation) {
  if (!topicId) return;
  const pUrl = new URL(`progress/${topicId}.json`, studentDir);
  const progress = await readJSON(pUrl, {
      topicId,
      conceptsAttempted: [],
      misconceptions: [],
      successfulAnswers: [],
      hintsNeeded: 0,
      suggestedNext: null,
      lastAttempt: null
  });
  
  progress.lastAttempt = new Date().toISOString();
  await writeAtomic(pUrl, progress);
}

export async function resetMemory() {
  await fs.rm(studentDir, { recursive: true, force: true });
}
