'use client';

import { useRouter } from 'next/navigation';
import { cefr, LANG_NAME, type Lesson } from '@echolingo/shared/types';
import { SparkIcon, ArrowRightIcon } from './icons';

/** A visit is "shared" (show conversion affordances) when the echo was NOT
 *  already in this device's library at the time it was first opened. */
export function isSharedVisit({ libraryHadId }: { libraryHadId: boolean }): boolean {
  return !libraryHadId;
}

export function ShareContextStrip({ echo }: { echo: Lesson }) {
  const router = useRouter();
  return (
    <div className="mx-[22px] mb-1 mt-3.5 flex flex-col items-start gap-[11px] rounded-[16px] border border-line bg-paper-2 p-4">
      <p className="text-[13.5px] leading-[1.45] text-ink-soft">
        a <b className="font-semibold capitalize text-ink">{LANG_NAME[echo.params.targetLang]}</b> listening lesson
        someone shared with you · {echo.params.lengthMin} min · {cefr(echo.params.level)}. press play to listen —
      </p>
      <button
        type="button"
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-pill border border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--paper-3))] px-[15px] py-[9px] text-[13.5px] font-semibold text-accent"
      >
        <SparkIcon size={14} /> or make your own <ArrowRightIcon size={15} />
      </button>
    </div>
  );
}

export function ConversionCard() {
  const router = useRouter();
  return (
    <div className="mx-[22px] mb-2 mt-[18px] rounded-[22px] border border-line bg-paper-2 px-[26px] pb-7 pt-[30px] text-center shadow-[var(--shadow-1)]">
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">your turn</div>
      <div className="mb-3 font-serif text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink">
        learn anything,
        <br />
        the same way
      </div>
      <p className="mx-auto mb-[22px] max-w-[30ch] text-[15px] leading-[1.5] text-ink-soft">
        echolingo turns any topic into a narrated lesson — your languages, your level, ready in seconds. no sign-up
        required.
      </p>
      <button
        type="button"
        onClick={() => router.push('/')}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-[17px] font-semibold text-accent-ink shadow-[0_6px_18px_color-mix(in_srgb,var(--accent)_36%,transparent)]"
      >
        <SparkIcon size={16} /> make your own echo
      </button>
      <div className="mt-3.5 text-[12.5px] text-ink-mute">free · no account · works offline</div>
    </div>
  );
}
