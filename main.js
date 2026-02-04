"use strict";

const AudioContextFunc = window.AudioContext || window.webkitAudioContext;

/* =========================
 * State / Config
 * ========================= */

let audioCtx;
let player;

let appStarted = false;

let currentTone = _tone_0000_Aspirin_sf2_file; // 初期：ピアノ
let noteDuration = 1.5; // 秒
let bpm = 100;

const BPM_MIN = 30;
const BPM_MAX = 240;

let lastChordActualMidis = []; // 直近コードの構成音（実MIDI）
let isArpPlaying = false; // 連打防止

const BASE_C4 = 60; // C4
let octaveShift = 0; // -2..+2
let transposeSemis = 0; // 実際の移調（半音）
let currentKeyName = "C"; // 表示用
let currentKeySemi = 0; // Keyボタンの半音値（0=C, 1=D♭,...）
let scaleMode = "major"; // "major" | "minor"

// 押しっぱなし判定（キーボード連打防止）
const pressedKeySet = new Set();

/* =========================
 * Mappings / Tables
 * ========================= */

// メジャー：ASDF JKL; → C4〜C5
const KEY_TO_BASEMIDI_MAJOR = {
  a: 60,
  s: 62,
  d: 64,
  f: 65,
  j: 67,
  k: 69,
  l: 71,
  ";": 72,
};

// マイナー：ASDF JKL; → A3〜A4
const KEY_TO_BASEMIDI_MINOR = {
  a: 57,
  s: 59,
  d: 60,
  f: 62,
  j: 64,
  k: 65,
  l: 67,
  ";": 69,
};

// 黒鍵（クロマチック）
const KEY_TO_BASEMIDI_BLACK = {
  w: 61,
  e: 63,
  t: 66,
  u: 66,
  i: 68,
  o: 70,
};

const DEGREE_SEMITONES_MAJOR = [0, 2, 4, 5, 7, 9, 11];

const DEGREE_TEXT_MAJOR = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];
const DEGREE7_TEXT_MAJOR = [
  "Ⅰmaj7",
  "Ⅱm7",
  "Ⅲm7",
  "Ⅳmaj7",
  "Ⅴ7",
  "Ⅵm7",
  "Ⅶm7♭5",
];

const DEGREE_TEXT_MINOR = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
const DEGREE7_TEXT_MINOR = [
  "i7",
  "iiø7",
  "IIImaj7",
  "iv7",
  "v7",
  "VImaj7",
  "VII7",
];

const DEGREE_QUALITIES_MAJOR = [
  "maj",
  "min",
  "min",
  "maj",
  "maj",
  "min",
  "dim",
];
const DEGREE_QUALITIES_MINOR = [
  "min",
  "dim",
  "maj",
  "min",
  "min",
  "maj",
  "maj",
];

const DEGREE_7_QUALITIES_MAJOR = [
  "maj7",
  "min7",
  "min7",
  "maj7",
  "dom7",
  "min7",
  "halfdim7",
];
const DEGREE_7_QUALITIES_MINOR = [
  "min7",
  "halfdim7",
  "maj7",
  "min7",
  "min7",
  "maj7",
  "dom7",
];

// マイナー度数を「相対メジャー」の degree index にマップ
const DEGREE_INDEX_MAP_MINOR = [5, 6, 0, 1, 2, 3, 4];

const QUALITY_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

const QUALITY_7_INTERVALS = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfdim7: [0, 3, 6, 10],
};

const NOTE_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const NOTE_NAMES_FLAT = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];

/* =========================
 * UI Lock (Start gate)
 * ========================= */

function lockUI() {
  const lock = document.getElementById("uiLock");
  if (lock) lock.style.display = "flex";
}

function unlockUI() {
  const lock = document.getElementById("uiLock");
  if (lock) lock.style.display = "none";
}

function setupStartCard() {
  const card = document.getElementById("startCard");
  if (!card) return;

  card.addEventListener("click", (e) => {
    e.preventDefault();
    startApp();
  });
}

