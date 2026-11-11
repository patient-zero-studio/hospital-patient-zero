/**
 * "Cassette 2": Dr Moreau's last message, filmed alone with a camcorder in the
 * director's office (19 March 1987). He confesses… and the door behind him opens.
 * Same VHS screen and voice chain as the experiment film. About 1 minute, skippable.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ProceduralTextures as Tex } from '../textures/ProceduralTextures';
import { MonsterAI } from '../game/MonsterAI';
import { sound } from '../audio/SoundSystem';
import { CAST, type Frame, loadVoices, makeNoise, type Mode, playLine, useStopKeys, VhsScreen } from './ExperimentFilm';

const LEN = 63.5;

/** [start (s), file, length (s), subtitle] — all said by Moreau */
const LINES: [number, string, number, string][] = [
  [4.5, 'd1', 5.37, 'DR MOREAU — Si vous regardez cette cassette… c\'est que je suis mort. Je m\'appelle Henri Moreau.'],
  [11.3, 'd2', 7.02, 'DR MOREAU — Le sujet zéro s\'appelait Lucas. Il avait 19 ans. Il était venu pour une simple fièvre.'],
  [20.0, 'd3', 4.44, 'DR MOREAU — Le Ministère voulait une arme. Je leur ai donné… un monstre.'],
  [28.0, 'd4', 6.25, 'DR MOREAU — Écoutez-moi bien. Il ne voit presque rien. Mais il entend tout. Ne courez jamais.'],
  [35.6, 'd5', 5.36, 'DR MOREAU — Les sédatifs ne le retiennent plus. Il apprend. Il se souvient des cachettes.'],
  [42.6, 'd6', 5.32, 'DR MOREAU — Il est descendu dans les égouts. Si vous sortez par là-dessous… ne faites aucun bruit.'],
  [50.0, 'd7', 1.8, 'DR MOREAU (à voix basse) — Pardonne-moi, Lucas.'],
];
const lineEnd = (l: (typeof LINES)[number]) => l[0] + l[2] / CAST.moreau.rate + 0.35;

const DOOR = new THREE.Vector3(1.4, 0, -3.15);
const ATTACK = 52.4;

