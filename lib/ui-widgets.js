// UI Widgets - extracted from app.js for reuse across skanker (and eventually m0s)

import { parseChord as parseChordFn } from "./audio-math.js";
import { fixedLengthArray } from "../codec.js";

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
  if (chords.length !== chordPatternStats(pattern).pulses) return null;
  const slots = Array(maxSteps).fill("");
  let chordIndex = 0;
  let currentChord = "";
  pattern.forEach((symbol, step) => {
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
  let chordIndex = -1;
  let hasActiveChord = false;
  for (let i = 0; i <= activeStep && i < pattern.length; i++) {
    const symbol = pattern[i];
    if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveChord)) {
      chordIndex += 1;
      hasActiveChord = true;
    } else if (symbol === "-") {
      hasActiveChord = false;
    }
  }
  return chordIndex;
}

export function parseChordPattern(rawPattern, maxSteps = 32) {
  const raw = String(rawPattern || "").trim();
  if (!raw) return [];
  if (/[^xX_\-\s|.0]/.test(raw)) return null;
  const symbols = [...raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-")];
  if (!symbols.length || symbols.length > maxSteps) return null;
  return symbols;
}

export function chordPatternStats(pattern) {
  const stats = { pulses: 0, sustains: 0, rests: 0, steps: pattern.length };
  let hasActiveChord = false;
  pattern.forEach((symbol) => {
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
  if (/[^xX_\-\s|.0]/.test(raw)) return null;
  const symbols = [...raw.replace(/[\s|]/g, "").replace(/[.0]/g, "-")];
  const maxSteps = 32;
  if (!symbols.length || symbols.length > maxSteps || maxSteps % symbols.length !== 0) return null;
  const expanded = [];
  while (expanded.length < maxSteps) expanded.push(...symbols);
  return expanded.slice(0, maxSteps).map((symbol) => {
    if (symbol === "X") return 1;
    if (symbol === "x") return 0.72;
    return 0;
  });
}

export function formatDrumPattern(values) {
  return values.map((v) => {
    if (v === 1) return "X";
    if (v >= 0.72) return "x";
    return "-";
  }).join("");
}

export function renderDrumPatternPreview(preview, rawPattern, activeStep = -1, maxSteps = 32) {
  if (!preview) return;
  preview.replaceChildren();
  const raw = String(rawPattern || "");
  let step = 0;
  [...raw].forEach((char) => {
    if (/[\s|]/.test(char)) {
      preview.append(document.createTextNode(char));
      return;
    }
    const cell = document.createElement("span");
    cell.textContent = char;
    const normalized = char === "." || char === "0" ? "-" : char;
    if (!["x", "X", "_", "-"].includes(normalized) || step >= maxSteps) {
      cell.className = "invalid";
    } else {
      cell.classList.toggle("accent", normalized === "X");
      cell.classList.toggle("on", normalized === "x");
      cell.classList.toggle("sustain", normalized === "_");
      cell.classList.toggle("rest", normalized === "-");
      cell.classList.toggle("playing", step === activeStep);
      cell.dataset.step = step;
    }
    step += 1;
    preview.append(cell);
  });
}

export function renderChordPatternPreview(preview, rawPattern, stepOffset = 0, maxSteps = 8) {
  if (!preview) return;
  preview.replaceChildren();
  const raw = String(rawPattern || "");
  const activeStep = stepOffset;
  let hasActiveChord = false;
  let step = 0;
  [...raw].forEach((char) => {
    if (/[\s|]/.test(char)) {
      preview.append(document.createTextNode(char));
      return;
    }
    const cell = document.createElement("span");
    cell.textContent = char;
    const symbol = char === "." || char === "0" ? "-" : char;
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
    cell.classList.toggle("playing", activeStep === step);
    preview.append(cell);
    step += 1;
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
    const next = [...parsed];
    next[stepIndex] = cycle(parsed[stepIndex]);
    input.value = format(next);
    refresh();
    onToggle(next);
    if (input.isConnected) {
      const charPos = stepToCharIndex(input.value, stepIndex);
      input.focus();
      input.setSelectionRange(charPos, charPos + 1);
    }
  });
  return { refresh, syncScroll };
}