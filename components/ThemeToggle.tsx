'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className="_header_theme_toggle"
        aria-label="Toggle theme"
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--color2)',
          padding: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Sun size={20} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="_header_theme_toggle"
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      style={{
        border: 0,
        background: 'transparent',
        color: 'var(--color2)',
        padding: 4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
