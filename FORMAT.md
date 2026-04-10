# SKNKR Format Specification

SKIR and SKT — the canonical data model and URL sharing format.

---

## Pipeline

```
App State  ←→  SKIR (JSON)  ←→  SKT (text tokens)  ←→  URL query params
                   ↕
              DUB format  ←→  m0s interop
```

| Format | Role |
|--------|------|
| **SKIR** | SKNKR Intermediate Representation — expanded JSON schema |
| **SKT**  | SKNKR Token — compressed URL-safe text stream |
| **DUB**  | Source authoring format (m0s-compatible) |

---

## Design Goals

1. Compact URLs — a 4-scene song fits in ~300 chars of token text
2. Human-readable — chords and patterns stay legible (`C F G Am`, `x-x-`)
3. Lossless round-trip — SKT ↔ SKIR with no data loss within a version
4. Versioned — old links still decode
5. DUB-compatible vocabulary — reuses DUB pattern chars and chord symbols
6. URL-safe without re-encoding — SKT uses only unreserved characters

---

## 1. SKIR — SKNKR Intermediate Representation

The authoritative expanded format. The app always hydrates to SKIR before rendering or playing. All other formats (SKT, DUB, localStorage snapshot) are serializations of SKIR.

### 1.1 Top-Level Schema

```json
{
  "v": 1,
  "meta": { ... },
  "sounds": { ... },
  "mix": { ... },
  "bass": { ... },
  "catalog": { ... },
  "scenes": [ ... ],
  "arr": "0,1,0,2",
  "lyrics": [ ... ]
}
```

### 1.2 `meta`

```json
{
  "title": "My Song",
  "bpm": 120,
  "steps": 32,
  "key": 0,
  "note": "optional free text"
}
```

- `steps`: loop length per scene. Default `32`. Must be multiple of 16.
- `key`: global transpose in semitones. Default `0`. Maps to DUB `; key: N`.
- `note`: free annotation. Omitted if empty.

### 1.3 `sounds`

```json
{ "rhy": "organ", "har": "pad", "kit": "tr808", "bass": "sub" }
```

Values match SKNKR's internal preset name strings.

### 1.4 `mix`

```json
{
  "master": 0.8, "rhy": 0.55, "har": 0.35, "drums": 0.75, "bass": 0.65,
  "strum": 0.12, "pad_atk": 0.08
}
```

All values `0.0..1.0` except `strum` and `pad_atk` (seconds).

### 1.5 `bass`

```json
{ "on": false, "preset": "sub", "oct": 2, "vol": 0.65, "filter": 420, "glide": 0.04, "rel": 0.22 }
```

### 1.6 `catalog`

Custom chord → note mappings. Only entries differing from built-in defaults.

```json
{ "Cm7b5": "c4,eb4,gb4,bb4", "Fsus2": "f4,g4,c5" }
```

### 1.7 `scenes`

```json
{
  "name": "VERSE",
  "inherits": null,
  "rhy": ["C", "", "", "", "F", "", "", "", "G", "", "", "", "C", "", "", "",
          "C", "", "", "", "F", "", "", "", "G", "", "", "", "C", "", "", ""],
  "har": ["C", "", "", "", "", "", "", "", "Am", "", "", "", "", "", "", "",
          "C", "", "", "", "", "", "", "", "Am", "", "", "", "", "", "", ""],
  "drums": {
    "bd": "x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-x-",
    "sn": "--x---x---x---x---x---x---x---x-",
    "hh": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "oh": "----x-----------x-----------x---"
  },
  "bass": { "notes": "c3 f3 g3 c3", "pat": "x___x___x___x___" },
  "mutes": 0,
  "drum_vol": [1.0, 0.75, 0.45, 0.55],
  "soundOverrides": {
    "rhythm": null, "harmony": null,
    "drums": { "kick": null, "snare": null, "hihat": null, "openhat": null }
  },
  "instruments": [
    { "id": "inst-0", "name": "Lead", "mute": false, "volume": 0.7,
      "sound": "organ", "notes": "c4 e4 g4", "pat": "x---x---x---x---" }
  ]
}
```

