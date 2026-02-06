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

// =========================
// Ethnic scales (UI-only -> behavior later)
// intervals: ルートからの半音オフセット（1オクターブ内）
// =========================

// =========================
// Ethnic scales (behavior-ready)
// intervals: ルートからの半音オフセット（1オクターブ内）
// =========================

const ETHNIC_SCALES = {
  // --- 和風 ---
  "yonanuki-major": {
    name: "🌸 ヨナ抜き（和メジャー / Yo）",
    intervals: [0, 2, 4, 7, 9], // 1 2 3 5 6
    hint: "ﾌｧ(4)とｼ(7)が抜ける：明るい和風 / 民謡っぽい",
    tendency: "メジャー寄り",
    character: "明るく素朴・日本的で親しみやすい",
    majorFeel: "民謡や和風ポップのような明るさ",
    minorFeel: "ロックやブルース寄りで力強い響き",
  },

  "in-scale": {
    name: "🌙 陰音階（In）",
    intervals: [0, 1, 5, 7, 8], // 1 ♭2 4 5 ♭6
    hint: "独特の哀愁：♭2 と ♭6 が効く（演歌・邦楽感）",
    tendency: "マイナー寄り",
    character: "哀愁・演歌的・切なさが強い",
    majorFeel: "不思議で暗めの緊張感ある響き",
    minorFeel: "強い哀愁と日本的情緒が出る",
  },

  "miyako-bushi": {
    name: "🎎 都節（Miyako-bushi）",
    intervals: [0, 1, 5, 7, 8], // 1 ♭2 4 5 ♭6（陰音階と同系）
    hint: "都節系：♭2 と ♭6 の哀愁。陰音階と近い（使い分けは雰囲気）",
    tendency: "マイナー寄り",
    character: "哀愁・静けさ・和風の情緒",
    majorFeel: "神秘的で浮遊感のある響き",
    minorFeel: "とても日本的で切ない雰囲気",
  },

  ryukyu: {
    name: "🗻 琉球（Ryukyu）",
    intervals: [0, 4, 5, 7, 11], // 1 3 4 5 7（代表例）
    hint: "南国っぽい明るさ：3 と 7 が立つ（琉球音階の代表的な形）",
    tendency: "メジャー寄り",
    character: "明るく開放的・南国風",
    majorFeel: "陽気で楽しい雰囲気になる",
    minorFeel: "少し幻想的で不思議な明るさになる",
  },

  // --- 世界 ---
  india: {
    name: "🕉 インド（Bhairav系）",
    intervals: [0, 1, 4, 5, 7, 8, 11], // 1 ♭2 3 4 5 ♭6 7
    hint: "♭2 と ♭6 が特徴：荘厳 / 緊張感（ラーガの入口）",
    tendency: "どっちでもない",
    character: "神秘的・緊張感・荘厳",
    majorFeel: "異国感の強い不思議な響き",
    minorFeel: "より緊張感と深みが増す",
  },

  celtic: {
    name: "🍀 ケルト（Dorian）",
    intervals: [0, 2, 3, 5, 7, 9, 10], // 1 2 ♭3 4 5 6 ♭7
    hint: "マイナー寄りで6が明るい：ケルト/フォーク定番",
    tendency: "マイナー寄り",
    character: "哀愁の中に明るさ・牧歌的",
    majorFeel: "少し切ない明るさになる",
    minorFeel: "フォーク調の哀愁が強くなる",
  },

  "middle-east": {
    name: "🕌 中東（Hijaz）",
    intervals: [0, 1, 4, 5, 7, 8, 10], // 1 ♭2 3 4 5 ♭6 ♭7
    hint: "♭2→3 の跳躍が独特：中東っぽい香り",
    tendency: "どっちでもない",
    character: "エキゾチック・強烈な個性",
    majorFeel: "中東音楽らしい独特の響き",
    minorFeel: "さらに妖しさと緊張感が増す",
  },

  africa: {
    name: "🪘 アフリカ（Pentatonic / 民族系）",
    intervals: [0, 2, 4, 7, 9], // メジャーペンタ（汎用）
    hint: "反復リズムと相性◎：シンプルな5音（打楽器と混ぜやすい）",
    tendency: "メジャー寄り",
    character: "シンプル・リズミカル・原始的",
    majorFeel: "明るくノリの良い響き",
    minorFeel: "土臭く力強い雰囲気になる",
  },

  // --- 現代 ---
  penta: {
    name: "🎵 ペンタ（Major Pentatonic）",
    intervals: [0, 2, 4, 7, 9],
    hint: "事故りにくい万能5音：ポップス/民族/アンビエント全部いける",
    tendency: "メジャー寄り",
    character: "安定・万能・きれい",
    majorFeel: "明るくポップで使いやすい",
    minorFeel: "ロックやブルースに合う響き",
  },

  blues: {
    name: "🎸 ブルース（Blues Scale）",
    intervals: [0, 3, 5, 6, 7, 10], // 1 ♭3 4 ♭5 5 ♭7
    hint: "ブルーノート(♭5)が渋い：泣き・泥臭さ・ロック感",
    tendency: "どっちでもない",
    character: "渋い・感情的・泥臭い",
    majorFeel: "明るさの中に渋さが出る",
    minorFeel: "泣きの表現が強くなる",
  },

  "whole-tone": {
    name: "🌈 全音（Whole Tone）",
    intervals: [0, 2, 4, 6, 8, 10], // 全部全音
    hint: "浮遊感MAX：半音が無いので解決しない不思議な響き",
    tendency: "どっちでもない",
    character: "浮遊感・夢の中のような響き",
    majorFeel: "ふわふわして不安定になる",
    minorFeel: "さらに幻想的になる",
  },

  diminished: {
    name: "😈 ディミ（Diminished / Octatonic）",
    // 代表例：Whole-Half（全→半の繰り返し）
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    hint: "緊張/不穏：対称的で転調っぽく動く（ジャズ/映画音楽）",
    tendency: "どっちでもない",
    character: "緊張・不安・不穏",
    majorFeel: "不思議な緊張感が生まれる",
    minorFeel: "より暗く不安定になる",
  },

  // --- 遊び ---
  random: {
    name: "🎰 ランダム（Random 5 notes）",
    // special: runtimeで差し替える
    intervals: "RANDOM5",
    hint: "毎回違う5音を生成（キーに対してランダムに許可音を作る）",
    tendency: "どっちでもない",
  },

  experiment: {
    name: "🧪 実験（Weird 6 notes）",
    intervals: "WEIRD6",
    hint: "ちょい不協和になりやすい6音を生成（遊び用）",
  },

  // --- 無効（通常） ---
  none: {
    name: "⏹ 通常（今のメジャー/マイナー）",
    intervals: null,
    hint: "民族スケールを解除して通常のスケールに戻す",
  },
};

