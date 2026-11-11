/**
 * Comprehensive Procedural Web Audio Engine for Survival Horror
 * Zero external mp3/wav dependencies. All soundscapes are generated via Web Audio API.
 */

import { AudioSettings } from '../types';

class SoundSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  
  // Audio nodes & buses
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  
  // Ambient drone loops
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneNoiseNode: AudioNode | null = null;

  // Heartbeat loop state
  private heartbeatInterval: number | null = null;
  private currentHeartbeatBpm: number = 60;
  private heartbeatActive: boolean = false;

  // Settings
  private settings: AudioSettings = {
    masterVolume: 0.8,
    ambienceVolume: 0.7,
    sfxVolume: 0.85,
    musicVolume: 0.75,
  };

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      // Master bus
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.settings.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Ambience bus
      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(this.ambienceLevel(), this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);

      // SFX bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Music / Tension bus
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.settings.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      // Hallway reverb: synthetic impulse response (decaying noise)
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.6, 2.4);
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.setValueAtTime(0.32, this.ctx.currentTime);
      this.sfxGain.connect(this.reverbSend);
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.masterGain);

      this.startAmbienceDrone();

      // Leaving the tab / closing the app on a phone: no more sound in the background
      let wasRunning = false;
      const onHide = () => {
        if (!this.ctx) return;
        if (document.hidden) {
          wasRunning = this.ctx.state === 'running';
          if (wasRunning) this.ctx.suspend().catch(() => {});
        } else if (wasRunning) {
          wasRunning = false;
          this.ctx.resume().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', () => this.ctx?.suspend().catch(() => {}));
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Nodes the proximity voice chat plays into (null before the first click). */
  public voiceOutput(): { ctx: AudioContext; out: AudioNode; reverb: AudioNode } | null {
    if (!this.ctx || !this.masterGain || !this.reverbSend) return null;
    return { ctx: this.ctx, out: this.masterGain, reverb: this.reverb ?? this.masterGain };
  }

  /** True while a run is on screen: the hospital ambience only plays then. */
  private inGame = false;

  private ambienceLevel() {
    if (!this.inGame) return 0;
    return this.settings.ambienceVolume * (this.menuBus ? 0.25 : 1);
  }

  private applyAmbience(tc: number) {
    if (!this.ctx || !this.ambienceGain) return;
    const g = this.ambienceGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(this.ambienceLevel(), this.ctx.currentTime, tc);
  }

  /** Back to the menu: the hospital drone and the heartbeat go quiet. */
  public setInGame(on: boolean) {
    if (this.inGame === on) return;
    this.inGame = on;
    if (!on) {
      this.setHeartbeat(60, false);
      this.setBossMusic(false, 0.5);
    }
    this.applyAmbience(on ? 0.6 : 0.25);
  }

  /** Freeze every sound while the game is paused. */
  public setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') this.ctx.suspend();
    else if (!paused && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Output node with stereo panning (-1 left … 1 right) feeding the SFX bus. */
  private pannedOut(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return this.sfxGain!;
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
    p.connect(this.sfxGain!);
    return p;
  }

  /** Muffled distant metallic slam (scripted scares). */
  public playDistantSlam(pan = 0) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const out = this.pannedOut(pan);
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    src.start(t);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(og);
    og.connect(out);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  /** Screamer: a harsh, distorted shriek with a noise burst and a sub hit. */
  public playScreamer() {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 1.5;

    // Distortion curve
    const shaper = ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.75, t + 0.02);
    out.gain.setValueAtTime(0.75, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    shaper.connect(out);
    out.connect(this.sfxGain);

    // Detuned, wobbling "voices" sliding up then cracking down
    [520, 610, 760, 935, 1240].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f * 0.7, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
      // Fast vibrato = screaming throat
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(11 + i * 3, t);
      lfoGain.gain.setValueAtTime(f * 0.06, t);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      osc.connect(g);
      g.connect(shaper);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur);
      lfo.stop(t + dur);
    });

    // Breathy noise layer
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, t);
    bp.Q.setValueAtTime(0.8, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(shaper);
    noise.start(t);

    // Body-slam sub hit
    this.playJumpscareStinger();
  }

  /** Vending machine: motor whirr, then a can thuds into the tray. */
  public playVendingDispense() {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const motor = ctx.createOscillator();
    const mg = ctx.createGain();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(90, t);
    motor.frequency.linearRampToValueAtTime(110, t + 0.5);
    mg.gain.setValueAtTime(0.0001, t);
    mg.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    mg.gain.setValueAtTime(0.12, t + 0.45);
    mg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    motor.connect(lp);
    lp.connect(mg);
    mg.connect(this.sfxGain);
    motor.start(t);
    motor.stop(t + 0.6);
    // Thud + clink
    const thud = ctx.createOscillator();
    const tg = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140, t + 0.6);
    thud.frequency.exponentialRampToValueAtTime(50, t + 0.8);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.setValueAtTime(0.5, t + 0.6);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    thud.connect(tg);
    tg.connect(this.sfxGain);
    thud.start(t);
    thud.stop(t + 0.9);
    this.playCanClank(0.5, 0.62);
  }

  /**
   * Chapter 3 beacon: a leaking valve's pipe rings twice, far away.
   * `vol` 0..1 (distance), `pan` -1..1 (direction).
   */
  public playPipeKnock(pan = 0, vol = 0.5) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const out = this.pannedOut(pan);
    const v = Math.max(0.02, Math.min(1, vol)) * 0.35;
    [0, 0.42].forEach((dt) => {
      const t = ctx.currentTime + dt;
      [310, 742, 1180].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(v / (i + 1), t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9 - i * 0.2);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 1);
      });
    });
  }

  /** Chalk scratching a mark on the floor. */
  public playChalk() {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((Math.PI * i) / len) * (0.6 + 0.4 * Math.sin(i / 300));
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, t);
    bp.Q.setValueAtTime(1.2, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  // --- CHAPTER 5: final fight music (music bus) ---
  private boss: { bus: GainNode; next: number; step: number; timer: number | null; rage: boolean } | null = null;

  /** Driving 140 BPM pulse for the final fight; `rage` adds a faster, higher layer. */
  public setBossMusic(on: boolean, fade = 1.5, rage = false) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    if (on && this.boss) {
      this.boss.rage = rage;
      return;
    }
    if (on) {
      if (!this.inGame) return;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0.85, ctx.currentTime + fade);
      bus.connect(this.musicGain);
      this.boss = { bus, next: ctx.currentTime + 0.05, step: 0, timer: null, rage };
      this.bossSchedule();
      return;
    }
    const b = this.boss;
    if (!b) return;
    this.boss = null;
    if (b.timer) window.clearTimeout(b.timer);
    b.bus.gain.cancelScheduledValues(ctx.currentTime);
    b.bus.gain.setValueAtTime(b.bus.gain.value, ctx.currentTime);
    b.bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
    window.setTimeout(() => b.bus.disconnect(), (fade + 0.5) * 1000);
  }

  private bossSchedule() {
    const b = this.boss;
    if (!b || !this.ctx) return;
    const ctx = this.ctx;
    const eighth = 60 / 140 / 2;
    while (b.next < ctx.currentTime + 0.3) {
      this.bossStep(b.step, b.next, b.bus, b.rage);
      b.next += eighth;
      b.step++;
    }
    b.timer = window.setTimeout(() => this.bossSchedule(), 90);
  }

  private bossStep(i: number, t: number, out: AudioNode, rage: boolean) {
    const ctx = this.ctx!;
    // Kick on every beat
    if (i % 2 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.3);
    }
    // Bass ostinato (A, A, B♭, A…): it never resolves
    const bass = [55, 55, 58.27, 55, 55, 55, 61.74, 58.27][i % 8] * (rage && i % 16 >= 8 ? 1.5 : 1);
    {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(bass, t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(rage ? 520 : 320, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(lp);
      lp.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.22);
    }
    // Metal hats on the off-beats (every eighth in the rage phase)
    if (i % 2 === 1 || rage) this.burst(out, t, 0.05, i % 2 === 1 ? 0.05 : 0.025, 'highpass', 7000, 0.7, 0.002);
    // Dissonant stab every 2 bars
    if (i % 16 === 0) {
      for (const f of [220, 233.08, rage ? 311.13 : 164.81]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2400, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.045, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(lp);
        lp.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 1);
      }
    }
  }

  // --- CHAPTER 4: forest loops (ambience bus: silent in the menu) ---
  private loops = new Map<string, { gain: GainNode; pan: StereoPannerNode | null; stop: () => void }>();

  private makeLoop(name: string) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      gain.connect(pan);
      pan.connect(this.ambienceGain!);
    } else gain.connect(this.ambienceGain!);
    const srcs: AudioScheduledSourceNode[] = [];
    const t = ctx.currentTime;
    if (name === 'rain') {
      const n = this.noiseSource(1);
      n.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      n.connect(hp);
      hp.connect(lp);
      lp.connect(gain);
      srcs.push(n);
      // Heavy drops on leaves
      const n2 = this.noiseSource(0.5);
      n2.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.7;
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      n2.connect(bp);
      bp.connect(g2);
      g2.connect(gain);
      srcs.push(n2);
    } else if (name === 'generator') {
      // Two-stroke engine: low sawtooth thumping at ~24 Hz
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 48;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const am = ctx.createGain();
      am.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 24;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.4;
      lfo.connect(lfoG);
      lfoG.connect(am.gain);
      o.connect(lp);
      lp.connect(am);
      am.connect(gain);
      const n = this.noiseSource(0.6);
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.value = 0.15;
      n.connect(bp);
      bp.connect(ng);
      ng.connect(am);
      srcs.push(o, lfo, n);
    } else {
      // Helicopter: chopped low noise (blade slap ~11 Hz) + turbine whine
      const n = this.noiseSource(0.7);
      n.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const chop = ctx.createGain();
      chop.gain.value = 0.45;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 11;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.45;
      lfo.connect(lfoG);
      lfoG.connect(chop.gain);
      n.connect(lp);
      lp.connect(chop);
      chop.connect(gain);
      const w = ctx.createOscillator();
      w.type = 'triangle';
      w.frequency.value = 1850;
      const wg = ctx.createGain();
      wg.gain.value = 0.025;
      w.connect(wg);
      wg.connect(gain);
      srcs.push(n, lfo, w);
    }
    srcs.forEach((s) => s.start(t));
    const loop = {
      gain,
      pan,
      stop: () => {
        srcs.forEach((s) => {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        });
        gain.disconnect();
      },
    };
    this.loops.set(name, loop);
    return loop;
  }

  /** Set a forest loop's level (0 stops it) and direction. */
  public setLoop(name: 'rain' | 'generator' | 'helicopter', vol: number, pan = 0) {
    if (!this.ctx || !this.ambienceGain) return;
    let l = this.loops.get(name);
    if (vol <= 0.001) {
      if (l) {
        l.stop();
        this.loops.delete(name);
      }
      return;
    }
    if (!l) l = this.makeLoop(name);
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(Math.min(1, vol), t, 0.15);
    l.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }

  /** Thunder: a crack then a long rolling rumble. */
  public playThunder(delay = 0, strength = 1) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const v = 0.5 * strength;
    this.burst(this.sfxGain, t, 0.5, v * 0.6, 'lowpass', 2400, 0.7, 0.005);
    for (let i = 0; i < 4; i++) this.burst(this.sfxGain, t + 0.15 + i * 0.45 + Math.random() * 0.3, 1.6 + Math.random(), v * (0.9 - i * 0.18), 'lowpass', 160 + Math.random() * 120, 0.8, 0.12);
  }

  /** Pull-cord + the engine catching. */
  public playEngineStart() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    [0, 0.55, 1.1].forEach((dt, i) => this.burst(this.sfxGain!, t + dt, 0.3 + i * 0.1, 0.25, 'bandpass', 380 - i * 60, 1.5, 0.02));
    this.burst(this.sfxGain, t + 1.25, 0.9, 0.35, 'lowpass', 260, 0.9, 0.05);
  }

  /** Metallic can hitting the floor. `strength` 0..1. */
  public playCanClank(strength = 1, delay = 0) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const vol = 0.08 + strength * 0.3;
    [1850, 2730, 3910].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * (0.97 + Math.random() * 0.06), t);
      g.gain.setValueAtTime(vol / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.18 + strength * 0.15);
      o.connect(g);
      g.connect(this.sfxGain!);
      o.start(t);
      o.stop(t + 0.4);
    });
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1500, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol, t);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.sfxGain);
    src.start(t);
  }

  /** Bottle-flip success jingle (rising arpeggio). */
  public playFlipSuccess(double = false) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = double ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + i * 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(0.22, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.35);
      o.connect(g);
      g.connect(this.sfxGain!);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.4);
    });
  }

  /** Electrical surge when the power comes back. */
  public playPowerUp() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 2.3);
  }

  public updateSettings(settings: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx) return;

    if (this.masterGain && settings.masterVolume !== undefined) {
      this.masterGain.gain.setTargetAtTime(settings.masterVolume, this.ctx.currentTime, 0.05);
    }
    if (settings.ambienceVolume !== undefined) this.applyAmbience(0.05);
    if (this.sfxGain && settings.sfxVolume !== undefined) {
      this.sfxGain.gain.setTargetAtTime(settings.sfxVolume, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && settings.musicVolume !== undefined) {
      this.musicGain.gain.setTargetAtTime(settings.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  // --- AMBIENCE ---
  private startAmbienceDrone() {
    if (!this.ctx || !this.ambienceGain) return;

    // Deep sub-bass hum (48Hz and 51Hz for eerie binaural detuning)
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneFilter = this.ctx.createBiquadFilter();

    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.setValueAtTime(48, this.ctx.currentTime);

    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.setValueAtTime(51.2, this.ctx.currentTime);

    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
    this.droneFilter.Q.setValueAtTime(3, this.ctx.currentTime);

    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneFilter.connect(droneGain);
    droneGain.connect(this.ambienceGain);

    this.droneOsc1.start();
    this.droneOsc2.start();

    // Subtle ventilation white noise filtered
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(280, this.ctx.currentTime);
    noiseFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ambienceGain);
    whiteNoise.start();
    this.droneNoiseNode = whiteNoise;
  }

  // --- MENU MUSIC: an anxious, procedural score -----------------------------
  // Low detuned drone + a broken, out-of-tune music box + swelling dissonant
  // strings + far-away heartbeats and metal scrapes. Generated live, never loops
  // exactly the same way twice.
  private menuBus: GainNode | null = null;
  private menuNodes: AudioScheduledSourceNode[] = [];
  private menuTimer: number | null = null;
  private menuStep = 0;

  /** Closes the audio context (old instance after a hot-reload). */
  public shutdown() {
    this.setHeartbeat(60, false);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  public get menuMusicPlaying() {
    return !!this.menuBus;
  }

  /** True once the browser lets us play sound (after a click / key press). */
  public get audioUnlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  public startMenuMusic() {
    if (!this.ctx || !this.musicGain || this.menuBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(1, t + 5);
    bus.connect(this.musicGain);
    if (this.reverb) {
      const wet = ctx.createGain();
      wet.gain.value = 0.75;
      bus.connect(wet);
      wet.connect(this.reverb);
    }
    this.menuBus = bus;
    // The in-game ambience steps back while the menu plays
    this.applyAmbience(1);

    // 1. Drone: A1, B♭1 (a minor second: it never settles) and E2, slowly breathing filter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    lp.Q.value = 7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 95;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.15;
    for (const f of [55, 58.27, 82.41]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 16;
      o.connect(lp);
      o.start(t);
      this.menuNodes.push(o);
    }
    lp.connect(droneGain);
    droneGain.connect(bus);
    lfo.start(t);
    this.menuNodes.push(lfo);

    // 2. A thin, high, beating tone (like tinnitus in a silent room)
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.012;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.3;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.01;
    trem.connect(tremGain);
    tremGain.connect(hiGain.gain);
    for (const f of [1318.5, 1396.9]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(hiGain);
      o.start(t);
      this.menuNodes.push(o);
    }
    hiGain.connect(bus);
    trem.start(t);
    this.menuNodes.push(trem);

    this.menuStep = 0;
    this.menuTick();
  }

  public stopMenuMusic(fade = 2) {
    if (!this.ctx || !this.menuBus) return;
    const ctx = this.ctx;
    const bus = this.menuBus;
    const nodes = this.menuNodes;
    this.menuBus = null;
    this.menuNodes = [];
    if (this.menuTimer) window.clearTimeout(this.menuTimer);
    this.menuTimer = null;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
    this.applyAmbience(0.8);
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      bus.disconnect();
    }, fade * 1000 + 100);
  }

  /** One beat of the menu score (~0.8 s). */
  private menuTick() {
    if (!this.ctx || !this.menuBus) return;
    const ctx = this.ctx;
    const bus = this.menuBus;
    const t = ctx.currentTime + 0.05;
    const step = this.menuStep++;
    // A slow, sad lullaby in A minor… with one wrong note (G♯ against G)
    const tune = [880, 0, 1046.5, 0, 987.8, 0, 659.3, 0, 880, 0, 830.6, 0, 698.5, 0, 659.3, 0, 587.3, 0, 698.5, 0, 659.3, 0, 523.3, 0, 493.9, 0, 0, 0, 440, 0, 0, 0];
    const note = tune[step % tune.length];
    // The music box is broken: it sometimes skips, drags or goes out of tune
    if (note && Math.random() > 0.18) this.musicBoxNote(bus, t + Math.random() * 0.06, note * Math.pow(2, ((Math.random() - 0.5) * 30) / 1200));

    // Dissonant string swell every 8 beats
    if (step % 8 === 0) {
      const chords = [
        [220, 233.1, 329.6],
        [196, 207.7, 311.1],
        [174.6, 185, 261.6],
        [164.8, 174.6, 246.9],
      ];
      const ch = chords[Math.floor(step / 8) % chords.length];
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 3);
      g.gain.linearRampToValueAtTime(0.0001, t + 6.4);
      f.connect(g);
      g.connect(bus);
      for (const fr of ch) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = fr;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + 6.5);
        }
      }
    }

    // Far-away heartbeat in the second half of the phrase
    if (step % 32 >= 16 && step % 4 === 0) {
      for (const [dt, v] of [[0, 0.22], [0.2, 0.15]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(62, t + dt);
        o.frequency.exponentialRampToValueAtTime(30, t + dt + 0.18);
        g.gain.setValueAtTime(v, t + dt);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
        o.connect(g);
        g.connect(bus);
        o.start(t + dt);
        o.stop(t + dt + 0.25);
      }
    }

    // Now and then: a metal scrape or a breathy whisper somewhere in the dark
    const r = Math.random();
    if (r < 0.07) {
      const src = this.noiseSource(0.6);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 9;
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(380, t + 1.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      const p = ctx.createStereoPanner?.();
      src.connect(f);
      f.connect(g);
      if (p) {
        p.pan.value = Math.random() * 2 - 1;
        g.connect(p);
        p.connect(bus);
      } else g.connect(bus);
      src.start(t, Math.random());
      src.stop(t + 2);
    } else if (r < 0.12) {
      this.burst(bus, t, 1.4, 0.035, 'bandpass', 1200 + Math.random() * 900, 3, 0.5);
    }

    this.menuTimer = window.setTimeout(() => this.menuTick(), 820);
  }

  /** A music-box tine: bright attack, glassy overtone, long decay. */
  private musicBoxNote(out: AudioNode, t: number, f: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const p = ctx.createStereoPanner?.();
    if (p) {
      p.pan.value = (Math.random() - 0.5) * 0.6;
      g.connect(p);
      p.connect(out);
    } else g.connect(out);
    for (const [mult, vol] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      og.gain.value = vol;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 2.9);
    }
  }

  // --- PLAYER BREATHING (out of breath, scared) ---
  /** One breath (inhale + exhale), strength 0..1. */
  public playBreath(strength: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const v = 0.02 + strength * 0.07;
    // Inhale: higher, airy; exhale: lower, longer
    this.burst(this.sfxGain, t, 0.38, v * 0.8, 'bandpass', 1700, 1.2, 0.12);
    this.burst(this.sfxGain, t + 0.42, 0.5, v, 'bandpass', 900, 1.0, 0.06);
  }

  // --- HEARTBEAT & TENSION ---
  public setHeartbeat(bpm: number, active: boolean) {
    if (!this.ctx || !this.musicGain) return;
    this.currentHeartbeatBpm = Math.min(160, Math.max(50, bpm));

    if (active && !this.heartbeatActive) {
      this.heartbeatActive = true;
      this.scheduleHeartbeat();
    } else if (!active && this.heartbeatActive) {
      this.heartbeatActive = false;
      if (this.heartbeatInterval) {
        window.clearTimeout(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }
  }

  private scheduleHeartbeat() {
    if (!this.heartbeatActive || !this.ctx) return;
    
    // Play double thump: "lub-dub"
    this.playHeartThump(0);
    this.playHeartThump(0.18);

    const intervalMs = (60 / this.currentHeartbeatBpm) * 1000;
    this.heartbeatInterval = window.setTimeout(() => {
      this.scheduleHeartbeat();
    }, intervalMs);
  }

  private playHeartThump(delaySec: number) {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime + delaySec;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Frequency drop for punchy organic heartbeat
    osc.frequency.setValueAtTime(75, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.14);

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  // --- SHARED NOISE -----------------------------------------------------
  private noise: AudioBuffer | null = null;
  /** A 2 s white-noise buffer reused by every noisy sound (no allocation per step). */
  private noiseSource(rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    return src;
  }

  /** Short filtered noise burst with an envelope. */
  private burst(out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, attack = 0.003) {
    const ctx = this.ctx!;
    const src = this.noiseSource(0.8 + Math.random() * 0.4);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.setValueAtTime(q, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // --- FOOTSTEPS ---
  /**
   * Human scream ("AAAAH"): a strained voice (sawtooth + vibrato) shaped by the
   * formants of the vowel A, with breath noise. Used in the cassette film.
   */
  public playHumanScream(seconds = 1.8, volume = 0.32) {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(volume, t + 0.08);
    out.gain.setValueAtTime(volume, t + seconds * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    // Slight distortion: a throat at its limit (and a cheap VHS microphone)
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    out.connect(shaper);
    shaper.connect(this.masterGain);
    if (this.reverbSend) shaper.connect(this.reverbSend);

    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(330, t);
    voice.frequency.exponentialRampToValueAtTime(560, t + 0.25);
    voice.frequency.setValueAtTime(560, t + seconds * 0.6);
    voice.frequency.exponentialRampToValueAtTime(380, t + seconds);
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.frequency.value = 6.5;
    vibG.gain.value = 18;
    vib.connect(vibG);
    vibG.connect(voice.frequency);
    // Second voice slightly detuned: rough, cracking
    const voice2 = ctx.createOscillator();
    voice2.type = 'square';
    voice2.frequency.setValueAtTime(337, t);
    voice2.frequency.exponentialRampToValueAtTime(574, t + 0.25);
    voice2.frequency.exponentialRampToValueAtTime(390, t + seconds);
    const v2g = ctx.createGain();
    v2g.gain.value = 0.25;
    voice2.connect(v2g);

    const src = ctx.createGain();
    voice.connect(src);
    v2g.connect(src);
    // Breath noise
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(ng);
    ng.connect(src);

    // Formants of "A": ~800, 1250, 2600 Hz
    for (const [f, q, g] of [[800, 6, 1], [1250, 8, 0.7], [2600, 10, 0.35]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = g;
      src.connect(bp);
      bp.connect(fg);
      fg.connect(out);
    }
    for (const o of [voice, voice2, vib]) {
      o.start(t);
      o.stop(t + seconds + 0.05);
    }
    noise.start(t);
    noise.stop(t + seconds + 0.05);
  }

  /** VHS / TV static (white noise burst with a tape hum), for the cassette film. */
  public playStatic(seconds = 1, volume = 0.18) {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(i / 90));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    g.gain.setValueAtTime(volume, t + Math.max(0.03, seconds - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.masterGain);
    src.start(t);
    src.stop(t + seconds + 0.05);
    // 50 Hz tape hum underneath
    const hum = ctx.createOscillator();
    const hg = ctx.createGain();
    hum.type = 'sawtooth';
    hum.frequency.value = 50;
    hg.gain.setValueAtTime(volume * 0.12, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    hum.connect(hg);
    hg.connect(this.masterGain);
    hum.start(t);
    hum.stop(t + seconds + 0.05);
  }

  /** Foot in shallow water: a wet slap, then droplets falling back. */
  public playSplash(strength = 1) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(1800 + Math.random() * 600, t);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.22);
    const g = ctx.createGain();
    const v = 0.22 * Math.min(1.5, strength);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.25, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.45);
    // Droplets
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      const s = t + 0.08 + Math.random() * 0.25;
      o.type = 'sine';
      o.frequency.setValueAtTime(900 + Math.random() * 900, s);
      o.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 800, s + 0.04);
      og.gain.setValueAtTime(0.0001, s);
      og.gain.exponentialRampToValueAtTime(0.04 * strength, s + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, s + 0.06);
      o.connect(og);
      og.connect(this.sfxGain);
      o.start(s);
      o.stop(s + 0.07);
    }
  }

  public playFootstep(isSprinting: boolean, isCrouching: boolean) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.08;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isCrouching ? 350 : isSprinting ? 950 : 600, t);

    const gain = this.ctx.createGain();
    const vol = isCrouching ? 0.07 : isSprinting ? 0.32 : 0.18;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isSprinting ? 0.09 : 0.06));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  // --- AMBIENCE EVENTS ----------------------------------------------------
  private ambientTimer: number | null = null;

  /** Random far-away noises so the building feels alive (and never safe). */
  private scheduleAmbient() {
    if (this.ambientTimer) window.clearTimeout(this.ambientTimer);
    this.ambientTimer = window.setTimeout(() => {
      if (this.ctx?.state === 'running') this.playAmbientEvent();
      this.scheduleAmbient();
    }, 6000 + Math.random() * 12000);
  }

  private playAmbientEvent() {
    const ctx = this.ctx;
    if (!ctx || !this.ambienceGain) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.ambienceGain);
    // Also feed the reverb: far events are mostly reflections
    if (this.reverbSend) pan.connect(this.reverbSend);
    const r = Math.random();
    if (r < 0.3) {
      // Water drips
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const tt = t + i * (0.35 + Math.random() * 0.5);
        o.type = 'sine';
        o.frequency.setValueAtTime(1400 + Math.random() * 900, tt);
        o.frequency.exponentialRampToValueAtTime(500, tt + 0.06);
        g.gain.setValueAtTime(0.06, tt);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
        o.connect(g);
        g.connect(pan);
        o.start(tt);
        o.stop(tt + 0.1);
      }
    } else if (r < 0.55) {
      // Pipes groaning (metal stress)
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 + Math.random() * 40, t);
      o.frequency.linearRampToValueAtTime(110 + Math.random() * 60, t + 1.6);
      f.type = 'bandpass';
      f.frequency.setValueAtTime(380, t);
      f.Q.setValueAtTime(8, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(f);
      f.connect(g);
      g.connect(pan);
      o.start(t);
      o.stop(t + 2.3);
    } else if (r < 0.75) {
      // Distant creak of a door on its hinges
      this.creak(pan, t, 0.05, 1.2);
    } else if (r < 0.9) {
      // Something falls far away
      this.burst(pan, t, 0.4, 0.12, 'lowpass', 500, 0.8);
      this.burst(pan, t + 0.15, 0.25, 0.05, 'bandpass', 2600, 2);
    } else {
      // Whisper-like breath
      this.burst(pan, t, 1.4, 0.03, 'bandpass', 900 + Math.random() * 600, 6, 0.5);
    }
  }

  /** Hinge creak: a resonant, wobbling squeak. */
  private creak(out: AudioNode, t: number, vol: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260 + Math.random() * 80, t);
    o.frequency.linearRampToValueAtTime(420 + Math.random() * 120, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(300, t + dur);
    lfo.frequency.setValueAtTime(18 + Math.random() * 10, t); // stick-slip of the hinge
    lg.gain.setValueAtTime(40, t);
    lfo.connect(lg);
    lg.connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1100, t);
    f.Q.setValueAtTime(5, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  // --- MONSTER SOUNDS ---
  public playMonsterGrowl(distance: number = 5, pan = 0) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.03, Math.min(0.65, 1.4 / (1 + distance * 0.35)));
    const out = this.pannedOut(pan);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65, t);
    osc1.frequency.linearRampToValueAtTime(45, t + 0.8);
    osc1.frequency.linearRampToValueAtTime(55, t + 1.4);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(68, t);
    osc2.frequency.linearRampToValueAtTime(42, t + 0.8);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(220, t);
    filter.Q.setValueAtTime(4, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 1.6);
    osc2.stop(t + 1.6);
  }

  /** Sedative hit: the creature chokes and slumps. */
  public playSedative() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.burst(this.sfxGain, t, 0.12, 0.3, 'highpass', 3000, 0.8); // needle hiss
    this.playMonsterGrowl(1.5, 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(40, t + 2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 2.2);
  }

  /** Footsteps on concrete stairs (floor change). */
  public playStairs() {
    if (!this.ctx || !this.sfxGain) return;
    for (let i = 0; i < 6; i++) {
      const tt = this.ctx.currentTime + i * 0.17;
      this.burst(this.sfxGain, tt, 0.06, 0.18, 'lowpass', 700, 1);
      this.burst(this.sfxGain, tt + 0.01, 0.03, 0.08, 'bandpass', 2600, 1.5);
    }
  }

  public playMonsterChaseRoar() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Dissonant screamer roar
    [130, 185, 275, 410].forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 1.2);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 1.4);
    });
  }

  public playMonsterFootstep(distance: number = 8, pan = 0, heavy = true) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.0, Math.min(0.55, (heavy ? 1.0 : 0.7) / (1 + distance * 0.32)));
    if (vol < 0.02) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 60 : 48, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.15);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.pannedOut(pan));

    // Wet slap of bare feet on linoleum
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const slap = this.ctx.createBufferSource();
    slap.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(vol * 0.5, t);
    slap.connect(bp);
    bp.connect(sg);
    sg.connect(this.pannedOut(pan));
    slap.start(t);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // --- JUMPSCARE STINGER ---
  public playJumpscareStinger() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Sub-bass hit
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(90, t);
    subOsc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    subGain.gain.setValueAtTime(0.9, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 0.9);

    // High cluster screech
    [780, 840, 915, 1120].forEach((freq) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.3, t + 0.4);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  // --- INTERACTIONS ---
  public playDoorOpen() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.35);
    osc.frequency.linearRampToValueAtTime(180, t + 0.7);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  public playDoorSlam() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);

    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  public playDoorLocked() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    [180, 220].forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.25, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.09);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.1);
    });
  }

  public playDrawerOpen() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(260, t + 0.25);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  public playItemPickup() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(880, t + 0.08);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Mechanical alarm clock ringing (~3 s), quieter with distance. */
  public playAlarmRing(distance = 2) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.03, 0.32 / Math.max(1, distance * 0.35));
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    osc.type = 'square';
    osc2.type = 'triangle';
    osc.frequency.value = 2350;
    osc2.frequency.value = 3120;
    // The hammer hits the bells ~22 times a second
    lfo.type = 'square';
    lfo.frequency.value = 22;
    lfoGain.gain.value = vol * 0.5;
    gain.gain.setValueAtTime(vol * 0.5, t);
    gain.gain.setValueAtTime(vol * 0.5, t + 2.8);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 3.1);
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    for (const o of [osc, osc2, lfo]) {
      o.start(t);
      o.stop(t + 3.15);
    }
  }

  public playFlashlightToggle(isOn: boolean) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isOn ? 1200 : 700, t);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playFlickerHum() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playBreakerClunk() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Heavy mechanical lever clank + spark
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playPaperRustle() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(t);
  }
}

// After a hot-reload the old sound engine would keep playing (e.g. the menu
// music during a game): silence it before creating the new one.
const prevSound = (globalThis as unknown as { __pzSound?: SoundSystem }).__pzSound;
if (prevSound) {
  try {
    prevSound.stopMenuMusic(0.1);
    prevSound.shutdown();
  } catch {
    /* ignore */
  }
}
export const sound = new SoundSystem();
(globalThis as unknown as { __pzSound?: SoundSystem }).__pzSound = sound;
