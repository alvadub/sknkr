import {
  STEPS, CHORD_STEPS, DRUM_STEPS,
  clampNumber, fixedLengthArray, normalizeDrumValue, drumLengthArray, drumValueToSymbol,
  encodeChordRle, decodeChordRle, encodeDrumTrack, decodeDrumTrack,
} from "./codec.js";
import {
  utf8ToBase64Url, base64UrlToUtf8, isDefaultSceneName, collectIndexed,
  encodeHeader as sktEncodeHeader, decodeHeader as sktDecodeHeader,
  encodeScene, decodeScene,
  TRACKS, hasCustomTrackVolumes,
  parseBassNotes, parseBassPattern, formatBassPattern, formatBassPatternSymbols,
  sortAndTrimBassEvents, bassPatternStats, bassPatternToEvents,
} from "./skt.js";
import { parse as parseDub } from "./lib/parser.js";
import { merge as mergeDub } from "./lib/mixup.js";
import { lintDub } from "./lib/lint.js";
import {
  buildArrangementDisplayExpansion,
  buildMixFromMerged,
  buildSectionTimeline,
  buildTrackLineMap,
  collectVariableDefinitions,
  extractDraftBankSelection,
  extractDraftBars,
  extractDraftKey,
  extractDraftTempo,
  getMaxPatternSlots,
} from "./lib/playground.js";
import {
  INTERNAL_SYNTH_PRESETS, DEFAULT_CHORD_CATALOG, DEFAULT_INTERNAL_RHYTHM, DEFAULT_INTERNAL_HARMONY,
  SOUND_CATALOG, SOUND_CHOICES, BASS_PRESETS, BASS_SHAPES, DRUM_KIT_CATALOG, WEBAUDIOFONT_PLAYER_URL,
} from "./lib/audio-data.js";
import {
  ROOTS, QUALITY_ALIASES, midiToHz, canonicalRoot, normalizeQuality, qualityFromToken,
  parseChordToken, chordName, isInvalidCatalogName, parseNoteName, parseNoteList, parseChord,
} from "./lib/audio-math.js";
import { getInternalSynthParams, playInternalChord, playDrumInternal } from "./lib/audio-voices.js";
import { createAudioGraph } from "./lib/audio-graph.js";
import { getWebAudioFontPlayer, loadSoundProfile } from "./lib/audio-loader.js";
import { AudioRuntime } from "./lib/audio-runtime.js";
import { bindPatternInput, parseChordPattern, chordPatternStats, chordPatternSymbolGroups, parseDrumPattern, formatDrumPattern, renderDrumPatternPreview, renderChordPatternPreview as renderChordPatternPreviewFn, renderChordPoolPreview as renderChordPoolPreviewFn, chordLayerPartValues, formatChordPatternPart, formatChordPoolPart, chordActivePoolIndex, parseChordPool, chordPatternToSlots, normalizeDubPatternSymbol, dubPatternChars, parseDubPatternCells, reconcilePastePattern, parseBassInlinePattern, parseChordInlinePattern, isDubPatternToken, normalizeChordPoolText, parseDubBassSymbols, dubSceneLabel, dubLineComment, dubMetaValue, dubMetaMap, formatDubChordLayer, formatDubBassPattern, orderedUnique, dubDrumTrackKey, soundLabel, drumSoundLabel, bassPresetLabel, summarizeChordLayer, summarizeDrumTrack, summarizeBassEvents, summarizeScene as summarizeSceneFn, parseDubChannelLine, parseDubArrangement, chordDubLineToSlots, drumDubLineToValues, bassDubLineToEvents, detectPasteFormat, chordPoolTextState, bassTextState, createBlankScene, normalizeChordCatalog, chordCatalogSignature, encodeChordCatalogPayload, decodeChordCatalogPayload, normalizeUiMode, escapeAttr, normalizeDrumSounds, uiIcon } from "./lib/ui-widgets.js";

      const LOOP_STEPS = STEPS;
      const INITIAL_SCENE_COUNT = 4;
      const BASS_TICKS_PER_STEP = 4;
      const BASS_TICKS = STEPS * BASS_TICKS_PER_STEP;
      const BASS_EDITOR_PARTS = 2;
      const BASS_EDITOR_PART_TICKS = BASS_TICKS / BASS_EDITOR_PARTS;
      const CHORD_EDITOR_PARTS = 2;
      const CHORD_EDITOR_PART_STEPS = CHORD_STEPS / CHORD_EDITOR_PARTS;
      const CHORD_EDITOR_LAYERS = [
        { key: "rhythm", label: "Rhythm" },
        { key: "harmony", label: "Harmony" },
      ];
      const PRESET_NAME = "default";
      const STORAGE_KEY = `SKNKR:preset:${PRESET_NAME}:v1`;
      const PROJECTS_STORAGE_KEY = "SKNKR:projects:v1";
      const USER_DRUM_PRESETS_KEY = "SKNKR:drum-presets:v1";
      const USER_CHORD_PRESETS_KEY = "SKNKR:chord-progressions:v1";
      const SHARE_HASH_KEY = "s";
      const SHARE_STATE_VERSION = 1;
      const BASS_KEYS = [
        ["KeyA", 0], ["KeyW", 1], ["KeyS", 2], ["KeyE", 3], ["KeyD", 4], ["KeyF", 5],
        ["KeyT", 6], ["KeyG", 7], ["KeyY", 8], ["KeyH", 9], ["KeyU", 10], ["KeyJ", 11], ["KeyK", 12],
        ["KeyO", 13], ["KeyL", 14], ["KeyP", 15], ["Semicolon", 16],
      ];
      const BASS_KEY_MAP = new Map(BASS_KEYS);
      const DRUM_MIDI = {
        kick: 36,
        snare: 38,
        hihat: 42,
        openhat: 46,
      };
      const DRUM_NOTE_LABELS = {
        kick: "c3",
        snare: "d3",
        hihat: "f#3",
        openhat: "a#3",
      };
      const DRUM_PRESETS = {};

      const state = {
        bpm: 100,
        uiMode: "listen",
        textMode: localStorage.getItem("skanker-text-mode") === "true",
        songTitle: "SKNKR",
        songNote: "Live dub sketch for groove, chords, and arrangement review.",
        currentScene: 0,
        pendingScene: null,
        loopActiveScene: false,
        playhead: -1,
        isPlaying: false,
        strumLength: 0.12,
        padAttack: 0.08,
        drumPresetPanelOpen: false,
        drumPresetGenre: "reggae",
        activeDrumPreset: null,
        userDrumPresets: [],
        userDrumPresetExport: "",
        chordPresetPanelOpen: false,
        activeChordPreset: null,
        userChordPresets: [],
        userChordPresetExport: "",
        projects: [],
        currentProjectId: null,
        dirty: false,
        hasUrlSong: false,
        pendingUrlSnapshot: null,
        sounds: {
          rhythm: "organ",
          harmony: "pad",
          drums: { kick: "internal", snare: "internal", hihat: "internal", openhat: "internal" },
        },
        bass: {
          enabled: false,
          preset: "sub",
          octave: 2,
          transpose: 0,
          volume: 0.65,
          filter: 420,
          glide: 0.04,
          release: 0.22,
          recording: false,
          layers: [{ shape: "sine", detune: 0, gain: 1 }],
          harmonics: 0,
          harmonicShape: "square",
          harmonicFilter: 300,
        },
        volumes: { master: 0.8, rhythm: 0.55, harmony: 0.35, drums: 0.75 },
        chordCatalog: { ...DEFAULT_CHORD_CATALOG },
        scenes: Array.from({ length: INITIAL_SCENE_COUNT }, (_, index) => createScene(index)),
      };

      let audioContext;
      let audioRuntime = null;
      let schedulerTimer = null;
      let nextStepIndex = 0;
      let nextNoteTime = 0;
      let currentStepStartTime = 0;
      let lastEscapeAt = 0;
      let draggedStep = null;
      let draggedSceneIndex = null;
      let suppressNextStepClick = false;
      let lastBassMidi = null;
      let harmonyVoice = null;
      let foundationProbeSnapshot = null;
      let foundationProbeAudioContext = null;
      let foundationProbeStopTimer = null;
      const activeBassNotes = new Map();

      const el = {
        textModeToggle: document.getElementById("text-mode-toggle"),
        modeListen: document.getElementById("mode-listen"),
        modeEdit: document.getElementById("mode-edit"),
        pasteDialog: document.getElementById("paste-dialog"),
        pasteClose: document.getElementById("paste-close"),
        pasteInput: document.getElementById("paste-input"),
        pastePlayBtn: document.getElementById("paste-play-btn"),
        pasteImportBtn: document.getElementById("paste-import-btn"),
        pasteError: document.getElementById("paste-error"),
        shareLink: document.getElementById("share-link"),
        mixerOpen: document.getElementById("mixer-open"),
        mixerDialog: document.getElementById("mixer-dialog"),
        mixerClose: document.getElementById("mixer-close"),
        songTitleDisplay: document.getElementById("song-title-display"),
        songTitleInput: document.getElementById("song-title-input"),
        heroDiscRing: document.querySelector(".hero-disc-ring"),
        sceneStatus: document.getElementById("scene-status"),
        songNoteDisplay: document.getElementById("song-note-display"),
        songNoteInput: document.getElementById("song-note-input"),
        play: document.getElementById("play"),
        stop: document.getElementById("stop"),
        bpm: document.getElementById("bpm"),
        bpmDown: document.getElementById("bpm-down"),
        bpmUp: document.getElementById("bpm-up"),
        projectSave: document.getElementById("project-save"),
        projectSelect: document.getElementById("project-select"),
        projectLoad: document.getElementById("project-load"),
        projectRemove: document.getElementById("project-remove"),
        projectClear: document.getElementById("project-clear"),
        loadUrlSong: document.getElementById("load-url-song"),
        strum: document.getElementById("strum"),
        padAttack: document.getElementById("pad-attack"),
        rhythmSound: document.getElementById("rhythm-sound"),
        harmonySound: document.getElementById("harmony-sound"),
        drumSounds: Object.fromEntries([...document.querySelectorAll("[data-drum-sound]")].map((select) => [select.dataset.drumSound, select])),
        bassToggle: document.getElementById("bass-toggle"),
        bassRecordToggle: document.getElementById("bass-record-toggle"),
        bassClear: document.getElementById("bass-clear"),
        bassEditorDialog: document.getElementById("bass-editor-dialog"),
        bassEditorClose: document.getElementById("bass-editor-close"),
        chordEditorDialog: document.getElementById("chord-editor-dialog"),
        chordEditorClose: document.getElementById("chord-editor-close"),
        chordPresetsDialog: document.getElementById("chord-presets-dialog"),
        chordPresetsClose: document.getElementById("chord-presets-close"),
        rhythmMute: document.getElementById("rhythm-mute"),
        harmonyMute: document.getElementById("harmony-mute"),
        bassPreset: document.getElementById("bass-preset"),
        bassShape: document.getElementById("bass-shape"),
        bassPlaybackToggle: document.getElementById("bass-playback-toggle"),
        bassOctaveDisplay: document.getElementById("bass-octave-display"),
        bassOctaveDown: document.getElementById("bass-octave-down"),
        bassOctaveUp: document.getElementById("bass-octave-up"),
        bassTransposeDisplay: document.getElementById("bass-transpose-display"),
        bassTransposeDown: document.getElementById("bass-transpose-down"),
        bassTransposeUp: document.getElementById("bass-transpose-up"),
        bassTransposeReset: document.getElementById("bass-transpose-reset"),
        bassTransposeApply: document.getElementById("bass-transpose-apply"),
        bassVolume: document.getElementById("bass-volume"),
        bassGlide: document.getElementById("bass-glide"),
        bassRelease: document.getElementById("bass-release"),
        mixerDrumVolumes: Object.fromEntries(TRACKS.map((track) => [track.key, document.getElementById(`mixer-${track.key}-volume`)])),
        sceneLoopToggle: document.getElementById("scene-loop-toggle"),
        sceneTabs: document.getElementById("scene-tabs"),
        chordGrid: document.getElementById("chord-grid"),
        chordPresetsToggle: document.getElementById("chord-presets-toggle"),
        chordPresetPanel: document.getElementById("chord-preset-panel"),
        drumGrid: document.getElementById("drum-grid"),
        drumPresetsToggle: document.getElementById("drum-presets-toggle"),
        drumPresetPanel: document.getElementById("drum-preset-panel"),
        drumPresetsDialog: document.getElementById("drum-presets-dialog"),
        drumPresetsClose: document.getElementById("drum-presets-close"),
        masterVolume: document.getElementById("master-volume"),
        rhythmVolume: document.getElementById("rhythm-volume"),
        harmonyVolume: document.getElementById("harmony-volume"),
        drumVolume: document.getElementById("drum-volume"),
        soundOpen: document.getElementById("sound-open"),
        soundDialog: document.getElementById("sound-dialog"),
        soundClose: document.getElementById("sound-close"),
        catalogOpen: document.getElementById("catalog-open"),
        catalogDialog: document.getElementById("catalog-dialog"),
        catalogRows: document.getElementById("catalog-rows"),
        catalogAdd: document.getElementById("catalog-add"),
        catalogSave: document.getElementById("catalog-save"),
        catalogClose: document.getElementById("catalog-close"),
        dubImportFile: document.getElementById("dub-import-file"),
        writeDub: document.getElementById("write-dub"),
        writeCopy: document.getElementById("write-copy"),
        writeDownload: document.getElementById("write-download"),
        writeImport: document.getElementById("write-import"),
        probePlay: document.getElementById("probe-play"),
        probeSummary: document.getElementById("probe-summary"),
        probeLint: document.getElementById("probe-lint"),
        probeArrangement: document.getElementById("probe-arrangement"),
        probeTracks: document.getElementById("probe-tracks"),
      };

      function createScene(index) {
        const scene = createBlankScene(index, TRACKS);

        if (index === 0) {
          scene.rhythm[4] = "C7";
          scene.rhythm[12] = "F7";
          scene.rhythm[20] = "G7";
          scene.rhythm[4] = "C7";
          scene.rhythm[12] = "F7";
          scene.rhythm[20] = "G7";
          scene.rhythm[28] = "F7";
          scene.harmony[0] = "C";
          scene.harmony[16] = "F";
          scene.drums.kick = parseDrumPattern("[xx]-- ---- [xx]-- ----") || [];
          scene.drums.snare = parseDrumPattern("---- [xx]-- ---- [xx]--") || [];
          scene.drums.hihat = parseDrumPattern("[x-x]--- [x-x]--- [x-x]--- [x-x]---") || [];
          scene.drums.openhat = parseDrumPattern("---- ---- ---- [xx]--") || [];
          scene.bass = [
            {tick: 0, midi: 36, length: 4},
            {tick: 4, midi: 36, length: 4},
            {tick: 8, midi: 36, length: 4},
            {tick: 12, midi: 36, length: 4},
            {tick: 16, midi: 41, length: 4},
            {tick: 32, midi: 43, length: 1},
            {tick: 48, midi: 45, length: 1},
            {tick: 64, midi: 38, length: 1},
            {tick: 80, midi: 40, length: 1},
            {tick: 96, midi: 36, length: 1},
          ];
        }

        scene.chordPoolText = {
          rhythm: ["C7 F7", "G7 F7"],
          harmony: ["C F", "C F"],
        };
        scene.chordPatternText = {
          rhythm: ["[x-]-- [x-]--", "[x-]-- [x-]--"],
          harmony: ["x___ ____ [x_]__ ____", "x___ ____ x___ ____"],
        };
        scene.bassText = {
          notes: "c2 c2 c2 c2 f2 g2 a2 d2 e2 c2",
          pattern: "[xxxx]---- ---- ---- x___ ---- x--- ---- ---x ---- --x- ---- ---x ---- ---x ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ",
        };
        scene.drumPatternText = {
          kick: "[xx]-- ---- [xx]-- ----",
          snare: "---- [xx]-- ---- [xx]--",
          hihat: "[x-x]--- [x-x]--- [x-x]--- [x-x]---",
          openhat: "---- ---- ---- [xx]--",
        };

        return scene;
      }

      function currentScene() {
        return state.scenes[state.currentScene];
      }

      function setChordPoolText(scene, layer, partIndex, value) {
        if (!scene.chordPoolText) {
          scene.chordPoolText = {
            rhythm: chordPoolTextState(scene.rhythm, null, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS),
            harmony: chordPoolTextState(scene.harmony, null, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS),
          };
        }
        scene.chordPoolText[layer][partIndex] = value;
      }

      function setChordPatternText(scene, layer, partIndex, value) {
        if (!scene.chordPatternText) {
          scene.chordPatternText = {
            rhythm: chordPoolTextState(scene.rhythm, null, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS),
            harmony: chordPoolTextState(scene.harmony, null, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS),
          };
        }
        scene.chordPatternText[layer][partIndex] = value;
      }

      function ensureAudio() {
        if (audioRuntime) return audioRuntime;
        const Context = window.AudioContext || window.webkitAudioContext;
        audioContext = new Context();
        audioRuntime = new AudioRuntime(audioContext, stepResolver, TRACKS.map((t) => t.key), {
          bpm: state.bpm,
          swing: 0,
          lookahead: 0.1,
          tickInterval: 0.025,
          stepCount: CHORD_STEPS,
          onStep: handleRuntimeStep,
        });
        audioRuntime.graph.connect(audioContext.destination);
        audioRuntime.sounds = { ...state.sounds };
        audioRuntime.strumLength = state.strumLength;
        audioRuntime.kit = state.sounds.drums.kick || "internal";
        audioRuntime.volumes = { ...state.volumes };
        audioRuntime.bassParams = { ...state.bass };
        applyVolumes();
        return audioRuntime;
      }

      function handleRuntimeStep(step, time) {
        state.playhead = step;
        renderPlayhead();
        el.sceneStatus.innerHTML = currentSongSubtitle();
        if (step === CHORD_STEPS - 1) {
          advanceSceneSequence(time + (60 / state.bpm / 4));
        }
      }

      function stepResolver(stepIndex) {
        const scene = currentScene();
        if (!scene) return null;
        const drumStep = stepIndex % DRUM_STEPS;
        const bassStep = stepIndex % STEPS;
        const rawChord = String(scene.harmony[stepIndex] || "").trim();
        const harmonySymbol = getHarmonyPatternSymbol(stepIndex);
        let harmony = null;
        if (harmonySymbol === "x" || harmonySymbol === "X") {
          harmony = rawChord || null;
        } else if (harmonySymbol === "_") {
          harmony = "_";
        } else {
          harmony = null;
        }

        return {
          rhythm: scene.rhythm[stepIndex] ? [scene.rhythm[stepIndex]] : null,
          harmony,
          drums: TRACKS.map((track) => ({
            trackKey: track.key,
            velocity: normalizeDrumValue(scene.drums?.[track.key]?.[drumStep] ?? 0),
          })).filter((d) => d.velocity > 0),
          bass: scene.bass.filter((event) => bassEventStep(event) === stepIndex).map((event) => ({
            note: event.midi + state.bass.transpose,
            tick: event.tick,
            length: event.length,
          })),
        };
      }

      function applyVolumes() {
        if (!audioRuntime) return;
        const time = audioContext.currentTime;
        const scene = currentScene();
        audioRuntime.setVolume("master", state.volumes.master);
        audioRuntime.setVolume("rhythm", scene.mutes?.rhythm ? 0 : state.volumes.rhythm);
        audioRuntime.setVolume("harmony", scene.mutes?.harmony ? 0 : state.volumes.harmony);
        audioRuntime.setVolume("drums", state.volumes.drums);
        audioRuntime.setVolume("bass", scene.mutes?.bass ? 0 : state.bass.volume);
        if (audioRuntime.graph.drumTrackGains) {
          TRACKS.forEach((track) => {
            const gain = audioRuntime.graph.drumTrackGains[track.key];
            if (gain) {
              gain.gain.setTargetAtTime(scene.mutes?.drums?.[track.key] ? 0 : 1, time, 0.01);
            }
          });
        }
      }

      function drumSoundDefinition(kitKey, trackKey) {
        const kit = DRUM_KIT_CATALOG[kitKey];
        const midi = DRUM_MIDI[trackKey];
        if (!kit?.suffix || !midi) return null;
        return {
          label: `${kit.label} ${trackKey}`,
          playerUrl: WEBAUDIOFONT_PLAYER_URL,
          presetUrl: `https://surikov.github.io/webaudiofontdata/sound/128${midi}_${kit.suffix}.js`,
          presetName: `_drum_${midi}_${kit.suffix}`,
          midi,
        };
      }

      async function ensureWebAudioFontPreset(sound) {
        if (!sound?.playerUrl) return null;
        await loadSoundProfile(audioContext, sound.presetName, { [sound.presetName]: sound });
        return window[sound.presetName] || null;
      }

      async function ensureSelectedSounds() {
        const soundDefs = [
          { key: state.sounds.rhythm, catalog: SOUND_CATALOG },
          { key: state.sounds.harmony, catalog: SOUND_CATALOG },
          ...TRACKS.map((track) => {
            const def = drumSoundDefinition(state.sounds.drums[track.key], track.key);
            return def ? { key: def.presetName, catalog: { [def.presetName]: def } } : null;
          }).filter(Boolean),
        ];
        await Promise.all(soundDefs.map(({ key, catalog }) => loadSoundProfile(audioContext, key, catalog)));
      }

      function playRhythm(chord, time) {
        const parsed = parseChord(chord, 55, state.chordCatalog);
        if (!parsed || !audioContext) return;

        const sound = SOUND_CATALOG[state.sounds.rhythm];
        const player = getWebAudioFontPlayer();
        const preset = sound?.presetName ? window[sound.presetName] : null;
        if (player && preset) {
          player.queueChord(audioContext, audioRuntime.graph.rhythmGain, preset, time, parsed.midi, state.strumLength, 0.8);
          return;
        }

        const output = audioContext.createGain();
        output.connect(audioRuntime.graph.rhythmGain);
        playInternalChord(audioContext, parsed.frequencies, output, time, state.strumLength, 0.15, getInternalSynthParams(state.sounds.rhythm));
      }

      function releaseHarmony(time) {
        if (audioRuntime) {
          audioRuntime.releaseHarmony(time);
          return;
        }
        if (!harmonyVoice) return;
        if (harmonyVoice.envelopes) {
          harmonyVoice.envelopes.forEach((envelope) => {
            if (typeof envelope.cancel === "function") envelope.cancel(time);
            else if (envelope.out) {
              envelope.out.gain.cancelScheduledValues(time);
              envelope.out.gain.setTargetAtTime(0.0001, time, 0.12);
            }
          });
          harmonyVoice = null;
          return;
        }
        const synthParams = harmonyVoice.synthParams || {};
        const release = synthParams.release || 0.12;
        harmonyVoice.gain.gain.cancelScheduledValues(time);
        harmonyVoice.gain.gain.setTargetAtTime(0.0001, time, release);
        if (harmonyVoice.filter) {
          harmonyVoice.filter.frequency.cancelScheduledValues(time);
          harmonyVoice.filter.frequency.setTargetAtTime(100, time, release);
        }
        harmonyVoice.oscillators.forEach((osc) => osc.stop(time + release + 0.3));
        harmonyVoice = null;
      }

      function playHarmony(chord, time) {
        const parsed = parseChord(chord, 48, state.chordCatalog);
        if (!parsed || !audioContext) {
          releaseHarmony(time);
          return;
        }
        if (harmonyVoice && harmonyVoice.label === parsed.label) return;

        releaseHarmony(time);

        const sound = SOUND_CATALOG[state.sounds.harmony];
        const player = getWebAudioFontPlayer();
        const preset = sound?.presetName ? window[sound.presetName] : null;
        if (player && preset) {
          harmonyVoice = {
            label: parsed.label,
            envelopes: player.queueChord(audioContext, audioRuntime.graph.harmonyGain, preset, time, parsed.midi, 8, 0.38),
          };
          return;
        }

        const synthParams = getInternalSynthParams(state.sounds.harmony);
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(synthParams.filter, time);
        const baseGain = (synthParams.gain || 0.35);
        const gainValue = baseGain / Math.max(1, parsed.frequencies.length);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(gainValue, time + state.padAttack);
        gain.connect(filter);
        filter.connect(audioRuntime.graph.harmonyGain);

        const oscillators = [];
        const shapes = synthParams.mix ? ["sine", synthParams.shape || "sawtooth"] : [synthParams.shape || "sine", "sine"];
        parsed.frequencies.forEach((frequency) => {
          shapes.forEach((type, typeIndex) => {
            const osc = audioContext.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, time);
            osc.detune.setValueAtTime((synthParams.detune || 0) + (typeIndex === 0 ? -3 : 3), time);
            osc.connect(gain);
            osc.start(time);
            oscillators.push(osc);
          });
        });

        harmonyVoice = { label: parsed.label, gain, oscillators, filter, synthParams };
      }

      function playDrum(trackKey, time, velocity = 1) {
        const scene = currentScene();
        const level = (scene.trackVolumes[trackKey] ?? 0.7) * (velocity >= 1 ? 1 : 0.28);
        const output = drumTrackGains?.[trackKey] || drumGain;
        const drumSound = drumSoundDefinition(state.sounds.drums[trackKey], trackKey);
        const player = getWebAudioFontPlayer();
        const drumPreset = drumSound?.presetName ? window[drumSound.presetName] : null;
        if (player && drumPreset) {
          player.queueWaveTable(audioContext, output, drumPreset, time, drumSound.midi, 0.9, level);
          return;
        }
        playDrumInternal(audioContext, trackKey, output, time, level);
      }

      function bassMidiForOffset(offset) {
        return (state.bass.octave + 1) * 12 + offset;
      }

      function releaseBassNote(code, time = audioContext?.currentTime || 0) {
        const voice = activeBassNotes.get(code);
        if (!voice) return;
        activeBassNotes.delete(code);
        setBassKeyPressed(code, false);
        voice.envelopes.forEach((envelope) => {
          envelope.gain.cancelScheduledValues(time);
          envelope.gain.setTargetAtTime(0.0001, time, state.bass.release);
        });
        voice.oscillators.forEach((osc) => osc.stop(time + state.bass.release + 0.1));
      }

      function releaseAllBassNotes() {
        if (!audioContext) return;
        [...activeBassNotes.keys()].forEach((code) => releaseBassNote(code, audioContext.currentTime));
      }

      function createBassVoice(midi, time, releaseAt = null, velocity = 1) {
        const destination = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(state.bass.filter, time);
        filter.Q.setValueAtTime(5, time);
        destination.connect(filter).connect(audioRuntime.graph.bassGain);

        const voices = state.bass.layers.map((layer) => {
          const osc = audioContext.createOscillator();
          const envelope = audioContext.createGain();
          const frequency = midiToHz(midi);
          osc.type = layer.shape;
          if (lastBassMidi !== null && state.bass.glide > 0) {
            osc.frequency.setValueAtTime(midiToHz(lastBassMidi), time);
            osc.frequency.linearRampToValueAtTime(frequency, time + state.bass.glide);
          } else {
            osc.frequency.setValueAtTime(frequency, time);
          }
          osc.detune.setValueAtTime(layer.detune, time);
          envelope.gain.setValueAtTime(0.0001, time);
          envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.gain * velocity), time + 0.015);
          osc.connect(envelope).connect(destination);
          osc.start(time);
          if (releaseAt !== null) {
            envelope.gain.setTargetAtTime(0.0001, releaseAt, state.bass.release);
            osc.stop(releaseAt + state.bass.release + 0.1);
          }
          return { osc, envelope };
        });

        lastBassMidi = midi;
        return voices;
      }

      function playScheduledBassNote(note, time) {
        if (!note) return;
        const tickDuration = 60 / state.bpm / 4 / BASS_TICKS_PER_STEP;
        const duration = Math.max(tickDuration * 0.8, tickDuration * note.length * 0.88);
        createBassVoice(note.midi, time, time + duration, note.velocity);
      }

      function bassRecordTick() {
        const stepDuration = 60 / state.bpm / 4;
        const tickDuration = stepDuration / BASS_TICKS_PER_STEP;
        const elapsed = audioContext ? audioContext.currentTime - currentStepStartTime : 0;
        const subTick = Math.trunc(clampNumber(Math.floor(elapsed / tickDuration), 0, BASS_TICKS_PER_STEP - 1, 0));
        return (state.playhead % STEPS) * BASS_TICKS_PER_STEP + subTick;
      }

      function recordBassNote(code, midi) {
        if (!state.bass.recording || !state.isPlaying || state.playhead < 0) return;
        const scene = currentScene();
        const tick = bassRecordTick();
        scene.bass = scene.bass.filter((event) => event.tick !== tick);
        scene.bass.push({ tick, code, midi, length: BASS_TICKS_PER_STEP, velocity: 1 });
        sortAndTrimBassEvents(scene.bass);
        scene.bassText = bassTextState(scene.bass, null, formatBassNotes, formatBassPattern);
        savePreset();
        renderDrumGrid();
      }

      function playBassNote(code, offset) {
        ensureAudio();
        audioContext.resume();
        if (activeBassNotes.has(code)) return;
        const midi = bassMidiForOffset(offset);
        const voices = createBassVoice(midi, audioContext.currentTime);
        activeBassNotes.set(code, {
          oscillators: voices.map((voice) => voice.osc),
          envelopes: voices.map((voice) => voice.envelope),
        });
        setBassKeyPressed(code, true);
        recordBassNote(code, midi);
      }

      function activeChordAt(layerValues, step) {
        for (let offset = 0; offset < CHORD_STEPS; offset += 1) {
          const index = (step - offset + CHORD_STEPS) % CHORD_STEPS;
          const value = String(layerValues[index] || "").trim();
          if (value) return value;
        }
        return "";
      }

      function activeChordStatus(scene, step) {
        const beatStart = Math.floor(step / 4) * 4;
        let skankReferenceStep = beatStart;
        for (let offset = 0; offset < 4; offset += 1) {
          const candidateStep = beatStart + offset;
          const rhythmValue = String(scene.rhythm[candidateStep] || "").trim();
          if (!rhythmValue) continue;
          skankReferenceStep = candidateStep;
          break;
        }
        const rhythmChord = activeChordAt(scene.rhythm, skankReferenceStep);
        const harmonyChord = activeChordAt(scene.harmony, skankReferenceStep);
        if (!rhythmChord && !harmonyChord) return "";
        return ` · ${rhythmChord || "-"} | ${harmonyChord || "-"}`;
      }

      let harmonyWasActive = false;

      function getHarmonyPatternSymbol(step) {
        const scene = currentScene();
        const patternText = scene.chordPatternText?.harmony || [];
        const fullPattern = patternText.join(" ");
        const pattern = parseChordPattern(fullPattern, CHORD_STEPS);
        if (!pattern) return "-";
        const flat = pattern.flat(1);
        if (step >= flat.length) return "-";
        return flat[step];
      }

      function scheduleStep(step, time) {
        const scene = currentScene();
        const rhythmChord = scene.rhythm[step];
        const harmonyChord = scene.harmony[step];
        const harmonySymbol = getHarmonyPatternSymbol(step);
        const drumStep = step % DRUM_STEPS;
        const bassStep = step % STEPS;
        if (rhythmChord) playRhythm(rhythmChord, time);
        if (harmonySymbol === "x" || harmonySymbol === "X") {
          if (harmonyChord) playHarmony(harmonyChord, time);
          harmonyWasActive = true;
        } else if (harmonySymbol === "_") {
          if (!harmonyWasActive && harmonyChord) {
            playHarmony(harmonyChord, time);
          }
          // otherwise sustain - do nothing, let it ring
          harmonyWasActive = true;
        } else {
          releaseHarmony(time);
          harmonyWasActive = false;
        }
        bassEventsForStep(scene, bassStep).forEach((event) => {
          const tickOffset = event.tick % BASS_TICKS_PER_STEP;
          const tickDuration = 60 / state.bpm / 4 / BASS_TICKS_PER_STEP;
          playScheduledBassNote(event, time + tickOffset * tickDuration);
        });
        TRACKS.forEach((track) => {
          const velocity = normalizeDrumValue(scene.drums[track.key][drumStep]);
          if (velocity > 0) playDrum(track.key, time, velocity);
        });
        window.setTimeout(() => {
          if (!state.isPlaying) return;
          state.playhead = step;
          currentStepStartTime = time;
          renderPlayhead();
            el.sceneStatus.innerHTML = currentSongSubtitle();
        }, Math.max(0, (time - audioContext.currentTime) * 1000));
      }

      function schedulerTick() {
        while (nextNoteTime < audioContext.currentTime + 0.1) {
          scheduleStep(nextStepIndex, nextNoteTime);
          nextNoteTime += 60 / state.bpm / 4;
          nextStepIndex = (nextStepIndex + 1) % LOOP_STEPS;
          if (nextStepIndex === 0) advanceSceneSequence(nextNoteTime);
        }
      }

      function updatePlayButtonIcon() {
        const playIcon = el.play.querySelector(".play-icon");
        const pauseIcon = el.play.querySelector(".pause-icon");
        if (state.isPlaying) {
          if (playIcon) playIcon.style.display = "none";
          if (pauseIcon) pauseIcon.style.display = "block";
          el.play.setAttribute("aria-label", "Pause");
        } else {
          if (playIcon) playIcon.style.display = "block";
          if (pauseIcon) pauseIcon.style.display = "none";
          el.play.setAttribute("aria-label", "Play");
        }
      }

      function togglePlayback() {
        if (state.isPlaying) {
          pausePlayback();
        } else {
          startPlayback();
        }
      }

      async function startPlayback() {
        const runtime = ensureAudio();
        await audioContext.resume();
        if (state.sounds.rhythm !== "internal" || state.sounds.harmony !== "internal" || TRACKS.some((track) => state.sounds.drums[track.key] !== "internal")) {
            await ensureSelectedSounds();
        }
        const resumeFrom = state.playhead >= 0 ? state.playhead : -1;
        const startStep = resumeFrom >= 0 ? resumeFrom + 1 : 0;
        if (resumeFrom < 0) {
          stopPlayback(false);
        }
        runtime.setBPM(state.bpm);
        runtime.start(startStep);
        state.isPlaying = true;
        if (resumeFrom < 0) state.playhead = -1;
        updatePlayButtonIcon();
        renderAll();
      }

      function stopPlayback(render = true) {
        if (audioRuntime) audioRuntime.stop();
        schedulerTimer = null;
        state.isPlaying = false;
        state.playhead = -1;
        state.pendingScene = null;
        harmonyWasActive = false;
        updatePlayButtonIcon();
        if (render) renderAll();
      }

      function pausePlayback() {
        if (audioRuntime) audioRuntime.stop();
        schedulerTimer = null;
        state.isPlaying = false;
        harmonyWasActive = false;
        updatePlayButtonIcon();
        renderPlayhead();
        el.sceneStatus.innerHTML = currentSongSubtitle();
      }

      function runBlockingAction(action) {
        if (state.isPlaying) stopPlayback();
        return action();
      }

      function confirmBlocking(message) {
        return runBlockingAction(() => window.confirm(message));
      }

      function promptBlocking(message, value) {
        return runBlockingAction(() => window.prompt(message, value));
      }

      function alertBlocking(message) {
        return runBlockingAction(() => window.alert(message));
      }

      function setBpm(value) {
        state.bpm = Math.max(60, Math.min(200, Number(value) || 100));
        el.bpm.value = state.bpm;
        savePreset();
      }

      function normalizeBassNote(value) {
        if (!value || typeof value !== "object") return null;
        const midi = Number(value.midi);
        if (!Number.isFinite(midi)) return null;
        const code = typeof value.code === "string" && BASS_KEY_MAP.has(value.code) ? value.code : "";
        return { midi: Math.trunc(clampNumber(midi, 12, 96, 36)), code };
      }

      function normalizeBassEvent(value, fallbackTick = 0) {
        const note = normalizeBassNote(value);
        if (!note) return null;
        const rawTick = Number.isFinite(Number(value.tick)) ? Number(value.tick) : fallbackTick;
        const rawLength = Number.isFinite(Number(value.length)) ? Number(value.length) : BASS_TICKS_PER_STEP;
        return {
          tick: Math.trunc(clampNumber(rawTick, 0, BASS_TICKS - 1, fallbackTick)),
          midi: note.midi,
          length: Math.trunc(clampNumber(rawLength, 1, BASS_TICKS, BASS_TICKS_PER_STEP)),
          velocity: clampNumber(value.velocity, 0, 1, 1),
          code: note.code,
        };
      }

      function normalizeBassEvents(value) {
        if (!Array.isArray(value)) return [];
        return sortAndTrimBassEvents(value
          .map((entry, index) => normalizeBassEvent(entry, index * BASS_TICKS_PER_STEP))
          .filter(Boolean));
      }

      function bassNoteLabel(note) {
        if (!note) return "";
        const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
        return `${names[note.midi % 12]}${Math.floor(note.midi / 12) - 1}`;
      }

      function bassEventStep(event) {
        return Math.floor(event.tick / BASS_TICKS_PER_STEP);
      }

      function bassEventsForStep(scene, step) {
        return scene.bass.filter((event) => bassEventStep(event) === step);
      }

      function splitWhitespacePreservingParts(value) {
        return String(value || "").match(/\s+|\S+/g) || [];
      }

      function normalizeBassNotesText(rawNotes) {
        return splitWhitespacePreservingParts(rawNotes).map((part) => {
          if (/^\s+$/.test(part)) return part;
          const note = parseNoteName(part);
          return note ? note.label : part.toLowerCase();
        }).join("");
      }

      function formatBassPatternPart(events, partIndex) {
        const tickOffset = partIndex * BASS_EDITOR_PART_TICKS;
        const symbols = Array(BASS_EDITOR_PART_TICKS).fill("-");
        normalizeBassEvents(events)
          .filter((event) => event.tick >= tickOffset && event.tick < tickOffset + BASS_EDITOR_PART_TICKS)
          .forEach((event) => {
            symbols[event.tick - tickOffset] = "x";
          });
        return formatBassPatternSymbols(symbols);
      }

      function formatBassNotes(events, partIndex = null) {
        const tickOffset = partIndex === null ? 0 : partIndex * BASS_EDITOR_PART_TICKS;
        const tickLimit = partIndex === null ? BASS_TICKS : tickOffset + BASS_EDITOR_PART_TICKS;
        return normalizeBassEvents(events)
          .filter((event) => event.tick >= tickOffset && event.tick < tickLimit)
          .map((event) => bassNoteLabel(event).toLowerCase())
          .join(" ");
      }

      function updateBassEditorPartValidity(notesInput, patternInput, statsEl, maxTicks = BASS_EDITOR_PART_TICKS) {
        const notes = parseBassNotes(notesInput.value);
        const pattern = parseBassPattern(patternInput.value, maxTicks);
        const stats = pattern ? bassPatternStats(pattern) : { pulses: 0, sustains: 0, rests: 0, ticks: 0 };
        const invalidNotes = notes === null || (pattern !== null && notes.length !== stats.pulses);
        notesInput.classList.toggle("invalid", invalidNotes);
        notesInput.toggleAttribute("aria-invalid", invalidNotes);
        patternInput.classList.toggle("invalid", pattern === null);
        patternInput.toggleAttribute("aria-invalid", pattern === null);
        notesInput.title = invalidNotes
          ? `Enter exactly ${stats.pulses} note${stats.pulses === 1 ? "" : "s"} for this part. Each x starts a note; _ starts one only after silence.`
          : "";
        patternInput.title = pattern === null
          ? `Use X, x, _, and - for up to ${maxTicks} fine pulses. Spaces, ., and 0 are allowed separators/rests.`
          : "";
        if (statsEl) {
          statsEl.textContent = `notes ${notes?.length ?? 0}/${stats.pulses} | pulses ${stats.pulses} | sustains ${stats.sustains} | rests ${stats.rests} | ticks ${stats.ticks}/${maxTicks}`;
          statsEl.classList.toggle("invalid", invalidNotes);
        }
        return {
          events: invalidNotes || pattern === null ? null : bassPatternToEvents(notesInput.value, patternInput.value, Number(notesInput.dataset.tickOffset) || 0, maxTicks),
          pattern,
          stats,
        };
      }

      function updateBassEditorFromParts(editor) {
        const parts = [...editor.querySelectorAll("[data-bass-editor-part]")];
        const results = parts.map((part) => updateBassEditorPartValidity(
          part.querySelector(".bass-notes-input"),
          part.querySelector(".bass-pattern-input"),
          part.querySelector(".bass-editor-stats"),
          Number(part.querySelector(".bass-notes-input")?.dataset.maxTicks) || BASS_EDITOR_PART_TICKS,
        ));
        if (results.some((result) => !result.events)) return;
        currentScene().bass = sortAndTrimBassEvents(results.flatMap((result) => result.events));
        savePreset();
        renderBassRoll();
      }

      function renderDrumPatternPreviews() {
        document.querySelectorAll(".drum-pattern-preview").forEach((preview) => {
          const input = preview.parentElement?.querySelector(".drum-pattern-input");
          renderDrumPatternPreview(preview, input?.value, state.playhead >= 0 ? state.playhead % DRUM_STEPS : -1, DRUM_STEPS);
          if (input) preview.scrollLeft = input.scrollLeft;
        });
      }

      function inferSceneRole(name, index, totalScenes) {
        const normalized = String(name || "").trim().toLowerCase();
        const roleMap = [
          ["intro", "intro"],
          ["verse", "verse"],
          ["chorus", "chorus"],
          ["hook", "chorus"],
          ["bridge", "bridge"],
          ["break", "breakdown"],
          ["drop", "drop"],
          ["outro", "outro"],
          ["ending", "outro"],
          ["dub", "dub"],
          ["inst", "instrumental"],
        ];
        const matched = roleMap.find(([token]) => normalized.includes(token));
        if (matched) return matched[1];
        if (index === 0) return "intro";
        if (index === totalScenes - 1) return "outro";
        return "section";
      }

      function summarizeScene(scene, index, totalScenes) {
        const summary = summarizeSceneFn(scene, TRACKS);
        return {
          role: inferSceneRole(scene.name, index, totalScenes),
          ...summary,
        };
      }

      function exportDubText() {
        const bassLayer = state.bass.layers[0] || { shape: "sine", detune: 0, gain: 1 };
        const sceneSummaries = state.scenes.map((scene, index) => summarizeScene(scene, index, state.scenes.length));
        const lines = [
          "; SKNKR dub export",
          `; tempo: ${state.bpm}`,
          "; bars: 2",
          `; SKNKR.loop_steps: ${LOOP_STEPS}`,
          `; SKNKR.current_scene: ${dubSceneLabel(state.currentScene)}`,
          `; SKNKR.pending_scene: ${state.pendingScene === null ? "none" : dubSceneLabel(state.pendingScene)}`,
          `; SKNKR.loop_active_scene: ${dubMetaValue(state.loopActiveScene)}`,
          `; SKNKR.transport: ${dubMetaMap([
            ["strum", state.strumLength],
            ["pad_attack", state.padAttack],
          ])}`,
          `; SKNKR.main_mix: ${dubMetaMap([
            ["master", state.volumes.master],
            ["rhythm", state.volumes.rhythm],
            ["harmony", state.volumes.harmony],
            ["drums", state.volumes.drums],
            ["bass", state.bass.volume],
          ])}`,
          `; SKNKR.volumes: ${dubMetaMap([
            ["master", state.volumes.master],
            ["rhythm", state.volumes.rhythm],
            ["harmony", state.volumes.harmony],
            ["drums", state.volumes.drums],
          ])}`,
          `; SKNKR.sounds: ${dubMetaMap([
            ["rhythm", state.sounds.rhythm],
            ["harmony", state.sounds.harmony],
            ["kick", state.sounds.drums.kick],
            ["snare", state.sounds.drums.snare],
            ["hihat", state.sounds.drums.hihat],
            ["openhat", state.sounds.drums.openhat],
          ])}`,
          `; SKNKR.sound_labels: ${dubMetaMap([
            ["rhythm", soundLabel(state.sounds.rhythm)],
            ["harmony", soundLabel(state.sounds.harmony)],
            ["kick", drumSoundLabel(state.sounds.drums.kick)],
            ["snare", drumSoundLabel(state.sounds.drums.snare)],
            ["hihat", drumSoundLabel(state.sounds.drums.hihat)],
            ["openhat", drumSoundLabel(state.sounds.drums.openhat)],
          ])}`,
          `; SKNKR.bass: ${dubMetaMap([
            ["enabled", state.bass.enabled],
            ["preset", state.bass.preset],
            ["preset_label", bassPresetLabel(state.bass.preset)],
            ["shape", bassLayer.shape],
            ["octave", state.bass.octave],
            ["volume", state.bass.volume],
            ["filter", state.bass.filter],
            ["glide", state.bass.glide],
            ["release", state.bass.release],
            ["recording", state.bass.recording],
            ["detune", bassLayer.detune],
            ["layer_gain", bassLayer.gain],
          ])}`,
          `; SKNKR.chord_catalog: ${encodeChordCatalogPayload(state.chordCatalog)}`,
          `; SKNKR.arrangement: ${state.scenes.map((scene, index) => `${dubSceneLabel(index)}:${sceneSummaries[index].role}`).join("|")}`,
          "",
        ];
        state.scenes.forEach((scene, index) => {
          const rhythm = formatDubChordLayer(scene.rhythm);
          const harmony = formatDubChordLayer(scene.harmony);
          const summary = sceneSummaries[index];
          lines.push(`@${dubSceneLabel(index)}`);
          lines.push(`  ; scene.name: ${dubLineComment(scene.name)}`);
          lines.push(`  ; scene.role: ${summary.role}`);
          lines.push(`  ; scene.mutes: ${dubMetaMap([
            ["rhythm", Boolean(scene.mutes?.rhythm)],
            ["harmony", Boolean(scene.mutes?.harmony)],
            ["bass", Boolean(scene.mutes?.bass)],
          ])}`);
          lines.push(`  ; scene.drum_mutes: ${dubMetaMap(TRACKS.map((track) => [
            track.key,
            Boolean(scene.mutes?.drums?.[track.key]),
          ]))}`);
          lines.push(`  ; scene.drum_levels: ${dubMetaMap(TRACKS.map((track) => [
            track.key,
            scene.trackVolumes[track.key],
          ]))}`);
          lines.push(`  ; scene.rhythm_summary: ${dubMetaMap([
            ["first", summary.rhythm.first || "none"],
            ["entries", summary.rhythm.entries],
            ["changes", summary.rhythm.changes],
            ["density", summary.rhythm.density],
            ["distinct", summary.rhythm.distinct.join("|") || "none"],
            ["anchors", summary.rhythm.anchors.join("|") || "none"],
          ])}`);
          lines.push(`  ; scene.harmony_summary: ${dubMetaMap([
            ["first", summary.harmony.first || "none"],
            ["entries", summary.harmony.entries],
            ["changes", summary.harmony.changes],
            ["density", summary.harmony.density],
            ["distinct", summary.harmony.distinct.join("|") || "none"],
            ["anchors", summary.harmony.anchors.join("|") || "none"],
          ])}`);
          lines.push(`  ; scene.groove_density: ${dubMetaMap([
            ["kick", summary.drums.kick.density],
            ["snare", summary.drums.snare.density],
            ["hihat", summary.drums.hihat.density],
            ["openhat", summary.drums.openhat.density],
            ["bass", summary.bass.density],
            ["rhythm", summary.rhythm.density],
            ["harmony", summary.harmony.density],
          ])}`);
          lines.push(`  ; scene.groove_counts: ${dubMetaMap([
            ["kick_hits", summary.drums.kick.hits],
            ["snare_hits", summary.drums.snare.hits],
            ["hihat_hits", summary.drums.hihat.hits],
            ["openhat_hits", summary.drums.openhat.hits],
            ["drum_accents", TRACKS.reduce((sum, track) => sum + summary.drums[track.key].accents, 0)],
            ["bass_notes", summary.bass.notes],
            ["bass_sustain_ticks", summary.bass.sustainTicks],
            ["rhythm_entries", summary.rhythm.entries],
            ["harmony_entries", summary.harmony.entries],
          ])}`);
          lines.push(`  ; scene.bass_summary: ${dubMetaMap([
            ["first", summary.bass.first || "none"],
            ["notes", summary.bass.notes],
            ["sustain_ticks", summary.bass.sustainTicks],
            ["active_ticks", summary.bass.activeTicks],
            ["density", summary.bass.density],
            ["distinct", summary.bass.distinct.join("|") || "none"],
          ])}`);
          lines.push(`  #rhythm 1.0 ${rhythm.pattern}${rhythm.pool ? ` ${rhythm.pool}` : ""}`);
          lines.push(`  #harmony 1.0 ${harmony.pattern}${harmony.pool ? ` ${harmony.pool}` : ""}`);
          lines.push(`  #bass ${state.bass.volume.toFixed(2)} ${formatDubBassPattern(scene.bass)} ${formatBassNotes(scene.bass)}`.trimEnd());
          TRACKS.forEach((track) => {
            lines.push(`  #${track.key} ${scene.trackVolumes[track.key].toFixed(2)} ${formatDrumPattern(scene.drums[track.key])} ${DRUM_NOTE_LABELS[track.key]}`);
          });
          lines.push("");
        });
        lines.push(`$: ${state.scenes.map((_, index) => dubSceneLabel(index)).join(" ")}`);
        return `${lines.join("\n")}\n`;
      }

      function downloadTextFile(filename, text, type = "text/plain") {
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      function stripDubComment(line) {
        const semicolon = line.indexOf(";");
        const dash = line.indexOf(" -- ");
        const cuts = [semicolon, dash].filter((index) => index >= 0);
        return cuts.length ? line.slice(0, Math.min(...cuts)) : line;
      }

      function applyDubChannel(scene, channel) {
        if (channel.instrument === "rhythm" || channel.instrument === "skank") {
          const slots = chordDubLineToSlots(channel.pattern, channel.notes);
          if (!slots) throw new Error(`Invalid rhythm DUB line in ${scene.name}.`);
          scene.rhythm = slots;
          return;
        }
        if (channel.instrument === "harmony" || channel.instrument === "chords") {
          const slots = chordDubLineToSlots(channel.pattern, channel.notes);
          if (!slots) throw new Error(`Invalid harmony DUB line in ${scene.name}.`);
          scene.harmony = slots;
          return;
        }
        if (channel.instrument === "bass" || channel.instrument === "bassline") {
          const events = bassDubLineToEvents(channel.pattern, channel.notes);
          if (!events) throw new Error(`Invalid bass DUB line in ${scene.name}.`);
          scene.bass = events;
          return;
        }
        const drumTrackName = dubDrumTrackKey(channel.instrument);
        const drumTrack = TRACKS.find((track) => track.key === drumTrackName || track.label.toLowerCase().replace(/[^a-z]/g, "") === drumTrackName);
        if (!drumTrack) return;
        const values = drumDubLineToValues(channel.pattern);
        if (!values) throw new Error(`Invalid ${channel.instrument} DUB line in ${scene.name}.`);
        scene.drums[drumTrack.key] = values;
        if (Number.isFinite(channel.volume)) {
          scene.trackVolumes[drumTrack.key] = clampNumber(channel.volume, 0, 1, scene.trackVolumes[drumTrack.key]);
        }
      }

      function importDubTextIntoState(text, targetState) {
        const scenesByName = new Map();
        const order = [];
        let nextBpm = targetState.bpm;
        let nextChordCatalog = null;
        let currentSection = null;
        String(text || "").split(/\r?\n/).forEach((rawLine) => {
          const commentSceneName = rawLine.match(/^\s*;\s*scene\.name:\s*(.+)$/i);
          if (commentSceneName && currentSection) {
            currentSection.name = commentSceneName[1].trim() || currentSection.name;
            return;
          }
          const chordCatalog = rawLine.match(/^\s*;\s*SKNKR\.chord_catalog:\s*(.+)$/i);
          if (chordCatalog) {
            try {
              nextChordCatalog = decodeChordCatalogPayload(chordCatalog[1].trim());
            } catch (error) {
              console.warn("Could not decode DUB chord catalog", error);
            }
            return;
          }
          const tempo = rawLine.match(/^\s*;\s*tempo:\s*(\d+(?:\.\d+)?)/i);
          if (tempo) nextBpm = clampNumber(tempo[1], 60, 200, targetState.bpm);
          const line = stripDubComment(rawLine).trim();
          if (!line) return;
          if (line.startsWith("$:")) {
            order.splice(0, order.length, ...parseDubArrangement(line.slice(2)));
            return;
          }
          const sectionMatch = line.match(/^@?([A-Za-z][A-Za-z0-9_-]*)$/);
          if (sectionMatch && !line.startsWith("#")) {
            const name = sectionMatch[1];
            currentSection = createBlankScene(scenesByName.size);
            currentSection.name = name;
            scenesByName.set(name, currentSection);
            if (!order.includes(name)) order.push(name);
            return;
          }
          if (line.startsWith("#")) {
            const channel = parseDubChannelLine(line);
            if (!channel && /^#+\s*[A-Za-z][A-Za-z0-9_-]*$/.test(line)) return;
            if (!currentSection) throw new Error("DUB channel line found before a section.");
            if (!channel) throw new Error(`Could not parse DUB line: ${line}`);
            applyDubChannel(currentSection, channel);
          }
        });
        const orderedNames = order.filter((name) => scenesByName.has(name));
        if (!orderedNames.length) throw new Error("No DUB sections found to import.");
        targetState.bpm = nextBpm;
        if (nextChordCatalog) targetState.chordCatalog = nextChordCatalog;
        targetState.scenes = orderedNames.map((name, index) => normalizeScene(scenesByName.get(name), index));
        targetState.currentScene = 0;
        targetState.pendingScene = null;
        releaseHarmony(audioContext?.currentTime || 0);
      }

      function importDubText(text) {
        importDubTextIntoState(text, state);
        savePreset();
        renderAll();
      }

      function parseBareBlocksToDub(text) {
        const drumLabels = { kick: "kick", bd: "kick", k: "kick", snare: "snare", sn: "snare", hihat: "hats", hh: "hats", hat: "hats", openhat: "oh", oh: "oh", rim: "oh" };
        const bassLabels = new Set(["bass", "b", "bassline"]);
        const chordLabels = new Set(["skank", "chord", "chords", "rhythm"]);
        const harmonyLabels = new Set(["pad", "texture", "harmony"]);

        const blocks = [];
        let current = null;
        String(text).split(/\r?\n/).forEach((rawLine) => {
          const line = rawLine.trim();
          const single = line.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
          if (single) { blocks.push({ label: single[1].toLowerCase(), content: single[2].trim() }); current = null; return; }
          const header = line.match(/^([a-z][a-z0-9_]*)\s*:\s*$/i);
          if (header) { current = { label: header[1].toLowerCase(), content: "" }; blocks.push(current); return; }
          if (current && line) { current.content += line; return; }
          if (!line) current = null;
        });

        const dubLines = ["@A"];
        blocks.forEach(({ label, content }) => {
          if (!content) return;
          const drumKey = drumLabels[label];
          if (drumKey) {
            const pat = reconcilePastePattern(content.replace(/\s/g, ""), DRUM_STEPS);
            dubLines.push(`#${drumKey} 1.0 ${pat} c3`);
            return;
          }
          if (bassLabels.has(label)) {
            const { pat, notes } = parseBassInlinePattern(content);
            if (notes.length) dubLines.push(`#bass 0.8 ${pat} ${notes.join(" ")}`);
            return;
          }
          if (chordLabels.has(label)) {
            const { pat, chords } = parseChordInlinePattern(content);
            if (chords.length) dubLines.push(`#chord 0.7 ${pat} ${chords.join(" ")}`);
            return;
          }
          if (harmonyLabels.has(label)) {
            const { pat, chords } = parseChordInlinePattern(content);
            if (chords.length) dubLines.push(`#harmony 0.6 ${pat} ${chords.join(" ")}`);
            return;
          }
          console.warn(`Paste: unknown bare block label "${label}" — skipping`);
        });

        if (dubLines.length === 1) throw new Error("No recognisable channels found in bare block snippet.");
        return dubLines.join("\n");
      }

      function previewDubText(text) {
        const snapshot = structuredClone(state);
        try {
          const format = detectPasteFormat(text);
          const dub = format === "bare" ? parseBareBlocksToDub(text) : text;
          importDubTextIntoState(dub, state);
          renderAll();
          if (!state.isPlaying) startPlayback();
          return { ok: true, snapshot };
        } catch (err) {
          Object.assign(state, snapshot);
          renderAll();
          return { ok: false, error: err.message, snapshot };
        }
      }

      function discardPreview(snapshot) {
        const wasPlaying = state.isPlaying;
        Object.assign(state, snapshot);
        if (wasPlaying) stopPlayback(false);
        renderAll();
      }

      function handleDubImportFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          try {
            runBlockingAction(() => null);
            importDubText(String(reader.result || ""));
          } catch (error) {
            alertBlocking(error instanceof Error ? error.message : "Could not import DUB file.");
          } finally {
            el.dubImportFile.value = "";
          }
        });
        reader.addEventListener("error", () => {
          alertBlocking(`Could not read ${file.name}.`);
          el.dubImportFile.value = "";
        });
        reader.readAsText(file);
      }

      function normalizeScene(rawScene, index) {
        const blankScene = createBlankScene(index);
        const source = rawScene && typeof rawScene === "object" ? rawScene : {};
        const rhythm = fixedLengthArray(source.rhythm, "", CHORD_STEPS).map((value) => String(value || ""));
        const harmony = fixedLengthArray(source.harmony, "", CHORD_STEPS).map((value) => String(value || ""));
        const bass = normalizeBassEvents(source.bass);
        return {
          name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : blankScene.name,
          rhythm,
          harmony,
          chordPoolText: {
            rhythm: chordPoolTextState(rhythm, source.chordPoolText?.rhythm, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS),
            harmony: chordPoolTextState(harmony, source.chordPoolText?.harmony, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS),
          },
          chordPatternText: {
            rhythm: chordPoolTextState(rhythm, source.chordPatternText?.rhythm, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS),
            harmony: chordPoolTextState(harmony, source.chordPatternText?.harmony, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS),
          },
          bass,
          bassText: bassTextState(bass, source.bassText, formatBassNotes, formatBassPattern),
          drums: Object.fromEntries(TRACKS.map((track) => [
            track.key,
            drumLengthArray(source.drums?.[track.key]).map(normalizeDrumValue),
          ])),
          mutes: {
            rhythm: Boolean(source.mutes?.rhythm),
            harmony: Boolean(source.mutes?.harmony),
            bass: Boolean(source.mutes?.bass),
            drums: Object.fromEntries(TRACKS.map((track) => [
              track.key,
              Boolean(source.mutes?.drums?.[track.key]),
            ])),
          },
          trackVolumes: Object.fromEntries(TRACKS.map((track) => [
            track.key,
            clampNumber(source.trackVolumes?.[track.key], 0, 1, blankScene.trackVolumes[track.key]),
          ])),
        };
      }

      function normalizeUserDrumPreset(source) {
        if (!source || typeof source !== "object") return null;
        const name = typeof source.name === "string" ? source.name.trim() : "";
        if (!name) return null;
        const rawId = typeof source.id === "string" && source.id.trim() ? source.id.trim() : name;
        const id = rawId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `rhythm-${Date.now()}`;
        return {
          id,
          name,
          bpm: clampNumber(source.bpm, 60, 200, state.bpm),
          createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
          updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
          drums: Object.fromEntries(TRACKS.map((track) => [
            track.key,
            drumLengthArray(source.drums?.[track.key]).map(normalizeDrumValue),
          ])),
        };
      }

      function currentDrumPattern() {
        const scene = currentScene();
        return Object.fromEntries(TRACKS.map((track) => [
          track.key,
          drumLengthArray(scene.drums[track.key]).map(normalizeDrumValue),
        ]));
      }

      function userDrumPresetExportPayload() {
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          presets: state.userDrumPresets.map((preset) => normalizeUserDrumPreset(preset)).filter(Boolean),
        };
      }

      function loadUserDrumPresets() {
        try {
          const rawPresets = window.localStorage.getItem(USER_DRUM_PRESETS_KEY);
          if (!rawPresets) return;
          const parsed = JSON.parse(rawPresets);
          const rawList = Array.isArray(parsed) ? parsed : parsed?.presets;
          state.userDrumPresets = Array.isArray(rawList) ? rawList.map(normalizeUserDrumPreset).filter(Boolean) : [];
        } catch (error) {
          console.warn("Could not load user drum presets", error);
        }
      }

      function saveUserDrumPresets() {
        try {
          window.localStorage.setItem(USER_DRUM_PRESETS_KEY, JSON.stringify(userDrumPresetExportPayload()));
        } catch (error) {
          console.warn("Could not save user drum presets", error);
        }
      }

      function normalizeUserChordPreset(source) {
        if (!source || typeof source !== "object") return null;
        const name = typeof source.name === "string" ? source.name.trim() : "";
        if (!name) return null;
        const rawId = typeof source.id === "string" && source.id.trim() ? source.id.trim() : name;
        const id = rawId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `progression-${Date.now()}`;
        const chordCatalog = source.chordCatalog && typeof source.chordCatalog === "object"
          ? Object.fromEntries(Object.entries(source.chordCatalog).map(([chord, notes]) => [chordName(chord), String(notes || "")]).filter(([chord]) => chord))
          : {};
        return {
          id,
          name,
          createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
          updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
          rhythm: fixedLengthArray(source.rhythm, "", CHORD_STEPS).map((value) => String(value || "").trim()),
          harmony: fixedLengthArray(source.harmony, "", CHORD_STEPS).map((value) => String(value || "").trim()),
          chordCatalog,
        };
      }

      function currentChordPattern() {
        const scene = currentScene();
        return {
          rhythm: fixedLengthArray(scene.rhythm, "", CHORD_STEPS).map((value) => String(value || "").trim()),
          harmony: fixedLengthArray(scene.harmony, "", CHORD_STEPS).map((value) => String(value || "").trim()),
          chordCatalog: { ...state.chordCatalog },
        };
      }

      function userChordPresetExportPayload() {
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          progressions: state.userChordPresets.map((preset) => normalizeUserChordPreset(preset)).filter(Boolean),
        };
      }

      function loadUserChordPresets() {
        try {
          const rawPresets = window.localStorage.getItem(USER_CHORD_PRESETS_KEY);
          if (!rawPresets) return;
          const parsed = JSON.parse(rawPresets);
          const rawList = Array.isArray(parsed) ? parsed : parsed?.progressions;
          state.userChordPresets = Array.isArray(rawList) ? rawList.map(normalizeUserChordPreset).filter(Boolean) : [];
        } catch (error) {
          console.warn("Could not load user chord progressions", error);
        }
      }

      function saveUserChordPresets() {
        try {
          window.localStorage.setItem(USER_CHORD_PRESETS_KEY, JSON.stringify(userChordPresetExportPayload()));
        } catch (error) {
          console.warn("Could not save user chord progressions", error);
        }
      }

      function normalizeBassSettings(source = {}) {
        const rawPreset = Object.prototype.hasOwnProperty.call(BASS_PRESETS, source.preset) ? source.preset : "sub";
        const preset = BASS_PRESETS[rawPreset];
        const rawLayer = Array.isArray(source.layers) && source.layers[0] ? source.layers[0] : {};
        const shape = BASS_SHAPES.includes(rawLayer.shape) ? rawLayer.shape : preset.shape;
        return {
          enabled: Boolean(source.enabled),
          preset: rawPreset,
          octave: Math.trunc(clampNumber(source.octave, 0, 4, 2)),
          transpose: Math.trunc(clampNumber(source.transpose, -24, 24, 0)),
          volume: clampNumber(source.volume, 0, 1, 0.65),
          filter: clampNumber(source.filter, 120, 1800, preset.filter),
          glide: clampNumber(source.glide, 0, 0.2, preset.glide),
          release: clampNumber(source.release, 0.04, 1, preset.release),
          recording: Boolean(source.recording),
          layers: [{
            shape,
            detune: clampNumber(rawLayer.detune, -1200, 1200, 0),
            gain: clampNumber(rawLayer.gain, 0, 1, 1),
          }],
          harmonics: clampNumber(source.harmonics ?? preset.harmonics ?? 0, 0, 1, 0),
          harmonicShape: BASS_SHAPES.includes(source.harmonicShape) ? source.harmonicShape : (preset.harmonicShape || "square"),
          harmonicFilter: clampNumber(source.harmonicFilter ?? preset.harmonicFilter ?? 300, 100, 1000, 300),
        };
      }

      function applyBassPreset(presetKey) {
        const preset = BASS_PRESETS[presetKey] || BASS_PRESETS.sub;
        state.bass.preset = presetKey;
        state.bass.filter = preset.filter;
        state.bass.glide = preset.glide;
        state.bass.release = preset.release;
        state.bass.layers = [{ ...state.bass.layers[0], shape: preset.shape }];
        state.bass.harmonics = preset.harmonics ?? 0;
        state.bass.harmonicShape = preset.harmonicShape ?? "square";
        state.bass.harmonicFilter = preset.harmonicFilter ?? 300;
        savePreset();
        renderBassControls();
      }

      function presetSnapshot() {
        return {
          version: 1,
          presetName: PRESET_NAME,
          uiMode: state.uiMode,
          songTitle: state.songTitle,
          songNote: state.songNote,
          bpm: state.bpm,
          currentScene: state.currentScene,
          loopActiveScene: state.loopActiveScene,
          strumLength: state.strumLength,
          padAttack: state.padAttack,
          drumPresetPanelOpen: state.drumPresetPanelOpen,
          drumPresetGenre: state.drumPresetGenre,
          activeDrumPreset: state.activeDrumPreset ? { ...state.activeDrumPreset } : null,
          chordPresetPanelOpen: state.chordPresetPanelOpen,
          activeChordPreset: state.activeChordPreset ? { ...state.activeChordPreset } : null,
          sounds: { ...state.sounds },
          bass: normalizeBassSettings(state.bass),
          volumes: { ...state.volumes },
          chordCatalog: { ...state.chordCatalog },
          scenes: state.scenes.map((scene, index) => normalizeScene(scene, index)),
        };
      }

      function defaultProjectSnapshot() {
        return {
          version: 1,
          presetName: PRESET_NAME,
          uiMode: "edit",
          songTitle: "Untitled Project",
          songNote: "",
          bpm: 100,
          currentScene: 0,
          loopActiveScene: false,
          strumLength: 0.12,
          padAttack: 0.08,
          drumPresetPanelOpen: false,
          drumPresetGenre: "reggae",
          activeDrumPreset: null,
          chordPresetPanelOpen: false,
          activeChordPreset: null,
          sounds: {
            rhythm: "organ",
            harmony: "pad",
            drums: { kick: "internal", snare: "internal", hihat: "internal", openhat: "internal" },
          },
          bass: normalizeBassSettings({}),
          volumes: { master: 0.8, rhythm: 0.55, harmony: 0.35, drums: 0.75 },
          chordCatalog: { ...DEFAULT_CHORD_CATALOG },
          scenes: Array.from({ length: INITIAL_SCENE_COUNT }, (_, index) => createScene(index)),
        };
      }

      function normalizeProjectEntry(source) {
        if (!source || typeof source !== "object") return null;
        const name = typeof source.name === "string" ? source.name.trim() : "";
        if (!name) return null;
        const snapshot = source.snapshot && typeof source.snapshot === "object" ? source.snapshot : null;
        if (!snapshot) return null;
        return {
          id: typeof source.id === "string" && source.id.trim()
            ? source.id.trim()
            : `project-${Date.now()}`,
          name,
          updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
          snapshot,
        };
      }

      function loadProjects() {
        try {
          const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : parsed?.projects;
          state.projects = Array.isArray(list) ? list.map(normalizeProjectEntry).filter(Boolean) : [];
        } catch (error) {
          console.warn("Could not load local projects", error);
          state.projects = [];
        }
      }

      function saveProjects() {
        try {
          window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify({ projects: state.projects }));
        } catch (error) {
          console.warn("Could not save local projects", error);
        }
      }

      function encodeShareState(snapshot) {
        return utf8ToBase64Url(JSON.stringify({
          v: SHARE_STATE_VERSION,
          p: snapshot,
        }));
      }

      function decodeShareState(encoded) {
        const parsed = JSON.parse(base64UrlToUtf8(encoded));
        if (!parsed || typeof parsed !== "object") return null;
        if (parsed.v !== SHARE_STATE_VERSION) return null;
        if (!parsed.p || typeof parsed.p !== "object") return null;
        return parsed.p;
      }

      function encodeHeader() {
        let result = sktEncodeHeader(state);
        if (chordCatalogSignature(state.chordCatalog) !== chordCatalogSignature(DEFAULT_CHORD_CATALOG)) {
          result += `,c${encodeChordCatalogPayload(state.chordCatalog)}`;
        }
        return result;
      }

      function decodeHeader(token) {
        const snapshot = sktDecodeHeader(token);
        String(token || "").split(",").forEach((part) => {
          if (part.startsWith("c")) {
            try {
              snapshot.chordCatalog = decodeChordCatalogPayload(part.slice(1));
            } catch (error) {
              console.warn("Could not decode shared chord catalog", error);
            }
          }
        });
        return snapshot;
      }

      function currentShareUrlV2() {
        const url = new URL(`${window.location.origin}${window.location.pathname}`);
        url.searchParams.set("s", encodeHeader());
        state.scenes.forEach((scene, index) => {
          url.searchParams.set(`s[${index}]`, encodeScene(scene, index));
        });
        return url.toString();
      }

      function replaceUrlWithCurrentShareState() {
        const nextUrl = currentShareUrlV2();
        const currentUrl = window.location.href;
        if (nextUrl === currentUrl) return;
        window.history.replaceState(null, "", nextUrl);
      }

      function applySharedStateFromUrlV2() {
        const params = new URLSearchParams(window.location.search);
        const headerToken = params.get("s");
        if (!headerToken) return false;
        try {
          const header = decodeHeader(headerToken);
          const scenes = collectIndexed(params, "s").map((sceneToken, index) => decodeScene(sceneToken, index));
          if (!scenes.length) return false;
          const snapshot = defaultProjectSnapshot();
          if (header.songTitle) snapshot.songTitle = header.songTitle;
          if (header.bpm) snapshot.bpm = header.bpm;
          if (header.sounds) {
            snapshot.sounds = {
              rhythm: header.sounds.rhythm,
              harmony: header.sounds.harmony,
              drums: normalizeDrumSounds(header.sounds.drums, snapshot.sounds.drums, TRACKS, DRUM_KIT_CATALOG),
            };
          }
          if (header.volumes) snapshot.volumes = { ...snapshot.volumes, ...header.volumes };
          if (header.strumLength !== undefined) snapshot.strumLength = header.strumLength;
          if (header.padAttack !== undefined) snapshot.padAttack = header.padAttack;
          if (header.bass) snapshot.bass = normalizeBassSettings({ ...snapshot.bass, ...header.bass });
          if (header.chordCatalog) snapshot.chordCatalog = header.chordCatalog;
          snapshot.scenes = scenes;
          snapshot.currentScene = 0;
          state.pendingUrlSnapshot = snapshot;
          state.hasUrlSong = true;
          return true;
        } catch (error) {
          console.warn("Could not load shared URL state v2", error);
          return false;
        }
      }

      function applyPresetData(preset) {
        if (!preset || typeof preset !== "object") return;
        state.uiMode = normalizeUiMode(preset.uiMode);
        state.songTitle = typeof preset.songTitle === "string" && preset.songTitle.trim()
          ? preset.songTitle.trim()
          : state.songTitle;
        state.songNote = typeof preset.songNote === "string"
          ? preset.songNote.trim()
          : state.songNote;
        state.bpm = clampNumber(preset.bpm, 60, 200, state.bpm);
        state.loopActiveScene = Boolean(preset.loopActiveScene);
        state.strumLength = clampNumber(preset.strumLength, 0.05, 0.25, state.strumLength);
        state.padAttack = clampNumber(preset.padAttack, 0.02, 0.4, state.padAttack);
        state.drumPresetPanelOpen = Boolean(preset.drumPresetPanelOpen);
        state.drumPresetGenre = Object.prototype.hasOwnProperty.call(DRUM_PRESETS, preset.drumPresetGenre)
          ? preset.drumPresetGenre
          : state.drumPresetGenre;
        state.chordPresetPanelOpen = Boolean(preset.chordPresetPanelOpen);
        const savedActivePreset = preset.activeDrumPreset;
        const hasBuiltInPreset = savedActivePreset && DRUM_PRESETS[savedActivePreset.genre]?.patterns[savedActivePreset.preset];
        const hasUserPreset = savedActivePreset?.genre === "user" && state.userDrumPresets.some((entry) => entry.id === savedActivePreset.preset);
        state.activeDrumPreset = hasBuiltInPreset || hasUserPreset
          ? { genre: savedActivePreset.genre, preset: savedActivePreset.preset }
          : null;
        const savedActiveChordPreset = preset.activeChordPreset;
        state.activeChordPreset = savedActiveChordPreset?.type === "user" && state.userChordPresets.some((entry) => entry.id === savedActiveChordPreset.preset)
          ? { type: "user", preset: savedActiveChordPreset.preset }
          : null;
        state.sounds = {
          rhythm: Object.prototype.hasOwnProperty.call(SOUND_CATALOG, preset.sounds?.rhythm)
            ? preset.sounds.rhythm
            : (preset.rhythmEngine === "webaudiofont-piano" ? "piano" : state.sounds.rhythm),
          harmony: Object.prototype.hasOwnProperty.call(SOUND_CATALOG, preset.sounds?.harmony)
            ? preset.sounds.harmony
            : state.sounds.harmony,
          drums: normalizeDrumSounds(preset.sounds?.drums, state.sounds.drums, TRACKS, DRUM_KIT_CATALOG),
        };
        state.bass = normalizeBassSettings(preset.bass);
        state.volumes = {
          master: clampNumber(preset.volumes?.master, 0, 1, state.volumes.master),
          rhythm: clampNumber(preset.volumes?.rhythm, 0, 1, state.volumes.rhythm),
          harmony: clampNumber(preset.volumes?.harmony, 0, 1, state.volumes.harmony),
          drums: clampNumber(preset.volumes?.drums, 0, 1, state.volumes.drums),
        };
        state.chordCatalog = preset.chordCatalog && typeof preset.chordCatalog === "object"
          ? Object.fromEntries(Object.entries(preset.chordCatalog).map(([name, notes]) => [chordName(name), String(notes || "")]).filter(([name]) => name))
          : state.chordCatalog;
        const savedScenes = Array.isArray(preset.scenes) && preset.scenes.length
          ? preset.scenes.map((scene, index) => normalizeScene(scene, index))
          : Array.from({ length: INITIAL_SCENE_COUNT }, (_, index) => createScene(index));
        state.scenes = savedScenes;
        state.currentScene = Math.trunc(clampNumber(preset.currentScene, 0, state.scenes.length - 1, 0));
      }

      function savePreset() {
        state.dirty = true;
        renderProjectState();
        renderShell();
      }

      function undoDrumClear(trackKey) {
        const scene = currentScene();
        const pattern = drumUndoBuffer[trackKey];
        if (!pattern) {
          return;
        }
        scene.drums[trackKey] = pattern;
        delete drumUndoBuffer[trackKey];
        applyVolumes();
        savePreset();
        renderDrumGrid();
      }

      function undoBassClear() {
        const scene = currentScene();
        if (!bassUndoBuffer) {
          return;
        }
        scene.bass = bassUndoBuffer;
        scene.bassText = bassTextState(scene.bass, null, formatBassNotes, formatBassPattern);
        bassUndoBuffer = null;
        savePreset();
        renderDrumGrid();
      }

      const drumUndoBuffer = {};
      let bassUndoBuffer = null;

      function loadPreset() {
        applyPresetData(defaultProjectSnapshot());
        state.currentProjectId = null;
        state.dirty = false;
      }

      function currentProject() {
        return state.projects.find((project) => project.id === state.currentProjectId) || null;
      }

      function renderProjectState() {
        const project = currentProject();
        if (el.projectSave) {
          el.projectSave.classList.toggle("dirty", state.dirty || !project);
          el.projectSave.textContent = project ? (state.dirty ? "SAVE" : "SAVED") : "SAVE";
        }
        if (el.projectSelect) {
          const previousValue = el.projectSelect.value;
          el.projectSelect.replaceChildren();
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = state.projects.length ? "Select project" : "No saved projects";
          el.projectSelect.append(placeholder);
          state.projects
            .slice()
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .forEach((projectEntry) => {
              const option = document.createElement("option");
              option.value = projectEntry.id;
              option.textContent = projectEntry.name;
              el.projectSelect.append(option);
            });
          el.projectSelect.value = state.projects.some((projectEntry) => projectEntry.id === previousValue)
            ? previousValue
            : "";
          if (!el.projectSelect.value && project) el.projectSelect.value = project.id;
        }
        if (el.projectLoad) el.projectLoad.disabled = !(el.projectSelect && el.projectSelect.value);
        if (el.projectRemove) el.projectRemove.disabled = !(el.projectSelect && el.projectSelect.value);
        if (el.loadUrlSong) {
          el.loadUrlSong.style.display = state.hasUrlSong ? "block" : "none";
        }
      }

      function confirmDiscardUnsavedChanges(actionLabel) {
        if (!state.dirty) return true;
        return confirmBlocking(`Discard unsaved changes and ${actionLabel}?`);
      }

      function saveCurrentProject() {
        const existing = currentProject();
        let baseName = state.songTitle || "Untitled Project";
        let nextName = baseName;
        let counter = 1;
        while (state.projects.some((p) => p.name === nextName && p.id !== existing?.id)) {
          counter += 1;
          nextName = `${baseName} v${counter}`;
        }
        const project = normalizeProjectEntry({
          id: existing?.id || `project-${Date.now()}`,
          name: nextName,
          updatedAt: new Date().toISOString(),
          snapshot: presetSnapshot(),
        });
        const index = state.projects.findIndex((entry) => entry.id === project.id);
        if (index >= 0) state.projects.splice(index, 1, project);
        else state.projects.push(project);
        state.currentProjectId = project.id;
        state.dirty = false;
        saveProjects();
        renderProjectState();
        renderShell();
      }

      function loadSelectedProject() {
        const projectId = el.projectSelect?.value;
        const project = state.projects.find((entry) => entry.id === projectId);
        if (!project) return;
        if (!confirmDiscardUnsavedChanges(`load ${project.name}`)) {
          renderProjectState();
          return;
        }
        if (state.isPlaying) stopPlayback(false);
        applyPresetData(project.snapshot);
        state.currentProjectId = project.id;
        state.dirty = false;
        releaseHarmony(audioContext?.currentTime || 0);
        releaseAllBassNotes();
        renderAll();
      }

      function removeSelectedProject() {
        const projectId = el.projectSelect?.value;
        const project = state.projects.find((entry) => entry.id === projectId);
        if (!project) return;
        if (!confirm(`Remove project "${project.name}"?`)) return;
        state.projects = state.projects.filter((entry) => entry.id !== projectId);
        if (state.currentProjectId === projectId) {
          state.currentProjectId = null;
          state.dirty = true;
        }
        saveProjects();
        renderProjectState();
      }

      function clearWorkingProject() {
        if (!confirmDiscardUnsavedChanges("clear the current working project")) {
          renderProjectState();
          return;
        }
        if (state.isPlaying) stopPlayback(false);
        applyPresetData(defaultProjectSnapshot());
        state.currentProjectId = null;
        state.dirty = false;
        releaseHarmony(audioContext?.currentTime || 0);
        releaseAllBassNotes();
        renderAll();
      }

      function applySharedStateFromUrl() {
        const rawHash = String(window.location.hash || "").replace(/^#/, "");
        if (!rawHash) return false;
        const hashParams = new URLSearchParams(rawHash);
        const encoded = hashParams.get(SHARE_HASH_KEY);
        if (!encoded) return false;
        try {
          const snapshot = decodeShareState(encoded);
          if (!snapshot) throw new Error("Invalid shared state payload");
          state.pendingUrlSnapshot = snapshot;
          state.hasUrlSong = true;
          return true;
        } catch (error) {
          console.warn("Could not load shared URL state", error);
          return false;
        }
      }

      function applyUrlPresetIdentity() {
        const params = new URLSearchParams(window.location.search);
        const genre = params.get("dp_genre");
        const preset = params.get("dp_preset");
        if (!genre || !preset || !DRUM_PRESETS[genre]?.patterns[preset]) return;
        state.drumPresetGenre = genre;
        state.activeDrumPreset = { genre, preset };
      }

      function renderScenes() {
        el.sceneTabs.replaceChildren();
        el.sceneLoopToggle.checked = shouldLoopActiveScene();
        el.sceneLoopToggle.disabled = state.uiMode === "edit";
        el.sceneLoopToggle.title = state.uiMode === "edit" ? "Edit mode always loops the active scene." : "";
        state.scenes.forEach((scene, index) => {
          const row = document.createElement("div");
          row.className = "scene-tab-row";
          row.dataset.sceneIndex = String(index);

          const tab = document.createElement("button");
          tab.type = "button";
          tab.draggable = true;
          tab.textContent = scene.name;
          tab.classList.toggle("active", index === state.currentScene);
          tab.classList.toggle("pending", index === state.pendingScene);
          const hasRhythm = scene.rhythm && scene.rhythm.some(Boolean);
          const hasHarmony = scene.harmony && scene.harmony.some(Boolean);
          const hasBass = scene.bass && scene.bass.length > 0;
          const hasDrums = scene.drums && Object.values(scene.drums).some(arr => arr && arr.some(v => v > 0));
          const isEmpty = !hasRhythm && !hasHarmony && !hasBass && !hasDrums;
          tab.classList.toggle("empty", isEmpty);
          tab.addEventListener("click", () => selectScene(index));
          tab.addEventListener("dblclick", () => {
            if (state.uiMode === "edit") {
              const input = document.createElement("input");
              input.type = "text";
              input.value = scene.name;
              input.className = "scene-name-input";
              input.spellcheck = false;
              tab.replaceWith(input);
              input.focus();
              input.select();
              const finishEdit = () => {
                const nextName = input.value.trim();
                if (nextName && nextName !== scene.name) {
                  scene.name = nextName;
                  savePreset();
                }
                input.replaceWith(tab);
                tab.textContent = scene.name;
                renderScenes();
              };
              input.addEventListener("blur", finishEdit);
              input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  input.blur();
                } else if (e.key === "Escape") {
                  input.value = scene.name;
                  input.blur();
                }
              });
            } else {
              selectScene(index, true);
            }
          });
          tab.addEventListener("dragstart", (event) => {
            draggedSceneIndex = index;
            row.classList.add("dragging");
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/plain", `scene:${index}`);
          });
          tab.addEventListener("dragend", () => {
            draggedSceneIndex = null;
            document.querySelectorAll(".scene-tab-row.dragging, .scene-tab-row.drag-over").forEach((node) => {
              node.classList.remove("dragging", "drag-over");
            });
          });
          row.addEventListener("dragover", (event) => {
            if (draggedSceneIndex === null || draggedSceneIndex === index) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            row.classList.add("drag-over");
          });
          row.addEventListener("dragleave", () => {
            row.classList.remove("drag-over");
          });
          row.addEventListener("drop", (event) => {
            event.preventDefault();
            row.classList.remove("drag-over");
            if (draggedSceneIndex === null || draggedSceneIndex === index) return;
            cloneSceneToSlot(draggedSceneIndex, index);
            draggedSceneIndex = null;
          });

          const moveUp = document.createElement("button");
          moveUp.type = "button";
          moveUp.className = "scene-move";
          moveUp.textContent = "↑";
          moveUp.disabled = index === 0;
          moveUp.setAttribute("aria-label", `Move ${scene.name} earlier`);
          moveUp.addEventListener("click", () => moveScene(index, index - 1));

          const moveDown = document.createElement("button");
          moveDown.type = "button";
          moveDown.className = "scene-move";
          moveDown.textContent = "↓";
          moveDown.disabled = index === state.scenes.length - 1;
          moveDown.setAttribute("aria-label", `Move ${scene.name} later`);
          moveDown.addEventListener("click", () => moveScene(index, index + 1));

          row.append(tab, moveUp, moveDown);
          el.sceneTabs.append(row);
        });

        const addSceneButton = document.createElement("button");
        addSceneButton.type = "button";
        addSceneButton.className = "scene-list-action";
        addSceneButton.textContent = "+ Scene";
        addSceneButton.addEventListener("click", addScene);
        el.sceneTabs.append(addSceneButton);

        const clone = document.createElement("button");
        clone.type = "button";
        clone.className = "scene-list-action";
        clone.textContent = "+ Clone";
        clone.addEventListener("click", cloneCurrentScene);
        el.sceneTabs.append(clone);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "scene-list-action";
        deleteButton.textContent = "Delete Scene";
        deleteButton.disabled = state.scenes.length <= 1;
        deleteButton.title = state.scenes.length <= 1 ? "Keep at least one scene." : "";
        deleteButton.addEventListener("click", deleteCurrentScene);
        el.sceneTabs.append(deleteButton);
      }

      function hasContent(scene) {
        if (!scene) return false;
        const hasRhythm = scene.rhythm && scene.rhythm.some(Boolean);
        const hasHarmony = scene.harmony && scene.harmony.some(Boolean);
        const hasBass = scene.bass && scene.bass.some(Boolean);
        const hasDrums = scene.drums && TRACKS.some((track) => scene.drums[track.key] && scene.drums[track.key].some(v => v > 0));
        return hasRhythm || hasHarmony || hasBass || hasDrums;
      }

      function selectScene(index, startIfStopped = false) {
        const scene = state.scenes[index];
        if (!scene) return;
        if (state.isPlaying && index !== state.currentScene) {
          state.pendingScene = index;
          renderScenes();
        } else if (index !== state.currentScene) {
          state.currentScene = index;
          state.pendingScene = null;
          releaseHarmony(audioContext?.currentTime || 0);
          savePreset();
          renderAll();
        }
        if (startIfStopped && !state.isPlaying) startPlayback();
      }

      function nextContentSceneIndex(fromIndex) {
        for (let offset = 1; offset < state.scenes.length; offset += 1) {
          const index = (fromIndex + offset) % state.scenes.length;
          if (hasContent(state.scenes[index])) return index;
        }
        return fromIndex;
      }

      function shouldLoopActiveScene() {
        return state.uiMode === "edit" || state.loopActiveScene;
      }

      function advanceSceneSequence(time) {
        if (shouldLoopActiveScene() && state.pendingScene === null) return;
        const target = state.pendingScene !== null
          ? state.pendingScene
          : nextContentSceneIndex(state.currentScene);
        state.pendingScene = null;
        if (target === state.currentScene) return;
        state.currentScene = target;
        releaseHarmony(time);
        harmonyWasActive = false;
        savePreset();
        renderAll();
      }

      function cloneCurrentScene() {
        const target = state.currentScene + 1;
        state.scenes.splice(target, 0, cloneSceneData(currentScene(), `${currentScene().name} copy`));
        state.currentScene = target;
        reindexSceneNames();
        savePreset();
        renderAll();
      }

      function addScene() {
        const target = state.currentScene + 1;
        state.scenes.splice(target, 0, createBlankScene(target));
        state.currentScene = target;
        reindexSceneNames();
        savePreset();
        renderAll();
      }

      function cloneSceneData(source, name = source.name) {
        return {
          name,
          rhythm: [...source.rhythm],
          harmony: [...source.harmony],
          chordPoolText: {
            rhythm: [...(source.chordPoolText?.rhythm || chordPoolTextState(source.rhythm, null, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS))],
            harmony: [...(source.chordPoolText?.harmony || chordPoolTextState(source.harmony, null, CHORD_EDITOR_PARTS, formatChordPoolPart, CHORD_EDITOR_PART_STEPS))],
          },
          chordPatternText: {
            rhythm: [...(source.chordPatternText?.rhythm || chordPoolTextState(source.rhythm, null, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS))],
            harmony: [...(source.chordPatternText?.harmony || chordPoolTextState(source.harmony, null, CHORD_EDITOR_PARTS, formatChordPatternPart, CHORD_EDITOR_PART_STEPS))],
          },
          bass: source.bass.map((note) => note ? { ...note } : null),
          bassText: {
            notes: typeof source.bassText?.notes === "string" ? source.bassText.notes : formatBassNotes(source.bass),
            pattern: typeof source.bassText?.pattern === "string" ? source.bassText.pattern : formatBassPattern(source.bass),
          },
          drums: Object.fromEntries(TRACKS.map((track) => [track.key, [...(source.drums?.[track.key] || [])]])),
          mutes: {
            rhythm: Boolean(source.mutes?.rhythm),
            harmony: Boolean(source.mutes?.harmony),
            bass: Boolean(source.mutes?.bass),
            drums: Object.fromEntries(TRACKS.map((track) => [
              track.key,
              Boolean(source.mutes?.drums?.[track.key]),
            ])),
          },
          trackVolumes: { ...source.trackVolumes },
        };
      }

      function cloneSceneToSlot(sourceIndex, targetIndex) {
        if (sourceIndex === targetIndex) return;
        const source = state.scenes[sourceIndex];
        const target = state.scenes[targetIndex];
        if (!source || !target) return;
        if (hasContent(target) && !confirmBlocking(`Replace ${target.name} with a clone of ${source.name}?`)) return;
        state.scenes[targetIndex] = cloneSceneData(source, source.name);
        if (!state.isPlaying) state.currentScene = targetIndex;
        savePreset();
        renderAll();
      }

      function reindexSceneNames() {
        state.scenes.forEach((scene, index) => {
          if (/^Scene \d+$/.test(scene.name)) scene.name = `Scene ${index + 1}`;
        });
      }

      function remapMovedIndex(value, fromIndex, toIndex) {
        if (value === null || value === undefined) return value;
        if (value === fromIndex) return toIndex;
        if (fromIndex < toIndex && value > fromIndex && value <= toIndex) return value - 1;
        if (fromIndex > toIndex && value >= toIndex && value < fromIndex) return value + 1;
        return value;
      }

      function moveScene(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= state.scenes.length || fromIndex === toIndex) return;
        moveArrayItem(state.scenes, fromIndex, toIndex);
        state.currentScene = remapMovedIndex(state.currentScene, fromIndex, toIndex);
        state.pendingScene = remapMovedIndex(state.pendingScene, fromIndex, toIndex);
        reindexSceneNames();
        savePreset();
        renderAll();
      }

      function deleteCurrentScene() {
        if (state.scenes.length <= 1) return;
        const deletingScene = state.currentScene;
        const scene = state.scenes[deletingScene];
        if (!confirmBlocking(`Delete ${scene.name}? This removes the scene from the arrangement.`)) return;
        state.scenes.splice(deletingScene, 1);
        if (state.pendingScene === deletingScene) {
          state.pendingScene = null;
        } else if (state.pendingScene !== null && state.pendingScene > deletingScene) {
          state.pendingScene -= 1;
        }
        state.currentScene = Math.max(0, Math.min(deletingScene, state.scenes.length - 1));
        reindexSceneNames();
        releaseHarmony(audioContext?.currentTime || 0);
        savePreset();
        renderAll();
      }

      function moveArrayItem(items, fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const [item] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, item);
      }

      function moveChordStep(fromStep, toStep) {
        const scene = currentScene();
        moveArrayItem(scene.rhythm, fromStep, toStep);
        moveArrayItem(scene.harmony, fromStep, toStep);
        savePreset();
        renderAll();
      }

      function moveBassStepEvents(events, fromStep, toStep) {
        events.forEach((event) => {
          const step = bassEventStep(event);
          const subTick = event.tick % BASS_TICKS_PER_STEP;
          let nextStep = step;
          if (step === fromStep) nextStep = toStep;
          else if (fromStep < toStep && step > fromStep && step <= toStep) nextStep = step - 1;
          else if (fromStep > toStep && step >= toStep && step < fromStep) nextStep = step + 1;
          event.tick = nextStep * BASS_TICKS_PER_STEP + subTick;
        });
        sortAndTrimBassEvents(events);
      }

      function bindStepDrag(cell, dragData, onMove) {
        cell.draggable = true;
        cell.addEventListener("dragstart", (event) => {
          if (event.target.closest("input")) {
            event.preventDefault();
            return;
          }
          draggedStep = dragData;
          cell.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `${dragData.type}:${dragData.trackKey || "chords"}:${dragData.step}`);
        });
        cell.addEventListener("dragend", () => {
          draggedStep = null;
          document.querySelectorAll(".dragging, .drag-over").forEach((node) => node.classList.remove("dragging", "drag-over"));
        });
        cell.addEventListener("dragover", (event) => {
          if (!draggedStep || draggedStep.type !== dragData.type || draggedStep.trackKey !== dragData.trackKey) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          cell.classList.add("drag-over");
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("drag-over");
        });
        cell.addEventListener("drop", (event) => {
          event.preventDefault();
          cell.classList.remove("drag-over");
          if (!draggedStep || draggedStep.type !== dragData.type || draggedStep.trackKey !== dragData.trackKey) return;
          onMove(draggedStep.step, dragData.step);
          draggedStep = null;
          suppressNextStepClick = true;
          window.setTimeout(() => suppressNextStepClick = false, 0);
        });
      }

      function usedChordNames() {
        const names = new Set(Object.keys(state.chordCatalog));
        state.scenes.forEach((scene) => {
          [...scene.rhythm, ...scene.harmony].forEach((value) => {
            const key = chordName(value);
            if (key) names.add(key);
          });
        });
        return [...names].sort();
      }

      function openCatalog() {
        renderCatalogRows();
        if (typeof el.catalogDialog.showModal === "function") {
          el.catalogDialog.showModal();
        } else {
          el.catalogDialog.setAttribute("open", "");
        }
      }

      function closeCatalog() {
        el.catalogDialog.close();
      }

      function openSoundCatalog() {
        renderSoundCatalog();
        if (typeof el.soundDialog.showModal === "function") {
          el.soundDialog.showModal();
        } else {
          el.soundDialog.setAttribute("open", "");
        }
      }

      function closeSoundCatalog() {
        el.soundDialog.close();
      }

      function openMixer() {
        if (typeof el.mixerDialog.showModal === "function") {
          el.mixerDialog.showModal();
        } else {
          el.mixerDialog.setAttribute("open", "");
        }
        renderShell();
      }

      function closeMixer() {
        el.mixerDialog.close();
        renderShell();
      }

      function openBassEditor() {
        renderBassControls();
        if (typeof el.bassEditorDialog.showModal === "function") {
          el.bassEditorDialog.showModal();
        } else {
          el.bassEditorDialog.setAttribute("open", "");
        }
      }

      function closeBassEditor() {
        el.bassEditorDialog.close();
      }

      function openChordPresets() {
        state.chordPresetPanelOpen = true;
        renderChordPresetPanel();
        if (typeof el.chordPresetsDialog.showModal === "function") {
          el.chordPresetsDialog.showModal();
        } else {
          el.chordPresetsDialog.setAttribute("open", "");
        }
      }

      function closeChordPresets() {
        state.chordPresetPanelOpen = false;
        renderChordPresetPanel();
        el.chordPresetsDialog.close();
      }

      function openDrumPresets() {
        state.drumPresetPanelOpen = true;
        renderDrumPresetPanel();
        if (typeof el.drumPresetsDialog.showModal === "function") {
          el.drumPresetsDialog.showModal();
        } else {
          el.drumPresetsDialog.setAttribute("open", "");
        }
      }

      function closeDrumPresets() {
        state.drumPresetPanelOpen = false;
        renderDrumPresetPanel();
        el.drumPresetsDialog.close();
      }

      function openChordEditor() {
        renderChordEditor();
        if (typeof el.chordEditorDialog.showModal === "function") {
          el.chordEditorDialog.showModal();
        } else {
          el.chordEditorDialog.setAttribute("open", "");
        }
      }

      function closeChordEditor() {
        el.chordEditorDialog.close();
      }

      function renderCatalogRows(extraRows = []) {
        el.catalogRows.replaceChildren();
        const head = document.createElement("div");
        head.className = "catalog-table-head";
        head.innerHTML = "<span>Chord</span><span>Notes</span><span>Action</span>";
        el.catalogRows.append(head);
        [...usedChordNames(), ...extraRows].forEach((name) => addCatalogRow(name, state.chordCatalog[name] || ""));
      }

      function addCatalogRow(name = "", notes = "") {
        const row = document.createElement("div");
        row.className = "catalog-row";
        row.innerHTML = `
          <input data-catalog-name value="${escapeAttr(chordName(name))}" aria-label="Chord name" />
          <input data-catalog-notes value="${escapeAttr(notes)}" aria-label="Chord notes" />
          <button type="button">Remove</button>
        `;
        row.querySelector("[data-catalog-name]").addEventListener("blur", (event) => {
          event.target.value = chordName(event.target.value);
          updateCatalogValidity();
        });
        row.querySelectorAll("input").forEach((input) => {
          input.addEventListener("input", updateCatalogValidity);
        });
        row.querySelector("button").addEventListener("click", () => {
          row.remove();
          updateCatalogValidity();
        });
        el.catalogRows.append(row);
        updateCatalogValidity();
      }

      function saveCatalog() {
        const nextCatalog = {};
        el.catalogRows.querySelectorAll(".catalog-row").forEach((row) => {
          const rawName = row.querySelector("[data-catalog-name]").value;
          if (isInvalidCatalogName(rawName)) return;
          const name = chordName(rawName);
          if (row.querySelector("[data-catalog-name]").dataset.duplicate === "true") return;
          const notes = row.querySelector("[data-catalog-notes]").value.trim().toLowerCase();
          if (!name || !parseNoteList(notes)) return;
          nextCatalog[name] = notes;
        });
        state.chordCatalog = nextCatalog;
        savePreset();
        renderChordGrid();
        closeCatalog();
      }

      function saveCurrentUserChordPreset(name) {
        const normalizedName = name.trim();
        if (!normalizedName) {
          return;
        }
        const existingIndex = state.userChordPresets.findIndex((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase());
        const existingPreset = existingIndex >= 0 ? state.userChordPresets[existingIndex] : null;
        const pattern = currentChordPattern();
        const now = new Date().toISOString();
        const preset = normalizeUserChordPreset({
          id: existingPreset?.id || `${normalizedName}-${Date.now()}`,
          name: normalizedName,
          createdAt: existingPreset?.createdAt || now,
          updatedAt: now,
          rhythm: pattern.rhythm,
          harmony: pattern.harmony,
          chordCatalog: pattern.chordCatalog,
        });
        if (!preset) return;
        if (existingIndex >= 0) {
          state.userChordPresets.splice(existingIndex, 1, preset);
        } else {
          state.userChordPresets.push(preset);
        }
        state.activeChordPreset = { type: "user", preset: preset.id };
        state.userChordPresetExport = "";
        saveUserChordPresets();
        savePreset();
        renderAll();
      }

      function loadUserChordPreset(id) {
        const preset = state.userChordPresets.find((entry) => entry.id === id);
        if (!preset) return;
        const scene = currentScene();
        scene.rhythm = fixedLengthArray(preset.rhythm, "", CHORD_STEPS).map((value) => String(value || "").trim());
        scene.harmony = fixedLengthArray(preset.harmony, "", CHORD_STEPS).map((value) => String(value || "").trim());
        state.chordCatalog = { ...state.chordCatalog, ...preset.chordCatalog };
        state.activeChordPreset = { type: "user", preset: preset.id };
        savePreset();
        renderAll();
      }

      function deleteUserChordPreset(id) {
        const index = state.userChordPresets.findIndex((preset) => preset.id === id);
        if (index < 0) return;
        state.userChordPresets.splice(index, 1);
        if (state.activeChordPreset?.type === "user" && state.activeChordPreset.preset === id) {
          state.activeChordPreset = null;
        }
        state.userChordPresetExport = "";
        saveUserChordPresets();
        savePreset();
        renderAll();
      }

      function renderChordPresetPanel() {
        el.chordPresetPanel.replaceChildren();
        el.chordPresetsToggle.classList.toggle("active", state.chordPresetPanelOpen);
        if (!state.chordPresetPanelOpen) return;

        const wrapper = document.createElement("div");
        wrapper.className = "user-preset-tools";

        const title = document.createElement("h3");
        title.textContent = "My Progressions";

        const description = document.createElement("p");
        description.className = "preset-description";
        description.textContent = "Save the current Rhythm and Harmony grid separately from drums, then load it with any rhythm pattern later.";

        const actions = document.createElement("div");
        actions.className = "user-preset-actions";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Name this progression";
        nameInput.autocomplete = "off";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.textContent = "Save Current";
        saveButton.addEventListener("click", () => saveCurrentUserChordPreset(nameInput.value));
        nameInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") saveCurrentUserChordPreset(nameInput.value);
        });

        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.textContent = "Export JSON";
        exportButton.addEventListener("click", () => {
          state.userChordPresetExport = JSON.stringify(userChordPresetExportPayload(), null, 2);
          renderChordPresetPanel();
        });

        actions.append(nameInput, saveButton, exportButton);

        const list = document.createElement("div");
        list.className = "user-preset-list";
        if (!state.userChordPresets.length) {
          const emptyState = document.createElement("span");
          emptyState.className = "hint";
          emptyState.textContent = "Save hand-built progressions here before promoting the best ones into built-in presets.";
          list.append(emptyState);
        } else {
          state.userChordPresets.forEach((preset) => {
            const loadButton = document.createElement("button");
            loadButton.type = "button";
            loadButton.textContent = preset.name;
            loadButton.classList.toggle("active", state.activeChordPreset?.type === "user" && state.activeChordPreset.preset === preset.id);
            loadButton.addEventListener("click", () => loadUserChordPreset(preset.id));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.setAttribute("aria-label", `Delete ${preset.name}`);
            deleteButton.addEventListener("click", () => deleteUserChordPreset(preset.id));

            list.append(loadButton, deleteButton);
          });
        }

        wrapper.append(title, description, actions, list);

        if (state.userChordPresetExport) {
          const exportText = document.createElement("textarea");
          exportText.className = "user-preset-export";
          exportText.readOnly = true;
          exportText.value = state.userChordPresetExport;
          wrapper.append(exportText);
        }

        el.chordPresetPanel.append(wrapper);
      }

      function updateCatalogRowValidity(row) {
        const nameInput = row.querySelector("[data-catalog-name]");
        const notesInput = row.querySelector("[data-catalog-notes]");
        const invalidName = isInvalidCatalogName(nameInput.value);
        const duplicateName = nameInput.dataset.duplicate === "true";
        const invalidNotes = Boolean(notesInput.value.trim()) && !parseNoteList(notesInput.value);
        nameInput.classList.toggle("invalid", invalidName || duplicateName);
        nameInput.toggleAttribute("aria-invalid", invalidName || duplicateName);
        notesInput.classList.toggle("invalid", invalidNotes);
        notesInput.toggleAttribute("aria-invalid", invalidNotes);
        nameInput.title = duplicateName
          ? "Duplicate chord name. Keep only one row for this chord."
          : (invalidName ? "Enter a chord name like C, Cm7b5, or Cmaj7." : "");
        notesInput.title = invalidNotes ? "Use comma-separated lowercase note names like g3,c4,eb4." : "";
      }

      function updateCatalogValidity() {
        const rows = [...el.catalogRows.querySelectorAll(".catalog-row")];
        const counts = new Map();
        rows.forEach((row) => {
          const name = chordName(row.querySelector("[data-catalog-name]").value);
          if (name && !isInvalidCatalogName(name)) counts.set(name, (counts.get(name) || 0) + 1);
        });
        rows.forEach((row) => {
          const nameInput = row.querySelector("[data-catalog-name]");
          const name = chordName(nameInput.value);
          nameInput.dataset.duplicate = name && counts.get(name) > 1 ? "true" : "false";
          updateCatalogRowValidity(row);
        });
      }

      function renderChordGrid() {
        el.chordGrid.replaceChildren();
        const scene = currentScene();
        el.rhythmMute.checked = Boolean(scene.mutes?.rhythm);
        el.harmonyMute.checked = Boolean(scene.mutes?.harmony);
        for (let partIndex = 0; partIndex < CHORD_EDITOR_PARTS; partIndex += 1) {
          const shell = document.createElement("section");
          shell.className = "chord-grid-part-shell";
          shell.dataset.chordEditorPart = String(partIndex);

          const row = document.createElement("div");
          row.className = "step-grid chord-grid-row";
          const stepOffset = partIndex * CHORD_EDITOR_PART_STEPS;
          for (let localStep = 0; localStep < CHORD_EDITOR_PART_STEPS; localStep += 1) {
            const step = stepOffset + localStep;
            const cell = document.createElement("div");
            cell.className = "chord-cell";
            cell.classList.toggle("beat", step % 4 === 0);
            cell.classList.toggle("playing", step === state.playhead);
            cell.dataset.step = String(step);
            cell.innerHTML = `
              <span class="step-number">${step + 1}</span>
              <label class="layer-row rhythm ${scene.mutes?.rhythm ? "muted" : ""}">
                <span class="chord-display ${scene.rhythm[step] ? "" : "empty"}">${escapeAttr(scene.rhythm[step] || "")}</span>
                <input class="chord-input ${scene.rhythm[step] && !parseChord(scene.rhythm[step]) ? "invalid" : ""}" data-layer="rhythm" aria-label="Rhythm chord step ${step + 1}" value="${escapeAttr(scene.rhythm[step])}" />
              </label>
              <label class="layer-row harmony ${scene.mutes?.harmony ? "muted" : ""}">
                <span class="chord-display ${scene.harmony[step] ? "" : "empty"}">${escapeAttr(scene.harmony[step] || "")}</span>
                <input class="chord-input ${scene.harmony[step] && !parseChord(scene.harmony[step]) ? "invalid" : ""}" data-layer="harmony" aria-label="Harmony chord step ${step + 1}" value="${escapeAttr(scene.harmony[step])}" />
              </label>
            `;
            cell.querySelectorAll(".chord-input").forEach((input) => bindChordInput(input, step));
            bindStepDrag(cell, { type: "chords", trackKey: "", step }, moveChordStep);
            row.append(cell);
          }

          shell.append(row, buildInlineChordEditorPart(scene, partIndex));
          el.chordGrid.append(shell);
        }
        el.chordGrid.querySelectorAll("[data-chord-layer]").forEach((layerEl) => {
          updateChordEditorLayerValidity(layerEl);
        });
      }

      function buildInlineChordEditorPart(scene, partIndex) {
        const wrapper = document.createElement("div");
        wrapper.className = "bass-editor chord-inline-part-editor";
        wrapper.innerHTML = CHORD_EDITOR_LAYERS.map((layer) => `
          <section data-chord-layer="${layer.key}" class="${scene.mutes?.[layer.key] ? "muted" : ""}">
            <div class="bass-editor-part-head">
              <strong>${layer.label}</strong>
              <span class="bass-editor-stats"></span>
            </div>
            <label class="chord-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("notes")}</span><span class="sr-only">Chords</span>
              <span class="bass-text-overlay-wrap">
                <span class="chord-pool-preview bass-text-preview" aria-hidden="true"></span>
                  <input class="chord-pool-input" value="${escapeAttr(scene.chordPoolText?.[layer.key]?.[partIndex] || formatChordPoolPart(scene[layer.key], partIndex))}" spellcheck="false" placeholder="Dm G C Am" />
              </span>
            </label>
            <label class="chord-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("pattern")}</span><span class="sr-only">Pattern</span>
              <span class="bass-text-overlay-wrap">
                <span class="chord-pattern-preview bass-text-preview" aria-hidden="true"></span>
                <input class="chord-pattern-input" value="${escapeAttr(scene.chordPatternText?.[layer.key]?.[partIndex] || formatChordPatternPart(scene[layer.key], partIndex))}" spellcheck="false" placeholder="x--- ---- x--- ----" />
              </span>
            </label>
          </section>
        `).join("");
        wrapper.querySelectorAll("[data-chord-layer]").forEach((layerEl) => {
          const stepOffset = partIndex * CHORD_EDITOR_PART_STEPS;
          const poolInput = layerEl.querySelector(".chord-pool-input");
          const poolPreview = layerEl.querySelector(".chord-pool-preview");
          const patternInput = layerEl.querySelector(".chord-pattern-input");
          const patternPreview = layerEl.querySelector(".chord-pattern-preview");
          const syncPreviewScroll = () => { poolPreview.scrollLeft = poolInput.scrollLeft; };
          const updateSlotsFromInputs = () => {
            const currentSceneRef = currentScene();
            const layer = layerEl.dataset.chordLayer;
            const pattern = parseChordPattern(patternInput.value, CHORD_EDITOR_PART_STEPS);
            const chords = parseChordPool(poolInput.value);
            setChordPoolText(currentSceneRef, layer, partIndex, poolInput.value);
            setChordPatternText(currentSceneRef, layer, partIndex, patternInput.value);
            if (pattern && chords && chords.length === chordPatternStats(pattern).pulses) {
              const slots = chordPatternToSlots(poolInput.value, patternInput.value, CHORD_EDITOR_PART_STEPS);
              slots.forEach((value, index) => {
                currentSceneRef[layer][stepOffset + index] = value;
              });
            }
            savePreset();
          };
          const syncEditor = () => {
            updateSlotsFromInputs();
            renderChordPoolPreview(poolPreview, poolInput.value, patternInput.value, stepOffset);
            refreshChordPattern();
            updateChordEditorLayerValidity(layerEl);
            syncPreviewScroll();
          };
          const { refresh: refreshChordPattern } = bindPatternInput(patternInput, patternPreview, {
            render: (preview, value) => renderChordPatternPreview(preview, value, stepOffset),
            parse: (value) => parseChordPattern(value, CHORD_EDITOR_PART_STEPS),
            format: chordPatternSymbolGroups,
            cycle: (s) => s === "_" ? "_" : s === "-" ? "x" : s === "x" ? "X" : "-",
            onToggle: () => { syncEditor(); },
          });
          poolInput.addEventListener("input", syncEditor);
          poolInput.addEventListener("scroll", syncPreviewScroll);
          poolInput.addEventListener("select", syncPreviewScroll);
          poolInput.addEventListener("blur", () => {
            poolInput.value = normalizeChordPoolText(poolInput.value);
            syncEditor();
          });
          patternInput.addEventListener("input", syncEditor);
          updateChordEditorLayerValidity(layerEl);
          renderChordPoolPreview(poolPreview, poolInput.value, patternInput.value, stepOffset);
          refreshChordPattern();
        });
        return wrapper;
      }

      function bindChordInput(input, step) {
        const scene = currentScene();
        const layer = input.dataset.layer;
        let committedValue = scene[layer][step];
        const partIndex = Math.floor(step / CHORD_EDITOR_PART_STEPS);
        updateChordInputValidity(input);
        input.addEventListener("input", () => {
          scene[layer][step] = input.value.trim();
          setChordPoolText(scene, layer, partIndex, formatChordPoolPart(scene[layer], partIndex));
          savePreset();
          updateChordInputValidity(input);
          syncChordDisplay(input);
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") input.blur();
          if (event.key === "Escape") {
            input.value = committedValue;
            scene[layer][step] = committedValue;
            setChordPoolText(scene, layer, partIndex, formatChordPoolPart(scene[layer], partIndex));
            savePreset();
            updateChordInputValidity(input);
            syncChordDisplay(input);
            input.blur();
          }
        });
        input.addEventListener("blur", () => {
          const rawValue = input.value.trim();
          const [chordPart, voicingPart] = rawValue.split("=").map((part) => part.trim());
          const value = voicingPart === undefined
            ? chordName(chordPart)
            : `${chordName(chordPart)}=${voicingPart.toLowerCase()}`;
          const parsed = parseChord(value);
          committedValue = value && parsed ? parsed.label : value;
          scene[layer][step] = committedValue;
          setChordPoolText(scene, layer, partIndex, formatChordPoolPart(scene[layer], partIndex));
          input.value = committedValue;
          savePreset();
          updateChordInputValidity(input);
          syncChordDisplay(input);
        });
      }

      function updateChordInputValidity(input) {
        const invalid = Boolean(input.value.trim()) && !parseChord(input.value);
        input.classList.toggle("invalid", invalid);
        input.toggleAttribute("aria-invalid", invalid);
        input.title = invalid ? "This entry is editable but will not play until it is a supported chord or explicit voicing." : "";
      }

      function syncChordDisplay(input) {
        const display = input.closest(".layer-row")?.querySelector(".chord-display");
        if (!display) return;
        const value = input.value.trim();
        display.textContent = value;
        display.classList.toggle("empty", !value);
        display.classList.toggle("invalid", Boolean(value) && !parseChord(value));
      }

      function renderBassRoll() {
        const roll = document.querySelector("[data-bassline-roll]");
        if (!roll) return;
        const scene = currentScene();
        const events = normalizeBassEvents(scene.bass);
        const midiValues = events.map((event) => event.midi);
        const minMidi = midiValues.length ? Math.min(...midiValues) : bassMidiForOffset(0);
        const maxMidi = midiValues.length ? Math.max(...midiValues) : bassMidiForOffset(12);
        const midiRange = Math.max(1, maxMidi - minMidi);
        roll.replaceChildren();
        events.forEach((event) => {
          const note = document.createElement("span");
          note.className = "bassline-roll-note";
          note.style.left = `${(event.tick / BASS_TICKS) * 100}%`;
          note.style.width = `${Math.max(1.5, (event.length / BASS_TICKS) * 100)}%`;
          note.style.top = `${80 - ((event.midi - minMidi) / midiRange) * 68}%`;
          note.title = `${bassNoteLabel(event)} step ${bassEventStep(event) + 1}`;
          roll.append(note);
        });
        if (state.playhead >= 0) {
          const playhead = document.createElement("span");
          playhead.className = "bassline-roll-playhead";
          playhead.style.left = `${((state.playhead % STEPS) / STEPS) * 100}%`;
          roll.append(playhead);
        }
      }

      function renderDrumLaneRoll(roll, values, trackKey) {
        if (!roll) return;
        const pattern = drumLengthArray(values).map(normalizeDrumValue);
        roll.replaceChildren();
        pattern.forEach((value, step) => {
          if (value <= 0) return;
          const pulse = document.createElement("span");
          pulse.className = "drum-roll-pulse";
          pulse.style.left = `${(step / DRUM_STEPS) * 100}%`;
          pulse.style.width = `${Math.max(1.2, 100 / DRUM_STEPS - 0.25)}%`;
          pulse.style.height = `${value >= 0.95 ? 58 : 36}%`;
          pulse.style.opacity = value >= 0.95 ? "1" : "0.8";
          pulse.dataset.track = trackKey;
          roll.append(pulse);
        });
        if (state.playhead >= 0) {
          const playhead = document.createElement("span");
          playhead.className = "drum-roll-playhead";
          playhead.style.left = `${((state.playhead % DRUM_STEPS) / DRUM_STEPS) * 100}%`;
          roll.append(playhead);
        }
      }

      function renderDrumLaneRolls() {
        document.querySelectorAll("[data-drum-roll]").forEach((roll) => {
          const trackKey = roll.getAttribute("data-drum-roll");
          const scene = currentScene();
          if (!trackKey || !scene?.drums?.[trackKey]) return;
          renderDrumLaneRoll(roll, scene.drums[trackKey], trackKey);
        });
      }

      function renderBassEditor() {
        renderBassControls();
      }

      function bassActiveNoteIndex(rawPattern, activeTick, maxTicks = BASS_TICKS) {
        const pattern = parseBassPattern(rawPattern, maxTicks) || [];
        const flat = pattern.flat(1);
        if (activeTick < 0) return -1;
        if (activeTick >= flat.length) return -1;
        let hasActiveNote = false;
        let noteIndex = -1;
        for (let tick = 0; tick <= activeTick && tick < flat.length; tick += 1) {
          const symbol = flat[tick];
          if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveNote)) {
            noteIndex += 1;
            hasActiveNote = true;
          } else if (symbol !== "_") {
            hasActiveNote = false;
          }
        }
        return hasActiveNote ? noteIndex : -1;
      }

      function renderBassNotesPreview(preview, rawNotes, rawPattern = formatBassPattern(currentScene().bass), tickOffset = 0, maxTicks = BASS_TICKS) {
        if (!preview) return;
        const pattern = parseBassPattern(rawPattern, maxTicks);
        const expectedNotes = pattern ? bassPatternStats(pattern).pulses : 0;
        const bassPlayhead = state.playhead >= 0 ? state.playhead % STEPS : state.playhead;
        const activeNoteIndex = bassActiveNoteIndex(rawPattern, bassPlayhead * BASS_TICKS_PER_STEP - tickOffset, maxTicks);
        const needsRebuild = preview.dataset.notes !== rawNotes || preview.dataset.pattern !== rawPattern;
        if (needsRebuild) {
          preview.replaceChildren();
          preview.dataset.notes = rawNotes;
          preview.dataset.pattern = rawPattern;
          let noteIndex = 0;
          const parts = splitWhitespacePreservingParts(rawNotes);
          parts.forEach((part) => {
            if (/^\s+$/.test(part)) {
              preview.append(document.createTextNode(part));
              return;
            }
            const cell = document.createElement("span");
            cell.textContent = part;
            if (!parseNoteName(part)) {
              cell.classList.add("invalid");
            } else if (noteIndex >= expectedNotes) {
              cell.classList.add("extra");
            } else {
              cell.classList.add("on");
            }
            cell.dataset.noteIndex = noteIndex;
            preview.append(cell);
            noteIndex += 1;
          });
        }
        preview.querySelectorAll("[data-note-index]").forEach((cell) => {
          const noteIndex = Number(cell.dataset.noteIndex);
          cell.classList.toggle("playing", noteIndex === activeNoteIndex);
        });
      }

      function renderBassEditorPreview(preview, rawPattern = formatBassPattern(currentScene().bass), tickOffset = 0, maxTicks = BASS_TICKS) {
        if (!preview) return;
        const raw = String(rawPattern || "");
        const bassPlayhead = state.playhead >= 0 ? state.playhead % STEPS : state.playhead;
        const activeTick = bassPlayhead * BASS_TICKS_PER_STEP - tickOffset;
        const needsRebuild = preview.dataset.pattern !== raw;
        if (needsRebuild) {
          preview.replaceChildren();
          preview.dataset.pattern = raw;
          let hasActiveNote = false;
          let tick = 0;
          const chars = [];
          for (let i = 0; i < raw.length; i += 1) {
            const ch = raw[i];
            if (ch === "[") {
              const end = raw.indexOf("]", i + 1);
              if (end < 0) break;
              chars.push({ substep: raw.slice(i + 1, end).split(""), start: i, end });
              i = end;
              continue;
            }
            if (/[\s|]/.test(ch)) {
              chars.push({ space: ch });
              continue;
            }
            chars.push({ char: ch });
          }
          chars.forEach((item) => {
            if (item.space) {
              preview.append(document.createTextNode(item.space));
              return;
            }
            if (item.substep) {
              const group = document.createElement("span");
              group.className = "substep-group";
              const openBracket = document.createElement("span");
              openBracket.textContent = "[";
              openBracket.className = "bracket";
              group.append(openBracket);
              item.substep.forEach((ch) => {
                const cell = document.createElement("span");
                cell.textContent = ch;
                const symbol = ch === "." || ch === "0" ? "-" : ch;
                if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveNote)) {
                  cell.classList.add(symbol === "X" ? "accent" : "on");
                  hasActiveNote = true;
                } else if (symbol === "_") {
                  cell.classList.add("sustain");
                } else if (symbol === "-") {
                  cell.classList.add("rest");
                  hasActiveNote = false;
                }
                cell.dataset.tick = tick;
                group.append(cell);
                tick += 1;
              });
              const closeBracket = document.createElement("span");
              closeBracket.textContent = "]";
              closeBracket.className = "bracket";
              group.append(closeBracket);
              preview.append(group);
              return;
            }
            const cell = document.createElement("span");
            cell.textContent = item.char;
            const symbol = item.char === "." || item.char === "0" ? "-" : item.char;
            if (symbol === "x" || symbol === "X" || (symbol === "_" && !hasActiveNote)) {
              cell.classList.add(symbol === "X" ? "accent" : "on");
              hasActiveNote = true;
            } else if (symbol === "_") {
              cell.classList.add("sustain");
            } else if (symbol === "-") {
              cell.classList.add("rest");
              hasActiveNote = false;
            }
            cell.dataset.tick = tick;
            preview.append(cell);
            tick += 1;
          });
        }
        preview.querySelectorAll("[data-tick]").forEach((cell) => {
          const tick = Number(cell.dataset.tick);
          const isPlaying = activeTick >= 0 && tick >= activeTick && tick < activeTick + BASS_TICKS_PER_STEP;
          cell.classList.toggle("playing", isPlaying);
          cell.ariaLabel = `Bass pattern tick ${tick + 1}${isPlaying ? " playing" : ""}`;
        });
      }

      function renderBassEditorPlayhead() {
        document.querySelectorAll("[data-bass-editor-part]").forEach((part) => {
          const notesInput = part.querySelector(".bass-notes-input");
          const notesPreview = part.querySelector(".bass-notes-preview");
          const patternInput = part.querySelector(".bass-pattern-input");
          const preview = part.querySelector(".bass-pattern-preview");
          const tickOffset = Number(notesInput?.dataset.tickOffset) || 0;
          const maxTicks = Number(notesInput?.dataset.maxTicks) || BASS_EDITOR_PART_TICKS;
          renderBassNotesPreview(notesPreview, notesInput?.value, patternInput?.value, tickOffset, maxTicks);
          renderBassEditorPreview(preview, patternInput?.value, tickOffset, maxTicks);
          if (notesPreview && notesInput) notesPreview.scrollLeft = notesInput.scrollLeft;
          if (preview && patternInput) preview.scrollLeft = patternInput.scrollLeft;
        });
      }

      function renderChordPoolPreview(preview, rawChords, rawPattern, stepOffset = 0, maxSteps = CHORD_EDITOR_PART_STEPS) {
        const activeStep = state.playhead >= 0 ? state.playhead - stepOffset : -1;
        renderChordPoolPreviewFn(preview, rawChords, rawPattern, activeStep, maxSteps);
      }

      function renderChordPatternPreview(preview, rawPattern, stepOffset = 0, maxSteps = CHORD_EDITOR_PART_STEPS) {
        const activeStep = state.playhead >= 0 ? state.playhead - stepOffset : -1;
        renderChordPatternPreviewFn(preview, rawPattern, activeStep, maxSteps);
      }

      function updateChordEditorLayerValidity(layerEl) {
        const poolInput = layerEl.querySelector(".chord-pool-input");
        const patternInput = layerEl.querySelector(".chord-pattern-input");
        const statsEl = layerEl.querySelector(".bass-editor-stats");
        const chords = parseChordPool(poolInput.value);
        const pattern = parseChordPattern(patternInput.value, CHORD_EDITOR_PART_STEPS);
        const stats = pattern ? chordPatternStats(pattern) : { pulses: 0, sustains: 0, rests: 0, steps: 0 };
        const invalidPool = chords === null || (pattern !== null && chords.length !== stats.pulses);
        poolInput.classList.toggle("invalid", invalidPool);
        poolInput.toggleAttribute("aria-invalid", invalidPool);
        patternInput.classList.toggle("invalid", pattern === null);
        patternInput.toggleAttribute("aria-invalid", pattern === null);
        poolInput.title = invalidPool
          ? `Enter exactly ${stats.pulses} chord${stats.pulses === 1 ? "" : "s"} for this pattern.`
          : "";
        patternInput.title = pattern === null
          ? `Use X, x, _, and - for up to ${CHORD_EDITOR_PART_STEPS} steps. Spaces, ., and 0 are allowed separators/rests.`
          : "";
        if (statsEl) {
          statsEl.textContent = `chords ${chords?.length ?? 0}/${stats.pulses} | pulses ${stats.pulses} | sustains ${stats.sustains} | rests ${stats.rests} | steps ${stats.steps}/${CHORD_EDITOR_PART_STEPS}`;
          statsEl.classList.toggle("invalid", invalidPool);
        }
        return {
          layer: layerEl.dataset.chordLayer,
          partIndex: Number(layerEl.closest("[data-chord-editor-part]")?.dataset.chordEditorPart) || 0,
          slots: invalidPool || pattern === null ? null : chordPatternToSlots(poolInput.value, patternInput.value, CHORD_EDITOR_PART_STEPS),
        };
      }

      function updateChordEditorFromParts(editor) {
        const layerEls = [...editor.querySelectorAll("[data-chord-layer]")];
        const results = layerEls.map(updateChordEditorLayerValidity);
        const scene = currentScene();
        CHORD_EDITOR_LAYERS.forEach((layer) => {
          const layerResults = results.filter((result) => result.layer === layer.key && result.slots);
          if (!layerResults.length) return;
          const values = Array(CHORD_STEPS).fill("");
          layerResults.forEach((result) => {
            const stepOffset = result.partIndex * CHORD_EDITOR_PART_STEPS;
            result.slots.forEach((value, index) => {
              values[stepOffset + index] = value;
            });
          });
          scene[layer.key] = values;
        });
        savePreset();
        renderChordGrid();
      }

      function renderChordEditor() {
        const editor = document.querySelector("#chord-editor-dialog [data-chord-editor]");
        if (!editor) return;
        editor.replaceChildren();
        const scene = currentScene();
        const fields = document.createElement("div");
        fields.className = "bass-editor-fields chord-inline-parts";
        fields.innerHTML = Array.from({ length: CHORD_EDITOR_PARTS }, (_, partIndex) => {
          const stepOffset = partIndex * CHORD_EDITOR_PART_STEPS;
          const layerHtml = CHORD_EDITOR_LAYERS.map((layer) => `
            <section data-chord-layer="${layer.key}" class="${scene.mutes?.[layer.key] ? "muted" : ""}">
              <div class="bass-editor-part-head">
                <strong>${layer.label}</strong>
                <span class="bass-editor-stats"></span>
              </div>
              <label class="chord-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("notes")}</span><span class="sr-only">Chords</span>
                <span class="bass-text-overlay-wrap">
                  <span class="chord-pool-preview bass-text-preview" aria-hidden="true"></span>
                <input class="chord-pool-input" value="${escapeAttr(scene.chordPoolText?.[layer.key]?.[partIndex] || formatChordPoolPart(scene[layer.key], partIndex))}" spellcheck="false" placeholder="Dm G C Am" />
                </span>
              </label>
              <label class="chord-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("pattern")}</span><span class="sr-only">Pattern</span>
                <span class="bass-text-overlay-wrap">
                  <span class="chord-pattern-preview bass-text-preview" aria-hidden="true"></span>
                <input class="chord-pattern-input" value="${escapeAttr(scene.chordPatternText?.[layer.key]?.[partIndex] || formatChordPatternPart(scene[layer.key], partIndex))}" spellcheck="false" placeholder="x--- ---- x--- ----" />
                </span>
              </label>
            </section>
          `).join("");
          return `
            <section class="bass-editor-part chord-inline-part-shell" data-chord-editor-part="${partIndex}">
              ${layerHtml}
            </section>
          `;
        }).join("");
        fields.querySelectorAll("[data-chord-layer]").forEach((layerEl) => {
          const partEl = layerEl.closest("[data-chord-editor-part]");
          const partIndex = Number(partEl?.dataset.chordEditorPart) || 0;
          const stepOffset = partIndex * CHORD_EDITOR_PART_STEPS;
          const poolInput = layerEl.querySelector(".chord-pool-input");
          const poolPreview = layerEl.querySelector(".chord-pool-preview");
          const patternInput = layerEl.querySelector(".chord-pattern-input");
          const patternPreview = layerEl.querySelector(".chord-pattern-preview");
          const syncPreviewScroll = () => { poolPreview.scrollLeft = poolInput.scrollLeft; };
          const updateSlotsFromInputs = () => {
            const currentSceneRef = currentScene();
            const layer = layerEl.dataset.chordLayer;
            const pattern = parseChordPattern(patternInput.value, CHORD_EDITOR_PART_STEPS);
            const chords = parseChordPool(poolInput.value);
            setChordPoolText(currentSceneRef, layer, partIndex, poolInput.value);
            setChordPatternText(currentSceneRef, layer, partIndex, patternInput.value);
            if (pattern && chords && chords.length === chordPatternStats(pattern).pulses) {
              const slots = chordPatternToSlots(poolInput.value, patternInput.value, CHORD_EDITOR_PART_STEPS);
              slots.forEach((value, index) => {
                currentSceneRef[layer][stepOffset + index] = value;
              });
            }
            savePreset();
          };
          const syncEditor = () => {
            updateSlotsFromInputs();
            renderChordPoolPreview(poolPreview, poolInput.value, patternInput.value, stepOffset);
            refreshChordPattern();
            updateChordEditorLayerValidity(layerEl);
            syncPreviewScroll();
          };
          const { refresh: refreshChordPattern } = bindPatternInput(patternInput, patternPreview, {
            render: (preview, value) => renderChordPatternPreview(preview, value, stepOffset),
            parse: (value) => parseChordPattern(value, CHORD_EDITOR_PART_STEPS),
            format: chordPatternSymbolGroups,
            cycle: (s) => s === "_" ? "_" : s === "-" ? "x" : s === "x" ? "X" : "-",
            onToggle: () => { syncEditor(); },
          });
          poolInput.addEventListener("input", syncEditor);
          poolInput.addEventListener("scroll", syncPreviewScroll);
          poolInput.addEventListener("select", syncPreviewScroll);
          poolInput.addEventListener("blur", () => {
            poolInput.value = normalizeChordPoolText(poolInput.value);
            syncEditor();
          });
          patternInput.addEventListener("input", syncEditor);
          updateChordEditorLayerValidity(layerEl);
          renderChordPoolPreview(poolPreview, poolInput.value, patternInput.value, stepOffset);
          refreshChordPattern();
        });
        editor.append(fields);
      }

      function renderChordEditorPlayhead() {
        document.querySelectorAll("[data-chord-layer]").forEach((layerEl) => {
          const partEl = layerEl.closest("[data-chord-editor-part]");
          const stepOffset = (Number(partEl?.dataset.chordEditorPart) || 0) * CHORD_EDITOR_PART_STEPS;
          const poolInput = layerEl.querySelector(".chord-pool-input");
          const poolPreview = layerEl.querySelector(".chord-pool-preview");
          const patternInput = layerEl.querySelector(".chord-pattern-input");
          const patternPreview = layerEl.querySelector(".chord-pattern-preview");
          renderChordPoolPreview(poolPreview, poolInput?.value, patternInput?.value, stepOffset);
          renderChordPatternPreview(patternPreview, patternInput?.value, stepOffset);
          if (poolPreview && poolInput) poolPreview.scrollLeft = poolInput.scrollLeft;
          if (patternPreview && patternInput) patternPreview.scrollLeft = patternInput.scrollLeft;
        });
      }

      function renderDrumGrid() {
        el.drumGrid.replaceChildren();
        const scene = currentScene();
        const beatLabels = document.createElement("div");
        beatLabels.className = "beat-label-row";
        beatLabels.innerHTML = `
          <span class="beat-label-spacer" aria-hidden="true"></span>
          <span class="beat-label-actions-spacer" aria-hidden="true"></span>
        `;
        const labelSteps = document.createElement("div");
        labelSteps.className = "step-grid";
        for (let step = 0; step < DRUM_STEPS; step += 1) {
          const label = document.createElement("span");
          const subdivision = step % 4;
          label.className = "beat-label";
          label.classList.toggle("downbeat", subdivision === 0);
          label.textContent = subdivision === 0 ? String((Math.floor(step / 4) % 4) + 1) : ["e", "+", "a"][subdivision - 1];
          labelSteps.append(label);
        }
        beatLabels.append(labelSteps);
        el.drumGrid.append(beatLabels);
        const bassRow = document.createElement("div");
        bassRow.className = "drum-row";
        bassRow.classList.toggle("muted", Boolean(scene.mutes?.bass));
        const bassHead = document.createElement("div");
        bassHead.className = "track-head";
        bassHead.innerHTML = `
          <strong>Bass</strong>
          <div class="track-surface">
            <div class="bassline-roll" data-bassline-roll aria-hidden="true"></div>
          </div>
          <div class="track-actions">
            <button type="button" class="icon-button compact-button ${state.bass.enabled ? "active" : ""}" data-bass-inline-toggle aria-label="Toggle bass keyboard" title="Bass keyboard">${uiIcon("power")}</button>
            <button type="button" class="icon-button compact-button record-button ${state.bass.recording ? "active" : ""}" data-bass-inline-record aria-label="Toggle bass recording" title="Record bass">${uiIcon("record")}</button>
            <button type="button" class="icon-button compact-button" data-open-bass-editor aria-label="Bass settings" title="Bass settings">${uiIcon("settings")}</button>
            <button type="button" class="icon-button compact-button" data-undo-bass aria-label="Undo bass" title="Undo bass" ${!bassUndoBuffer ? "disabled" : ""}>${uiIcon("undo")}</button>
            <button type="button" class="icon-button compact-button danger" data-clear-bassline aria-label="Clear bassline" title="Clear bassline">${uiIcon("clear")}</button>
            <button type="button" class="icon-button compact-button ${scene.mutes?.bass ? "active" : ""}" data-mute-bass aria-label="Mute bass" title="Mute bass">${uiIcon("mute")}</button>
          </div>
        `;
        const bassText = scene.bassText || bassTextState(scene.bass, null, formatBassNotes, formatBassPattern);
        const bassEditor = document.createElement("div");
        bassEditor.className = "bass-inline-editor";
        bassEditor.innerHTML = `
          <div class="bass-inline-head">
            <span class="bass-editor-stats"></span>
          </div>
          <section class="bass-editor-part bass-inline-part" data-bass-editor-part="0">
            <label class="bass-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("notes")}</span><span class="sr-only">Notes</span>
              <span class="bass-text-overlay-wrap">
                <span class="bass-notes-preview bass-text-preview" aria-hidden="true"></span>
                <input class="bass-notes-input" data-tick-offset="0" data-max-ticks="${BASS_TICKS}" value="${escapeAttr(bassText.notes)}" spellcheck="false" placeholder="c2 g2 bb2 a2" />
              </span>
            </label>
            <label class="bass-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("pattern")}</span><span class="sr-only">Pattern</span>
              <span class="bass-text-overlay-wrap">
                <span class="bass-pattern-preview bass-text-preview" aria-hidden="true"></span>
                <input class="bass-pattern-input" value="${escapeAttr(bassText.pattern)}" spellcheck="false" placeholder="x--- ---- x--- ----" />
              </span>
            </label>
          </section>
          <p class="bassline-help">Record mode overwrites the current fine pulse with the newest bass input. x starts a note, _ sustains, and - rests.</p>
        `;
        const bassToggleButton = bassHead.querySelector("[data-bass-inline-toggle]");
        const bassRecordButton = bassHead.querySelector("[data-bass-inline-record]");
        bassHead.querySelector("[data-undo-bass]").addEventListener("click", () => undoBassClear());
        bassHead.querySelector("[data-mute-bass]").addEventListener("click", () => {
          scene.mutes.bass = !scene.mutes?.bass;
          savePreset();
          applyVolumes();
          renderDrumGrid();
        });
        bassToggleButton.addEventListener("click", () => toggleBassKeyboard());
        bassRecordButton.addEventListener("click", () => toggleBassRecording());
        bassHead.querySelector("[data-open-bass-editor]").addEventListener("click", openBassEditor);
        bassHead.querySelector("[data-clear-bassline]").addEventListener("click", () => {
          if (!scene.bass.length) return;
          bassUndoBuffer = [...scene.bass];
          scene.bass = [];
          scene.bassText = bassTextState(scene.bass, null, formatBassNotes, formatBassPattern);
          savePreset();
          renderDrumGrid();
        });
        const inlinePart = bassEditor.querySelector("[data-bass-editor-part]");
        const notesInput = inlinePart.querySelector(".bass-notes-input");
        const notesPreview = inlinePart.querySelector(".bass-notes-preview");
        const patternInput = inlinePart.querySelector(".bass-pattern-input");
        const patternPreview = inlinePart.querySelector(".bass-pattern-preview");
        const stats = inlinePart.parentElement.querySelector(".bass-editor-stats");
        const syncBassPreviewScroll = () => {
          notesPreview.scrollLeft = notesInput.scrollLeft;
          patternPreview.scrollLeft = patternInput.scrollLeft;
        };
        const syncBassInlineEditor = () => {
          const maxTicks = Number(notesInput.dataset.maxTicks) || BASS_TICKS;
          const notes = parseBassNotes(notesInput.value);
          const pattern = parseBassPattern(patternInput.value, maxTicks);
          const patternStats = pattern ? bassPatternStats(pattern) : { pulses: 0, sustains: 0, rests: 0, ticks: 0 };
          const invalidNotes = notes === null || (pattern !== null && notes.length !== patternStats.pulses);
          scene.bassText = {
            notes: notesInput.value,
            pattern: patternInput.value,
          };
          notesInput.classList.toggle("invalid", invalidNotes);
          notesInput.toggleAttribute("aria-invalid", invalidNotes);
          patternInput.classList.toggle("invalid", pattern === null);
          patternInput.toggleAttribute("aria-invalid", pattern === null);
          notesInput.title = invalidNotes
            ? `Enter exactly ${patternStats.pulses} note${patternStats.pulses === 1 ? "" : "s"} for this pattern. Each x starts a note; _ starts one only after silence.`
            : "";
          patternInput.title = pattern === null
            ? `Use X, x, _, and - for up to ${maxTicks} fine pulses.`
            : "";
          if (stats) {
            stats.textContent = `notes ${notes?.length ?? 0}/${patternStats.pulses} | pulses ${patternStats.pulses} | ticks ${patternStats.ticks}/${maxTicks}`;
            stats.classList.toggle("invalid", invalidNotes);
          }
          if (notes && pattern && notes.length === patternStats.pulses) {
            const events = bassPatternToEvents(notesInput.value, patternInput.value, 0, maxTicks);
            if (events) {
              currentScene().bass = events;
              savePreset();
            }
          } else if (!notesInput.value.trim() || !patternInput.value.trim()) {
            currentScene().bass = [];
            savePreset();
          }
          renderBassNotesPreview(notesPreview, notesInput.value, patternInput.value, 0, BASS_TICKS);
          renderBassEditorPreview(patternPreview, patternInput.value, 0, BASS_TICKS);
          syncBassPreviewScroll();
        };
        notesInput.addEventListener("input", syncBassInlineEditor);
        notesInput.addEventListener("scroll", syncBassPreviewScroll);
        notesInput.addEventListener("select", syncBassPreviewScroll);
        notesInput.addEventListener("blur", () => {
          notesInput.value = normalizeBassNotesText(notesInput.value);
          syncBassInlineEditor();
        });
        patternInput.addEventListener("input", syncBassInlineEditor);
        patternInput.addEventListener("scroll", syncBassPreviewScroll);
        patternInput.addEventListener("select", syncBassPreviewScroll);
        updateBassEditorPartValidity(notesInput, patternInput, stats, BASS_TICKS);
        renderBassNotesPreview(notesPreview, notesInput.value, patternInput.value, 0, BASS_TICKS);
        renderBassEditorPreview(patternPreview, patternInput.value, 0, BASS_TICKS);
        bassRow.append(bassHead, bassEditor);
        el.drumGrid.append(bassRow);
        renderBassRoll();
        TRACKS.forEach((track) => {
          const row = document.createElement("div");
          row.className = "drum-row";
          row.classList.toggle("muted", Boolean(scene.mutes?.drums?.[track.key]));

          const head = document.createElement("div");
          head.className = "track-head";
          head.innerHTML = `
            <strong>${track.label}</strong>
            <div class="track-surface">
              <div class="drum-roll" data-drum-roll="${track.key}" aria-hidden="true"></div>
            </div>
          <div class="track-actions">
              <button type="button" class="icon-button compact-button" data-undo-drum="${track.key}" title="Undo ${track.label}" aria-label="Undo ${track.label}" ${!drumUndoBuffer[track.key] ? "disabled" : ""}>${uiIcon("undo")}</button>
              <button type="button" class="icon-button compact-button danger" data-clear-drum="${track.key}" title="Clear ${track.label}" aria-label="Clear ${track.label}">${uiIcon("clear")}</button>
              <button type="button" class="icon-button compact-button ${scene.mutes?.drums?.[track.key] ? "active" : ""}" data-mute-drum="${track.key}" title="Mute ${track.label}" aria-label="Mute ${track.label}">${uiIcon("mute")}</button>
            </div>
          `;
          const editor = document.createElement("div");
          editor.className = "drum-inline-editor";
          const drumPatternText = scene.drumPatternText?.[track.key] || {
            kick: "[xx]-- ---- [xx]-- ----",
            snare: "---- [xx]-- ---- [xx]--",
            hihat: "[x-x]--- [x-x]--- [x-x]--- [x-x]---",
            openhat: "---- ---- ---- [xx]--",
          }[track.key] || formatDrumPattern(scene.drums[track.key]);
          editor.innerHTML = `
            <label class="drum-inline-row"><span class="inline-label-icon" aria-hidden="true">${uiIcon("pattern")}</span><span class="sr-only">${track.label} pattern</span>
              <span class="bass-text-overlay-wrap drum-pattern-overlay-wrap">
                <span class="drum-pattern-preview bass-text-preview" aria-hidden="true"></span>
                <input class="drum-pattern-input" value="${escapeAttr(drumPatternText)}" aria-label="${track.label} text pattern" spellcheck="false" />
              </span>
            </label>
          `;
          const patternInput = editor.querySelector(".drum-pattern-input");
          const patternPreview = editor.querySelector(".drum-pattern-preview");
          const patternWrap = editor.querySelector(".drum-pattern-overlay-wrap");
          const updatePatternValidity = (parsed) => {
            patternInput.classList.toggle("invalid", !parsed);
            patternInput.toggleAttribute("aria-invalid", !parsed);
            patternWrap.classList.toggle("invalid", !parsed);
            patternInput.title = parsed ? "" : "Use X, x, _, and - in a 1, 2, 4, 8, 16, or 32 step drum pattern.";
          };
          const { refresh: updatePatternPreview } = bindPatternInput(patternInput, patternPreview, {
            render: renderDrumPatternPreview,
            parse: parseDrumPattern,
            format: formatDrumPattern,
            cycle: (v) => v === 0 ? 0.72 : v < 1 ? 1 : 0,
            onToggle: (parsed) => {
              scene.drums[track.key] = parsed;
              updatePatternValidity(parsed);
              savePreset();
              renderDrumGrid();
            },
          });
          patternInput.addEventListener("input", () => {
            const parsed = parseDrumPattern(patternInput.value);
            updatePatternValidity(parsed);
            updatePatternPreview();
            if (!parsed) return;
            scene.drums[track.key] = parsed;
            if (!scene.drumPatternText) scene.drumPatternText = {};
            scene.drumPatternText[track.key] = patternInput.value;
            savePreset();
          });
          patternInput.addEventListener("blur", () => {
            const parsed = parseDrumPattern(patternInput.value);
            if (!parsed) {
              patternInput.value = scene.drumPatternText?.[track.key] || formatDrumPattern(scene.drums[track.key]);
              updatePatternValidity(parseDrumPattern(patternInput.value));
            }
            updatePatternPreview();
          });
          updatePatternPreview();
          head.querySelector("[data-undo-drum]").addEventListener("click", () => {
            undoDrumClear(track.key);
          });
          head.querySelector("[data-clear-drum]").addEventListener("click", () => {
            const pattern = scene.drums[track.key];
            if (!pattern || pattern.every(v => !v)) return;
            drumUndoBuffer[track.key] = [...pattern];
            scene.drums[track.key] = Array(pattern.length).fill(null);
            savePreset();
            renderDrumGrid();
          });
          head.querySelector("[data-mute-drum]").addEventListener("click", () => {
            scene.mutes.drums[track.key] = !scene.mutes?.drums?.[track.key];
            savePreset();
            applyVolumes();
            renderDrumGrid();
          });

          row.append(head, editor);
          el.drumGrid.append(row);
        });
        renderDrumLaneRolls();
      }

      function loadDrumPreset(genreKey, presetName) {
        if (state.activeDrumPreset?.genre === genreKey && state.activeDrumPreset?.preset === presetName) return;
        const preset = DRUM_PRESETS[genreKey]?.patterns[presetName];
        if (!preset) return;
        const scene = currentScene();
        TRACKS.forEach((track) => {
          scene.drums[track.key] = drumLengthArray(preset[track.key]).map(normalizeDrumValue);
        });
        state.activeDrumPreset = { genre: genreKey, preset: presetName };
        state.drumPresetGenre = genreKey;
        setBpm(preset.bpm);
        savePreset();
        renderAll();
      }

      function saveCurrentUserDrumPreset(name) {
        const normalizedName = name.trim();
        if (!normalizedName) {
          return;
        }
        const existingIndex = state.userDrumPresets.findIndex((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase());
        const existingPreset = existingIndex >= 0 ? state.userDrumPresets[existingIndex] : null;
        const now = new Date().toISOString();
        const preset = normalizeUserDrumPreset({
          id: existingPreset?.id || `${normalizedName}-${Date.now()}`,
          name: normalizedName,
          bpm: state.bpm,
          createdAt: existingPreset?.createdAt || now,
          updatedAt: now,
          drums: currentDrumPattern(),
        });
        if (!preset) return;
        if (existingIndex >= 0) {
          state.userDrumPresets.splice(existingIndex, 1, preset);
        } else {
          state.userDrumPresets.push(preset);
        }
        state.activeDrumPreset = { genre: "user", preset: preset.id };
        state.userDrumPresetExport = "";
        saveUserDrumPresets();
        savePreset();
        renderAll();
      }

      function loadUserDrumPreset(id) {
        const preset = state.userDrumPresets.find((entry) => entry.id === id);
        if (!preset) return;
        const scene = currentScene();
        TRACKS.forEach((track) => {
          scene.drums[track.key] = drumLengthArray(preset.drums[track.key]).map(normalizeDrumValue);
        });
        state.activeDrumPreset = { genre: "user", preset: preset.id };
        setBpm(preset.bpm);
        savePreset();
        renderAll();
      }

      function deleteUserDrumPreset(id) {
        const index = state.userDrumPresets.findIndex((preset) => preset.id === id);
        if (index < 0) return;
        state.userDrumPresets.splice(index, 1);
        if (state.activeDrumPreset?.genre === "user" && state.activeDrumPreset.preset === id) {
          state.activeDrumPreset = null;
        }
        state.userDrumPresetExport = "";
        saveUserDrumPresets();
        savePreset();
        renderAll();
      }

      function renderUserDrumPresetTools() {
        const wrapper = document.createElement("div");
        wrapper.className = "user-preset-tools";

        const title = document.createElement("h3");
        title.textContent = "My Rhythms";

        const actions = document.createElement("div");
        actions.className = "user-preset-actions";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Name this rhythm";
        nameInput.autocomplete = "off";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.textContent = "Save Current";
        saveButton.addEventListener("click", () => saveCurrentUserDrumPreset(nameInput.value));
        nameInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") saveCurrentUserDrumPreset(nameInput.value);
        });

        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.textContent = "Export JSON";
        exportButton.addEventListener("click", () => {
          state.userDrumPresetExport = JSON.stringify(userDrumPresetExportPayload(), null, 2);
          renderDrumPresetPanel();
        });

        actions.append(nameInput, saveButton, exportButton);

        const list = document.createElement("div");
        list.className = "user-preset-list";
        if (!state.userDrumPresets.length) {
          const emptyState = document.createElement("span");
          emptyState.className = "hint";
          emptyState.textContent = "Save hand-built drum grids here before promoting the best ones into built-in presets.";
          list.append(emptyState);
        } else {
          state.userDrumPresets.forEach((preset) => {
            const loadButton = document.createElement("button");
            loadButton.type = "button";
            loadButton.textContent = preset.name;
            loadButton.classList.toggle("active", state.activeDrumPreset?.genre === "user" && state.activeDrumPreset.preset === preset.id);
            loadButton.addEventListener("click", () => loadUserDrumPreset(preset.id));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.setAttribute("aria-label", `Delete ${preset.name}`);
            deleteButton.addEventListener("click", () => deleteUserDrumPreset(preset.id));

            list.append(loadButton, deleteButton);
          });
        }

        wrapper.append(title, actions, list);

        if (state.userDrumPresetExport) {
          const exportText = document.createElement("textarea");
          exportText.className = "user-preset-export";
          exportText.readOnly = true;
          exportText.value = state.userDrumPresetExport;
          wrapper.append(exportText);
        }

        return wrapper;
      }

      function renderDrumPresetPanel() {
        el.drumPresetPanel.replaceChildren();
        el.drumPresetsToggle.classList.toggle("active", state.drumPresetPanelOpen);
        if (!state.drumPresetPanelOpen) return;

        const description = document.createElement("p");
        description.className = "preset-description";
        description.textContent = "Built-in drum presets are disabled for now. Save hand-built rhythms below, then export the best ones when they are ready to become built-in presets.";

        el.drumPresetPanel.append(description, renderUserDrumPresetTools());
      }

      function renderPlayhead() {
        document.querySelectorAll(".playing").forEach((node) => node.classList.remove("playing"));
        document.querySelectorAll(`[data-step="${state.playhead}"]`).forEach((node) => node.classList.add("playing"));
        renderBassRoll();
        renderDrumLaneRolls();
        renderBassEditorPlayhead();
        renderChordEditorPlayhead();
        renderDrumPatternPreviews();
        if (el.heroDiscRing) {
          const progress = state.playhead >= 0 ? ((state.playhead % STEPS) / STEPS) * 100 : 0;
          el.heroDiscRing.style.setProperty("--progress", `${progress}%`);
        }
      }

      function renderSoundOptions(select, options, currentValue) {
        select.replaceChildren();
        options.forEach(([key, sound]) => {
          const option = document.createElement("option");
          option.value = key;
          option.textContent = sound.label;
          select.append(option);
        });
        select.value = currentValue;
      }

      function renderSoundCatalog() {
        renderSoundOptions(el.rhythmSound, SOUND_CHOICES.rhythm.map((key) => [key, SOUND_CATALOG[key]]), state.sounds.rhythm);
        renderSoundOptions(el.harmonySound, SOUND_CHOICES.harmony.map((key) => [key, SOUND_CATALOG[key]]), state.sounds.harmony);
        TRACKS.forEach((track) => renderSoundOptions(el.drumSounds[track.key], Object.entries(DRUM_KIT_CATALOG), state.sounds.drums[track.key]));
      }

      function sceneShortcutLabel(index = state.currentScene) {
        return String(index + 1);
      }

      function currentSongSubtitle() {
        const scene = currentScene();
        const slot = `Scene ${sceneShortcutLabel()}`;
        const sceneLabel = scene.name && scene.name !== slot ? ` · ${scene.name}` : "";
        const playIcon = '<svg viewBox="0 0 16 16" class="status-icon"><path d="M4 2.75v10.5L13 8 4 2.75Z" fill="currentColor"/></svg>';
        const stopIcon = '<svg viewBox="0 0 16 16" class="status-icon"><rect x="3.5" y="3.5" width="9" height="9" fill="currentColor"/></svg>';
        if (state.isPlaying && state.playhead >= 0) {
          return `${playIcon} ${slot}${sceneLabel}${activeChordStatus(scene, state.playhead)}`;
        }
        return `${stopIcon} ${slot}${sceneLabel}`;
      }

      function setProbeSummary(items) {
        el.probeSummary.innerHTML = items.map((item) => {
          const tone = item.tone ? ` ${item.tone}` : "";
          return `<span class="probe-pill${tone}"><strong>${item.label}</strong> ${item.value}</span>`;
        }).join("");
      }

      function formatProbeIssues(report) {
        const errorLines = (report.errors || []).map((entry) => `ERR ${entry.rule}${entry.line ? ` @${entry.line}` : ""}: ${entry.message}`);
        const warningLines = (report.warnings || []).map((entry) => `WARN ${entry.rule}${entry.line ? ` @${entry.line}` : ""}: ${entry.message}`);
        const lines = [...errorLines, ...warningLines];
        return lines.length ? lines.join("\n") : "No lint findings.";
      }

      function renderFoundationProbe() {
        const source = el.writeDub.value || exportDubText();

        try {
          const context = parseDub(source);
          const merged = mergeDub(context);
          const report = lintDub(source, { context, merged });
          const expanded = buildArrangementDisplayExpansion(source);
          const timeline = buildSectionTimeline(context, merged, source);
          const mix = buildMixFromMerged(merged);
          const lineMap = buildTrackLineMap(source);
          const variables = collectVariableDefinitions(source);
          const tempo = extractDraftTempo(source) || state.bpm;
          const bars = extractDraftBars(source);
          const key = extractDraftKey(source);
          const bank = extractDraftBankSelection(source);

          foundationProbeSnapshot = { source, context, merged, report, expanded, timeline, mix, tempo };
          const totalTimelineBeats = timeline.length ? timeline[timeline.length - 1].end + 1 : 0;

          setProbeSummary([
            { label: "tempo", value: tempo },
            { label: "bars", value: bars === null ? "n/a" : bars },
            { label: "key", value: key === null ? "n/a" : key },
            { label: "vars", value: variables.length },
            { label: "sections", value: expanded.length },
            { label: "beats", value: totalTimelineBeats },
            { label: "tracks", value: mix.length },
            { label: "slots", value: getMaxPatternSlots(context) },
            { label: "warn", value: report.warnings.length, tone: report.warnings.length ? "warn" : "" },
            { label: "err", value: report.errors.length, tone: report.errors.length ? "error" : "" },
            { label: "bank", value: bank.bank || bank.instruments || bank.drums || "n/a" },
          ]);

          el.probeLint.textContent = formatProbeIssues(report);
          el.probeArrangement.textContent = [
            `expanded: ${expanded.map((item) => item.name).join(" ") || "none"}`,
            "",
            "timeline:",
            ...(timeline.length ? timeline.map((item) => (
              `${item.name || "?"} ${item.start}-${item.end}${item.blockId ? ` ${item.blockId}${item.blockLive ? " live" : ""}` : ""}`
            )) : ["none"]),
          ].join("\n");
          el.probeTracks.textContent = [
            `variables: ${variables.length ? variables.map((item) => `${item.name}@${item.line}`).join(", ") : "none"}`,
            `mix: ${mix.length ? mix.map((item) => `${item[0]}/${item[1]}:${item[2].length}`).join(", ") : "none"}`,
            "",
            "line map:",
            ...(lineMap.size ? [...lineMap.entries()].map(([name, lines]) => `${name}: ${lines.join(",")}`) : ["none"]),
          ].join("\n");
          if (el.probePlay) el.probePlay.disabled = false;
        } catch (error) {
          foundationProbeSnapshot = null;
          setProbeSummary([
            { label: "probe", value: "parse failed", tone: "error" },
          ]);
          const message = error && error.message ? error.message : String(error);
          el.probeLint.textContent = message;
          el.probeArrangement.textContent = "Probe unavailable until the exported DUB parses cleanly.";
          el.probeTracks.textContent = "Fix export shape or parser assumptions before using the foundation probe.";
          if (el.probePlay) el.probePlay.disabled = true;
        }
      }

      async function stopFoundationProbe() {
        if (foundationProbeStopTimer) {
          window.clearTimeout(foundationProbeStopTimer);
          foundationProbeStopTimer = null;
        }
        if (foundationProbeAudioContext) {
          const ctx = foundationProbeAudioContext;
          foundationProbeAudioContext = null;
          await ctx.close();
        }
        if (el.probePlay) el.probePlay.textContent = "Probe Click";
      }

      async function playFoundationProbe() {
        if (!foundationProbeSnapshot) return;
        if (foundationProbeAudioContext) {
          await stopFoundationProbe();
          return;
        }

        const ctx = new AudioContext();
        foundationProbeAudioContext = ctx;
        await ctx.resume();
        if (el.probePlay) el.probePlay.textContent = "Stop Probe";

        const sections = [];
        foundationProbeSnapshot.merged.forEach((group) => {
          (group || []).forEach((parts) => sections.push(parts));
        });

        const slotSeconds = 60 / Math.max(1, foundationProbeSnapshot.tempo) / 4;
        const startAt = ctx.currentTime + 0.05;
        let cursor = 0;

        sections.forEach((parts) => {
          const length = (parts || []).reduce((max, track) => Math.max(max, Array.isArray(track[2]) ? track[2].length : 0), 0);
          for (let i = 0; i < length; i += 1) {
            const sectionStart = i === 0;
            let active = false;
            (parts || []).forEach((track) => {
              const tick = Array.isArray(track[2]) ? track[2][i] : null;
              if (tick && typeof tick === "object" && tick.v > 0) active = true;
            });
            if (!active && !sectionStart) {
              cursor += 1;
              continue;
            }

            const at = startAt + cursor * slotSeconds;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = sectionStart ? "triangle" : "sine";
            osc.frequency.value = sectionStart ? 880 : 440;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(sectionStart ? 0.16 : 0.07, at + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(0.08, slotSeconds * 0.8));
            osc.connect(gain).connect(ctx.destination);
            osc.start(at);
            osc.stop(at + Math.min(0.1, slotSeconds));
            cursor += 1;
          }
        });

        const durationMs = Math.max(400, cursor * slotSeconds * 1000 + 180);
        foundationProbeStopTimer = window.setTimeout(() => {
          stopFoundationProbe();
        }, durationMs);
      }

      function renderShell() {
        document.body.classList.remove("mode-listen", "mode-edit", "mode-write", "editing");
        document.body.classList.add(`mode-${state.uiMode}`);
        if (state.uiMode === "edit") document.body.classList.add("editing");

        const modes = [
          [el.modeListen, "listen"],
          [el.modeEdit, "edit"],
        ];
        modes.forEach(([button, mode]) => {
          button.classList.toggle("active", state.uiMode === mode);
          button.setAttribute("aria-selected", String(state.uiMode === mode));
        });

        el.songTitleInput.value = state.songTitle;
        el.songTitleInput.readOnly = state.uiMode !== "edit";
        el.songTitleInput.setCustomValidity(state.songTitle.trim() ? "" : "Song title is required");
        el.songNoteInput.value = state.songNote || "";
        el.songNoteInput.readOnly = state.uiMode !== "edit";
        el.songNoteInput.style.height = "auto";
        el.songNoteInput.style.height = el.songNoteInput.scrollHeight + "px";
        el.sceneStatus.innerHTML = currentSongSubtitle();
        el.writeDub.value = exportDubText();
        renderFoundationProbe();
        el.mixerOpen.classList.toggle("active", el.mixerDialog.hasAttribute("open"));
        renderProjectState();
      }

      function setUiMode(mode) {
        const nextMode = normalizeUiMode(mode);
        if (state.uiMode === nextMode) return;
        state.uiMode = nextMode;
        document.body.classList.toggle("mode-text", state.textMode && nextMode === "edit");
        savePreset();
        renderShell();
        renderScenes();
      }

      async function copyText(text, successLabel = "Copied") {
        try {
          await navigator.clipboard.writeText(text);
          if (!state.isPlaying) {
            window.setTimeout(() => {
            }, 1200);
          }
        } catch (error) {
          alertBlocking("Could not copy to clipboard.");
        }
      }

      function renderBassControls() {
        renderSoundOptions(el.bassPreset, Object.entries(BASS_PRESETS), state.bass.preset);
        renderSoundOptions(el.bassShape, BASS_SHAPES.map((shape) => [shape, { label: shape }]), state.bass.layers[0].shape);
        if (el.bassToggle) {
          el.bassToggle.textContent = state.bass.enabled ? "Bass Keyboard On" : "Bass Keyboard Off";
          el.bassToggle.classList.toggle("active", state.bass.enabled);
        }
        if (el.bassRecordToggle) {
          el.bassRecordToggle.textContent = state.bass.recording ? "Record Bass On" : "Record Bass Off";
          el.bassRecordToggle.classList.toggle("active", state.bass.recording);
        }
        if (el.bassPlaybackToggle) {
          el.bassPlaybackToggle.classList.toggle("active", state.bass.enabled);
          el.bassPlaybackToggle.textContent = state.bass.enabled ? "■" : "▶";
        }
        if (el.bassOctaveDisplay) el.bassOctaveDisplay.textContent = state.bass.octave;
        if (el.bassTransposeDisplay) {
          const octaves = Math.round(state.bass.transpose / 12);
          el.bassTransposeDisplay.textContent = octaves > 0 ? `+${octaves}` : octaves;
        }
        el.bassVolume.value = state.bass.volume;
        el.bassGlide.value = state.bass.glide;
        el.bassRelease.value = state.bass.release;
        TRACKS.forEach((track) => {
          if (el.mixerDrumVolumes[track.key]) el.mixerDrumVolumes[track.key].value = currentScene().trackVolumes[track.key];
        });
      }

      function renderAll() {
        renderShell();
        renderSoundCatalog();
        renderBassControls();
        renderChordPresetPanel();
        renderDrumPresetPanel();
        renderProjectState();
        renderScenes();
        renderChordGrid();
        renderChordEditor();
        renderDrumGrid();
        el.bpm.value = state.bpm;
        el.strum.value = state.strumLength;
        el.padAttack.value = state.padAttack;
        el.masterVolume.value = state.volumes.master;
        el.rhythmVolume.value = state.volumes.rhythm;
        el.harmonyVolume.value = state.volumes.harmony;
        el.drumVolume.value = state.volumes.drums;
        applyVolumes();
      }

      function shouldIgnoreTransportShortcut(event) {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        if (target.closest("input, textarea, select")) return true;
        return Boolean(target.closest("[contenteditable]"));
      }

      function handleTransportShortcut(event) {
        if (event.defaultPrevented || shouldIgnoreTransportShortcut(event)) return;
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey) {
          event.preventDefault();
          if (!state.isPlaying) startPlayback();
          return;
        }
        if (event.key === "Escape") {
          const now = Date.now();
          if (now - lastEscapeAt <= 450) {
            event.preventDefault();
            stopPlayback();
            lastEscapeAt = 0;
            return;
          }
          lastEscapeAt = now;
        }
      }

      function toggleBassKeyboard(enabled = !state.bass.enabled) {
        state.bass.enabled = Boolean(enabled);
        if (!state.bass.enabled) releaseAllBassNotes();
        savePreset();
        renderBassControls();
        renderDrumGrid();
      }

      function toggleBassRecording(enabled = !state.bass.recording) {
        state.bass.recording = Boolean(enabled);
        savePreset();
        renderBassControls();
        renderDrumGrid();
      }

      function setBassKeyPressed(code, pressed) {
        const key = document.querySelector(`[data-bass-key="${code}"]`);
        if (key) key.classList.toggle("pressed", pressed);
      }

      function handleBassKeyDown(event) {
        if (!state.bass.enabled || event.repeat || event.defaultPrevented) return;
        const target = event.target;
        if (target instanceof Element && target.closest("input, textarea")) return;
        const offset = BASS_KEY_MAP.get(event.code);
        if (offset === undefined) return;
        event.preventDefault();
        playBassNote(event.code, offset);
      }

      function handleBassKeyUp(event) {
        if (!state.bass.enabled) return;
        const target = event.target;
        if (target instanceof Element && target.closest("input, textarea")) return;
        if (!BASS_KEY_MAP.has(event.code)) return;
        event.preventDefault();
        releaseBassNote(event.code);
      }

      el.play.addEventListener("click", togglePlayback);
      el.stop.addEventListener("click", () => stopPlayback());
      el.modeListen.addEventListener("click", () => setUiMode("listen"));
      el.modeEdit.addEventListener("click", () => setUiMode("edit"));
      el.textModeToggle.addEventListener("click", () => {
        state.textMode = !state.textMode;
        localStorage.setItem("skanker-text-mode", state.textMode);
        document.body.classList.toggle("mode-text", state.textMode && state.uiMode === "edit");
        el.textModeToggle.classList.toggle("active", state.textMode);
      });
      el.mixerOpen.addEventListener("click", openMixer);
      el.mixerClose.addEventListener("click", closeMixer);
      el.mixerDialog.addEventListener("close", renderShell);
      el.songTitleInput.addEventListener("input", () => {
        state.songTitle = el.songTitleInput.value;
        savePreset();
      });
      el.songTitleInput.addEventListener("blur", () => {
        const value = el.songTitleInput.value;
        const trimmed = value.trim();
        state.songTitle = trimmed;
        el.songTitleInput.setCustomValidity(trimmed ? "" : "Song title is required");
        el.songTitleInput.value = value;
        savePreset();
      });
      el.songNoteInput.addEventListener("input", () => {
        state.songNote = el.songNoteInput.value;
        el.songNoteInput.style.height = "auto";
        el.songNoteInput.style.height = el.songNoteInput.scrollHeight + "px";
        savePreset();
      });
      el.songNoteInput.addEventListener("blur", () => {
        const value = el.songNoteInput.value;
        state.songNote = value.trim();
        el.songNoteInput.value = value;
        el.songNoteInput.style.height = "auto";
        el.songNoteInput.style.height = el.songNoteInput.scrollHeight + "px";
        savePreset();
      });
