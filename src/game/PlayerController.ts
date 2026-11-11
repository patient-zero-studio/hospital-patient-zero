import * as THREE from 'three';
import { sound } from '../audio/SoundSystem';
import { CollisionBox, LowZone } from './MapBuilder';
import { ControlSettings } from '../types';

const RADIUS = 0.32;
const STAND_H = 1.72;
const CROUCH_H = 1.05;

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public position: THREE.Vector3;
  public velocity = new THREE.Vector3();

  public pitch = 0;
  public yaw = 0;

  private keys: Record<string, boolean> = {};
  public isLocked = false;
  /**
   * Fallback when the browser refuses pointer lock (embedded browsers, iframes):
   * the camera follows raw mouse movement and keeps turning near the screen edges.
   */
  public freeLook = false;
  private cursorX = 0.5;
  private cursorY = 0.5;
  private cursorInside = false;
  /** Touch screen: virtual joystick (x = right, y = forward, -1..1) and run toggle. */
  public touchMove = { x: 0, y: 0 };
  public touchSprint = false;
  /** When false, input is ignored (menus, death…). */
  public inputEnabled = false;

  public isCrouching = false;
  public isSprinting = false;
  public stamina = 100;
  public maxStamina = 100;
  private exhausted = false;
  public flashlightOn = true;
  public flashlightBattery = 100;
  public isHidden = false;
  public currentHidingSpotId: string | null = null;

  // Flashlight rig: the light lags slightly behind the view for a hand-held feel
  public flashlight: THREE.SpotLight;
  public flashlightTarget: THREE.Object3D;
  private flashQuat = new THREE.Quaternion();
  private flickerTimer = 0;

  public settings: ControlSettings = {
    mouseSensitivity: 1.0,
    invertY: false,
    headBob: true,
    shadowsEnabled: true,
    performanceMode: false,
    micEnabled: true,
    micSensitivity: 1,
    voiceChat: true,
  };

  private walkSpeed = 3.2;
  private sprintSpeed = 6.0;
  private crouchSpeed = 1.6;
  /** Stamina drain per second while sprinting. */
  private sprintDrain = 22;
  /** Daily challenge modifiers (set by the engine on every reset). */
  public batteryDrainMul = 1;
  public noSprint = false;

  /**
   * Versus: the local player IS the creature (no flashlight, no hiding,
   * slower walk but long sprints, no human footsteps).
   */
  public monsterMode = false;
  /** Low passages (air duct): only crawling (crouched) gets you in, never the creature. */
  public lowZones: LowZone[] = [];

  private inLow(x: number, z: number, r = RADIUS) {
    return this.lowZones.some((l) => x + r > l.minX && x - r < l.maxX && z + r > l.minZ && z - r < l.maxZ);
  }

  /** Crawling inside the duct right now. */
  public get inDuct() {
    return this.inLow(this.position.x, this.position.z, 0);
  }

  public setMonsterMode(on: boolean) {
    this.monsterMode = on;
    this.walkSpeed = on ? 2.9 : 3.2;
    this.sprintSpeed = on ? 5.7 : 6.0;
    this.crouchSpeed = on ? 1.7 : 1.6;
    this.sprintDrain = on ? 11 : 22;
    if (on) {
      this.flashlightOn = false;
      this.flashlight.intensity = 0;
    }
  }
  private footstepTimer = 0;
  private bobPhase = 0;
  /** Idle breathing sway: the view is never perfectly still, like a real body. */
  private breathT = 0;
  private bobAmount = 0;
  private roll = 0;
  private eyeHeight = STAND_H;
  /** Screen shake amount 0..1 (set from outside, decays here). */
  public shake = 0;

  public raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);

  private listeners: [string, EventListener][] = [];

  constructor(camera: THREE.PerspectiveCamera, startPos: THREE.Vector3, startYaw = 0) {
    this.camera = camera;
    this.position = startPos.clone();
    this.yaw = startYaw;
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.raycaster.far = 2.4;

    this.flashlight = new THREE.SpotLight(0xfff1dc, 60, 24, Math.PI / 6.2, 0.55, 2);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 24;
    this.flashlight.shadow.bias = -0.0004;
    this.flashlight.shadow.normalBias = 0.02;
    this.flashlightTarget = new THREE.Object3D();
    this.flashlight.target = this.flashlightTarget;

    this.applyCameraRotation();
    this.flashQuat.copy(this.camera.quaternion);
    this.setupInputs();
  }

  private on(type: string, fn: EventListener) {
    window.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  private setupInputs() {
    this.on('keydown', ((e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (!this.inputEnabled || e.repeat) return;
      if (e.code === 'KeyF' && !this.isHidden && !this.monsterMode) this.toggleFlashlight();
      if (e.code === 'KeyC' && !this.isHidden) this.isCrouching = !this.isCrouching;
    }) as EventListener);

    this.on('keyup', ((e: KeyboardEvent) => {
      this.keys[e.code] = false;
    }) as EventListener);

    // Avoid "stuck keys" when the window loses focus
    this.on('blur', () => {
      this.keys = {};
    });

    this.on('mousemove', ((e: MouseEvent) => {
      this.cursorX = e.clientX / window.innerWidth;
      this.cursorY = e.clientY / window.innerHeight;
      this.cursorInside = true;
      if (!this.inputEnabled || (!this.isLocked && !this.freeLook)) return;
      // Ignore absurd spikes some browsers send when the pointer gets locked
      const mx = Math.abs(e.movementX) > 400 ? 0 : e.movementX;
      const my = Math.abs(e.movementY) > 400 ? 0 : e.movementY;
      this.rotateView(mx, my);
    }) as EventListener);

    // Stop edge-turning when the cursor leaves the window
    this.on('mouseout', ((e: MouseEvent) => {
      if (!e.relatedTarget) this.cursorInside = false;
    }) as EventListener);
  }

  /** Touch screen: drag a finger to look around. */
  public touchLook(dx: number, dy: number) {
    if (!this.inputEnabled) return;
    this.rotateView(dx * 1.7, dy * 1.7);
  }

  /** Touch button: crouch / stand up. */
  public toggleCrouch() {
    if (this.inputEnabled && !this.isHidden) this.isCrouching = !this.isCrouching;
  }

  private rotateView(mx: number, my: number) {
    const sens = 0.0021 * this.settings.mouseSensitivity;
    this.yaw -= mx * sens;
    this.pitch += my * sens * (this.settings.invertY ? 1 : -1);
    // Inside a locker the view is restricted to the vent slit
    const maxPitch = this.isHidden ? 0.25 : Math.PI / 2.15;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -maxPitch, maxPitch);
    if (this.isHidden && this.hideYaw !== null) {
      let d = this.yaw - this.hideYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw = this.hideYaw + THREE.MathUtils.clamp(d, -0.6, 0.6);
    }
  }

  /** Free-look mode: keep turning while the cursor rests near a screen edge. */
  private edgeTurn(delta: number) {
    if (!this.freeLook || this.isLocked || !this.inputEnabled || !this.cursorInside) return;
    const zone = 0.12;
    const speed = 900 * delta; // in "pixels" of mouse movement per second
    const fx = this.cursorX < zone ? -(1 - this.cursorX / zone) : this.cursorX > 1 - zone ? (this.cursorX - (1 - zone)) / zone : 0;
    const fy = this.cursorY < zone ? -(1 - this.cursorY / zone) : this.cursorY > 1 - zone ? (this.cursorY - (1 - zone)) / zone : 0;
    if (fx || fy) this.rotateView(fx * speed, fy * speed * 0.6);
  }

  public toggleFlashlight() {
    if (this.flashlightBattery <= 0) {
      sound.playFlashlightToggle(false);
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    sound.playFlashlightToggle(this.flashlightOn);
  }

  private applyCameraRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, this.roll);
  }

  /** 0..1 how easy the player is to spot. */
  public get visibility(): number {
    if (this.isHidden) return 0;
    let v = this.flashlightOn ? 1 : 0.3;
    if (this.isCrouching) v *= 0.55;
    if (this.isSprinting) v = Math.max(v, 0.7);
    return v;
  }

  public update(delta: number, boxes: CollisionBox[], onNoise: (origin: THREE.Vector3, loudness: number) => void) {
    this.edgeTurn(delta);

    // --- Flashlight battery & flicker ---
    if (this.flashlightOn) {
      this.flashlightBattery = Math.max(0, this.flashlightBattery - delta * 0.3 * this.batteryDrainMul);
      if (this.flashlightBattery <= 0) {
        this.flashlightOn = false;
        sound.playFlashlightToggle(false);
      }
    }
    let intensity = 0;
    if (this.flashlightOn) {
      intensity = 60 * (0.55 + 0.45 * Math.min(1, this.flashlightBattery / 35));
      if (this.flashlightBattery < 20) {
        this.flickerTimer -= delta;
        if (this.flickerTimer <= 0) {
          this.flickerTimer = Math.random() * 0.5;
          if (Math.random() < 0.35) intensity *= Math.random() * 0.3;
        }
      }
    }
    this.flashlight.intensity = THREE.MathUtils.damp(this.flashlight.intensity, intensity, 30, delta);

    // --- Movement input ---
    const k = this.keys;
    const active = this.inputEnabled && !this.isHidden;
    const tm = this.touchMove;
    const fwd = active ? THREE.MathUtils.clamp((k['KeyW'] || k['KeyZ'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0) + tm.y, -1, 1) : 0;
    const strafe = active ? THREE.MathUtils.clamp((k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['KeyQ'] || k['ArrowLeft'] ? 1 : 0) + tm.x, -1, 1) : 0;
    // Analog stick: push it a little to walk slowly
    const stick = Math.min(1, Math.hypot(fwd, strafe));
    const moving = stick > 0.08;

    // --- Stamina ---
    // In the duct you stay on all fours
    const low = !this.monsterMode && this.inLow(this.position.x, this.position.z);
    if (low && !this.isHidden) this.isCrouching = true;
    const wantsSprint = active && !low && !this.noSprint && (k['ShiftLeft'] || k['ShiftRight'] || this.touchSprint) && fwd > 0.3;
    if (this.stamina < 1) this.exhausted = true;
    if (this.exhausted && this.stamina > 30) this.exhausted = false;
    if (wantsSprint && moving && !this.exhausted) {
      if (this.isCrouching) this.isCrouching = false;
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - delta * this.sprintDrain);
    } else {
      this.isSprinting = false;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * (moving ? 10 : 18));
    }

    const speed = this.isCrouching ? this.crouchSpeed : this.isSprinting ? this.sprintSpeed : this.walkSpeed;
    const wish = new THREE.Vector3();
    if (moving) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      wish.set(-sin * fwd + cos * strafe, 0, -cos * fwd - sin * strafe).normalize().multiplyScalar(speed * stick);
    }
    // Smooth acceleration / deceleration
    const accel = moving ? 10 : 12;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x, accel, delta);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z, accel, delta);
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (!this.isHidden) this.moveWithCollision(this.velocity.x * delta, this.velocity.z * delta, boxes);

    // --- Footsteps & noise ---
    if (horizSpeed > 0.6 && !this.isHidden) {
      this.footstepTimer -= delta * (horizSpeed / speed || 1);
      if (this.footstepTimer <= 0) {
        if (!this.monsterMode) sound.playFootstep(this.isSprinting, this.isCrouching);
        this.footstepTimer = this.isSprinting ? 0.32 : this.isCrouching ? 0.7 : 0.5;
        if (this.isSprinting) onNoise(this.position, 16);
        else if (!this.isCrouching) onNoise(this.position, 5.5);
      }
    } else {
      this.footstepTimer = 0.15;
    }

    // --- Camera: crouch height, head bob, strafe roll, shake ---
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, this.isCrouching ? CROUCH_H : STAND_H, 10, delta);
    const bobTarget = this.settings.headBob && horizSpeed > 0.6 ? Math.min(1, horizSpeed / this.walkSpeed) : 0;
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, bobTarget, 8, delta);
    this.bobPhase += delta * (this.isSprinting ? 13 : this.isCrouching ? 6 : 9.5);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * this.bobAmount * (this.isSprinting ? 1.5 : 1);
    const bobX = Math.sin(this.bobPhase) * 0.03 * this.bobAmount;
    this.breathT += delta * (this.isSprinting ? 2.2 : 1 + (1 - this.stamina / this.maxStamina) * 1.5);
    const breathY = this.settings.headBob ? Math.sin(this.breathT * 1.25) * 0.007 : 0;
    const rollTarget = this.settings.headBob
      ? -strafe * 0.025 + Math.sin(this.bobPhase) * 0.006 * this.bobAmount + Math.sin(this.breathT * 0.55) * 0.0035
      : 0;
    this.roll = THREE.MathUtils.damp(this.roll, rollTarget, 6, delta);

    this.shake = Math.max(0, this.shake - delta * 1.6);
    const sh = this.shake * this.shake * 0.12;

    if (!this.isHidden) {
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.camera.position.set(
        this.position.x + right.x * bobX + (Math.random() - 0.5) * sh,
        this.eyeHeight + bobY + breathY - 0.03 + (Math.random() - 0.5) * sh,
        this.position.z + right.z * bobX + (Math.random() - 0.5) * sh
      );
    }
    this.applyCameraRotation();

    // --- Flashlight follows the camera with a little lag ---
    this.flashQuat.slerp(this.camera.quaternion, 1 - Math.exp(-14 * delta));
    const offset = new THREE.Vector3(0.18, -0.2, 0.05).applyQuaternion(this.camera.quaternion);
    this.flashlight.position.copy(this.camera.position).add(offset);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flashQuat);
    this.flashlightTarget.position.copy(this.flashlight.position).addScaledVector(dir, 5);
    this.flashlightTarget.updateMatrixWorld();
  }

  private blocked(x: number, z: number, boxes: CollisionBox[]) {
    if ((this.monsterMode || !this.isCrouching) && this.inLow(x, z)) return true;
    for (const b of boxes) {
      if (b.disabled) continue;
      if (x + RADIUS > b.min.x && x - RADIUS < b.max.x && z + RADIUS > b.min.z && z - RADIUS < b.max.z) return true;
    }
    return false;
  }

  private moveWithCollision(dx: number, dz: number, boxes: CollisionBox[]) {
    // Sub-step to avoid tunnelling through thin walls at high speed
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < steps; i++) {
      const nx = this.position.x + dx / steps;
      if (!this.blocked(nx, this.position.z, boxes)) this.position.x = nx;
      else this.velocity.x = 0;
      const nz = this.position.z + dz / steps;
      if (!this.blocked(this.position.x, nz, boxes)) this.position.z = nz;
      else this.velocity.z = 0;
    }
  }

  // --- Hiding -------------------------------------------------------------
  private hideYaw: number | null = null;

  public enterHiding(spotId: string, spotPos: THREE.Vector3, viewDir: THREE.Vector3) {
    this.isHidden = true;
    this.currentHidingSpotId = spotId;
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(spotPos).addScaledVector(viewDir, 0.18);
    this.yaw = Math.atan2(-viewDir.x, -viewDir.z);
    this.hideYaw = this.yaw;
    this.pitch = -0.05;
    this.isCrouching = false;
    // Light off while hidden (it would give you away), restored when you come out
    this.lightBeforeHiding = this.flashlightOn;
    if (this.flashlightOn) {
      this.flashlightOn = false;
      sound.playFlashlightToggle(false);
    }
  }

  private lightBeforeHiding = false;

  public exitHiding(exitPos: THREE.Vector3) {
    this.isHidden = false;
    this.currentHidingSpotId = null;
    this.hideYaw = null;
    if (this.lightBeforeHiding && this.flashlightBattery > 0 && !this.flashlightOn) {
      this.flashlightOn = true;
      sound.playFlashlightToggle(true);
    }
    this.lightBeforeHiding = false;
    this.position.set(exitPos.x, STAND_H, exitPos.z);
    this.camera.position.set(exitPos.x, this.eyeHeight, exitPos.z);
  }

  /** Move instantly (stairs) without touching battery / stamina. */
  public teleport(pos: THREE.Vector3, yaw: number) {
    this.position.set(pos.x, STAND_H, pos.z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.camera.position.set(pos.x, this.eyeHeight, pos.z);
    this.applyCameraRotation();
    this.flashQuat.copy(this.camera.quaternion);
  }

  public reset(pos: THREE.Vector3, yaw: number) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.stamina = 100;
    this.exhausted = false;
    this.flashlightBattery = 100;
    this.flashlightOn = true;
    this.isHidden = false;
    this.hideYaw = null;
    this.isCrouching = false;
    this.isSprinting = false;
    this.currentHidingSpotId = null;
    this.shake = 0;
    this.eyeHeight = STAND_H;
    this.camera.position.set(pos.x, STAND_H, pos.z);
    this.applyCameraRotation();
    this.flashQuat.copy(this.camera.quaternion);
  }

  /**
   * What the player is pointing at. `origin` overrides the ray start (the
   * creature's head in third person), still aiming where the camera looks.
   */
  public getInteractiveTarget(meshes: THREE.Object3D[], origin?: THREE.Vector3): THREE.Intersection | null {
    if (this.isHidden) return null;
    this.raycaster.setFromCamera(this.center, this.camera);
    if (origin) this.raycaster.ray.origin.copy(origin);
    this.raycaster.far = origin ? 2.8 : 2.4;
    const hits = this.raycaster.intersectObjects(meshes, true);
    return hits.length > 0 ? hits[0] : null;
  }

  public dispose() {
    for (const [type, fn] of this.listeners) window.removeEventListener(type, fn);
    this.listeners = [];
  }
}
