import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getProfile, updateProfile, getSessionState, setSessionState, clearSession } from './memory.mjs';

const dirUrl = new URL('../runtime/student/', import.meta.url);

export function studentDir() {
  return fileURLToPath(dirUrl);
}

export async function ensureStudentDir() {
  await fs.mkdir(new URL('progress/', dirUrl), { recursive: true });
  await fs.mkdir(new URL('memories/', dirUrl), { recursive: true });
  await fs.mkdir(new URL('sessions/', dirUrl), { recursive: true });
}

export async function readStudentFile(filename, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(new URL(filename, dirUrl), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== null) return fallback;
    throw e;
  }
}

export async function writeStudentFile(filename, data) {
  await ensureStudentDir();
  const fileUrl = new URL(filename, dirUrl);
  const tmpUrl = new URL(filename + '.tmp', dirUrl);
  await fs.writeFile(tmpUrl, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  await fs.rename(tmpUrl, fileUrl);
}

export async function appendStudentLog(filename, entry) {
  await ensureStudentDir();
  await fs.appendFile(new URL(filename, dirUrl), JSON.stringify(entry) + '\n');
}

export async function loadStudent() {
  const profile = await getProfile();
  const state = await getSessionState();
  return { id: 'student', history: state.recentTurns, lastTopic: state.currentTopic, preferences: profile.preferences, updatedAt: profile.updatedAt };
}

export async function saveStudent(data) {
  if (data.preferences) await updateProfile({ preferences: data.preferences });
  const state = await getSessionState();
  if (data.lastTopic !== undefined) state.currentTopic = data.lastTopic;
  if (data.history !== undefined) state.recentTurns = data.history;
  await setSessionState(state);
  return await loadStudent();
}

export async function clearStudentSession() {
  await clearSession();
  return await loadStudent();
}
