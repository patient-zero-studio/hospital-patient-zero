/**
 * 🌐 Language: French (original), English or Romanian.
 * The game is written in French; in English, the texts shown on screen are
 * swapped on the fly with the dictionary (src/i18n/en.ts). Unknown texts stay
 * in French, so nothing ever breaks.
 */
import { EN, EN_PATTERNS } from './en';
import { RO, RO_PATTERNS } from './ro';

export type Lang = 'fr' | 'en' | 'ro';
/** the order of the language button: FR → EN → RO → FR */
export const LANGS: Lang[] = ['fr', 'en', 'ro'];
const KEY = 'pz-lang';

export const getLang = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'en' || v === 'ro') return v;
  } catch {
    /* private mode */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
  return nav.startsWith('fr') ? 'fr' : nav.startsWith('ro') ? 'ro' : 'en';
};

/** Changes the language (reloads the page so everything is redrawn). */
export const setLang = (l: Lang) => {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  location.reload();
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

const CUR = getLang();
const DICT = CUR === 'ro' ? RO : EN;
const PATTERNS = CUR === 'ro' ? RO_PATTERNS : EN_PATTERNS;

/** The current language (English or Romanian) for a French text, or null if unknown. */
export const toEnglish = (fr: string): string | null => {
  const k = norm(fr);
  if (!k) return null;
  const hit = DICT[k];
  if (hit !== undefined) return hit;
  for (const [re, rep] of PATTERNS) if (re.test(k)) return k.replace(re, rep);
  return null;
};

/** Keeps the spaces around a text node when its words are swapped. */
const swap = (raw: string) => {
  const en = toEnglish(raw);
  if (en === null) return null;
  const lead = raw.match(/^\s*/)![0];
  const trail = raw.match(/\s*$/)![0];
  return lead + en + trail;
};

const ATTRS = ['title', 'placeholder', 'aria-label'];

const translateNode = (n: Node) => {
  if (n.nodeType === Node.TEXT_NODE) {
    const p = n.parentElement;
    if (!p || p.closest('script,style,textarea,[data-no-i18n]')) return;
    const v = n.nodeValue ?? '';
    if (!/[A-Za-zÀ-ÿ]/.test(v)) return;
    const en = swap(v);
    if (en !== null && en !== v) n.nodeValue = en;
    return;
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  const el = n as Element;
  if (el.closest('script,style,[data-no-i18n]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const en = toEnglish(v);
      if (en !== null && en !== v) el.setAttribute(a, en);
    }
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let cur = walker.nextNode();
  while (cur) {
    if (cur.nodeType === Node.TEXT_NODE) translateNode(cur);
    else
      for (const a of ATTRS) {
        const v = (cur as Element).getAttribute(a);
        if (v) {
          const en = toEnglish(v);
          if (en !== null && en !== v) (cur as Element).setAttribute(a, en);
        }
      }
    cur = walker.nextNode();
  }
};

/** Starts the on-the-fly translation (English or Romanian). */
export const startI18n = () => {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (lang === 'fr') return;
  translateNode(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
};
