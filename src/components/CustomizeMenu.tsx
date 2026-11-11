import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Check, Loader2, X } from 'lucide-react';
import { Appearance, PALETTES } from '../appearance';
import { CATALOG, Cosmetic, Slot, Target } from '../economy';
import { CosmeticBadge } from './ShopMenu';
import { MonsterAI } from '../game/MonsterAI';
import { RemotePlayer } from '../game/RemotePlayer';

interface Props {
  username: string;
  initial: Appearance;
  /** First time (right after the account was created). */
  welcome?: boolean;
  /** Shop cosmetics owned by the account */
  owned?: string[];
  onOpenShop?: () => void;
  onSave: (a: Appearance) => Promise<void>;
  onClose: () => void;
}

type Tab = 'human' | 'monster';

/** Rotating 3D preview of the real in-game models. */
const Preview: React.FC<{ look: Appearance; tab: Tab }> = ({ look, tab }) => {
  const mount = useRef<HTMLDivElement>(null);
  const models = useRef<{ human: RemotePlayer; monster: MonsterAI } | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const W = 260;
    const H = 320;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0x8a9a98, 0x1a1210, 1.6));
    const key = new THREE.SpotLight(0xfff1dc, 60, 20, Math.PI / 5, 0.6, 2);
    key.position.set(2, 3.5, 3);
    scene.add(key);
    const rim = new THREE.PointLight(0xff3020, 6, 8, 2);
    rim.position.set(-1.5, 2, -1.5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Human (same model as your partner sees)
    const dummy = new THREE.SpotLight();
    const human = new RemotePlayer('', dummy, new THREE.Object3D());
    human.showName = false;
    human.group.visible = true;
    scene.add(human.group);
    // Creature (same model as in game)
    const monster = new MonsterAI(new THREE.Vector3(), new Map(), [], new Map(), () => {});
    scene.add(monster.mesh);
    models.current = { human, monster };

    let raf = 0;
    let angle = 0.6;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      angle += dt * 0.6;
      const isHuman = tabRef.current === 'human';
      human.group.visible = isHuman;
      monster.mesh.visible = !isHuman;
      human.group.rotation.y = angle;
      monster.mesh.rotation.y = angle;
      if (isHuman) human.idle(dt);
      const h = isHuman ? 1.0 : 1.25;
      camera.position.set(0, h + 0.2, isHuman ? 3.7 : 5.2);
      camera.lookAt(0, h, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      human.dispose();
      monster.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      models.current = null;
    };
  }, []);

  useEffect(() => {
    models.current?.human.applyLook(look.human);
    models.current?.monster.applyLook(look.monster);
  }, [look]);

  return <div ref={mount} className="w-[260px] h-[320px] bg-gradient-to-b from-zinc-900 to-black border border-zinc-800" />;
};

const Swatches: React.FC<{ label: string; colors: string[]; value: string; onPick: (c: string) => void }> = ({ label, colors, value, onPick }) => (
  <div>
    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1.5">{label}</div>
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className={`w-8 h-8 border-2 transition-transform ${value === c ? 'border-white scale-110' : 'border-zinc-700 hover:border-zinc-400'}`}
          style={{ background: c }}
          title={c}
        />
      ))}
      {/* Free colour */}
      <label className="w-8 h-8 border-2 border-dashed border-zinc-600 flex items-center justify-center cursor-pointer text-zinc-500 text-xs" title="Autre couleur">
        +
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="sr-only" />
      </label>
    </div>
  </div>
);

/** Accessory / outfit picker (owned shop items only). */
const ItemPicker: React.FC<{ label: string; items: Cosmetic[]; value: string; onPick: (v: string) => void }> = ({ label, items, value, onPick }) => (
  <div>
    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-1.5">{label}</div>
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onPick('')}
        className={`h-9 px-2 border-2 text-[10px] font-mono uppercase ${value === '' ? 'border-white text-zinc-100' : 'border-zinc-700 text-zinc-500'}`}
      >
        Aucun
      </button>
      {items.map((c) => (
        <button key={c.id} title={c.name} onClick={() => onPick(c.value)} className={value === c.value ? 'ring-2 ring-white' : ''}>
          <CosmeticBadge c={c} size={36} />
        </button>
      ))}
      {items.length === 0 && <span className="text-[10px] font-mono text-zinc-600 self-center">— rien acheté (Boutique)</span>}
    </div>
  </div>
);

