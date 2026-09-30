import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelFile = path.join(root, 'runtime/ollama-model.txt');

export function modelName() {
  try {
    return (process.env.OLLAMA_MODEL || fsSync.readFileSync(modelFile, 'utf8')).trim() || 'qwen2.5:0.5b';
  } catch {
    return (process.env.OLLAMA_MODEL || 'qwen2.5:0.5b').trim();
  }
}

function getHost() {
  return (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
}

export async function generate(messages, options = {}) {
  const model = await modelName();
  const host = getHost();
  
  const msgs = [...messages];
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + '\n/no_think' };
  }

  const reqBody = {
    model,
    messages: msgs,
    stream: false,
    keep_alive: '30m',
    options: {
      temperature: options.temperature ?? 0.3,
      num_ctx: options.num_ctx ?? 2048,
      num_predict: options.maxTokens ?? 800
    }
  };

  if (options.stop) reqBody.options.stop = options.stop;
  if (options.maxTokens) reqBody.options.num_predict = options.maxTokens;

  const start = Date.now();
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
    signal: options.signal || AbortSignal.timeout(120000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ollama API error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  console.log(`[LLM] Generated in ${Date.now() - start}ms`);
  
  return {
    text: data.message?.content || '',
    usage: {
      prompt_tokens: data.prompt_eval_count || 0,
      completion_tokens: data.eval_count || 0
    }
  };
}

export async function generateJSON(messages, schema, options = {}) {
  const model = await modelName();
  const host = getHost();
  
  const msgs = [...messages];
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + '\n/no_think' };
  }

  const reqBody = {
    model,
    messages: msgs,
    stream: false,
    format: schema,
    keep_alive: '30m',
    options: {
      temperature: options.temperature ?? 0.3,
      num_ctx: options.num_ctx ?? 2048,
      num_predict: options.maxTokens ?? 800
    }
  };

  const start = Date.now();
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
    signal: options.signal || AbortSignal.timeout(120000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ollama API error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  console.log(`[LLM JSON] Generated in ${Date.now() - start}ms`);
  
  try {
    return JSON.parse(data.message?.content || '{}');
  } catch (e) {
    throw new Error(`Failed to parse LLM JSON: ${e.message}`);
  }
}

export async function health() {
  const model = await modelName();
  const host = getHost();
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const available = data.models?.some(m => m.name === model || m.name === `${model}:latest`);
    return { available: !!available, model };
  } catch (e) {
    return { available: false, model, error: e.message };
  }
}

export async function warmup() {
  const model = await modelName();
  const host = getHost();
  try {
    await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [], keep_alive: '30m' })
    });
  } catch (e) {
    console.error(`[LLM Warmup] Failed: ${e.message}`);
  }
}
