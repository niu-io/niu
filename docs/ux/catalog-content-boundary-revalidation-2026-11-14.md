# Catalog content boundary revalidation — 2026-11-14

Finding: `niu-mm90.13`. Actual hosted core `894a3ea7`, staging composition `caa3a4d`, read-only review while the routing correction was building. No metadata, price or credential was changed and no model request was invoked.

English model cards now use catalog display names and suppress raw Han-script descriptions. The Conatus detail still displays its original Chinese Provider paragraph without an English translation. This remains a content-language limitation; the review did not invent a translation of its conditional quota/commercial terms or infer that a description establishes current eligibility. The dedicated price and access explanation remain separate from upstream descriptive text.

An independent current models GET returned 200. The sampled BabelArk Wan3 record declares descriptive catalog video output, but gateway generation capabilities explicitly declare chat false and video false. Therefore the current no-preview treatment is truthful. Reject the historical proposal to add a Video trial to every video-tagged card: it would promote descriptive metadata into unsupported runtime qualification. The Conatus record separately declares chat true and video false, consistent with its Generations entry. This is current metadata evidence, not a live upstream trial or a guarantee of successful generation.

Applicable criteria: preserve [NN/g visibility and error prevention](https://www.nngroup.com/articles/ten-usability-heuristics/) and the UX review skill's requirement to distinguish unknown/negative runtime capability from descriptive catalog evidence. Niu's agent-oriented boundary requires trustworthy information and explicit authorization limits; it does not promise successful tasks merely from a catalog label. The remaining original-description language issue is tracked in Beads, rather than a second live Markdown backlog.

## Subsequent candidate verification

The current hosted detail was revalidated on core `41405546`: English still
led with the raw Chinese paragraph. The actual OpenRouter model detail at
`/recraft/recraft-v4.1-flash-v2:free` was inspected at desktop and 390px,
including Show more / Show less. The candidate retains Niu's existing
Collapsible description pattern and structured facts. When the same Han-script
check used by English cards identifies original content, the detail starts with
Show original description instead of an untranslated paragraph. Its content is
preserved verbatim behind that explicit disclosure. This is presentation of
original content, not a supplied English translation or a change to commercial
terms. Chinese and existing English descriptions retain their current preview.

Actual staging-backed local verification used Conatus and BabelArk video
records. At 320px, keyboard Enter opened the original description, exposed its
complete retained text, and a second Enter closed it with focus on the trigger.
Document width remained 320px. Closed and expanded screenshots were separately
inspected; the model, its public ID, billing explanation and prices remained
legible. A 1440px closed screenshot was also inspected. At 1024px, available
detail widths measured 736px with navigation expanded and 912px collapsed,
without document overflow. No page maximum width was introduced.

Chinese at 390px retained the original description preview and Show more;
its screenshot was inspected. The browser language was restored to English.
The BabelArk English description remained directly visible and no unsupported
Try in Video link appeared. No catalog metadata, price, capability, credential
or generation request was changed. A selector initially used the wrong Chinese
accessible name for the language control; observing its actual name allowed
normal UI restoration and does not establish a product failure.

The applicable disclosure criteria are the
[WAI-ARIA disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
and the design skill's progressive-disclosure and localization guidance. The
visible gain is an English initial reading path with preserved, explicitly
original source content. It does not resolve the absence of a professionally
localized Provider description. Hosted candidate acceptance remains pending.

## Hosted acceptance

PR #175 is included in core `799bb7ce96fcd4841391ac4bdec6a6c02faf956b`,
staging composition `b9544449b22dc26dadd51193745a10e233c2ad6d`.
Deployment `dep-dbs2ajc9v7es73bgfl70` became live at 09:19:01 UTC; readiness
returned 200. Fresh hosted 320px closed and keyboard-expanded views and a
1440px closed view were visually inspected. The initial English view no longer
led with the Chinese paragraph. A separate current models read returned 200;
the expanded original text exactly matched its catalog description. Enter
collapsed it with focus retained on the trigger; document width remained
320px. Chinese at 390px retained its existing description preview without
overflow. The interface language was restored to English, and BabelArk's
existing English description remained visible without an unsupported Video
trial. No model invocation, metadata or commercial change was used for this
acceptance. This accepts presentation of original content, not a translation or
an upstream availability promise.

An earlier locale-verification navigation reached sign-in when the existing
session lost validity. That interrupted run is excluded. The same configured
account was signed in again without a password change, after which the Chinese
preview and restoration to English were completed against the hosted source.
