# Skanker — Source of Truth Spec

> Feed this file to any AI to get full context on the system.
> Keep it updated as decisions solidify. Dated decisions mark when something was settled.

---

## 1. What is Skanker?

**Name:** Skanker (full name) · **SKNKR** (logo / display name)

Skanker is a browser-based music loop tool for writing skanking, harmony, and drum patterns without a DAW. It has two distinct layers:

**The UI layer** (`index.html`, `app.js`, `style.css`) — a static single-file app with no build step. Opens directly in a desktop browser. Provides a 32-step chord grid, drum grid, scene slots, and a chord catalog.

**The lib layer** (`lib/`) — a pure JS library stack ported from `midi-on-scoops` (m0s). Parses and evaluates the DUB text format. No DOM, no audio dependencies. Usable in CLI tools, tests, and Node/Bun environments.

The URL share format (`skt.js`, `codec.js`) encodes full song state into a URL query string using a compact RLE + base64url scheme.

---

## 2. The DUB Text Format

DUB is a line-oriented text format for describing music. A `.dub` file is a plain text file. The parser lives in `lib/parser.js`.

### 2.1 Line types

| First char | Role | Example |
|-----------|------|---------|
| `%` | Variable definition | `%chord Am C F G` |
| `&` | Pattern variable definition | `&kick x--- x--- x--- x---` |
| `# ` (hash space) | Track header | `# Piano` |
| `@` or `ALL_CAPS` identifier | Section scope opener | `@VERSE` or `VERSE` |
| `>` | Arrangement line | `> VERSE x2 CHORUS VERSE OUTRO` |
| `#channel` (starts with `#channel`) | Channel clip (inside a track) | `#piano x-x- Am C` |
| `;` | Comment / lyric line | `; Amazing grace` |
| `--` (suffix) | Inline trailing comment | `#piano x--- Am -- baseline` |

Blank lines are ignored. Lines are stripped of inline comments before parsing.

### 2.2 Variables and pattern variables

```dub
%chords Am C F G
&groove x-x- x-x- x-x- x-x-
```

- `%name` — a named expression, resolved when referenced in channel lines
- `&name` — a named pattern string, expanded in-place when referenced as `&name` in a channel line
- Variables may reference other variables
- Circular references throw `"Circular pattern expression for 'X'"`

### 2.3 Tracks and sections

A **track** is defined by a `# Name` line. All channel clips that follow (until the next track header) belong to that track.

A **section** is defined by `@NAME` or `NAME` (all-caps identifier). Sections scope channel clips into named blocks. A section can inherit from another:

```dub
@VERSE_2 < VERSE
```

Inheritance copies music fields (`rhy`, `har`, `drums`, `bass`). Lyrics are never inherited.

### 2.4 Channel clips

A channel clip is the core data unit. Format:

```
#channel [merge] [velocity] pattern notes...
```

- `#channel` — MIDI channel or alias (e.g. `#piano`, `#bd`, `#1`)
- `merge` — optional `!` (replace) or `+` (layer) operator
- `velocity` — optional numeric level: `0.8`, `96`, `64/127`
- `pattern` — hit/sustain/rest string: `x---x---` or euclidean `bd(3,8)`
- `notes` — chord symbols, note lists, variables, progressions

Examples:

```dub
#piano x-x- Am C F G
#piano 0.8 x--- Am
#bd x--- x--- x--- x---
#piano ! x-x- Am C       -- replace previous clip
#piano + x--- Cmaj7      -- layer on top
```

### 2.5 Pattern syntax

A pattern is a string of hit/sustain/rest symbols:

| Symbol | Meaning |
|--------|---------|
| `x` | hit (note on) |
| `X` | hit (accent, higher velocity) |
| `_` | sustain (extend previous note) |
| `-` | rest |
| `[xx]` | sub-step: two hits subdivided within one grid slot |
| `\|` | bar separator (cosmetic, ignored) |

**Sub-steps** (`[...]`) pack multiple hits into a single grid slot — a subdivision. Each character inside the brackets is a hit or rest at an evenly-spaced sub-position within that slot. Works on any lane including drums:

```dub
#bd  x - [xx] -    -- kick + 32nd pair on beat 3
#hh  [xx][xx][xx][xx]  -- continuous 32nd notes
#sd  - - [xX] -    -- snare with accented ghost hit
```

Euclidean patterns inline: `bd(3,8)` = 3 onsets over 8 steps, optional rotation: `bd(3,8,2)`.

**Pattern references** (`&name`) expand a named pattern variable in-place. Work on any lane including drums:

