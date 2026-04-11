import { describe, expect, it } from "bun:test";
import { parse } from "../lib/parser.js";

function p(value) {
  return { type: "pattern", value };
}

function v(value, isSectionRef) {
  return { type: "value", value, ...(isSectionRef ? { isSectionRef: true } : {}) };
}

function n(value, extra) {
  return { type: "number", value, ...extra };
}

function m(value) {
  return { type: "mode", value };
}

function t(value, extra) {
  return { type: "note", value, ...extra };
}

describe("parser", () => {
  it("extracts locals", () => {
    const sample = `
      %x c4 %
    `;

    expect(parse(sample).data).toEqual({
      "%x": [t("c4", { repeat: 2 })],
    });
  });

  it("expands pattern variables on channel lines", () => {
    const sample = `
      &kick x--- --x-
      # drums
      #1 &kick C4 D4
    `;

    expect(parse(sample).tracks).toEqual({
      drums: {
        "#1": [{
          data: [t("C4"), t("D4")],
          input: [p("x---"), p("--x-")],
        }],
      },
    });
  });

  it("resolves channel aliases to numeric channels", () => {
    const sample = `
      # rhythm
      #bd x---
      #sd --x-
      #hh x-x-
      #piano x--- C4
    `;

    expect(parse(sample).tracks).toEqual({
      rhythm: {
        "#2001": [{ input: [p("x---")] }],
        "#2004": [{ input: [p("--x-")] }],
        "#2035": [{ input: [p("x-x-")] }],
        "#0": [{ input: [p("x---")], data: [t("C4")] }],
      },
    });
  });

  it("rejects legacy velocity shorthand formats", () => {
    expect(() => parse(`
      # groove
      #1 50% x---
    `)).toThrow("Deprecated velocity syntax '50%'");

    expect(() => parse(`
      # groove
      #1 3/4 x---
    `)).toThrow("Deprecated velocity syntax '3/4'");
  });

  it("supports suffix dash comments without breaking pattern tokens", () => {
    const sample = `
      # hats -- track label
      #1 x--- --x- C4 D4 -- accent
      #1 x--- --x- E4 F4
    `;

    expect(parse(sample).tracks).toEqual({
      hats: {
        "#1": [
          {
            data: [t("C4"), t("D4")],
            input: [p("x---"), p("--x-")],
          },
          {
            data: [t("E4"), t("F4")],
            input: [p("x---"), p("--x-")],
          },
        ],
      },
    });
  });

  it("extracts tags and arrangement references", () => {
    const ast = parse(`
      # mix

        @A
          #1 120 x--- ---- c5

        @B
          #1 .   x--- x--- d5

      foo: A A B A
      main: foo x4

      > main
    `);

    expect(ast.data).toEqual({
      foo: [
        { type: "chord", value: ["A4", "Db5", "E5"] },
        { type: "chord", value: ["A4", "Db5", "E5"] },
        { type: "chord", value: ["B4", "Eb5", "Gb5"] },
        { type: "chord", value: ["A4", "Db5", "E5"] },
      ],
      main: [m("foo"), { type: "multiply", value: 4 }],
    });
    expect(ast.main).toEqual([[m("main")]]);
    expect(ast.tracks).toEqual({
      mix: {
        "A#1": [{
          data: [t("c5")],
          input: [p("x---"), p("----")],
          values: [n(120)],
        }],
        "B#1": [{
          data: [t("d5")],
          input: [p("x---"), p("x---")],
          values: [v(".")],
        }],
      },
    });
    expect(ast.sections).toEqual({
      A: { inherits: null },
      B: { inherits: null },
    });
  });

  it("extends section-prefixed tracks", () => {
    const ast = parse(`
      # track
        @A
          #1 x--- x--- C4 D4
        @B < A
          #1 110 120   G4 A4

      # other
        @C
          #1 ---x ---x
    `);

    const base = {
      data: [{ type: "note", value: "C4" }, { type: "note", value: "D4" }],
      input: [{ type: "pattern", value: "x---" }, { type: "pattern", value: "x---" }],
    };

    expect(ast.tracks).toEqual({
      track: {
        "A#1": [base],
        "B#1": [
          base,
          {
            input: base.input,
            values: [{ type: "number", value: 110 }, { type: "number", value: 120 }],
            data: [{ type: "note", value: "G4" }, { type: "note", value: "A4" }],
          },
        ],
      },
      other: {
        "C#1": [{ input: [{ type: "pattern", value: "---x" }, { type: "pattern", value: "---x" }] }],
      },
    });
  });

  it("parses bracket arrangement lines", () => {
    const ast = parse(`
      # groove
        @A
          #1 x---
        @B
          #1 --x-
        @C
          #1 -x--
      > [A B C %]
      > [A B] x2
    `);

    expect(ast.main).toEqual([
      [v("A"), v("B"), v("C"), v("C")],
      [v("A"), v("B"), v("A"), v("B")],
    ]);
  });

  it("preserves metadata and lyric chunks on sections", () => {
    const ast = parse(`
      ; tempo: 96
      @VERSE
      ; tempo: 72 (5/4)
      ; Amazing grace how sweet
      ; ~             ~
      ; Am            F
      # groove
        @VERSE
          #33 x---x--- C4 D4
      > VERSE
    `);

    expect(ast.meta).toEqual({ tempo: 96 });
    expect(ast.sections).toEqual({
      VERSE: {
        inherits: null,
        tempo: 72,
        meter: [5, 4],
        steps: 40,
        lyrics: [{
          text: "Amazing grace how sweet",
          anchors: [0, 14],
          chords: ["Am", "F"],
        }],
      },
    });
  });
});
