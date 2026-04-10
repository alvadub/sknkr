import { describe, it, expect } from 'bun:test';
import {
  CHORD_STEPS, DRUM_STEPS,
  encodeChordRle, decodeChordRle,
  encodeDrumTrack, decodeDrumTrack,
} from '../codec.js';

// helpers
const chordGrid = (entries) => {
  const grid = Array(CHORD_STEPS).fill("");
  entries.forEach(([i, v]) => { grid[i] = v; });
  return grid;
};

const drumTrack = (hits) => {
  const track = Array(DRUM_STEPS).fill(0);
  hits.forEach((i) => { track[i] = 0.75; });
  return track;
};

// --- chord RLE ---

describe('encodeChordRle', () => {
  it('encodes empty grid as -', () => {
    expect(encodeChordRle(Array(CHORD_STEPS).fill(""))).toBe("-");
  });

  it('encodes single chord run', () => {
    const grid = Array(CHORD_STEPS).fill("Am");
    expect(encodeChordRle(grid)).toBe("Am!32");
  });

  it('uses !N for repeated chords', () => {
    const grid = [...Array(8).fill("Am"), ...Array(8).fill("G"), ...Array(16).fill("")];
    expect(encodeChordRle(grid)).toBe("Am!8,G!8");
  });

  it('uses _!N for rest runs', () => {
    const grid = [...Array(4).fill(""), ...Array(4).fill("C"), ...Array(24).fill("")];
    expect(encodeChordRle(grid)).toBe("_!4,C!4");
  });

  it('handles digit-ending chords without ambiguity', () => {
    const grid = [...Array(4).fill("Am7"), ...Array(4).fill("C9"), ...Array(24).fill("")];
    expect(encodeChordRle(grid)).toBe("Am7!4,C9!4");
  });

  it('trims trailing rests', () => {
    const grid = chordGrid([[0, "Dm"], [1, "Dm"]]);
    expect(encodeChordRle(grid)).toBe("Dm!2");
  });
});

describe('decodeChordRle', () => {
  it('decodes - as empty grid', () => {
    expect(decodeChordRle("-")).toEqual(Array(CHORD_STEPS).fill(""));
  });

  it('round-trips simple run', () => {
    const grid = [...Array(8).fill("Am"), ...Array(8).fill("G"), ...Array(16).fill("")];
    expect(decodeChordRle(encodeChordRle(grid))).toEqual(grid);
  });

  it('decodes !N canonical form', () => {
    const result = decodeChordRle("Am!4,G!4");
    expect(result.slice(0, 4)).toEqual(["Am", "Am", "Am", "Am"]);
    expect(result.slice(4, 8)).toEqual(["G", "G", "G", "G"]);
  });

  it('decodes _!N rests', () => {
    const result = decodeChordRle("_!4,Am!4");
    expect(result.slice(0, 4)).toEqual(["", "", "", ""]);
    expect(result.slice(4, 8)).toEqual(["Am", "Am", "Am", "Am"]);
  });

  it('decodes digit-ending chords', () => {
    const result = decodeChordRle("Am7!4,C9!4,Dm7b5!4,G13!4");
    expect(result[0]).toBe("Am7");
    expect(result[4]).toBe("C9");
    expect(result[8]).toBe("Dm7b5");
    expect(result[12]).toBe("G13");
  });

  it('treats bare Am8 as the chord "Am8" (not Am×8)', () => {
    // bare-digit form is ambiguous with chord names — new decoder treats token as chord literal
    const result = decodeChordRle("Am8");
    expect(result[0]).toBe("Am8");
  });

  it('legacy: decodes dot-separator form (C7.4)', () => {
    const result = decodeChordRle("C7.4");
    expect(result.slice(0, 4)).toEqual(Array(4).fill("C7"));
  });
});

describe('chord RLE round-trip', () => {
  it('round-trips mixed runs', () => {
    const grid = [
      ...Array(8).fill("Am"), ...Array(4).fill("G"),
      ...Array(4).fill("F"), ...Array(8).fill("G"),
      ...Array(8).fill(""),
    ];
    expect(decodeChordRle(encodeChordRle(grid))).toEqual(grid);
  });

  it('round-trips all digit-ending chords', () => {
    const grid = [...Array(8).fill("Am7"), ...Array(8).fill("Dm7b5"), ...Array(16).fill("")];
    expect(decodeChordRle(encodeChordRle(grid))).toEqual(grid);
  });
});

// --- drum RLE ---

describe('encodeDrumTrack', () => {
  it('uses tile compression for periodic patterns', () => {
    const track = Array(DRUM_STEPS).fill(0).map((_, i) => i % 2 === 0 ? 0.75 : 0);
    expect(encodeDrumTrack(track)).toBe("(x-)16");
  });

  it('uses !N RLE for sparse patterns', () => {
    // kick on step 0 and 16 only: x + 15 rests + x + 15 rests
    const track = drumTrack([0, 16]);
    expect(encodeDrumTrack(track)).toBe("x-!14x-!14");
  });

  it('emits raw when shorter than RLE', () => {
    // alternating hits — tile wins, but if no tile, raw should be preferred over bloated RLE
    const track = drumTrack([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
    const encoded = encodeDrumTrack(track);
    expect(encoded).toBe("(x-)16");
  });

  it('encodes all-rest track compactly', () => {
    // -!31 (4 chars) beats (-)32 (6 chars)
    expect(encodeDrumTrack(Array(DRUM_STEPS).fill(0))).toBe("-!31");
  });

  it('encodes all-hit track compactly', () => {
    // X!31 (4 chars) beats (X)32 (6 chars)
    const track = Array(DRUM_STEPS).fill(1);
    expect(encodeDrumTrack(track)).toBe("X!31");
  });
});

describe('decodeDrumTrack', () => {
  it('decodes tile compression', () => {
    const result = decodeDrumTrack("(x-)16");
    expect(result[0]).toBe(0.75);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0.75);
  });

  it('decodes !N RLE', () => {
    // x-!14 = x hit, then - + 14 extra rests = 15 rests total
    const result = decodeDrumTrack("x-!14x-!14");
    expect(result[0]).toBe(0.75);
    expect(result.slice(1, 16)).toEqual(Array(15).fill(0));
    expect(result[16]).toBe(0.75);
    expect(result.slice(17)).toEqual(Array(15).fill(0));
  });

  it('decodes raw pattern', () => {
    const result = decodeDrumTrack("x---x---x---x---x---x---x---x---");
    expect(result[0]).toBe(0.75);
    expect(result[1]).toBe(0);
  });
});

describe('drum RLE round-trip', () => {
  it('round-trips sparse kick pattern', () => {
    const track = drumTrack([0, 16]);
    const decoded = decodeDrumTrack(encodeDrumTrack(track));
    expect(decoded[0]).toBe(0.75);
    expect(decoded[16]).toBe(0.75);
    expect(decoded[1]).toBe(0);
    expect(decoded[15]).toBe(0);
  });

  it('round-trips periodic hi-hat', () => {
    const track = Array(DRUM_STEPS).fill(0).map((_, i) => i % 2 === 0 ? 0.75 : 0);
    const decoded = decodeDrumTrack(encodeDrumTrack(track));
    expect(decoded).toEqual(track);
  });

  it('round-trips irregular fill', () => {
    const track = drumTrack([0, 5, 8, 10]);
    const decoded = decodeDrumTrack(encodeDrumTrack(track));
    [0, 5, 8, 10].forEach(i => expect(decoded[i]).toBe(0.75));
    [1, 2, 3, 4, 6, 7, 9, 11].forEach(i => expect(decoded[i]).toBe(0));
  });
});
