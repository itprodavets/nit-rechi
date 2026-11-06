import type { ReviewSummary } from './anki-history';
import type { PracticeResult, Study, VocabularyLevel, Word } from './model';

export const vocabularyLabels: Record<VocabularyLevel, string> = {
  learning: 'Учу', passive: 'Пассивный', active: 'Активный'
};

export function wordExamples(word: Word) {
  const examples = new Map<string, { text: string; source: string }>();
  const groups = [
    [word.ankiGuid ? 'Из Anki' : 'Исходный пример', [word.example]],
    ['Из чата', word.chatExamples ?? []],
    ['Мой пример', word.ownExamples ?? []]
  ] as const;
  for (const [source, texts] of groups) {
    for (const text of texts) {
      const key = text.normalize('NFC').trim();
      if (key && !examples.has(key)) examples.set(key, { text, source });
    }
  }
  return [...examples.values()];
}

export function vocabularyStatus(word: Word, result?: PracticeResult, summary?: ReviewSummary) {
  if (word.vocabularyLevel) return { level: word.vocabularyLevel, source: 'Ручная отметка' };
  if (result?.result === 'independent') return { level: 'active' as const, source: 'Самостоятельный устный ответ' };
  if (result?.result === 'assisted') return { level: 'passive' as const, source: 'Устный ответ с подсказкой' };
  if (summary && summary.recalled >= 2 && summary.latestRating >= 3
      && (summary.latestInterval >= 3 || wordExamples(word).length >= 2)) {
    return { level: 'passive' as const, source: 'Оценка по ответам Anki и контексту' };
  }
  return { level: 'learning' as const, source: 'В процессе изучения' };
}

export function removeWords(study: Study, ids: Set<string>): Study {
  return {
    ...study,
    words: study.words.filter(word => !ids.has(word.id)),
    topics: study.topics.map(topic => {
      const links = topic.links.filter(id => !ids.has(id));
      return links.length === topic.links.length ? topic : { ...topic, links };
    }),
    results: Object.fromEntries(Object.entries(study.results).filter(([id]) => !ids.has(id)))
  };
}
