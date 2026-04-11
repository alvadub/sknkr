// AudioRuntime - scheduler + facade extracted from skanker app.js
// Step 7: Build the AudioRuntime facade

import {
  SOUND_CATALOG,
  DRUM_KIT_CATALOG,
  INTERNAL_SYNTH_PRESETS,
  BASS_PRESETS,
} from "./audio-data.js";
import { midiToHz, parseChordToken, ROOTS, bassMidi as bassMidiFn } from "./audio-math.js";
import { createAudioGraph, applyVolumes } from "./audio-graph.js";
import { playInternalChord, playDrumInternal, createBassVoice, releaseBassVoice } from "./audio-voices.js";
import {
  initWebAudioFontPlayer,
  loadSoundProfile,
  cacheInstrument,
  getWebAudioFontPlayer,
} from "./audio-loader.js";

const DEFAULT_LOOKAHEAD = 0.1;
const DEFAULT_TICK_INTERVAL = 0.025;

export class AudioRuntime {
  constructor(ctx, resolver, trackKeys = ["kick", "snare", "hihat", "openhat"], options = {}) {
    this.ctx = ctx;
    this.resolver = resolver;
    this.trackKeys = trackKeys;
    this.options = {
      bpm: options.bpm || 100,
      swing: options.swing || 0,
      lookahead: options.lookahead || DEFAULT_LOOKAHEAD,
      tickInterval: options.tickInterval || DEFAULT_TICK_INTERVAL,
    };

    this.graph = createAudioGraph(ctx, trackKeys);
    this.graph.connect(ctx.destination);

    this.bpm = this.options.bpm;
    this.isPlaying = false;
    this.schedulerTimer = null;
    this.nextStepIndex = 0;
    this.nextNoteTime = 0;
    this.currentStepStartTime = 0;

    this.sounds = {
      rhythm: "organ",
      harmony: "pad",
      drums: { kick: "internal", snare: "internal", hihat: "internal", openhat: "internal" },
    };
    this.kit = "internal";
    this.webAudioFontPresets = new Map();

    this.harmonyVoice = null;
    this.activeBassNotes = new Map();
    this.lastBassMidi = null;

    this.volumes = { master: 0.8, rhythm: 0.55, harmony: 0.35, drums: 0.75, bass: 0.65 };
    this.bassParams = {
      volume: 0.65,
      filter: 420,
      glide: 0.04,
      release: 0.22,
      layers: [{ shape: "sine", detune: 0, gain: 1 }],
    };

    initWebAudioFontPlayer(ctx);
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.nextStepIndex = 0;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.releaseAllNotes();
  }

  scheduler() {
    if (!this.isPlaying) return;

    const secondsPerBeat = 60 / this.bpm;
    const secondsPerStep = secondsPerBeat / 4;
    const swingOffset = this.options.swing * (secondsPerStep * 0.5);

    while (this.nextNoteTime < this.ctx.currentTime + this.options.lookahead) {
      this.currentStepStartTime = this.nextNoteTime;
      const swing = (this.nextStepIndex % 2) === 1 ? swingOffset : 0;
      const stepTime = this.nextNoteTime + swing;

      this.playStep(this.nextStepIndex, stepTime);

      this.nextStepIndex = (this.nextStepIndex + 1) % 16;
      this.nextNoteTime += secondsPerStep;
    }

    this.schedulerTimer = setTimeout(() => this.scheduler(), this.options.tickInterval * 1000);
  }

  playStep(stepIndex, time) {
    const stepEvent = this.resolver(stepIndex);
    if (!stepEvent) return;

    if (stepEvent.rhythm) {
      this.playRhythm(stepEvent.rhythm, time);
    }
    if (stepEvent.harmony) {
      this.playHarmony(stepEvent.harmony, time);
    }
    if (stepEvent.drums) {
      stepEvent.drums.forEach((drum) => {
        this.playDrum(drum.trackKey, time, drum.velocity);
      });
    }
    if (stepEvent.bass) {
      stepEvent.bass.forEach((bass) => {
        this.playBassNote(bass.note, time, bass.tick);
      });
    }
  }

  playRhythm(chord, time) {
    const parsed = this.parseChord(chord, 55);
    if (!parsed) return;

    const sound = SOUND_CATALOG[this.sounds.rhythm];
    const preset = sound?.presetName ? this.webAudioFontPresets.get(sound.presetName) : null;
    const player = getWebAudioFontPlayer();

    if (player && preset) {
      player.queueChord(this.ctx, this.graph.rhythmGain, preset, time, parsed.midi, 0.12, 0.8);
      return;
    }

    const output = this.ctx.createGain();
    output.connect(this.graph.rhythmGain);
    const params = this.getInternalSynthParams(this.sounds.rhythm);
    playInternalChord(this.ctx, parsed.frequencies, output, time, 0.12, 0.15, params);
  }

  playHarmony(chord, time) {
    const parsed = this.parseChord(chord, 48);
    if (!parsed) {
      this.releaseHarmony(time);
      return;
    }
    if (this.harmonyVoice && this.harmonyVoice.label === parsed.label) return;

    this.releaseHarmony(time);

    const sound = SOUND_CATALOG[this.sounds.harmony];
    const preset = sound?.presetName ? this.webAudioFontPresets.get(sound.presetName) : null;
    const player = getWebAudioFontPlayer();

    if (player && preset) {
      this.harmonyVoice = {
        label: parsed.label,
        envelopes: player.queueChord(this.ctx, this.graph.harmonyGain, preset, time, parsed.midi, 8, 0.38),
      };
      return;
    }

    const params = this.getInternalSynthParams(this.sounds.harmony);
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(params.filter, time);
    const baseGain = params.gain || 0.35;
    const gainValue = baseGain / Math.max(1, parsed.frequencies.length);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.08);
    gain.connect(filter);
    filter.connect(this.graph.harmonyGain);

