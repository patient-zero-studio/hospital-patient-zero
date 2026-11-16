/**
 * Pseudo filter: refuses insults and slurs (French + English), even written
 * with numbers or symbols (c0nn4rd, p_u_t_e…). Used by the server at sign-up
 * and when an admin renames someone.
 */
const BANNED = [
  // français
  'connard', 'connasse', 'conasse', 'salope', 'salaud', 'pute', 'putain', 'encule', 'enculer', 'batard', 'batar',
  'merde', 'chier', 'nique', 'niquer', 'niqueta', 'niquetamere', 'tagrandmere', 'ntm', 'fdp', 'filsdepute', 'tagueule', 'pd', 'pede', 'tapette', 'gouine',
  'bite', 'couille', 'chatte', 'teub', 'zizi', 'branle', 'branleur', 'suce', 'sucer', 'cul', 'poufiasse', 'pouffiasse',
  'negro', 'negre', 'bougnoule', 'bicot', 'youpin', 'raton', 'nazi', 'hitler', 'adolf', 'sieg', 'kkk', 'viol', 'violeur',
  'pedo', 'pedophile', 'mongol', 'trisomique', 'attarde', 'debile', 'abruti', 'cretin', 'idiot', 'gogol', 'cancer',
  // english
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'fag', 'faggot',
  'retard', 'rape', 'rapist', 'porn', 'sex', 'penis', 'vagina', 'asshole', 'bastard', 'nazi', 'isis',
];
/** Short words only refused when they are the whole pseudo or a separate part of it. */
const WHOLE_ONLY = new Set(['pd', 'cul', 'suce', 'sex', 'fuk', 'ntm', 'fdp', 'kkk', 'viol', 'bite', 'dick', 'cock', 'pede', 'raton', 'idiot', 'cancer', 'isis', 'chier', 'pute', 'rape', 'fag', 'sieg', 'nique', 'shit']);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g' };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9!@$]/g, (c) => LEET[c] ?? c);

/** True if this pseudo must be refused. */
export const isBadName = (name: string): boolean => {
  const n = normalize(name);
  const glued = n.replace(/[^a-z]/g, '');
  // Repeated letters collapsed: "connnnard" → "conard"
  const squeezed = glued.replace(/(.)\1+/g, '$1');
  const parts = n.split(/[^a-z]+/).filter(Boolean);
  for (const w of BANNED) {
    if (WHOLE_ONLY.has(w)) {
      if (parts.includes(w) || glued === w) return true;
      continue;
    }
    const sq = w.replace(/(.)\1+/g, '$1');
    if (glued.includes(w) || squeezed.includes(sq)) return true;
  }
  return false;
};

/** Chat text: every rude word becomes *** (punctuation around it is kept). */
export const censorText = (text: string): string =>
  text.replace(/[^\s.,;:!?'"()]+/g, (w) => (isBadName(w) ? '*'.repeat(Math.min(6, w.length)) : w));
