# Greek TTS gibberish (~10% of sentences)

## Symptom

Roughly 10% of synthesized Greek sentences come out as "garbage sounds" —
language-like phrases that are not actually Greek. Failures are random: the same
sentence can sound correct on one generation and garbled on another.

## Root cause

This is a well-known, widely-reported limitation of OpenAI TTS (`tts-1` /
`tts-1-hd`), not a bug in our code. Three properties combine into this symptom:

1. **Voices are optimized for English.** OpenAI states this explicitly. For
   non-English text the model approximates phonetics; for Greek (non-Latin script,
   English-tuned voices) that approximation sometimes collapses into noise.
2. **No reliable language parameter.** The classic speech endpoint *guesses* the
   language from the input text alone. There is no dependable hard override.
3. **Non-deterministic.** The same input can produce correct or garbled audio on
   different calls — which is why we see a random ~10% rather than consistent
   failures on specific sentences.

### Why our app amplifies it

`worker-tts-sentence.ts` → `openai-tts-engine.ts` synthesizes **one short sentence
per TTS call**, with `voice: 'alloy'`, no language hint, and no surrounding context:

```ts
this.client.audio.speech.create({ model, voice, input: req.text, response_format: 'mp3' })
```

Short, isolated input is the worst case for language auto-detection — the model has
almost nothing to lock onto. Community consensus: detection is "more challenging…
with minimal input," and "some languages share the same words, so even OpenAI cannot
guess without context."

## Solutions (ranked for this codebase)

### 1. Quick win — switch model + pin the language (low effort, big reduction)

`tts-1` is the oldest/weakest model and **ignores** steering. Switch to
**`gpt-4o-mini-tts`**, which accepts an `instructions` parameter:

```ts
this.client.audio.speech.create({
  model: 'gpt-4o-mini-tts',
  voice,
  input: req.text,
  instructions: 'Speak in natural, native Greek with correct Greek pronunciation.',
  response_format: 'mp3',
})
```

Newer base model + an explicit "this is Greek" instruction meaningfully cuts the
failure rate. Accent steering is imperfect per the community, but **language**
steering on the newer model is the cheap first fix. In prod, add a
`gpt-4o-mini-tts` deployment to the Azure OpenAI resource.

### 2. Most reliable — use a TTS engine with an *explicit* language code

The type system already anticipates this: `TtsEngineName = 'openai' | 'elevenlabs' |
'google'`, with a clean `TtsEngine` interface. For a Greek-focused product, a
provider where language is an *input* (not a guess) makes gibberish essentially
disappear:

- **Azure AI Speech** (Cognitive Services Speech, *not* Azure OpenAI TTS) — native
  `el-GR` neural voices (`el-GR-AthinaNeural`, `el-GR-NestorasNeural`). It's Azure,
  so it fits our existing managed-identity/SAMI infra with no new key handling.
- **Google Cloud TTS** — explicit `languageCode: 'el-GR'` + Greek voices.

Highest-correctness option; the union type was always the intended escape hatch.

### 3. Robust safety net — verify-and-retry in the worker

Because the failure is random, detect and re-synthesize. After generating a
sentence's MP3, run it back through **Whisper STT with `language='el'`** and compare
the transcript to the input (or just check the detected language). On mismatch, retry
up to N times. Slots into `worker-tts-sentence.ts` and the existing
`retryWithBackoff`, and is robust even if we keep OpenAI TTS. Costs an extra STT call
+ latency per sentence.

### 4. Cheap supporting tweaks

Ensure every sentence ends with punctuation (a trailing period measurably helps
detection). Note that single-sentence synthesis is inherently fragile — more context
= better language lock-in, though that trades against per-sentence highlighting.

## Recommendation

Combine **#1 + #3** for a fast, robust fix on the current stack, and seriously
consider **#2 (Azure AI Speech `el-GR`)** as the real long-term answer, since the
language stops being guessed at all — which is the actual disease, not a symptom.

## Sources

- [TTS: Flawed by design for non-English languages. Here's why](https://community.openai.com/t/tts-flawed-by-design-for-non-english-languages-heres-why/509478)
- [Can I choose the TTS language?](https://community.openai.com/t/can-i-choose-the-tts-language/477491)
- [TTS is unpredictable and often really wrong for non-English requests](https://community.openai.com/t/tts-is-unpredictable-and-often-really-wrong-for-non-english-requests/603462)
- [Foreign-language TTS produces complete gibberish](https://community.openai.com/t/foreign-language-tts-produces-complete-gibberish/1138849)
- [TTS wrong/correct pronunciation at each generation](https://community.openai.com/t/tts-wrong-correct-pronunciation-at-each-generation/941751)
- [Text to speech — OpenAI API docs](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Voice Instruction with gpt-4o-mini-tts](https://community.openai.com/t/voice-instruction-with-gpt-4o-mini-tts/1372075)
