import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'codenex_theme';

export function useTheme() {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((next) => {
    document.documentElement.dataset.theme = next;
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: theme applies for this session only */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);
  return { theme, setTheme, toggle };
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

// True for the Mac-style modifier label.
export function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}
