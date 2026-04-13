// UI Widgets - extracted from app.js for reuse across skanker (and eventually m0s)

import { parseChord as parseChordFn } from "./audio-math.js";

export function uiIcon(name) {
  const icons = {
    power: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/><path d="M4.4 3.8A5.5 5.5 0 1 0 11.6 3.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg>',
    record: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.2" fill="currentColor"/></svg>',
    settings: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 1.8h2.8l.4 1.6 1.3.5 1.4-.8 2 2-0.8 1.4.5 1.3 1.6.4v2.8l-1.6.4-.5 1.3.8 1.4-2 2-1.4-.8-1.3.5-.4 1.6H6.6l-.4-1.6-1.3-.5-1.4.8-2-2 .8-1.4-.5-1.3-1.6-.4V8.6l1.6-.4.5-1.3-.8-1.4 2-2 1.4.8 1.3-.5.4-1.6Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.1"/><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
    clear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5 12.5 13.5M12.5 4.5 3.5 13.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6 2 8l2 2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/><path d="M2 8h9a3 3 0 0 1 0 6H7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/></svg>',
    mute: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    notes: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.75 2.5v7.2a2 2 0 1 1-1.5-1.94V4.1l4-1.1v5.6a2 2 0 1 1-1.5-1.94V2.5l-1 .28Z" fill="currentColor"/></svg>',
    pattern: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.25 11.75V9.5m3-5.25v7.5m3-4.5v4.5m3-8.5v8.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/><path d="M1.5 13.25h13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" opacity=".65"/></svg>',
    load: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5L10.5 2H3a1 1 0 0 0-1 1z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"/><path d="M10 2v4h4" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"/><path d="M6 8l2 2 2-2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2"/><path d="M8 10V6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"/></svg>',
    remove: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1m2 0v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4h10z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2"/><path d="M7 7v4m2-4v4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8A5 5 0 1 1 8 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3"/><path d="M8 1l2 2-2 2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.3"/></svg>',
  };
  return icons[name] || "";
}
import { fixedLengthArray } from "../codec.js";
import { normalizeBassEvents } from "../skt.js";

export function parseChord(rawChord, baseMidi = 60, chordCatalog = {}) {
  return parseChordFn(rawChord, baseMidi, chordCatalog);
}

function splitWhitespacePreservingParts(str) {
  const parts = [];
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === " " || char === "\t") {
      if (current) parts.push(current);
      current = "";
      if (!parts.length || parts[parts.length - 1] !== char) parts.push(char);
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function parseChordPool(rawChords) {
  const tokens = splitWhitespacePreservingParts(rawChords).filter((part) => !/^\s+$/.test(part));
  if (!tokens.length) return [];
  const chords = tokens.map((token) => parseChordFn(token));
  return chords.some((chord) => !chord) ? null : chords.map((chord) => chord.label);
}

export function chordPatternToSlots(rawChords, rawPattern, maxSteps = 8) {
  const chords = parseChordPool(rawChords);
  const pattern = parseChordPattern(rawPattern, maxSteps);
  if (!chords || !pattern) return null;
  const flat = pattern.flat(1);
  if (chords.length !== chordPatternStats(pattern).pulses) return null;
  const slots = Array(maxSteps).fill("");
  let chordIndex = 0;
  let currentChord = "";
  flat.forEach((symbol, step) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !currentChord)) {
      currentChord = chords[chordIndex] || "";
      slots[step] = currentChord;
      chordIndex += 1;
      return;
    }
    if (symbol === "_" && currentChord) {
      slots[step] = currentChord;
      return;
    }
    currentChord = "";
  });
  return slots;
}

export function normalizeDubPatternSymbol(symbol) {
  if (symbol === "." || symbol === "0") return "-";
  return symbol;
}

export function dubPatternChars(raw) {
  return [...String(raw || "").replace(/[\s|]/g, "")]
    .map(normalizeDubPatternSymbol)
    .filter((symbol) => ["x", "X", "_", "-"].includes(symbol));
}