```dub
&groove x-x- x-x- x-x- x-x-
#bd &groove
#sd - - x - | - - x -
#hh [xx]- [xx]- [xx]- [xx]-
```

### 2.6 Chord and note syntax

Chords use standard symbol notation:

```
Am  C  F7  Cm7b5  Cmaj7  G#m
```

Exact voicings use lowercase note lists: `g3,c4,eb4`

Scale degree selection (tonal derivation):

```
C major ** 1 3 5      -- C, E, G
C major ** 1..7       -- all diatonic degrees
C major ++ I iii V    -- Roman numeral progression
```

Chord unfold (spread across steps): `Am..`

### 2.7 Repeat operators

Three layers, each with a different operator:

| Operator | Layer | Meaning |
|----------|-------|---------|
| `%` | human authoring | repeat previous token once |
| `+` / `+N` | compressor output | 1 more / N more |
| `!N` | SKT encoder / storage | N total occurrences |

Human authors write `%`. The compressor emits `+`/`+N`. The SKT encoder emits `!N`. The decompressor always expands back to `%`.

Round-trip example:

```
Am % % %  →  Am+2  →  Am!3  →  Am+2  →  Am % % %
Am %      →  Am+   →  Am!2  →  Am+   →  Am %
```

`xN` is arrangement-level repeat only (on `>` lines, e.g. `VERSE x2`) — different scope.

### 2.8 Arrangement

The arrangement line defines section playback order:

```
> INTRO VERSE x2 [CHORUS] VERSE OUTRO
```

- `SECTION` — play section once
- `SECTION x2` — play section N times
- `[SECTION]` — live block (toggled during performance; no static repeat)
- `[SECTION x2]` — live block with fixed repeat count
- `%` — repeat last section

### 2.9 Comments

```dub
; this is a full-line comment
#piano x--- Am  -- this is a trailing inline comment
#piano x--- Am  ; also valid inline comment syntax
```

**Lyric lines** are `;` lines that are not chord-shaped, not anchor-only, and not metadata. They belong to the section scope in which they appear. See §7 for the full lyric model.

**Metadata lines** use `; key: value` form (colon is required):

```dub
; tempo: 72
; tempo: 85 (4/4)
```

Meter is set via the optional parenthesised suffix on `tempo`. There is no standalone `meter:` key.

Detection regex: `/^;\s*[\w][\w-]*:\s*.+/` — matches before lyric/anchor/chord classification. The colon is mandatory to prevent collision with lyric text. Key names are lowercase, may contain hyphens. See §13 for scope and semantics.

---

## 3. Token Types (AST)

`lib/tokenize.js` exports `transform(expression)` which returns an array of token objects.

| `type` | `value` shape | Notes |
|--------|--------------|-------|
| `channel` | `"#piano"` | starts with `#` |
| `chord` | `[midi, midi, ...]` | resolved by `harmonics.inlineChord` |
| `note` | `"c4"` | lowercase note name |
| `pattern` | `"x-x-"` | hit/sustain/rest string |
| `pattern_ref` | `"&groove"` | reference to named pattern variable |
| `number` | `0.8` | velocity, level, repeat count |
| `mode` | `"C major"` | scale mode expression |
| `progression` | `"I iii V"` | Roman numeral string |
| `degrees` | `["1", "3..5"]` | degree selection tokens |
| `value` | any string | unclassified or parameter |
| `param` | `"%chords"` | variable reference |
| `divide` | `2` | `/2` operator |
| `multiply` | `3` | `x3` operator |
| `slice` | `[1, 4]` | `1..4` range |

Token objects may carry:
- `repeat: N` — how many times to repeat this token (from `%` operator)
- `unfold: true` — spread chord across multiple steps (from `..` suffix)
- `merge: "layer" | "replace"` — from `+` / `!` on the channel line

---

## 4. The Lib Stack

All files live in `lib/`. All are ESM modules. No DOM dependencies.

### 4.1 `lib/utils.js`

Pure helpers with no dependencies.

```js
flatten(array)          // one-level flatten
repeat(value, times)    // array of N copies
range(min, max, step)   // numeric range array
clone(value)            // deep clone (arrays and plain objects)
zip(a, b, cb)           // zip two arrays with callback
```

### 4.2 `lib/euclidean.js`

Euclidean rhythm generator.

```js
euclidean(onsets, steps, rotation = 0) → "x-x-x---"
parseEuclideanToken("bd(3,8,2)")       → { onsets: 3, steps: 8, rotation: 2 }
```

