class TUSLockscreenController {
  constructor(callbacks = {}) {
    this.isRunning = false;
    this.seconds = 0;
    this.questionCount = 0;
    this.subject = 'Dahiliye';
    this.timerInterval = null;
    this.audioEl = null;

    this.callbacks = {
      onToggle: callbacks.onToggle || (() => {}),
      onNext: callbacks.onNext || (() => {}),
      onPrev: callbacks.onPrev || (() => {}),
      onUpdate: callbacks.onUpdate || (() => {})
    };
  }

  _createSilentLoopWavUrl() {
    const sampleRate = 8000;
    const durationSec = 5;
    const numSamples = sampleRate * durationSec;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  _ensureAudioElement() {
    if (this.audioEl) return this.audioEl;
    const audio = document.createElement('audio');
    audio.src = this._createSilentLoopWavUrl();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.02;
    audio.setAttribute('playsinline', '');
    document.body.appendChild(audio);
    this.audioEl = audio;
    return audio;
  }

  _formatTime(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  updateMediaMetadata() {
    if (!('mediaSession' in navigator)) return;

    const statusIcon = this.isRunning ? '▶ Çalışıyor' : '⏸ Duraklatıldı';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${this.subject} • ${this._formatTime(this.seconds)}`,
      artist: `${statusIcon} | Çözülen Soru: ${this.questionCount}`,
      album: 'TUS Çalışma Asistanı',
      artwork: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    navigator.mediaSession.playbackState = this.isRunning ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: 3600,
          playbackRate: 1.0,
          position: this.seconds % 3600
        });
      } catch (e) {}
    }
  }

  _bindMediaActions() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      this.resume();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (this.questionCount > 0) this.questionCount--;
      this.updateMediaMetadata();
      this.callbacks.onPrev(this.getState());
      this.callbacks.onUpdate(this.getState());
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.questionCount++;
      this.updateMediaMetadata();
      this.callbacks.onNext(this.getState());
      this.callbacks.onUpdate(this.getState());
    });

    try {
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        this.questionCount += 5;
        this.updateMediaMetadata();
        this.callbacks.onUpdate(this.getState());
      });
    } catch (e) {}

    try {
      navigator.mediaSession.setActionHandler('seekforward', () => {
        this.seconds = 0;
        this.updateMediaMetadata();
        this.callbacks.onUpdate(this.getState());
      });
    } catch (e) {}
  }

  async start(subjectName) {
    if (subjectName) this.subject = subjectName;
    const audio = this._ensureAudioElement();
    await audio.play();
    this._bindMediaActions();

    this.isRunning = true;
    this.updateMediaMetadata();

    if (!this.timerInterval) {
      this.timerInterval = setInterval(() => {
        if (this.isRunning) {
          this.seconds++;
          this.updateMediaMetadata();
          this.callbacks.onUpdate(this.getState());
        }
      }, 1000);
    }

    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_STATUS_NOTIFICATION',
        title: `TUS Asistan • ${this.subject}`,
        body: 'Kilit ekranı ve AOD kontrolleri aktif'
      });
    }

    this.callbacks.onUpdate(this.getState());
  }

  async resume() {
    const audio = this._ensureAudioElement();
    if (audio.paused) {
      await audio.play();
    }
    this.isRunning = true;
    this.updateMediaMetadata();
    this.callbacks.onToggle(this.getState());
    this.callbacks.onUpdate(this.getState());
  }

  pause() {
    this.isRunning = false;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    this.updateMediaMetadata();
    this.callbacks.onToggle(this.getState());
    this.callbacks.onUpdate(this.getState());
  }

  stopCompletely() {
    this.isRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
    this.callbacks.onUpdate(this.getState());
  }

  setSubject(subjectName) {
    this.subject = subjectName;
    this.updateMediaMetadata();
    this.callbacks.onUpdate(this.getState());
  }

  getState() {
    return {
      isRunning: this.isRunning,
      seconds: this.seconds,
      formattedTime: this._formatTime(this.seconds),
      questionCount: this.questionCount,
      subject: this.subject
    };
  }
}

window.TUSLockscreenController = TUSLockscreenController;
