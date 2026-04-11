// Audio loader - CORS-smart WebAudioFont loader merged from m0s

import { WEBAUDIOFONT_PLAYER_URL } from "./audio-data.js";

const FONT_LOAD_TIMEOUT_MS = 4500;
const fontLoadStatus = new Map();
const fontLoadPromises = new Map();

let webAudioFontPlayer = null;

export function getWebAudioFontPlayer() {
  return webAudioFontPlayer;
}

export function initWebAudioFontPlayer(ctx) {
  if (!webAudioFontPlayer) {
    webAudioFontPlayer = new window.WebAudioFontPlayer();
  }
  return webAudioFontPlayer;
}

export function isFontReady(variable) {
  return typeof window !== 'undefined' && variable in window;
}

export function isCrossOriginUrl(url) {
  if (typeof URL === 'function') {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin !== window.location.origin;
    } catch {
      return true;
    }
  }
  return !url.startsWith('/') && !url.startsWith('./');
}

function isHtmlLikeResponse(contentType, text) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html')) return true;
  if (!ct.includes('javascript') && !ct.includes('json')) {
    const head = text.slice(0, 100).trim().toLowerCase();
    return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<body');
  }
  return false;
}

function executeFontScriptSource(url, source, variable) {
  if (typeof document === 'undefined') throw new Error('Missing document for script execution');
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.text = `${source}\n//# sourceURL=${url}`;
  document.head.appendChild(script);
  script.remove();
  if (isFontReady(variable)) return true;
  throw new Error(`Loaded ${url}, but missing preset '${variable}'`);
}

function loadFontScriptTag(url, variable, timeoutMs = FONT_LOAD_TIMEOUT_MS) {
  if (isFontReady(variable)) return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.reject(new Error('Missing document for script loading'));

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let done = false;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
      if (ok) resolve(true);
      else reject(error || new Error(`Failed to load ${url}`));
    };

    const timeoutId = setTimeout(() => {
      finish(false, new Error(`Timed out loading ${url}`));
    }, timeoutMs);

    script.async = true;
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (isFontReady(variable)) {
        finish(true);
        return;
      }
      finish(false, new Error(`Loaded ${url}, but missing preset '${variable}'`));
    };
    script.onerror = () => {
      finish(false, new Error(`Network error loading ${url}`));
    };

    document.head.appendChild(script);
  });
}

async function loadFontScript(url, variable, timeoutMs = FONT_LOAD_TIMEOUT_MS) {
  if (isFontReady(variable)) return true;
  if (typeof fetch !== 'function') return loadFontScriptTag(url, variable, timeoutMs);

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId = null;
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
    const source = await response.text();
    if (isHtmlLikeResponse(response.headers.get('content-type'), source)) {
      throw new Error(`Received HTML response for ${url}`);
    }
    return executeFontScriptSource(url, source, variable);
  } catch (error) {
    const message = String((error && error.message) || error || '').toLowerCase();
    const corsOrNetwork =
      error && error.name === 'TypeError'
      && (message.includes('fetch') || message.includes('network') || message.includes('cors'));
    const aborted = error && error.name === 'AbortError';

    if (aborted) throw new Error(`Timed out loading ${url}`);
    if (corsOrNetwork && isCrossOriginUrl(url)) {
      return loadFontScriptTag(url, variable, timeoutMs);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function loadFontWithFallback(urls, variable) {
  let lastError = null;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      await loadFontScript(urls[i], variable, FONT_LOAD_TIMEOUT_MS);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn(`Preset load failed for '${variable}'`, lastError.message || lastError);
  return false;
}

export function getFontSourceCandidates(presetUrl, variable) {
  const baseUrl = presetUrl.replace(/[?#].*$/, '');
  const baseName = baseUrl.split('/').pop().replace(/\.js$/, '');
  return [
    presetUrl,
    `/webaudiofont/sound/${baseName}.js`,
    `./webaudiofont/sound/${baseName}.js`,
    `/sound/${baseName}.js`,
    `./sound/${baseName}.js`,
  ];
}

export function cacheInstrument(presetUrl, variable) {
  if (!variable) return;
  if (isFontReady(variable)) {
    fontLoadStatus.set(variable, 'ready');
    return;
  }
  if (fontLoadPromises.has(variable)) return;

  fontLoadStatus.set(variable, 'loading');
  const urls = getFontSourceCandidates(presetUrl, variable);
  const deferred = loadFontWithFallback(urls, variable)
    .then(ok => {
      fontLoadStatus.set(variable, ok ? 'ready' : 'failed');
    })
    .catch(error => {
      fontLoadStatus.set(variable, 'failed');
    })
    .finally(() => {
      fontLoadPromises.delete(variable);
    });

  fontLoadPromises.set(variable, deferred);
}

export async function loadSoundProfile(ctx, soundKey, soundCatalog) {
  const sound = soundCatalog[soundKey];
  if (!sound) return null;

  if (sound.type === 'internal') {
    return { player: null, preset: null };
  }

  if (sound.playerUrl) {
    if (!webAudioFontPlayer) {
      webAudioFontPlayer = new window.WebAudioFontPlayer();
    }
    try {
      await loadFontScript(sound.playerUrl, 'WebAudioFontPlayer', 8000);
    } catch (e) {
      console.warn('Failed to load WebAudioFontPlayer', e);
    }
  }

  if (sound.presetUrl && sound.presetName) {
    await cacheInstrument(sound.presetUrl, sound.presetName);
    const preset = window[sound.presetName];
    return { player: webAudioFontPlayer, preset };
  }

  return { player: webAudioFontPlayer, preset: null };
}

export function profileStatus(key) {
  if (fontLoadStatus.has(key)) return fontLoadStatus.get(key);
  if (isFontReady(key)) return 'ready';
  return 'idle';
}