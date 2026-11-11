/**
 * Listens to the player's microphone and exposes a smoothed loudness level.
 * The microphone is never played back locally and nothing is recorded. Online, with the
 * voice chat on, the samples are streamed live to the partner only (see VoiceChat).
 */
export type MicStatus = 'off' | 'starting' | 'on' | 'denied' | 'unavailable';

export class MicListener {
  public status: MicStatus = 'off';
  /** Smoothed voice level 0..1 (after sensitivity). */
  public level = 0;
  public sensitivity = 1;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private noiseFloor = 0.01;
  private tap: ScriptProcessorNode | null = null;
  /** Receives raw microphone samples (voice chat). */
  public onPcm: ((samples: Float32Array, sampleRate: number) => void) | null = null;

  /** Mobile browsers may keep the context asleep until a touch. */
  public resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  public async start(): Promise<MicStatus> {
    if (this.status === 'on' || this.status === 'starting') return this.status;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'unavailable';
      return this.status;
    }
    this.status = 'starting';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      // Stopped while waiting for permission
      if (this.status !== 'starting') {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
        return this.status;
      }
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      const src = this.ctx.createMediaStreamSource(this.stream);
      // Keep only the voice band so footsteps / fans count less
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 120;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3500;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(hp);
      hp.connect(lp);
      lp.connect(this.analyser); // NOT connected to the speakers
      // Voice-chat tap: raw samples handed to `onPcm` (sent to the partner only when online).
      // A ScriptProcessor works everywhere (also plain http and old iPhones); its output is silent.
      if (this.ctx.createScriptProcessor) {
        const vhp = this.ctx.createBiquadFilter();
        vhp.type = 'highpass';
        vhp.frequency.value = 90;
        const tap = this.ctx.createScriptProcessor(2048, 1, 1);
        tap.onaudioprocess = (ev) => {
          ev.outputBuffer.getChannelData(0).fill(0);
          if (this.onPcm) this.onPcm(ev.inputBuffer.getChannelData(0), this.ctx?.sampleRate ?? 48000);
        };
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        src.connect(vhp);
        vhp.connect(tap);
        tap.connect(mute);
        mute.connect(this.ctx.destination);
        this.tap = tap;
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.status = 'on';
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      this.status = /NotAllowed|Security|Permission/i.test(name) ? 'denied' : 'unavailable';
      this.cleanup();
    }
    return this.status;
  }

  public stop() {
    this.cleanup();
    this.status = 'off';
    this.level = 0;
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    if (this.tap) this.tap.onaudioprocess = null;
    this.tap = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  /** Call once per frame. */
  public update(delta: number) {
    if (this.status !== 'on' || !this.analyser || !this.buf) {
      this.level = Math.max(0, this.level - delta * 3);
      return;
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    // Adaptive noise floor: slowly learns the room's background noise
    if (rms < this.noiseFloor * 1.5) this.noiseFloor += (rms - this.noiseFloor) * Math.min(1, delta * 0.5);
    else this.noiseFloor += (rms - this.noiseFloor) * Math.min(1, delta * 0.02);

    const signal = Math.max(0, rms - this.noiseFloor * 1.2);
    // dB mapping: ~ -50 dB (whisper) → 0, ~ -10 dB (shout) → 1
    const db = 20 * Math.log10(signal + 1e-6);
    const target = Math.min(1, Math.max(0, ((db + 50) / 40) * this.sensitivity));
    // Fast attack, slow release
    const k = target > this.level ? Math.min(1, delta * 18) : Math.min(1, delta * 3);
    this.level += (target - this.level) * k;
  }
}
