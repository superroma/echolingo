'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import { LESSON_LENGTHS, cefr, type LangCode, type LessonLength, type LessonLevel } from '@echolingo/shared/types';
import { LangSelect } from './select';
import { ArrowRightIcon } from './icons';

const SUGGESTIONS = [
  'at the bakery',
  'ordering coffee',
  'checking into a hotel',
  'small talk with a neighbour',
  'at the pharmacy',
  'asking for directions',
];

const CEFR_TICKS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function CreateEchoForm({ showSuggestions = false }: { showSuggestions?: boolean }) {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
  useEffect(autosize, [prefs.topic]);

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }
  function pickNative(code: LangCode) {
    setPrefs({
      ...prefs,
      nativeLang: code,
      targetLang: code === prefs.targetLang ? prefs.nativeLang : prefs.targetLang,
    });
  }
  function pickTarget(code: LangCode) {
    setPrefs({
      ...prefs,
      targetLang: code,
      nativeLang: code === prefs.nativeLang ? prefs.targetLang : prefs.nativeLang,
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const topic = prefs.topic.trim();
    if (!topic) return;
    const q = new URLSearchParams({
      topic,
      targetLang: prefs.targetLang,
      nativeLang: prefs.nativeLang,
      lengthMin: String(prefs.lengthMin),
      level: String(prefs.level),
    });
    router.push(`/echo/new?${q.toString()}`);
  }

  const fillPct = ((prefs.level - 1) / (CEFR_TICKS.length - 1)) * 100;

  return (
    <form onSubmit={submit} className="space-y-[18px]">
      <textarea
        ref={taRef}
        rows={1}
        required
        value={prefs.topic}
        onChange={(e) => update('topic', e.target.value)}
        onInput={autosize}
        placeholder="at the bakery, ordering coffee, asking the barista what they recommend…"
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-serif text-[calc(30px*var(--fs-scale))] leading-[1.22] tracking-[-0.015em] text-ink outline-none placeholder:text-ink-mute"
      />

      {showSuggestions && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => update('topic', s)}
              className="rounded-pill border border-line bg-paper-2 px-3.5 py-[9px] font-serif text-[15px] italic text-ink-soft"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-line" />

      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <Label>I speak</Label>
          <LangSelect label="I speak" value={prefs.nativeLang} disabledValue={prefs.targetLang} onChange={pickNative} />
        </div>
        <div>
          <Label>learning</Label>
          <LangSelect label="learning" value={prefs.targetLang} disabledValue={prefs.nativeLang} onChange={pickTarget} />
        </div>
      </div>

      <div>
        <Label>length</Label>
        <div className="flex gap-[9px]">
          {LESSON_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update('lengthMin', m as LessonLength)}
              className={
                'h-12 flex-1 rounded-pill text-[15px] font-semibold shadow-[var(--shadow-1)] transition ' +
                (prefs.lengthMin === m
                  ? 'border border-ink bg-ink text-paper-2'
                  : 'border border-line bg-paper-3 text-ink-soft')
              }
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>level · {cefr(prefs.level)}</Label>
        <div className="relative">
          <input
            type="range"
            min={1}
            max={CEFR_TICKS.length}
            step={1}
            value={prefs.level}
            onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
            aria-label="level"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
            style={{ background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--line) ${fillPct}%)` }}
          />
          <div className="mt-2.5 flex justify-between text-[12px] font-semibold tracking-[0.03em] text-ink-mute">
            {CEFR_TICKS.map((code, i) => (
              <span key={code} className={prefs.level === i + 1 ? 'text-accent' : undefined}>
                {code}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <button
          type="submit"
          disabled={!prefs.topic.trim()}
          className="inline-flex h-[54px] items-center justify-center gap-2.5 rounded-pill bg-accent px-[30px] font-serif text-[19px] font-semibold text-accent-ink shadow-[0_6px_16px_color-mix(in_srgb,var(--accent)_34%,transparent)] transition disabled:opacity-40 disabled:shadow-none"
        >
          go <ArrowRightIcon size={18} />
        </button>
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2.5 block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
      {children}
    </span>
  );
}
