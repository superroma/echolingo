'use client';

import { useEffect, useRef, useState } from 'react';
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
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
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
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] max-h-[260px] overflow-y-auto rounded-[16px] border border-line bg-paper-3 p-1.5 shadow-[var(--shadow-2)]">
          {LANG_CODES.map((code) => {
            const isActive = code === value;
            const isDisabled = code === disabledValue;
            return (
              <div
                key={code}
                role="option"
                aria-selected={isActive}
                aria-disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(code);
                  setOpen(false);
                }}
                className={
                  'flex cursor-pointer items-center justify-between rounded-[10px] px-3 py-[11px] text-base ' +
                  (isActive ? 'font-semibold text-accent ' : 'text-ink ') +
                  (isDisabled ? 'pointer-events-none opacity-50' : 'hover:bg-paper')
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
