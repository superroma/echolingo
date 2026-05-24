'use client';

import type { Lesson } from '@echolingo/shared/types';

export function EchoProgress({ echo }: { echo: Lesson }) {
  const { status, readySentences, totalSentences, sentences, params } = echo;
  const pct = totalSentences > 0 ? Math.round((readySentences / totalSentences) * 100) : 0;

  if (status === 'failed') {
    return (
      <div className="border-l-2 border-terracotta bg-paper px-4 py-3 text-sm text-ink-muted">
        Generation failed. {echo.error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-px w-full bg-hairline">
        <div
          className="h-full bg-aegean transition-all duration-300"
          style={{ width: `${pct}%` }}
          aria-label={`${readySentences} of ${totalSentences} sentences ready`}
        />
      </div>

      <p className="text-xs uppercase tracking-wider text-ink-muted">
        {status === 'generating_script'
          ? 'writing script…'
          : `${readySentences} / ${totalSentences} ready`}
      </p>

      <ol className="space-y-1">
        {sentences.map((s) => (
          <li
            key={s.i}
            className="px-1 py-1 transition-opacity duration-300"
            style={{ opacity: s.status === 'ready' ? 1 : 0.3 }}
          >
            <p className="font-serif text-base text-ink">{s.gr}</p>
            {params.mode === 'bilingual' && (
              <p className="text-xs text-ink-muted">{s.native}</p>
            )}
            {s.status === 'failed' && (
              <p className="text-xs text-terracotta">[skipped]</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
