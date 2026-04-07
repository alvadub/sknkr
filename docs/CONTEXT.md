# Context

Skanker started as a single-file Web Audio prototype for composing rhythmic chord chops and simple drum loops without opening a DAW.

The design target is a musician-facing tracker where chord symbols are the primary input, not raw note arrays. A chord symbol can use a default formula, a catalog voicing, or an inline explicit voicing.

## Core Concepts

- A step is one sixteenth note.
- A loop has 32 steps, representing two bars of 4/4.
- Rhythm chords are short percussive chops.
- Harmony chords sustain and use legato behavior when the same chord continues.
- Drum tracks are synthesized internally for the prototype.
- Scenes are fixed slots that can be cloned, cleared, and switched.
- Chord names use canonical chord-symbol casing, for example `Cm7b5`.
- Note lists use lowercase pitch names plus octave numbers, for example `g3,c4,eb4`.

## Important Decisions

- Keep v1 as a single static `index.html` with no dependency or build step.
- Use Web Audio API internal synths for v1.
- Keep WebAudioFont as a v2 audio-backend direction.
- Use a Chord Catalog so reusable voicings can be configured once and referenced from the tracker.
- Use lint-style warnings instead of blocking editing for invalid rows or cells.
- Keep the catalog dialog fixed height and scroll the row table to avoid layout jumps.

## Extracted Source Material

The implementation was extracted from a journal workspace into this standalone repository. The relevant journal plan and summary are preserved under `.journal/2026-04-07/`.