let currentEthnicScaleId = "none";

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
 * Degree / Chord helpers
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
  drawTheoryWheelChordLines(noteNames);
  drawTheoryWheelChordPolygon(noteNames);
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
  updateTheoryWheelScaleHighlight();
  clearReferenceHold();
  drawTheoryWheelRootStars();
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

  // 民族スケールで禁止音なら鳴らさない（先に判定）
  if (!isAllowedActualMidi(actualMidi)) return;

  playActualMidi(actualMidi);

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
  setTheoryWheelCenterChordLabel(data.label);

  const wheelNotes = data.noteNames.map(normalizeLabelToSharp);
  drawTheoryWheelChordLines(wheelNotes);
  drawTheoryWheelChordPolygon(wheelNotes);

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

function setTheoryWheelCenterChordLabel(label) {
  const el = document.getElementById("centerChordText");
  if (!el) return;
  el.textContent = label || "";
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
  setupEthnicScaleControls();

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

/* =========================
 * ethnic scale
 * ========================= */

function ensureEthnicTooltip() {
  let el = document.getElementById("ethnicTooltip");
  if (el) return el;

  el = document.createElement("div");
  el.id = "ethnicTooltip";
  el.className = "ethnic-tooltip";
  document.body.appendChild(el);
  return el;
}

function setEthnicTooltipContent(scaleId) {
  const tt = ensureEthnicTooltip();
  const def = ETHNIC_SCALES[scaleId];
  if (!def) return;

  const { allowedNames, removedNames } = getAllowedAndRemovedNoteNames(scaleId);

  tt.innerHTML = `
    <div class="tt-title">${def.name}</div>
    <div class="tt-row">${def.hint || ""}</div>
    <div class="tt-row tt-muted">今のキー：${currentKeyName} / ${scaleMode}</div>
    <div class="tt-row">使える音：${allowedNames.join(" , ")}</div>
    <div class="tt-row">使わない音：${removedNames.join(" , ")}</div>
      <div>傾向：${def.tendency || "－"}</div>
      <div>性格：${def.character || "－"}</div>
      <div>メジャーでの雰囲気：${def.majorFeel || "－"}</div>
      <div>マイナーでの雰囲気：${def.minorFeel || "－"}</div>
    </div>
  `;
}

function showEthnicTooltipAt(x, y) {
  const tt = ensureEthnicTooltip();

  const pad = 14; // カーソルからの距離
  const margin = 10; // 画面端からの余白

  // まず一旦表示状態にしてサイズを測れるようにする
  tt.classList.add("is-show");
  tt.style.left = "0px";
  tt.style.top = "0px";

  // ここでDOM更新を確定させる（サイズ取得の安定化）
  // ※ requestAnimationFrame でも良いが、ここは同期でOKなケースが多い
  const rect = tt.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 基本は右下
  let left = x + pad;
  let top = y + pad;

  // 右にはみ出す → 左側へ
  if (left + rect.width + margin > vw) {
    left = x - pad - rect.width;
  }

  // 下にはみ出す → 上側へ
  if (top + rect.height + margin > vh) {
    top = y - pad - rect.height;
  }

  // それでもはみ出す場合に備えて、画面内へクランプ
  left = Math.max(margin, Math.min(left, vw - rect.width - margin));
  top = Math.max(margin, Math.min(top, vh - rect.height - margin));

  tt.style.left = `${left}px`;
  tt.style.top = `${top}px`;
}

function hideEthnicTooltip() {
  const tt = document.getElementById("ethnicTooltip");
  if (!tt) return;
  tt.classList.remove("is-show");
}

function getAllowedPcsForScaleId(scaleId) {
  // none は通常スケール（メジャー/マイナー）
  if (!scaleId || scaleId === "none") {
    return getScalePitchClasses(currentKeyName, scaleMode);
  }

  const def = ETHNIC_SCALES[scaleId];
  if (!def) return getScalePitchClasses(currentKeyName, scaleMode);

  const rootSharp = normalizeLabelToSharp(currentKeyName);
  const rootPc = NOTE_NAMES_SHARP.indexOf(rootSharp);
  if (rootPc < 0) return [];

  if (def.intervals === "RANDOM5" || def.intervals === "WEIRD6") {
    return buildRandomAllowedPcs(rootPc, def.intervals) || [];
  }

  if (!Array.isArray(def.intervals)) return [];
  return def.intervals.map((iv) => (rootPc + iv) % 12);
}

function getRestrictionPitchClasses() {
  // none の時は制限なし（= null）
  if (!currentEthnicScaleId || currentEthnicScaleId === "none") return null;

  // ethnic を優先した “許可 pitch class” を返す
  const pcs = getAllowedPcsForScaleId(currentEthnicScaleId);
  return pcs && pcs.length ? pcs : null;
}

function uniqueSample(arr, k) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

function buildRandomAllowedPcs(rootPc, modeKey) {
  // 12音から選ぶ（rootは必ず含める）
  const all = [...Array(12)].map((_, i) => i);
  const rest = all.filter((pc) => pc !== rootPc);

  if (modeKey === "RANDOM5") {
    const picked = uniqueSample(rest, 4);
    return [rootPc, ...picked].sort((a, b) => a - b);
  }

  if (modeKey === "WEIRD6") {
    // 不協和寄りになりやすい候補を少し混ぜる（♭2, tritone, ♭6 など）
    const spicy = [1, 6, 8, 10].map((iv) => (rootPc + iv) % 12);
    const base = uniqueSample(rest, 5);

    // root + (spicyから最低1個) + 残り
    const oneSpicy = spicy[Math.floor(Math.random() * spicy.length)];
    const merged = Array.from(new Set([rootPc, oneSpicy, ...base])).slice(0, 6);
    return merged.sort((a, b) => a - b);
  }

  return null;
}

function getAllowedAndRemovedNoteNames(scaleId) {
  const allowedPcs = getAllowedPcsForScaleId(scaleId);
  const allowedSet = new Set(allowedPcs);

  const allowedNames = allowedPcs.map((pc) => NOTE_NAMES_SHARP[pc]);

  const removedNames = NOTE_NAMES_SHARP.map((name, pc) => ({ name, pc }))
    .filter(({ pc }) => !allowedSet.has(pc))
    .map(({ name }) => name);

  return { allowedNames, removedNames };
}

function updatePianoDisabledKeys() {
  const pcs = getRestrictionPitchClasses();

  // 制限なし → すべて有効
  if (pcs == null) {
    document.querySelectorAll(".key").forEach((keyEl) => {
      keyEl.classList.remove("is-disabled");
    });
    return;
  }

  const allowedPcs = new Set(pcs);

  document.querySelectorAll(".key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);
    if (!Number.isFinite(baseMidi)) return;

    const actual = toActualMidi(baseMidi);
    let pc = actual % 12;
    if (pc < 0) pc += 12;

    keyEl.classList.toggle("is-disabled", !allowedPcs.has(pc));
  });
}