- **`name`**: section label (`VERSE`, `CHORUS`, `@A`). Used in DUB source and lyrics UI.
- **`inherits`**: parent scene name string or `null`. Maps to DUB `CHORUS < INTRO`. Missing fields fall back to the parent at hydration time.
- **`rhy` / `har`**: length-32 arrays. Empty string = rest.
- **`drums`**: 4 tracks (`bd`, `sn`, `hh`, `oh`), each `steps` chars from `{x, X, -, _}`. `X` = accented hit.
- **`bass`**: `notes` is a space-separated DUB note list. `pat` is a pattern string.
- **`soundOverrides`**: per-scene sound overrides. `null` = inherit global. Omit if all null.
- **`instruments`**: extra melodic lanes. Omit if empty.
- **`mutes`**: 7-bit bitmask. `bit0=rhy, bit1=har, bit2=bass, bit3=bd, bit4=sn, bit5=hh, bit6=oh`.
- **`drum_vol`**: `[bd, sn, hh, oh]`, `0.0..1.0`. Omit if all defaults.

### 1.8 `arr`

Comma-separated scene indices. Omit if scenes play linearly (0, 1, 2…).

```json
"arr": "0,1,0,1,2,0"
```

### 1.9 `lyrics`

```json
[{
  "occ": 0,
  "scene": 0,
  "occ_in_scene": 0,
  "step_offset": 0,
  "label": "Intro",
  "lines": [
    { "chords": "C F", "text": "Walking down the road" },
    { "chords": "G Am", "text": "Somewhere in my mind" }
  ],
  "notes": "optional performer note",
  "synced_note": "read-only; from ; comments in DUB source"
}]
```

- `occ` — global arrangement occurrence index
- `occ_in_scene` — occurrence index within the scene (VERSE used 3 times → 0, 1, 2)
- `step_offset` — step within the loop where the lyric block starts (0-based)
- `synced_note` — read-only; m0s populates on export; omitted when empty

---

## 2. SKT — SKNKR Token Format

Single-line, URL-safe, compressed text representation of SKIR. No percent-encoding needed.

**Character set:** `A-Z a-z 0-9 . _ - ~ ! * ( ) , : | @`

### 2.1 URL Query Param Schema

Any ordered SKIR sequence uses indexed params `key[N]`:

| Param   | Content |
|---------|---------|
| `s`     | SKT header — meta, sounds, mix, bass |
| `s[N]`  | Scene N |
| `a[N]`  | Arrangement step N — scene index (omit if linear) |
| `l[N]`  | Lyrics occurrence N |
| `i[N]`  | Instrument lane N |
| `c[N]`  | Custom catalog entry N — `symbol:notes` |

Each `key[N]` is self-contained and independently decodable. Missing indices are skipped gracefully.

```javascript
function collectIndexed(params, key) {
  const result = [];
  for (const [k, v] of params) {
    const m = k.match(new RegExp(`^${key}\\[(\\d+)\\]$`));
    if (m) result[Number(m[1])] = v;
  }
  return result.filter(Boolean);
}
```

### 2.2 Grammar

```
header    = meta_tok ( "," sound_tok )? ( "," mix_tok )? ( "," bass_tok )?

meta_tok  = "t" bpm [ "." steps ] [ "." title_b64u ]
sound_tok = "k" rhy_sound "." har_sound "." kit "." bass_sound
mix_tok   = "m" master "." rhy "." har "." drums "." bass [ "." strum "." pad_atk ]
bass_tok  = "b" on "." preset "." oct "." filter "." glide "." rel

scene     = rhy_enc "." har_enc "." drums_enc [ "." bass_enc ] [ "." mutes_hex ]
rhy_enc   = chord_rle
har_enc   = chord_rle
drums_enc = bd_pat ":" sn_pat ":" hh_pat ":" oh_pat
bass_enc  = notes_b64u ":" pat_str
mutes_hex = hex (0-7F)
```

### 2.3 `!N` — Repeat Suffix (DUB Core Syntax)

`!N` is a **first-class DUB language feature** for expressing repetition inline. The same token is valid in DUB source, SKIR chord arrays, and SKT. URL compression is a side-effect.

```
token!N
```

`!` is RFC 3986 unreserved — survives in URLs without percent-encoding. It is the only count separator; bare-digit suffixes (`Am4`) are not valid.

**Why not bare digits:** chord names contain digits (`Am7`, `C9`, `Dm7b5`, `G13`). `Am7` with a bare-digit convention would be ambiguous — "Am × 7" or the chord "Am7"? `!` removes the ambiguity permanently.

#### In chord grids — N = total

`chord!N` = chord repeated N times total. Bare token = 1 step.

```
Am!8,G!4,F!4,G!8      → Am×8, G×4, F×4, G×8  (32 steps)
C!4,F!4,G!4,C!4       → C×4, F×4, G×4, C×4   (rest fills to 32)
_!8,Am!8,_!8,G!8      → rest×8, Am×8, rest×8, G×8
-                      → all 32 steps empty
```

