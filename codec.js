export const STEPS = 32;
export const DRUM_STEPS = STEPS;
export const CHORD_STEPS = STEPS;

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function fixedLengthArray(value, fallback = "", length = STEPS) {
  const source = Array.isArray(value) ? value.slice(0, length) : [];
  while (source.length < length) source.push(fallback);
  return source;
}

export function normalizeDrumValue(value) {
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(1, number);
}

export function drumLengthArray(value) {
  const source = Array.isArray(value) ? value.slice(0, DRUM_STEPS) : [];
  if (!source.length) return Array(DRUM_STEPS).fill(0);
  const seed = source.slice();
  if (DRUM_STEPS % seed.length === 0) {
    while (source.length < DRUM_STEPS) source.push(...seed);
  }
  while (source.length < DRUM_STEPS) source.push(0);
  return source.slice(0, DRUM_STEPS);
}

export function drumValueToSymbol(value) {
  const normalized = normalizeDrumValue(value);
  if (normalized >= 0.95) return "X";
  if (normalized > 0) return "x";
  return "-";
}

export function encodeChordRle(grid) {
  const values = fixedLengthArray(grid, "", CHORD_STEPS).map((value) => String(value || "").trim());
  if (values.every((value) => !value)) return "-";
  const groups = [];
  let index = 0;
  while (index < values.length) {
    const value = values[index];
    let count = 1;
    while (index + count < values.length && values[index + count] === value) count += 1;
    groups.push({ value, count });
    index += count;
  }
  while (groups.length && !groups[groups.length - 1].value) groups.pop();
  return groups.map(({ value, count }) => {
    if (!value) return count === 1 ? "_" : `_!${count}`;
    return count === 1 ? value : `${value}!${count}`;
  }).join(",");
}

export function decodeChordRle(rle) {
  const source = String(rle || "").trim();
  if (!source || source === "-") return Array(CHORD_STEPS).fill("");
  const values = [];
  const tokens = source.includes(",") ? source.split(",") : [source];
  tokens.forEach((rawToken) => {
    const token = String(rawToken || "").trim();
    if (!token || values.length >= CHORD_STEPS) return;
    let value = token;
    let count = 1;
    if (token[0] === "_" || token[0] === ".") {
      value = "";
      const countText = token.slice(1).replace(/^!/, "");
      count = countText ? Math.max(1, Math.trunc(clampNumber(countText, 1, CHORD_STEPS, 1))) : 1;
    } else {
      const separated = token.match(/^(.*?)(?:!|\.)(\d+)$/) ||
        (!/[0-9]$/.test(token) ? token.match(/^(.*?)(\d+)$/) : null);
      if (separated) {
        value = separated[1];
        count = Math.max(1, Math.trunc(clampNumber(separated[2], 1, CHORD_STEPS, 1)));
      }
    }
    for (let step = 0; step < count && values.length < CHORD_STEPS; step += 1) values.push(value);
  });
  while (values.length < CHORD_STEPS) values.push("");
  return values.slice(0, CHORD_STEPS);
}

export function encodeDrumTrack(track) {
  const pattern = drumLengthArray(track).map(drumValueToSymbol).join("");
  let best = pattern;
  for (const tileLength of [1, 2, 4, 8, 16]) {
    if (DRUM_STEPS % tileLength !== 0) continue;
    const tile = pattern.slice(0, tileLength);
    if (tile && tile.repeat(DRUM_STEPS / tileLength) === pattern) {
      const candidate = `(${tile})${DRUM_STEPS / tileLength}`;
      if (candidate.length < best.length) best = candidate;
      break;
    }
  }
  let rle = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    let run = 1;
    while (i + run < pattern.length && pattern[i + run] === ch) run++;
    const extra = run - 1;
    rle += (extra > 0 && 2 + String(extra).length < run) ? `${ch}!${extra}` : ch.repeat(run);
    i += run;
  }
  if (rle.length < best.length) best = rle;
  return best;
}

export function decodeDrumTrack(encoded) {
  const source = String(encoded || "").trim();
  let pattern;
  const tiled = source.match(/^\(([xX\-_]+)\)(\d+)$/);
  if (tiled) {
    pattern = tiled[1].repeat(Math.max(1, Math.trunc(clampNumber(tiled[2], 1, DRUM_STEPS, 1))));
  } else {
    pattern = "";
    let i = 0;
    while (i < source.length) {
      const ch = source[i++];
      if (source[i] === "!") {
        const m = source.slice(i + 1).match(/^(\d+)/);
        if (m) {
          pattern += ch.repeat(1 + Number(m[1]));
          i += 1 + m[1].length;
          continue;
        }
      }
      pattern += ch;
    }
  }
  return [...pattern]
    .slice(0, DRUM_STEPS)
    .map((symbol) => {
      if (symbol === "X") return 1;
      if (symbol === "x") return 0.75;
      return 0;
    })
    .concat(Array(Math.max(0, DRUM_STEPS - pattern.length)).fill(0))
    .slice(0, DRUM_STEPS);
}
