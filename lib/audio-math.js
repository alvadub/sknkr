// Audio math utilities - extracted from skanker app.js + m0s

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const ROOTS = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export const QUALITY_ALIASES = {
  "": { name: "", intervals: [0, 4, 7] },
  m: { name: "m", intervals: [0, 3, 7] },
  min: { name: "m", intervals: [0, 3, 7] },
  minor: { name: "m", intervals: [0, 3, 7] },
  dim: { name: "dim", intervals: [0, 3, 6] },
  aug: { name: "aug", intervals: [0, 4, 8] },
  maj7: { name: "maj7", intervals: [0, 4, 7, 11] },
  major7: { name: "maj7", intervals: [0, 4, 7, 11] },
  M7: { name: "maj7", intervals: [0, 4, 7, 11] },
  "7": { name: "7", intervals: [0, 4, 7, 10] },
  m7: { name: "m7", intervals: [0, 3, 7, 10] },
  min7: { name: "m7", intervals: [0, 3, 7, 10] },
  dim7: { name: "dim7", intervals: [0, 3, 6, 9] },
  m7b5: { name: "m7b5", intervals: [0, 3, 6, 10] },
  min7b5: { name: "m7b5", intervals: [0, 3, 6, 10] },
  sus2: { name: "sus2", intervals: [0, 2, 7] },
  sus4: { name: "sus4", intervals: [0, 5, 7] },
};

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function canonicalRoot(rawRoot) {
  const letter = rawRoot[0].toUpperCase();
  const accidental = rawRoot.slice(1);
  return `${letter}${accidental}`;
}

export function normalizeQuality(rawQuality) {
  return String(rawQuality || "")
    .replace(/^maj$/i, "")
    .replace(/^major$/i, "")
    .replace(/^minor/i, "min")
    .replace(/^min/i, "min");
}

export function qualityFromToken(rawQuality) {
  const normalizedQuality = normalizeQuality(rawQuality);
  const qualityKey = Object.prototype.hasOwnProperty.call(QUALITY_ALIASES, rawQuality)
    ? rawQuality
    : Object.keys(QUALITY_ALIASES).find((key) => key.toLowerCase() === normalizedQuality.toLowerCase());
  return QUALITY_ALIASES[qualityKey === undefined ? null : qualityKey] || null;
}

export function parseChordToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token || /\s/.test(token)) return null;
  const parts = token.split("/");
  if (parts.length > 2) return null;
  const chordMatch = parts[0].match(/^([A-Ga-g](?:#|b)?)(.*)$/);
  if (!chordMatch) return null;
  const root = canonicalRoot(chordMatch[1]);
  if (!(root in ROOTS)) return null;
  const quality = qualityFromToken(chordMatch[2]);
  if (!quality) return null;
  let bass = null;
  if (parts[1] !== undefined) {
    const bassMatch = parts[1].match(/^([A-Ga-g](?:#|b)?)$/);
    if (!bassMatch) return null;
    bass = canonicalRoot(bassMatch[1]);
    if (!(bass in ROOTS)) return null;
  }
  return {
    root,
    quality,
    bass,
    label: `${root}${quality.name}${bass ? `/${bass}` : ""}`,
    baseLabel: `${root}${quality.name}`,
  };
}

export function chordName(rawChord) {
  const cleanedChord = String(rawChord || "").split("=")[0].trim();
  return parseChordToken(cleanedChord)?.label || cleanedChord;
}

export function isInvalidCatalogName(rawName) {
  const cleanedName = String(rawName || "").trim();
  if (!cleanedName) return false;
  return !parseChordToken(cleanedName);
}

export function parseNoteName(rawNote) {
  const match = String(rawNote || "").trim().match(/^([A-Ga-g](?:#|b)?)(-?\d+)$/);
  if (!match) return null;
  const root = canonicalRoot(match[1]);
  if (!(root in ROOTS)) return null;
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + ROOTS[root];
  return { label: `${root.toLowerCase()}${octave}`, midi, frequency: midiToHz(midi) };
}

export function parseNoteList(rawNotes) {
  const notes = String(rawNotes || "").split(",").map(parseNoteName);
  if (!notes.length || notes.some((note) => !note)) return null;
  return notes;
}

export function bassMidi(root, referenceMidi) {
  let midi = Math.floor(referenceMidi / 12) * 12 + ROOTS[root];
  while (midi > referenceMidi) midi -= 12;
  return midi;
}

export function parseChord(rawChord, baseMidi = 60, chordCatalog = {}) {
  const raw = String(rawChord || "").trim();
  if (!raw) return null;
  const [chordPart, voicingPart] = raw.split("=").map((part) => part.trim());
  const chordToken = parseChordToken(chordPart);
  if (!chordToken) return null;
  const key = chordToken.label;

  if (voicingPart !== undefined) {
    const notes = parseNoteList(voicingPart);
    if (!notes) return null;
    return {
      label: `${key}=${notes.map((note) => note.label).join(",")}`,
      midi: notes.map((note) => note.midi),
      frequencies: notes.map((note) => note.frequency),
    };
  }

  const catalogKey = chordCatalog[key] ? key : chordToken.baseLabel;
  const catalogNotes = chordCatalog[catalogKey] ? parseNoteList(chordCatalog[catalogKey]) : null;
  if (catalogNotes) {
    const midi = catalogNotes.map((note) => note.midi);
    if (chordToken.bass) midi.unshift(bassMidi(chordToken.bass, Math.min(...midi)));
    return {
      label: key,
      midi,
      frequencies: midi.map(midiToHz),
    };
  }

  const rootMidi = baseMidi + ROOTS[chordToken.root];
  const midi = chordToken.quality.intervals.map((interval) => rootMidi + interval);
  if (chordToken.bass) midi.unshift(bassMidi(chordToken.bass, rootMidi));
  return {
    label: key,
    midi,
    frequencies: midi.map(midiToHz),
  };
}

export function normalizeVelocity(level) {
  if (!Number.isFinite(level) || level <= 0) return 0;
  if (level <= 1) return clamp(level, 0, 1);
  if (level <= 16) return clamp(level / 16, 0, 1);
  return clamp(level / 127, 0, 1);
}