Rules:
- `_!N` = N rest steps. `_` alone = 1 rest.
- Trailing rests to fill `steps` may be omitted.
- Voicing override uses `/` delimiter: `Cm/g3c4eb4!4` = voiced Cm × 4 steps.
- Single `-` = fully empty grid.
- Backward compat: decoder accepts legacy `.` separator (`C7.4`) and bare-digit form (`Am8`) for existing URLs. Encoder always emits `!N`.

Encoder (simplified to one path):
```js
return count === 1 ? value : `${value}!${count}`;
```

#### In drum patterns — N = extra

`ch!N` = character followed by N more of the same. Total = N+1.

| Encoded | Expands to | Verdict |
|---------|------------|---------|
| `x!1`  | `xx`        | redundant (3 chars for 2) |
| `x!2`  | `xxx`       | break-even |
| `x!3`  | `xxxx`      | compact — saves 1 char |
| `x!15` | `x` + 15    | saves 13 chars |

Threshold: emit `!N` only when `1 + 1 + len(str(N)) < N + 1` (saves bytes). Pure encoder optimization — decoder accepts any valid `!N`.

### 2.4 Drum Pattern Encoding

Each track uses `{x, X, -, _}`. Four tracks joined with `:`. Two mechanisms, applied in priority order:

**1. Tile compression** — for periodic patterns:

```
(x-x-)8    → x-x- × 8 = 32-step pattern
(--x-)8    → snare on 3 and 7
(x-)16     → straight hi-hat
(x)32      → all hits
(-)32      → all rests
```

Detection: if `pattern == tile.repeat(N)`, encode as `(tile)N`. Try tile lengths 2, 4, 8, 16 (prefer shortest).

**2. `!N` RLE** — for sparse/aperiodic patterns (N = extra):

```
x!15x!15          → kick on beat 1 and 3  (32 steps, 8 chars)
-!7x!7x!15        → snare on 2 and 4     (32 steps, 10 chars)
x!4x!2x-x!4      → irregular fill
```

Encoder picks whichever is shorter; raw is emitted if neither saves bytes. `(` starts tile; `!` signals extra-count suffix. Both syntaxes are handled in the same decoder pass.

Full drums_enc examples:
```
(x-x-)8:(--x-)8:(x-)16:(----x---)4         ← tile compression
x!15x!15:-!7x!7x!15:(x-)16:x!15x!15        ← sparse RLE
```

### 2.5 Header Tokens

**Meta:** `t` + bpm + optional `.steps` + optional `.title_b64u`
```
t120                → bpm=120, steps=32 (default)
t96.32.TXkgU29uZw  → bpm=96, steps=32, title="My Song"
```

**Sound:** `k` + rhy `.` har `.` kit `.` bass — omit if all defaults (`organ.pad.tr808.sub`)

**Mix:** `m` + volumes and timings as two-digit integers (`round(float × 100)`)
```
m80.55.35.75.65.12.8
→ master=0.80, rhy=0.55, har=0.35, drums=0.75, bass=0.65, strum=0.12s, pad_atk=0.08s
```
Omit `strum`/`pad_atk` suffix if both are defaults.

**Bass:** `b` + on `.` preset `.` oct `.` filter_hz `.` glide_100 `.` rel_100
```
b0.sub.2.420.4.22   → off, oct=2, filter=420Hz, glide=0.04s, rel=0.22s
```
Omit if bass disabled and all values are defaults.

### 2.6 Defaults & Omission Rules

| Field | Default | Omit when |
|-------|---------|-----------|
| `steps` in meta | `32` | unless changed |
| `title` in meta | empty | unless set |
| sound token | `organ.pad.tr808.sub` | all four are defaults |
| mix token | `80.55.35.75.65.12.8` | all seven are defaults |
| bass token | `0.sub.2.420.4.22` | bass off + all defaults |
| harmony grid | all empty | encode as `-` |
| bass in scene | not set | omit `bass_enc` field |
| mutes | `0` | omit `mutes_hex` field |
| drum_vol | all `1.0` | omit from SKIR |
| arr | linear `0,1,2,…` | omit `a[N]` params |

### 2.7 Complete Example

2-scene reggae riddim, 120 BPM, arrangement 0→1→0→1:

```
?s=t120,korgan.pad.tr808.sub,m80.55.35.75.65.12.8
&s[0]=C!4,F!4,G!4,C!4.-.(x-x-)8:(--x-)8:(x-)16:(----x---)4
&s[1]=Am!4,G!4,F!4,E!4.-.(x-x-)8:(x---)8:(x-)16:(-)
&a[0]=0&a[1]=1&a[2]=0&a[3]=1
```

Single loop (no arrangement):
```
?s=t96&s[0]=C!8,Am!8.-.(x-x-)8:(--x-)8:(x-)16:(-)
```

