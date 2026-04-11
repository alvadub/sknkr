#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { compressDub } from "../lib/compress.js";
import { lintDub } from "../lib/lint.js";
import { build, buildSplit, merge, sequence } from "../lib/mixup.js";
import { parse } from "../lib/parser.js";

const USAGE = `Usage:
  dub lint [--strict] [files...]
  dub compress [--dry-run] [--min-occ N] [--min-len N] [--aggressive] <file> [output]
  dub export [-o dir] [--split] [-b] [files...]
`;

function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readText(file) {
  const filepath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${file}`);
  }
  return {
    name: file,
    filepath,
    source: fs.readFileSync(filepath, "utf8"),
  };
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatIssue(level, issue) {
  const pos = issue.line ? `:${issue.line}` : "";
  const rule = issue.rule ? ` [${issue.rule}]` : "";
  return `${level}${pos}${rule} ${issue.message}`;
}

function reportLint(name, report) {
  process.stdout.write(`${name}: ${report.errors.length} error(s), ${report.warnings.length} warning(s)\n`);
  report.errors.forEach((item) => process.stdout.write(`  ${formatIssue("error", item)}\n`));
  report.warnings.forEach((item) => process.stdout.write(`  ${formatIssue("warn", item)}\n`));
  if (!report.errors.length && !report.warnings.length) {
    process.stdout.write("  ok\n");
  }
}

function outputPathForCompressed(inputFile, explicitOutput) {
  if (!explicitOutput) {
    const parsed = path.parse(inputFile);
    return path.join(parsed.dir, `${parsed.name}.compressed.dub`);
  }
  return path.resolve(process.cwd(), explicitOutput);
}

function outputDirPath(flagValue) {
  return path.resolve(process.cwd(), flagValue || "generated");
}

function outputPathForExport(inputFile, outDir) {
  const parsed = path.parse(inputFile);
  return path.join(outDir, `${parsed.name}.mid`);
}

function splitDirPathForExport(inputFile, outDir) {
  const parsed = path.parse(inputFile);
  return path.join(outDir, parsed.name);
}

function sanitizeName(value) {
  return String(value || "track")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "track";
}

function splitTrackFilename(index, track) {
  const lane = sanitizeName(track.name);
  const suffix = Number.isFinite(track.program) ? `-${track.program}` : "";
  return `${String(index + 1).padStart(2, "0")}-${lane}${suffix}.mid`;
}

function mergeMetaChain(base, extra) {
  const out = { ...(base || {}) };
  if (!extra || typeof extra !== "object") return out;
  Object.keys(extra).forEach((key) => {
    if (typeof extra[key] !== "undefined") out[key] = extra[key];
  });
  return out;
}

function resolveSectionMeta(ast, sectionName, cache = new Map()) {
  const key = sectionName || "__default__";
  if (cache.has(key)) return cache.get(key);

  const fileMeta = ast.meta || {};
  const section = sectionName && ast.sections ? ast.sections[sectionName] : null;

  let resolved = mergeMetaChain({}, fileMeta);
  if (section && section.inherits) {
    const parent = { ...resolveSectionMeta(ast, section.inherits, cache) };
    delete parent.lyrics;
    resolved = mergeMetaChain(resolved, parent);
  }
  if (section) {
    const own = { ...section };
    delete own.inherits;
    resolved = mergeMetaChain(resolved, own);
  }

  cache.set(key, resolved);
  return resolved;
}

function buildSceneInfo(ast, bpmOverride = null) {
  const sceneSequence = sequence(ast);
  const cache = new Map();

  return sceneSequence.map((scene) => {
    const meta = resolveSectionMeta(ast, scene.name, cache);
    return {
      name: scene.name,
      tempo: meta.tempo ?? bpmOverride ?? 120,
      meter: meta.meter ?? [4, 4],
      steps: meta.steps ?? 32,
      lyrics: Array.isArray(meta.lyrics) ? meta.lyrics : [],
    };
  });
}

function parseArgv(argv) {
  const args = argv.slice();
  const command = args.shift();
  const options = {
    strict: false,
    dryRun: false,
    aggressive: false,
    bundle: false,
    split: false,
    output: null,
    minOcc: 2,
    minLen: 2,
    files: [],
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--aggressive") {
      options.aggressive = true;
      continue;
    }
    if (arg === "-b" || arg === "--bundle") {
      options.bundle = true;
      continue;
    }
    if (arg === "--split") {
      options.split = true;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      options.output = args.shift() || null;
      continue;
    }
    if (arg === "--min-occ") {
      options.minOcc = parsePositiveInt(args.shift(), 2);
      continue;
    }
    if (arg === "--min-len") {
      options.minLen = parsePositiveInt(args.shift(), 2);
      continue;
    }
    options.files.push(arg);
  }

  return { command, options };
}

function cmdLint(options) {
  const targets = options.files.length
    ? options.files.map(readText)
    : [{ name: "<stdin>", filepath: null, source: readStdin() }];

  let failed = false;
  targets.forEach((target) => {
    const report = lintDub(target.source);
    reportLint(target.name, report);
    if (report.errors.length > 0 || (options.strict && report.warnings.length > 0)) {
      failed = true;
    }
  });

  process.exit(failed ? 1 : 0);
}

function cmdCompress(options) {
  const input = options.files[0];
  const explicitOutput = options.files[1] || options.output;
  if (!input) die(`compress requires an input file\n\n${USAGE}`);

  const target = readText(input);
  const outputFile = outputPathForCompressed(target.filepath, explicitOutput);
  const result = compressDub(target.source, {
    minOccurrences: options.minOcc,
    minSequenceLength: options.minLen,
    aggressive: options.aggressive,
  });

  process.stdout.write(
    `replacements: ${result.summary.replacements}\n`
    + `variables: ${result.summary.variables}\n`
    + `token savings: ${result.summary.tokenSavings}\n`
    + `char savings: ${result.summary.charSavings}\n`,
  );

  if (!result.hasCompressed) {
    process.stdout.write("No profitable repeats detected.\n");
    process.exit(0);
  }

  if (options.dryRun) {
    process.stdout.write(`output: ${outputFile}\n`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${result.source}\n`, "utf8");
  process.stdout.write(`written: ${outputFile}\n`);
}