/* =========================
 * Audio init / preload
 * ========================= */

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContextFunc();
    player = new WebAudioFontPlayer();
  }
}

// 無音でプリロード（デコード/準備を促す）
function preloadAllTones() {
  const toneMap = {
    piano: _tone_0000_Aspirin_sf2_file,
    guitar: _tone_0250_GeneralUserGS_sf2_file,
    bass: _tone_0330_GeneralUserGS_sf2_file,
    harp: _tone_0460_GeneralUserGS_sf2_file,
    retro: _tone_0800_SoundBlasterOld_sf2,
    violin: _tone_0400_GeneralUserGS_sf2_file,
  };

  const tones = Object.values(toneMap);
  const testMidis = [60, 64, 67]; // C4/E4/G4
  const now = audioCtx.currentTime;

  const duration = 0.02;
  const volume = 0.0;

  tones.forEach((tone) => {
    testMidis.forEach((midi) => {
      player.queueWaveTable(
        audioCtx,
        audioCtx.destination,
        tone,
        now,
        midi,
        duration,
        volume,
      );
    });
  });
}

/* =========================
 * Utilities
 * ========================= */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function setBpm(newBpm) {
  bpm = clamp(Math.round(newBpm), BPM_MIN, BPM_MAX);
  const inputEl = document.getElementById("bpmValue");
  if (inputEl) inputEl.value = String(bpm);
}

function shouldUseFlatNames(keyName) {
  return keyName.includes("♭");
}

function getNoteNameFromMidi(baseMidi, transposeSemi, keyName) {
  let pitchClass = (baseMidi + transposeSemi) % 12;
  if (pitchClass < 0) pitchClass += 12;

  const table = shouldUseFlatNames(keyName)
    ? NOTE_NAMES_FLAT
    : NOTE_NAMES_SHARP;
  return table[pitchClass];
}

function midiToOctaveNumber(midi) {
  return Math.floor(midi / 12) - 1;
}

// baseMidi + 移調 + オクターブ → 実MIDI
function toActualMidi(baseMidi) {
  return baseMidi + transposeSemis + octaveShift * 12;
}

function suffixForTriad(quality) {
  if (quality === "min") return "m";
  if (quality === "dim") return "dim";
  return "";
}

function suffixFor7(quality7) {
  switch (quality7) {
    case "maj7":
      return "maj7";
    case "min7":
      return "m7";
    case "dom7":
      return "7";
    case "halfdim7":
      return "m7♭5";
    default:
      return "";
  }
}

/* =========================
 * Degree / Chord helpers (重複削減の核)
 * ========================= */

// degree(0..6) から rootOffset / triadQuality / seventhQuality を取得
function getDegreeInfo(degreeIndex) {
  let rootOffset;
  let triQuality;
  let seventhQuality;

  if (scaleMode === "minor") {
    const majorIndex = DEGREE_INDEX_MAP_MINOR[degreeIndex];
    rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
    triQuality = DEGREE_QUALITIES_MINOR[degreeIndex];
    seventhQuality = DEGREE_7_QUALITIES_MINOR[degreeIndex];
  } else {
    rootOffset = DEGREE_SEMITONES_MAJOR[degreeIndex];
    triQuality = DEGREE_QUALITIES_MAJOR[degreeIndex];
    seventhQuality = DEGREE_7_QUALITIES_MAJOR[degreeIndex];
  }

  return { rootOffset, triQuality, seventhQuality };
}

