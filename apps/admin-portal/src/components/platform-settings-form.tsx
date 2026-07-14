'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { PLATFORM_THEME_PRESETS } from '@starville/platform-configuration';

export function PlatformSettingsForm({
  action,
  children,
}: {
  readonly action: (data: FormData) => void | Promise<void>;
  readonly children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <form
      action={action}
      className="platform-settings-form"
      onClick={(event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>(
          'button[data-theme-preset]',
        );
        if (button === null) return;
        const presetKey = button.dataset['themePreset'];
        if (presetKey !== 'starville_twilight' && presetKey !== 'cozy_light') return;
        const form = event.currentTarget;
        const presetControl = form.elements.namedItem('preset');
        if (presetControl instanceof HTMLSelectElement) presetControl.value = presetKey;
        for (const [key, value] of Object.entries(PLATFORM_THEME_PRESETS[presetKey])) {
          const control = form.elements.namedItem(`token_${key}`);
          if (control instanceof HTMLInputElement) control.value = value;
        }
        setDirty(true);
      }}
      onInput={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      {dirty ? (
        <p aria-live="polite" className="platform-unsaved">
          Unsaved changes
        </p>
      ) : null}
      {children}
    </form>
  );
}
