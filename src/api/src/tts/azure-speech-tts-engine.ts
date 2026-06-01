import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import {
  estimateMp3DurationSec,
  type TtsEngine,
  type TtsLang,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
} from '../_shared/index.js';

/**
 * BCP-47 locale per app language. Azure Speech uses fixed, deterministic neural
 * voices, so picking the locale (and letting the service use that locale's
 * default voice) yields the SAME speaker on every call — which is the whole
 * point of this engine: it fixes the per-sentence voice drift of the generative
 * gpt-4o-mini-tts model, while still pinning the language (no gibberish).
 *
 * A few entries map to Azure's own locale spelling (Norwegian → nb-NO,
 * Tagalog → fil-PH). Set AZURE_SPEECH_VOICE to override every language with one
 * (multilingual) voice instead.
 */
export const LANG_LOCALE: Record<TtsLang, string> = {
  af: 'af-ZA',
  ar: 'ar-EG',
  hy: 'hy-AM',
  az: 'az-AZ',
  be: 'be-BY',
  bs: 'bs-BA',
  bg: 'bg-BG',
  ca: 'ca-ES',
  zh: 'zh-CN',
  hr: 'hr-HR',
  cs: 'cs-CZ',
  da: 'da-DK',
  nl: 'nl-NL',
  en: 'en-US',
  et: 'et-EE',
  fi: 'fi-FI',
  fr: 'fr-FR',
  gl: 'gl-ES',
  de: 'de-DE',
  el: 'el-GR',
  he: 'he-IL',
  hi: 'hi-IN',
  hu: 'hu-HU',
  is: 'is-IS',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  kn: 'kn-IN',
  kk: 'kk-KZ',
  ko: 'ko-KR',
  lv: 'lv-LV',
  lt: 'lt-LT',
  mk: 'mk-MK',
  ms: 'ms-MY',
  mr: 'mr-IN',
  mi: 'mi-NZ',
  ne: 'ne-NP',
  no: 'nb-NO',
  fa: 'fa-IR',
  pl: 'pl-PL',
  pt: 'pt-PT',
  ro: 'ro-RO',
  ru: 'ru-RU',
  sr: 'sr-RS',
  sk: 'sk-SK',
  sl: 'sl-SI',
  es: 'es-ES',
  sw: 'sw-KE',
  sv: 'sv-SE',
  tl: 'fil-PH',
  ta: 'ta-IN',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  ur: 'ur-PK',
  vi: 'vi-VN',
  cy: 'cy-GB',
};

export function localeFor(lang: TtsLang): string {
  return LANG_LOCALE[lang];
}

export interface AzureSpeechEngineOptions {
  region: string;
  /** Full ARM resource id of the Speech resource (for the aad# auth token). */
  resourceId: string;
  /** Mints a Microsoft Entra access token for cognitiveservices.azure.com. */
  tokenProvider: () => Promise<string>;
  /** Optional single voice for every language (e.g. a multilingual neural voice). */
  voice?: string;
}

export class AzureSpeechTtsEngine implements TtsEngine {
  readonly name = 'azurespeech' as const;

  constructor(private readonly opts: AzureSpeechEngineOptions) {}

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const aadToken = await this.opts.tokenProvider();
    // Speech AAD auth: "aad#{resourceId}#{token}" as the authorization token.
    const authToken = `aad#${this.opts.resourceId}#${aadToken}`;
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(authToken, this.opts.region);
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

    const voice = req.voice ?? this.opts.voice;
    if (voice) {
      speechConfig.speechSynthesisVoiceName = voice;
    } else {
      // No voice name → Azure uses the locale's default neural voice (consistent).
      speechConfig.speechSynthesisLanguage = localeFor(req.lang);
    }

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    try {
      const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
        synthesizer.speakTextAsync(req.text, resolve, reject);
      });
      if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
        const detail =
          result.reason === sdk.ResultReason.Canceled
            ? sdk.CancellationDetails.fromResult(result).errorDetails
            : `reason ${result.reason}`;
        throw new Error(`Azure Speech synthesis failed: ${detail}`);
      }
      const mp3 = Buffer.from(result.audioData);
      // audioDuration is in 100-ns ticks; fall back to an estimate if absent.
      const durationSec = result.audioDuration > 0 ? result.audioDuration / 10_000_000 : estimateMp3DurationSec(req.text);
      return { mp3, durationSec };
    } finally {
      synthesizer.close();
    }
  }
}
