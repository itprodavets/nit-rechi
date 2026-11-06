import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { readReviewedKeys } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { reviewPeriodRange } from '../domain/dialogue-session';
import type { ReviewPeriod } from '../domain/dialogue-session';

export function useReviewedWords(period: ReviewPeriod | 'all') {
  const { active, study } = useWorkspace();
  const [state, setState] = useState<{ scope: string; keys: Set<string>; error: boolean }>();
  const [now, setNow] = useState(Date.now);
  const { start, end } = reviewPeriodRange(period === 'all' ? 'today' : period, now);
  const hasHistory = active.words.some(word => word.ankiGuid && word.ankiReviews);
  const lastImport = active.words.reduce((latest, word) => Math.max(latest, word.ankiUpdatedAt ?? 0), 0);
  const scope = [study.language, period, start, end, lastImport, active.words.length].join(':');
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    let live = true;
    if (period === 'all' || !hasHistory) return;
    readReviewedKeys(study.language, start, end).then(keys => { if (live) setState({ scope, keys, error: false }); },
      () => { if (live) setState({ scope, keys: new Set(), error: true }); });
    return () => { live = false; };
  }, [scope, hasHistory, period, study.language, start, end]);
  const loaded = state?.scope === scope;
  const words = useMemo(() => period === 'all' ? active.words : !loaded ? [] : active.words.filter(word =>
    word.ankiGuid && state.keys.has(reviewKey(word.language, word.ankiGuid))), [active.words, period, loaded, state]);
  return { words, loading: period !== 'all' && hasHistory && !loaded, error: period !== 'all' && loaded && state.error, hasHistory };
}