function isAllowedActualMidi(actualMidi) {
  const pcs = getRestrictionPitchClasses();
  if (pcs == null) return true;

  const allowedPcs = new Set(pcs);
  let pc = actualMidi % 12;
  if (pc < 0) pc += 12;
  return allowedPcs.has(pc);
}

/* =========================
 * Theory wheel SVG
 * ========================= */

// 極座標→デカルト座標変換
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// リング（ドーナツ状の扇形）パスを作る
function describeRingSegment(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const p1 = polarToCartesian(cx, cy, rOuter, startDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, endDeg);
  const p3 = polarToCartesian(cx, cy, rInner, endDeg);
  const p4 = polarToCartesian(cx, cy, rInner, startDeg);

  const largeArc = (endDeg - startDeg) % 360 > 180 ? 1 : 0;

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

function buildTheoryWheel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Aを12時に、時計回り
  const labels = [
    "A",
    "A#",
    "B",
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
  ];

  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 160;
  const rInner = 95;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

  // ===== SVG gradients (defs) =====
  const defs = document.createElementNS(svgNS, "defs");

  // コード線用グループ（毎回ここを描き直す）
  const chordLinesGroup = document.createElementNS(svgNS, "g");
  chordLinesGroup.setAttribute("id", "chordLines");
  svg.appendChild(chordLinesGroup);

  // コード面（多角形）用グループ
  const chordPolyGroup = document.createElementNS(svgNS, "g");
  chordPolyGroup.setAttribute("id", "chordPoly");
  svg.appendChild(chordPolyGroup);

  // 黒鍵っぽいグラデ
  const segBlack = document.createElementNS(svgNS, "radialGradient");
  segBlack.setAttribute("id", "segBlack");
  segBlack.setAttribute("cx", "20%");
  segBlack.setAttribute("cy", "0%");
  segBlack.setAttribute("r", "120%");

  const b1 = document.createElementNS(svgNS, "stop");
  b1.setAttribute("offset", "0%");
  b1.setAttribute("stop-color", "#374151");
  const b2 = document.createElementNS(svgNS, "stop");
  b2.setAttribute("offset", "100%");
  b2.setAttribute("stop-color", "#020617");

  segBlack.appendChild(b1);
  segBlack.appendChild(b2);

  // 白鍵っぽいグラデ
  const segWhite = document.createElementNS(svgNS, "linearGradient");
  segWhite.setAttribute("id", "segWhite");
  segWhite.setAttribute("x1", "0%");
  segWhite.setAttribute("y1", "0%");
  segWhite.setAttribute("x2", "0%");
  segWhite.setAttribute("y2", "100%");

  const w1 = document.createElementNS(svgNS, "stop");
  w1.setAttribute("offset", "0%");
  w1.setAttribute("stop-color", "#f9fafb");
  const w2 = document.createElementNS(svgNS, "stop");
  w2.setAttribute("offset", "100%");
  w2.setAttribute("stop-color", "#e5e7eb");

  segWhite.appendChild(w1);
  segWhite.appendChild(w2);

  defs.appendChild(segBlack);
  defs.appendChild(segWhite);
  svg.appendChild(defs);
  // ================================

  // 外周＆内周のリング（白い縁取り）
  const outerRing = document.createElementNS(svgNS, "circle");
  outerRing.setAttribute("cx", cx);
  outerRing.setAttribute("cy", cy);
  outerRing.setAttribute("r", rOuter);
  outerRing.setAttribute("class", "wheel-ring");
  svg.appendChild(outerRing);

  const innerRing = document.createElementNS(svgNS, "circle");
  innerRing.setAttribute("cx", cx);
  innerRing.setAttribute("cy", cy);
  innerRing.setAttribute("r", rInner);
  innerRing.setAttribute("class", "wheel-ring");
  svg.appendChild(innerRing);

  // ===== 中央：コード名表示 =====
  const centerGroup = document.createElementNS(svgNS, "g");
  centerGroup.setAttribute("id", "centerLabel");
  svg.appendChild(centerGroup);

  const centerText = document.createElementNS(svgNS, "text");
  centerText.setAttribute("id", "centerChordText");
  centerText.setAttribute("x", cx);
  centerText.setAttribute("y", cy);
  centerText.setAttribute("class", "wheel-center-text");
  centerText.textContent = ""; // 初期は空
  centerGroup.appendChild(centerText);

  // === ルートマーク用グループ ===
  const rootMarkGroup = document.createElementNS(svgNS, "g");
  rootMarkGroup.setAttribute("id", "rootMarks");
  svg.appendChild(rootMarkGroup);

  const segAngle = 360 / labels.length;

  // Aを12時に置くため、開始角を「-90度」(上方向) にする
  // 1セグメントの中心が-90度になるように、半分戻す
  const baseStart = -90 - segAngle / 2;

  labels.forEach((label, i) => {
    const start = baseStart + segAngle * i;
    const end = start + segAngle;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute(
      "d",
      describeRingSegment(cx, cy, rOuter, rInner, start, end),
    );
    path.setAttribute("class", "wheel-seg");
    path.dataset.note = label;
    svg.appendChild(path);

    // 文字位置：セグメントの中央角度、半径は内外の中間
    const mid = (start + end) / 2;
    const rText = (rOuter + rInner) / 2;
    const pText = polarToCartesian(cx, cy, rText, mid);

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", pText.x);
    text.setAttribute("y", pText.y);
    text.setAttribute("class", "wheel-text");
    text.textContent = label;
    svg.appendChild(text);

    // セグメントの内側中央点（線の起点・終点用）
    const innerPoint = polarToCartesian(cx, cy, rInner + 4, mid);

    // dataに保存
    path.dataset.cx = innerPoint.x;
    path.dataset.cy = innerPoint.y;
    path.dataset.angle = mid; // 中心角も保存（★配置用）
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

function clearTheoryWheelChordShape() {
  const g = document.querySelector("#theoryWheel #chordPoly");
  if (g) g.innerHTML = "";
}

function drawTheoryWheelChordPolygon(noteNames) {
  const svg = document.querySelector("#theoryWheel svg");
  const group = svg?.querySelector("#chordPoly");
  if (!group) return;

  clearTheoryWheelChordShape();

  // 構成音に該当するセグメント（＝座標持ち）を集める
  const segs = Array.from(
    document.querySelectorAll("#theoryWheel .wheel-seg"),
  ).filter((seg) => noteNames.includes(seg.dataset.note));

  // 2音以下は多角形にならない（線だけでOK）
  if (segs.length < 3) return;

  // viewBox から中心座標を取得（size=360前提でもいいけど、堅牢に）
  const vb = svg.viewBox.baseVal;
  const cx = vb.x + vb.width / 2;
  const cy = vb.y + vb.height / 2;

  // 座標を取り出し、中心に対する角度で並べ替え（交差防止）
  const pts = segs
    .map((seg) => {
      const x = Number(seg.dataset.cx);
      const y = Number(seg.dataset.cy);
      const angle = Math.atan2(y - cy, x - cx);
      return { x, y, angle };
    })
    .sort((a, b) => a.angle - b.angle);

  // polygon の points 形式へ
  const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(" ");

  const poly = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  poly.setAttribute("points", pointsAttr);

  // 見た目（木テーマに合う薄い面＋縁）
  poly.setAttribute("fill", "rgba(240,192,138,0.18)");
  poly.setAttribute("stroke", "rgba(240,192,138,0.85)");
  poly.setAttribute("stroke-width", "3");
  poly.setAttribute("stroke-linejoin", "round");

  // ちょい発光（任意）
  poly.setAttribute("filter", "drop-shadow(0 0 6px rgba(240,192,138,0.35))");

  group.appendChild(poly);
}

function clearTheoryWheelRootMarks() {
  const g = document.querySelector("#theoryWheel #rootMarks");
  if (g) g.innerHTML = "";
}

function drawTheoryWheelRootStars() {
  const svg = document.querySelector("#theoryWheel svg");
  if (!svg) return;

  const group = svg.querySelector("#rootMarks");
  if (!group) return;

  clearTheoryWheelRootMarks();

  // viewBox から中心
  const vb = svg.viewBox.baseVal;
  const cx = vb.x + vb.width / 2;
  const cy = vb.y + vb.height / 2;

  // 外側円より少し外に出す
  const rStar = 175; // rOuter=160なのでちょい外

  // 現在キー（#統一）
  const majorRoot = normalizeLabelToSharp(currentKeyName);

  // 相対マイナー：メジャーから -3 半音
  const majorPc = NOTE_NAMES_SHARP.indexOf(majorRoot);
  const minorPc = (majorPc + 9) % 12; // -3 mod12
  const minorRoot = NOTE_NAMES_SHARP[minorPc];

  document.querySelectorAll("#theoryWheel .wheel-seg").forEach((seg) => {
    const note = seg.dataset.note;

    let color = null;

    if (note === majorRoot) {
      color = "#f59e0b"; // オレンジ
    }
    if (note === minorRoot) {
      color = "#38bdf8"; // 水色
    }

    if (!color) return;

    const angle = Number(seg.dataset.angle);

    const p = polarToCartesian(cx, cy, rStar, angle);

    const star = document.createElementNS("http://www.w3.org/2000/svg", "text");

    star.setAttribute("x", p.x);
    star.setAttribute("y", p.y);
    star.textContent = "★";
    star.setAttribute("class", "wheel-root-star");
    star.setAttribute("fill", color);

    group.appendChild(star);
  });
}

function normalizeLabelToSharp(label) {
  // ドーナツは #表記で統一しているので、♭で来たら #に寄せる
  const flatToSharp = {
    "D♭": "C#",
    "E♭": "D#",
    "G♭": "F#",
    "A♭": "G#",
    "B♭": "A#",
  };
  return flatToSharp[label] || label;
}

function getScalePitchClasses(keyName, mode) {
  const keySharp = normalizeLabelToSharp(keyName);

  // NOTE_NAMES_SHARP は既にあなたのJSにある前提
  const rootPc = NOTE_NAMES_SHARP.indexOf(keySharp);
  if (rootPc < 0) return [];

  // メジャー/ナチュラルマイナー
  const intervals =
    mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];

  return intervals.map((iv) => (rootPc + iv) % 12);
}

// ドーナツ上のコード線をクリア
function clearTheoryWheelLines() {
  const g = document.querySelector("#theoryWheel #chordLines");
  if (g) g.innerHTML = "";
}

// ドーナツ上にコード線を描画
function drawTheoryWheelChordLines(noteNames) {
  const svg = document.querySelector("#theoryWheel svg");
  const group = svg?.querySelector("#chordLines");
  if (!group) return;

  clearTheoryWheelLines();

  const segs = Array.from(
    document.querySelectorAll("#theoryWheel .wheel-seg"),
  ).filter((seg) => noteNames.includes(seg.dataset.note));

  if (segs.length < 2) return;

  // 全組み合わせで線を引く
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];

      const x1 = Number(s1.dataset.cx);
      const y1 = Number(s1.dataset.cy);
      const x2 = Number(s2.dataset.cx);
      const y2 = Number(s2.dataset.cy);

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );

      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);

      line.setAttribute("stroke", "rgba(240,192,138,0.85)");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");

      // ほんのり発光（任意）
      line.setAttribute("filter", "drop-shadow(0 0 5px rgba(240,192,138,0.5))");

      group.appendChild(line);
    }
  }
}

