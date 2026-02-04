const AudioContextFunc = window.AudioContext || window.webkitAudioContext;

let audioCtx;
let player;
let warmedUp = false;
let currentTone = _tone_0000_Aspirin_sf2_file; // 初期はピアノ
let noteDuration = 1.5; // 一音の長さ（秒）
let lastChordActualMidis = []; // 最後に選んだコードの構成音（実MIDI）
let isArpPlaying = false; // 連打防止
let bpm = 100; // 初期テンポ
const BPM_MIN = 30;
const BPM_MAX = 240;

// 画面上にある鍵盤の「C基準」の MIDI
const NOTE_LIST = [
  57,
  58,
  59, // A3, Bb3, B3
  60,
  61,
  62,
  63,
  64,
  65,
  66,
  67,
  68,
  69,
  70,
  71,
  72,
  73,
  74,
  75,
  76,
  77, // C5〜F5
];

// キーボード→鍵盤のマッピング

// メジャーモード時：ASDF JKL; → C4〜C5（ドレミファソラシド）
const KEY_TO_BASEMIDI_MAJOR = {
  a: 60, // C4 ド
  s: 62, // D4 レ
  d: 64, // E4 ミ
  f: 65, // F4 ﾌｧ
  j: 67, // G4 ソ
  k: 69, // A4 ラ
  l: 71, // B4 シ
  ";": 72, // C5 ド
};

// マイナーモード時：ASDF JKL; → A3〜A4（ラシドレミファソラ）
const KEY_TO_BASEMIDI_MINOR = {
  a: 57, // A3 ラ
  s: 59, // B3 シ
  d: 60, // C4 ド
  f: 62, // D4 レ
  j: 64, // E4 ミ
  k: 65, // F4 ﾌｧ
  l: 67, // G4 ソ
  ";": 69, // A4 ラ
};

// 黒鍵はモードに関係なく固定（クロマチック用）
const KEY_TO_BASEMIDI_BLACK = {
  w: 61, // C#4 / D♭4
  e: 63, // D#4 / E♭4
  t: 66, // F#4 / G♭4
  u: 66, // F#4 / G♭4（同じ音を別キーに）
  i: 68, // G#4 / A♭4
  o: 70, // A#4 / B♭4
};

const DEGREE_SEMITONES_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_SEMITONES_MINOR = [0, 2, 3, 5, 7, 8, 10];

// 表示用（メジャー）
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

// 表示用（マイナー）※ナチュラルマイナー想定
// i, ii°, III, iv, v, VI, VII
const DEGREE_TEXT_MINOR = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
// セブンス側
// i7, iiø7, IIImaj7, iv7, v7, VImaj7, VII7
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
  "maj7", // Ⅰ
  "min7", // Ⅱ
  "min7", // Ⅲ
  "maj7", // Ⅳ
  "dom7", // Ⅴ
  "min7", // Ⅵ
  "halfdim7", // Ⅶ
];
const DEGREE_7_QUALITIES_MINOR = [
  "min7", // Ⅰ (i7)
  "halfdim7", // Ⅱ (iiø7)
  "maj7", // Ⅲ (IIImaj7)
  "min7", // Ⅳ (iv7)
  "min7", // Ⅴ (v7)  ※ハーモニックならここをdom7に変える余地あり
  "maj7", // Ⅵ (VImaj7)
  "dom7", // Ⅶ (VII7)
];

const DEGREE_INDEX_MAP_MINOR = [5, 6, 0, 1, 2, 3, 4];

const QUALITY_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

// セブンスコード用のインターバル
const QUALITY_7_INTERVALS = {
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfdim7: [0, 3, 6, 10],
};

// 12半音ぶんの表記（#系 / ♭系）
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

// 現在のKey名から、#系か♭系かをざっくり決める
function shouldUseFlatNames(keyName) {
  // Keyボタンが D♭, E♭, G♭, A♭, B♭ のように♭を含むなら♭表記優先
  if (keyName.includes("♭")) return true;
  return false;
}

