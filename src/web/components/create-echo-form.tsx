'use client';

import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import {
  LESSON_LENGTHS,
  LANG_NAME,
  LANG_CODES,
  type LangCode,
  type LessonLength,
  type LessonLevel,
} from '@echolingo/shared/types';

const LANG_OPTIONS: LangCode[] = [...LANG_CODES];

export function CreateEchoForm() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();

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
    let nextTarget = prefs.targetLang;
    if (nextTarget === code) {
      nextTarget = code === 'el' ? 'es' : 'el';
    }
    setPrefs({ ...prefs, nativeLang: code, targetLang: nextTarget });
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

  return (
    <form onSubmit={submit} className="space-y-5">
      <textarea
        required
        rows={3}
        value={prefs.topic}
        onChange={(e) => update('topic', e.target.value)}
        placeholder="at the bakery, ordering coffee, …"
        className="block w-full resize-y border-0 border-b border-hairline bg-transparent px-0 py-2 font-serif text-2xl text-ink placeholder:text-ink-faint focus:border-aegean focus:outline-none focus:ring-0"
      />

      <div className="grid grid-cols-2 gap-3">
        <LangSelect
          label="I speak"
          value={prefs.nativeLang}
          exclude={prefs.targetLang}
          onChange={pickNative}
        />
        <LangSelect
          label="Learning"
          value={prefs.targetLang}
          exclude={prefs.nativeLang}
          onChange={pickTarget}
        />
      </div>

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

      <div className="flex flex-col items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!prefs.topic.trim()}
          className="rounded-full bg-terracotta px-12 py-3 font-medium text-white shadow-sm transition-opacity disabled:opacity-60"
        >
          go
        </button>
      </div>
    </form>
  );
}

function LangSelect({
  label,
  value,
  exclude,
  onChange,
}: {
  label: string;
  value: LangCode;
  exclude: LangCode;
  onChange: (c: LangCode) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LangCode)}
        className="mt-1 block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink focus:border-aegean focus:outline-none focus:ring-0"
      >
        {LANG_OPTIONS.filter((c) => c !== exclude).map((code) => (
          <option key={code} value={code}>
            {LANG_NAME[code]}
          </option>
        ))}
      </select>
    </label>
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