// スケール構成音ハイライト更新
function updateTheoryWheelScaleHighlight() {
  // 表示の白鍵/黒鍵（今のメジャー/マイナー）は従来通り
  const basePcs = getScalePitchClasses(currentKeyName, scaleMode);
  const baseAllowed = new Set(basePcs.map((pc) => NOTE_NAMES_SHARP[pc]));

  // “薄くする”制限は民族スケール選択時だけ
  const restrictPcs = getRestrictionPitchClasses();
  const restrictAllowed =
    restrictPcs == null
      ? null
      : new Set(restrictPcs.map((pc) => NOTE_NAMES_SHARP[pc]));

  document.querySelectorAll("#theoryWheel .wheel-seg").forEach((seg) => {
    const note = seg.dataset.note;

    // 白鍵/黒鍵の見た目（メジャー/マイナー基準）
    const isScale = baseAllowed.has(note);
    seg.classList.toggle("is-scale", isScale);

    // 薄くする（民族スケールがある時だけ）
    const isDisabled = restrictAllowed ? !restrictAllowed.has(note) : false;
    seg.classList.toggle("is-disabled", isDisabled);

    const text = seg.nextSibling;
    if (text && text.classList) {
      text.classList.toggle("is-scale", isScale);
      text.classList.toggle("is-disabled", isDisabled);
    }
  });
}