// MIDI番号 + transposeSemis から表示用の音名を取得
function getNoteNameFromMidi(baseMidi, transposeSemi, keyName) {
  let pitchClass = (baseMidi + transposeSemi) % 12;
  if (pitchClass < 0) pitchClass += 12;

  const useFlat = shouldUseFlatNames(keyName);
  const table = useFlat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;

  return table[pitchClass];
}
// MIDI → オクターブ番号（C4=60 → 4）
function midiToOctaveNumber(midi) {
  return Math.floor(midi / 12) - 1;
}

// 参照用ピアノ（固定表記）の「オクターブ数字だけ」を更新
function updateRefPianoOctaveNumbersOnly() {
  document.querySelectorAll(".ref-key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);
    const span = keyEl.querySelector("span");
    if (!span) return;

    // 初回だけ「固定表記テンプレ」を保存（例: "C4" / "A#3<br>B♭3"）
    if (!keyEl.dataset.fixedLabelHtml) {
      keyEl.dataset.fixedLabelHtml = span.innerHTML;
    }

    // 実際に鳴っているMIDI（移調 + オクターブ）
    const actualMidi = baseMidi + transposeSemis + octaveShift * 12;
    const octave = midiToOctaveNumber(actualMidi);

    // テンプレ内の数字部分だけを新オクターブに置換
    // 例: "C4" → "C5"
    // 例: "A#3<br>B♭3" → "A#4<br>B♭4"
    const template = keyEl.dataset.fixedLabelHtml;
    span.innerHTML = template.replace(/\d+/g, String(octave));
  });
}

// メジャー / マイナーに応じて、「キーボードで叩ける範囲」を変更してグレー付け
function updatePlayableRange() {
  document.querySelectorAll(".key").forEach((keyEl) => {
    const midi = Number(keyEl.dataset.midi);

    let inside = false;
    if (scaleMode === "major") {
      // メジャー：C4〜B4 を「内側」にする
      inside = midi >= 60 && midi <= 71;
    } else {
      // マイナー：A3〜A4 を「内側」にする（ラシドレミファソラ）
      // A3=57, B3=59, C4=60, D4=62, E4=64, F4=65, G4=67, A4=69
      inside = midi >= 57 && midi <= 69;
    }

    // inside じゃないところは outside-range でグレーアウト
    keyEl.classList.toggle("outside-range", !inside);
  });
}

// メジャー / マイナー切り替えボタンのセットアップ
function setupScaleModeButtons() {
  const majorBtn = document.getElementById("modeMajorBtn");
  const minorBtn = document.getElementById("modeMinorBtn");

  function setMode(mode) {
    scaleMode = mode;

    majorBtn.classList.toggle("active", mode === "major");
    minorBtn.classList.toggle("active", mode === "minor");

    // モードが変わったら transpose / ラベル / グレー範囲を全部更新
    applyKeyAndMode();
  }

  if (majorBtn) {
    majorBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setMode("major");
    });
  }

  if (minorBtn) {
    minorBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setMode("minor");
    });
  }

  // 初期状態はメジャー
  setMode("major");
}

// 鍵盤ボタンの「C」「D」などの表記を、現在のKeyと移調量に合わせて更新
function updateKeyLabelsForTranspose() {
  // currentKeyName（例: "C", "D♭"）と transposeSemis を使う
  document.querySelectorAll(".key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);
    const labelSpan = keyEl.querySelector(".key-label-note");
    if (!labelSpan) return;

    const name = getNoteNameFromMidi(baseMidi, transposeSemis, currentKeyName);
    labelSpan.textContent = name;
  });
}

