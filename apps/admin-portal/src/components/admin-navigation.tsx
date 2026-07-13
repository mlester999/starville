'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { focusTrapTarget } from './dialog-focus';
import { activeAdminNavigationHref, type AdminNavigationItem } from './admin-navigation-state';

export function AdminNavigation({ items }: { readonly items: readonly AdminNavigationItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const activeHref = activeAdminNavigationHref(pathname, items);
  const activeLabel = items.find((item) => item.href === activeHref)?.label ?? 'Sections';

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() =>
      drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus(),
    );
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    if (controls === undefined || controls.length === 0) return;
    const destination = focusTrapTarget(
      [...controls],
      document.activeElement as HTMLElement | null,
      event.shiftKey,
    );
    if (destination !== undefined) {
      event.preventDefault();
      destination.focus();
    }
  }

  const links = items.map((item) => {
    const active = item.href === activeHref;
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        className={active ? 'is-active' : undefined}
        href={item.href}
        key={item.href}
        onClick={() => close(false)}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <>
      <nav className="portal-nav" aria-label="Administrator navigation">
        {links}
      </nav>
      <button
        aria-controls="admin-mobile-navigation"
        aria-expanded={open}
        aria-label="Open administrator navigation"
        className="portal-nav-trigger"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span>{activeLabel}</span>
        <span aria-hidden="true">Menu</span>
      </button>
      {open ? (
        <div className="portal-nav-backdrop" onMouseDown={() => close()} role="presentation">
          <div
            aria-label="Administrator sections"
            aria-modal="true"
            className="portal-nav-drawer"
            id="admin-mobile-navigation"
            onKeyDown={handleKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            ref={drawerRef}
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">Current section</p>
                <h2>{activeLabel}</h2>
              </div>
              <button
                aria-label="Close administrator navigation"
                onClick={() => close()}
                type="button"
              >
                ×
              </button>
            </header>
            <nav aria-label="Mobile administrator navigation">{links}</nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
