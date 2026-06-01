# Echolingo — public library, monetization & growth strategy

A strategy + sequenced roadmap for turning Echolingo from a working product into a
**sustainable, self-funding side project** with real, growing usage.

## 1. Positioning (the foundation everything else rests on)

Echolingo is a **multilingual, on-demand immersion-listening companion** — for any
language the TTS supports. Greek is only the founder's personal case; the product is
not Greek-specific.

The job it does: *remove the friction of finding good target-language audio at your
level, on a topic you actually care about.* You name a topic and get narrated audio in
seconds — to play in the car, on a walk, doing chores. Learning is meant to happen
**passively / subconsciously**: the brain absorbs vocabulary and patterns through
interesting, comprehensible listening while eyes and hands are busy.

**Category:** not "language app / Duolingo." Closer to *"an infinite, personalized
language podcast you can conjure."* It sits in the comprehensible-input / immersion
space (Dreaming Spanish, Refold, language podcasts) — and mostly fills the *gap*:
"there's nothing good at my level about what I care about."

**Differentiator vs. plain ChatGPT/Claude voice** (the one objection that matters, so
we lean into it):

- **Level-matched** (CEFR A1–C2) — comprehensible, not noise.
- **Bilingual echo** — you acquire *meaning*, not just sounds.
- **Purpose-built eyes-free player** — sentence highlight, speed, prev/next, lockscreen
  controls, resume, offline. Built for the car and the trail, not a chat transcript.
- **Zero friction** — name a topic → audio in seconds → walk. No prompting, no account.

**One-line pitch:** *"The audio you wish existed in the language you're learning — about
anything, at your level, in 10 seconds. Made to listen to, not to read."*

## 2. Goal & the central constraint

**Goal:** a sustainable side project that **covers its own expenses**. Not a VC-style
growth product; not purely a portfolio piece. A steady stream of genuinely happy users,
with revenue sufficient to cover the Azure OpenAI LLM + TTS inference bill.

This makes cost-coverage a *hard* constraint, and the immersion use case (long sessions,
repeated, on a commute) is the expensive one. So the monetization model is not an
afterthought — it is the thing that makes growth safe.

## 3. The model: public-by-default echoes + freemium

**Every echo is public.** You browse what others created, or create your own. The free
tier lets you create a few fresh echoes; a subscription unlocks more.

**The rule that makes it airtight:**

> **Browse / play = free & unlimited. Creating a *new* (uncached) echo = metered.**

This aligns the paywall precisely with cost, and it is already consistent with the
codebase: deterministic `(topic, language, level, length, mode)` IDs mean identical
requests return a cached echo, and **cache hits already do not consume the per-IP rate
limit**. Public-by-default extends that single-user cache into a shared, growing corpus.

Why this model wins:

- **The community builds the library for you** → solves the empty-shelf cold start.
- **Browsing/replaying is ~free** because it is all cache hits.
- **Only novel creation costs money** — exactly what the subscription gates.
- **Every public echo is an SEO page and a shareable link** → growth surface at ~zero
  marginal cost.
- **The free tier improves as the library grows** — more existing echoes to browse.
- **Spike-resilient:** a traffic surge mostly piles onto popular existing echoes (cache
  hits, cheap). Only a surge of *unique creation* costs money, and the free quota +
  paywall cap that.

## 4. Unit economics & the cost lever

Rough order-of-magnitude (TTS ≈ $15 / 1M characters, plus a small LLM script cost):

| Echo | Approx. TTS+LLM cost (fresh) |
|------|------------------------------|
| 5-min bilingual | ~$0.10–0.20 |
| 30-min bilingual | ~$0.50–1.00 |

A heavy commuter generating all-fresh content could run ~$1–2/day. Cached replays and
library browsing are ~free.

**The lever is caching.** The higher the cache-hit rate, the cheaper the service. The
public library is therefore both a product feature *and* the primary cost control.

**Two numbers to watch:** free→paid conversion (realistically ~1–3% for a tool like
this) and cache-hit rate / cost-per-free-listener. **The one dial:** if fresh-generation
cost outruns what subscribers subsidize, tighten the free creation quota.

## 5. Decisions forced by "all public"

1. **Public-by-default expectation.** Users will type personal/sensitive topics. Say
   loudly "everything you create is public," keep inputs topic-only (no personal fields),
   and add a topic content filter. This is the #1 trust risk.
2. **Moderation.** Public + free + AI invites spam/NSFW/abuse. Need: automated pre-gen
   topic filtering, a report button, a takedown path, and a basic content policy + ToS +
   privacy page. Light, but non-optional once content is public and monetized.
3. **Discovery is a real feature, not a flag.** "Browse what others created" needs a
   global, queryable catalog with search + filter (language / level / length) + sort
   (popular / new). Today there is only a per-device localStorage "your echoes" list.
4. **Free quota + subscriber identity.** Decide free = *N* fresh creates per day or per
   month. Keep browsing/free **anonymous**; require an account or a paste-in unlock key
   **only for paying subscribers** — preserving the "no login, ever" spirit for everyone
   who isn't paying.

## 6. Architecture implications (must be resolved for the SEO half to work)

The web app is a **Next.js static export**, and `/echo/[id]` is served as a single
static shell that reads the id from `window.location` at runtime. That is fine for app
use but **bad for SEO and link previews**: crawlers and social scrapers receive an empty
shell, not the transcript. The SEO flywheel in §8 depends on resolving this. Options:

- **(a)** Pre-render public echo pages to static HTML at creation time and serve from
  blob/CDN (fits the current static-export + linked-backend model; needs a build/publish
  step on echo creation).