export function parseDubPatternCells(rawPattern, stepCount, ticksPerStep = 1) {
  const raw = String(rawPattern || "").replace(/[\s|]/g, "").replace(/([xX_\-])!(\d+)/g, (_, ch, n) => ch.repeat(1 + Number(n)));
  if (!raw) return Array.from({ length: stepCount }, () => Array(ticksPerStep).fill("-"));
  const cells = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = normalizeDubPatternSymbol(raw[index]);
    if (char === "[") {
      const closeIndex = raw.indexOf("]", index + 1);
      if (closeIndex === -1) return null;
      const group = dubPatternChars(raw.slice(index + 1, closeIndex));
      if (!group.length) return null;
      const cell = Array(ticksPerStep).fill("-");
      if (ticksPerStep === 1) {
        cell[0] = group.includes("X") ? "X" : (group.includes("x") ? "x" : (group.includes("_") ? "_" : "-"));
      } else {
        group.slice(0, ticksPerStep).forEach((symbol, tick) => {
          cell[tick] = symbol;
        });
      }
      cells.push(cell);
      index = closeIndex;
      continue;
    }
    if (char === "]") return null;
    if (!["x", "X", "_", "-"].includes(char)) return null;
    cells.push([char, ...Array(Math.max(0, ticksPerStep - 1)).fill("-")]);
  }
  if (cells.length > stepCount) return null;
  while (cells.length < stepCount) cells.push(Array(ticksPerStep).fill("-"));
  return cells;
}

export function reconcilePastePattern(raw, steps) {
  if (!raw || !raw.length) return "-".repeat(steps);
  if (raw.length === steps) return raw;
  if (raw.length < steps) return raw.repeat(Math.ceil(steps / raw.length)).slice(0, steps);
  return raw.slice(0, steps);
}

export function parseBassInlinePattern(content, steps = 128) {
  const raw = content.replace(/\s/g, "");
  const noteRe = /([A-Ga-g][#b]?\d)/g;
  const notes = [];
  const pat = raw.replace(noteRe, (note) => { notes.push(note); return "x"; })
    .replace(/_/g, "_").replace(/-/g, "-");
  return { pat: reconcilePastePattern(pat, steps), notes };
}

export function parseChordInlinePattern(content, steps = 32) {
  const raw = content.replace(/\s/g, "");
  const chordRe = /([A-G][#b]?(?:maj|min|m|aug|dim|sus|add)?[0-9]*(?:b[0-9]+|#[0-9]+)?)/g;
  const chords = [];
  const pat = raw.replace(chordRe, (chord) => { chords.push(chord); return "x"; })
    .replace(/_/g, "_").replace(/-/g, "-");
  return { pat: reconcilePastePattern(pat, steps), chords };
}

export function isDubPatternToken(token) {
  return /^[xX_\-.0\[\]]+$/.test(token);
}

export function normalizeChordPoolText(rawChords) {
  return splitWhitespacePreservingParts(rawChords).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const chord = parseChordFn(part);
    return chord ? chord.label : part;
  }).join("").trimEnd();
}

export function parseDubBassSymbols(rawPattern, bassTicks = 128, steps = 32, ticksPerStep = 4) {
  const raw = String(rawPattern || "").replace(/[\s|]/g, "");
  if (!raw) return Array(bassTicks).fill("-");
  if (raw.includes("[") || raw.includes("]")) {
    const cells = parseDubPatternCells(rawPattern, steps, ticksPerStep);
    return cells ? cells.flat().slice(0, bassTicks) : null;
  }
  const symbols = dubPatternChars(raw);
  if (symbols.length > bassTicks) return null;
  if (symbols.length <= steps) {
    return symbols.flatMap((symbol) => [symbol, ...Array(ticksPerStep - 1).fill("-")])
      .concat(Array(bassTicks).fill("-"))
      .slice(0, bassTicks);
  }
  return symbols.concat(Array(bassTicks).fill("-")).slice(0, bassTicks);
}

export function dubSceneLabel(index) {
  return `SLOT${index + 1}`;
}

export function dubLineComment(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

export function dubMetaValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return dubLineComment(value);
}

export function dubMetaMap(entries) {
  return entries
    .map(([key, value]) => `${key}=${dubMetaValue(value)}`)
    .join(", ");
}

export function formatDubChordLayer(layerValues, totalSteps = 32) {
  const symbols = [];
  const chords = [];
  let currentChord = "";
  fixedLengthArray(layerValues, "", totalSteps).forEach((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      symbols.push("-");
      currentChord = "";
      return;
    }
    if (currentChord && value === currentChord) {
      symbols.push("_");
      return;
    }
    symbols.push("x");
    chords.push(value);
    currentChord = value;
  });
  return { pattern: chordPatternSymbolGroups(symbols), pool: chords.join(" ") };
}

export function formatDubBassPattern(events, bassTicks = 128, steps = 32, ticksPerStep = 4) {
  const symbols = Array(bassTicks).fill("-");
  normalizeBassEvents(events).forEach((event) => {
    symbols[event.tick] = "x";
    for (let offset = 1; offset < event.length && event.tick + offset < bassTicks; offset += 1) {
      if (symbols[event.tick + offset] === "-") symbols[event.tick + offset] = "_";
    }
  });
  const cells = [];
  for (let step = 0; step < steps; step += 1) {
    const tick = step * ticksPerStep;
    cells.push(`[${symbols.slice(tick, tick + ticksPerStep).join("")}]`);
  }
  const groups = [];
  for (let index = 0; index < cells.length; index += 4) {
    groups.push(cells.slice(index, index + 4).join(""));
  }
  return groups.join(" ");
}

export function orderedUnique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function dubDrumTrackKey(instrument) {
  const aliases = {
    bd: "kick",
    bassdrum: "kick",
    sd: "snare",
    ch: "hihat",
    hh: "hihat",
    closedhat: "hihat",
    closedhh: "hihat",
    oh: "openhat",
    openhh: "openhat",
  };
  return aliases[instrument] || instrument;
}

export function soundLabel(key, soundCatalog = {}) {
  return soundCatalog[key]?.label || key;
}

export function drumSoundLabel(key, drumCatalog = {}) {
  return drumCatalog[key]?.label || key;
}

export function bassPresetLabel(key, bassPresets = {}) {
  return bassPresets[key]?.label || key;
}

export function chordLayerPartValues(layerValues, partIndex, partSteps = 8, totalSteps = 32) {
  const startStep = partIndex * partSteps;
  return fixedLengthArray(layerValues, "", totalSteps).slice(startStep, startStep + partSteps);
}

export function formatChordPatternPart(layerValues, partIndex, partSteps = 8, totalSteps = 32) {
  const symbols = [];
  let currentChord = "";
  chordLayerPartValues(layerValues, partIndex, partSteps, totalSteps).forEach((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      symbols.push("-");
      currentChord = "";
      return;
    }
    if (currentChord && value === currentChord) {
      symbols.push("_");
      return;
    }
    symbols.push("x");
    currentChord = value;
  });
  return chordPatternSymbolGroups(symbols);
}

