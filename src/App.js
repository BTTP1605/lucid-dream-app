import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { saveSettings, getSettings } from './services/StorageService';
import { saveRecording, getAllRecordings } from './services/RecordingService';

// Constants
// 270〜360分は、入眠から4.5〜6時間後の二度寝(WBTB)を狙うための選択肢
const DELAY_PRESETS = [0, 1, 5, 10, 15, 30, 45, 60, 270, 300, 330, 360];
const DURATION_PRESETS = [1, 5, 10, 30, 45, 60, 90, 120];
const AUDIO_OPTIONS = [
  { id: 'affirmation-female', name: 'アファメーション(女性)', file: 'affirmation.mp3' },
  { id: 'affirmation-male', name: 'アファメーション(男性)', file: 'affirmation-male.mp3' },
  { id: 'binaural-beats', name: 'バイノーラルビート', file: 'binaural-beats.mp3' }
];
const DEFAULT_AUDIO_ID = 'affirmation-female';

// 遅延中に鳴らし続ける無音ファイル。再生中は端末が「音を出している」状態になるため、
// 画面を消してもブラウザがページを停止せず、長時間の遅延でもタイマーが生き残る。
const KEEP_ALIVE_FILE = 'silence.mp3';

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
  const keepAliveRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const wakeLockRef = useRef(null);
  const appStateRef = useRef(APP_STATE.IDLE);
  const volumeRef = useRef(volume);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // 音量スライダーの変更を再生中のAudioにも即時反映する
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current && appStateRef.current === APP_STATE.PLAYING) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

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
        setCustomAudioUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
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

  // 再生に失敗したら「再生中」のまま放置せず、全停止して待機状態へ戻す
  const handlePlaybackFailure = (error, audio) => {
    console.error("Audio playback FAILED:", error);
    if (audio) console.error("Target Source:", audio.src);
    stopAll();
    setAppState(APP_STATE.IDLE);
    alert("音声を再生できませんでした。もう一度「誘導を開始する」を押してください。\n(ブラウザの自動再生制限や、音声ファイルの読み込み失敗が原因の可能性があります)");
  };

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    endTimeRef.current = null;
    onCountdownEndRef.current = null;
    releaseWakeLock();
    stopKeepAlive();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // 録音中なら先にレコーダーを止めてから(データを確定させてから)マイクを解放する
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch (_) { /* 既に停止済みなら無視 */ }
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
  };

  // --- Keep-alive (遅延中のバックグラウンド維持) ---
  // 開始ボタン(ユーザー操作)の中で呼ぶこと。無音とはいえ再生開始には操作が必要。
  const startKeepAlive = () => {
    const keepAlive = new Audio(`${process.env.PUBLIC_URL}/audio/${KEEP_ALIVE_FILE}`);
    keepAlive.loop = true;
    keepAlive.playsInline = true;
    keepAliveRef.current = keepAlive;
    const p = keepAlive.play();
    if (p !== undefined) {
      p.then(() => console.log('[KeepAlive] started'))
        .catch(error => console.error('[KeepAlive] failed to start:', error));
    }
    // ロック画面に出る再生情報。誤操作を減らすため何を再生中か明示する
    if ('mediaSession' in navigator && window.MediaMetadata) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: '明晰夢誘導アプリ',
          artist: '開始時刻まで待機中'
        });
      } catch (_) { /* 未対応環境は無視 */ }
    }
  };

  const stopKeepAlive = () => {
    if (keepAliveRef.current) {
      keepAliveRef.current.pause();
      keepAliveRef.current = null;
      console.log('[KeepAlive] stopped');
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
          .catch(error => handlePlaybackFailure(error, audio));
      }

      startCountdown(playDurationMins * 60, handleProgramEnd);

    } else {
      // --- Case B: Delayed Start ---
      console.log("[Audio] Delayed Start: Unlocking audio via Play -> Pause.");
      // iOS は volume を無視するため、アンロック時の音漏れは muted で防ぐ
      audio.muted = true;

      const unlockPromise = audio.play();
      if (unlockPromise !== undefined) {
        unlockPromise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
            audio.volume = volumeRef.current; // Restore for later (最新のスライダー値)
            console.log(`[Audio] Unlocked and Volume pre-set to: ${volumeRef.current}`);
          })
          .catch(error => {
            console.error("Audio unlock FAILED (Unlock phase):", error);
            console.error("Target Source:", audio.src);
          });
      }

      // 遅延中は無音を鳴らし続けてページの停止を防ぐ(ユーザー操作の中で開始する必要がある)
      startKeepAlive();

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
      const audio = audioRef.current;
      audio.muted = false;
      audio.currentTime = 0; // アファメーションを必ず頭から流す
      audio.volume = volumeRef.current; // 遅延中にスライダーが動かされた場合も最新値で再生
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio playing successfully.");
            // 本再生が始まってから止める。先に止めると音が途切れ、
            // OSに再生セッションを回収されて再生できなくなることがある
            stopKeepAlive();
          })
          .catch(error => {
            stopKeepAlive();
            handlePlaybackFailure(error, audio);
          });
      }
    } else {
      stopKeepAlive();
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
        // 結果にかかわらず必ず最初にマイクを解放する
        stream.getTracks().forEach(track => track.stop());
        if (micStreamRef.current === stream) micStreamRef.current = null;

        // 実際に録音された形式で Blob を作る（iOS では audio/mp4 になる）
        const blobType = mediaRecorder.mimeType || supportedType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        console.log("🟡 Recording STOPPED. Final Blob size:", audioBlob.size);

        if (audioBlob.size === 0) {
          console.error("Critical Error: Recorded Blob is empty!");
          alert("録音に失敗しました(音声データが空です)。もう一度お試しください。");
          return;
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        // 前の録音のObject URLは解放してから差し替える
        setCustomAudioUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return audioUrl;
        });
        setSelectedAudioId('my-recording'); // 「自分の録音」を選択済みにする

        // Save to IndexedDB (as a backup/optional)
        saveRecording(audioBlob, `録音 ${new Date().toLocaleTimeString()}`)
          .catch((e) => console.error("録音のIndexedDB保存に失敗(再生には影響なし):", e));
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log("🔴 Recording STARTED...");

    } catch (error) {
      console.error("Error accessing microphone:", error);
      // getUserMedia成功後にMediaRecorder作成/開始で失敗した場合もマイクを確実に解放する
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);
      alert("録音を開始できませんでした。マイクへのアクセス許可を確認してください。");
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
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 60分以上は「4.5時間」のように時間表記にする
  const formatDelayLabel = (m) => {
    if (m === 0) return '即時';
    if (m < 60) return `${m}分`;
    const hours = m / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}時間`;
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
              {formatDelayLabel(m)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.6 }}>
          4.5〜6時間は、入眠から約4時間半〜5時間後の「二度寝」を狙う設定です(明け方に明晰夢を見やすいとされる時間帯)。
        </p>
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
            disabled={appState !== APP_STATE.IDLE}
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
          {appState === APP_STATE.IDLE ? formatTime(delayMins * 60) : formatTime(timeLeft)}
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
