'use client';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'if.theme';

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

// Inline script injected into <head> so the correct class is set before
// React hydrates — prevents a light/dark flash on first paint.
export const themeBootScript = `
(function(){try{
  var t=localStorage.getItem('${STORAGE_KEY}');
  if(t!=='light'&&t!=='dark'){
    t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  }
  var r=document.documentElement;
  if(t==='dark')r.classList.add('dark');else r.classList.remove('dark');
  r.style.colorScheme=t;
}catch(e){}})();
`;
