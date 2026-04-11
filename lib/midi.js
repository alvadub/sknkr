// MIDI utilities - ported from m0s src/lib/midi.js

export function msgType(data) {
  const status = data[0] & 0xf0;
  if (status === 0xb0) return 'cc';
  if (status === 0x90 && data[2] > 0) return 'noteon';
  if (status === 0x80 || (status === 0x90 && data[2] === 0)) return 'noteoff';
  if (status === 0xe0) return 'pitchbend';
  return 'other';
}

export function msgChannel(data) {
  return data[0] & 0x0f;
}

export function msgNumber(data) {
  return data[1] || 0;
}

export function msgValue(data) {
  return data[2] || 0;
}

export function msgNorm(data) {
  return msgValue(data) / 127;
}

export function pitchbendNorm(data) {
  const raw = ((data[2] << 7) | data[1]) - 8192;
  return raw / 8192;
}

export function parseMidiMessage(data) {
  const type = msgType(data);
  return {
    type,
    channel: msgChannel(data),
    number: msgNumber(data),
    value: msgValue(data),
    normalized: type === 'pitchbend' ? pitchbendNorm(data) : msgNorm(data),
  };
}

export class MidiAccess {
  constructor() {
    this.inputs = new Map();
    this.handlers = new Set();
    this.stateHandlers = new Set();
    this.access = null;
  }

  async connect() {
    if (!navigator.requestMIDIAccess) throw new Error('unsupported');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.sync();
    this.access.onstatechange = () => this.sync();
    return this.getInputNames();
  }

  sync() {
    this.inputs.clear();
    this.access.inputs.forEach((input, id) => {
      this.inputs.set(id, input);
      input.onmidimessage = event => this.dispatch(event.data);
    });
    this.stateHandlers.forEach(fn => fn(this.getInputNames()));
  }

  dispatch(data) {
    this.handlers.forEach(fn => fn(data));
  }

  on(fn) {
    this.handlers.add(fn);
  }

  off(fn) {
    this.handlers.delete(fn);
  }

  onState(fn) {
    this.stateHandlers.add(fn);
  }

  getInputNames() {
    return [...this.inputs.values()].map(input => input.name).filter(Boolean);
  }
}