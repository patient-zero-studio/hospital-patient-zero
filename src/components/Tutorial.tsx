import React from 'react';

export const TUTO_KEY = 'pz-tuto-done';
export const tutorialDone = () => {
  try {
    return localStorage.getItem(TUTO_KEY) === '1';
  } catch {
    return false;
  }
};
export const markTutorialDone = () => {
  try {
    localStorage.setItem(TUTO_KEY, '1');
  } catch {
    /* private mode */
  }
};

export interface TutoStep {
  icon: string;
  title: string;
  /** keyboard / touch instructions */
  desc: string;
  touch: string;
}

/** The guided first steps, in order (checked by App from the game state). */
export const TUTO_STEPS: TutoStep[] = [
  { icon: '🚶', title: 'Déplace-toi', desc: 'Z Q S D (ou W A S D / flèches) pour marcher, la souris pour regarder.', touch: 'Joystick à gauche pour marcher, glisse à droite pour regarder.' },
  { icon: '🔦', title: 'Allume / éteins ta lampe', desc: 'Appuie sur F. La lumière te rend visible de loin et use la pile : éteins-la quand le monstre approche.', touch: 'Bouton 🔦 de la lampe.' },
  { icon: '🤫', title: 'Accroupis-toi', desc: 'Appuie sur C : tu avances plus lentement mais presque sans bruit.', touch: 'Bouton pour s\'accroupir.' },
  { icon: '🚪', title: 'Ouvre une porte ou fouille un meuble', desc: 'Regarde une porte, un tiroir ou une armoire et appuie sur E.', touch: 'Bouton d\'action (main) quand il apparaît.' },
  { icon: '🗄️', title: 'Cache-toi', desc: 'Devant un casier ou un lit, appuie sur E. Quand le monstre approche, c\'est ta meilleure chance.', touch: 'Bouton d\'action devant un casier ou un lit.' },
  { icon: '🥫', title: 'Lance une canette', desc: 'Ramasse une canette (E), puis appuie sur sa touche 1 à 5 pour la lancer : le bruit attire le monstre ailleurs.', touch: 'Ramasse une canette, puis touche-la dans ta barre d\'objets.' },
];

interface Props {
  step: number;
  touch: boolean;
  onSkip: () => void;
  onQuit: () => void;
}

/** Card at the top of the screen with the current step and the progress. */
export const TutorialOverlay: React.FC<Props> = ({ step, touch, onSkip, onQuit }) => {
  const done = step >= TUTO_STEPS.length;
  const s = TUTO_STEPS[Math.min(step, TUTO_STEPS.length - 1)];
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[55] w-[min(94vw,460px)] pointer-events-auto select-none">
      <div className="border border-emerald-500/80 bg-black/85 shadow-[0_0_30px_rgba(16,185,129,0.3)] p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-400">🎓 Tutoriel</span>
          <span className="flex gap-1">
            {TUTO_STEPS.map((_, i) => (
              <span key={i} className={`w-5 h-1.5 ${i < step ? 'bg-emerald-400' : i === step ? 'bg-emerald-700 animate-pulse' : 'bg-zinc-700'}`} />
            ))}
          </span>
        </div>
        {done ? (
          <div className="text-center py-1">
            <div className="text-2xl">🎉</div>
            <div className="text-base font-bold text-zinc-100">Bravo, tu es prêt !</div>
            <div className="text-xs text-zinc-300 font-serif italic">
              Trouve maintenant la sortie de l'hôpital. En Exploration, aucun monstre ne te poursuit : prends ton temps pour tout découvrir. Une sortie débloque la
              boutique !
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="text-3xl leading-none">{s.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-zinc-100">
                {step + 1}. {s.title}
              </div>
              <div className="text-xs text-zinc-300">{touch ? s.touch : s.desc}</div>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-2 text-[10px] font-mono uppercase">
          {!done && (
            <button onClick={onSkip} className="text-zinc-400 hover:text-zinc-100">
              Passer cette étape
            </button>
          )}
          <button onClick={onQuit} className="text-zinc-500 hover:text-red-300">
            {done ? 'Fermer' : 'Quitter le tutoriel'}
          </button>
        </div>
      </div>
    </div>
  );
};