// triad/seventh 共通：コード構成音（baseMidis）と表示用ラベル/音名を作る
function buildChordData(degreeIndex, kind) {
  const { rootOffset, triQuality, seventhQuality } = getDegreeInfo(degreeIndex);

  const rootBaseMidi = BASE_C4 + rootOffset;

  if (kind === "triad") {
    const quality = triQuality;
    const intervals = QUALITY_INTERVALS[quality] || QUALITY_INTERVALS.maj;
    const baseMidis = intervals.map((iv) => rootBaseMidi + iv);

    const rootName = getNoteNameFromMidi(
      rootBaseMidi,
      transposeSemis,
      currentKeyName,
    );
    const label = `${rootName}${suffixForTriad(quality)}`;

    const noteNames = baseMidis.map((m) =>
      getNoteNameFromMidi(m, transposeSemis, currentKeyName),
    );
    const actualMidis = baseMidis.map(toActualMidi);

    return { label, noteNames, baseMidis, actualMidis };
  }

  // kind === "seventh"
  const quality7 = seventhQuality;
  const intervals = QUALITY_7_INTERVALS[quality7] || QUALITY_7_INTERVALS.maj7;
  const baseMidis = intervals.map((iv) => rootBaseMidi + iv);

  const rootName = getNoteNameFromMidi(
    rootBaseMidi,
    transposeSemis,
    currentKeyName,
  );
  const label = `${rootName}${suffixFor7(quality7)}`;

  const noteNames = baseMidis.map((m) =>
    getNoteNameFromMidi(m, transposeSemis, currentKeyName),
  );
  const actualMidis = baseMidis.map(toActualMidi);

  return { label, noteNames, baseMidis, actualMidis };
}

/* =========================
 * Key/Mode apply (labels, chord names, ranges)
 * ========================= */

function computeTransposeSemis(keySemi) {
  // マイナー：相対メジャー扱いにする（+3半音）
  return scaleMode === "minor" ? (keySemi + 3) % 12 : keySemi;
}

function updateDegreeButtonTexts() {
  const triTexts =
    scaleMode === "minor" ? DEGREE_TEXT_MINOR : DEGREE_TEXT_MAJOR;
  const sevTexts =
    scaleMode === "minor" ? DEGREE7_TEXT_MINOR : DEGREE7_TEXT_MAJOR;

  document.querySelectorAll(".chord-btn").forEach((btn) => {
    const d = Number(btn.dataset.degree);
    if (!Number.isNaN(d) && triTexts[d]) btn.textContent = triTexts[d];
  });

  document.querySelectorAll(".chord7-btn").forEach((btn) => {
    const d = Number(btn.dataset.degree);
    if (!Number.isNaN(d) && sevTexts[d]) btn.textContent = sevTexts[d];
  });
}

function updateKeyLabelsForTranspose() {
  document.querySelectorAll(".key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);
    const labelSpan = keyEl.querySelector(".key-label-note");
    if (!labelSpan) return;

    labelSpan.textContent = getNoteNameFromMidi(
      baseMidi,
      transposeSemis,
      currentKeyName,
    );
  });
}

function updatePlayableRange() {
  document.querySelectorAll(".key").forEach((keyEl) => {
    const midi = Number(keyEl.dataset.midi);

    const inside =
      scaleMode === "major"
        ? midi >= 60 && midi <= 71 // C4..B4
        : midi >= 57 && midi <= 69; // A3..A4

    keyEl.classList.toggle("outside-range", !inside);
  });
}

// triad / seventh の「ボタン下ラベル更新」を共通化
function updateChordNamesUnderButtons(kind) {
  const selector = kind === "triad" ? ".chord-name-triad" : ".chord-name-7";

  document.querySelectorAll(selector).forEach((el) => {
    const degree = Number(el.dataset.degree);
    if (Number.isNaN(degree)) return;

    const data = buildChordData(degree, kind);
    el.textContent = data.label;
  });
}

// 参照用ピアノ：オクターブ数字だけ更新（固定表記は維持）
function updateRefPianoOctaveNumbersOnly() {
  document.querySelectorAll(".ref-key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);
    const span = keyEl.querySelector("span");
    if (!span) return;

    if (!keyEl.dataset.fixedLabelHtml) {
      keyEl.dataset.fixedLabelHtml = span.innerHTML;
    }

    const actualMidi = baseMidi + transposeSemis + octaveShift * 12;
    const octave = midiToOctaveNumber(actualMidi);

    const template = keyEl.dataset.fixedLabelHtml;
    span.innerHTML = template.replace(/\d+/g, String(octave));
  });
}