`parseEuclideanToken` returns `null` for non-euclidean strings.

### 4.3 `lib/channels.js`

Channel alias resolution. Maps human names to MIDI channel/program numbers.

```js
resolveChannelToken("#piano", channelAliases)  → "#0"
resolveChannelToken("#bd", channelAliases)     → "#2001"
normalizeChannelAliases(raw)                   → { drums, instruments, all }
DEFAULT_CHANNEL_ALIASES                        // built-in alias map
```

Built-in drum aliases: `bd/kick → 2001`, `sd/sn/snare → 2004`, `hh/hat → 2035`, `oh/ride → 2081`
Built-in instrument aliases: `piano → 0`, `organ → 16`, `guitar → 24`, `bass → 33`, `strings → 48`, `brass → 61`, `pad → 88`

### 4.4 `lib/tokenize.js`

Tokenizer and type classifier.

```js
transform(expression)   → Token[]   // parse a DUB expression into AST tokens
split(pattern)          → string[]  // split pattern string respecting [brackets]
level(value)            → number    // parse velocity expression (0.8, 64/127, 25%)
isPattern(s)            → boolean
isChord(s)              → boolean
isNote(s)               → boolean
isProgression(s)        → boolean   // Roman numeral check
getType(s)              → "chord"|"note"|"pattern"|"mode"|"number"|"value"
```

Key regexes (exported):
- `RE_PATTERN` — `x`, `_`, `-`, `[...]` combinations
- `RE_CHORD` — `Am`, `Cmaj7`, `G#m7b5`, etc.
- `RE_NOTE` — `c4`, `g#3`, etc.
- `RE_PROG` — `I`, `ii`, `VII°`, etc.
- `RE_PATTERN_REF` — `&name`

### 4.5 `lib/parser.js`

DUB source → structured AST.

```js
parse(source, options)  → { main, data, tracks }
reduce(input, context, mapFn)  → resolved value array
```

**`parse()` output:**

```js
{
  main: [Token[]],         // arrangement entries from > lines
  data: {                  // variable definitions (%name)
    "%chords": Token[]
  },
  tracks: {                // keyed by track name
    "Piano": {             // keyed by resolved channel
      "VERSE#piano": [     // array of clips
        {
          input:  Token[],   // pattern tokens
          values: Token[],   // velocity/level tokens
          data:   Token[],   // note/chord tokens
          merge:  "layer"|"replace"|undefined
        }
      ]
    }
  }
}
```

Non-enumerable property `trackPatternSlots` is attached to the result.

**`reduce()`** walks an array of tokens, resolves variable references, expands progressions and scale degrees, and returns a flat array of values (notes, chords, patterns, numbers).

Parser throws `SyntaxError` with `at line N` in the message on failure.

### 4.6 `lib/arrangement.js`

Arrangement line parser.

```js
parseArrangementBody(body, options)  → { tokens, expanded, nextOrder, nextBlock }
buildArrangementMain(body)           → Token[] | null
```

`expanded` is an array of `{ name, displayOrder, blockId, blockLive, blockStartOrder, blockEndOrder }`.

A `blockLive: true` block has no static repeat count (live performance toggle). `blockLive: false` blocks have a fixed `x2` repeat.

### 4.7 `lib/mixup.js`

Pack, merge, and build MIDI.

```js
pack(values, notes)    → mapFn     // creates a tick-builder callback
merge(context)         → midi[][]  // merges parsed tracks into tick arrays
build(midi, bpm, length) → Buffer  // renders tick arrays to a MIDI file (midi-writer-js)
```

The tick object shape:

```js
{ v: 127, n: "c4" | ["c4", "e4", "g4"], h: 0 }
// v = velocity (0 = rest/hold), n = note(s), h = hold flag
```

`merge()` resolves the arrangement, expands sections, and merges all channel clips into a 2D tick array. The outer array is arrangement slots; inner array is channels.

`build()` emits a multi-track Standard MIDI file. Tempo is set by `bpm`. Default quantization: 16 ticks per beat (`q = 16`).

### 4.8 `lib/compress.js`

DUB source compressor. Finds repeated token sequences and extracts them as `%variable` definitions.

```js
compressDub(source, opts)  → { result, stats }
```

Options:
- `aggressive: false` — if true, extracts shorter sequences
- `minOccurrences: 2` — minimum times a sequence must repeat to be extracted
- `minSequenceLength: 2` — minimum token count for a candidate sequence
- `maxVariableIndex: 1` — max variable name suffix (e.g. `%c1`, `%c2`)

