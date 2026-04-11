import midiWriter from "midi-writer-js";
import { reduce } from "./parser.js";
import { split, isPattern } from "./tokenize.js";
import { flatten } from "./utils.js";

const {
  Track,
  NoteEvent,
  ProgramChangeEvent,
  TrackNameEvent,
  InstrumentNameEvent,
  Utils,
} = midiWriter;

const DEFAULT = Symbol("@main");
const DRUM_PROGRAM_TO_NOTE = {
  2001: 36,
  2004: 38,
  2028: 39,
  2035: 42,
  2081: 46,
  2123: 50,
};

function isDrumProgram(program) {
  return Number.isFinite(program) && program >= 2000;
}

function midiChannelForProgram(program, melodicIndex) {
  if (isDrumProgram(program)) return 10;
  const normalized = melodicIndex % 15;
  return normalized >= 9 ? normalized + 2 : normalized + 1;
}

function normalizeVelocity(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 64;
  if (raw <= 1) return Math.max(1, Math.round(raw * 100));
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function normalizePitch(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function mergeNotePayload(a, b) {
  const aa = Array.isArray(a) ? a : (a ? [a] : []);
  const bb = Array.isArray(b) ? b : (b ? [b] : []);
  const out = [];

  aa.concat(bb).forEach((note) => {
    if (typeof note === "undefined" || note === null) return;
    if (!out.includes(note)) out.push(note);
  });

  if (out.length === 0) return undefined;
  if (out.length === 1) return out[0];
  return out;
}

function mergeTicks(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (Array.isArray(left) && Array.isArray(right)) {
      const max = Math.max(left.length, right.length);
      const out = [];

      for (let i = 0; i < max; i += 1) {
        out.push(mergeTicks(left[i], right[i]));
      }
      return out;
    }

    return typeof right !== "undefined" ? right : left;
  }

  if (!left) return right;
  if (!right) return left;

  const lv = left.v || 0;
  const rv = right.v || 0;
  const hitLeft = lv > 0;
  const hitRight = rv > 0;

  if (!hitLeft && hitRight) return { ...right };
  if (hitLeft && !hitRight) return { ...left };

  if (!hitLeft && !hitRight) {
    return (left.h || right.h) ? { v: 0, h: 1 } : { v: 0 };
  }

  const out = {
    ...left,
    ...right,
    v: Math.max(lv, rv),
  };
  const note = mergeNotePayload(left.n, right.n);
  if (typeof note !== "undefined") out.n = note;
  return out;
}

function mergeTickLayers(base, top) {
  const max = Math.max(base.length, top.length);
  const out = [];

  for (let i = 0; i < max; i += 1) {
    out.push(mergeTicks(base[i], top[i]));
  }
  return out;
}

function createWriterBuffer(tracks) {
  const writer = new midiWriter.Writer(tracks);
  return writer.buildFile();
}

function normalizeBuildOptions(lengthOrOptions) {
  if (lengthOrOptions && typeof lengthOrOptions === "object" && !Array.isArray(lengthOrOptions)) {
    return { ...lengthOrOptions };
  }
  return { length: lengthOrOptions };
}

function sceneActualLength(parts) {
  return parts.reduce((max, entry) => {
    const ticks = Array.isArray(entry[2]) ? entry[2].length : 0;
    return Math.max(max, ticks);
  }, 0);
}

function forEachScene(midi, scenes, fn) {
  const slotTicks = 32;
  let sceneIndex = 0;
  let startTick = 0;

  midi.forEach((section) => {
    section.forEach((parts) => {
      const scene = Array.isArray(scenes) ? scenes[sceneIndex] || null : null;
      const actualLength = sceneActualLength(parts);
      const declaredSteps = Number.isFinite(scene && scene.steps) ? scene.steps : 0;
      const sceneLength = Math.max(actualLength, declaredSteps);

      fn(parts, {
        scene,
        sceneIndex,
        sceneLength,
        startTick,
        slotTicks,
      });

      startTick += sceneLength * slotTicks;
      sceneIndex += 1;
    });
  });
}

function normalizeChordLabel(chord) {
  return String(chord || "").trim();
}

function resolveRepeatedChords(chords) {
  const out = [];
  let last = "";

  (Array.isArray(chords) ? chords : []).forEach((token) => {
    if (token === "%" && last) {
      out.push(last);
      return;
    }
    last = normalizeChordLabel(token);
    if (last) out.push(last);
  });

  return out;
}

function sceneTickForLyricAnchor(chunkIndex, chunkCount, anchor, textLength, steps, slotTicks) {
  const chunkBase = (chunkIndex / chunkCount) * steps;
  const chunkSpan = steps / chunkCount;
  const offset = textLength > 0 ? (anchor / textLength) * chunkSpan : 0;
  return Math.round((chunkBase + offset) * slotTicks);
}

function buildMetaTrack(scenes, bpm) {
  if (!Array.isArray(scenes) || !scenes.length) return null;

  const track = new Track();
  const events = [];

  track.addEvent(new TrackNameEvent({ text: "Meta" }));

  let currentTempo = null;
  let currentMeter = null;

  function pushMetaEvent(tick, type, body) {
    events.push({ tick, type, body });
  }

  scenes.forEach((sceneInfo) => {
    const tempo = Number.isFinite(sceneInfo.tempo) ? sceneInfo.tempo : bpm;
    if (tempo !== currentTempo) {
      const micros = Math.round(60000000 / tempo);
      pushMetaEvent(sceneInfo.startTick, 0x51, [0x03, ...Utils.numberToBytes(micros, 3)]);
      currentTempo = tempo;
    }

    const meter = Array.isArray(sceneInfo.meter) ? sceneInfo.meter : null;
    if (meter && (!currentMeter || currentMeter[0] !== meter[0] || currentMeter[1] !== meter[1])) {
      pushMetaEvent(sceneInfo.startTick, 0x58, [
        0x04,
        meter[0],
        Math.log2(meter[1]),
        24,
        8,
      ]);
      currentMeter = meter;
    }

    const lyrics = Array.isArray(sceneInfo.lyrics) ? sceneInfo.lyrics : [];
    if (!lyrics.length) return;

    lyrics.forEach((chunk, chunkIndex) => {
      const text = String(chunk.text || "").trim();
      const chunkStartTick = sceneInfo.startTick
        + Math.round((chunkIndex / lyrics.length) * sceneInfo.steps * sceneInfo.slotTicks);

      if (text) {
        const bytes = Utils.stringToBytes(text);
        pushMetaEvent(chunkStartTick, 0x05, [...Utils.numberToVariableLength(bytes.length), ...bytes]);
      }

      const anchors = Array.isArray(chunk.anchors) ? chunk.anchors : [];
      const chords = resolveRepeatedChords(chunk.chords);
      if (!anchors.length || !chords.length) return;

      anchors.forEach((anchor, anchorIndex) => {
        const label = chords[Math.min(anchorIndex, chords.length - 1)];
        if (!label) return;
        const tick = sceneInfo.startTick + sceneTickForLyricAnchor(
          chunkIndex,
          lyrics.length,
          anchor,
          text.length,
          sceneInfo.steps,
          sceneInfo.slotTicks,
        );
        const bytes = Utils.stringToBytes(label);
        pushMetaEvent(tick, 0x05, [...Utils.numberToVariableLength(bytes.length), ...bytes]);
      });
    });
  });

  if (!events.length) return null;

  let previousTick = 0;
  events
    .sort((a, b) => a.tick - b.tick)
    .forEach((event) => {
      const delta = Math.max(0, event.tick - previousTick);
      previousTick = event.tick;
      track.addEvent({
        name: "MetaEvent",
        tick: event.tick,
        data: [
          ...Utils.numberToVariableLength(delta),
          0xff,
          event.type,
          ...event.body,
        ],
      });
    });

  return track;
}

export function renderTracks(midi, bpm = 120, lengthOrOptions = 16) {
  const options = normalizeBuildOptions(lengthOrOptions);
  const tracks = [];
  const rendered = [];
  let melodicChannelIndex = 0;

  function get(nth, name) {
    const key = nth + name;

    if (!get[key]) {
      const track = new Track();
      const program = parseInt(nth, 10) || 0;
      const chan = midiChannelForProgram(program, melodicChannelIndex);

      tracks.push(track);
      get[key] = {
        chan,
        key,
        name: String(name || nth),
        program,
        track,
        tickPointer: 0,
      };
      rendered.push(get[key]);
      track.addEvent(new TrackNameEvent({ text: String(name || nth) }));

      if (isDrumProgram(program)) {
        track.addEvent(new InstrumentNameEvent({ text: "Drums" }));
      } else {
        track.addEvent(new ProgramChangeEvent({
          channel: chan,
          instrument: program,
        }));
        track.addEvent(new InstrumentNameEvent({ text: `Program ${program}` }));
        melodicChannelIndex += 1;
      }
    }
    return get[key];
  }

  forEachScene(midi, options.scenes, (parts, sceneInfo) => {
    parts.forEach((e) => {
        const state = get(e[0], e[1]);
        const { chan, track, program } = state;
        const drumFallback = DRUM_PROGRAM_TO_NOTE[program] || 36;
        const ticks = Array.isArray(e[2]) ? e[2] : [];

        for (let i = 0; i < ticks.length; i += 1) {
          const tick = ticks[i];
          if (!tick || typeof tick !== "object" || !(tick.v > 0)) continue;

          let sustain = 1;
          while (i + sustain < ticks.length) {
            const next = ticks[i + sustain];
            if (!next || typeof next !== "object" || !next.h) break;
            sustain += 1;
          }

          const startTick = sceneInfo.startTick + (i * sceneInfo.slotTicks);
          const durationTicks = sceneInfo.slotTicks * sustain;
          const waitTicks = Math.max(0, startTick - state.tickPointer);

          track.addEvent(new NoteEvent({
            channel: chan,
            pitch: normalizePitch(tick.n, drumFallback),
            wait: waitTicks ? `T${waitTicks}` : 0,
            duration: `T${durationTicks}`,
            velocity: normalizeVelocity(tick.v),
          }));
          state.tickPointer = startTick + durationTicks;
        }
    });
  });

  void options.length;
  return rendered;
}

export function build(midi, bpm = 120, lengthOrOptions = 16) {
  const options = normalizeBuildOptions(lengthOrOptions);
  const rendered = renderTracks(midi, bpm, options);
  const tracks = rendered.map((item) => item.track);
  const sceneMeta = [];

  if (Array.isArray(options.scenes) && options.scenes.length) {
    forEachScene(midi, options.scenes, (_parts, info) => {
      sceneMeta[info.sceneIndex] = {
        ...options.scenes[info.sceneIndex],
        startTick: info.startTick,
        steps: Number.isFinite(options.scenes[info.sceneIndex].steps)
          ? options.scenes[info.sceneIndex].steps
          : info.sceneLength,
        slotTicks: info.slotTicks,
      };
    });
  } else {
    sceneMeta.push({ startTick: 0, tempo: bpm, meter: [4, 4], steps: 32, lyrics: [], slotTicks: 32 });
  }

  const metaTrack = buildMetaTrack(sceneMeta, bpm);
  if (metaTrack) tracks.unshift(metaTrack);
  return createWriterBuffer(tracks);
}

export function buildSplit(midi, bpm = 120, lengthOrOptions = 16) {
  return renderTracks(midi, bpm, lengthOrOptions).map((item) => ({
    ...item,
    data: createWriterBuffer([item.track]),
  }));
}

function buildSceneMap(ctx) {
  const scenes = {};

  Object.entries(ctx.tracks).forEach(([name, channels]) => {
    Object.entries(channels).forEach(([ch, clips]) => {
      const [tag, midi] = ch.split("#");
      const key = tag || DEFAULT;

      let ticks;
      clips.forEach((clip) => {
        const values = clip.values ? reduce(clip.values, ctx.data) : [];
        const notes = clip.data ? reduce(clip.data, ctx.data) : [];

        if (clip.input) {
          if (values.length > 1) values.shift();

          const input = flatten(reduce(clip.input, ctx.data, pack(values, notes)));
          const mode = clip.values
            && clip.values[0]
            && clip.values[0].type === "mode" ? clip.values[0].value : null;

          input.forEach((tick) => {
            if (tick.v > 0) {
              if (mode && values.length > 0) tick[mode[0].toLowerCase()] = values.shift();
            }
          });

          if (clip.merge === "layer" && ticks) {
            ticks = mergeTickLayers(ticks, input);
          } else {
            ticks = input;
          }
        } else if (ticks) {
          const mode = clip.values
            && clip.values[0]
            && clip.values[0].type === "mode" ? clip.values[0].value : null;

          ticks.forEach((tick) => {
            if (tick.v > 0) {
              if (mode && values.length > 0) tick[mode[0].toLowerCase()] = values.shift();
            }
          });
        }
      });

      if (!scenes[key]) scenes[key] = { key, name: key === DEFAULT ? null : String(key), tracks: [] };
      scenes[key].tracks.push([midi, name, ticks]);
    });
  });

  return scenes;
}

export function sequence(ctx) {
  const scenes = buildSceneMap(ctx);
  const main = ctx.main.length ? ctx.main : [[{ type: "value", value: DEFAULT }]];

  return main.flatMap((track) => reduce(track, scenes).flatMap((item) => [].concat(item)));
}

export function pack(values, notes) {
  let offset;
  function cyclical(list, index) {
    if (!Array.isArray(list) || !list.length) return undefined;
    const pos = ((index % list.length) + list.length) % list.length;
    return list[pos];
  }

  function resolve(x) {
    if (Array.isArray(x)) {
      return x.map(resolve);
    }

    if (typeof x === "string" && x.length > 1 && /[x_\-\[\]]/.test(x)) {
      const parts = split(x);
      if (Array.isArray(parts) && parts.length > 1) {
        return parts.map(resolve);
      }
    }

    let token;
    if (!"-x_".includes(x)) {
      token = { v: 127, l: x };
      const velocity = cyclical(values, offset);
      token.v = typeof velocity !== "undefined" ? velocity : token.v || 0;
      const note = cyclical(notes, offset);
      if (typeof note !== "undefined") token.n = note;
      if (values.length === 1) token.v = values[0];
      if (token.v || token.n) offset += 1;
      return token;
    }

    if (x === "-") {
      return { v: 0 };
    }

    if (x === "_") {
      return { v: 0, h: 1 };
    }

    token = { v: 127 };
    const velocity = cyclical(values, offset);
    token.v = typeof velocity !== "undefined" ? velocity : token.v || 0;
    const note = cyclical(notes, offset);
    if (typeof note !== "undefined") token.n = note;
    if (values.length === 1) token.v = values[0];
    if (token.v || token.n) offset += 1;
    return token;
  }

  return (value) => {
    let result = value;
    if (typeof value === "string") {
      if (isPattern(value)) {
        offset = 0;
        result = split(value).map(resolve);
      }
    }
    return result;
  };
}

export function merge(ctx) {
  const scenes = buildSceneMap(ctx);
  const main = ctx.main.length ? ctx.main : [[{ type: "value", value: DEFAULT }]];

  return main.map((track) => reduce(track, scenes).map((item) => [].concat(item).reduce((memo, x) => {
    memo.push(...x.tracks);
    return memo;
  }, [])));
}
