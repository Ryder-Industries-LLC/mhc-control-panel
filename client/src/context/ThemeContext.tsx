import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeName = 'midnight' | 'charcoal' | 'ocean' | 'forest' | 'ember';

export interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: ThemeName[];
}

const THEME_STORAGE_KEY = 'mhc-theme';
const DEFAULT_THEME: ThemeName = 'midnight';
const AVAILABLE_THEMES: ThemeName[] = ['midnight', 'charcoal', 'ocean', 'forest', 'ember'];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && AVAILABLE_THEMES.includes(stored as ThemeName)) {
    return stored as ThemeName;
  }
  return DEFAULT_THEME;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(getInitialTheme);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Apply theme on mount and when theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value: ThemeContextType = {
    theme,
    setTheme,
    themes: AVAILABLE_THEMES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