// コードボタン下のコード名ラベルを更新
function updateChordNamesUnderButtons() {
  document.querySelectorAll(".chord-name").forEach((el) => {
    const degree = Number(el.dataset.degree);

    let rootOffset;
    let quality;

    if (scaleMode === "minor") {
      const majorIndex = DEGREE_INDEX_MAP_MINOR[degree];
      rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
      quality = DEGREE_QUALITIES_MINOR[degree];
    } else {
      rootOffset = DEGREE_SEMITONES_MAJOR[degree];
      quality = DEGREE_QUALITIES_MAJOR[degree];
    }

    const rootBaseMidi = BASE_C4 + rootOffset;
    const rootName = getNoteNameFromMidi(
      rootBaseMidi,
      transposeSemis,
      currentKeyName,
    );

    let suffix = "";
    if (quality === "min") suffix = "m";
    else if (quality === "dim") suffix = "dim";

    el.textContent = rootName + suffix;
  });
}

const BASE_C4 = 60; // C4
let octaveShift = 0; // Ctrl / : で変えるオクターブシフト
let transposeSemis = 0; // Keyボタンで変える移調量（半音）
let currentKeyName = "C"; // 今選択中のKey（ラベル表示用）

let scaleMode = "major"; // "major" / "minor"
let currentKeySemi = 0; // Keyボタンの半音値（0=C, 1=D♭,...）

// コードボタンのテキストをモードに応じて更新
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

// モードに応じて、実際に使う transposeSemis を決める
function computeTransposeSemis(keySemi) {
  if (scaleMode === "minor") {
    // マイナーのときは「相対調のメジャー」にする → +3半音
    // 例: Aマイナー(9) → Cメジャー(0)
    return (keySemi + 3) % 12;
  } else {
    // メジャーのときはそのまま
    return keySemi;
  }
}

// Keyとモードが変わったときにまとめて反映する
function applyKeyAndMode() {
  transposeSemis = computeTransposeSemis(currentKeySemi);
  updateTriadChordNamesUnderButtons();
  updateChordNamesUnderButtons();
  updateSeventhChordNamesUnderButtons();
  updateDegreeButtonTexts();
  updateKeyLabelsForTranspose();
  updatePlayableRange();
  updateRefPianoOctaveNumbersOnly();
  clearReferenceHold();
  console.log(
    "Transpose semis:",
    transposeSemis,
    "Key:",
    currentKeyName,
    "Mode:",
    scaleMode,
  );
}

// セブンスコードのサフィックス取得
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

// セブンスコードボタン下のコード名ラベルを更新
function updateSeventhChordNamesUnderButtons() {
  document.querySelectorAll(".chord-name-7").forEach((el) => {
    const degree = Number(el.dataset.degree);

    let rootOffset;
    let quality7;

    if (scaleMode === "minor") {
      const majorIndex = DEGREE_INDEX_MAP_MINOR[degree];
      rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
      quality7 = DEGREE_7_QUALITIES_MINOR[degree];
    } else {
      rootOffset = DEGREE_SEMITONES_MAJOR[degree];
      quality7 = DEGREE_7_QUALITIES_MAJOR[degree];
    }

    const rootBaseMidi = BASE_C4 + rootOffset;
    const rootName = getNoteNameFromMidi(
      rootBaseMidi,
      transposeSemis,
      currentKeyName,
    );

    el.textContent = rootName + suffixFor7(quality7);
  });
}

function updateTriadChordNamesUnderButtons() {
  document.querySelectorAll(".chord-name-triad").forEach((el) => {
    const degree = Number(el.dataset.degree);

    let rootOffset;
    let quality;

    if (scaleMode === "minor") {
      const majorIndex = DEGREE_INDEX_MAP_MINOR[degree];
      rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
      quality = DEGREE_QUALITIES_MINOR[degree];
    } else {
      rootOffset = DEGREE_SEMITONES_MAJOR[degree];
      quality = DEGREE_QUALITIES_MAJOR[degree];
    }

    const rootBaseMidi = BASE_C4 + rootOffset;
    const rootName = getNoteNameFromMidi(
      rootBaseMidi,
      transposeSemis,
      currentKeyName,
    );

    let suffix = "";
    if (quality === "min") suffix = "m";
    else if (quality === "dim") suffix = "dim";

    el.textContent = rootName + suffix;
  });
}