---

## 3. Encoding & Decoding Pipeline

### 3.1 App State → SKIR

```
state.bpm           → meta.bpm
state.scenes[]      → scenes[]
state.sounds        → sounds{}
state.volumes       → mix{}
state.bass          → bass{}
state.chordCatalog  → catalog{} (diff vs defaults only)
state.arrangement   → arr (if non-linear)
state.lyrics        → lyrics[] (if present)
```

### 3.2 SKIR → SKT

```javascript
const skir = toSKIR(state);
const url  = new URL(location.origin + location.pathname);
url.searchParams.set('s', encodeHeader(skir));
skir.scenes.forEach((scene, i)      => url.searchParams.set(`s[${i}]`, encodeScene(scene)));
skir.arr?.forEach((idx, i)          => url.searchParams.set(`a[${i}]`, String(idx)));
skir.lyrics?.forEach((occ, i)       => url.searchParams.set(`l[${i}]`, encodeLyricOccurrence(occ)));
skir.instruments?.forEach((lane, i) => url.searchParams.set(`i[${i}]`, encodeInstrumentLane(lane)));
Object.entries(skir.catalog ?? {})
  .forEach(([sym, notes], i)        => url.searchParams.set(`c[${i}]`, `${sym}:${notes}`));
return url.toString();
```

### 3.3 SKT → SKIR

```javascript
const params = new URLSearchParams(location.search);
const skir   = decodeHeader(params.get('s'));

const scenes = [];
for (const [key, val] of params) {
  const m = key.match(/^s\[(\d+)\]$/);
  if (m) scenes[Number(m[1])] = decodeScene(val);
}
skir.scenes = scenes.filter(Boolean);

const arr = collectIndexed(params, 'a').map(Number);
if (arr.length) skir.arr = arr.join(',');

const c = params.get('c');
const l = params.get('l');
if (c) skir.catalog = JSON.parse(c);
if (l) skir.lyrics  = JSON.parse(l);

fromSKIR(skir);
```

### 3.4 SKIR → App State

Inverse of §3.1. Unknown SKIR fields are ignored (forward compat). Missing fields use app defaults.

---

## 4. Versioning

SKT embeds version as prefix: `v1~...`. For v1 (initial) the prefix may be omitted (implied). Future versions must include it.

Old links always decode — the version prefix selects the correct decoder path.

---

## 5. DUB / m0s Interop

### 5.1 SKIR → DUB

```
meta.bpm          → ; tempo: N
meta.steps / 16   → ; bars: N
scenes[]          → @SLOT sections
scene.rhy[]       → #rhythm vel (pattern) chords...
scene.har[]       → #harmony vel (pattern) chords...
scene.drums.*     → #bd / #sn / #hh / #oh tracks
scene.bass        → #bass vol (pattern) notes...
arr               → $: SLOT1 xN SLOT2 xM ...
```

Velocity from `mix.rhy`, `mix.har`, `mix.bass`, `mix.drums`.

### 5.2 DUB → SKIR

Wrap `importDubText()` — parse DUB → lift into SKIR schema → capture `$:` arrangement into `arr`.

### 5.3 DUB Variable Mapping

| DUB | SKIR macro |
|-----|------------|
| `%chord c4\|g4\|a#4` | value macro |
| `&groove x-x- -x-x` | pattern macro |

`dub_to_skir()`: extract `%`/`&` declarations → SKIR macro definitions.  
`skir_to_dub()`: emit declared macros; substitute references in channel lines.

### 5.4 m0s Integration (future)

SKIR is the interchange format for SKNKR ↔ m0s live sync:
- SKNKR exports SKIR → m0s plays via DUB runtime
- Diff-based updates (changed scenes only) over postMessage or WebSocket
- m0s sends clock/transport events back (playhead, loop count)

Fields used by m0s: `meta.bpm`, `meta.steps`, `scenes[].rhy/har/drums/bass`, `sounds.kit`, `sounds.bass`, `arr`.

---

## 6. Future: SKT Macro System _(deferred)_

A `%`-prefixed definitions block for inter-scene deduplication. Evaluate after initial implementation — only worth it if real songs show significant URL length gains (threshold: 3+ scenes sharing an identical pattern field).

```
t120~%d1=(x-x-)8:(--x-)8:(x-)16:(----x---)4,%r1=C!4,F!4,G!4,C!4~%r1.-.%d1|Am!4,G!4.-.%d1
```

Variable names: `%[a-z][0-9]` (e.g. `%d1` drums, `%r1` rhy). Decoder does a pre-substitution pass before scene parsing.