Stats shape: `{ replacements, variables, tokenSavings, charSavings }`.

The compressor outputs `+` / `+N` repeat notation (never `%`). The decompressor expands `+`/`+N` back to `%`.

### 4.9 `lib/lint.js`

Static analysis for DUB source.

```js
lintDub(source, opts)  → { errors: LintItem[], warnings: LintItem[] }
```

A `LintItem` is `{ rule, message, line, stack? }`. `line` is 1-indexed or `null`.

**Error rules:**

| Rule | Trigger |
|------|---------|
| `parse-error` | Source fails `parse()` |
| `unknown-section` | Arrangement token references undefined `@section` |
| `clip-reduce-failed` | A clip's tokens can't be reduced (bad variable reference, etc.) |
| `merge-error` | `merge()` throws after successful parse |

**Warning rules:**

| Rule | Trigger |
|------|---------|
| `unused-section` | `@section` defined but never in arrangement |
| `unused-variable` | `%var` defined but never referenced |
| `unused-pattern-variable` | `&var` defined but never referenced |
| `empty-track` | Track has no channel clips |
| `invalid-instrument` | Channel program number not recognized (requires `opts.resolveInstrument`) |
| `duplicate-input-clips` | Same channel has repeated input clips without `!` or `+` |
| `invalid-level` | Velocity outside 0–127 |
| `missing-pulses` | More notes/chords than hit pulses in pattern |
| `orphan-sustain` | `_` appears before any `x` in pattern |
| `silent-pattern` | Pattern reduces to silence |
| `silent-section` | Entire arrangement section is silent |
| `invalid-token-prefix` | Token has invalid chars before `#`/`@`/`%`/`&` |

Options: `{ context, merged, channelAliases, resolveInstrument }`. Pre-parsed `context` and `merged` can be passed in to avoid re-parsing.

### 4.10 `lib/playground.js`

Metadata extractors and display helpers. No audio, no DOM.

```js
buildSectionTimeline(source)            → SectionTimelineItem[]
buildArrangementDisplayExpansion(source) → { name, displayOrder, ... }[]
```

Used by the UI and by `lintDub` to expand the arrangement for section validation.

---

## 5. The SKT URL Format (`skt.js`, `codec.js`)

The URL share format encodes full song state into a query string. Tokens are separated by `&s[N]=`.

**Header token** encodes BPM, title, sounds, volumes, bass settings:

```
t120.32.BASE64TITLE,korgan.pad.internal.sub,m80.55.35.75.65,b1.dub.2.420.4.22
```

**Scene token** encodes each scene's chord grid, drum grid, bass line, mutes, volumes, name:

```
RHYTHM_RLE.HARMONY_RLE.KICK:SNARE:HIHAT:OPENHAT.BASSNOTES:PATTERN.MUTES.vVOLUMES.nNAME
```

Key codecs (from `codec.js`):
- `encodeChordRle` / `decodeChordRle` — run-length encodes 32-step chord arrays
- `encodeDrumTrack` / `decodeDrumTrack` — encodes drum velocity arrays

Key helpers (from `skt.js`):
- `encodeHeader(state)` / `decodeHeader(token)`
- `encodeScene(scene, index)` / `decodeScene(token, index)`
- `bassPatternToEvents(rawNotes, rawPattern)` → bass event array
- `collectIndexed(params, key)` — extracts indexed URL params

---

## 6. DUB CLI — `bin/dub.js` (planned)

**Status:** Planned. Plan file: `.journal/2026-04-10/plans/30-dub-cli.md`

Three subcommands. Reads `.dub` files or stdin.

### `dub lint [--strict] [files...]`

```
dub lint song.dub
dub lint --strict *.dub
```

- Calls `lintDub(source)` from `lib/lint.js`
- Output format per item: `error:LINE [rule] message` / `warn:LINE [rule] message`
- Exit 0 on no errors; exit 1 on errors; `--strict` exits 1 on warnings too

### `dub compress [options] <file> [output]`

```
dub compress song.dub
dub compress --dry-run song.dub
dub compress --min-occ 3 --min-len 3 song.dub compressed.dub
```

Options: `--dry-run`, `--min-occ N`, `--min-len N`, `--aggressive`
Default output: `<name>.compressed.dub` alongside source
`--dry-run` prints summary without writing

### `dub export [-o dir] [-b] [files...]`

```
dub export song.dub
dub export -o out/ *.dub
dub export -b song.dub          -- all tracks in one MIDI file
```