function updateLastChordPanel(chordLabel, noteNames) {
  const labelEl = document.getElementById("lastChordLabel");
  const notesWrap = document.getElementById("lastChordNotes");
  if (!labelEl || !notesWrap) return;

  labelEl.textContent = chordLabel || "（未選択）";

  // 既存をクリア
  notesWrap.innerHTML = "";

  // 1音ずつチップ化
  noteNames.forEach((name) => {
    const span = document.createElement("span");
    span.className = "note-chip";
    span.textContent = name;
    notesWrap.appendChild(span);
  });
}

// すでに押しているキー（押しっぱなしで連打しないように）
const pressedKeySet = new Set();

// オクターブ変更共通処理
function changeOctave(delta) {
  const newVal = Math.max(-2, Math.min(2, octaveShift + delta)); // -2〜+2 に制限
  if (newVal === octaveShift) return;
  octaveShift = newVal;
  console.log("Octave:", octaveShift);
  updateOctaveLabel();
  updateRefPianoOctaveNumbersOnly();
}

// オクターブ表示ラベル更新
function updateOctaveLabel() {
  const el = document.getElementById("octaveStatus");
  if (el) {
    let text = "オクターブシフト：";
    if (octaveShift === 0) {
      text += "0（基準）";
    } else if (octaveShift > 0) {
      text += `+${octaveShift}`;
    } else {
      text += `${octaveShift}`;
    }
    el.textContent = text;
  }
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContextFunc();
    player = new WebAudioFontPlayer();
    console.log("AudioContext & WebAudioFontPlayer 初期化");
  }
}

// すべての音を「ほぼ聞こえない音量」で一瞬鳴らしてウォームアップ
function warmupNotes() {
  if (!audioCtx || !player || warmedUp) return;

  const now = audioCtx.currentTime;
  const duration = 0.01;
  const volume = 0.0001;

  NOTE_LIST.forEach((baseMidi) => {
    player.queueWaveTable(
      audioCtx,
      audioCtx.destination,
      currentTone,
      now,
      baseMidi,
      duration,
      volume,
    );
  });

  warmedUp = true;
  console.log("ウォームアップ完了");
}

// baseMidi: C基準のMIDI（例: C4=60, C#4=61,...）
function playNote(baseMidi) {
  initAudio();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const duration = noteDuration;
  const volume = 0.5;

  // 実際に鳴らすピッチ = base + 移調 + オクターブシフト
  const actualMidi = baseMidi + transposeSemis + octaveShift * 12;
  flashReferenceKey(actualMidi);

  player.queueWaveTable(
    audioCtx,
    audioCtx.destination,
    currentTone,
    now,
    actualMidi,
    duration,
    volume,
  );

  // 画面上に対応する鍵盤を「baseMidi」で光らせる（見た目はC鍵盤のまま）
  const keyEl = document.querySelector(`.key[data-midi="${baseMidi}"]`);
  if (keyEl) {
    keyEl.classList.add("active");
    setTimeout(() => keyEl.classList.remove("active"), 150);
  }
}

function playActualMidi(actualMidi) {
  initAudio();

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const duration = noteDuration; // 既存スライダーの値を使う
  const volume = 0.5;

  flashReferenceKey(actualMidi);

  player.queueWaveTable(
    audioCtx,
    audioCtx.destination,
    currentTone,
    now,
    actualMidi,
    duration,
    volume,
  );
}

// baseMidi に対して、transposeSemis と octaveShift を加えた実際のMIDIを返す
function toActualMidi(baseMidi) {
  return baseMidi + transposeSemis + octaveShift * 12;
}

