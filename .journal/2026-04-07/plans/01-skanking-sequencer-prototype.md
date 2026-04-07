# Build skanking sequencer web prototype

Created: 2026-04-07T15:13:06Z

## Status

In Progress

## Context

This ExecPlan is a living document. Maintain it according to PLANS.md at the repository root.

## Purpose / Big Picture

Build a portable browser prototype for the skanking sequencer described in skanker_sequencer.md. After the change, opening index.html from the repository root should show a 32-step two-bar chord sequencer with Rhythm and Harmony layers, a synchronized four-lane drum grid, scene tabs, global playback controls, and Web Audio synthesis that starts from the Play button.

## Progress

- [x] (2026-04-07 09:11-0600) Loaded project instructions, journal workflow, PLANS.md, docs/AI_TOOLING_GUIDE.md, TASKS.md, and skanker_sequencer.md.
- [ ] Create root index.html with self-contained HTML, CSS, and vanilla JavaScript.
- [ ] Implement chord parsing, Web Audio synths, scheduler, UI state, editing interactions, drums, scenes, and global controls.
- [ ] Validate with static inspection and a browser-friendly syntax check.

## Surprises & Discoveries

- Observation: Existing index.html files are unrelated: tools/web-ui/index.html is for the Codex Broker UI and blog-ai/web/public/index.html is for a separate web app.
  Evidence: Their titles and markup identify different products, so the sequencer should use a new root index.html.

## Decision Log

- Decision: Build the prototype in repository-root index.html rather than reusing existing nested index.html files.
  Rationale: skanker_sequencer.md explicitly calls for a portable single-file index.html, and the existing files serve unrelated apps.
  Date/Author: 2026-04-07 / Codex.

## Outcomes & Retrospective

Not yet complete.

## Context and Orientation

The repository root is /Users/alvaro/Workspace/_notes/journal. The source design is skanker_sequencer.md. The tracked work item is in TASKS.md and points to this plan file. The deliverable is a new index.html in the repository root containing all UI, styling, and Web Audio code without frameworks or a bundler.

A step means one sixteenth note. Thirty-two steps represent two bars of 4/4. A chord symbol is text like C, Cm7, or F#maj7 that will be parsed into MIDI notes and then frequencies for oscillators.

## Plan of Work

Create index.html with a dark responsive UI. The state model will hold bpm, selected layer, master and layer volumes, scene slots, and the current or pending scene. Each scene will hold thirty-two Rhythm chord cells, thirty-two Harmony chord cells, and four drum tracks of thirty-two boolean cells. The chord grid will render two rows of sixteen cells and show both layer values, using full opacity for the active layer and lower opacity for the inactive layer.

Implement parser helpers in JavaScript for root normalization, quality aliases, MIDI conversion, and Hz conversion. Implement RhythmSynth as short sawtooth chords through a low-pass filter, HarmonySynth as sustained sine and triangle voices with legato comparison, and DrumSynth as Web Audio kick, snare, hihat, and open hihat noises. Implement a lookahead scheduler using the AudioContext clock and setInterval.

Wire UI events directly with addEventListener rather than forms: Play, Stop, BPM, Strum Length, Pad Attack, volumes, layer toggle, inline chord editing, double-click/context-menu deletion, drum toggles, scene tabs, and clone.

## Concrete Steps

From /Users/alvaro/Workspace/_notes/journal, edit index.html. Then run a lightweight static check that verifies the file exists, contains a script, and can be parsed enough for obvious syntax errors using an available local runtime if present. Manual browser validation is opening index.html in Chrome desktop, pressing Play, and hearing the seeded demo pattern.

## Validation and Acceptance

Acceptance is behavioral: opening root index.html shows scene tabs 1-4, Play and Stop controls, BPM, Strum Length, Pad Attack, master/Rhythm/Harmony/Drums volumes, a two-row chord grid, and a four-lane drum grid. Clicking a chord cell opens an inline editor, Enter commits the chord, double-click or context menu deletes it, and Play starts a looping two-bar sequence with a moving playhead. Switching scene tabs during playback queues the change until the next loop.

## Idempotence and Recovery

The change is additive: it creates index.html and updates TASKS.md plus this plan. If playback fails, Stop should clear the scheduler and release Harmony voices. If browser audio is blocked, pressing Play resumes AudioContext because it is a user gesture.

## Artifacts and Notes

The existing design source remains skanker_sequencer.md. This plan is linked from TASKS.md for tracking.

## Interfaces and Dependencies

Use only standard browser APIs: HTML, CSS, JavaScript, and Web Audio API with webkitAudioContext fallback. Do not introduce npm dependencies, frameworks, or build steps.

## Plan

1.

## Notes





## Implementation Update - 2026-04-07 09:11-0600

Implemented the prototype in root index.html. It includes the single-file UI, chord parser, RhythmSynth, HarmonySynth with legato, DrumSynth, lookahead scheduler, chord editing, drum editing, scene cloning, queued scene switching, BPM, Strum Length, Pad Attack, and master/layer/track volumes.

Validation completed in terminal: git diff --check passed for index.html, TASKS.md, and this plan; Node successfully parsed the inline script extracted from index.html. Manual browser validation remains: open index.html in Chrome desktop, press Play, and listen for the seeded groove.
