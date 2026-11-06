import { useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { assess, dateLabel, kinds, modeLabels, normalize, practiceQueue, resultLabels, selectLanguage, topicMaterials } from '../domain/model';
import type { Outcome, PracticeItem, PracticeMode, Study, Word } from '../domain/model';
import { Recording } from './Recording';
import { DailyPractice } from './DailyPractice';
import { Empty, Fold, Heading, SourceLink, SourceText, VoiceButtons } from './common';
import { AnkiHistory } from './AnkiHistory';
import { WordExamples, WordExamplesList } from './WordExamples';

import { GlossaryText } from './Glossary';
import { englishLessons, levels } from '../domain/starter-materials';

function addExample(study: Study): Study {
  const examples = [
    { id: 'sample-oversleep', title: 'oversleep', meaning: 'проспать', example: 'I overslept and got to the office a little late.' },
    { id: 'sample-reschedule', title: 'reschedule', meaning: 'перенести на другое время', example: 'Could we reschedule our call for after lunch?' },
    { id: 'sample-errands', title: 'run errands', meaning: 'сходить по делам', example: 'I need to run a few errands during lunch.' }
  ].filter(word => !study.words.some(existing => existing.id === word.id)).map(word => ({ ...word, language: 'en' }));
  const topic = { id: 'sample-office', language: 'en', title: 'Я в офисе', links: ['sample-oversleep', 'sample-reschedule'], prompt: 'Объясни, почему опаздываешь, и попроси перенести звонок.', material: 'I overslept, so I’m running late. Could we reschedule our call for after lunch?' };
  return {
    ...selectLanguage(study, 'en'),
    words: [...study.words, ...examples],
    topics: study.topics.some(entry => entry.id === topic.id) ? study.topics : [...study.topics, topic]
  };
}

function comparable(answer: string, language: string) {
  return normalize(answer.replace(/[’‘]/gu, "'"), language).replace(/^[¡¿]+|[.!?。！？]+$/gu, '').replace(/\s+/gu, ' ');
}

function answerChoices(word: Word, words: Word[]) {
  const key = (value: string) => comparable(value, word.language);
  const seen = new Set([key(word.title)]);
  const choices = [word.title];
  const offset = Array.from(word.id).reduce((total, char) => (Math.imul(total, 31) + char.codePointAt(0)!) >>> 0, 0);
  for (let index = 0; index < words.length && choices.length < 4; index++) {
    const candidate = words[(offset + index) % words.length];
    const value = key(candidate.title);
    if (seen.has(value) || !candidate.meaning || key(candidate.meaning) === key(word.meaning)) continue;
    seen.add(value);
    choices.push(candidate.title);
  }
  if (choices.length < 3) return [];
  const rotate = offset % choices.length;
  return [...choices.slice(rotate), ...choices.slice(0, rotate)];
}

function PracticeCard({ item, next, mode, options, score }: {
  item: PracticeItem; next: () => void; mode: PracticeMode; options: string[]; score: (result: Outcome) => void;
}) {
  const { active } = useWorkspace();
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const word = 'meaning' in item ? item : undefined;
  const topic = 'links' in item ? item : undefined;
  const resource = 'kind' in item ? item : undefined;
  const materials = topic ? topicMaterials(topic) : [];
  const topicWords = useMemo(() => {
    const ids = new Set(topic?.links);
    return active.words.filter(word => ids.has(word.id));
  }, [active.words, topic]);
  const glossary = useMemo(() => {
    const lesson = item.language === 'en' ? levels.find(level => englishLessons[level].resource.id === item.id) : undefined;
    const hints = new Map(lesson ? englishLessons[lesson].glossary : undefined);
    for (const word of active.words) if (word.meaning) {
      const key = normalize(word.title, item.language);
      if (!hints.has(key)) hints.set(key, word.meaning);
    }
    return hints;
  }, [active.words, item.id, item.language]);
  const reference = resource ? (resource.kind === 'exercise' ? resource.answer : resource.text) : materials.at(-1)?.text;
  const expected = word?.meaning ? word.title : undefined;
  const correct = expected && checked && comparable(answer, item.language) === comparable(expected, item.language);
  const prompt = word
    ? word.meaning ? (mode === 'spoken' ? `Как сказать «${word.meaning}»? Используй слово в своём предложении.` : `Как сказать «${word.meaning}»?`)
      : mode === 'spoken' ? 'Прослушай слово и попробуй употребить его.' : 'Прослушай слово и напиши с ним своё предложение.'
    : (resource?.prompt || topic?.prompt) || (resource ? kinds[resource.kind].prompt : 'Расскажи о ситуации своими словами.');
  const openReference = revealed || checked;

  return <div className="session">
    <section className="task">
      <div className="task-top"><p className="kicker">{word ? 'Словарь' : resource ? kinds[resource.kind].label : 'Разговорная тема'}</p>
        <button type="button" className="subtle" onClick={next}>Дальше →</button></div>
      {!word && <h2>{item.title}</h2>}
      <p className="prompt source-text">{prompt}</p>
      {topicWords.length > 0 && <Fold title={`Слова для ответа · ${topicWords.length}`}>
        <ul>{topicWords.map(word => <li key={word.id}><strong lang={word.language}>{word.title}</strong>{word.meaning && ' · ' + word.meaning}
          <WordExamples word={word} glossary={glossary} />
        </li>)}</ul>
      </Fold>}
      {resource?.kind === 'exercise' && resource.text && <GlossaryText text={resource.text} language={item.language} glossary={glossary} />}
      {word && !word.meaning && <VoiceButtons text={word.title} language={item.language} />}
      {mode === 'spoken' ? <Recording itemId={item.id} /> : <form className="practice-response" onSubmit={event => {
        event.preventDefault();
        if (answer.trim()) setChecked(true);
      }}>
        {mode === 'choice' ? <fieldset disabled={checked}>
          <legend>Выбери один вариант</legend>
          <div className="answer-options">{options.map((option, index) => <label key={option}
            className={checked && option === expected ? 'answer-correct' : checked && option === answer ? 'answer-retry' : ''}>
            <input type="radio" name="answer" checked={answer === option} onChange={() => setAnswer(option)} />
            <span className="answer-index" aria-hidden="true">{index + 1}</span><span lang={item.language}>{option}</span>
          </label>)}</div>
        </fieldset> : <label>Твой ответ <textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={expected ? 2 : 4}
          lang={item.language} autoComplete="off" spellCheck={!expected} disabled={checked} placeholder="Напиши здесь…" /></label>}
        {!checked && <button type="submit" className="primary" disabled={!answer.trim()}>{expected ? 'Проверить' : 'Сравнить с примером'}</button>}
        {checked && <p className={correct ? 'answer-feedback answer-correct' : 'answer-feedback'} role="status">{expected
          ? (correct ? 'Верно!' : 'Сравни свой ответ с вариантом ниже.') : 'Сравни свой ответ с примером и оцени, как получилось.'}</p>}
      </form>}
      {openReference ? <div className="reference">
        <p className="kicker">{expected ? 'Ответ и контекст' : resource?.kind === 'exercise' ? 'Ответ для сравнения' : resource ? 'Исходный материал' : 'Пример для сравнения'}</p>
        {word ? <><h2 lang={item.language}>{word.title}</h2><WordExamplesList word={word} glossary={glossary} /></>
          : reference && <SourceText text={reference} language={item.language} glossary={glossary} />}
        {resource?.translation && <Fold title="Перевод на русский"><p className="source-text" lang="ru">{resource.translation}</p></Fold>}
        {resource?.url && <SourceLink url={resource.url} />}
        {!word && !reference && !resource?.url && <p>Можно добавить пример ответа в карточке материала.</p>}
        {materials.slice(0, -1).map(material => <Fold key={material.text} title={material.format}><SourceText text={material.text} language={item.language} glossary={glossary} /></Fold>)}
      </div> : mode === 'spoken' && <button type="button" className="subtle reveal" onClick={() => setRevealed(true)}>
        {resource?.kind === 'exercise' ? 'Показать ответ' : resource ? 'Показать материал' : 'Показать пример'}
      </button>}
      {word && <AnkiHistory word={word} />}
    </section>
    {(mode === 'spoken' || checked) && <section className="assessment" aria-label="Результат ответа">
      {mode !== 'spoken' && expected ? <button type="button" className="primary" onClick={() => score(correct ? 'independent' : 'retry')}>
        {correct ? 'Сохранить и продолжить →' : 'Сохранить и повторить'}
      </button> : <><p className="kicker">Как получилось?</p>
        <div className="actions">{(Object.keys(resultLabels) as Outcome[]).map(result =>
          <button type="button" key={result} className={result === 'independent' ? 'primary' : ''} onClick={() => score(result)}>{resultLabels[result]}</button>)}</div></>}
    </section>}
  </div>;
}

export function Practice() {
  const { study, active, practiceId, practice, update, notify } = useWorkspace();
  const queue = useMemo(() => practiceQueue(study), [study]);
  const [attempt, reset] = useState(0);
  const [preferred, chooseMode] = useState<PracticeMode>('spoken');
  const item = queue.find(entry => entry.id === practiceId) ?? queue[0];
  const due = queue.filter(entry => (study.results[entry.id]?.due ?? 0) <= Date.now()).length;
  const options = item && 'meaning' in item && item.meaning ? answerChoices(item, active.words) : [];
  const mode = preferred === 'choice' && !options.length ? 'written' : preferred;
  function score(result: Outcome) {
    if (!item) return;
    const now = Date.now();
    const next = assess(study, item.id, result, now, mode);
    if (!update(() => next)) return;
    notify(result === 'retry' ? 'Попробуй ответить ещё раз.' : 'Следующее повторение · ' + dateLabel(next.results[item.id].due));
    practice(result === 'retry' ? item.id : practiceQueue(next).find(entry => entry.id !== item.id)?.id ?? item.id);
    reset(value => value + 1);
  }
  function advance() {
    const index = queue.findIndex(entry => entry.id === item?.id);
    practice(queue[(index + 1) % queue.length].id);
    reset(value => value + 1);
  }
  return <><Heading title="Практика" detail={due ? `К повторению · ${due} из ${queue.length}` : item ? 'Можно потренироваться заранее' : undefined} />
    {item ? <DailyPractice key={study.language}>
      <div className="practice-modes" role="group" aria-label="Способ ответа">
        {(Object.keys(modeLabels) as PracticeMode[]).filter(value => value !== 'choice' || options.length > 0)
          .map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => chooseMode(value)}>{modeLabels[value]}</button>)}
      </div>
      <PracticeCard key={JSON.stringify([item.id, attempt, mode])} item={item} mode={mode} options={options} next={advance} score={score} />
    </DailyPractice> :
      <Empty sample={() => update(addExample)}>Начни со своего текста, упражнения или слов из Anki.</Empty>}</>;
}