Pipeline: `parse()` → `merge()` → `build()` → `.mid` file
Default output directory: `generated/`
`-b` bundles all tracks into one multi-track MIDI file
Lyric Meta 0x05 events are embedded at correct tick positions (§7)

**Arg parsing:** `process.argv` directly (no wargs dependency for initial cut).

**Integration test shape:**

```js
import { parseMidi } from 'midi-file';
import { parse } from '../lib/parser.js';
import { merge, build } from '../lib/mixup.js';

const ast  = parse(dubSource);
const midi = build(merge(ast), 120);
const out  = parseMidi(Buffer.from(midi));
// assert: track count, note events, lyric meta events, velocities
```

---

## 7. Lyrics and Karaoke Model (planned)

**Status:** Planned. Plan file: `.journal/2026-04-10/plans/31-lyrics-karaoke.md`

### 7.1 DUB source format (§17 of DUB_SYNTAX.md)

Lyric pairs live inside `@SECTION` blocks, after the header, before `#` channel lines:

```dub
@VERSE
; Amazing grace how sweet
;  ~            ~
; the sound that saved a wretch
;  ~       ~             ~
#piano 0.8 x--- Am F C G
```

**Four `;` comment subtypes — checked in this order:**

| Subtype | Detection | Role |
|---------|-----------|------|
| Metadata | `/^;\s*[\w][\w-]*:\s*.+/` | key: value directive |
| Anchor | `/^;\s*[~^][\s~^]*$/` | chord change positions |
| Chord | `;` line with chord-shaped tokens (`Am`, `F`, `%`) | explicit chord overrides |
| Lyric | everything else | sung text |

**Chunks:** multiple lyric+anchor pairs in one section = sequential rows. Concatenated they form the full lyric for that section. They are not variations — same music, same section.

**Chord sources for `~` anchors:**
- `~` at column C → proportional step in `scene.rhy[]` → resolved chord name
- Explicit chord token on a chord line → used as-is
- `%` in chord line → repeat last chord

### 7.2 Ownership and inheritance

- One lyric definition per named section
- `@VERSE_2 < VERSE` inherits music fields; starts with NO lyrics unless explicitly defined
- Lyrics never inherit — always explicit or absent

### 7.3 SKIR schema

Lyrics are stored on the scene definition as raw pairs with char-offset anchors:

```json
{
  "name": "VERSE",
  "inherits": null,
  "lyrics": [
    { "text": "Amazing grace how sweet",       "anchors": [0, 14] },
    { "text": "the sound that saved a wretch", "anchors": [0, 10, 21] }
  ]
}
```

- `text` — lyric string, stripped of `;` prefix
- `anchors` — char offsets into `text` where chord changes occur
- Step offsets are NOT stored — computed at use time from chunk index + text length

### 7.4 Step offset formula

```
chunk K of N total, section S steps, text length L, anchor at char C:
  step = (K / N) * S + (C / L) * (S / N)
```

### 7.5 MIDI export (Meta Event 0x05 — Lyric)

`build()` in `lib/mixup.js` emits lyric meta events when lyrics are present:

```
for each scene in arrangement order:
  for each lyrics chunk K of N:
    for each anchor at char offset C:
      tick = scene_start_tick + step_to_tick(step_formula(K, N, C, L, S))
      emit Meta 0x05 at tick with resolved chord name
```

Standard MIDI karaoke — any KAR-compatible player can read it.

### 7.6 Runtime events

```js
skanker.on('skir:lyric', ({ scene, chunk, anchorIndex, text, chord }) => {
  // consumer handles display: highlight syllable, show chord chip
});
```

Fires when the playhead crosses an anchor tick.

### 7.7 Kinnor plain text export

Strip `;` from comment lines, prepend section name (strip `@`):

```
VERSE
Am            F
Amazing grace how sweet
```

Chord line reconstructed from `anchors[]` + resolved chord names, padded to char offsets.

### 7.8 Visual editor model (future, not in initial cut)

- Each lyric chunk = one row in the section card
- `~` anchors render as draggable chord chips positioned at `anchors[i]` chars
- Explicit chord tokens render as editable chord chips
- Dragging a chip updates the char offset in `anchors[]`
- Serializing back to DUB reconstructs `; ~  ~  ~` with correct column spacing
- Section card title = `@SECTION` name; inheritance badge if `inherits` set
- UI reference: kinnor.lovable.app

---

## 8. Planned but not yet designed

These are in TASKS.md backlog — no plans written yet.

