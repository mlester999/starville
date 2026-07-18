'use client';

import { useEffect } from 'react';

export function DocsMotionState() {
  useEffect(() => {
    function syncVisibility() {
      document.documentElement.classList.toggle('docs-page-paused', document.hidden);
    }

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      document.documentElement.classList.remove('docs-page-paused');
    };
  }, []);

  return null;
}