// 度数（0〜6）からコード（三和音）を鳴らす
function playChordByDegree(degreeIndex) {
  let rootOffset;
  let quality;

  if (scaleMode === "minor") {
    const majorIndex = DEGREE_INDEX_MAP_MINOR[degreeIndex];
    rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
    quality = DEGREE_QUALITIES_MINOR[degreeIndex];
  } else {
    rootOffset = DEGREE_SEMITONES_MAJOR[degreeIndex];
    quality = DEGREE_QUALITIES_MAJOR[degreeIndex];
  }

  const intervals = QUALITY_INTERVALS[quality] || QUALITY_INTERVALS.maj;
  const rootBaseMidi = BASE_C4 + rootOffset;

  // ① 構成音（base）を作る
  const baseMidis = intervals.map((iv) => rootBaseMidi + iv);

  // ★左パネル表示（構成音）更新：表示は移調後の音名（C/E/Gなど）
  const noteNames = baseMidis.map((m) =>
    getNoteNameFromMidi(m, transposeSemis, currentKeyName),
  );

  // コード名ラベル（中央の表示と揃えるため degreeIndex から作る）
  const rootName = getNoteNameFromMidi(
    rootBaseMidi,
    transposeSemis,
    currentKeyName,
  );
  let suffix = "";
  if (quality === "min") suffix = "m";
  else if (quality === "dim") suffix = "dim";

  updateLastChordPanel(`${rootName}${suffix}`, noteNames);

  // ② 実際の音程（actual）に変換して “保持点灯”
  const actualMidis = baseMidis.map(toActualMidi);
  lastChordActualMidis = actualMidis.slice();
  const arpBtn = document.getElementById("arpPlayBtn");
  if (arpBtn) arpBtn.disabled = false;
  setReferenceHold(actualMidis);

  // ③ 音を鳴らす（既存の playNote を利用）
  baseMidis.forEach((m) => playNote(m));
}

// 度数（0〜6）からセブンスコードを鳴らす
function playSeventhChordByDegree(degreeIndex) {
  let rootOffset;
  let quality7;

  if (scaleMode === "minor") {
    const majorIndex = DEGREE_INDEX_MAP_MINOR[degreeIndex];
    rootOffset = DEGREE_SEMITONES_MAJOR[majorIndex];
    quality7 = DEGREE_7_QUALITIES_MINOR[degreeIndex];
  } else {
    rootOffset = DEGREE_SEMITONES_MAJOR[degreeIndex];
    quality7 = DEGREE_7_QUALITIES_MAJOR[degreeIndex];
  }

  const intervals = QUALITY_7_INTERVALS[quality7] || QUALITY_7_INTERVALS.maj7;
  const rootBaseMidi = BASE_C4 + rootOffset;

  const baseMidis = intervals.map((iv) => rootBaseMidi + iv);

  // ★左パネル表示（構成音）更新
  const noteNames = baseMidis.map((m) =>
    getNoteNameFromMidi(m, transposeSemis, currentKeyName),
  );

  const rootName = getNoteNameFromMidi(
    rootBaseMidi,
    transposeSemis,
    currentKeyName,
  );
  updateLastChordPanel(`${rootName}${suffixFor7(quality7)}`, noteNames);

  const actualMidis = baseMidis.map(toActualMidi);
  lastChordActualMidis = actualMidis.slice();
  const arpBtn = document.getElementById("arpPlayBtn");
  if (arpBtn) arpBtn.disabled = false;
  setReferenceHold(actualMidis);

  baseMidis.forEach((m) => playNote(m));
}

// 白鍵・黒鍵すべてにマウス / タッチイベント設定
function attachKeyEvents() {
  document.querySelectorAll(".key").forEach((keyEl) => {
    const baseMidi = Number(keyEl.dataset.midi);

    const startPlay = (e) => {
      e.preventDefault();
      keyEl.classList.add("active");
      playNote(baseMidi);
    };

    const stopPlay = () => {
      keyEl.classList.remove("active");
    };

    keyEl.addEventListener("mousedown", startPlay);
    keyEl.addEventListener("mouseup", stopPlay);
    keyEl.addEventListener("mouseleave", stopPlay);

    keyEl.addEventListener("touchstart", startPlay, { passive: false });
    keyEl.addEventListener("touchend", stopPlay);
    keyEl.addEventListener("touchcancel", stopPlay);
  });
}