export const MoreauTape: React.FC<{ onClose: (watchedToEnd: boolean) => void }> = ({ onClose }) => {
  const mount = useRef<HTMLDivElement>(null);
  const noise = useRef<HTMLCanvasElement>(null);
  const [f, setF] = useState<Frame>({ mode: 'blue', cam: '', clock: '', sub: null, glitch: 0, flash: false, end: null });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const host = mount.current!;
    const W = 480;
    const H = 270;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;filter:blur(0.8px) contrast(1.25) saturate(0.6) sepia(0.3) brightness(1.05);';
    host.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T) => {
      disposables.push(o);
      return o;
    };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040404);
    scene.fog = new THREE.FogExp2(0x040404, 0.09);
    const hemi = new THREE.HemisphereLight(0x8a8478, 0x1a1410, 0.3);
    scene.add(hemi);

    const mat = (c: number, r = 0.6, m = 0) => track(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
    const box = (w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };

    // ---- The office ----
    const wallTex = Tex.getDirtyWallTexture().clone();
    wallTex.needsUpdate = true;
    wallTex.repeat.set(2, 1);
    track(wallTex);
    const room = new THREE.Mesh(
      track(new THREE.BoxGeometry(6, 3, 6)),
      track(new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.9 }))
    );
    room.position.set(0, 1.5, -0.5);
    scene.add(room);
    const floorTex = Tex.getFloorTileTexture().clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(2, 2);
    track(floorTex);
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(6, 6)), track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, color: 0x9a8a78 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.002, -0.5);
    scene.add(floor);

    const wood = mat(0x4a3220, 0.7);
    const dark = mat(0x1c1c1e, 0.5, 0.5);
    // Desk between Moreau and the camera
    const desk = new THREE.Group();
    desk.position.set(0, 0, -0.35);
    box(1.7, 0.06, 0.85, wood, desk, 0, 0.76, 0);
    box(1.65, 0.7, 0.05, wood, desk, 0, 0.38, 0.4);
    scene.add(desk);
    // Papers, an ashtray, a bottle
    const paper = mat(0xd8d2c0, 0.95);
    for (const [x, z, r] of [[0.35, -0.1, 0.3], [0.5, 0.05, -0.2], [-0.2, 0.15, 0.1]]) {
      const p = box(0.21, 0.004, 0.29, paper, desk, x, 0.795, z);
      p.rotation.y = r;
    }
    box(0.08, 0.26, 0.08, track(new THREE.MeshStandardMaterial({ color: 0x3a2a10, transparent: true, opacity: 0.8, roughness: 0.1 })), desk, 0.7, 0.92, -0.2);
    // Desk lamp (the only light)
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-0.6, 0.79, -0.1);
    box(0.16, 0.03, 0.16, dark, lampGroup, 0, 0, 0);
    box(0.025, 0.35, 0.025, dark, lampGroup, 0, 0.18, 0);
    const shade = new THREE.Mesh(track(new THREE.ConeGeometry(0.13, 0.16, 16, 1, true)), track(new THREE.MeshStandardMaterial({ color: 0x1e4a2a, side: THREE.DoubleSide, roughness: 0.4 })));
    shade.position.set(0, 0.38, 0);
    lampGroup.add(shade);
    const bulbMat = track(new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc870, emissiveIntensity: 2 }));
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.04, 10, 8)), bulbMat);
    bulb.position.set(0, 0.32, 0);
    lampGroup.add(bulb);
    desk.add(lampGroup);
    const lamp = new THREE.PointLight(0xffc880, 3, 6, 1.5);
    lamp.position.set(-0.6, 1.12, -0.3);
    scene.add(lamp);
    // Filing cabinet, chair, a framed diploma
    box(0.5, 1.3, 0.55, mat(0x5a5e60, 0.5, 0.6), scene, -2.4, 0.65, -2.9);
    const chair = new THREE.Group();
    chair.position.set(0, 0, -1.05);
    box(0.5, 0.06, 0.5, dark, chair, 0, 0.48, 0);
    box(0.5, 0.65, 0.06, dark, chair, 0, 0.82, -0.24);
    scene.add(chair);
    box(0.5, 0.38, 0.02, wood, scene, -1.2, 1.9, -3.48);

    // The door behind him (opens slowly into the dark corridor)
    const doorway = new THREE.Mesh(track(new THREE.PlaneGeometry(1.0, 2.35)), track(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    doorway.position.set(DOOR.x, 1.175, -3.49);
    scene.add(doorway);
    box(0.08, 2.4, 0.06, wood, scene, DOOR.x - 0.54, 1.2, -3.47);
    box(0.08, 2.4, 0.06, wood, scene, DOOR.x + 0.54, 1.2, -3.47);
    box(1.16, 0.08, 0.06, wood, scene, DOOR.x, 2.4, -3.47);
    const hinge = new THREE.Group();
    hinge.position.set(DOOR.x - 0.5, 0, -3.46);
    box(1.0, 2.35, 0.05, mat(0x5a4028, 0.7), hinge, 0.5, 1.175, 0);
    box(0.06, 0.06, 0.08, mat(0xb8a070, 0.3, 0.8), hinge, 0.88, 1.05, 0.05);
    scene.add(hinge);
    const corridor = new THREE.PointLight(0xff2010, 0, 3.5, 1.6);
    corridor.position.set(DOOR.x, 2.1, -3.0);
    scene.add(corridor);
    // Dim red spill in front of the doorway, so the creature's shape reads
    const spill = new THREE.SpotLight(0xff3a26, 0, 5, 0.55, 0.6, 1.2);
    spill.position.set(DOOR.x - 0.3, 2.3, -1.6);
    spill.target.position.set(DOOR.x, 1.2, -3.2);
    scene.add(spill, spill.target);

    // Dr Moreau, seated, facing the camcorder
    const moreau = new THREE.Group();
    const coat = mat(0xa8a49a, 0.9);
    const skin = mat(0x9a7260, 0.65);
    const darkFeature = mat(0x140e0c, 0.8);
    const body = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.22, 0.7, 4, 12)), coat);
    body.position.y = 0.9;
    body.scale.set(1.0, 1, 0.8);
    moreau.add(body);
    // Shirt, tie, open coat
    const shirt = box(0.16, 0.3, 0.02, mat(0x5a6878, 0.8), moreau, 0, 1.2, 0.17);
    shirt.rotation.x = -0.12;
    const tie = box(0.045, 0.26, 0.025, mat(0x5a1414, 0.6), moreau, 0, 1.18, 0.185);
    tie.rotation.x = -0.12;
    const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10)), skin);
    neck.position.y = 1.4;
    moreau.add(neck);
    const headG = new THREE.Group();
    headG.position.y = 1.57;
    headG.scale.setScalar(1.25);
    moreau.add(headG);
    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.13, 18, 14)), skin);
    head.scale.set(0.9, 1.15, 0.95);
    headG.add(head);
    // Receding grey hair: sides and back only
    const hair = new THREE.Mesh(track(new THREE.SphereGeometry(0.135, 16, 12, Math.PI * 0.15, Math.PI * 1.7, 0.3, 1.5)), mat(0x6a6864, 0.9));
    hair.scale.set(0.92, 1.1, 0.97);
    hair.rotation.y = Math.PI;
    headG.add(hair);
    // Face: eyes, brows, glasses, mouth, grey stubble
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.014, 8, 6)), darkFeature);
      eye.position.set(0.042 * s, 0.025, 0.112);
      headG.add(eye);
      const brow = box(0.045, 0.01, 0.012, mat(0x3a3836, 0.9), headG, 0.044 * s, 0.058, 0.115);
      brow.rotation.z = -0.15 * s;
      const lens = new THREE.Mesh(track(new THREE.TorusGeometry(0.026, 0.004, 5, 14)), mat(0x1a1612, 0.3, 0.7));
      lens.position.set(0.043 * s, 0.025, 0.126);
      headG.add(lens);
    }
    box(0.032, 0.004, 0.006, mat(0x1a1612, 0.3, 0.7), headG, 0, 0.027, 0.13);
    const mouth = box(0.05, 0.008, 0.01, mat(0x3a1a16, 0.8), headG, 0, -0.06, 0.112);
    box(0.13, 0.07, 0.02, mat(0x5e5650, 1), headG, 0, -0.07, 0.1).material = track(new THREE.MeshStandardMaterial({ color: 0x5e5650, roughness: 1, transparent: true, opacity: 0.45 }));
    // Blood on the coat
    const blood = new THREE.Mesh(track(new THREE.PlaneGeometry(0.22, 0.3)), track(new THREE.MeshStandardMaterial({ map: Tex.getBloodDecalTexture(1), transparent: true, depthWrite: false })));
    blood.position.set(0.12, 1.0, 0.185);
    moreau.add(blood);
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.28 * side, 1.27, 0);
      const fore = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.06, 0.5, 3, 8)), coat);
      fore.position.y = -0.28;
      arm.add(fore);
      const hand = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 10, 8)), skin);
      hand.position.y = -0.6;
      hand.scale.set(1, 1.2, 0.7);
      arm.add(hand);
      arm.rotation.x = -0.9; // hands on the desk
      moreau.add(arm);
      arms.push(arm);
    }
    moreau.position.set(0, -0.2, -1.0);
    scene.add(moreau);

    // The creature
    const monster = new MonsterAI(DOOR.clone(), new Map(), [], new Map(), () => {});
    monster.mesh.visible = false;
    scene.add(monster.mesh);

    const cam = new THREE.PerspectiveCamera(55, W / H, 0.05, 30);
    const CAM = { pos: new THREE.Vector3(0.05, 1.34, 0.95), look: new THREE.Vector3(0.22, 1.16, -1.6) };

    const drawNoise = makeNoise(noise.current!);

    // ---- Timeline ----
    const fired = new Set<string>();
    const once = (k: string, t: number, at: number, fn: () => void) => {
      if (t >= at && !fired.has(k)) {
        fired.add(k);
        fn();
      }
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
    const ease = (k: number) => {
      const c = Math.max(0, Math.min(1, k));
      return c * c * (3 - 2 * c);
    };
    const start = performance.now();
    let last = start;
    let raf = 0;
    let lastUi = '';
    sound.init();
    sound.resume();
    const buffers = new Map<string, AudioBuffer>();
    const playing: AudioBufferSourceNode[] = [];
    const spoken = new Set<number>();
    let alive = true;
    loadVoices(LINES.map((l) => l[1]), buffers, () => alive);
    const doorLook = Math.atan2(DOOR.x - moreau.position.x, DOOR.z - moreau.position.z);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let mode: Mode = 'cam';
      if (t < 2.5) mode = 'blue';
      else if (t < 3.3) mode = 'static';
      else if (t >= 53.0 && t < 53.6) mode = 'black';
      else if (t >= 54.2 && t < 56.5) mode = 'static';
      else if (t >= 56.5) mode = 'black';
      let glitch = 0;
      if (t > 25.5 && t < 26.1) glitch = 0.35;
      else if (t > 42 && t < 42.8) glitch = 0.3;
      else if (t > ATTACK && t < 53) glitch = 0.6 + Math.random() * 0.4;
      else if (Math.random() < 0.008) glitch = 0.35;

      // Sound
      once('s0', t, 0.05, () => sound.playStatic(0.5, 0.12));
      once('s1', t, 2.5, () => sound.playStatic(0.8, 0.2));
      once('bang1', t, 25.5, () => sound.playDistantSlam(0.5));
      once('bang2', t, 26.8, () => sound.playDistantSlam(0.3));
      once('hb', t, 30, () => sound.setHeartbeat(80, true));
      once('growlFar', t, 37.5, () => sound.playMonsterGrowl(9, 0.4));
      once('creak', t, 42.0, () => sound.playDoorOpen());
      once('hb2', t, 45, () => sound.setHeartbeat(115, true));
      once('growl', t, 48.2, () => sound.playMonsterGrowl(3, 0.35));
      once('breath', t, 49.2, () => sound.playBreath?.(0.8));
      once('roar', t, ATTACK, () => {
        sound.setHeartbeat(60, false);
        sound.playMonsterChaseRoar();
      });
      once('scream', t, 52.6, () => sound.playHumanScream(1.4, 0.3));
      once('st1', t, 53.0, () => sound.playStatic(0.5, 0.2));
      once('jump', t, 53.6, () => sound.playScreamer());
      once('st2', t, 54.2, () => sound.playStatic(2.3, 0.24));
      once('end', t, LEN, () => closeRef.current(true));

      LINES.forEach((l, i) => {
        if (t >= l[0] && !spoken.has(i)) {
          spoken.add(i);
          const b = buffers.get(l[1]);
          if (b && t - l[0] < 0.5) {
            const s = playLine(b, 'moreau', i === LINES.length - 1 ? 0.55 : 1);
            if (s) playing.push(s);
          }
        }
      });

      // ---- Acting ----
      const talking = LINES.some((l) => t >= l[0] && t < lineEnd(l));
      const alive2 = t < 52.9;
      moreau.visible = alive2;
      if (alive2) {
        // Leans in to start the recording, then sits back
        const lean = t < 4.3 ? Math.sin(Math.max(0, t - 3.3) * Math.PI) * 0.35 : 0;
        moreau.position.z = -1.0 + lean;
        // Turning towards the bangs, then towards the door at the end
        let turn = 0;
        if (t > 25.6 && t < 28) turn = ease((t - 25.6) / 0.5) * (1 - ease((t - 27.3) / 0.6));
        if (t > 51.6) turn = ease((t - 51.6) / 0.6);
        moreau.rotation.y = turn * doorLook * 0.9;
        headG.rotation.y = turn * 0.4;
        // Nods while he talks, trembles more and more
        const fear = Math.max(0, (t - 25) / 25);
        mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 13)) * 2.5 : 1;
        headG.rotation.x = (talking ? Math.sin(t * 5.3) * 0.05 : 0.08) + Math.sin(t * 31) * 0.006 * fear;
        moreau.position.x = Math.sin(t * 27) * 0.004 * fear;
        arms[0].rotation.x = -0.9 + (talking ? Math.sin(t * 2.1) * 0.12 : 0);
        arms[1].rotation.x = t > 49 && t < 51.6 ? lerp(-0.9, -1.6, (t - 49) / 0.8) : -0.9 + (talking ? Math.sin(t * 1.7 + 1) * 0.1 : 0);
        chair.rotation.z = 0;
      } else chair.rotation.z = 1.2;

      // Door
      const open = t > 42 ? ease((t - 42) / 5) * 1.25 : 0;
      hinge.rotation.y = -open;
      corridor.intensity = t > 42 ? (Math.random() < 0.08 ? 0.8 : 4) : 0;
      spill.intensity = t > 43.5 && t < 53.6 ? (Math.random() < 0.1 ? 3 : 9) * Math.min(1, (t - 43.5) / 3) : 0;

      // The creature: in the doorway, then on him, then on the camera
      monster.mesh.visible = t > 43.5 && !(t >= 53 && t < 53.6);
      if (t <= ATTACK) {
        const k = ease((t - 43.5) / 6);
        monster.mesh.position.set(DOOR.x, 0, lerp(DOOR.z - 0.6, DOOR.z + 0.15, k));
        monster.mesh.rotation.y = Math.atan2(moreau.position.x - DOOR.x, moreau.position.z - DOOR.z);
        monster.animateFilm(dt, t > 48);
      } else if (t < 53.6) {
        const k = Math.min(1, (t - ATTACK) / 0.45);
        const head = new THREE.Vector3(0, 1.3, -1.0);
        monster.poseLunge(head, k * 0.35);
        monster.mesh.position.lerpVectors(new THREE.Vector3(DOOR.x, 0, DOOR.z + 0.15), new THREE.Vector3(0.25, 0, -1.5), k);
      } else {
        const k = Math.min(1, (t - 53.6) / 0.55);
        monster.poseLunge(cam.position, 0.35);
        monster.mesh.position.lerpVectors(new THREE.Vector3(0.25, 0, -0.9), new THREE.Vector3(cam.position.x * 0.9, 0, cam.position.z - 0.55), k);
        monster.mesh.rotation.y = Math.atan2(cam.position.x - monster.mesh.position.x, cam.position.z - monster.mesh.position.z);
      }

      // Lamp: steady, then it flickers when it comes, then it dies
      let li = 3;
      if (t > 47 && Math.random() < 0.12) li = 0.8;
      if (t > ATTACK) li = Math.random() < 0.5 ? 0 : 1.6;
      if (t > 53.6) li = Math.random() < 0.3 ? 2 : 0.4;
      lamp.intensity = li;
      bulbMat.emissiveIntensity = li / 1.5;

      // Hand-held camcorder: tiny drift, knocked over at the attack
      cam.position.copy(CAM.pos);
      cam.position.x += Math.sin(t * 0.7) * 0.006;
      cam.position.y += Math.sin(t * 0.5) * 0.004;
      cam.lookAt(CAM.look);
      if (t > ATTACK && t < 53) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 0));
      if (t > 53.6) cam.rotation.z = 0.25;

      if (mode === 'cam') renderer.render(scene, cam);
      if (mode !== 'blue' && mode !== 'black') drawNoise();
      else if (Math.random() < 0.3) drawNoise();

      // OSD
      const total = 23 * 3600 + 47 * 60 + 12 + Math.floor(Math.max(0, t - 3.3));
      const hh = Math.floor(total / 3600) % 24;
      const mm = Math.floor((total % 3600) / 60);
      const ss = total % 60;
      const clock = `19 MAR 1987  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      const sub = LINES.find((l) => t >= l[0] && t < lineEnd(l))?.[3] ?? null;
      const end =
        t >= 56.5
          ? t < 59.8
            ? ['FIN DE BANDE', 'CASSETTE 2 — BUREAU DU DIRECTEUR']
            : ['Le Dr Moreau n\'a jamais été retrouvé.', 'Lucas, lui, est toujours là.']
          : null;
      const next: Frame = {
        mode,
        cam: mode === 'cam' ? 'CAMÉSCOPE — BUREAU 2B' : '',
        clock: mode === 'cam' ? clock : '',
        sub: mode === 'cam' || mode === 'black' ? sub : null,
        glitch: Math.round(glitch * 10) / 10,
        flash: t > 53.6 && t < 54.0,
        end,
      };
      const key = JSON.stringify(next);
      if (key !== lastUi) {
        lastUi = key;
        setF(next);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      alive = false;
      for (const s of playing) {
        try {
          s.stop();
        } catch {
          /* already ended */
        }
      }
      sound.setHeartbeat(60, false);
      monster.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useStopKeys(() => closeRef.current(false));

  return <VhsScreen f={f} mount={mount} noise={noise} blue={['DERNIER MESSAGE — DR H. MOREAU', 'À REMETTRE À LA PRESSE']} onStop={() => onClose(false)} />;
};