function applyKeyAndMode() {
  transposeSemis = computeTransposeSemis(currentKeySemi);

  updateChordNamesUnderButtons("triad");
  updateChordNamesUnderButtons("seventh");
  updateDegreeButtonTexts();
  updateKeyLabelsForTranspose();
  updatePlayableRange();
  updateRefPianoOctaveNumbersOnly();
  clearReferenceHold();
}

/* =========================
 * Octave
 * ========================= */

function updateOctaveLabel() {
  const el = document.getElementById("octaveStatus");
  if (!el) return;

  let text = "オクターブシフト：";
  if (octaveShift === 0) text += "0（基準）";
  else if (octaveShift > 0) text += `+${octaveShift}`;
  else text += `${octaveShift}`;

  el.textContent = text;
}

function changeOctave(delta) {
  const newVal = Math.max(-2, Math.min(2, octaveShift + delta));
  if (newVal === octaveShift) return;

  octaveShift = newVal;
  updateOctaveLabel();
  updateRefPianoOctaveNumbersOnly();
}

/* =========================
 * Left panel: last chord UI
 * ========================= */

function updateLastChordPanel(chordLabel, noteNames) {
  const labelEl = document.getElementById("lastChordLabel");
  const notesWrap = document.getElementById("lastChordNotes");
  if (!labelEl || !notesWrap) return;

  labelEl.textContent = chordLabel || "（未選択）";
  notesWrap.innerHTML = "";

  noteNames.forEach((name) => {
    const span = document.createElement("span");
    span.className = "note-chip";
    span.textContent = name;
    notesWrap.appendChild(span);
  });
}

/* =========================
 * Ref piano highlight
 * ========================= */

function flashReferenceKey(actualMidi) {
  const el = document.querySelector(`.ref-key[data-midi="${actualMidi}"]`);
  if (!el) return;

  el.classList.add("ref-active");
  setTimeout(() => el.classList.remove("ref-active"), 180);
}

function clearReferenceHold() {
  document.querySelectorAll(".ref-key.ref-held").forEach((el) => {
    el.classList.remove("ref-held");
  });
}

function setReferenceHold(actualMidis) {
  clearReferenceHold();

  const unique = Array.from(new Set(actualMidis));
  unique.forEach((midi) => {
    const el = document.querySelector(`.ref-key[data-midi="${midi}"]`);
    if (el) el.classList.add("ref-held");
  });
}

/* =========================
 * Play (note / chord)
 * ========================= */

function playActualMidi(actualMidi) {
  initAudio();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const volume = 0.5;

  flashReferenceKey(actualMidi);

  player.queueWaveTable(
    audioCtx,
    audioCtx.destination,
    currentTone,
    now,
    actualMidi,
    noteDuration,
    volume,
  );
}

function playNote(baseMidi) {
  const actualMidi = toActualMidi(baseMidi);
  playActualMidi(actualMidi);

  // 画面上の鍵盤（baseMidi）を一瞬光らせる
  const keyEl = document.querySelector(`.key[data-midi="${baseMidi}"]`);
  if (keyEl) {
    keyEl.classList.add("active");
    setTimeout(() => keyEl.classList.remove("active"), 150);
  }
}

// triad / seventh 共通：コード再生
function playChord(kind, degreeIndex) {
  const data = buildChordData(degreeIndex, kind);

  updateLastChordPanel(data.label, data.noteNames);

  lastChordActualMidis = data.actualMidis.slice();

  const arpBtn = document.getElementById("arpPlayBtn");
  if (arpBtn) arpBtn.disabled = false;

  setReferenceHold(data.actualMidis);

  // 構成音を同時に鳴らす（既存挙動維持）
  data.baseMidis.forEach((m) => playNote(m));
}

/* =========================
 * Setup: inputs / controls
 * ========================= */

function setupScaleModeButtons() {
  const majorBtn = document.getElementById("modeMajorBtn");
  const minorBtn = document.getElementById("modeMinorBtn");
  if (!majorBtn || !minorBtn) return;

  function setMode(mode) {
    scaleMode = mode;
    majorBtn.classList.toggle("active", mode === "major");
    minorBtn.classList.toggle("active", mode === "minor");
    applyKeyAndMode();
  }

  majorBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setMode("major");
  });

  minorBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setMode("minor");
  });

  setMode("major");
}

