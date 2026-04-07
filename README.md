# Skanker

Skanker is a portable browser prototype for writing skanking, harmony, and drum loops without a DAW.

Open `index.html` directly in a desktop browser, press `Play`, and edit the two-bar grid.

## Current Prototype

- Single-file static app: `index.html`
- No build step, framework, server, or package install
- Web Audio API synth voices for rhythm chords, sustained harmony, and drums
- 32-step two-bar grid
- Stacked Rhythm and Harmony chord inputs per step
- Four drum lanes: kick, snare, hi-hat, open hi-hat
- Four fixed scene slots with clone and delete
- Chord Catalog for reusable chord-symbol voicings
- Canonical chord symbols such as `C`, `Cm`, `C7`, `Cm7b5`, `Cmaj7`
- Lowercase note lists such as `g3,c4,eb4`
- Lint-style warnings for invalid chord and note definitions

## Usage

1. Open `index.html` in Chrome desktop.
2. Edit grid cells with chord symbols such as `C`, `F7`, `Cm7b5`.
3. Use `Chord Catalog` to configure how a chord symbol is voiced.
4. Use inline voicings like `Cm=g3,c4,eb4` when you want a one-off exact voicing.
5. Add drum hits by clicking the drum grid.
6. Clone or delete scenes to compare loop ideas.

## Validation

Run this from the repository root:

```bash
node -e "const fs=require('fs'); const html=fs.readFileSync('index.html','utf8'); const m=html.match(/<script>([\s\S]*)<\/script>/); if(!m) throw new Error('inline script not found'); new Function(m[1]); console.log('inline script parses');"
```

## Project Context

- Journal summary: `.journal/2026-04-07/summary.md`
- Original implementation plan: `.journal/2026-04-07/plans/01-skanking-sequencer-prototype.md`
- Extracted memory: `memory/MEMORY.md`
- Roadmap: `docs/ROADMAP.md`
