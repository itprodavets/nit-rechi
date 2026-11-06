export type MaterialKind = 'reading' | 'exercise' | 'dialogue' | 'media';
export type Outcome = 'independent' | 'assisted' | 'retry';
export type PracticeMode = 'spoken' | 'choice' | 'written';
export type PracticeCounts = Record<Outcome, number>;
export type MapPoint = { x: number; y: number };
export type VocabularyLevel = 'learning' | 'passive' | 'active';

export interface Word {
  id: string;
  language: string;
  title: string;
  meaning: string;
  example: string;
  chatExamples?: string[];
  ownExamples?: string[];
  ankiGuid?: string;
  ankiReviews?: number;
  ankiUpdatedAt?: number;
  vocabularyLevel?: VocabularyLevel;
}

export interface Topic {
  id: string;
  language: string;
  title: string;
  links: string[];
  position?: MapPoint;
  connections?: string[];
  prompt: string;
  material?: string;
  materials?: { format: string; text: string }[];
}

export interface Resource {
  id: string;
  language: string;
  title: string;
  kind: MaterialKind;
  text: string;
  prompt: string;
  answer: string;
  translation?: string;
  url: string;
  topicId?: string;
}

export interface PracticeResult {
  level: number;
  result: Outcome;
  due: number;
  attempts: number;
  updated: number;
  mode?: PracticeMode;
  spokenResult?: Outcome;
}

export interface Study {
  language: string;
  languages: Record<string, object>;
  words: Word[];
  topics: Topic[];
  resources: Resource[];
  results: Record<string, PracticeResult>;
  practiceDays?: Record<string, Record<string, Partial<Record<PracticeMode, PracticeCounts>>>>;
}

export type PracticeItem = Word | Topic | Resource;
export type Page = 'practice' | 'map' | 'materials' | 'progress' | 'account';
export const pages: Record<Page, string> = {
  practice: 'Практика', map: 'Карта', materials: 'Материалы', progress: 'Прогресс', account: 'Кабинет'
};

export const kinds: Record<MaterialKind, { label: string; action: string; prompt: string }> = {
  reading: { label: 'Текст', action: 'Пересказать', prompt: 'Перескажи основные мысли своими словами.' },
  exercise: { label: 'Упражнение', action: 'Выполнить', prompt: 'Выполни задание и проговори ответ.' },
  dialogue: { label: 'Диалог', action: 'Разыграть', prompt: 'Разыграй диалог своими словами за обоих собеседников.' },
  media: { label: 'Аудио или видео', action: 'Обсудить', prompt: 'Расскажи, что ты понял, и прокомментируй одну мысль.' }
};

const storageKey = 'nit-rechi-v1';
const day = 86_400_000;
const names = new Intl.DisplayNames(['ru'], { type: 'language' });
const dates = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

export const languageName = (code: string) => names.of(code) ?? code;
export const dateLabel = (date: number) => dates.format(date);
export const normalize = (value: string, language: string) => value.normalize('NFC').trim().toLocaleLowerCase(language);
export const wordId = (language: string, title: string, meaning: string) =>
  JSON.stringify([language, 'word', normalize(title, language), normalize(meaning, language)]);
export const topicMaterials = (topic: Topic) => topic.materials ?? (topic.material ? [{ format: 'Материал', text: topic.material }] : []);

export function readStudy(): Study {
  const saved = localStorage.getItem(storageKey);
  if (saved) return { resources: [], ...JSON.parse(saved) };
  return { language: 'en', languages: { en: {} }, words: [], topics: [], resources: [], results: {} };
}

export function writeStudy(study: Study) {
  localStorage.setItem(storageKey, JSON.stringify(study));
}

export function selectLanguage(study: Study, language: string): Study {
  return { ...study, language, languages: { ...study.languages, [language]: study.languages[language] ?? {} } };
}

export function itemsForLanguage(study: Study) {
  const active = (entry: PracticeItem) => entry.language === study.language;
  return { words: study.words.filter(active), topics: study.topics.filter(active), resources: study.resources.filter(active) };
}

export function practiceQueue(study: Study): PracticeItem[] {
  const { words, topics, resources } = itemsForLanguage(study);
  return [...words, ...topics, ...resources].sort((a, b) => (study.results[a.id]?.due ?? 0) - (study.results[b.id]?.due ?? 0));
}

export const modeLabels: Record<PracticeMode, string> = {
  spoken: 'Устно', choice: 'Выбрать ответ', written: 'Написать ответ'
};

export const resultLabels: Record<Outcome, string> = {
  retry: 'Нужно повторить', assisted: 'С подсказкой', independent: 'Самостоятельно'
};

export function localDay(timestamp: number) {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
}

export function assess(study: Study, id: string, result: Outcome, now: number, mode: PracticeMode): Study {
  const previous = study.results[id];
  const level = result === 'independent' ? (previous?.level ?? 0) + 1 : 0;
  const days = [1, 3, 7, 14, 30][Math.min(Math.max(level - 1, 0), 4)];
  const spokenResult = mode === 'spoken' ? result : previous?.spokenResult ?? (previous?.mode ? undefined : previous?.result);
  const next = { level, result, due: now + (result === 'retry' ? 0 : days * day), attempts: (previous?.attempts ?? 0) + 1, updated: now, mode, spokenResult };
  const language = study.language;
  const date = localDay(now);
  const recentDays = Object.fromEntries(Object.entries(study.practiceDays?.[language] ?? {})
    .filter(([date]) => date >= localDay(now - 90 * day)));
  const attempts = recentDays[date]?.[mode] ?? { independent: 0, assisted: 0, retry: 0 };
  recentDays[date] = { ...recentDays[date], [mode]: { ...attempts, [result]: attempts[result] + 1 } };
  return { ...study, results: { ...study.results, [id]: next }, practiceDays: { ...study.practiceDays, [language]: recentDays } };
}

export function upsert<T extends { id: string }>(items: T[], entry: T) {
  return items.some(item => item.id === entry.id) ? items.map(item => item.id === entry.id ? entry : item) : [...items, entry];
}
