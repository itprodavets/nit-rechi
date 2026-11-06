# Topic dialogue and responsive vocabulary

The user chooses a conversation topic and words reviewed in Anki before practice. The local app stays API-free. A dialogue workspace supports alternating written lines, recording, existing topic references, a copyable external-chat task, and explicit per-word self-assessment. It never pretends a static prompt is an AI reply.

The existing daily retrieval lesson remains available. A separate, language-scoped dialogue draft avoids replacing that lesson. Selected word IDs are frozen at start; adding them to a topic unions links without widening the exercise. Resume preserves draft text and mode. Only explicitly rated selected words receive practice results, once per completed session. Missing/deleted/foreign words cannot receive results.

Alternatives considered: sending the user to the existing free-practice topic would train all linked words and not preserve the chosen set; connecting an online generator conflicts with the user's API-free requirement. A shared local preparation/workspace is the selected implementation.

Implementation order: introduce pure dialogue/session and calendar-period functions with regression tests; build a reusable review-history hook and preparation/workspace components used by Today and Anki reviews; then replace vocabulary's equal-width columns with responsive word/context/progress rows and remove the application container caps. Existing forms and reading exercises can retain their readable line length.

Verification covers date boundaries, explicit word selection, untouched topic links and daily sessions, stale or duplicate completion, language isolation, reload/resume, keyboard/mobile controls, and rendered vocabulary widths at 320, 390, 768, 1440 and 1920 pixels. Run the existing test suite and production build, merge through the owning GitHub repository, and verify the deployed assets and UI.
