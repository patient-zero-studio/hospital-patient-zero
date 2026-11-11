import { Chapter, GameEnding, GameItem, Objective } from '../types';
import { sound } from '../audio/SoundSystem';

export class GameState {
  public inventory: GameItem[] = [];
  /** Hotbar size: you can only carry 5 objects (documents don't count). */
  public maxInventorySlots = 5;

  public powerRestored = false;
  /** Coins found this run (banked only if you get out). */
  public runCoins = 0;

  // Lore documents found
  public notesCollected: GameItem[] = [];
  public totalNotes = 5;

  public toastMessage: string | null = null;
  private toastTimeout: number | null = null;

  public objectives: Objective[] = [
    {
      id: 'obj-room-104',
      text: 'Sortez de la Chambre 104 (fouillez les meubles pour trouver la clé)',
      completed: false,
      isCurrent: true,
    },
    {
      id: 'obj-pharmacy',
      text: 'Entrez dans la Pharmacie (le code est dans le journal de l\'infirmière, Aile A)',
      completed: false,
      isCurrent: false,
    },
    {
      id: 'obj-fuses',
      text: 'Récupérez les 2 fusibles industriels (Pharmacie & Morgue)',
      completed: false,
      isCurrent: false,
    },
    {
      id: 'obj-power',
      text: 'Insérez les fusibles dans le disjoncteur du Bloc Opératoire',
      completed: false,
      isCurrent: false,
    },
    {
      id: 'obj-lab-or-escape',
      text: 'Entrez dans le Laboratoire avec la carte du Dr Moreau… ou trouvez la clé de l\'issue de secours (Archives)',
      completed: false,
      isCurrent: false,
    },
  ];

  constructor(public chapter: Chapter = 1) {
    if (chapter === 2) {
      this.totalNotes = 3;
      this.objectives = [
        { id: 'obj-s-key', text: 'Trouvez la clé du local technique (Vestiaire des égoutiers)', completed: false, isCurrent: true },
        { id: 'obj-s-crank', text: 'Prenez la manivelle de vanne dans le Local technique', completed: false, isCurrent: false },
        { id: 'obj-s-sluice', text: 'Ouvrez l\'Écluse au fond du tunnel avec la manivelle', completed: false, isCurrent: false },
        { id: 'obj-s-exit', text: 'Remontez par la plaque d\'égout — sans un bruit', completed: false, isCurrent: false },
      ];
    }
    // Chapter 3: the maze drives its own objective text
    if (chapter >= 3) {
      this.totalNotes = chapter === 5 ? 3 : 2;
      this.objectives = [];
    }
  }

  public addItem(item: GameItem): boolean {
    // Documents go to the archive tab and never take an inventory slot
    if (item.type === 'note' || item.type === 'cassette') {
      if (!this.notesCollected.some((n) => n.id === item.id)) this.notesCollected.push(item);
      sound.playPaperRustle();
      this.showToast(
        item.id.startsWith('vhs-')
          ? `📼 ${item.name} trouvée. Regardez-la : [TAB] › Documents › ▶ Regarder`
          : `Document trouvé : ${item.name} — lisez-le avec [TAB]`
      );
      return true;
    }

    // Equipment (the flashlight) is worn, not carried in the hotbar
    if (item.type === 'special') {
      sound.playItemPickup();
      this.showToast(`${item.name} équipée. [F] pour l'allumer / l'éteindre.`);
      return true;
    }

    if (this.inventory.length >= this.maxInventorySlots) {
      this.showToast(`Mains pleines (${this.maxInventorySlots} objets max) ! Utilisez ou lâchez un objet avant d'en prendre un autre.`);
      return false;
    }

    this.inventory.push(item);
    sound.playItemPickup();
    this.showToast(`Objet obtenu : ${item.name}`);

    if (item.id === 'key-104') {
      this.completeObjective('obj-room-104');
      this.activateObjective('obj-pharmacy');
    }
    if (item.id === 'key-s-tech') {
      this.completeObjective('obj-s-key');
      this.activateObjective('obj-s-crank');
    }
    if (item.id === 'item-crank') {
      this.completeObjective('obj-s-key');
      this.completeObjective('obj-s-crank');
      this.activateObjective('obj-s-sluice');
    }
    if (item.id === 'item-fuse-1' || item.id === 'item-fuse-2') {
      if (this.hasItem('item-fuse-1') && this.hasItem('item-fuse-2')) {
        this.completeObjective('obj-fuses');
        this.activateObjective('obj-power');
      }
    }
    return true;
  }