export const CustomizeMenu: React.FC<Props> = ({ username, initial, welcome, owned = [], onOpenShop, onSave, onClose }) => {
  const mine = (target: Target, slot: Slot) => CATALOG.filter((c) => c.target === target && c.slot === slot && owned.includes(c.id));
  const colors = (base: string[], target: Target, slot: Slot) => [...base, ...mine(target, slot).map((c) => c.value)];
  const [look, setLook] = useState<Appearance>(initial);
  const [tab, setTab] = useState<Tab>('human');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Appearance>(part: K, key: keyof Appearance[K], value: string) =>
    setLook((l) => ({ ...l, [part]: { ...l[part], [key]: value } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(look);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest border ${
        tab === t ? 'border-red-600 bg-red-950/40 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl max-h-[94vh] overflow-y-auto bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_60px_rgba(150,0,0,0.25)]">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-mono uppercase tracking-[0.25em] text-sm text-zinc-100 mb-1">
          {welcome ? `Bienvenue, ${username}` : 'Personnalisation'}
        </h2>
        <p className="text-xs font-serif italic text-zinc-400 mb-4">
          {welcome
            ? 'Compte créé ! Donnez une apparence à votre survivant et à votre Patient Zéro.'
            : 'Votre apparence est enregistrée sur votre compte.'}
        </p>

        <div className="flex gap-1 mb-4">
          {tabBtn('human', '🧍 Mon humain')}
          {tabBtn('monster', '🧟 Mon monstre')}
        </div>

        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          <Preview look={look} tab={tab} />
          <div className="flex-1 space-y-4 w-full">
            {tab === 'human' ? (
              <>
                <Swatches label="Peau" colors={colors(PALETTES.humanSkin, 'human', 'skin')} value={look.human.skin} onPick={(c) => set('human', 'skin', c)} />
                <Swatches label="Blouse" colors={colors(PALETTES.humanGown, 'human', 'gown')} value={look.human.gown} onPick={(c) => set('human', 'gown', c)} />
                <Swatches label="Cheveux" colors={colors(PALETTES.humanHair, 'human', 'hair')} value={look.human.hair} onPick={(c) => set('human', 'hair', c)} />
                <ItemPicker label="Accessoire" items={mine('human', 'acc')} value={look.human.acc} onPick={(v) => set('human', 'acc', v)} />
                <ItemPicker label="Tenue" items={mine('human', 'outfit')} value={look.human.outfit} onPick={(v) => set('human', 'outfit', v)} />
                <p className="text-[10px] font-mono text-zinc-600">Vu par votre partenaire en coop, et par le monstre en mode Chasse.</p>
              </>
            ) : (
              <>
                <Swatches label="Peau" colors={colors(PALETTES.monsterSkin, 'monster', 'skin')} value={look.monster.skin} onPick={(c) => set('monster', 'skin', c)} />
                <Swatches label="Yeux" colors={colors(PALETTES.monsterEyes, 'monster', 'eyes')} value={look.monster.eyes} onPick={(c) => set('monster', 'eyes', c)} />
                <Swatches label="Lambeaux de blouse" colors={colors(PALETTES.monsterGown, 'monster', 'gown')} value={look.monster.gown} onPick={(c) => set('monster', 'gown', c)} />
                <ItemPicker label="Accessoire" items={mine('monster', 'acc')} value={look.monster.acc} onPick={(v) => set('monster', 'acc', v)} />
                <ItemPicker label="Tenue" items={mine('monster', 'outfit')} value={look.monster.outfit} onPick={(v) => set('monster', 'outfit', v)} />
                <p className="text-[10px] font-mono text-zinc-600">
                  Les créatures que vous affrontez prennent ces couleurs. En mode Chasse, c'est votre monstre quand vous le jouez.
                </p>
              </>
            )}
          </div>
        </div>

        {onOpenShop && (
          <button onClick={onOpenShop} className="mt-3 text-[11px] font-mono text-amber-400 hover:text-amber-300 underline">
            🛒 Plus de skins dans la boutique
          </button>
        )}
        {error && <p className="text-xs font-mono text-red-400 mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 border border-zinc-700 text-zinc-400 hover:text-zinc-100 font-mono text-xs uppercase tracking-widest">
            {welcome ? 'Plus tard' : 'Annuler'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};
