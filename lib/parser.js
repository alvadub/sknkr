import { inlineChord, scale } from "harmonics";

import { resolveChannelToken } from "./channels.js";
import { buildArrangementMain } from "./arrangement.js";
import { transform, isProgression } from "./tokenize.js";
import { clone, repeat } from "./utils.js";

const ROMAN_TO_DEGREE = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
};

function parseProgressionToken(token) {
  const raw = String(token || "").trim();
  const normalized = raw.replace(/°$/, "").toUpperCase();
  const degree = ROMAN_TO_DEGREE[normalized];
  if (!degree) throw new Error(`Invalid progression symbol '${raw}'`);
  if (raw.endsWith("°")) return { degree, quality: "m7b5" };
  if (raw === raw.toUpperCase()) return { degree, quality: "M" };
  return { degree, quality: "m" };
}

function buildProgressionChords(base, progression) {
  const notes = scale(base);
  if (!Array.isArray(notes) || notes.length < 3) {
    throw new Error(`Unable to resolve progression from '${base}'`);
  }

  const tokens = String(progression || "").trim().split(/\s+/).filter(isProgression);
  return tokens.map((token) => {
    const { degree, quality } = parseProgressionToken(token);
    const root = notes[degree - 1];
    const match = String(root || "").match(/^([A-Ga-g][#b]?)(-?\d+)$/);
    if (!match) throw new Error(`Invalid root note '${root}' for progression '${token}'`);
    const [, pitchClass, octave] = match;
    return inlineChord(`${pitchClass}${quality}_${octave}`);
  });
}

function parseDegreeToken(token) {
  if (/^\d+$/.test(token)) return [parseInt(token, 10)];
  if (/^\d+\.\.\d+$/.test(token)) {
    const [a, b] = token.split("..").map((n) => parseInt(n, 10));
    if (a > b) {
      throw new Error(`Invalid degree range '${token}'. Use ascending ranges like '1..7'`);
    }
    const out = [];
    for (let i = a; i <= b; i += 1) out.push(i);
    return out;
  }
  throw new Error(`Invalid degree expression '${token}'`);
}

function selectScaleDegrees(base, rawDegrees, mapFn) {
  const notes = mapFn(scale(base));
  const values = rawDegrees.reduce((memo, token) => {
    memo.push(...parseDegreeToken(token));
    return memo;
  }, []);

  values.forEach((deg) => {
    if (deg < 1 || deg > notes.length) {
      throw new Error(`Degree '${deg}' is out of range for '${base}'. Allowed range is 1..${notes.length}`);
    }
  });

  return values.map((deg) => notes[deg - 1]);
}

function findSuffixDashCommentIndex(line) {
  const match = line.match(/\s--\s/);
  if (!match || typeof match.index !== "number") return -1;
  if (!/\S/.test(line.slice(0, match.index))) return -1;
  return match.index;
}

function stripInlineComment(line) {
  const semicolonIndex = line.indexOf(";");
  const dashCommentIndex = findSuffixDashCommentIndex(line);

  if (semicolonIndex < 0 && dashCommentIndex < 0) return line;
  if (semicolonIndex < 0) return line.slice(0, dashCommentIndex);
  if (dashCommentIndex < 0) return line.slice(0, semicolonIndex);
  return line.slice(0, Math.min(semicolonIndex, dashCommentIndex));
}

function stripCommentPrefix(line) {
  return String(line || "").replace(/^\s*;\s?/, "");
}

function parseTempoMetadata(raw) {
  const match = String(raw || "").trim().match(/^(?:(\d+)\s*)?(?:\((\d+)\/(\d+)\))?$/);
  if (!match) {
    throw new Error(`Invalid tempo metadata '${raw}'. Use '120', '85 (4/4)', or '(5/4)'`);
  }

  const [, tempoRaw, meterNumRaw, meterDenRaw] = match;
  if (!tempoRaw && !meterNumRaw) {
    throw new Error(`Invalid tempo metadata '${raw}'. Tempo or meter is required`);
  }

  const meta = {};
  if (tempoRaw) {
    const tempo = parseInt(tempoRaw, 10);
    if (!Number.isFinite(tempo) || tempo <= 0) {
      throw new Error(`Invalid tempo '${tempoRaw}'`);
    }
    meta.tempo = tempo;
  }

  if (meterNumRaw && meterDenRaw) {
    const numerator = parseInt(meterNumRaw, 10);
    const denominator = parseInt(meterDenRaw, 10);
    if (!Number.isFinite(numerator) || numerator <= 0) {
      throw new Error(`Invalid meter numerator '${meterNumRaw}'`);
    }
    if (![2, 4, 8, 16].includes(denominator)) {
      throw new Error(`Invalid meter denominator '${meterDenRaw}'. Use one of 2, 4, 8, 16`);
    }
    meta.meter = [numerator, denominator];
    meta.steps = (32 * numerator) / denominator;
  }

  return meta;
}

function parseMetadataComment(line) {
  const match = String(line || "").match(/^\s*;\s*([\w][\w-]*)\s*:\s*(.+)\s*$/);
  if (!match) return null;

  const [, key, raw] = match;
  if (key === "tempo") return parseTempoMetadata(raw);
  return { [key]: raw.trim() };
}

function parseLyricAnchors(line) {
  const content = stripCommentPrefix(line).replace(/\s+$/, "");
  if (!/^[~^][\s~^]*$/.test(content.trim())) return null;

  const anchors = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "~" || content[i] === "^") anchors.push(i);
  }
  return anchors;
}

function isChordToken(token) {
  if (token === "%") return true;
  return /^[A-G](?:#|b)?(?:maj|min|sus|dim|aug|add|m|M|\d|[#b])*(?:\/[A-G](?:#|b)?)?$/i.test(token);
}

function parseChordComment(line) {
  const content = stripCommentPrefix(line).trim();
  if (!content) return null;
  const tokens = content.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return tokens.every(isChordToken) ? tokens : null;
}

function assertNormalizedVelocitySyntax(line) {
  const tokens = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens[0].charAt(0) !== "#") return;

  let index = 1;
  if (tokens[index] === "!" || tokens[index] === "+") index += 1;
  const velocityToken = tokens[index];
  if (!velocityToken) return;

  if (
    (velocityToken.includes("%") && velocityToken.indexOf("%") > 0)
    || (velocityToken.includes("/") && velocityToken.indexOf("/") > 0)
    || (velocityToken.includes("*") && velocityToken.indexOf("*") > 0)
  ) {
    throw new Error(`Deprecated velocity syntax '${velocityToken}'. Use plain numeric form like '0.75' or '96'`);
  }
}

function cloneToken(token) {
  if (!token || typeof token !== "object") return token;
  const cloned = { ...token };
  if (Array.isArray(token.value)) cloned.value = [...token.value];
  return cloned;
}

function expandPatternRefs(tokens, patterns, stack = []) {
  return tokens.reduce((out, token) => {
    if (!token || token.type !== "pattern_ref") {
      out.push(cloneToken(token));
      return out;
    }

    const name = token.value;
    if (stack.includes(name)) {
      throw new Error(`Circular pattern expression for '${name}'`);
    }

    const target = patterns[name];
    if (!target) {
      throw new Error(`Missing pattern expression for '${name}'`);
    }

    const expanded = expandPatternRefs(target, patterns, [...stack, name]);
    const repeats = token.repeat && token.repeat > 1 ? token.repeat : 1;

    for (let i = 0; i < repeats; i += 1) {
      expanded.forEach((item) => {
        out.push(cloneToken(item));
      });
    }

    return out;
  }, []);
}

export function reduce(input, context, callback) {
  if (!Array.isArray(input)) return input;

  const fn = typeof callback === "function" ? callback : ((v) => v);

  let skip;
  return input.reduce((prev, cur, i) => {
    const last = prev[prev.length - 1];
    const old = input[i - 1] || {};

    if (skip) {
      skip = false;
      return prev;
    }

    if (Array.isArray(cur)) {
      prev.push(...cur);
      return prev;
    }

    if (cur.type === "value" && cur.value === ".") {
      if (prev.length > 0) prev.push(prev[0]);
      return prev;
    }

    if (old.type === "pattern" && cur.type === "pattern") {
      prev[prev.length - 1] += cur.value;
      return prev;
    }

    switch (cur.type) {
      case "pattern":
      case "number":
      case "note":
        if (cur.repeat) prev.push(...repeat(cur.value, cur.repeat));
        else if (Array.isArray(cur.value)) prev.push(...cur.value);
        else prev.push(cur.value);
        break;

      case "chord":
        if (cur.repeat) prev.push(...repeat(cur.value, cur.repeat));
        else if (cur.unfold) prev.push(...cur.value);
        else prev.push(cur.value);

        if (cur.type !== "chord") {
          skip = true;
        }
        break;

      case "divide":
        prev[prev.length - 1] /= cur.value;
        return prev;

      case "multiply":
        prev.push(...repeat(last, cur.value - 1));
        break;

      case "slice":
        if (Array.isArray(last)) {
          prev[prev.length - 1] = last.slice(cur.value[0] - 1, cur.value[1]);
        } else {
          prev.push(cur.value);
        }
        break;

      case "mode":
        prev[prev.length - 1] = `${last} ${cur.value}`;
        break;

      case "progression":
        if (typeof last !== "string") {
          throw new Error(`Missing expression for '++ ${cur.value}'`);
        }
        if (last.includes("...")) {
          throw new Error(`Invalid syntax '${last} ++ ${cur.value}'. Use either '...' (expand scale) or '++' (progression), not both`);
        }
        prev[prev.length - 1] = `${last} ++ ${cur.value}`;
        break;

      case "degrees":
        if (typeof last !== "string") {
          throw new Error(`Missing expression for '** ${cur.value.join(" ")}'`);
        }
        if (last.includes("...")) {
          throw new Error(`Invalid syntax '${last} ** ${cur.value.join(" ")}'. Use either '...' (expand scale) or '**' (degree selection), not both`);
        }
        prev[prev.length - 1] = `${last} ** ${cur.value.join(" ")}`;
        break;

      case "param":
      case "value": {
        let value = null;
        if (typeof context[cur.value] !== "undefined") value = context[cur.value];
        if (value === null) {
          if (cur.type === "value" && typeof cur.value === "string") {
            if (cur.value.startsWith("++ ") && typeof prev[prev.length - 1] === "string") {
              if (prev[prev.length - 1].includes("...")) {
                throw new Error(`Invalid syntax '${prev[prev.length - 1]} ${cur.value}'. Use either '...' (expand scale) or '++' (progression), not both`);
              }
              prev[prev.length - 1] = `${prev[prev.length - 1]} ${cur.value}`;
              return prev;
            }

            if (cur.value.includes(" ")) {
              prev.push(cur.value);
              return prev;
            }
          }
        }

        if (value === null) {
          throw new Error(`Missing expression for '${cur.value}'`);
        }

        if (value[0] && value[0].type) {
          value = reduce(value, context);

          if (cur.repeat) {
            prev.push(...repeat(value, cur.repeat).reduce((_prev, _cur) => {
              _prev.push(..._cur);
              return _prev;
            }, []));
          } else {
            prev.push(...value);
          }

          return prev;
        }

        value = Array.isArray(value) ? value : [value];
        if (cur.repeat) prev.push(...repeat(value, cur.repeat));
        else prev.push(...value);
      } break;
      default:
        throw new Error(`Unhandled '${cur.type}'`);
    }

    return prev;
  }, []).reduce((memo, item) => {
    const prev = memo[memo.length - 1];

    if (
      Array.isArray(prev)
      && Array.isArray(item)
      && typeof item[0] === "number"
      && item.length === 2
    ) {
      const offset = item[1] === Infinity ? prev.length : item[1];
      const [base, length] = String(offset).split(/\D/);

      memo.pop();
      memo.push(...prev.slice(item[0] - 1, base));

      if (String(offset).includes(">")) {
        const parts = memo.slice(-length - 1);

        parts.pop();
        parts.reverse();
        memo.push(...parts);
      }
      return memo;
    }

    if (typeof item === "string" && item.includes(" ")) {
      if (item.includes(" ** ")) {
        const [base, raw] = item.split(/\s+\*\*\s+/);
        const degreeTokens = raw.trim().split(/\s+/).filter(Boolean);

        memo.push(selectScaleDegrees(base, degreeTokens, fn));
        return memo;
      }

      const chunks = item.split(" ");

      if (chunks.some(isProgression)) {
        const offset = chunks.findIndex(isProgression);
        const [a, b] = [chunks.slice(0, offset), chunks.slice(offset)];

        if (a[a.length - 1] === "++") a.pop();

        memo.push(buildProgressionChords(a.join(" "), b.join(" ")).map((chord) => fn(chord)));
      } else {
        memo.push(fn(scale(item)));
      }
    } else {
      memo.push(fn(item));
    }
    return memo;
  }, []);
}

export function parse(buffer, options = {}) {
  const tracks = {};
  const main = [];
  const data = {};
  const patternData = {};
  const trackPatternSlots = {};
  const sections = {};
  const pendingChordLines = {};
  let meta = null;

  let channel = null;
  let prefix = "";
  let track;
  let info = {};

  function ensureSection(name) {
    if (!name || typeof name !== "string") return null;
    if (!sections[name]) sections[name] = { inherits: null };
    return sections[name];
  }

  buffer.split(/\r?\n/g).forEach((rawLine, nth) => {
    const trimmed = String(rawLine || "").trim();
    if (!trimmed) return;

    if (trimmed.charAt(0) === ";") {
      try {
        const metadata = parseMetadataComment(trimmed);
        if (metadata) {
          if (prefix) {
            Object.assign(ensureSection(prefix), metadata);
          } else {
            meta = { ...(meta || {}), ...metadata };
          }
          return;
        }

        if (!prefix) return;

        const section = ensureSection(prefix);
        const anchors = parseLyricAnchors(trimmed);
        if (anchors) {
          if (!section.lyrics || !section.lyrics.length) return;
          section.lyrics[section.lyrics.length - 1].anchors = anchors;
          return;
        }

        const chordTokens = parseChordComment(trimmed);
        if (chordTokens) {
          if (section.lyrics && section.lyrics.length && !section.lyrics[section.lyrics.length - 1].chords) {
            section.lyrics[section.lyrics.length - 1].chords = chordTokens;
          } else {
            pendingChordLines[prefix] = chordTokens;
          }
          return;
        }

        const text = stripCommentPrefix(trimmed).replace(/\s+$/, "");
        if (!text) return;
        if (!section.lyrics) section.lyrics = [];
        const lyric = { text, anchors: [] };
        if (pendingChordLines[prefix]) {
          lyric.chords = pendingChordLines[prefix];
          delete pendingChordLines[prefix];
        }
        section.lyrics.push(lyric);
        return;
      } catch (error) {
        const msg = typeof error === "string" ? error : error.message;
        throw new SyntaxError(`${msg}\n  at line ${nth + 1}\n${trimmed}`);
      }
    }

    let line = stripInlineComment(rawLine).trim();
    if (!line) return;

    try {
      assertNormalizedVelocitySyntax(line);

      if (line.charAt() === "%") {
        const [name, ...value] = line.split(/\s+/);

        if (value.length > 0) {
          data[name] = transform(value.join(" "));
        }
      } else if (line.charAt() === "&") {
        const [name, ...value] = line.split(/\s+/);

        if (value.length > 0) {
          patternData[name] = transform(value.join(" "));
        }
      } else if (line.indexOf("# ") >= 0) {
        if (track) {
          tracks[track] = info;
          channel = null;
          prefix = "";
          info = {};
        }

        track = line.split(/\s+/).slice(1).join(" ");
      } else if (line.charAt() === ">") {
        const body = line.substr(1).trim();
        const arranged = buildArrangementMain(body);
        main.push(arranged || transform(body));
      } else if (line.charAt() === "@" || /^[A-Z][A-Z0-9]{2,}$/.test(line)) {
        const name = line.charAt() === "@" ? line.substr(1) : line;
        const [sectionName, ...extend] = name.split(" ");
        const section = ensureSection(sectionName);

        if (extend[0] === "<") {
          const key = `${extend[1]}#`;
          section.inherits = extend[1];

          Object.keys(info)
            .filter((x) => x.indexOf(key) === 0)
            .forEach((k) => {
              info[`${sectionName}#${k.split("#")[1]}`] = clone(info[k]);
            });
        }
        prefix = sectionName;
      } else if (line.charAt() !== "%" && line.charAt() !== "&" && line.indexOf(":") > 0) {
        const [name, ...value] = line.split(":");
        const raw = value.join(":").trim();
        const tokens = transform(raw);
        data[name] = tokens.map((token) => {
          if (token.value && typeof token.value === "string" && /^[a-z]$/.test(token.value)) {
            return { type: "value", value: token.value };
          }
          return token;
        });
      } else {
        const ticks = expandPatternRefs(transform(line), patternData);

        if (!ticks[0] || ticks[0].type !== "channel") {
          if (!channel) throw new TypeError(`Missing channel, given '${line}'`);

          const end = info[channel][info[channel].length - 1];

          if (!end.values) end.values = [{ type: "number", value: 127 }];
          end.values.push(...ticks);
          return;
        }

        const notes = ticks.findIndex((x) => ["note", "chord", "param"].includes(x.type));
        const index = ticks.findIndex((x) => x.type === "pattern");
        const value = index > 0 ? ticks.slice(index) : ticks;
        const offset = value.findIndex((x) => x.type !== "pattern");
        const inputs = ticks.slice(0, index > 0 ? index : 1);

        const resolvedChannel = resolveChannelToken(inputs[0].value, options.channelAliases);
        channel = prefix + resolvedChannel;
        if (!info[channel]) {
          info[channel] = [];
        }

        let spec;
        if (notes > 0 && index === -1) {
          const end = info[channel][info[channel].length - 1];
          if (!end || !end.input) {
            throw new TypeError(`Missing expression for '${line}'`);
          }

          spec = {
            input: end.input,
            values: value.slice(1, notes),
            data: value.slice(notes),
          };
        } else if (offset > 0) {
          spec = {
            data: value.slice(offset),
            input: value.slice(0, offset),
          };
        } else if (offset === 0) {
          spec = { values: value.slice(1) };
        } else {
          spec = { input: value };
        }

        if (inputs.length > 1) {
          let rest = inputs.slice(1);
          if (
            rest[0]
            && rest[0].type === "value"
            && (rest[0].value === "!" || rest[0].value === "+")
          ) {
            spec.merge = rest[0].value === "+" ? "layer" : "replace";
            rest = rest.slice(1);
          }
          if (rest.length > 0) {
            spec.values = rest;
          }
        }

        function countPatternSlots(patternString) {
          let count = 0;
          let i = 0;
          while (i < patternString.length) {
            if (patternString[i] === "[") {
              const endBracket = patternString.indexOf("]", i);
              if (endBracket > i) {
                count += 1;
                i = endBracket + 1;
              } else {
                i += 1;
              }
            } else if (patternString[i] === "x" || patternString[i] === "-" || patternString[i] === "_") {
              count += 1;
              i += 1;
            } else {
              i += 1;
            }
          }
          return count;
        }

        let patternSlots = 0;
        if (spec.input && Array.isArray(spec.input)) {
          spec.input.forEach((token) => {
            if (token.type === "pattern" && typeof token.value === "string") {
              patternSlots += countPatternSlots(token.value);
            }
          });
        }
        if (spec.data && Array.isArray(spec.data)) {
          spec.data.forEach((token) => {
            if (token.type === "pattern" && typeof token.value === "string") {
              patternSlots += countPatternSlots(token.value);
            }
          });
        }

        if (!trackPatternSlots[channel]) {
          trackPatternSlots[channel] = 0;
        }
        trackPatternSlots[channel] += patternSlots;

        info[channel].push(spec);
      }
    } catch (error) {
      const msg = typeof error === "string" ? error : error.message;
      throw new SyntaxError(`${msg}\n  at line ${nth + 1}\n${line}`);
    }
  });

  if (track) {
    tracks[track] = info;
  }
  const result = { main, data, tracks };
  if (meta && Object.keys(meta).length > 0) {
    result.meta = meta;
  }
  if (Object.keys(sections).length > 0) {
    result.sections = sections;
  }
  Object.defineProperty(result, "trackPatternSlots", {
    value: trackPatternSlots,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return result;
}
