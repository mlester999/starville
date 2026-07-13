'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';

import {
  computeVerticalScrollGeometry,
  scrollTopFromThumbDelta,
  scrollTopFromTrackClick,
  type ScrollGeometry,
} from '../lib/admin/scroll-geometry';

export interface AdminScrollAreaProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
  readonly sticky?: ReactNode;
  /** Optional data attribute prefix for tests (default: admin-scroll). */
  readonly testId?: string;
}

const EMPTY_GEOMETRY: ScrollGeometry = {
  overflows: false,
  maxScroll: 0,
  thumbHeight: 0,
  thumbOffset: 0,
  thumbSizeRatio: 1,
  scrollRatio: 0,
};

/**
 * Always-visible vertical scrollbar for admin side panels.
 * macOS/Chrome overlay native scrollbars stay hidden; this track+thumb stays visible
 * and stays synchronized with the real scroll viewport.
 */
export function AdminScrollArea({
  children,
  className,
  label,
  sticky,
  testId = 'admin-scroll',
}: AdminScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportId = useId();
  const [geometry, setGeometry] = useState<ScrollGeometry>(EMPTY_GEOMETRY);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startScrollTop: number } | null>(null);

  const refresh = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (viewport === null || track === null) return;
    const next = computeVerticalScrollGeometry({
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      scrollTop: viewport.scrollTop,
      trackHeight: track.clientHeight,
    });
    setGeometry(next);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (viewport === null) return;

    // Defer first measure until layout has assigned a real clientHeight.
    const frame = window.requestAnimationFrame(() => refresh());

    const observer = new ResizeObserver(() => refresh());
    observer.observe(viewport);
    if (viewport.firstElementChild instanceof HTMLElement) {
      observer.observe(viewport.firstElementChild);
    }
    if (track !== null) observer.observe(track);
    // Also observe the outer scroll area so panel resize/collapse refits the thumb.
    const root = viewport.closest('.admin-scroll-area');
    if (root instanceof HTMLElement) observer.observe(root);

    // Content mutations (filters, section expand, layer tabs) also change scrollHeight.
    const mutation = new MutationObserver(() => refresh());
    mutation.observe(viewport, { childList: true, subtree: true, characterData: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mutation.disconnect();
    };
  }, [refresh, children]);

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const viewport = event.currentTarget;
    const track = trackRef.current;
    if (track === null) return;
    setGeometry(
      computeVerticalScrollGeometry({
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
        scrollTop: viewport.scrollTop,
        trackHeight: track.clientHeight,
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    if (event.key === 'PageDown') {
      event.preventDefault();
      viewport.scrollBy({ top: viewport.clientHeight * 0.9 });
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      viewport.scrollBy({ top: -viewport.clientHeight * 0.9 });
    } else if (event.key === 'Home') {
      event.preventDefault();
      viewport.scrollTo({ top: 0 });
    } else if (event.key === 'End') {
      event.preventDefault();
      viewport.scrollTo({ top: viewport.scrollHeight });
    }
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return;
    const viewport = viewportRef.current;
    if (viewport === null || !geometry.overflows) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    viewport.scrollTop = scrollTopFromTrackClick({
      clickY,
      trackHeight: rect.height,
      thumbHeight: geometry.thumbHeight,
      maxScroll: geometry.maxScroll,
    });
    refresh();
  }

  function handleThumbPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (viewport === null || !geometry.overflows) return;
    dragRef.current = {
      startY: event.clientY,
      startScrollTop: viewport.scrollTop,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleThumbPointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (drag === null || viewport === null || track === null) return;
    viewport.scrollTop = scrollTopFromThumbDelta({
      startScrollTop: drag.startScrollTop,
      pointerDeltaY: event.clientY - drag.startY,
      trackHeight: track.clientHeight,
      thumbHeight: geometry.thumbHeight,
      maxScroll: geometry.maxScroll,
    });
    refresh();
  }

  function handleThumbPointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const rootClass = ['admin-scroll-area', 'editor-scroll-region', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClass}
      data-admin-scroll-area="true"
      data-overflows={geometry.overflows ? 'true' : 'false'}
      data-scroll-region={label}
      data-testid={testId}
    >
      {sticky === undefined ? null : (
        <div className="admin-scroll-area__sticky editor-scroll-region__sticky">{sticky}</div>
      )}

      <div className="admin-scroll-area__body">
        <div
          aria-label={label}
          className="admin-scroll-area__viewport editor-scroll-region__viewport"
          data-admin-scroll-viewport="true"
          data-editor-scrollbar="true"
          id={viewportId}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          ref={viewportRef}
          tabIndex={0}
        >
          <div className="admin-scroll-area__content editor-scroll-region__content">{children}</div>
        </div>

        <div
          className={`admin-scroll-area__track ${dragging ? 'is-dragging' : ''} ${geometry.overflows ? 'is-active' : 'is-idle'}`}
          data-admin-scroll-track="true"
          onPointerDown={handleTrackPointerDown}
          ref={trackRef}
        >
          {geometry.overflows ? (
            <button
              aria-controls={viewportId}
              aria-label={`${label} scrollbar`}
              aria-orientation="vertical"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(geometry.scrollRatio * 100)}
              className="admin-scroll-area__thumb"
              data-admin-scroll-thumb="true"
              onPointerCancel={handleThumbPointerUp}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              role="scrollbar"
              style={{
                height: `${geometry.thumbHeight}px`,
                transform: `translateY(${geometry.thumbOffset}px)`,
              }}
              type="button"
            />
          ) : (
            <span
              aria-hidden="true"
              className="admin-scroll-area__thumb admin-scroll-area__thumb--idle"
              data-admin-scroll-thumb="true"
              data-idle="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer AdminScrollArea — kept as the World Editor alias. */
export function EditorScrollRegion(props: AdminScrollAreaProps) {
  return <AdminScrollArea {...props} />;
}
