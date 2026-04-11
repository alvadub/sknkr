// MIDI Learn - ported from m0s src/components/midi-learn.js

import { msgType, msgChannel, msgNumber } from './midi.js';

const STORAGE_KEY = 'skanker:midi-bindings';

export class MidiLearn {
  constructor(midiAccess) {
    this.midiAccess = midiAccess;
    this.bindings = [];
    this.actions = {};
    this.learning = null;
    this.onBound = null;
    this.load();
  }

  startLearn(controlId) {
    this.learning = controlId;
  }

  cancelLearn() {
    this.learning = null;
  }

  bind(controlId, descriptor) {
    this.bindings = this.bindings.filter(item => item.controlId !== controlId);
    this.bindings.push({ controlId, ...descriptor });
    this.save();
  }

  unbind(controlId) {
    this.bindings = this.bindings.filter(item => item.controlId !== controlId);
    this.save();
  }

  setActions(actions) {
    this.actions = actions || {};
  }

  dispatch(data) {
    const type = msgType(data);
    if (type === 'other') return null;
    const descriptor = {
      type,
      channel: msgChannel(data),
      number: msgNumber(data),
    };
    if (this.learning) {
      this.bind(this.learning, descriptor);
      if (typeof this.onBound === 'function') this.onBound(this.learning, descriptor);
      this.learning = null;
      return null;
    }
    const binding = this.bindings.find(item => (
      item.type === descriptor.type
      && item.channel === descriptor.channel
      && item.number === descriptor.number
    ));
    if (!binding) return null;
    const action = this.actions[binding.controlId];
    if (action) action(data);
    return binding.controlId;
  }

  save() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    }
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) this.bindings = parsed;
    } catch (e) {
      this.bindings = [];
    }
  }
}