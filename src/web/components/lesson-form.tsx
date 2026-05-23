'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import { createLesson } from '../lib/api';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  LANG_NAME,
  type LangCode,
  type LessonParams,
  type LessonLength,
  type LessonLevel,
  type LessonStyle,
  type LessonMode,
  type BilingualOrder,
} from '@echolingo/shared/types';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; message: string };

const TARGET_LANGS: LangCode[] = ['el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh'];
const NATIVE_LANG_OPTIONS: LangCode[] = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'];

export function LessonForm() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [nativePopoverOpen, setNativePopoverOpen] = useState(false);

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }

  function pickTarget(code: LangCode) {
    let nextNative = prefs.nativeLang;
    if (nextNative === code) {
      nextNative = code === 'en' ? 'ru' : 'en';
    }
    setPrefs({ ...prefs, targetLang: code, nativeLang: nextNative });
  }

  function pickNative(code: LangCode) {
    if (code === prefs.targetLang) return;
    setPrefs({ ...prefs, nativeLang: code });
    setNativePopoverOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs.topic.trim()) return;
    setStatus({ kind: 'submitting' });
    const params: LessonParams = {
      topic: prefs.topic.trim(),
      targetLang: prefs.targetLang,
      nativeLang: prefs.nativeLang,
      lengthMin: prefs.lengthMin,
      level: prefs.level,
      style: prefs.style,
      mode: prefs.mode,
      bilingualOrder: prefs.bilingualOrder,
      ttsEngine: 'openai',
    };
    const result = await createLesson(params);
    if (result.kind === 'created' || result.kind === 'existing') {
      router.push(`/lesson/${result.id}/`);
    } else if (result.kind === 'rate_limited') {
      setStatus(result);
    } else {
      setStatus({ kind: 'error', message: result.message });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <input
        type="text"
        required
        value={prefs.topic}
        onChange={(e) => update('topic', e.target.value)}
        placeholder="at the bakery"
        className="block w-full border-0 border-b border-hairline bg-transparent px-0 py-2 font-serif text-2xl text-ink placeholder:text-ink-faint focus:border-aegean focus:outline-none focus:ring-0"
      />

      <Field label="LEARN">
        <ChipRow>
          {TARGET_LANGS.map((code) => (
            <Chip
              key={code}
              active={prefs.targetLang === code}
              onClick={() => pickTarget(code)}
            >
              {LANG_NAME[code].toLowerCase()}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="LENGTH">
        <ChipRow>
          {LESSON_LENGTHS.map((m) => (
            <Chip
              key={m}
              active={prefs.lengthMin === m}
              onClick={() => update('lengthMin', m as LessonLength)}
            >
              {m} min
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label={`LEVEL ${prefs.level}`}>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={prefs.level}
          onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
          className="block w-full accent-aegean"
        />
      </Field>

      <Field label="STYLE">
        <ChipRow>
          {LESSON_STYLES.map((s) => (
            <Chip
              key={s}
              active={prefs.style === s}
              onClick={() => update('style', s as LessonStyle)}
            >
              {s}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="MODE">
        <ChipRow>
          {LESSON_MODES.map((m) => (
            <Chip
              key={m}
              active={prefs.mode === m}
              onClick={() => update('mode', m as LessonMode)}
            >
              {m === 'target_only' ? 'target only' : 'bilingual'}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      {prefs.mode === 'bilingual' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <button
            type="button"
            onClick={() =>
              update(
                'bilingualOrder',
                (prefs.bilingualOrder === 'target_first'
                  ? 'native_first'
                  : 'target_first') as BilingualOrder,
              )
            }
            className="underline-offset-4 hover:underline"
          >
            {prefs.bilingualOrder === 'target_first' ? 'target first' : 'native first'}
          </button>
          <span aria-hidden>↔</span>
          <button
            type="button"
            onClick={() => setNativePopoverOpen((v) => !v)}
            className="underline-offset-4 hover:underline"
            aria-haspopup="listbox"
            aria-expanded={nativePopoverOpen}
          >
            {LANG_NAME[prefs.nativeLang].toLowerCase()}
          </button>
          {nativePopoverOpen && (
            <ul role="listbox" className="ml-2 flex flex-wrap gap-1">
              {NATIVE_LANG_OPTIONS.filter((c) => c !== prefs.targetLang).map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => pickNative(code)}
                    className={
                      'rounded-full border border-hairline px-2 py-0.5 text-xs ' +
                      (prefs.nativeLang === code
                        ? 'bg-ink text-paper'
                        : 'bg-surface text-ink')
                    }
                  >
                    {LANG_NAME[code].toLowerCase()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status.kind === 'submitting' || !prefs.topic.trim()}
          className="rounded-full bg-terracotta px-12 py-3 font-medium text-white shadow-sm transition-opacity disabled:opacity-60"
        >
          {status.kind === 'submitting' ? 'generating…' : 'go'}
        </button>

        {status.kind === 'rate_limited' && (
          <p className="border-l-2 border-terracotta bg-paper px-3 py-2 text-sm text-ink-muted">
            Daily limit reached ({status.used}/{status.limit}). Resets at {status.resetAt}.
          </p>
        )}
        {status.kind === 'error' && (
          <p className="border-l-2 border-terracotta bg-paper px-3 py-2 text-sm text-ink-muted">
            Error: {status.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
        (active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline bg-surface text-ink hover:border-ink')
      }
    >
      {children}
    </button>
  );
}
