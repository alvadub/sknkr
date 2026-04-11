// Audio graph - gain topology factory extracted from skanker app.js

import { INTERNAL_SYNTH_PRESETS, SOUND_CATALOG, BASS_PRESETS, DRUM_KIT_CATALOG } from "./audio-data.js";

export function createAudioGraph(ctx, trackKeys, options = {}) {
  const masterGain = ctx.createGain();
  const rhythmGain = ctx.createGain();
  const harmonyGain = ctx.createGain();
  const drumGain = ctx.createGain();
  const bassGain = ctx.createGain();

  const drumTrackGains = {};
  trackKeys.forEach((key) => {
    const gain = ctx.createGain();
    gain.connect(drumGain);
    drumTrackGains[key] = gain;
  });

  rhythmGain.connect(masterGain);
  harmonyGain.connect(masterGain);
  drumGain.connect(masterGain);
  bassGain.connect(masterGain);

  return {
    masterGain,
    rhythmGain,
    harmonyGain,
    drumGain,
    bassGain,
    drumTrackGains,
    connect: (destination) => masterGain.connect(destination),
  };
}

export function applyVolumes(audioGraph, volumes, sceneMutes, time) {
  if (!audioGraph || !time) return;
  const { masterGain, rhythmGain, harmonyGain, drumGain, bassGain, drumTrackGains } = audioGraph;
  masterGain.gain.setTargetAtTime(volumes.master, time, 0.01);
  rhythmGain.gain.setTargetAtTime(sceneMutes?.rhythm ? 0 : volumes.rhythm, time, 0.01);
  harmonyGain.gain.setTargetAtTime(sceneMutes?.harmony ? 0 : volumes.harmony, time, 0.01);
  drumGain.gain.setTargetAtTime(volumes.drums, time, 0.01);
  bassGain.gain.setTargetAtTime(sceneMutes?.bass ? 0 : volumes.bass, time, 0.01);
  if (drumTrackGains) {
    Object.keys(drumTrackGains).forEach((key) => {
      drumTrackGains[key].gain.setTargetAtTime(sceneMutes?.drums?.[key] ? 0 : 1, time, 0.01);
    });
  }
}