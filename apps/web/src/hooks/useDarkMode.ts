import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function getInitialDarkMode(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'dark';
}

export function useDarkMode() {
  const [dark, setDark] = useState(getInitialDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, setDark] as const;
}