**Live performance:**
- Quantized live commits (edits apply at next bar/section boundary)
- Track/section cue controls for queued launches
- Safe live-edit modes: `replace`, `overlay`, `mute-old-after-1-bar`
- Per-track live scheduling guard (auto-defers edits that miss the window)
- Visual pending-change preview (ghost highlight + diff)
- Performance recorder for section launches and mixer automation

**Patterns:**
- Pattern macro/mutate operations: `rotate`, `densify`, `thin`, `humanize`, accent transforms
- Live command console: `/jump`, `/solo`, `/fill`, `/loop` with quantized execution

**MIDI:**
- Performance snapshots for one-key recall of mixer + arrangement state
- MIDI mapping for section launch, mute/solo, fills, macro mutations

**Skanker embedded editor (`Write` tab):**
- Minimal DUB editor inside skanker: syntax highlight, chunk eval, inline lint errors via `skanker.setLinter()`
- No mixer, no transport, no performance controls

**m0s full editor rewrite (after skanker core done):**
- Extract UX/UI knowledge from m0s: highlight, tooltips, inline scrubbing, block eval, section muting, autocomplete, MIDI learn, snapshots, live looping
- Rewrite m0s as standalone performance + composition app on top of skanker core
- Evaluate reusing skanker UI modules inside m0s after lyrics UI portability is proven

---

## 9. What is out of scope (for now)

- Audio playback in the CLI — no `play` or `watch` subcommands in the initial cut
- `wargs` / `node-watch` / `keypress` deps — add when surface grows
- `jsmidgen` — confirmed dead, zero usages, dropped
- `wargs`, `tonal-midi` — deferred until CLI surface grows
- `tonal` full library — only `harmonics` is used
- WebAudioFont in the lib layer — UI-only concern
- Any framework or build step for the browser app

---

## 10. Dependencies

```
dependencies:
  harmonics         — chord resolution (inlineChord, scale) used in tokenize.js + parser.js
  midi-writer-js    — MIDI file output used in mixup.js

devDependencies:
  midi-file         — MIDI round-trip parsing for integration tests
```

Runtime (browser app only): Web Audio API, no external audio libs in initial cut.

---

## 11. File map

```
index.html          browser app (single-file, no build)
app.js              app logic (DOM, audio, state)
style.css           styles
skt.js              SKT encode/decode (pure, no DOM)
codec.js            RLE + drum codec helpers

lib/
  utils.js          flatten, repeat, range, clone, zip
  euclidean.js      euclidean(), parseEuclideanToken()
  channels.js       resolveChannelToken(), normalizeChannelAliases()
  tokenize.js       transform(), split(), level(), isX() helpers
  parser.js         parse(), reduce()
  arrangement.js    parseArrangementBody(), buildArrangementMain()
  mixup.js          pack(), merge(), build()
  compress.js       compressDub()
  lint.js           lintDub()
  playground.js     buildSectionTimeline(), buildArrangementDisplayExpansion()

bin/
  dub.js            (planned) CLI entry point

tests/
  *.test.js         bun:test unit tests
```

---

## 12. Key decisions log

| Date | Decision |
|------|----------|
| 2026-04-10 | `%` is human-authored repeat; `+`/`+N` is compressor output; `!N` is SKT storage. These three layers must not be mixed. |
| 2026-04-10 | Skanker takes over as the active DUB runtime. m0s stays as reference only. |
| 2026-04-10 | Lyrics never inherit from parent sections. Always explicit or absent. |
| 2026-04-10 | Lyric anchors stored as char offsets into text, not step offsets. Step offsets computed at use time. |
| 2026-04-10 | No `jsmidgen` — dead dependency, dropped in favor of `midi-writer-js`. |
| 2026-04-10 | DUB CLI uses `process.argv` directly; no `wargs` until surface grows. |
| 2026-04-10 | `dub export` embeds lyric Meta 0x05 events — standard MIDI karaoke format. |
| 2026-04-10 | Metadata lines use `; key: value` form. Colon is required. Checked before lyric/anchor/chord classification. |
| 2026-04-10 | `tempo` is the only timing metadata key. BPM and meter are both optional — `; tempo: 85 (4/4)`, `; tempo: 85`, `; tempo: (5/4)`. At least one must be present. No standalone `meter:` key. |
| 2026-04-10 | Step count is derived from meter: `steps = 32 × N / D`. All lanes share the same count. 4/4 = 32 steps (default, no change). |
| 2026-04-10 | Metadata AST shape: `parse()` gains optional `meta` (file-level) and `sections` (per-section) keys. Existing shape unchanged. Values are parsed — `meter` as `[N,D]`, `steps` pre-derived. Shape is open-ended for future keys. |
| 2026-04-10 | Metadata inherits like music fields (omit = inherit from parent section → file-level → default). Unlike lyrics, which never inherit. |
| 2026-04-10 | Precedence chain: section meta → file-level meta → caller context → hard default (120, 4/4). `parse()` does not resolve the chain — caller does. |
| 2026-04-10 | Scene token `t` part encodes per-scene tempo/meter: `t72`, `t72/5/4`, or `t/5/4`. BPM and meter both optional — at least one present. Consistent with header `t` prefix. Backward-compatible. |
| 2026-04-10 | Meter denominator must be a power of 2 — `D ∈ {2, 4, 8, 16}`. Non-standard denominators (3, 6, etc.) are a lint error. Guarantees integer step counts. |
| 2026-04-12 | Harmony sustain is pattern-controlled, not value-comparison-based. Pattern symbols: `x` = play chord, `_` = sustain (let ring), `-` = release. Consistent with bass pattern behavior. |
| 2026-04-12 | `formatBassPattern()` includes `_` for sustained ticks, not just `x` for note starts. Pattern reflects actual note lengths. |
| 2026-04-12 | Validation feedback: invalid inputs show red border-bottom, stats text turns red, preview overlay text turns red, `.on` spans in preview turn red. Visual consistency across bass and chord editors. |

