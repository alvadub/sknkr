// Audio data constants - extracted from skanker app.js + m0s channels

// Synth presets (8 voices) from skanker app.js
export const INTERNAL_SYNTH_PRESETS = {
  sub: { label: "Sub Bass", filter: 380, release: 0.25, shape: "sine", detune: 0, gain: 0.9 },
  organ: { label: "Organ", filter: 1200, release: 0.18, shape: "triangle", detune: -2, gain: 0.7 },
  pad: { label: "Warm Pad", filter: 600, release: 0.5, shape: "sine", detune: 0, gain: 0.5 },
  string: { label: "Strings", filter: 2500, release: 0.6, shape: "sawtooth", detune: 3, gain: 0.4, mix: 0.5 },
  brass: { label: "Brass", filter: 1800, release: 0.2, shape: "sawtooth", detune: -5, gain: 0.65 },
  synth: { label: "Synth", filter: 2000, release: 0.15, shape: "square", detune: 6, gain: 0.6 },
  flute: { label: "Flute", filter: 1400, release: 0.25, shape: "sine", detune: -1, gain: 0.5 },
  clav: { label: "Clav", filter: 3000, release: 0.08, shape: "square", detune: 2, gain: 0.55 },
};

export const DEFAULT_INTERNAL_RHYTHM = "organ";
export const DEFAULT_INTERNAL_HARMONY = "pad";

// Default chord catalog from skanker app.js
export const DEFAULT_CHORD_CATALOG = {
  C: "c4,e4,g4",
  F: "f4,a4,c5",
  G: "g3,b3,d4",
  C7: "c4,e4,g4,bb4",
  F7: "f4,a4,c5,eb5",
  G7: "g3,b3,d4,f4",
  Cm: "c4,eb4,g4",
};

// Sound catalog from skanker app.js
export const SOUND_CATALOG = {
  internal: { label: "Internal Synth" },
  sub: { label: "Sub Bass", type: "internal", preset: "sub" },
  organ: { label: "Organ", type: "internal", preset: "organ" },
  pad: { label: "Warm Pad", type: "internal", preset: "pad" },
  string: { label: "Strings", type: "internal", preset: "string" },
  brass: { label: "Brass", type: "internal", preset: "brass" },
  synth: { label: "Synth", type: "internal", preset: "synth" },
  flute: { label: "Flute", type: "internal", preset: "flute" },
  clav: { label: "Clav", type: "internal", preset: "clav" },
  piano: {
    label: "Acoustic Grand Piano",
    playerUrl: "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js",
    presetUrl: "https://surikov.github.io/webaudiofontdata/sound/0000_Aspirin_sf2_file.js",
    presetName: "_tone_0000_Aspirin_sf2_file",
  },
  guitar: {
    label: "Clean Electric Guitar",
    playerUrl: "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js",
    presetUrl: "https://surikov.github.io/webaudiofontdata/sound/0270_SoundBlasterOld_sf2.js",
    presetName: "_tone_0270_SoundBlasterOld_sf2",
  },
  strings: {
    label: "String Ensemble",
    playerUrl: "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js",
    presetUrl: "https://surikov.github.io/webaudiofontdata/sound/0480_SBLive_sf2.js",
    presetName: "_tone_0480_SBLive_sf2",
  },
};

export const SOUND_CHOICES = {
  rhythm: ["organ", "sub", "synth", "brass", "flute", "clav", "pad", "string", "piano", "guitar", "strings"],
  harmony: ["pad", "string", "flute", "organ", "brass", "clav", "synth", "sub", "piano", "guitar"],
};

// Bass presets (5 voices) from skanker app.js
export const BASS_PRESETS = {
  sub: { label: "Sub Sine", shape: "sine", filter: 420, glide: 0.04, release: 0.22 },
  dub: { label: "Dub Triangle", shape: "triangle", filter: 520, glide: 0.08, release: 0.32 },
  rubber: { label: "Rubber Saw", shape: "sawtooth", filter: 360, glide: 0.06, release: 0.18 },
  square: { label: "Square Bass", shape: "square", filter: 640, glide: 0.03, release: 0.14 },
  custom: { label: "Custom", shape: "sine", filter: 520, glide: 0.04, release: 0.2 },
};