function setupTransposeButtons() {
  const buttons = document.querySelectorAll(".tbtn");
  if (!buttons.length) return;

  function updateActiveButton(semi) {
    buttons.forEach((btn) => {
      const v = Number(btn.dataset.trans);
      const isActive = v === semi;
      btn.classList.toggle("active", isActive);
      if (isActive) currentKeyName = btn.textContent.trim();
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const semi = Number(btn.dataset.trans);
      currentKeySemi = semi;
      updateActiveButton(semi);
      applyKeyAndMode();
    });
  });

  currentKeySemi = 0;
  updateActiveButton(0);
  applyKeyAndMode();
}

function setupChordButtons() {
  document.querySelectorAll(".chord-btn").forEach((btn) => {
    const degree = Number(btn.dataset.degree);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      playChord("triad", degree);
    });
  });
}

function setupSeventhChordButtons() {
  document.querySelectorAll(".chord7-btn").forEach((btn) => {
    const degree = Number(btn.dataset.degree);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      playChord("seventh", degree);
    });
  });
}

// 鍵盤：マウス/タッチで発音
function attachKeyEvents() {
  document.querySelectorAll(".key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);

    const startPlay = (e) => {
      e.preventDefault();
      keyEl.classList.add("active");
      playNote(baseMidi);
    };

    const stopPlay = () => keyEl.classList.remove("active");

    keyEl.addEventListener("mousedown", startPlay);
    keyEl.addEventListener("mouseup", stopPlay);
    keyEl.addEventListener("mouseleave", stopPlay);

    keyEl.addEventListener("touchstart", startPlay, { passive: false });
    keyEl.addEventListener("touchend", stopPlay);
    keyEl.addEventListener("touchcancel", stopPlay);
  });
}

// キーボード操作
function setupKeyboardControl() {
  window.addEventListener("keydown", (e) => {
    const key = e.key;

    // Ctrl：オクターブ↓
    if (key === "Control") {
      if (!pressedKeySet.has("Control")) {
        changeOctave(-1);
        pressedKeySet.add("Control");
      }
      return;
    }

    // :（Shift+;）：オクターブ↑
    if (key === ":") {
      e.preventDefault();
      if (!pressedKeySet.has(":")) {
        changeOctave(1);
        pressedKeySet.add(":");
      }
      return;
    }

    const lower = key.toLowerCase();
    const lookupKey = key === ";" ? ";" : lower;

    if (pressedKeySet.has(lookupKey)) return;

    let baseMidi = null;

    if (lookupKey in KEY_TO_BASEMIDI_BLACK) {
      baseMidi = KEY_TO_BASEMIDI_BLACK[lookupKey];
    } else if (scaleMode === "minor") {
      if (lookupKey in KEY_TO_BASEMIDI_MINOR)
        baseMidi = KEY_TO_BASEMIDI_MINOR[lookupKey];
    } else {
      if (lookupKey in KEY_TO_BASEMIDI_MAJOR)
        baseMidi = KEY_TO_BASEMIDI_MAJOR[lookupKey];
    }

    if (baseMidi == null) return;

    pressedKeySet.add(lookupKey);
    e.preventDefault();
    playNote(baseMidi);
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key;
    const lower = key.toLowerCase();

    pressedKeySet.delete(lower);
    pressedKeySet.delete(key);
    pressedKeySet.delete(";");
  });
}

// ピアノ左右端クリックでオクターブ変更
function setupOctaveEdgeClick() {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.addEventListener(
    "pointerdown",
    (e) => {
      const rect = piano.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;

      if (ratio <= 0.05) {
        e.preventDefault();
        changeOctave(-1);
      } else if (ratio >= 0.95) {
        e.preventDefault();
        changeOctave(+1);
      }
    },
    { passive: false },
  );
}