// 最初のユーザー操作で AudioContext を resume & 全音ウォームアップ
function setupFirstInteractionWarmup() {
  const handler = async () => {
    initAudio();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    warmupNotes();

    window.removeEventListener("pointerdown", handler);
  };

  window.addEventListener("pointerdown", handler);
}

// キーボード操作の設定
function setupKeyboardControl() {
  window.addEventListener("keydown", (e) => {
    const key = e.key;

    // Ctrl でオクターブ下げ
    if (key === "Control") {
      if (!pressedKeySet.has("Control")) {
        changeOctave(-1);
        console.log("Octave:", octaveShift);
        pressedKeySet.add("Control");
      }
      return;
    }

    // : でオクターブ上げ（Shift + ;）
    if (key === ":") {
      e.preventDefault();
      if (!pressedKeySet.has(":")) {
        changeOctave(1);
        console.log("Octave:", octaveShift);
        pressedKeySet.add(":");
      }
      return;
    }

    const lower = key.toLowerCase();
    const lookupKey = key === ";" ? ";" : lower;

    // すでに押しているキーならスキップ（連打防止）
    if (pressedKeySet.has(lookupKey)) {
      return;
    }

    let baseMidi = null;

    // 黒鍵はモード共通
    if (lookupKey in KEY_TO_BASEMIDI_BLACK) {
      baseMidi = KEY_TO_BASEMIDI_BLACK[lookupKey];
    } else {
      // 白鍵はモードでマッピングを変える
      if (scaleMode === "minor") {
        if (lookupKey in KEY_TO_BASEMIDI_MINOR) {
          baseMidi = KEY_TO_BASEMIDI_MINOR[lookupKey];
        }
      } else {
        if (lookupKey in KEY_TO_BASEMIDI_MAJOR) {
          baseMidi = KEY_TO_BASEMIDI_MAJOR[lookupKey];
        }
      }
    }

    if (baseMidi == null) {
      // 対象外のキー（g,h 等）は何もしない
      return;
    }

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

// ピアノ端クリックでオクターブ変更
function setupOctaveEdgeClick() {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.addEventListener(
    "pointerdown",
    (e) => {
      // クリック位置を .piano 内の割合で判定
      const rect = piano.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;

      // 左右5%のみ反応
      if (ratio <= 0.05) {
        // 端クリックは鍵盤の「発音」までいかないようにしたいなら preventDefault
        e.preventDefault();
        changeOctave(-1);
        return;
      }
      if (ratio >= 0.95) {
        e.preventDefault();
        changeOctave(+1);
        return;
      }

      // 中央は何もしない（鍵盤ボタン側が通常通り処理）
    },
    { passive: false },
  );
}

// 移調ボタンのセットアップ
function setupTransposeButtons() {
  const buttons = document.querySelectorAll(".tbtn");

  function updateActiveButton(semi) {
    buttons.forEach((btn) => {
      const v = Number(btn.dataset.trans);
      const isActive = v === semi;
      btn.classList.toggle("active", isActive);
      if (isActive) {
        currentKeyName = btn.textContent.trim();
      }
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

  // 初期値: C (0)
  currentKeySemi = 0;
  updateActiveButton(0);
  applyKeyAndMode();
}

// コードボタンのセットアップ
function setupChordButtons() {
  document.querySelectorAll(".chord-btn").forEach((btn) => {
    const degree = Number(btn.dataset.degree);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      playChordByDegree(degree);
    });
  });
}

// セブンスコードボタンのセットアップ
function setupSeventhChordButtons() {
  document.querySelectorAll(".chord7-btn").forEach((btn) => {
    const degree = Number(btn.dataset.degree);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      playSeventhChordByDegree(degree);
    });
  });
}

function setupArpButton() {
  const btn = document.getElementById("arpPlayBtn");
  if (!btn) return;

  function updateEnabled() {
    btn.disabled =
      !(lastChordActualMidis && lastChordActualMidis.length > 0) ||
      isArpPlaying;
  }

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (isArpPlaying) return;
    if (!lastChordActualMidis || lastChordActualMidis.length === 0) return;

    isArpPlaying = true;
    updateEnabled();

    // 0.5秒間隔で順番に鳴らす
    const intervalMs = Math.round((60 / bpm) * 1000); // 4分音符間隔

    const seq = lastChordActualMidis.slice();

    seq.forEach((midi, i) => {
      setTimeout(() => {
        playActualMidi(midi);
      }, i * intervalMs);
    });

    // 再生終わったら解除（最後の音が鳴り始めてから少し待つ）
    const totalMs = (seq.length - 1) * intervalMs + 30;
    setTimeout(() => {
      isArpPlaying = false;
      updateEnabled();
    }, totalMs);
  });

  // 初期状態
  updateEnabled();

  // 外から更新したい時用に関数を返す…は不要なので、ここはこれでOK
}

