import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startI18n } from './i18n';

createRoot(document.getElementById('root')!).render(<App />);
// 🌐 English: the on-screen texts are translated on the fly
startI18n();

// Installable app + solo play without a connection (production build only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* not available (http, private mode…): the game still works */
    });
  });
}
