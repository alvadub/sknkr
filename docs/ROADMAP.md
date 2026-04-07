# Roadmap

## v1

- Keep the single-file static app easy to open and share manually.
- Validate the browser audio and editing flow by playing with the prototype.
- Refine UI details around the chord catalog, scene workflow, and grid interaction.

## v2

- Add ChordGrid and DrumGrid presets for well-known rhythmic references:
  - reggae
  - ska
  - dancehall
  - rocksteady
  - dub
  - roots
  - one drop
  - steppers
  - funk chops
- Add WebAudioFont as an optional instrument backend:
  - load `webaudiofont@2.6.61`
  - resolve GM aliases such as `piano` to program `0`
  - use `queueWaveTable(...)` for notes
  - use `queueChord(...)` for chords
  - fall back to internal synth voices while presets are loading or unavailable
- Add import/export for JSON project state.
- Add more tone controls and layer-specific timbre choices.

## v3

- Add educational public-domain song presets.
- Add a compressed shareable URL format that stores the whole song state:
  - scenes
  - chord grids
  - drum grids
  - chord catalog
  - tempo
  - volumes
  - selected presets
- Add a larger preset browser for learning and reference exploration.