// アルペジオ
function setupArpButton() {
  const btn = document.getElementById("arpPlayBtn");
  if (!btn) return;

  function updateEnabled() {
    btn.disabled =
      !(lastChordActualMidis && lastChordActualMidis.length > 0) ||
      isArpPlaying;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (isArpPlaying) return;
    if (!lastChordActualMidis || lastChordActualMidis.length === 0) return;

    isArpPlaying = true;
    updateEnabled();

    const intervalMs = Math.round((60 / bpm) * 1000);
    const seq = lastChordActualMidis.slice();

    seq.forEach((midi, i) => {
      setTimeout(() => playActualMidi(midi), i * intervalMs);
    });

    const totalMs = (seq.length - 1) * intervalMs + 30;
    setTimeout(() => {
      isArpPlaying = false;
      updateEnabled();
    }, totalMs);
  });

  updateEnabled();
}

// 楽器
function setupInstrumentButtons() {
  const buttons = document.querySelectorAll(".inst-btn");
  if (!buttons.length) return;

  const toneMap = {
    piano: _tone_0000_Aspirin_sf2_file,
    guitar: _tone_0250_GeneralUserGS_sf2_file,
    bass: _tone_0330_GeneralUserGS_sf2_file,
    harp: _tone_0460_GeneralUserGS_sf2_file,
    retro: _tone_0800_SoundBlasterOld_sf2,
    violin: _tone_0400_GeneralUserGS_sf2_file,
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();

      const key = btn.dataset.inst;
      if (!key || !(key in toneMap)) return;

      currentTone = toneMap[key];
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}

// 音の長さ
function setupDurationSlider() {
  const slider = document.getElementById("durationSlider");
  const valueEl = document.getElementById("durationValue");
  if (!slider) return;

  function apply(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return;

    noteDuration = num;
    if (valueEl) valueEl.textContent = `${num.toFixed(2)}s`;
  }

  apply(slider.value);
  slider.addEventListener("input", () => apply(slider.value));
}

// BPM：入力 + 縦ドラッグ
function setupTempoControl() {
  const display = document.getElementById("bpmDisplay");
  const input = document.getElementById("bpmValue");

  setBpm(bpm);

  if (input) {
    input.addEventListener("change", () => {
      setBpm(Number(input.value));
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });

    // input操作はドラッグと競合しないようにする
    input.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
  }

  if (display) {
    let startY = 0;
    let startBpm = 100;
    let dragging = false;
    let pointerId = null;

    const PX_PER_BPM = 5;

    display.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      display.setPointerCapture(pointerId);

      startY = e.clientY;
      startBpm = bpm;
      dragging = false;
    });

    display.addEventListener("pointermove", (e) => {
      if (pointerId == null) return;

      const dy = e.clientY - startY;
      if (Math.abs(dy) > 3) dragging = true;

      if (dragging) {
        const delta = -dy / PX_PER_BPM; // 上で増 / 下で減
        setBpm(startBpm + delta);
      }
    });

    display.addEventListener("pointerup", () => {
      try {
        display.releasePointerCapture(pointerId);
      } catch {}
      pointerId = null;
      dragging = false;
    });

    display.addEventListener("pointercancel", () => {
      pointerId = null;
      dragging = false;
    });
  }
}

/* =========================
 * App start
 * ========================= */

async function startApp() {
  if (appStarted) return;

  initAudio();

  // ユーザー操作内で resume（重要）
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  preloadAllTones();

  // ここから先で初めて各種イベントを attach
  attachKeyEvents();
  setupKeyboardControl();
  setupTransposeButtons();
  setupChordButtons();
  setupSeventhChordButtons();
  setupOctaveEdgeClick();
  updateOctaveLabel();
  setupScaleModeButtons();
  setupInstrumentButtons();
  setupDurationSlider();
  setupArpButton();
  setupTempoControl();
  updateRefPianoOctaveNumbersOnly();

  appStarted = true;
  unlockUI();
}

/* =========================
 * Boot
 * ========================= */

window.addEventListener("DOMContentLoaded", () => {
  lockUI();
  setupStartCard();
});