export function formatChordPoolPart(layerValues, partIndex, partSteps = 8, totalSteps = 32) {
  const chords = [];
  let currentChord = "";
  chordLayerPartValues(layerValues, partIndex, partSteps, totalSteps).forEach((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      currentChord = "";
      return;
    }
    if (currentChord && value === currentChord) return;
    chords.push(value);
    currentChord = value;
  });
  return chords.join(" ");
}

export function chordActivePoolIndex(rawPattern, activeStep, maxSteps = 8) {
  const pattern = parseChordPattern(rawPattern, maxSteps);
  if (!pattern) return -1;
  const flat = pattern.flat(1);
  let chordIndex = -1;
  let hasActiveChord = false;
  for (let i = 0; i <= activeStep && i < flat.length; i++) {
    const symbol = flat[i];
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
      chordIndex += 1;
      hasActiveChord = true;
    } else if (symbol === "-") {
      hasActiveChord = false;
    }
  }
  return chordIndex;
}

function splitPatternWithSubsteps(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[") {
      const end = raw.indexOf("]", i + 1);
      if (end < 0) break;
      out.push(raw.slice(i + 1, end).split(""));
      i = end;
      continue;
    }
    out.push(ch);
  }
  return out;
}

export function parseChordPattern(rawPattern, maxSteps = 32) {
  const raw = String(rawPattern || "").trim();
  if (!raw) return [];
  if (/[^xX_\-\[\]\s|.0]/.test(raw)) return null;
  const symbols = splitPatternWithSubsteps(raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-"));
  const flat = symbols.flat(1);
  if (!flat.length || flat.length > maxSteps) return null;
  return symbols;
}

export function chordPatternStats(pattern) {
  const flat = pattern.flat(1);
  const stats = { pulses: 0, sustains: 0, rests: 0, steps: flat.length };
  let hasActiveChord = false;
  flat.forEach((symbol) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
      stats.pulses += 1;
      hasActiveChord = true;
      return;
    }
    if (symbol === "_") {
      stats.sustains += 1;
      return;
    }
    stats.rests += 1;
    hasActiveChord = false;
  });
  return stats;
}