(function wirePasteDialog() {
  let pasteSnapshot = null;
  function openPasteDialog() {
    pasteSnapshot = null;
    el.pasteInput.value = "";
    el.pasteError.textContent = "";
    el.pasteImportBtn.disabled = true;
    el.pasteDialog.showModal();
    el.pasteInput.focus();
  }
  function closePasteDialog(discard = true) {
    if (discard && pasteSnapshot) discardPreview(pasteSnapshot);
    pasteSnapshot = null;
    el.pasteDialog.close();
  }
  el.pastePlayBtn.addEventListener("click", () => {
    el.pasteError.textContent = "";
    const result = previewDubText(el.pasteInput.value);
    if (result.ok) {
      pasteSnapshot = result.snapshot;
      el.pasteImportBtn.disabled = false;
    } else {
      el.pasteError.textContent = result.error;
    }
  });
  el.pasteImportBtn.addEventListener("click", () => {
    pasteSnapshot = null;
    savePreset();
    closePasteDialog(false);
  });
  el.pasteClose.addEventListener("click", () => closePasteDialog(true));
  el.pasteDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closePasteDialog(true);
  });
})();

el.shareLink.addEventListener("click", () => {
        const url = currentShareUrlV2();
        if (url.length > 7800) {
        }
        copyText(url, "Link copied");
      });
      el.projectSave.addEventListener("click", saveCurrentProject);
      el.projectLoad.addEventListener("click", loadSelectedProject);
      el.projectRemove.addEventListener("click", removeSelectedProject);
      el.projectClear.addEventListener("click", clearWorkingProject);
      if (el.loadUrlSong) el.loadUrlSong.addEventListener("click", () => {
        if (!state.pendingUrlSnapshot) return;
        applyPresetData(state.pendingUrlSnapshot);
        state.currentProjectId = null;
        state.dirty = false;
        state.hasUrlSong = false;
        state.pendingUrlSnapshot = null;
        window.history.replaceState(null, "", window.location.pathname);
        releaseHarmony(audioContext?.currentTime || 0);
        releaseAllBassNotes();
        renderAll();
      });
      el.projectSelect.addEventListener("change", () => {
        el.projectLoad.disabled = !el.projectSelect.value;
      });
      document.addEventListener("keydown", handleTransportShortcut, { capture: true });
      document.addEventListener("keydown", handleBassKeyDown);
      document.addEventListener("keyup", handleBassKeyUp);
      el.sceneLoopToggle.addEventListener("change", (event) => {
        state.loopActiveScene = event.target.checked;
        savePreset();
        renderScenes();
      });
      el.rhythmMute.addEventListener("change", (event) => {
        currentScene().mutes.rhythm = event.target.checked;
        savePreset();
        applyVolumes();
        renderChordGrid();
        renderChordEditor();
      });
      el.harmonyMute.addEventListener("change", (event) => {
        currentScene().mutes.harmony = event.target.checked;
        savePreset();
        applyVolumes();
        renderChordGrid();
        renderChordEditor();
      });
      el.drumPresetsToggle.addEventListener("click", () => {
        if (state.drumPresetPanelOpen) {
          closeDrumPresets();
        } else {
          openDrumPresets();
        }
        savePreset();
      });
      el.writeCopy.addEventListener("click", () => copyText(exportDubText(), "DUB copied"));
      el.writeDownload.addEventListener("click", () => {
        downloadTextFile("SKNKR.dub", exportDubText(), "text/plain");
      });
      if (el.probePlay) {
        el.probePlay.addEventListener("click", () => {
          playFoundationProbe();
        });
      }
      el.writeImport.addEventListener("click", () => {
        runBlockingAction(() => el.dubImportFile.click());
      });
      el.dubImportFile.addEventListener("change", (event) => {
        handleDubImportFile(event.target.files?.[0]);
      });
      el.chordPresetsToggle.addEventListener("click", () => {
        if (state.chordPresetPanelOpen) {
          closeChordPresets();
        } else {
          openChordPresets();
        }
        savePreset();
      });
      el.bpm.addEventListener("change", (event) => setBpm(event.target.value));
      el.bpmDown.addEventListener("click", () => setBpm(state.bpm - 1));
      el.bpmUp.addEventListener("click", () => setBpm(state.bpm + 1));
      el.strum.addEventListener("input", (event) => {
        state.strumLength = Number(event.target.value);
        if (audioRuntime) audioRuntime.strumLength = state.strumLength;
        savePreset();
      });
      el.padAttack.addEventListener("input", (event) => {
        state.padAttack = Number(event.target.value);
        savePreset();
      });
      if (el.bassToggle) el.bassToggle.addEventListener("click", () => toggleBassKeyboard());
      if (el.bassRecordToggle) el.bassRecordToggle.addEventListener("click", () => toggleBassRecording());
      if (el.bassClear) el.bassClear.addEventListener("click", () => {
        const scene = currentScene();
        if (!scene.bass.length) return;
        scene.bass = [];
        savePreset();
        renderDrumGrid();
      });
      el.bassPreset.addEventListener("change", (event) => applyBassPreset(event.target.value));
      if (el.bassPlaybackToggle) el.bassPlaybackToggle.addEventListener("click", () => {
        state.bass.enabled = !state.bass.enabled;
        savePreset();
        renderBassControls();
        renderDrumGrid();
      });
      el.bassShape.addEventListener("change", (event) => {
        state.bass.preset = "custom";
        state.bass.layers = [{ ...state.bass.layers[0], shape: BASS_SHAPES.includes(event.target.value) ? event.target.value : "sine" }];
        savePreset();
        renderBassControls();
      });
      if (el.bassOctaveDown) el.bassOctaveDown.addEventListener("click", () => {
        state.bass.octave = Math.max(0, state.bass.octave - 1);
        releaseAllBassNotes();
        savePreset();
        renderBassControls();
      });
      if (el.bassOctaveUp) el.bassOctaveUp.addEventListener("click", () => {
        state.bass.octave = Math.min(4, state.bass.octave + 1);
        releaseAllBassNotes();
        savePreset();
        renderBassControls();
      });
      if (el.bassTransposeDown) el.bassTransposeDown.addEventListener("click", () => {
        state.bass.transpose = Math.max(-24, state.bass.transpose - 12);
        releaseAllBassNotes();
        savePreset();
        renderBassControls();
      });
      if (el.bassTransposeUp) el.bassTransposeUp.addEventListener("click", () => {
        state.bass.transpose = Math.min(24, state.bass.transpose + 12);
        releaseAllBassNotes();
        savePreset();
        renderBassControls();
      });
      if (el.bassTransposeReset) el.bassTransposeReset.addEventListener("click", () => {
        state.bass.transpose = 0;
        releaseAllBassNotes();
        savePreset();
        renderBassControls();
      });
      if (el.bassTransposeApply) el.bassTransposeApply.addEventListener("click", () => {
        if (state.bass.transpose === 0) return;
        const scene = currentScene();
        if (!scene.bass.length) return;
        scene.bass.forEach((event) => {
          if (event && typeof event.midi === "number") {
            event.midi = Math.max(0, Math.min(127, event.midi + state.bass.transpose));
          }
        });
        scene.bassText = bassTextState(scene.bass, null, formatBassNotes, formatBassPattern);
        state.bass.transpose = 0;
        savePreset();
        renderBassControls();
        renderDrumGrid();
      });
      el.bassVolume.addEventListener("input", (event) => {
        state.bass.volume = clampNumber(event.target.value, 0, 1, state.bass.volume);
        applyVolumes();
        savePreset();
      });
      TRACKS.forEach((track) => {
        el.mixerDrumVolumes[track.key].addEventListener("input", (event) => {
          currentScene().trackVolumes[track.key] = clampNumber(event.target.value, 0, 1, currentScene().trackVolumes[track.key]);
          savePreset();
          applyVolumes();
        });
      });
      el.bassGlide.addEventListener("input", (event) => {
        state.bass.preset = "custom";
        state.bass.glide = clampNumber(event.target.value, 0, 0.2, state.bass.glide);
        savePreset();
        renderBassControls();
      });
      el.bassRelease.addEventListener("input", (event) => {
        state.bass.preset = "custom";
        state.bass.release = clampNumber(event.target.value, 0.04, 1, state.bass.release);
        savePreset();
        renderBassControls();
      });
      el.rhythmSound.addEventListener("change", async (event) => {
        state.sounds.rhythm = Object.prototype.hasOwnProperty.call(SOUND_CATALOG, event.target.value) ? event.target.value : "internal";
        if (audioContext && state.sounds.rhythm !== "internal") {
          await loadSoundProfile(audioContext, state.sounds.rhythm, SOUND_CATALOG);
        }
        savePreset();
        if (audioRuntime) audioRuntime.sounds.rhythm = state.sounds.rhythm;
        renderAll();
      });
      el.harmonySound.addEventListener("change", async (event) => {
        state.sounds.harmony = Object.prototype.hasOwnProperty.call(SOUND_CATALOG, event.target.value) ? event.target.value : "internal";
        if (audioContext && state.sounds.harmony !== "internal") {
          await loadSoundProfile(audioContext, state.sounds.harmony, SOUND_CATALOG);
        }
        releaseHarmony(audioContext?.currentTime || 0);
        if (audioRuntime) {
          audioRuntime.sounds.harmony = state.sounds.harmony;
        }
        savePreset();
        renderAll();
      });
      TRACKS.forEach((track) => {
        el.drumSounds[track.key].addEventListener("change", async (event) => {
          state.sounds.drums[track.key] = Object.prototype.hasOwnProperty.call(DRUM_KIT_CATALOG, event.target.value) ? event.target.value : "internal";
          const drumSound = drumSoundDefinition(state.sounds.drums[track.key], track.key);
          if (audioContext && drumSound) {
            await loadSoundProfile(audioContext, drumSound.presetName, { [drumSound.presetName]: drumSound });
          }
          if (audioRuntime) audioRuntime.sounds.drums[track.key] = state.sounds.drums[track.key];
          savePreset();
          renderAll();
        });
      });
      el.masterVolume.addEventListener("input", (event) => {
        state.volumes.master = Number(event.target.value);
        applyVolumes();
        savePreset();
      });
      el.rhythmVolume.addEventListener("input", (event) => {
        state.volumes.rhythm = Number(event.target.value);
        applyVolumes();
        savePreset();
      });
      el.harmonyVolume.addEventListener("input", (event) => {
        state.volumes.harmony = Number(event.target.value);
        applyVolumes();
        savePreset();
      });
      el.drumVolume.addEventListener("input", (event) => {
        state.volumes.drums = Number(event.target.value);
        applyVolumes();
        savePreset();
      });
      el.soundOpen.addEventListener("click", openSoundCatalog);
      el.soundClose.addEventListener("click", closeSoundCatalog);
      el.soundDialog.addEventListener("cancel", closeSoundCatalog);
      el.bassEditorClose.addEventListener("click", closeBassEditor);
      el.bassEditorDialog.addEventListener("cancel", closeBassEditor);
      document.querySelectorAll(".bass-key").forEach((key) => {
        const code = key.dataset.bassKey;
        const offset = BASS_KEY_MAP.get(code);
        if (offset === undefined) return;
        key.addEventListener("mousedown", () => {
          ensureAudio();
          playBassNote(code, offset);
        });
        key.addEventListener("mouseup", () => {
          releaseBassNote(code);
        });
        key.addEventListener("mouseleave", () => {
          releaseBassNote(code);
        });
      });
      el.chordPresetsClose.addEventListener("click", closeChordPresets);
      el.chordPresetsDialog.addEventListener("cancel", closeChordPresets);
      el.chordPresetsDialog.addEventListener("close", () => {
        state.chordPresetPanelOpen = false;
        renderChordPresetPanel();
        savePreset();
      });
      el.drumPresetsClose.addEventListener("click", closeDrumPresets);
      el.drumPresetsDialog.addEventListener("cancel", closeDrumPresets);
      el.drumPresetsDialog.addEventListener("close", () => {
        state.drumPresetPanelOpen = false;
        renderDrumPresetPanel();
        savePreset();
      });
      el.chordEditorClose.addEventListener("click", closeChordEditor);
      el.chordEditorDialog.addEventListener("cancel", closeChordEditor);
      el.catalogOpen.addEventListener("click", openCatalog);
      el.catalogClose.addEventListener("click", closeCatalog);
      el.catalogAdd.addEventListener("click", () => addCatalogRow());
      el.catalogSave.addEventListener("click", saveCatalog);
      el.catalogDialog.addEventListener("cancel", closeCatalog);

      loadUserDrumPresets();
      loadUserChordPresets();
      loadProjects();
      loadPreset();
      if (!applySharedStateFromUrlV2()) applySharedStateFromUrl();
      applyUrlPresetIdentity();
      document.body.classList.toggle("mode-text", state.textMode);
      el.textModeToggle.classList.toggle("active", state.textMode);
      renderAll();
