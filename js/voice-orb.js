// Ses halkaları — süre (agent mikrofon) ve müşteri avatarı (uzak akış)
// Titreşim / sıvı dalga: faz sürekli dönmez (yörünge hissi yok); ses + sınırlı titreşim.
(function () {
  const TWO_PI = Math.PI * 2;

  function getVoiceProgress01() {
    const page = document.getElementById('page-dialer');
    if (!page) return 0;
    const v = getComputedStyle(page).getPropertyValue('--voice-progress').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }

  function getCallTimeline01() {
    const sec = typeof callSeconds !== 'undefined' ? Number(callSeconds || 0) : 0;
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return Math.min(1, sec / 120); // 0s..120s => 0..1
  }

  function getTimelineHue(t) {
    // 0: mavi(220) -> 60sn: turkuaz(190) -> 120sn: yesil(130)
    if (t <= 0.5) {
      const k = t * 2;
      return 220 + (190 - 220) * k;
    }
    const k = (t - 0.5) * 2;
    return 190 + (130 - 190) * k;
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
     * @param {{ mode: 'agent' | 'remote'; baseRadius: number; ringWidth?: number; lineLayers?: number; lineGap?: number; vivid?: boolean }} opt
     */
    constructor(canvasId, opt) {
      this.id = canvasId;
      this.canvas = document.getElementById(canvasId);
      this.ctx2d = this.canvas?.getContext('2d');
      this.opt = {
        ringWidth: 9,
        lineLayers: 5,
        lineGap: 1.55,
        vivid: false,
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

      if (window.__voiceOrbSimRemote) return;
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
      if (window.__voiceOrbSimRemote) return;
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
      if (this.opt.mode === 'agent') {
        const muted = typeof isMuted !== 'undefined' ? !!isMuted : false;
        if (muted) return 0;
      }
      if (this.opt.mode === 'remote' && window.__voiceOrbSimRemote) {
        const t = this._t * 0.001;
        const b0 = 0.5 + 0.5 * Math.sin(t * 3.7);
        const b1 = 0.5 + 0.5 * Math.sin(t * 8.2 + 1.1);
        const b2 = 0.5 + 0.5 * Math.sin(t * 14.6 + 2.3);
        const b3 = 0.5 + 0.5 * Math.sin(t * 21.1 + 0.7);
        const b4 = 0.5 + 0.5 * Math.sin(t * 27.4 + 1.4);
        const raw = 0.1 + 0.2 * b0 + 0.2 * b1 + 0.18 * b2 + 0.16 * b3 + 0.12 * b4;
        this._smooth = this._smooth * 0.7 + raw * 0.3;
        return Math.min(1, Math.max(0.08, this._smooth * 1.12));
      }
      if (this.analyser && this.freq) {
        this.analyser.getByteFrequencyData(this.freq);
        const n = this.freq.length;
        const i0 = Math.floor(n * 0.04);
        const i1 = Math.floor(n * 0.4);
        let sum = 0;
        for (let i = i0; i < i1; i++) sum += this.freq[i];
        const band = sum / (i1 - i0) / 255;

        // Tiny sounds are easier to catch with RMS from time-domain data.
        const td = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(td);
        let sq = 0;
        for (let i = 0; i < td.length; i++) {
          const v = (td[i] - 128) / 128;
          sq += v * v;
        }
        const rms = Math.sqrt(sq / td.length);
        const raw = Math.max(band * 2.2, rms * 10.0);

        this._smooth = this._smooth * 0.62 + raw * 0.38;
        const out = Math.min(1, this._smooth * 3.4);
        const noiseGate = 0.002;
        return out < noiseGate ? 0 : out;
      }
      const t = this._t;
      if (this.opt.mode === 'remote') {
        const fake = 0.14 + 0.18 * Math.abs(Math.sin(t * 0.0028)) + 0.06 * Math.sin(t * 0.0011);
        this._smooth = this._smooth * 0.9 + fake * 0.1;
        return fake;
      }
      // Agent side should stay fully still when no real mic signal.
      return 0;
    }

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || 112;
      const h = this.canvas.clientHeight || 112;
      if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
      }
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Dış yarıçap: sin(a + titreşen faz) — faz sürekli artmıyor, sin/cos ile sınırlı titreşim.
     */
    _outerR(a, level, vp) {
      const t = this._t;
      const tremor = Math.sin(t * 0.012) * (0.38 + level * 1.05);
      const tremor2 = Math.cos(t * 0.019) * (0.24 + level * 0.82);
      const tremor3 = Math.sin(t * 0.027) * (0.16 + level * 0.52);
      const amp = level * (6.5 + vp * 9.5);
      const p1 = tremor * 2.15;
      const p2 = tremor2 * 1.65;
      const p3 = tremor3 * 1.05;
      let wobble =
        amp *
        (0.42 * Math.sin(3 * a + p1) +
          0.28 * Math.sin(5 * a + p2 + 1.1) +
          0.22 * Math.sin(7 * a + p3 + 0.65) +
          0.08 * Math.sin(11 * a + tremor * 0.55));
      if (window.__voiceOrbSimRemote && this.opt.mode === 'remote') {
        const st = t * 0.001;
        wobble +=
          amp *
          0.28 *
          (Math.sin(st * 6.2) * Math.sin(4 * a) + Math.sin(st * 11.4) * Math.sin(8 * a + 0.5) + 0.6 * Math.sin(st * 2.2) * Math.sin(6 * a));
      }
      const radialPulse = Math.sin(t * 0.011) * (level * 1.75);
      return this.opt.baseRadius + radialPulse + wobble;
    }

    drawFrame(dt) {
      if (!this.canvas || !this.ctx2d) return;
      this.resize();
      if (this.opt.mode === 'remote') this.tryReattachRemote();

      this._t += dt;
      const level = this._readLevel(dt);
      const vp = getVoiceProgress01();

      const w = this.canvas.clientWidth || 112;
      const h = this.canvas.clientHeight || 112;
      const cx = w / 2;
      const cy = h / 2;
      const ctx = this.ctx2d;
      ctx.clearRect(0, 0, w, h);

      const ringW = this.opt.ringWidth;
      const n = 128;
      const timeline = getCallTimeline01();
      const baseHue = getTimelineHue(timeline);
      const hueA = baseHue;
      const hueB = baseHue + 26;
      const vivid = this.opt.vivid ? 1.25 : 1;

      const outer = (a) => this._outerR(a, level, vp);
      const inner = (a) => Math.max(4, outer(a) - ringW);

      ctx.beginPath();
      blobContourOuter(ctx, cx, cy, outer, n);
      blobContourInnerHole(ctx, cx, cy, inner, n);
      const g = ctx.createRadialGradient(cx, cy, inner(0) * 0.35, cx, cy, this.opt.baseRadius + ringW + 10);
      g.addColorStop(0, `hsla(${hueA}, 78%, 52%, ${(0.14 + level * 0.2) * vivid})`);
      g.addColorStop(0.55, `hsla(${145 + vp * 35}, 62%, 48%, ${(0.08 + level * 0.14) * vivid})`);
      g.addColorStop(1, `hsla(${hueB}, 70%, 50%, 0.02)`);
      ctx.fillStyle = g;
      ctx.fill('evenodd');

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
        const baseA = 0.22 + k * 0.1 + level * 0.18;
        ctx.strokeStyle = `hsla(${hue + k * 4}, ${84 + vp * 5}%, ${56 - k * 2}%, ${Math.min(0.95, baseA * vivid)})`;
        ctx.lineWidth = 1.05 + (level > 0.18 ? 0.15 : 0) + (this.opt.vivid ? 0.12 : 0);
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
      baseRadius: 34,
      ringWidth: 10,
      lineLayers: 5,
      lineGap: 1.55,
      vivid: false,
    });
    custRing = new VoiceRing('cust-voice-canvas', {
      mode: 'remote',
      baseRadius: 32,
      ringWidth: 11,
      lineLayers: 7,
      lineGap: 1.55,
      vivid: true,
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