---

## 13. Pattern System: Bass and Harmony

### 13.1 Pattern symbols

Both bass and harmony use the same pattern syntax:

| Symbol | Meaning |
|--------|---------|
| `x` | hit (note/chord on) |
| `X` | accent (higher velocity) |
| `_` | sustain (extend previous note/chord) |
| `-` | rest (release/silence) |

### 13.2 Bass pattern behavior

Bass patterns operate at tick resolution (128 ticks per loop, 4 ticks per step). The pattern controls:

- When notes start (`x` or `X`)
- When notes sustain (`_`)
- When notes end (`-` or next `x`)

Example: `x___ ---- x--- ----`
- Tick 0: start note
- Ticks 1-3: sustain note
- Ticks 4-15: rest
- Tick 16: start note
- Ticks 17-31: rest

The `formatBassPattern()` function generates patterns from bass events, including `_` for sustained ticks.

### 13.3 Harmony pattern behavior

Harmony patterns operate at step resolution (32 steps per loop). The pattern controls:

- When chords play (`x` or `X`)
- When chords sustain (`_`) — chord continues ringing
- When chords release (`-`) — silence

Example: `x___ ---- x--- ----`
- Step 0: play chord
- Steps 1-3: sustain (chord rings)
- Steps 4-7: release (silence)
- Step 8: play chord
- Steps 9-15: release

**Key difference from old behavior:** Previously, harmony sustained automatically until the next chord or empty slot. Now, `_` explicitly controls sustain length, and `-` explicitly releases.

### 13.4 Implementation details

**Step resolver (`stepResolver` in `app.js`):**
- Returns `null` for `-` → triggers `releaseHarmony()`
- Returns `"_"` for `_` → sustain (no play, no release)
- Returns chord value for `x` → triggers `playHarmony()`

**Audio runtime (`lib/audio-runtime.js`):**
- `playHarmony("_")` returns early (no-op)
- `harmony === null` triggers release
- Any other value triggers play

**Pattern tracking:**
- `harmonyWasActive` flag tracks if a chord is currently ringing
- Reset on stop, pause, and scene change
- Used to handle `_` at pattern start (plays chord if nothing was active)

---

## 14. Metadata System (in exploration)

**Status:** Design in progress. Syntax settled; scope and semantics not yet.

### 13.1 Syntax

Metadata lines are `;` lines with a `key: value` pair. Colon is mandatory.

```dub
; tempo: 72
; tempo: 85 (4/4)
; tempo: 72 (5/4)
```

Detection regex: `/^;\s*[\w][\w-]*:\s*.+/`

Key names: lowercase, may contain hyphens. Values are freeform strings — parsers coerce them as needed per key.

`tempo` is the only key that carries timing. Meter is its optional inline suffix — no standalone `meter:` key exists.

```dub
; tempo: 120         -- tempo only, meter inherited
; tempo: 85 (4/4)    -- tempo + meter
; tempo: 72 (5/4)    -- tempo + odd meter
; tempo: (5/4)       -- meter only, tempo inherited
```

Value parsing for `tempo`: `/^(\d+)?\s*(?:\((\d+\/\d+)\))?$/` — BPM optional, meter optional, at least one present.

