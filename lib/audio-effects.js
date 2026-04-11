// Audio effects - extracted from m0s player.js
// These are opt-in additions to the base gain graph

export function createEpicenter(ctx, drive = 4) {
  const curve = new Float32Array(512);
  const norm = Math.tanh(drive) || 1;
  for (let i = 0; i < 512; i += 1) {
    const x = ((i * 2) / (511)) - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "4x";
  return shaper;
}

export function createMasterEQ(ctx) {
  const bands = [
    { freq: 60, type: "lowshelf", gain: 0, Q: 0.7 },
    { freq: 250, type: "peaking", gain: 0, Q: 0.7 },
    { freq: 1000, type: "peaking", gain: 0, Q: 0.7 },
    { freq: 4000, type: "peaking", gain: 0, Q: 0.7 },
    { freq: 12000, type: "highshelf", gain: 0, Q: 0.7 },
  ];
  
  const filters = bands.map(band => {
    const filter = ctx.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.freq;
    filter.gain.value = band.gain;
    filter.Q.value = band.Q;
    return filter;
  });

  const chain = filters.reduce((prev, next) => {
    prev.connect(next);
    return next;
  });

  return { input: filters[0], output: filters[filters.length - 1], bands: filters };
}

export function createDelayBus(ctx, delayTime = 0.375, feedback = 0.3) {
  const delay = ctx.createDelay(5);
  const feedbackGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const toneFilter = ctx.createBiquadFilter();

  delay.delayTime.value = delayTime;
  feedbackGain.gain.value = feedback;
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 4000;

  delay.connect(toneFilter);
  toneFilter.connect(feedbackGain);
  feedbackGain.connect(delay);

  toneFilter.connect(wetGain);

  return {
    input: delay,
    output: wetGain,
    setDelayTime: (val) => { delay.delayTime.value = val; },
    setFeedback: (val) => { feedbackGain.gain.value = val; },
  };
}

export function createReverb(ctx, impulse = null) {
  const convolver = ctx.createConvolver();
  
  if (!impulse) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 2;
    const impulseBuffer = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const channelData = impulseBuffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.5));
      }
    }
    convolver.buffer = impulseBuffer;
  } else {
    convolver.buffer = impulse;
  }

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.3;
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.7;

  return {
    input: convolver,
    wet: wetGain,
    dry: dryGain,
    connectDryTo: (dest) => dryGain.connect(dest),
    connectWetTo: (dest) => wetGain.connect(dest),
  };
}