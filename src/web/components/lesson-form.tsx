'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import { createLesson } from '../lib/api';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  NATIVE_LANGS,
  type LessonParams,
  type LessonLength,
  type LessonLevel,
  type LessonStyle,
  type LessonMode,
  type BilingualOrder,
  type NativeLang,
} from '@echolingo/shared/types';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; message: string };

export function LessonForm() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs.topic.trim()) return;
    setStatus({ kind: 'submitting' });
    const params: LessonParams = {
      topic: prefs.topic.trim(),
      lengthMin: prefs.lengthMin,
      level: prefs.level,
      style: prefs.style,
      mode: prefs.mode,
      bilingualOrder: prefs.bilingualOrder,
      nativeLang: prefs.nativeLang,
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
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Topic</span>
        <input
          type="text"
          required
          value={prefs.topic}
          onChange={(e) => update('topic', e.target.value)}
          placeholder="at the bakery"
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <div>
        <span className="text-sm font-medium text-neutral-700">Length (min)</span>
        <div className="mt-1 flex gap-2">
          {LESSON_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update('lengthMin', m as LessonLength)}
              className={
                'rounded-md border px-3 py-1.5 text-sm ' +
                (prefs.lengthMin === m
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 bg-white text-neutral-800')
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Level: {prefs.level}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={prefs.level}
          onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
          className="mt-1 block w-full"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Style</span>
        <select
          value={prefs.style}
          onChange={(e) => update('style', e.target.value as LessonStyle)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {LESSON_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Mode</span>
        <select
          value={prefs.mode}
          onChange={(e) => update('mode', e.target.value as LessonMode)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {LESSON_MODES.map((m) => (
            <option key={m} value={m}>
              {m === 'greek_only' ? 'Greek only' : 'Bilingual'}
            </option>
          ))}
        </select>
      </label>

      {prefs.mode === 'bilingual' && (
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Bilingual order</span>
          <select
            value={prefs.bilingualOrder}
            onChange={(e) => update('bilingualOrder', e.target.value as BilingualOrder)}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
          >
            {BILINGUAL_ORDERS.map((o) => (
              <option key={o} value={o}>
                {o === 'gr_first' ? 'Greek first' : 'Native first'}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Native language</span>
        <select
          value={prefs.nativeLang}
          onChange={(e) => update('nativeLang', e.target.value as NativeLang)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {NATIVE_LANGS.map((l) => (
            <option key={l} value={l}>
              {l === 'en' ? 'English' : 'Russian'}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={status.kind === 'submitting' || !prefs.topic.trim()}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:bg-neutral-400"
      >
        {status.kind === 'submitting' ? 'Generating…' : 'Go'}
      </button>

      {status.kind === 'rate_limited' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Daily limit reached ({status.used}/{status.limit}). Resets at {status.resetAt}.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          Error: {status.message}
        </p>
      )}
    </form>
  );
}
