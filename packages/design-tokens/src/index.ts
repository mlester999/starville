export const designTokens = {
  typography: {
    fontFamily: {
      sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display:
        '"Avenir Next", Avenir, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      title: 'clamp(2.5rem, 8vw, 5.5rem)',
    },
    lineHeight: {
      tight: '1.1',
      normal: '1.5',
      relaxed: '1.7',
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
    8: '2rem',
    12: '3rem',
    16: '4rem',
    24: '6rem',
  },
  radius: {
    small: '0.5rem',
    medium: '0.875rem',
    large: '1.5rem',
    pill: '999px',
  },
  shadow: {
    soft: '0 0.5rem 2rem rgb(4 12 10 / 18%)',
    elevated: '0 1.25rem 4rem rgb(4 12 10 / 30%)',
    focus: '0 0 0 0.2rem rgb(244 201 101 / 42%)',
  },
  breakpoint: {
    small: '36rem',
    medium: '48rem',
    large: '64rem',
    wide: '80rem',
  },
  color: {
    background: '#0d1a17',
    backgroundSubtle: '#11231f',
    surface: '#172c27',
    surfaceElevated: '#203a34',
    text: '#f8f4e8',
    textMuted: '#bdcbc2',
    primary: '#f4c965',
    primaryHover: '#ffe08a',
    onPrimary: '#302400',
    accent: '#73cbaa',
    border: '#38534b',
    focus: '#f4c965',
    info: '#7fc8f8',
    success: '#7fd3a7',
    warning: '#f4c965',
    danger: '#ff938a',
  },
  motion: {
    duration: {
      fast: '120ms',
      normal: '220ms',
      slow: '360ms',
    },
    easing: {
      standard: 'cubic-bezier(0.2, 0, 0, 1)',
      expressive: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
  },
} as const;

export type DesignTokens = typeof designTokens;