export function chordPatternSymbolGroups(symbols) {
  const groups = [];
  for (let index = 0; index < symbols.length; index += 4) {
    groups.push(symbols.slice(index, index + 4).join(""));
  }
  return groups.join(" ");
}

export function parseDrumPattern(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/[^xX_\-\[\]\s|.0]/.test(raw)) return null;
  const steps = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[") {
      const end = raw.indexOf("]", i + 1);
      if (end < 0) break;
      const subChars = raw.slice(i + 1, end).split("");
      const subhits = [];
      subChars.forEach((c, idx) => {
        if (c === "x") subhits.push({ pos: idx / subChars.length, vel: 0.72 });
        else if (c === "X") subhits.push({ pos: idx / subChars.length, vel: 1 });
      });
      steps.push(subhits.length > 0 ? subhits : null);
      i = end;
      continue;
    }
    if (/[\s|]/.test(ch)) continue;
    const symbol = ch === "." || ch === "0" ? "-" : ch;
    if (symbol === "x") steps.push([{ pos: 0, vel: 0.72 }]);
    else if (symbol === "X") steps.push([{ pos: 0, vel: 1 }]);
    else steps.push(null);
  }
  const maxSteps = 32;
  if (!steps.length || steps.length > maxSteps || maxSteps % steps.length !== 0) return null;
  const expanded = [];
  while (expanded.length < maxSteps) expanded.push(...steps);
  return expanded.slice(0, maxSteps);
}

export function formatDrumPattern(steps) {
  return steps.map((step) => {
    if (!step || step.length === 0) return "-";
    if (step.length === 1 && step[0].pos === 0) {
      return step[0].vel >= 1 ? "X" : "x";
    }
    const subChars = step.map((hit) => hit.vel >= 1 ? "X" : "x");
    return `[${subChars.join("")}]`;
  }).join("");
}

export function renderDrumPatternPreview(preview, rawPattern, activeStep = -1, maxSteps = 32) {
  if (!preview) return;
  const raw = String(rawPattern || "");
  const needsRebuild = preview.dataset.pattern !== raw;
  if (needsRebuild) {
    preview.replaceChildren();
    preview.dataset.pattern = raw;
    let step = 0;
    const chars = [];
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (ch === "[") {
        const end = raw.indexOf("]", i + 1);
        if (end < 0) break;
        chars.push({ substep: raw.slice(i + 1, end).split(""), start: i, end });
        i = end;
        continue;
      }
      if (/[\s|]/.test(ch)) {
        chars.push({ space: ch });
        continue;
      }
      chars.push({ char: ch });
    }
    chars.forEach((item) => {
      if (item.space) {
        preview.append(document.createTextNode(item.space));
        return;
      }
      if (item.substep) {
        const group = document.createElement("span");
        group.className = "substep-group";
        const openBracket = document.createElement("span");
        openBracket.textContent = "[";
        openBracket.className = "bracket";
        group.append(openBracket);
        item.substep.forEach((ch) => {
          const cell = document.createElement("span");
          cell.textContent = ch;
          const normalized = ch === "." || ch === "0" ? "-" : ch;
          if (!["x", "X", "_", "-"].includes(normalized) || step >= maxSteps) {
            cell.className = "invalid";
          } else {
            cell.classList.toggle("accent", normalized === "X");
            cell.classList.toggle("on", normalized === "x");
            cell.classList.toggle("sustain", normalized === "_");
            cell.classList.toggle("rest", normalized === "-");
            cell.dataset.step = step;
          }
          step += 1;
          group.append(cell);
        });
        const closeBracket = document.createElement("span");
        closeBracket.textContent = "]";
        closeBracket.className = "bracket";
        group.append(closeBracket);
        preview.append(group);
        return;
      }
      const cell = document.createElement("span");
      cell.textContent = item.char;
      const normalized = item.char === "." || item.char === "0" ? "-" : item.char;
      if (!["x", "X", "_", "-"].includes(normalized) || step >= maxSteps) {
        cell.className = "invalid";
      } else {
        cell.classList.toggle("accent", normalized === "X");
        cell.classList.toggle("on", normalized === "x");
        cell.classList.toggle("sustain", normalized === "_");
        cell.classList.toggle("rest", normalized === "-");
        cell.dataset.step = step;
      }
      step += 1;
      preview.append(cell);
    });
  }
  preview.querySelectorAll("[data-step]").forEach((cell) => {
    const step = Number(cell.dataset.step);
    cell.classList.toggle("playing", step === activeStep);
  });
}

