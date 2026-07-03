import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { saveSettings, getSettings } from './services/StorageService';
import { saveRecording, getAllRecordings } from './services/RecordingService';

// Constants
const DELAY_PRESETS = [0, 1, 5, 10, 15, 30, 45, 60];
const DURATION_PRESETS = [1, 5, 10, 30, 45, 60, 90, 120];
const AUDIO_OPTIONS = [
  { id: 'affirmation-female', name: 'アファメーション(女性)', file: 'affirmation.mp3' },
  { id: 'affirmation-male', name: 'アファメーション(男性)', file: 'affirmation-male.mp3' },
  { id: 'binaural-beats', name: 'バイノーラルビート', file: 'binaural-beats.mp3' }
];
const DEFAULT_AUDIO_ID = 'affirmation-female';

// 録音形式: ブラウザが対応するものを優先順に選ぶ（iOS Safari は webm 非対応で mp4 になる）
const RECORDING_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

// App States
const APP_STATE = {
  IDLE: 'IDLE',
  DELAY: 'DELAY',
  PLAYING: 'PLAYING'
};

function App() {
  // --- States ---
  const [appState, setAppState] = useState(APP_STATE.IDLE);
  const [delayMins, setDelayMins] = useState(30);
  const [playDurationMins, setPlayDurationMins] = useState(5);
  const [selectedAudioId, setSelectedAudioId] = useState(DEFAULT_AUDIO_ID);
  const [volume, setVolume] = useState(0.5);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [customAudioUrl, setCustomAudioUrl] = useState(null);

  // --- Refs ---
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const onCountdownEndRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const wakeLockRef = useRef(null);
  const appStateRef = useRef(APP_STATE.IDLE);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // --- Initialization ---
  useEffect(() => {
    const saved = getSettings();
    const savedAudioId = saved?.selectedAudioId ?? DEFAULT_AUDIO_ID;
    if (saved) {
      setDelayMins(saved.delayMins ?? 30);
      setPlayDurationMins(saved.playDurationMins ?? 5);
      setVolume(saved.volume ?? 0.5);
      // 「自分の録音」は録音データの存在確認が済むまで復元しない
      if (savedAudioId !== 'my-recording') setSelectedAudioId(savedAudioId);
    }
    loadLatestRecording().then((hasRecording) => {
      if (hasRecording && savedAudioId === 'my-recording') {
        setSelectedAudioId('my-recording');
      }
    });

    // タブ復帰時: Wake Lock は画面消灯で失効するため再取得し、残り時間を即時再計算する
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (appStateRef.current !== APP_STATE.IDLE) {
        requestWakeLock();
        syncCountdown();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLatestRecording = async (autoSelect = false) => {
    try {
      const recs = await getAllRecordings();
      if (recs.length > 0) {
        const latest = recs[recs.length - 1];
        const url = URL.createObjectURL(latest.blob);
        setCustomAudioUrl(url);
        if (autoSelect) setSelectedAudioId('my-recording');
        return true;
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
    return false;
  };

  // --- Wake Lock ---
  const requestWakeLock = () => {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen')
      .then((sentinel) => { wakeLockRef.current = sentinel; })
      .catch(() => { });
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => { });
      wakeLockRef.current = null;
    }
  };

  // --- Countdown (実時刻ベース: バックグラウンドでタイマーが間引かれてもズレない) ---
  const startCountdown = (seconds, onEnd) => {
    if (timerRef.current) clearInterval(timerRef.current);
    endTimeRef.current = Date.now() + seconds * 1000;
    onCountdownEndRef.current = onEnd;
    setTimeLeft(seconds);
    timerRef.current = setInterval(syncCountdown, 1000);
  };

  const syncCountdown = () => {
    if (endTimeRef.current === null) return;
    const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setTimeLeft(remaining);
    if (remaining <= 0) {
      clearInterval(timerRef.current);
      endTimeRef.current = null;
      const onEnd = onCountdownEndRef.current;
      onCountdownEndRef.current = null;
      if (onEnd) onEnd();
    }
  };

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    endTimeRef.current = null;
    onCountdownEndRef.current = null;
    releaseWakeLock();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
  };

  // --- Audio Logic ---
  const getAudioPath = () => {
    const preset = AUDIO_OPTIONS.find(a => a.id === selectedAudioId);
    if (preset) return `${process.env.PUBLIC_URL}/audio/${preset.file}`;
    if (selectedAudioId === 'my-recording' && customAudioUrl) return customAudioUrl;
    return null;
  };

  const startProgram = () => {
    if (appState !== APP_STATE.IDLE) return;

    // --- 1. Single Instance Strategy & Branching Logic (Fix Race Condition) ---
    const finalPath = getAudioPath();
    console.log("Attempting to load audio from:", finalPath);

    if (!finalPath) {
      alert('再生する音声が見つかりません。音声を選び直してください。');
      setSelectedAudioId(DEFAULT_AUDIO_ID);
      return;
    }

    const audio = new Audio(finalPath);
    audio.playsInline = true;
    // 再生時間が音声の長さより長い場合はリピート再生する
    audio.loop = true;
    audioRef.current = audio;

    saveSettings({ delayMins, playDurationMins, selectedAudioId, volume });

    if (delayMins === 0) {
      // --- Case A: Immediate Start ---
      console.log("[Audio] Immediate Start: No unlock/pause cycle needed.");
      audio.volume = volume;

      setAppState(APP_STATE.PLAYING);
      requestWakeLock();

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log("Immediate playback started successfully."))
          .catch(error => {
            console.error("Immediate playback FAILED:", error);
            console.error("Target Source:", audio.src);
          });
      }

      startCountdown(playDurationMins * 60, handleProgramEnd);

    } else {
      // --- Case B: Delayed Start ---
      console.log("[Audio] Delayed Start: Unlocking audio via Play -> Pause.");
      audio.volume = 0;

      const unlockPromise = audio.play();
      if (unlockPromise !== undefined) {
        unlockPromise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = volume; // Restore for later
            console.log(`[Audio] Unlocked and Volume pre-set to: ${volume}`);
          })
          .catch(error => {
            console.error("Audio unlock FAILED (Unlock phase):", error);
            console.error("Target Source:", audio.src);
          });
      }

      setAppState(APP_STATE.DELAY);
      // 遅延中も画面ロックでタイマーが止まらないよう Wake Lock を取得する
      requestWakeLock();
      console.log("Timer Started (Delay):", delayMins * 60);
      startCountdown(delayMins * 60, enterPlayingState);
    }
  };

  const enterPlayingState = () => {
    setAppState(APP_STATE.PLAYING);
    console.log("State Transition: PLAYING. Duration:", playDurationMins * 60);

    // Reuse the same instance (Constraint #1)
    if (audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio playing successfully.");
          })
          .catch(error => {
            console.error("Audio playback FAILED (Final phase):", error);
            console.error("Target Source:", audioRef.current.src);
          });
      }
    }

    requestWakeLock();
    startCountdown(playDurationMins * 60, handleProgramEnd);
  };

  const handleProgramEnd = () => {
    stopAll();
    setAppState(APP_STATE.IDLE);
    console.log("Program Finished");
  };

  const stopProgram = () => {
    stopAll();
    setAppState(APP_STATE.IDLE);
    console.log("Program Stopped by User");
  };

  // --- 録音開始 (Fix: Use useRef for chunks) ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // 重要：開始前に必ず以前のデータを空にする
      audioChunksRef.current = [];

      const supportedType = (window.MediaRecorder && MediaRecorder.isTypeSupported)
        ? RECORDING_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t))
        : undefined;
      const mediaRecorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // データが入るたびにRefの配列にpushする
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 停止時の処理
      mediaRecorder.onstop = () => {
        // 実際に録音された形式で Blob を作る（iOS では audio/mp4 になる）
        const blobType = mediaRecorder.mimeType || supportedType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        console.log("🟡 Recording STOPPED. Final Blob size:", audioBlob.size);

        if (audioBlob.size === 0) {
          console.error("Critical Error: Recorded Blob is empty!");
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        setCustomAudioUrl(audioUrl); // Stateに保存
        setSelectedAudioId('my-recording'); // 「自分の録音」を選択済みにする

        // マイク解放
        stream.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;

        // Save to IndexedDB (as a backup/optional)
        saveRecording(audioBlob, `録音 ${new Date().toLocaleTimeString()}`);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log("🔴 Recording STARTED...");

    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("マイクへのアクセスが拒否されました。設定を確認してください。");
    }
  };

  // --- 録音停止 ---
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    if (isRecording) return "録音中...";
    switch (appState) {
      case APP_STATE.DELAY: return "開始まであと...";
      case APP_STATE.PLAYING: return "再生中（残り時間）";
      case APP_STATE.IDLE:
      default: return "待機中";
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>明晰夢誘導アプリ</h1>
      </header>

      {/* 1. Delay Settings */}
      <div className="section">
        <div className="section-title">⏱️ 開始までの遅延</div>
        <div className="button-grid">
          {DELAY_PRESETS.map(m => (
            <button
              key={m}
              className={`btn-preset ${delayMins === m ? 'active' : ''}`}
              onClick={() => appState === APP_STATE.IDLE && setDelayMins(m)}
              disabled={appState !== APP_STATE.IDLE}
            >
              {m === 0 ? '即時' : `${m}分`}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Audio Selection */}
      <div className="section">
        <div className="section-title">🔊 音声の選択</div>
        <div className="audio-list">
          {AUDIO_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`btn-audio ${selectedAudioId === opt.id ? 'active' : ''}`}
              onClick={() => appState === APP_STATE.IDLE && setSelectedAudioId(opt.id)}
              disabled={appState !== APP_STATE.IDLE}
            >
              <div>{opt.name}</div>
              <span>MP3</span>
            </button>
          ))}
          <button
            className={`btn-audio ${selectedAudioId === 'my-recording' ? 'active' : ''}`}
            onClick={() => appState === APP_STATE.IDLE && setSelectedAudioId('my-recording')}
            disabled={appState !== APP_STATE.IDLE || !customAudioUrl}
          >
            <div>自分の録音 {!customAudioUrl && '(未録音)'}</div>
            <span>Custom</span>
          </button>
        </div>
        <div className="recorder-box" style={{ marginTop: '12px' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
            {isRecording ? '録音を停止して保存してください' : 'アファメーションを録音可能'}
          </span>
          <button
            className={`btn-record ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            <div className={`recording-dot ${isRecording ? 'active' : ''}`}></div>
            {isRecording ? '■ 録音を停止して保存' : '● 録音する'}
          </button>
        </div>
      </div>

      {/* 3. Duration Settings */}
      <div className="section">
        <div className="section-title">🕒 再生時間</div>
        <div className="button-grid">
          {DURATION_PRESETS.map(m => (
            <button
              key={m}
              className={`btn-preset ${playDurationMins === m ? 'active' : ''}`}
              onClick={() => appState === APP_STATE.IDLE && setPlayDurationMins(m)}
              disabled={appState !== APP_STATE.IDLE}
            >
              {m}分
            </button>
          ))}
        </div>
      </div>

      {/* 4. Volume Control */}
      <div className="section">
        <div className="section-title">🎚️ 音量 ({Math.round(volume * 100)}%)</div>
        <div className="volume-control">
          <span>🔈</span>
          <input
            type="range" min="0" max="1" step="0.01"
            value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
          <span>🔊</span>
        </div>
      </div>

      {/* 5. Main Action Area */}
      <div className="section timer-card" style={{ border: '2px solid var(--primary-color)' }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>
          {getStatusText()}
        </div>
        <div className="time-display">
          {appState === APP_STATE.IDLE ? `${delayMins}:00` : formatTime(timeLeft)}
        </div>
        {appState !== APP_STATE.IDLE ? (
          <button className="main-btn btn-stop" onClick={stopProgram}>誘導を停止する</button>
        ) : (
          <button className="main-btn btn-start" onClick={startProgram} disabled={isRecording}>誘導を開始する</button>
        )}
        {appState !== APP_STATE.IDLE && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
            ブラウザの制限により、画面を消すと動作が止まる場合があります。画面は点けたままにしてください。
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
