import { describe, expect, it } from "bun:test";
import { parseMidi } from "midi-file";
import { build, buildSplit, merge } from "../lib/mixup.js";
import { parse } from "../lib/parser.js";

function decodeMidi(buffer) {
  return parseMidi(Uint8Array.from(buffer));
}

function collectEvents(track, type) {
  return track.filter((event) => event.type === type);
}

function flattenTrackEvents(track) {
  const out = [];
  let tick = 0;

  track.forEach((event) => {
    tick += event.deltaTime || 0;
    out.push({ ...event, absoluteTick: tick });
  });

  return out;
}

describe("mixup build", () => {
  it("builds a multi-track MIDI file from merged sections", () => {
    const midi = merge(parse(`
      # lead
        @A
          #1 x---x--- C4 D4
      # drums
        @A
          #bd x---x---
      > A
    `));

    const parsed = decodeMidi(build(midi, 120));
    expect(parsed.header.format).toBe(1);
    expect(parsed.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it("writes melodic program changes and note timing", () => {
    const midi = merge(parse(`
      # lead
        @A
          #33 x___x--- C2 D2
      > A
    `));

    const parsed = decodeMidi(build(midi, 96));
    const melodicTrack = parsed.tracks.find((track) => collectEvents(track, "programChange").length > 0);
    expect(melodicTrack).toBeTruthy();

    const programChange = collectEvents(melodicTrack, "programChange")[0];
    expect(programChange.programNumber).toBe(33);
    expect(programChange.channel).toBe(1);

    const noteOns = collectEvents(melodicTrack, "noteOn");
    expect(noteOns).toHaveLength(2);
    expect(noteOns[0].noteNumber).toBe(36);
    expect(noteOns[0].deltaTime).toBe(0);
    expect(noteOns[1].deltaTime).toBe(0);

    const noteOffs = collectEvents(melodicTrack, "noteOff");
    expect(noteOffs[0].deltaTime).toBe(128);
  });

  it("maps drum aliases to channel 10 percussion notes", () => {
    const midi = merge(parse(`
      # drums
        @A
          #bd x---
          #sd --x-
          #hh x-x-
          #oh ---x
      > A
    `));

    const parsed = decodeMidi(build(midi, 120));
    const drumTracks = parsed.tracks.filter((track) => {
      const noteOns = collectEvents(track, "noteOn");
      return noteOns.length > 0 && noteOns.every((event) => event.channel === 9);
    });
    expect(drumTracks.length).toBeGreaterThan(0);

    const noteNumbers = drumTracks
      .flatMap((track) => collectEvents(track, "noteOn").map((event) => event.noteNumber))
      .sort((a, b) => a - b);
    expect(noteNumbers).toEqual([36, 38, 42, 42, 46]);
  });

  it("sequences arrangement sections instead of overlapping them at tick 0", () => {
    const midi = merge(parse(`
      # lead
        @A
          #33 x--- C4
        @B
          #33 x--- D4
      > A B
    `));

    const parsed = decodeMidi(build(midi, 120));
    const melodicTrack = parsed.tracks.find((track) => collectEvents(track, "programChange").length > 0);
    const timed = flattenTrackEvents(melodicTrack);
    const noteOns = timed.filter((event) => event.type === "noteOn");

    expect(noteOns).toHaveLength(2);
    expect(noteOns[0].absoluteTick).toBe(0);
    expect(noteOns[1].absoluteTick).toBe(128);
  });

  it("builds one MIDI file per rendered lane for split export", () => {
    const midi = merge(parse(`
      # lead
        @A
          #33 x--- C4
      # drums
        @A
          #bd x---
      > A
    `));

    const split = buildSplit(midi, 120);
    expect(split).toHaveLength(2);

    const lead = split.find((track) => track.name === "lead");
    const drums = split.find((track) => track.name === "drums");
    expect(lead).toBeTruthy();
    expect(drums).toBeTruthy();

    const parsedLead = decodeMidi(lead.data);
    const parsedDrums = decodeMidi(drums.data);
    expect(parsedLead.tracks).toHaveLength(1);
    expect(parsedDrums.tracks).toHaveLength(1);
    expect(collectEvents(parsedLead.tracks[0], "programChange")).toHaveLength(1);
    expect(collectEvents(parsedDrums.tracks[0], "noteOn")[0].channel).toBe(9);
  });

  it("emits tempo, time signature, and lyric meta events from scene metadata", () => {
    const ast = parse(`
      ; tempo: 90
      # lead
        @VERSE
        ; Amazing grace how sweet
        ; ~             ~
        ; Am            F
          #33 x---x--- C4 D4
        @CHORUS
        ; tempo: 140 (3/4)
        ; Sing now
        ; ~
        ; G
          #33 x--- C5
      > VERSE CHORUS
    `);

    const scenes = [
      {
        name: "VERSE",
        tempo: 90,
        meter: [4, 4],
        steps: 32,
        lyrics: ast.sections.VERSE.lyrics,
      },
      {
        name: "CHORUS",
        tempo: 140,
        meter: [3, 4],
        steps: 24,
        lyrics: ast.sections.CHORUS.lyrics,
      },
    ];

    const parsed = decodeMidi(build(merge(ast), 120, { scenes }));
    const metaTrack = flattenTrackEvents(parsed.tracks[0]);

    const tempos = metaTrack.filter((event) => event.type === "setTempo");
    expect(tempos).toHaveLength(2);
    expect(tempos[0].microsecondsPerBeat).toBe(Math.round(60000000 / 90));
    expect(tempos[0].absoluteTick).toBe(0);
    expect(tempos[1].microsecondsPerBeat).toBe(Math.round(60000000 / 140));
    expect(tempos[1].absoluteTick).toBe(1024);

    const signatures = metaTrack.filter((event) => event.type === "timeSignature");
    expect(signatures).toHaveLength(2);
    expect(signatures[0].numerator).toBe(4);
    expect(signatures[0].denominator).toBe(4);
    expect(signatures[1].numerator).toBe(3);
    expect(signatures[1].denominator).toBe(4);
    expect(signatures[1].absoluteTick).toBe(1024);

    const lyrics = metaTrack.filter((event) => event.type === "lyrics");
    expect(lyrics.map((event) => event.text)).toEqual([
      "Amazing grace how sweet",
      "Am",
      "F",
      "Sing now",
      "G",
    ]);
    expect(lyrics[0].absoluteTick).toBe(0);
    expect(lyrics[3].absoluteTick).toBe(1024);
  });
});