export const BASS_SHAPES = ["sine", "triangle", "sawtooth", "square"];

// Drum kit catalog from skanker app.js
export const DRUM_KIT_CATALOG = {
  internal: { label: "Internal Drums" },
  standard: { label: "WebAudioFont Standard Kit", suffix: "0_FluidR3_GM_sf2_file" },
  room: { label: "WebAudioFont Room Kit", suffix: "8_FluidR3_GM_sf2_file" },
  power: { label: "WebAudioFont Power Kit", suffix: "16_FluidR3_GM_sf2_file" },
  electronic: { label: "WebAudioFont Electronic Kit", suffix: "20_FluidR3_GM_sf2_file" },
  tr808: { label: "WebAudioFont TR-808 Kit", suffix: "21_FluidR3_GM_sf2_file" },
  tr78: { label: "WebAudioFont TR-78 Kit", suffix: "25_FluidR3_GM_sf2_file" },
  cr8000: { label: "WebAudioFont CR-8000 Kit", suffix: "26_FluidR3_GM_sf2_file" },
  jazz: { label: "WebAudioFont Jazz Kit", suffix: "22_FluidR3_GM_sf2_file" },
  orchestral: { label: "WebAudioFont Orchestral Kit", suffix: "48_FluidR3_GM_sf2_file" },
};

// Channel aliases merged from m0s (channels.js)
const DEFAULT_ALIASES = {
  drums: {
    bd: 2001,
    kick: 2001,
    sd: 2004,
    sn: 2004,
    snare: 2004,
    cp: 2028,
    clap: 2028,
    hh: 2035,
    hat: 2035,
    oh: 2081,
    ride: 2081,
    perc: 2123,
  },
  instruments: {
    piano: 0,
    epiano: 4,
    organ: 16,
    guitar: 24,
    bass: 33,
    strings: 48,
    brass: 61,
    lead: 80,
    pad: 88,
    choir: 52,
    fx: 98,
    synth: 94,
  },
};

function toChannelNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.charAt(0) === '#') {
    const n = parseInt(raw.slice(1), 10);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function normalizeAliasRows(rows = {}) {
  const out = {};
  Object.entries(rows || {}).forEach(([name, target]) => {
    const alias = String(name || '').toLowerCase().trim();
    if (!alias) return;
    const channel = toChannelNumber(target);
    if (!Number.isFinite(channel)) return;
    out[alias] = channel;
  });
  return out;
}

export function normalizeChannelAliases(raw = null) {
  const base = {
    drums: normalizeAliasRows(DEFAULT_ALIASES.drums),
    instruments: normalizeAliasRows(DEFAULT_ALIASES.instruments),
  };
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      all: { ...base.drums, ...base.instruments },
    };
  }

  const nextDrums = { ...base.drums, ...normalizeAliasRows(raw.drums) };
  const nextInstruments = { ...base.instruments, ...normalizeAliasRows(raw.instruments) };
  return {
    drums: nextDrums,
    instruments: nextInstruments,
    all: { ...nextDrums, ...nextInstruments },
  };
}

export function resolveChannelToken(value, channelAliases = null) {
  const token = String(value || '').trim();
  if (!token || token.charAt(0) !== '#') return token;
  const raw = token.slice(1).trim();
  if (!raw) throw new TypeError(`Missing channel value in '${token}'`);

  const numeric = toChannelNumber(raw);
  if (Number.isFinite(numeric) && /^\d+$/.test(raw)) return `#${numeric}`;

  const aliases = normalizeChannelAliases(channelAliases);
  const target = aliases.all[String(raw).toLowerCase()];
  if (Number.isFinite(target)) return `#${target}`;

  throw new TypeError(`Unknown channel alias '#${raw}'`);
}

export const DEFAULT_CHANNEL_ALIASES = normalizeChannelAliases();

// WebAudioFont player URL
export const WEBAUDIOFONT_PLAYER_URL = "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js";