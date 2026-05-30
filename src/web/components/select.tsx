'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LANG_CODES, LANG_NAME, type LangCode } from '@echolingo/shared/types';
import { ChevronDownIcon, CheckIcon } from './icons';

export function LangSelect({
  value,
  disabledValue,
  onChange,
  label,
}: {
  value: LangCode;
  disabledValue: LangCode;
  onChange: (c: LangCode) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // On open: seed the active option to the current value and focus the listbox
  // so arrow keys work immediately.
  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, LANG_CODES.indexOf(value)));
    listRef.current?.focus();
  }, [open, value]);

  // Keep the keyboard-active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIdx))?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx, baseId]);

  function commit(i: number) {
    const code = LANG_CODES[i];
    if (!code || code === disabledValue) return;
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Move the active index by `delta`, skipping the disabled (other-language) option.
  function step(from: number, delta: number): number {
    let n = from;
    for (let i = 0; i < LANG_CODES.length; i++) {
      n = (n + delta + LANG_CODES.length) % LANG_CODES.length;
      if (LANG_CODES[n] !== disabledValue) return n;
    }
    return from;
  }
  function edge(forward: boolean): number {
    for (let k = 0; k < LANG_CODES.length; k++) {
      const i = forward ? k : LANG_CODES.length - 1 - k;
      if (LANG_CODES[i] !== disabledValue) return i;
    }
    return activeIdx;
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => step(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => step(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIdx(edge(true));
        break;
      case 'End':
        e.preventDefault();
        setActiveIdx(edge(false));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIdx);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-label={label ? `${label}: ${LANG_NAME[value]}` : LANG_NAME[value]}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[54px] w-full items-center justify-between rounded-[16px] border border-line bg-paper-3 px-4 text-[17px] font-medium text-ink shadow-[var(--shadow-1)]"
      >
        <span>{LANG_NAME[value]}</span>
        <span className="flex text-ink-mute">
          <ChevronDownIcon size={18} />
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={optionId(activeIdx)}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] max-h-[260px] overflow-y-auto rounded-[16px] border border-line bg-paper-3 p-1.5 shadow-[var(--shadow-2)]"
        >
          {LANG_CODES.map((code, i) => {
            const isActive = code === value;
            const isDisabled = code === disabledValue;
            const isFocused = i === activeIdx;
            return (
              <div
                key={code}
                id={optionId(i)}
                role="option"
                aria-selected={isActive}
                aria-disabled={isDisabled}
                onClick={() => commit(i)}
                onMouseEnter={() => {
                  if (!isDisabled) setActiveIdx(i);
                }}
                className={
                  'flex items-center justify-between rounded-[10px] px-3 py-[11px] text-base ' +
                  (isActive ? 'font-semibold text-accent ' : 'text-ink ') +
                  (isDisabled ? 'pointer-events-none opacity-50 ' : 'cursor-pointer ') +
                  (isFocused && !isDisabled ? 'bg-paper' : '')
                }
              >
                <span>{LANG_NAME[code]}</span>
                {isActive && <CheckIcon size={16} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