export function renderChordPatternPreview(preview, rawPattern, stepOffset = 0, maxSteps = 8) {
  if (!preview) return;
  const raw = String(rawPattern || "");
  const activeStep = stepOffset;
  const needsRebuild = preview.dataset.pattern !== raw;
  if (needsRebuild) {
    preview.replaceChildren();
    preview.dataset.pattern = raw;
    let hasActiveChord = false;
    let step = 0;
    const chars = [];
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (ch === "[") {
        const end = raw.indexOf("]", i + 1);
        if (end < 0) break;
        chars.push({ substep: raw.slice(i + 1, end).split(""), start: i, end });
        i = end;
        continue;
      }
      if (/[\s|]/.test(ch)) {
        chars.push({ space: ch });
        continue;
      }
      chars.push({ char: ch });
    }
    chars.forEach((item) => {
      if (item.space) {
        preview.append(document.createTextNode(item.space));
        return;
      }
      if (item.substep) {
        const group = document.createElement("span");
        group.className = "substep-group";
        const openBracket = document.createElement("span");
        openBracket.textContent = "[";
        openBracket.className = "bracket";
        group.append(openBracket);
        item.substep.forEach((ch) => {
          const cell = document.createElement("span");
          cell.textContent = ch;
          const symbol = ch === "." || ch === "0" ? "-" : ch;
          if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
            cell.classList.add(symbol === "X" ? "accent" : "on");
            hasActiveChord = true;
          } else if (symbol === "_") {
            cell.classList.add("sustain");
          } else if (symbol === "-") {
            cell.classList.add("rest");
            hasActiveChord = false;
          }
          cell.dataset.step = step;
          group.append(cell);
          step += 1;
        });
        const closeBracket = document.createElement("span");
        closeBracket.textContent = "]";
        closeBracket.className = "bracket";
        group.append(closeBracket);
        preview.append(group);
        return;
      }
      const cell = document.createElement("span");
      cell.textContent = item.char;
      const symbol = item.char === "." || item.char === "0" ? "-" : item.char;
      if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
        cell.classList.add(symbol === "X" ? "accent" : "on");
        hasActiveChord = true;
      } else if (symbol === "_") {
        cell.classList.add("sustain");
      } else if (symbol === "-") {
        cell.classList.add("rest");
        hasActiveChord = false;
      }
      cell.dataset.step = step;
      preview.append(cell);
      step += 1;
    });
  }
  preview.querySelectorAll("[data-step]").forEach((cell) => {
    const step = Number(cell.dataset.step);
    cell.classList.toggle("playing", activeStep === step);
  });
}

export function renderChordPoolPreview(preview, rawChords, rawPattern, stepOffset = 0, maxSteps = 8) {
  if (!preview) return;
  preview.replaceChildren();
  const pattern = parseChordPattern(rawPattern, maxSteps);
  const expectedChords = pattern ? chordPatternStats(pattern).pulses : 0;
  const activeChordIndex = pattern ? stepOffset : -1;
  let chordIndex = 0;
  const parts = String(rawChords || "").match(/\s+|\S+/g) || [];
  parts.forEach((part) => {
    if (/^\s+$/.test(part)) {
      preview.append(document.createTextNode(part));
      return;
    }
    const cell = document.createElement("span");
    cell.textContent = part;
    cell.classList.add("chord-pool-item");
    if (!parseChordFn(part)) {
      cell.classList.add("invalid");
    } else if (chordIndex >= expectedChords) {
      cell.classList.add("extra");
    } else {
      cell.classList.add("on");
    }
    cell.classList.toggle("playing", chordIndex === activeChordIndex);
    preview.append(cell);
    chordIndex += 1;
  });
}

