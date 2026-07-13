'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface PremiumSelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface PremiumSelectProps {
  readonly id?: string;
  readonly name?: string;
  readonly options: readonly PremiumSelectOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly loading?: boolean;
  readonly error?: string;
  readonly placeholder?: string;
  readonly size?: 'normal' | 'compact';
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly onChange?: (value: string) => void;
}

interface ListPosition {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
  readonly placement: 'below' | 'above';
}

function resolveInitialValue(
  options: readonly PremiumSelectOption[],
  value: string | undefined,
  defaultValue: string | undefined,
): string {
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  return options[0]?.value ?? '';
}

function measureListPosition(trigger: HTMLElement, estimatedHeight: number): ListPosition {
  const rect = trigger.getBoundingClientRect();
  const gutter = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gutter;
  const spaceAbove = rect.top - gutter;
  const placement =
    spaceBelow < Math.min(estimatedHeight, 220) && spaceAbove > spaceBelow ? 'above' : 'below';
  const available = placement === 'below' ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(120, Math.min(280, available));
  const top =
    placement === 'below'
      ? rect.bottom + gutter
      : Math.max(gutter, rect.top - gutter - Math.min(estimatedHeight, maxHeight));

  return {
    top,
    left: Math.max(gutter, Math.min(rect.left, window.innerWidth - rect.width - gutter)),
    width: rect.width,
    maxHeight,
    placement,
  };
}

export function PremiumSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  disabled = false,
  required = false,
  loading = false,
  error,
  placeholder = 'Select an option',
  size = 'normal',
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
  onChange,
}: PremiumSelectProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const errorId = `${reactId}-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [internalValue, setInternalValue] = useState(() =>
    resolveInitialValue(options, value, defaultValue),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [listPosition, setListPosition] = useState<ListPosition | null>(null);

  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
  const enabledIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const isDisabled = disabled || loading;
  const describedBy =
    [ariaDescribedby, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  const commit = useCallback(
    (next: string) => {
      if (value === undefined) setInternalValue(next);
      onChange?.(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null) {
      setListPosition(null);
      return;
    }

    function updatePosition() {
      if (triggerRef.current === null) return;
      const estimated =
        listRef.current?.offsetHeight ?? Math.min(280, Math.max(120, options.length * 44 + 16));
      setListPosition(measureListPosition(triggerRef.current, estimated));
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? 0));

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, enabledIndexes, open, options, selectedValue]);

  useEffect(() => {
    if (!open || listRef.current === null) return;
    const active = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function moveActive(delta: number) {
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const start = currentPosition === -1 ? 0 : currentPosition;
    const next = enabledIndexes[(start + delta + enabledIndexes.length) % enabledIndexes.length];
    if (next !== undefined) setActiveIndex(next);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (isDisabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        moveActive(-1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        {
          const option = options[activeIndex];
          if (option !== undefined && option.disabled !== true) commit(option.value);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      case 'Home':
        if (open && enabledIndexes[0] !== undefined) {
          event.preventDefault();
          setActiveIndex(enabledIndexes[0]);
        }
        break;
      case 'End':
        if (open) {
          const last = enabledIndexes[enabledIndexes.length - 1];
          if (last !== undefined) {
            event.preventDefault();
            setActiveIndex(last);
          }
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
      default:
        break;
    }
  }

  const activeOptionId =
    open && options[activeIndex] !== undefined ? `${listboxId}-option-${activeIndex}` : undefined;

  const listStyle: CSSProperties | undefined =
    listPosition === null
      ? undefined
      : {
          top: listPosition.top,
          left: listPosition.left,
          width: listPosition.width,
          maxHeight: listPosition.maxHeight,
        };

  const listbox =
    open && mounted
      ? createPortal(
          <ul
            className={`premium-select__list premium-select__list--portal premium-select__list--${listPosition?.placement ?? 'below'}`}
            id={listboxId}
            ref={listRef}
            role="listbox"
            style={listStyle}
            tabIndex={-1}
          >
            {options.length === 0 ? (
              <li className="premium-select__option is-disabled" role="presentation">
                <span className="premium-select__option-label">No options available</span>
              </li>
            ) : (
              options.map((option, index) => {
                const selected = option.value === selectedValue;
                const active = index === activeIndex;
                return (
                  <li
                    aria-disabled={option.disabled === true}
                    aria-selected={selected}
                    className={[
                      'premium-select__option',
                      selected ? 'is-selected' : '',
                      active ? 'is-active' : '',
                      option.disabled === true ? 'is-disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-active={active ? 'true' : undefined}
                    id={`${listboxId}-option-${index}`}
                    key={option.value}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (option.disabled === true) return;
                      commit(option.value);
                    }}
                    onMouseEnter={() => {
                      if (option.disabled !== true) setActiveIndex(index);
                    }}
                    role="option"
                  >
                    <span className="premium-select__option-copy">
                      <span className="premium-select__option-label">{option.label}</span>
                      {option.description ? (
                        <span className="premium-select__option-description">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span aria-hidden="true" className="premium-select__check">
                        ✓
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      className={[
        'premium-select',
        `premium-select--${size}`,
        open ? 'is-open' : '',
        error ? 'is-error' : '',
        loading ? 'is-loading' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      {name ? <input name={name} required={required} type="hidden" value={selectedValue} /> : null}
      <button
        aria-activedescendant={activeOptionId}
        aria-controls={listboxId}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={error ? true : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className="premium-select__trigger"
        disabled={isDisabled}
        id={id}
        onClick={() => {
          if (!isDisabled) setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={selectedOption ? 'premium-select__value' : 'premium-select__placeholder'}>
          {loading ? 'Loading…' : (selectedOption?.label ?? placeholder)}
        </span>
        <span aria-hidden="true" className="premium-select__chevron">
          <svg fill="none" height="18" viewBox="0 0 20 20" width="18">
            <path
              d="M5.5 7.75 10 12.25l4.5-4.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </span>
      </button>
      {error ? (
        <p className="premium-select__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {listbox}
    </div>
  );
}
