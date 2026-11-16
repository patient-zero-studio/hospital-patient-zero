import type { PlayerController } from './PlayerController';

/**
 * 🎮 Gamepad (Xbox / PlayStation / generic "standard" mapping).
 * Sticks move and look; buttons send the same keys as the keyboard, so every
 * action of the game works without special code.
 *
 *  Left stick  move           Right stick  look
 *  LT / L3     run            A / ✕        interact [E] (+ skip intro)
 *  B / ○       crouch [C]     Y / △        flashlight [F]
 *  X / □       use the selected item       RB / LB  next / previous item
 *  RT          use the selected item       Back     inventory [Tab]
 *  Start       pause [Esc]    D-pad        emotes 6-9 (online)
 */
const DEAD = 0.18;
const BUTTON_KEYS: Record<number, string[]> = {
  0: ['KeyE', 'Space'],
  1: ['KeyC'],
  3: ['KeyF'],
  8: ['Tab'],
  9: ['Escape'],
  12: ['Digit6'],
  13: ['Digit8'],
  14: ['Digit9'],
  15: ['Digit7'],
};

export class GamepadInput {
  private prev: boolean[] = [];
  private moving = false;
  /** a gamepad was used at least once (shown in the HUD) */
  public active = false;

  constructor(
    private player: PlayerController,
    private actions: { useSelected: () => void; cycleSlot: (dir: 1 | -1) => void }
  ) {}

  private key(code: string, down: boolean) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  }

  /** Called every frame. */
  public poll(delta: number) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) {
      if (this.moving) {
        this.player.touchMove.x = 0;
        this.player.touchMove.y = 0;
        this.player.touchSprint = false;
        this.moving = false;
      }
      return;
    }
    const ax = (i: number) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
    };
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;

    // Left stick: move (only takes over when used, so touch controls keep working)
    const mx = ax(0);
    const my = -ax(1);
    if (mx || my) {
      this.player.touchMove.x = mx;
      this.player.touchMove.y = my;
      this.moving = true;
      this.active = true;
    } else if (this.moving) {
      this.player.touchMove.x = 0;
      this.player.touchMove.y = 0;
      this.moving = false;
    }
    // Run: left trigger or click on the left stick
    this.player.touchSprint = pressed(6) || pressed(10);

    // Right stick: look (a bit faster at the edge of the stick)
    const lx = ax(2);
    const ly = ax(3);
    if (lx || ly) {
      const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
      this.player.touchLook(curve(lx) * 900 * delta, curve(ly) * 600 * delta);
      this.active = true;
    }

    // Buttons → keys (press / release)
    pad.buttons.forEach((b, i) => {
      const now = b.pressed;
      const was = this.prev[i] ?? false;
      if (now === was) return;
      this.active = true;
      if (BUTTON_KEYS[i]) for (const code of BUTTON_KEYS[i]) this.key(code, now);
      if (now) {
        if (i === 2 || i === 7) this.actions.useSelected();
        if (i === 5) this.actions.cycleSlot(1);
        if (i === 4) this.actions.cycleSlot(-1);
      }
    });
    this.prev = pad.buttons.map((b) => b.pressed);
  }
}