- **(b)** Server-render echo pages via the Functions backend / move that route to
  SSR/ISR (richer, but changes the deploy model).
- **(c)** A hybrid: keep the SPA shell for the app, emit a crawlable, transcript-bearing
  static page + dynamic OG image per public echo.

Dynamic Open Graph cards (nice share previews) have the same prerequisite — they need a
dynamic/pre-rendered response per echo, which the pure static export does not provide.

This is the single biggest *new* technical decision the strategy introduces; it should
be settled during the public-browse build, not after launch.

## 7. The growth flywheel

> more creators → more public echoes → bigger free library + more SEO pages →
> more discovery traffic → more new users → more creators (and some convert to paid)

The model is a content-flywheel SaaS: the expensive action (creation) permanently
enlarges the cheap-to-serve asset (the public, cached, indexable library).

## 8. Promotion plan

**Two hard prerequisites — promotion before these backfires:**

- **Quality.** Public content makes one bad echo *everyone's* first impression. The
  migration off `tts-1` to `gpt-4o-mini-tts` on a dedicated resource (already on `dev`)
  targets the ~10% Greek-gibberish issue; **verify it actually resolves** across the
  promoted languages before driving traffic.
- **A seeded library.** Build the public browse surface and pre-generate a few hundred
  quality echoes across top languages × levels × interesting topics. A one-time cost you
  control — don't launch an empty shelf.

**Launch sequence (on top of the flywheel):**

1. **Immersion / comprehensible-input communities (home turf).** Language subreddits
   (r/languagelearning + per-language: r/Spanish, r/French, r/learnjapanese, r/Greek…),
   the Refold and Dreaming Spanish Discords, language-exchange servers. Lead with the
   *problem you had* — "couldn't find listening material at my level about things I
   actually care about, so I built this" — not a pitch. Each language community is a
   separate, repeatable launch. *Caveat:* the CI crowd holds strong views (e.g. some
   think bilingual translation interferes with acquisition) — message with care.
2. **Product Hunt.** Free + no-login + "AI listening on demand" is PH's sweet spot:
   spike, backlinks, credibility. After the seed + quality pass.
3. **Show HN.** Frame the *architecture* story (no-login, deterministic shareable URLs,
   caching-as-a-feature, PWA, serverless). HN overlaps with polyglots. Be ready for the
   "ChatGPT can do this" critique — answer with the §1 differentiation.
4. **Short-form video.** A 15-second "name a topic → audio in your ear → walk out the
   door" clip *is* the ad. Post organically on TikTok/Reels/Shorts; collab with
   CI/polyglot creators.
5. **SEO long-game (the durable compounding channel).** Public echo pages + full
   transcripts = thousands of crawlable long-tail pages ("[language] listening practice —
   [topic] — [level]"). Requires §6 resolved. Add a sitemap, indexable transcripts,
   canonical URLs, per-echo meta titles, OG cards.
6. **The viral loop you already built.** Shareable echo URLs + the existing conversion
   landing card. Add an explicit "share" affordance and good OG cards so shared links
   look great.

**Retention without login (the weak spot).** Levers available: PWA install, MediaSession
(feels like a podcast app), resume position, the local "your echoes" list. Consider an
*optional, opt-in* email ("save your library across devices") for a gentle
retention/marketing channel that doesn't break the no-login default; subscribers provide
email anyway.

## 9. Sequenced roadmap

Each phase is a buildable unit that should feed its own implementation plan.

- **Phase 0 — Quality gate.** Confirm the `gpt-4o-mini-tts` migration resolves the
  gibberish across the languages you intend to promote; add TTS-output validation /
  per-sentence regeneration if residual failures remain. *Gate: launch nothing public
  until first-listen quality is reliable.*
- **Phase 1 — Public browse + discovery.** A global, queryable echo catalog (index the
  existing blob-stored echoes; capture topic/lang/level/length/mode/createdAt/playCount).
  API: list/search/filter/sort + a popularity signal. Web: a browse/explore surface that
  coexists with the local "your echoes" list. Echoes public by default.
- **Phase 2 — Trust & safety.** "Everything is public" notice in the create form;
  pre-generation topic content filter; report button + takedown path; content policy +
  ToS + privacy page.
- **Phase 3 — Freemium + identity + payments.** Free quota of *N* fresh creates
  (extend the existing per-IP rate limit; pick the number); subscriber identity
  (account or paste-in unlock key, payers only); payment provider (e.g. Stripe);
  subscription/unlock state; quota UI + upgrade CTA at the limit.
- **Phase 4 — SEO & share polish.** Resolve §6 (crawlable echo pages); sitemap;
  indexable transcripts; per-echo OG/Twitter cards; canonical URLs and meta.
- **Phase 5 — Launch.** Seed-library generation script; then execute the §8 launch
  sequence (communities → Product Hunt → Show HN → short-form video → ongoing SEO).

## 10. Open decisions (needed as phases begin)

- Free quota: per day or per month, and the exact number.
- Subscriber identity: lightweight account vs. paste-in unlock key.
- Payment provider and price point (~$3–5/mo assumed in the economics above).
- Moderation approach: model-based topic filter only, or + human review queue.
- SEO rendering approach: §6 option (a) / (b) / (c).
- Which languages to seed and promote first (where the founder can dogfood and where
  the CI communities are most active).

## 11. Out of scope (for now)

Cross-device library sync as a free feature; native mobile apps; multi-voice / voice
selection as a paid feature (candidate for later); ads; affiliate/sponsorship revenue
(donations remain a possible soft supplement, not the plan).
