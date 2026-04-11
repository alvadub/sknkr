// Audio voice synthesis - extracted from skanker app.js + m0s
// Currently wrapping skanker functions; full extraction is step 2 work

import { INTERNAL_SYNTH_PRESETS, SOUND_CATALOG } from "./audio-data.js";
import { midiToHz } from "./audio-math.js";

export function getInternalSynthParams(soundKey) {
  const key = SOUND_CATALOG[soundKey]?.preset || "synth";
  return INTERNAL_SYNTH_PRESETS[key] || INTERNAL_SYNTH_PRESETS.synth;
}

export function playInternalChord(audioContext, frequencies, output, time, strumLength, release, synthParams = null) {
  const params = synthParams || getInternalSynthParams("pad");
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(params.filter, time);
  const gainNode = audioContext.createGain();
  const baseGain = params.gain || 0.6;
  const gainValue = baseGain / Math.max(1, frequencies.length);
  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.exponentialRampToValueAtTime(gainValue, time + 0.003);
  gainNode.gain.exponentialRampToValueAtTime(gainValue * 0.3, time + strumLength * 0.7);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + strumLength);
  gainNode.connect(filter);
  filter.connect(output);
  frequencies.forEach((frequency, index) => {
    const osc = audioContext.createOscillator();
    osc.type = params.shape || "sawtooth";
    osc.frequency.setValueAtTime(frequency, time);
    osc.detune.setValueAtTime((params.detune || 0) + index * 3, time);
    osc.connect(gainNode);
    osc.start(time);
    osc.stop(time + strumLength + release + 0.02);
  });
}

export function playDrumInternal(audioContext, trackKey, output, time, level = 1) {
  const makeNoise = (duration) => {
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    return source;
  };

  if (trackKey === "kick") {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.14);
    gain.gain.setValueAtTime(0.9 * level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
    osc.connect(gain).connect(output);
    osc.start(time);
    osc.stop(time + 0.4);
    return;
  }

  if (trackKey === "snare") {
    const noise = makeNoise(0.2);
    const noiseFilter = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(900, time);
    noiseGain.gain.setValueAtTime(0.55 * level, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    noise.start(time);
    noise.stop(time + 0.2);

    const tone = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(180, time);
    toneGain.gain.setValueAtTime(0.18 * level, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    tone.connect(toneGain).connect(output);
    tone.start(time);
    tone.stop(time + 0.13);
    return;
  }

  const duration = trackKey === "openhat" ? 0.18 : 0.06;
  const noise = makeNoise(duration);
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(6000, time);
  gain.gain.setValueAtTime((trackKey === "openhat" ? 0.18 : 0.24) * level, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  noise.connect(filter).connect(gain).connect(output);
  noise.start(time);
  noise.stop(time + duration);
}

export function createBassVoice(audioContext, midi, bassGainNode, time, layers, glide = 0.04, filter = 420, release = 0.22, glideFromMidi = null, velocity = 1) {
  const destination = audioContext.createGain();
  const filterNode = audioContext.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(filter, time);
  filterNode.Q.setValueAtTime(5, time);
  destination.connect(filterNode).connect(bassGainNode);

  const voices = layers.map((layer) => {
    const osc = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const frequency = midiToHz(midi);
    osc.type = layer.shape;
    if (glideFromMidi !== null && glide > 0) {
      osc.frequency.setValueAtTime(midiToHz(glideFromMidi), time);
      osc.frequency.linearRampToValueAtTime(frequency, time + glide);
    } else {
      osc.frequency.setValueAtTime(frequency, time);
    }
    osc.detune.setValueAtTime(layer.detune, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.gain * velocity), time + 0.015);
    osc.connect(envelope).connect(destination);
    osc.start(time);
    return { osc, envelope };
  });

  return { destination, filter: filterNode, voices };
}

export function releaseBassVoice(voices, time, release = 0.22) {
  if (!voices || !voices.voices) return;
  voices.voices.forEach((voice) => {
    voice.envelope.gain.cancelScheduledValues(time);
    voice.envelope.gain.setTargetAtTime(0.0001, time, release);
    voice.osc.stop(time + release + 0.1);
  });
}