// 参照用ピアノ鍵盤を一瞬光らせる
function flashReferenceKey(actualMidi) {
  const el = document.querySelector(`.ref-key[data-midi="${actualMidi}"]`);
  if (!el) return;
  el.classList.add("ref-active");
  setTimeout(() => el.classList.remove("ref-active"), 180);
}

// 参照用ピアノの保持表示をクリア
function clearReferenceHold() {
  document.querySelectorAll(".ref-key.ref-held").forEach((el) => {
    el.classList.remove("ref-held");
  });
}

function setReferenceHold(actualMidis) {
  // 前回の保持を消す
  clearReferenceHold();

  // 重複を除外してから保持点灯
  const unique = Array.from(new Set(actualMidis));
  unique.forEach((midi) => {
    const el = document.querySelector(`.ref-key[data-midi="${midi}"]`);
    if (el) el.classList.add("ref-held");
  });
}

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

      // 見た目：active 切替
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}

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

  // 初期反映
  apply(slider.value);

  // 入力で随時更新
  slider.addEventListener("input", () => apply(slider.value));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function setBpm(newBpm) {
  bpm = clamp(Math.round(newBpm), BPM_MIN, BPM_MAX);

  const inputEl = document.getElementById("bpmValue");
  if (inputEl) {
    inputEl.value = String(bpm);
  }
}

function setupTempoControl() {
  const downBtn = document.getElementById("bpmDownBtn");
  const upBtn = document.getElementById("bpmUpBtn");
  const display = document.getElementById("bpmDisplay");
  const input = document.getElementById("bpmValue");

  setBpm(bpm);

  // 矢印
  if (downBtn)
    downBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setBpm(bpm - 1);
    });

  if (upBtn)
    upBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setBpm(bpm + 1);
    });

  // 直接入力：changeで反映
  if (input) {
    input.addEventListener("change", () => {
      setBpm(Number(input.value));
    });

    // Enterで確定したい場合（任意）
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });

    // ★重要：クリックしたら確実にフォーカス
    input.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); // display側に伝播させない（ドラッグ開始を防ぐ）
    });
  }

  // ドラッグ操作（displayで行う）
  // ドラッグ操作（縦方向でBPM増減）
  if (display) {
    let startY = 0;
    let startBpm = 100;
    let dragging = false;
    let pointerId = null;

    // 感度：5px動いたら1BPM変更（好みで調整OK）
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
        // 上にドラッグでBPM↑、下にドラッグでBPM↓（符号を反転）
        const delta = -dy / PX_PER_BPM;
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

// ページ読み込み時にセットアップ
window.addEventListener("DOMContentLoaded", () => {
  initAudio();
  attachKeyEvents();
  setupFirstInteractionWarmup();
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
});