export function bindPatternInput(input, preview, { render, parse, format, cycle, onToggle }) {
  const syncScroll = () => { preview.scrollLeft = input.scrollLeft; };
  const refresh = () => { render(preview, input.value); syncScroll(); };

  let cachedCharWidth = null;
  const getCharWidth = () => {
    if (!cachedCharWidth) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = getComputedStyle(input).font;
      cachedCharWidth = ctx.measureText("x").width;
    }
    return cachedCharWidth;
  };
  const charIndexToStep = (value, charIndex) => {
    let step = -1;
    for (let i = 0; i <= Math.min(charIndex, value.length - 1); i++) {
      if (!/[\s|]/.test(value[i])) step++;
    }
    return Math.max(0, step);
  };
  const stepToCharIndex = (value, targetStep) => {
    let step = 0;
    for (let i = 0; i < value.length; i++) {
      if (/[\s|]/.test(value[i])) continue;
      if (step === targetStep) return i;
      step++;
    }
    return value.length;
  };
  const setHoveredStep = (step) => {
    preview.querySelectorAll("[data-step]").forEach((span) => {
      span.classList.toggle("input-hover", Number(span.dataset.step) === step);
    });
  };

  input.addEventListener("focus", () => requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(input.selectionEnd, input.selectionEnd);
  }));
  input.addEventListener("scroll", syncScroll);
  input.addEventListener("select", syncScroll);
  const wrap = input.parentElement;
  wrap.addEventListener("mousemove", (e) => {
    const rect = input.getBoundingClientRect();
    const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft) || 0;
    const x = e.clientX - rect.left - paddingLeft + input.scrollLeft;
    setHoveredStep(charIndexToStep(input.value, Math.max(0, Math.floor(x / getCharWidth()))));
  });
  wrap.addEventListener("mouseleave", () => {
    preview.querySelectorAll("[data-step].input-hover").forEach((s) => s.classList.remove("input-hover"));
  });

  preview.addEventListener("mousedown", (event) => event.preventDefault());
  preview.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) { input.focus(); return; }
    const stepIndex = Number(cell.dataset.step);
    const parsed = parse(input.value);
    if (!parsed || stepIndex < 0 || stepIndex >= parsed.length) return;
    const charPos = stepToCharIndex(input.value, stepIndex);
    input.focus();
    input.setSelectionRange(charPos, charPos);
  });
  preview.addEventListener("dblclick", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) return;
    const stepIndex = Number(cell.dataset.step);
    const parsed = parse(input.value);
    if (!parsed || stepIndex < 0 || stepIndex >= parsed.length) return;
    const charPos = stepToCharIndex(input.value, stepIndex);
    input.focus();
    requestAnimationFrame(() => {
      input.setSelectionRange(charPos, charPos + 1);
    });
  });
  return { refresh, syncScroll };
}

export function summarizeChordLayer(layerValues, totalSteps = 32) {
  const starts = [];
  let currentChord = "";
  fixedLengthArray(layerValues, "", totalSteps).forEach((rawValue, step) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      currentChord = "";
      return;
    }
    if (value === currentChord) return;
    starts.push({ step: step + 1, chord: value });
    currentChord = value;
  });
  const distinct = orderedUnique(starts.map((entry) => entry.chord));
  return {
    first: starts[0]?.chord || "",
    entries: starts.length,
    changes: Math.max(0, starts.length - 1),
    distinct,
    anchors: starts.map((entry) => `${entry.step}:${entry.chord}`),
    density: starts.length / totalSteps,
  };
}

export function summarizeDrumTrack(values, stepCount = 32) {
  const normalized = values.map((v) => {
    if (v >= 0.95) return 1;
    if (v > 0) return 0.72;
    return 0;
  });
  const hits = normalized.filter((value) => value > 0).length;
  const accents = normalized.filter((value) => value >= 0.95).length;
  const density = hits / stepCount;
  const accentRatio = hits > 0 ? accents / hits : 0;
  return { hits, accents, density, accentRatio };
}

