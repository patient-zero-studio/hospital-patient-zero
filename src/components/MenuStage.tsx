import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Appearance } from '../appearance';
import { RemotePlayer } from '../game/RemotePlayer';
import { MonsterAI } from '../game/MonsterAI';

/**
 * 🎭 Main menu centre: your character on a podium, under a flickering lamp.
 * Now and then the Patient Zero leans out of the dark behind you.
 */
export const MenuStage: React.FC<{ look: Appearance | null }> = ({ look }) => {
  const mount = useRef<HTMLDivElement>(null);
  const models = useRef<{ human: RemotePlayer; monster: MonsterAI } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let W = el.clientWidth || 300;
    let H = el.clientHeight || 380;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL: the menu works without the stage
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.display = 'block';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0x7a8a88, 0x120c0a, 1.1));
    // Hanging lamp above the podium (it flickers)
    const lamp = new THREE.SpotLight(0xffe6c0, 70, 14, Math.PI / 5.5, 0.55, 1.6);
    lamp.position.set(0, 4.2, 1.2);
    lamp.target.position.set(0, 0, 0);
    scene.add(lamp, lamp.target);
    // Red rim from behind
    const rim = new THREE.PointLight(0xff2a1a, 9, 7, 2);
    rim.position.set(-1.2, 2.2, -1.8);
    scene.add(rim);
    // Sickly green fill from the side
    const fill = new THREE.PointLight(0x5cff8a, 2.5, 6, 2);
    fill.position.set(2, 1.2, 1.5);
    scene.add(fill);

    // Podium: dark steel disc with a red ring
    const podium = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.22, 40), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6, metalness: 0.5 }));
    disc.position.y = -0.11;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xb01010, emissiveIntensity: 0.9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    podium.add(disc, ring);
    scene.add(podium);

    const human = new RemotePlayer('', new THREE.SpotLight(), new THREE.Object3D());
    human.showName = false;
    human.group.visible = true;
    scene.add(human.group);

    const monster = new MonsterAI(new THREE.Vector3(), new Map(), [], new Map(), () => {});
    monster.mesh.position.set(1.25, 0, -1.9);
    monster.mesh.rotation.y = -0.5;
    monster.mesh.visible = false;
    scene.add(monster.mesh);
    models.current = { human, monster };

    const resize = () => {
      W = el.clientWidth || W;
      H = el.clientHeight || H;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let flick = 0;
    // The creature shows up every ~12 s for ~3.5 s
    let lurkT = 6;
    let lurk = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // Slow sway so the character looks alive
      human.group.rotation.y = Math.sin(t * 0.45) * 0.35;
      human.idle(dt);
      // Lamp flicker
      flick -= dt;
      if (flick <= 0) flick = Math.random() < 0.08 ? 0.12 : 0.5 + Math.random() * 1.5;
      lamp.intensity = flick < 0.12 && Math.random() < 0.6 ? 8 : 70;
      // Lurking creature: fades in behind, then backs off into the dark
      lurkT -= dt;
      if (lurkT <= 0 && lurk <= 0) {
        lurk = 3.5;
        lurkT = 10 + Math.random() * 6;
        monster.mesh.position.x = Math.random() < 0.5 ? -1.3 : 1.3;
        monster.mesh.rotation.y = monster.mesh.position.x > 0 ? -0.5 : 0.5;
      }
      if (lurk > 0) {
        lurk -= dt;
        const k = Math.min(1, Math.min(3.5 - lurk, lurk) / 0.8);
        monster.mesh.visible = k > 0.02;
        monster.mesh.position.z = -2.6 + k * 0.7;
        rim.intensity = 9 + k * 10;
        monster.tickFx(dt);
      } else {
        monster.mesh.visible = false;
        rim.intensity = 9;
      }
      // Frame the character whatever the box ratio
      // Distance so that ~2.6 m fit in height and the podium (~2 m) fits in width
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(1.3 / tan, 1.05 / (tan * camera.aspect));
      camera.position.set(0, 1.35, dist);
      camera.lookAt(0, 1.0, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      human.dispose();
      monster.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      models.current = null;
    };
  }, []);

  useEffect(() => {
    if (look) {
      models.current?.human.applyLook(look.human);
      models.current?.monster.applyLook(look.monster);
    }
  }, [look]);

  return <div ref={mount} className="absolute inset-0" />;
};
