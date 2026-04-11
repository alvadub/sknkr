import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoots = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skanker-cli-"));
  tempRoots.push(dir);
  return dir;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runCli(args, options = {}) {
  if (options.stdin !== undefined) {
    const dir = makeTempDir();
    const input = path.join(dir, "stdin.dub");
    fs.writeFileSync(input, options.stdin, "utf8");
    const command = `node ./bin/dub.js ${args.map(shellEscape).join(" ")} < ${shellEscape(input)}`;
    return Bun.spawnSync({
      cmd: ["bash", "-lc", command],
      cwd: "/Users/alvaro/Workspace/skanker",
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  return Bun.spawnSync({
    cmd: ["node", "./bin/dub.js", ...args],
    cwd: "/Users/alvaro/Workspace/skanker",
    stdout: "pipe",
    stderr: "pipe",
  });
}

function text(output) {
  return Buffer.from(output).toString("utf8");
}

afterEach(() => {
  tempRoots.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("dub cli", () => {
  it("lints stdin successfully", () => {
    const source = `
      # lead
        @A
          #33 x---x--- C2 D2
      > A
    `;
    const result = runCli(["lint"], { stdin: source });
    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toContain("<stdin>: 0 error(s), 0 warning(s)");
  });

  it("fails lint in strict mode when warnings exist", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "warn.dub");
    fs.writeFileSync(file, `
      # lead
        @A
          #0 x--- C4 D4
      > A
    `);
    const result = runCli(["lint", "--strict", file]);
    expect(result.exitCode).toBe(1);
    expect(text(result.stdout)).toContain("missing-pulses");
  });

  it("compresses a file to .compressed.dub by default", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "hook.dub");
    fs.writeFileSync(file, `
      # lead
        @A
          #1 x--- C4 D4 E4 F4 C4 D4 E4 F4 C4 D4 E4 F4
      > A
    `);
    const result = runCli(["compress", file]);
    expect(result.exitCode).toBe(0);
    const output = path.join(dir, "hook.compressed.dub");
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.readFileSync(output, "utf8")).toContain("%c1");
  });

  it("supports compress dry-run without writing output", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "dry.dub");
    fs.writeFileSync(file, `
      # lead
        @A
          #1 x--- C4 D4 E4 F4 C4 D4 E4 F4
      > A
    `);
    const result = runCli(["compress", "--dry-run", file]);
    expect(result.exitCode).toBe(0);
    expect(text(result.stdout)).toContain("output:");
    expect(fs.existsSync(path.join(dir, "dry.compressed.dub"))).toBe(false);
  });

  it("exports MIDI into the requested directory", () => {
    const dir = makeTempDir();
    const outDir = path.join(dir, "generated");
    const file = path.join(dir, "song.dub");
    fs.writeFileSync(file, `
      # lead
        @A
          #33 x___x--- C2 D2
      # drums
        @A
          #bd x---
      > A
    `);
    const result = runCli(["export", "-o", outDir, file]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, "song.mid"))).toBe(true);
    expect(text(result.stdout)).toContain("song.dub ->");
  });
});
