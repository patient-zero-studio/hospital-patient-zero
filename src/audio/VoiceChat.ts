/**
 * Proximity voice chat between the two players of an online game.
 *
 * Capture: microphone samples (from MicListener) → 16 kHz mono → voice gate →
 * 20 ms μ-law frames (≈ 16 kB/s while talking, nothing while silent) sent as
 * binary WebSocket messages through the game server.
 * Playback: small jitter buffer → resampled to the audio context rate → filters
 * (distance / walls) → gain → stereo pan → master bus (+ a bit of hallway reverb).
 *
 * Plain Web Audio, no WebRTC: works through the Cloudflare link, on 4G and on
 * any phone or PC browser.
 */
import type { GameLink } from '../net/protocol';
import { sound } from './SoundSystem';

const RATE = 16000;
const FRAME = 320; // 20 ms
const HEADER = 0x56; // 'V'
const MAX_BUFFER = RATE; // 1 s ring

// --- μ-law (G.711) ---------------------------------------------------------
const MU_DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let s = ((mantissa << 3) + 0x84) << exponent;
  s -= 0x84;
  MU_DECODE[i] = (sign ? -s : s) / 32768;
}
function muEncode(x: number): number {
  let s = Math.max(-1, Math.min(1, x)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(32635, s + 0x84);
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export class VoiceChat {
  /** [V] / mic button: stop sending your voice. */
  public muted = false;
  /** Settings toggle. */
  public enabled = true;
  /** The partner is talking right now (for the HUD). */
  public partnerTalking = false;
  /** You are being transmitted right now (for the HUD). */
  public selfTalking = false;

  private link: GameLink | null = null;

  // capture state
  private acc = 0;
  private accN = 0;
  private phase = 0;
  private frame = new Float32Array(FRAME);
  private fi = 0;
  private floor = 0.004;
  private hang = 0;
  private selfTimer = 0;

  // playback state
  private ring = new Float32Array(MAX_BUFFER);
  private written = 0;
  private readPos = 0;
  private playing = false;
  private partnerTimer = 0;
  private nodes: {
    ctx: AudioContext;
    proc: ScriptProcessorNode;
    lp: BiquadFilterNode;
    hp: BiquadFilterNode;
    gain: GainNode;
    pan: StereoPannerNode | null;
    rev: GainNode;
  } | null = null;

  public attach(link: GameLink | null) {
    this.link?.setVoiceHandler?.(null);
    this.link = link;
    this.reset();
    link?.setVoiceHandler?.((b) => this.receive(b));
  }

  private reset() {
    this.written = 0;
    this.readPos = 0;
    this.playing = false;
    this.partnerTalking = false;
    this.partnerTimer = 0;
    this.selfTalking = false;
    this.hang = 0;
    this.fi = 0;
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------
  /** Raw microphone samples (any sample rate). */
  public onMic(samples: Float32Array, sampleRate: number) {
    if (!this.link?.sendVoice || this.muted || !this.enabled) return;
    const step = sampleRate / RATE;
    for (let i = 0; i < samples.length; i++) {
      // box-filter decimation (anti-aliasing for free)
      this.acc += samples[i];
      this.accN++;
      this.phase += 1;
      if (this.phase < step) continue;
      this.phase -= step;
      this.frame[this.fi++] = this.acc / this.accN;
      this.acc = 0;
      this.accN = 0;
      if (this.fi === FRAME) {
        this.fi = 0;
        this.flushFrame();
      }
    }
  }

  private flushFrame() {
    const f = this.frame;
    let sum = 0;
    for (let i = 0; i < FRAME; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / FRAME);
    // Adaptive background-noise floor; the gate opens on speech and stays open 400 ms
    if (rms < this.floor * 1.6) this.floor += (rms - this.floor) * 0.05;
    else this.floor += (rms - this.floor) * 0.002;
    this.floor = Math.max(0.0015, Math.min(0.05, this.floor));
    if (rms > Math.max(0.006, this.floor * 2.6)) this.hang = 20;
    else if (this.hang > 0) this.hang--;
    if (this.hang <= 0) return;
    this.selfTimer = 0.25;
    const out = new Uint8Array(FRAME + 1);
    out[0] = HEADER;
    for (let i = 0; i < FRAME; i++) out[i + 1] = muEncode(f[i] * 1.6);
    this.link?.sendVoice?.(out.buffer);
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------
  private receive(b: ArrayBuffer) {
    const bytes = new Uint8Array(b);
    if (bytes.length < 2 || bytes[0] !== HEADER) return;
    if (!this.ensureNodes()) return;
    const n = bytes.length - 1;
    // Too far behind (tab in background, network hiccup): skip ahead, keep ~100 ms
    if (this.written - this.readPos + n > MAX_BUFFER * 0.4) this.readPos = this.written + n - RATE * 0.1;
    for (let i = 0; i < n; i++) this.ring[(this.written + i) % MAX_BUFFER] = MU_DECODE[bytes[i + 1]];
    this.written += n;
    this.partnerTimer = 0.3;
  }

  private ensureNodes(): boolean {
    if (this.nodes) return true;
    const o = sound.voiceOutput();
    if (!o || !o.ctx.createScriptProcessor) return false;
    const ctx = o.ctx;
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    const ratio = RATE / ctx.sampleRate;
    proc.onaudioprocess = (ev) => {
      const out = ev.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i++) {
        const avail = this.written - this.readPos;
        if (!this.playing) {
          // jitter buffer: wait for 80 ms of audio before starting
          if (avail >= RATE * 0.08) this.playing = true;
          else {
            out[i] = 0;
            continue;
          }
        }
        if (avail < 2) {
          this.playing = false;
          out[i] = 0;
          continue;
        }
        const p = Math.floor(this.readPos);
        const t = this.readPos - p;
        const a = this.ring[p % MAX_BUFFER];
        const b = this.ring[(p + 1) % MAX_BUFFER];
        out[i] = a + (b - a) * t;
        this.readPos += ratio;
      }
    };
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const rev = ctx.createGain();
    rev.gain.value = 0.18;
    proc.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(o.out);
    } else gain.connect(o.out);
    gain.connect(rev);
    rev.connect(o.reverb);
    this.nodes = { ctx, proc, lp, hp, gain, pan, rev };
    return true;
  }

  /**
   * Called every frame by the engine.
   * @param volume 0..1 (distance), @param pan -1..1, @param cutoff low-pass Hz (walls / distance)
   */
  public update(delta: number, volume: number, pan: number, cutoff: number, reverb = 0.18) {
    this.partnerTimer = Math.max(0, this.partnerTimer - delta);
    this.selfTimer = Math.max(0, this.selfTimer - delta);
    this.partnerTalking = this.partnerTimer > 0;
    this.selfTalking = this.selfTimer > 0 && !this.muted;
    const n = this.nodes;
    if (!n) return;
    const t = n.ctx.currentTime;
    n.gain.gain.setTargetAtTime(volume * 1.25, t, 0.06);
    n.lp.frequency.setTargetAtTime(cutoff, t, 0.08);
    n.rev.gain.setTargetAtTime(reverb, t, 0.2);
    n.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.06);
  }

  public dispose() {
    this.attach(null);
    const n = this.nodes;
    if (!n) return;
    n.proc.onaudioprocess = null;
    [n.proc, n.hp, n.lp, n.gain, n.pan, n.rev].forEach((x) => x?.disconnect());
    this.nodes = null;
  }
}
