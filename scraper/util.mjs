// Shared scraper utilities: resilient fetch + bounded-concurrency map.
import { decodeBuffer } from './cp1252.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (paper-swiper scraper)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch raw bytes with retry. Returns null on 404, throws after exhausting retries.
export async function fetchBuffer(url, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

// Fetch HTML, decoding per its declared charset (default utf-8). Returns '' on 404.
export async function fetchHtml(url, retries = 3) {
  const buf = await fetchBuffer(url, retries);
  if (!buf) return '';
  const peek = new TextDecoder('latin1').decode(buf.subarray(0, 2048));
  const m = peek.match(/charset=["']?\s*([\w-]+)/i);
  return decodeBuffer(buf, m ? m[1] : 'utf-8');
}

export async function fetchJson(url, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

// Run fn over items with at most `concurrency` in flight. Failures -> null.
export async function mapPool(items, concurrency, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch {
        results[idx] = null;
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