function buildMidiForSource(source, bpmOverride = null) {
  const ast = parse(source);
  const merged = merge(ast);
  const scenes = buildSceneInfo(ast, bpmOverride);
  return build(merged, bpmOverride ?? 120, { scenes });
}

function buildSplitMidiForSource(source, bpmOverride = null) {
  const ast = parse(source);
  const merged = merge(ast);
  const scenes = buildSceneInfo(ast, bpmOverride);
  return buildSplit(merged, bpmOverride ?? 120, { scenes });
}

function cmdExport(options) {
  const files = options.files;
  if (!files.length) die(`export requires at least one input file\n\n${USAGE}`);

  const outDir = outputDirPath(options.output);
  fs.mkdirSync(outDir, { recursive: true });

  files.forEach((file) => {
    const target = readText(file);

    if (options.split) {
      const splitDir = splitDirPathForExport(target.filepath, outDir);
      const tracks = buildSplitMidiForSource(target.source);
      fs.mkdirSync(splitDir, { recursive: true });

      tracks.forEach((track, index) => {
        const outputFile = path.join(splitDir, splitTrackFilename(index, track));
        fs.writeFileSync(outputFile, Buffer.from(track.data));
        process.stdout.write(`${target.name} -> ${outputFile}\n`);
      });
      return;
    }

    const data = buildMidiForSource(target.source);
    const outputFile = outputPathForExport(target.filepath, outDir);
    fs.writeFileSync(outputFile, Buffer.from(data));
    process.stdout.write(`${target.name} -> ${outputFile}\n`);
  });

  if (options.bundle) {
    process.stdout.write("note: -b is reserved for future multi-source bundling; use --split for per-lane MIDI export.\n");
  }
}

function main() {
  const { command, options } = parseArgv(process.argv.slice(2));
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    process.exit(command ? 0 : 1);
  }

  try {
    if (command === "lint") return cmdLint(options);
    if (command === "compress") return cmdCompress(options);
    if (command === "export") return cmdExport(options);
  } catch (error) {
    die(error && error.message ? error.message : String(error));
  }

  die(`Unknown command: ${command}\n\n${USAGE}`);
}

main();
