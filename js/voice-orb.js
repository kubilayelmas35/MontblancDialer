// Ses halkaları — süre (agent mikrofon) ve müşteri avatarı (uzak akış)
// Tek bir r(θ) eğrisi: iç/dış sınır birlikte hareket eder; sürekli dönüş yok, ses + hafif nefes.
(function () {
  const TWO_PI = Math.PI * 2;

  function getVoiceProgress01() {
    const page = document.getElementById('page-dialer');
    if (!page) return 0;
    const v = getComputedStyle(page).getPropertyValue('--voice-progress').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }

  let sharedCtx = null;
  function getAudioContext() {
    if (!sharedCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) sharedCtx = new AC();
    }
    return sharedCtx;
  }

  let _cachedMic = null;
  async function getMicStream() {
    if (_cachedMic && _cachedMic.getAudioTracks().some((t) => t.readyState === 'live')) return _cachedMic;
    try {
      _cachedMic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      _cachedMic = null;
    }
    return _cachedMic;
  }

  function blobContourOuter(ctx, cx, cy, getR, n) {
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TWO_PI;
      const r = getR(a);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function blobContourInnerHole(ctx, cx, cy, getR, n) {
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * TWO_PI;
      const r = getR(a);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === n) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  class VoiceRing {
    /**
     * @param {string} canvasId
     * @param {{ mode: 'agent' | 'remote'; baseRadius: number; ringWidth?: number; lineLayers?: number }} opt
     */
    constructor(canvasId, opt) {
      this.id = canvasId;
      this.canvas = document.getElementById(canvasId);
      this.ctx2d = this.canvas?.getContext('2d');
      this.opt = {
        ringWidth: 9,
        lineLayers: 5,
        lineGap: 1.65,
        ...opt,
      };
      this._smooth = 0;
      this._t = 0;
      this.audioCtx = null;
      this.analyser = null;
      this.source = null;
      this.freq = null;
      this._attachedStream = null;
    }

    async ensureAudio() {
      const ctx = getAudioContext();
      if (!ctx || !this.canvas || !this.ctx2d) return;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (e) {}
      }
    }

    async attach() {
      await this.ensureAudio();
      const ctx = getAudioContext();
      if (!ctx) return;
      this.detachAnalyserOnly();
      this.audioCtx = ctx;

      if (this.opt.mode === 'agent') {
        const stream = await getMicStream();
        if (!stream) return;
        try {
          this.source = ctx.createMediaStreamSource(stream);
          this.analyser = ctx.createAnalyser();
          this.analyser.fftSize = 512;
          this.analyser.smoothingTimeConstant = 0.72;
          this.source.connect(this.analyser);
          this.freq = new Uint8Array(this.analyser.frequencyBinCount);
          this._attachedStream = stream;
        } catch (e) {
          this.analyser = null;
        }
        return;
      }

      this._attachRemote(ctx);
    }

    _attachRemote(ctx) {
      const stream = typeof window._telnyxRemoteStream !== 'undefined' ? window._telnyxRemoteStream : null;
      if (!stream || !stream.getAudioTracks().length) return;
      try {
        this.source = ctx.createMediaStreamSource(stream);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.75;
        this.source.connect(this.analyser);
        this.freq = new Uint8Array(this.analyser.frequencyBinCount);
        this._attachedStream = stream;
      } catch (e) {
        this.analyser = null;
      }
    }

    tryReattachRemote() {
      if (this.opt.mode !== 'remote') return;
      const stream = window._telnyxRemoteStream;
      if (stream === this._attachedStream) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      this.detachAnalyserOnly();
      this.audioCtx = ctx;
      this._attachRemote(ctx);
    }

    detachAnalyserOnly() {
      try {
        if (this.source) this.source.disconnect();
      } catch (e) {}
      this.source = null;
      this.analyser = null;
      this.freq = null;
      this._attachedStream = null;
    }

    detach() {
      this.detachAnalyserOnly();
    }

    _readLevel(dt) {
      if (this.analyser && this.freq) {
        this.analyser.getByteFrequencyData(this.freq);
        const n = this.freq.length;
        const i0 = Math.floor(n * 0.04);
        const i1 = Math.floor(n * 0.4);
        let sum = 0;
        for (let i = i0; i < i1; i++) sum += this.freq[i];
        const raw = sum / (i1 - i0) / 255;
        this._smooth = this._smooth * 0.82 + raw * 0.18;
        return Math.min(1, this._smooth * 2.2);
      }
      const t = this._t;
      if (this.opt.mode === 'remote') {
        const fake = 0.14 + 0.18 * Math.abs(Math.sin(t * 0.0028)) + 0.06 * Math.sin(t * 0.0011);
        this._smooth = this._smooth * 0.9 + fake * 0.1;
        return fake;
      }
      const idle = 0.06 + 0.04 * Math.abs(Math.sin(t * 0.0015));
      this._smooth = this._smooth * 0.92 + idle * 0.08;
      return idle;
    }

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || 88;
      const h = this.canvas.clientHeight || 88;
      if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
      }
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Ortak dış sınır — tüm katmanlar aynı şekli paylaşır (komple halka birlikte akar) */
    _outerR(a, level, vp) {
      const breath = (0.04 + level * 0.96) * 0.45 * Math.sin(this._t * 0.00042);
      const slow = this._t * 0.00028 * (0.06 + level * 0.94);
      const amp = level * (6.5 + vp * 9.5) + (0.02 + level * 0.35);
      const wobble =
        amp *
        (0.42 * Math.sin(3 * a + slow) +
          0.28 * Math.sin(5 * a + 1.1 + slow * 1.35) +
          0.22 * Math.sin(7 * a + 0.65 + slow * 0.9) +
          0.08 * Math.sin(11 * a + slow * 0.55));
      return this.opt.baseRadius + breath + wobble;
    }

    drawFrame(dt) {
      if (!this.canvas || !this.ctx2d) return;
      this.resize();
      if (this.opt.mode === 'remote') this.tryReattachRemote();

      this._t += dt;
      const level = this._readLevel(dt);
      const vp = getVoiceProgress01();

      const w = this.canvas.clientWidth || 88;
      const h = this.canvas.clientHeight || 88;
      const cx = w / 2;
      const cy = h / 2;
      const ctx = this.ctx2d;
      ctx.clearRect(0, 0, w, h);

      const ringW = this.opt.ringWidth;
      const n = 128;
      const hueA = 195 - vp * 80;
      const hueB = 32 + vp * 40;

      const outer = (a) => this._outerR(a, level, vp);
      const inner = (a) => Math.max(4, outer(a) - ringW);

      /* Yumuşak dolgu: tek halka — dış ve iç aynı r(θ) dalgası (paralel sınır) */
      ctx.beginPath();
      blobContourOuter(ctx, cx, cy, outer, n);
      blobContourInnerHole(ctx, cx, cy, inner, n);
      const g = ctx.createRadialGradient(cx, cy, inner(0) * 0.35, cx, cy, this.opt.baseRadius + ringW + 8);
      g.addColorStop(0, `hsla(${hueA}, 78%, 52%, ${0.14 + level * 0.18})`);
      g.addColorStop(0.55, `hsla(${145 + vp * 35}, 62%, 48%, ${0.08 + level * 0.12})`);
      g.addColorStop(1, `hsla(${hueB}, 70%, 50%, 0.02)`);
      ctx.fillStyle = g;
      ctx.fill('evenodd');

      /* İnce eşmerkezli çizgiler — aynı r(θ), sadece yarıçap ofseti */
      const layers = this.opt.lineLayers;
      const gap = this.opt.lineGap;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let k = 0; k < layers; k++) {
        const off = k * gap;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TWO_PI;
          const r = outer(a) - off * 0.92;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const alt = k % 2;
        const hue = alt ? hueB : hueA;
        ctx.strokeStyle = `hsla(${hue + k * 4}, ${84 + vp * 5}%, ${56 - k * 2}%, ${0.22 + k * 0.1 + level * 0.15})`;
        ctx.lineWidth = 1.05 + (level > 0.18 ? 0.15 : 0);
        ctx.stroke();
      }
    }
  }

  let timerRing = null;
  let custRing = null;
  let running = false;
  let rafId = null;
  let lastTs = 0;

  function frame(ts) {
    if (!running) return;
    const dt = lastTs ? Math.min(48, ts - lastTs) : 16;
    lastTs = ts;
    timerRing?.drawFrame(dt);
    custRing?.drawFrame(dt);
    rafId = requestAnimationFrame(frame);
  }

  window.startDialerVoiceRings = async function () {
    if (running) return;
    if (!document.getElementById('dialer-timer-voice-canvas') && !document.getElementById('cust-voice-canvas')) return;

    timerRing = new VoiceRing('dialer-timer-voice-canvas', {
      mode: 'agent',
      baseRadius: 24,
      ringWidth: 8,
      lineLayers: 5,
      lineGap: 1.55,
    });
    custRing = new VoiceRing('cust-voice-canvas', {
      mode: 'remote',
      baseRadius: 30,
      ringWidth: 10,
      lineLayers: 6,
      lineGap: 1.55,
    });

    await timerRing.attach();
    await custRing.attach();

    running = true;
    lastTs = 0;
    rafId = requestAnimationFrame(frame);

    const resume = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    };
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  };

  window.stopDialerVoiceRings = function () {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = 0;
    timerRing?.detach();
    custRing?.detach();
    timerRing = null;
    custRing = null;

    const tc = document.getElementById('dialer-timer-voice-canvas');
    const cc = document.getElementById('cust-voice-canvas');
    if (tc) tc.getContext('2d')?.clearRect(0, 0, tc.width, tc.height);
    if (cc) cc.getContext('2d')?.clearRect(0, 0, cc.width, cc.height);
  };
})();
