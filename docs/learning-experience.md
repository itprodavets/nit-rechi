# Focused learning experience

## Intent and established constraints

Help the owner spend available time using vocabulary, with a clear next action and an end to each session. Preserve React, GitHub Pages, browser-local data, imports from Anki and external AI chats, multilingual data and existing maps, materials and recordings. No provider API or new runtime dependencies. Imported collections must remain intact.

## Design decision

A cosmetic refresh alone would leave an unbounded practice queue. A second full spaced-repetition system would compete with Anki. The chosen approach is a bounded daily application session alongside free practice: recall a word, use it in a personal sentence, revisit difficult words at the end, then show a concrete result. Existing materials and topic practice remain reachable from Today. This implements the user's established focus on spoken use and personal context.

Today is the landing screen. Approximate budgets of 5/10/15 minutes select at most 3/5/8 words, not a countdown. Priorities are recent imported lapses, due difficult practice, due known words, then unpracticed words. At most two new words join a session containing review words; a new dictionary can start without review history. Future due and already successful today words are excluded unless a newer imported lapse justifies re-entry. No imported collection is labelled a giant overdue backlog.

The session persists selected language, items, cursor, recall outcome, practice mode and completion results. A difficult first attempt is revisited once after the initial set. Immediate successful retry does not erase the need for next-day review. Typed recognition is not evidence of independent speaking. Browser-local word matching checks occurrence only, with an explicit limit on grammar/meaning feedback. Oral practice retains recording and optional on-device transcription. An answer must be attempted and compared before self-assessment.

## Visual system

Warm pale canvas, white surfaces, deep green primary actions and muted violet secondary accents. One type system with compact headings, generous spacing, visible focus, 44px controls, restrained connected-dot brand motif. Desktop side navigation and a small top utility bar; four primary destinations in a mobile bottom bar, with vocabulary/settings in the top bar. Focus mode shows one learning task with progress and an exit that preserves work. No decorative brain occupying learning space.

## Implementation sequence

1. `domain/learning-session.ts` owns deterministic selection, durable phase transitions, repeat scheduling and progress facts. Extend optional Study data for backwards-compatible persistence. Node tests cover ranking, time budgets, language isolation, resumption, duplicate clicks, future-due exclusion and outcome scheduling.
2. `components/Today.tsx` and `LearningSession.tsx` own the overview, recall/use flow, retry round and summary. Reuse WordCue, WordExamplesList, Recording and VoiceButtons. Keep free Practice available. No external AI generation is implied.
3. `AppShell.tsx`, `Icon.tsx` and scoped shell/learning CSS establish responsive navigation and the shared visual language. Update existing palette and cross-screen contrast without changing storage/import behavior.
4. Build and domain checks, browser tests at 320, 390, 768 and desktop widths, a completed session plus reload and foreign-language switch. Review diff, publish through existing GitHub PR/Pages workflow and verify the actual deployed UI.

## Research and limits

[Karpicke & Roediger (2008)](https://learninglab.psych.purdue.edu/downloads/2008/2008_Karpicke_Roediger_Science.pdf) supports retrieval after initial learning for delayed vocabulary recall. [Kim & Webb (2022)](https://doi.org/10.1111/lang.12479) found benefits of spaced second-language practice across 48 experiments. The concrete session length, priority weights, interface and within-session revisit are product choices, not validated optimal parameters. No numerical acceleration or proficiency guarantee is claimed. Self-rated speaking outcomes and imported Anki recognition remain distinct evidence.