### 13.2 Scope levels (open question)

Metadata can appear at multiple levels. The level determines which scope it applies to:

| Placement | Scope |
|-----------|-------|
| Before any track or section | File / global |
| Inside `@SECTION`, before `#` lines | Per-section |
| Other levels TBD | — |

When the same key appears at multiple levels, inner scope wins (section overrides global).

### 13.3 Known keys (candidates)

| Key | Value form | Meaning |
|-----|-----------|---------|
| `tempo` | `BPM` or `BPM (N/D)` | Tempo and optionally meter |

These are not yet implemented — listed here to anchor naming before code is written.

### 13.4 Step count formula

Step count is derived from meter. The invariant is that the steps-per-beat ratio stays constant relative to the 4/4 reference of 32 steps:

```
steps = 32 × N / D
```

| Meter | Steps |
|-------|-------|
| 4/4   | 32 (default, unchanged) |
| 3/4   | 24 |
| 5/4   | 40 |
| 6/8   | 24 |
| 7/8   | 28 |
| 12/8  | 48 |
| 2/2   | 32 |

All lanes (chord grid, drums, bass, lyrics) derive from the same step count, so cross-lane alignment is always preserved. When no meter is specified, 4/4 applies and step count stays 32.

The lyric step offset formula already uses `S` as a free parameter — it survives variable step counts without change.

**Constraint:** D must be a power of 2 — `D ∈ {2, 4, 8, 16}`. This matches standard music notation (denominator = note value: half, quarter, eighth, sixteenth) and guarantees the formula always yields an integer. Denominators like 3 or 6 (`4/3`, `5/6`, `2/3`) are invalid — the linter rejects them with a parse error.

### 13.5 AST placement

`parse()` gains two new optional top-level keys. Existing `{ main, data, tracks }` shape is unchanged — fully backward-compatible.

```js
{
  meta: { tempo: 120, meter: [4, 4], steps: 32 },  // file-level defaults
  sections: {
    "VERSE":  { tempo: 72, meter: [5, 4], steps: 40 },
    "CHORUS": { tempo: 120, meter: [4, 4], steps: 32 },
  },
  main, data, tracks   // unchanged
}
```

Each metadata entry stores parsed values — `meter` as `[N, D]`, `steps` pre-derived — so consumers never recompute.

If no metadata is present in the source, `meta` and `sections` are absent (or empty). Everything behaves as today.

The `sections` map is intentionally open-ended. Future keys (`fade-in`, `fade-out`, `key`, `feel`, etc.) slot in without changing the shape.

Consumer lookup pattern:

```js
const sceneMeta = sections[name] ?? meta ?? {};
const tempo = sceneMeta.tempo ?? globalBpm;
const steps = sceneMeta.steps ?? 32;
```

### 13.6 Inheritance

Metadata inherits like music fields — omitting it on a child section falls through to the parent, then to file-level:

```dub
@VERSE
; tempo: 72 (5/4)
#piano x--- Am F

@VERSE_2 < VERSE        -- inherits tempo 72 (5/4), no need to repeat
#piano x--- Dm G

@BRIDGE                 -- no parent, no metadata → falls through to file-level meta or global default
#piano x--- Em Am
```

Explicit override always wins. Same rule as music fields. Unlike lyrics, which are never inherited.

### 13.7 Precedence chain

```
section meta → file-level meta → caller context (SKT header BPM / app state) → hard default (120, 4/4)
```

`parse()` exposes only what's in the DUB text (`meta`, `sections`). The caller resolves the final value. No coupling between the parser and the app's BPM knob or URL state.

### 13.8 SKT URL encoding

The scene token gains an optional `b` part for per-scene tempo and meter. Only emitted when the scene overrides the global default.

```
tBPM           -- tempo only, meter inherited
tBPM/N/D       -- tempo + meter
t/N/D          -- meter only, tempo inherited
```

Examples:
```
t72            -- 72 BPM, meter inherited
t72/5/4        -- 72 BPM, 5/4
t/5/4          -- 5/4, tempo from higher scope
t120/4/4       -- explicit 4/4 (redundant but valid)
```

BPM and meter are both optional, but at least one must be present.

Detection in the scene decoder: `part.startsWith("t") && /^t(\d+)?(\/\d+\/\d+)?$/.test(part)` — with the constraint that the match is non-empty after `t`.

Backward-compatible — decoders that don't recognize `b` ignore it.

### 13.9 Open questions

- **How far down does metadata go?** Track-level or clip-level metadata not yet explored. Defer until section-level is validated.