  public removeItem(itemId: string) {
    const idx = this.inventory.findIndex((it) => it.id === itemId);
    if (idx !== -1) this.inventory.splice(idx, 1);
  }

  public hasItem(itemId: string): boolean {
    return this.inventory.some((it) => it.id === itemId) || this.notesCollected.some((n) => n.id === itemId);
  }

  public getItem(itemId: string): GameItem | undefined {
    return this.inventory.find((it) => it.id === itemId);
  }

  public showToast(msg: string) {
    this.toastMessage = msg;
    if (this.toastTimeout) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage = null;
    }, 4000);
  }

  public completeObjective(id: string) {
    const obj = this.objectives.find((o) => o.id === id);
    if (obj) {
      obj.completed = true;
      obj.isCurrent = false;
    }
  }

  public activateObjective(id: string) {
    const obj = this.objectives.find((o) => o.id === id);
    if (obj && !obj.completed) obj.isCurrent = true;
  }

  public getCurrentObjectiveText(): string {
    const curr = this.objectives.find((o) => o.isCurrent && !o.completed);
    if (curr) return curr.text;
    return this.chapter === 5 ? 'Arrêtez le Patient Zéro.' : this.chapter === 4 ?'Appelez les secours.' : this.chapter === 3 ? 'Sortez du Dédale.' : this.chapter === 2 ? 'Sortez des égouts.' : 'Trouvez une issue… ou percez le secret du Laboratoire.';
  }

  public dispose() {
    if (this.toastTimeout) window.clearTimeout(this.toastTimeout);
  }

  public evaluateEnding(endingType: GameEnding): { ending: GameEnding; title: string; narrative: string } {
    if (endingType === 'LUCAS') {
      return {
        ending: 'LUCAS',
        title: 'FIN : APPELLE-MOI LUCAS',
        narrative:
          '« Lucas. » Le mot tombe dans le silence de la salle. La créature tressaille. Sous la peau grise, quelque chose bouge : un regard d\'enfant, perdu depuis des années. Les rampes UV s\'éteignent une à une. Il se recroqueville contre le fauteuil de contention et murmure, d\'une voix qui n\'est plus la sienne depuis longtemps : « …je veux rentrer. » Vous lui tendez la main. Pour la première fois, le Patient Zéro a un nom.',
      };
    }
    if (endingType === 'DESTROY') {
      return {
        ending: 'DESTROY',
        title: 'FIN : LA DERNIÈRE PURGE',
        narrative:
          'La décharge finale emplit la salle d\'un violet aveuglant. Quand la lumière retombe, il ne reste du Patient Zéro qu\'une forme recroquevillée, presque petite, au milieu du cercle jaune. Le Site B s\'éteint niveau par niveau. En remontant par le monte-charge, vous vous demandez qui il était avant… et pourquoi, à la toute fin, il vous a regardé comme un enfant qui a peur.',
      };
    }
    if (endingType === 'RESCUE') {
      const all = this.notesCollected.length >= 2;
      return {
        ending: 'RESCUE',
        title: all ? 'CHAPITRE 4 : LE DERNIER SIGNAL' : 'CHAPITRE 4 : SOUS LA PLUIE',
        narrative: all
          ? 'Les patins quittent le sol et la forêt tombe sous vous. Le pilote crie quelque chose que vous n\'entendez pas. Dans votre poche trempée, le carnet du garde et le télex de Moreau : Saint-Aurore n\'a jamais été fermé, seulement déplacé. Tout en bas, à la lisière, une silhouette immense regarde l\'hélicoptère s\'éloigner. Elle ne crie pas. Elle attend.'
          : 'Vous agrippez l\'échelle de corde et l\'hélicoptère s\'arrache aux arbres. Le projecteur balaie la clairière une dernière fois : elle est vide. Les fusées s\'éteignent une à une sous la pluie. Vous êtes vivant. Pour la première fois depuis la chambre 104, vous êtes vraiment dehors.',
      };
    }
    if (endingType === 'MAZE') {
      const all = this.notesCollected.length >= 2;
      return {
        ending: 'MAZE',
        title: all ? 'CHAPITRE 3 : LE FIL D\'ARIANE' : 'CHAPITRE 3 : HORS DU DÉDALE',
        narrative: all
          ? 'Vous vous hissez hors du puits et la plaque retombe sur ses doigts griffus avec un craquement sec. Dans votre poche, la page de journal de Lucas et le plan annoté de Moreau : le Réseau 9 n\'a jamais eu de fin, il a été construit pour qu\'on n\'en sorte pas. Lucas y marche encore. Et maintenant, vous savez où chercher.'
          : 'Vous vous hissez hors du puits, les mains en sang, et rabattez la plaque de fonte de tout votre poids. En dessous, quelque chose gratte le métal… longtemps. Puis le silence. Vous êtes sorti du Dédale. Mais chaque nuit, dans vos rêves, les couloirs continuent.',
      };
    }
    if (endingType === 'SEWER') {
      const all = this.notesCollected.length >= 3;
      return {
        ending: 'SEWER',
        title: all ? 'CHAPITRE 2 : LE SILENCE ET LA PREUVE' : 'CHAPITRE 2 : LA PLAQUE D\'ÉGOUT',
        narrative: all
          ? 'Vous soulevez la plaque de fonte et l\'air froid du parc vous brûle les poumons. Dans votre poche, le bon de transfert signé du Dr Moreau : le Sujet 07 n\'était pas le seul. Sous Saint-Aurore, d\'autres tunnels descendent encore plus bas… et quelque chose, là-dessous, a entendu la plaque retomber.'
          : 'Vous soulevez la plaque de fonte et rampez dans l\'herbe mouillée du parc. Sous vos pieds, un long cri résonne dans les canalisations, puis plus rien. Vous êtes dehors. Mais vous n\'oublierez jamais le bruit de sa respiration, juste à côté de vous, dans le noir.',
      };
    }
    if (endingType === 'SURVIVAL') {
      return {
        ending: 'SURVIVAL',
        title: 'FIN 1 : LA FUITE DANS LA NUIT',
        narrative:
          'Vous ouvrez l\'issue de secours et vous vous engouffrez dans la brume glaciale du parc hospitalier. Derrière vous, les hurlements du Patient Zéro résonnent encore contre les vitres de Saint-Aurore. Vous avez survécu… mais personne ne croira jamais ce que vous avez vu.',
      };
    }
    if (endingType === 'PURGE') {
      return {
        ending: 'PURGE',
        title: 'FIN 2 : L\'INCINÉRATION DU COMPLEXE',
        narrative:
          'Les alarmes de surcharge thermique hurlent. Les portes étanches se verrouillent et les brûleurs s\'activent. À travers la vitre blindée, le Patient Zéro est consumé par le brasier, emportant avec lui toutes les horreurs du projet. Le cauchemar s\'achève dans les flammes.',
      };
    }
    return {
      ending: 'TRUTH',
      title: 'FIN 3 : LA VÉRITÉ AU GRAND JOUR (FIN SECRÈTE)',
      narrative:
        'Muni de la confession du Dr Moreau et des documents d\'origine du Protocole Aurore, vous quittez l\'hôpital. Trois semaines plus tard, les révélations font la une de la presse internationale. Les commanditaires sont traduits en justice, et la mémoire des victimes est enfin honorée.',
    };
  }
}