function setupEthnicScaleControls() {
  const panel = document.querySelector(".ethnic-panel");
  if (!panel) return;

  const buttons = panel.querySelectorAll(".scale-btn");
  if (!buttons.length) return;

  function setActiveUI(targetBtn) {
    buttons.forEach((b) => b.classList.remove("is-active"));
    targetBtn.classList.add("is-active");
  }

  function applyAllScaleUIUpdates() {
    // ピアノ + ドーナツ + 既存のルート星なども必要なら
    updatePianoDisabledKeys();
    updateTheoryWheelScaleHighlight();

    // コード線/多角形は「最後に鳴らしたコード」があるなら引き直してもOK（任意）
    // ここは好み：今は触らなくてもOK
  }

  buttons.forEach((btn) => {
    const scaleId = btn.dataset.scale;
    if (!scaleId) return;

    // hover tooltip
    btn.addEventListener("mouseenter", (e) => {
      setEthnicTooltipContent(scaleId);
      showEthnicTooltipAt(e.clientX, e.clientY);
    });

    btn.addEventListener("mousemove", (e) => {
      showEthnicTooltipAt(e.clientX, e.clientY);
    });

    btn.addEventListener("mouseleave", () => {
      hideEthnicTooltip();
    });

    // click apply
    btn.addEventListener("click", (e) => {
      e.preventDefault();

      currentEthnicScaleId = scaleId;
      setActiveUI(btn);

      // ★ここで反映
      applyAllScaleUIUpdates();
    });
  });

  // 初期反映（noneなら通常スケール）
  applyAllScaleUIUpdates();
}

// DOM読み込み後に描画（Start前でもOKな「ただの図」なのでここで）
window.addEventListener("DOMContentLoaded", () => {
  buildTheoryWheel("theoryWheel");
  updateTheoryWheelScaleHighlight();
  drawTheoryWheelRootStars();
});