export function summarizeBassEvents(events, totalTicks = 128) {
  const normalized = normalizeBassEvents(events);
  const activeTicks = normalized.reduce((sum, event) => sum + Math.max(1, event.length), 0);
  const sustainTicks = normalized.reduce((sum, event) => sum + Math.max(0, event.length - 1), 0);
  const distinct = orderedUnique(normalized.map((event) => event.midi ? event.midi.toString() : ""));
  return {
    notes: normalized.length,
    sustainTicks,
    activeTicks,
    density: activeTicks / totalTicks,
    first: normalized[0] ? normalized[0].midi?.toString() || "" : "",
    distinct,
  };
}

export function summarizeScene(scene, tracks) {
  const rhythm = summarizeChordLayer(scene.rhythm);
  const harmony = summarizeChordLayer(scene.harmony);
  const bass = summarizeBassEvents(scene.bass);
  const drums = Object.fromEntries(tracks.map((track) => [track.key, summarizeDrumTrack(scene.drums[track.key])]));
  return { rhythm, harmony, bass, drums };
}

export function parseDubChannelLine(line) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  const instrument = parts.shift()?.slice(1).toLowerCase();
  if (!instrument) return null;
  if (parts[0] === "+" || parts[0] === "!") parts.shift();
  const volume = Number(parts[0]);
  if (Number.isFinite(volume)) parts.shift();
  const patternParts = [];
  while (parts.length && isDubPatternToken(parts[0])) patternParts.push(parts.shift());
  if (!patternParts.length) return null;
  return { instrument, volume, pattern: patternParts.join(" "), notes: parts.join(" ") };
}

export function parseDubArrangement(rawArrangement) {
  const tokens = String(rawArrangement || "").trim().split(/\s+/).filter(Boolean);
  const expanded = [];
  tokens.forEach((token) => {
    const repeat = token.match(/^x(\d+)$/i);
    if (repeat) {
      const previous = expanded[expanded.length - 1];
      if (!previous) return;
      const count = Math.max(1, Number(repeat[1]) || 1);
      for (let index = 1; index < count; index += 1) expanded.push(previous);
      return;
    }
    expanded.push(token);
  });
  return expanded;
}

export function chordDubLineToSlots(pattern, chordsText, totalSteps = 32) {
  const chords = String(chordsText || "").trim().split(/\s+/).filter(Boolean)
    .flatMap((token) => { const m = token.match(/^(.+?)!(\d+)$/); return m ? Array(Math.max(1, Number(m[2]))).fill(m[1]) : [token]; });
  if (chords.some((chord) => !parseChordFn(chord))) return null;
  const cells = parseDubPatternCells(pattern, totalSteps, 1);
  if (!cells) return null;
  const slots = Array(totalSteps).fill("");
  let chordIndex = 0;
  let currentChord = "";
  cells.forEach((cell, step) => {
    const symbol = cell[0];
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !currentChord)) {
      currentChord = chords[chordIndex] || "";
      slots[step] = currentChord;
      chordIndex += 1;
      return;
    }
    if (symbol === "_" && currentChord) {
      slots[step] = currentChord;
      return;
    }
    currentChord = "";
  });
  return chordIndex > 0 ? slots : null;
}

export function drumDubLineToValues(pattern, stepCount = 32) {
  const cells = parseDubPatternCells(pattern, stepCount, 1);
  if (!cells) return null;
  return cells.map((cell) => {
    if (cell[0] === "X") return 1;
    if (cell[0] === "x") return 0.72;
    return 0;
  });
}

import { parseBassNotes as parseBassNotesFn, sortAndTrimBassEvents } from "../skt.js";

export function bassDubLineToEvents(pattern, notesText) {
  const notes = parseBassNotesFn(notesText);
  const symbols = parseDubBassSymbols(pattern);
  if (!notes || !symbols) return null;
  const events = [];
  let noteIndex = 0;
  let currentEvent = null;
  symbols.forEach((symbol, tick) => {
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !currentEvent)) {
      const note = notes[noteIndex];
      if (!note) return;
      currentEvent = { tick, midi: note.midi, length: 1, velocity: symbol === "X" ? 1 : 0.85, code: "" };
      events.push(currentEvent);
      noteIndex += 1;
      return;
    }
    if (symbol === "_" && currentEvent) {
      currentEvent.length += 1;
      return;
    }
    currentEvent = null;
  });
  return events.length ? sortAndTrimBassEvents(events) : null;
}