    const oscillators = [];
    const shapes = params.mix ? ["sine", params.shape || "sawtooth"] : [params.shape || "sine", "sine"];
    parsed.frequencies.forEach((frequency) => {
      shapes.forEach((type, typeIndex) => {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, time);
        osc.detune.setValueAtTime((params.detune || 0) + (typeIndex === 0 ? -3 : 3), time);
        osc.connect(gain);
        osc.start(time);
        oscillators.push(osc);
      });
    });

    this.harmonyVoice = { label: parsed.label, gain, oscillators, filter, synthParams: params };
  }

  releaseHarmony(time) {
    if (!this.harmonyVoice) return;
    if (this.harmonyVoice.envelopes) {
      this.harmonyVoice.envelopes.forEach((envelope) => {
        if (typeof envelope.cancel === "function") envelope.cancel(time);
        else if (envelope.out) {
          envelope.out.gain.cancelScheduledValues(time);
          envelope.out.gain.setTargetAtTime(0.0001, time, 0.12);
        }
      });
      this.harmonyVoice = null;
      return;
    }
    const synthParams = this.harmonyVoice.synthParams || {};
    const release = synthParams.release || 0.12;
    this.harmonyVoice.gain.gain.cancelScheduledValues(time);
    this.harmonyVoice.gain.gain.setTargetAtTime(0.0001, time, release);
    if (this.harmonyVoice.filter) {
      this.harmonyVoice.filter.frequency.cancelScheduledValues(time);
      this.harmonyVoice.filter.frequency.setTargetAtTime(100, time, release);
    }
    this.harmonyVoice.oscillators.forEach((osc) => osc.stop(time + release + 0.3));
    this.harmonyVoice = null;
  }

  playDrum(trackKey, time, velocity = 1) {
    const level = 0.7 * (velocity >= 1 ? 1 : 0.28);
    const output = this.graph.drumTrackGains?.[trackKey] || this.graph.drumGain;
    const drumSound = this.drumSoundDefinition(this.sounds.drums[trackKey], trackKey);
    const preset = drumSound?.presetName ? this.webAudioFontPresets.get(drumSound.presetName) : null;
    const player = getWebAudioFontPlayer();

    if (player && preset) {
      player.queueWaveTable(this.ctx, output, preset, time, drumSound.midi, 0.9, level);
      return;
    }

    playDrumInternal(this.ctx, trackKey, output, time, level);
  }

  playBassNote(midi, time, tick) {
    const velocity = 1;
    const key = `bass_${tick}`;
    this.releaseBassNote(key, time);

    const voice = createBassVoice(
      this.ctx,
      midi,
      this.graph.bassGain,
      time,
      this.bassParams.layers,
      this.bassParams.glide,
      this.bassParams.filter,
      this.bassParams.release,
      this.lastBassMidi,
      velocity
    );
    this.activeBassNotes.set(key, voice);
    this.lastBassMidi = midi;
  }

  releaseBassNote(key, time = this.ctx?.currentTime || 0) {
    const voice = this.activeBassNotes.get(key);
    if (!voice) return;
    this.activeBassNotes.delete(key);
    releaseBassVoice(voice, time, this.bassParams.release);
  }

  releaseAllNotes() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.releaseHarmony(time);
    [...this.activeBassNotes.keys()].forEach((key) => this.releaseBassNote(key, time));
  }

  getInternalSynthParams(soundKey) {
    const key = SOUND_CATALOG[soundKey]?.preset || "synth";
    return INTERNAL_SYNTH_PRESETS[key] || INTERNAL_SYNTH_PRESETS.synth;
  }

  drumSoundDefinition(soundKey, trackKey) {
    const kit = DRUM_KIT_CATALOG[this.kit];
    const midiMap = { kick: 36, snare: 38, hihat: 42, openhat: 46 };
    const midi = midiMap[trackKey];
    if (!kit?.suffix || !midi) return null;
    return {
      suffix: kit.suffix,
      midi,
      presetName: `_${kit.suffix}`,
    };
  }

  parseChord(chord, baseMidi = 60) {
    const token = parseChordToken(chord);
    if (!token) return null;

    const rootMidi = baseMidi + ROOTS[token.root];
    const midi = token.quality.intervals.map((interval) => rootMidi + interval);
    if (token.bass) midi.unshift(bassMidiFn(token.bass, rootMidi));
    return {
      label: token.label,
      midi,
      frequencies: midi.map(midiToHz),
    };
  }

  setBPM(bpm) {
    this.bpm = bpm;
  }

  setSwing(amount) {
    this.options.swing = Math.max(0, Math.min(1, amount));
  }

  setVolume(channel, value) {
    this.volumes[channel] = value;
    this.applyVolumes();
  }

  setEffect(name, params) {
    // Placeholder for future effect integration
  }

  applyVolumes() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    applyVolumes(this.graph, this.volumes, {}, time);
  }

  async setKit(kitKey) {
    this.kit = kitKey;
    const kit = DRUM_KIT_CATALOG[kitKey];
    if (kit?.suffix) {
      const variable = `_${kit.suffix}`;
      const url = `https://surikov.github.io/webaudiofontdata/sound/${kit.suffix}.js`;
      await cacheInstrument(url, variable);
      this.webAudioFontPresets.set(variable, window[variable]);
    }
  }

  async setSoundProfile(channel, profileKey) {
    this.sounds[channel] = profileKey;
    const result = await loadSoundProfile(this.ctx, profileKey, SOUND_CATALOG);
    if (result?.preset) {
      this.webAudioFontPresets.set(profileKey, result.preset);
    }
  }
}