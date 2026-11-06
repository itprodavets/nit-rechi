import { reviewKey } from './anki-model';
import type { RecentLapse } from './anki-history';
import { lastSpoken, localDay } from './model';
import type { DailyWord, Study, Word } from './model';

export const dailyLimit = 5;
export const lapseWindow = 30 * 86_400_000;

export function dailyTargets(words: Word[], results: Study['results'], lapses: ReadonlyMap<string, RecentLapse>, now: number): DailyWord[] {
  const today = localDay(now);
  const candidates = [];
  const fallback = [];
  for (const word of words) {
    const result = results[word.id];
    const { outcome: spoken, updated: spokenAt } = lastSpoken(result);
    const lapse = word.ankiGuid && lapses.get(reviewKey(word.language, word.ankiGuid));
    if (spokenAt && localDay(spokenAt) === today && spoken === 'independent') continue;
    if (spoken === 'independent' && result?.due && result.due > now && spokenAt && (!lapse || spokenAt >= lapse.last)) continue;
    if (!lapse && spoken !== 'retry' && spoken !== 'assisted') {
      if (word.ankiReviews && (result?.due ?? 0) <= now) {
        fallback.push({ wordId: word.id, reviews: word.ankiReviews, due: result?.due ?? 0 });
      }
      continue;
    }
    candidates.push({
      wordId: word.id, lapses: lapse ? lapse.count : 0, last: lapse ? lapse.last : 0,
      needsSpeech: spoken === 'retry' ? 2 : spoken === 'assisted' ? 1 : 0
    });
  }
  if (!candidates.length) return fallback
    .sort((a, b) => a.due - b.due || a.reviews - b.reviews || a.wordId.localeCompare(b.wordId))
    .slice(0, dailyLimit)
    .map(({ wordId }) => ({ wordId, lapses: 0, fromReview: true }));

  return candidates
    .sort((a, b) => b.lapses - a.lapses || b.needsSpeech - a.needsSpeech || b.last - a.last || a.wordId.localeCompare(b.wordId))
    .slice(0, dailyLimit)
    .map(({ wordId, lapses }) => ({ wordId, lapses }));
}
