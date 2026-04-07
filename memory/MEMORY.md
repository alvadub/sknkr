# Memory: Skanker

## Project

Skanker is a static browser prototype for writing skanking, harmony, and drum loops without a DAW.

## Current Architecture

- Root file: `index.html`
- Static hosting target: GitHub Pages from repository root
- Runtime: browser Web Audio API
- Dependencies: none for v1
- State: in-memory JavaScript scene state
- Scene count: four fixed slots
- Grid length: 32 sixteenth-note steps, two bars of 4/4

## Chord Policy

- Chord symbols use canonical chord casing internally and in the UI: `C`, `Cm`, `C7`, `Cm7b5`, `Cmaj7`.
- Note lists use lowercase pitch names with octave numbers: `g3,c4,eb4`.
- Inline voicing format is `Chord=note,note,note`, for example `Cm=g3,c4,eb4`.
- Chord Catalog entries define reusable voicings for chord symbols.
- Invalid chord and note inputs should stay editable and show warning lint styling instead of blocking interaction.

## UI Decisions

- Chord grid cells expose two stacked inputs: Rhythm and Harmony.
- The Chord Catalog uses a compact flat table with fixed-height rows.
- The Chord Catalog dialog has fixed viewport-constrained height and scrolls the row list.
- Duplicate catalog chord names warn and are skipped on save to avoid silent overwrites.
- Scene deletion clears the selected fixed slot rather than removing the tab.

## Future Direction

- v2 should focus on playable style presets for reggae, ska, dancehall, rocksteady, dub, roots, one drop, steppers, and funk chops.
- v2 may add WebAudioFont for better instrument presets, keeping internal synth fallback.
- v3 may add public-domain educational song presets and compressed shareable URLs.