export function detectPasteFormat(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasDub = lines.some((l) => l.startsWith("#") || l.startsWith("@") || l.startsWith(";") || l.startsWith("$:"));
  if (hasDub) return "dub";
  const hasBare = lines.some((l) => /^[a-z][a-z0-9_]*\s*:/i.test(l));
  if (hasBare) return "bare";
  return "dub";
}

export function chordPoolTextState(layerValues, sourceLayerText = null, partCount = 2, formatFn, partSteps = 8) {
  return Array.from({ length: partCount }, (_, partIndex) => (
    sourceLayerText?.[partIndex]
      ? sourceLayerText[partIndex]
      : formatFn ? formatFn(layerValues, partIndex, partSteps) : ""
  ));
}

export function bassTextState(sourceBass, sourceBassText = null, formatBassNotesFn, formatBassPatternFn) {
  const notes = typeof sourceBassText?.notes === "string" ? sourceBassText.notes : (formatBassNotesFn ? formatBassNotesFn(sourceBass) : "");
  const pattern = typeof sourceBassText?.pattern === "string" ? sourceBassText.pattern : (formatBassPatternFn ? formatBassPatternFn(sourceBass) : "");
  return { notes, pattern };
}

export function createBlankScene(index, tracks, chordSteps = 32, chordEditorParts = 2, drumSteps = 32) {
  const trackList = tracks || [];
  return {
    name: `Scene ${index + 1}`,
    rhythm: Array(chordSteps).fill(""),
    harmony: Array(chordSteps).fill(""),
    chordPoolText: {
      rhythm: Array(chordEditorParts).fill(""),
      harmony: Array(chordEditorParts).fill(""),
    },
    chordPatternText: {
      rhythm: Array(chordEditorParts).fill(""),
      harmony: Array(chordEditorParts).fill(""),
    },
    bass: [],
    bassText: {
      notes: "",
      pattern: "",
    },
    drums: Object.fromEntries(trackList.map((track) => [track.key, Array(drumSteps).fill(0)])),
    mutes: {
      rhythm: false,
      harmony: false,
      bass: false,
      drums: Object.fromEntries(trackList.map((track) => [track.key, false])),
    },
    trackVolumes: Object.fromEntries(trackList.map((track) => [track.key, track.volume])),
  };
}

import { chordName as chordNameFn } from "./audio-math.js";

export function normalizeChordCatalog(rawCatalog, fallback = {}) {
  const source = rawCatalog && typeof rawCatalog === "object" ? rawCatalog : fallback;
  return Object.fromEntries(Object.entries(source)
    .map(([name, notes]) => [chordNameFn(name), String(notes || "").trim()])
    .filter(([name, notes]) => name && notes));
}

export function chordCatalogSignature(rawCatalog) {
  return JSON.stringify(Object.entries(normalizeChordCatalog(rawCatalog)).sort(([left], [right]) => left.localeCompare(right)));
}

import { utf8ToBase64Url, base64UrlToUtf8 } from "../skt.js";

export function encodeChordCatalogPayload(rawCatalog) {
  return utf8ToBase64Url(JSON.stringify(normalizeChordCatalog(rawCatalog)));
}

export function decodeChordCatalogPayload(token) {
  const parsed = JSON.parse(base64UrlToUtf8(token));
  return normalizeChordCatalog(parsed);
}

export function normalizeUiMode(rawMode) {
  return ["listen", "edit"].includes(rawMode) ? rawMode : "edit";
}

export function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeDrumSounds(rawDrums, fallback = {}, tracks, drumCatalog) {
  if (typeof rawDrums === "string") {
    const kit = Object.prototype.hasOwnProperty.call(drumCatalog, rawDrums) ? rawDrums : "internal";
    return Object.fromEntries(tracks.map((track) => [track.key, kit]));
  }
  const source = rawDrums && typeof rawDrums === "object" ? rawDrums : {};
  return Object.fromEntries(tracks.map((track) => [
    track.key,
    Object.prototype.hasOwnProperty.call(drumCatalog, source[track.key])
      ? source[track.key]
      : fallback[track.key],
  ]));
}