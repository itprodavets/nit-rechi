import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { assess, dateLabel, kinds, practiceQueue, selectLanguage, topicMaterials } from '../domain/model';
import type { Outcome, PracticeItem, Study } from '../domain/model';
import { deleteTake, getTake, isRecording, stopVoice, toggleRecording } from '../domain/voice.js';
import { Empty, Fold, Heading, SourceLink, SourceText, VoiceButtons } from './common';
import { AnkiHistory } from './AnkiHistory';

const resultLabels: Record<Outcome, string> = { retry: 'Нужно повторить', assisted: 'С подсказкой', independent: 'Самостоятельно' };

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

function Recording({ itemId }: { itemId: string }) {
  const { notify } = useWorkspace();
  const [revision, refresh] = useState(0);
  const [url, setUrl] = useState<string>();
  const [recording, setRecording] = useState(false);
  useEffect(() => () => stopVoice(), []);
  useEffect(() => {
    let active = true;
    let source: string | undefined;
    getTake(itemId).then(blob => {
      if (!active) return;
      source = blob ? URL.createObjectURL(blob) : undefined;
      setUrl(source);
    }, () => { if (active) setUrl(undefined); });
    return () => { active = false; if (source) URL.revokeObjectURL(source); };
  }, [itemId, revision]);
  const record = () => toggleRecording(itemId, (message: string) => {
    notify(message);
    setRecording(isRecording());
    refresh(value => value + 1);
  });
  async function clear() {
    try { await deleteTake(itemId); refresh(value => value + 1); notify('Запись удалена.'); }
    catch { notify('Не удалось удалить запись.'); }
  }
  return <div className="recording">
    <button type="button" id="record" aria-pressed={recording} onClick={record}>{recording ? 'Остановить запись' : 'Записать ответ'}</button>
    {url && <div className="take"><audio controls preload="metadata" aria-label="Твоя запись" src={url} /><button type="button" className="subtle" onClick={clear}>Удалить запись</button></div>}
  </div>;
}

function PracticeCard({ item, next, score }: { item: PracticeItem; next: () => void; score: (result: Outcome) => void }) {
  const [revealed, setRevealed] = useState(false);
  const word = 'meaning' in item ? item : undefined;
  const topic = 'links' in item ? item : undefined;
  const resource = 'kind' in item ? item : undefined;
  const materials = topic ? topicMaterials(topic) : [];
  const reference = word ? word.example || word.title : resource ? (resource.kind === 'exercise' ? resource.answer : resource.text) : materials.at(-1)?.text;
  const prompt = word
    ? word.meaning ? `Вспомни, как сказать «${word.meaning}». Используй слово в своём предложении.` : 'Прослушай слово и попробуй употребить его.'
    : (resource?.prompt || topic?.prompt) || (resource ? kinds[resource.kind].prompt : 'Расскажи о ситуации своими словами.');
  return <div className="session">
    <section className="task">
      <div className="task-top"><p className="kicker">Ответь вслух</p><button type="button" className="subtle" onClick={next}>Дальше →</button></div>
      {!word && <h2>{item.title}</h2>}
      <p className="prompt source-text">{prompt}</p>
      {resource?.kind === 'exercise' && resource.text && <p className="source-text" lang={item.language}>{resource.text}</p>}
      {word && !word.meaning && <VoiceButtons text={word.title} language={item.language} />}
      <Recording itemId={item.id} />
      {revealed ? <div className="reference">
        <p className="kicker">{resource?.kind === 'exercise' ? 'Ответ для сравнения' : resource ? 'Исходный материал' : 'Пример для сравнения'}</p>
        {word && <h2 lang={item.language}>{word.title}</h2>}
        {reference && <SourceText text={reference} language={item.language} />}
        {resource?.url && <SourceLink url={resource.url} />}
        {!reference && !resource?.url && <p>Можно добавить пример ответа в карточке материала.</p>}
        {materials.slice(0, -1).map(material => <Fold key={material.text} title={material.format}><SourceText text={material.text} language={item.language} /></Fold>)}
      </div> : <button type="button" className="subtle reveal" onClick={() => setRevealed(true)}>
        {resource?.kind === 'exercise' ? 'Показать ответ' : resource ? 'Показать материал' : 'Показать пример'}
      </button>}
      {word && <AnkiHistory word={word} />}
    </section>
    <section className="assessment" aria-label="Самооценка ответа">
      <p className="kicker">Как получилось?</p>
      <div className="actions">{(Object.keys(resultLabels) as Outcome[]).map(result =>
        <button type="button" key={result} className={result === 'independent' ? 'primary' : ''} onClick={() => score(result)}>{resultLabels[result]}</button>)}</div>
    </section>
  </div>;
}

export function Practice() {
  const { study, practiceId, practice, update, notify } = useWorkspace();
  const queue = useMemo(() => practiceQueue(study), [study]);
  const [attempt, reset] = useState(0);
  const item = queue.find(entry => entry.id === practiceId) ?? queue[0];
  const due = queue.filter(entry => (study.results[entry.id]?.due ?? 0) <= Date.now()).length;
  function score(result: Outcome) {
    if (!item) return;
    const now = Date.now();
    const next = assess(study, item.id, result, now);
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
  return <><Heading title="Устная практика" detail={due ? `К повторению · ${due} из ${queue.length}` : item ? 'Можно потренироваться заранее' : undefined} />
    {item ? <PracticeCard key={item.id + ':' + attempt} item={item} next={advance} score={score} /> :
      <Empty sample={() => update(addExample)}>Начни со своего текста, упражнения или слов из Anki.</Empty>}</>;
}

export function Progress() {
  const { study, active, practice } = useWorkspace();
  const queue = useMemo(() => practiceQueue(study), [study]);
  const practiced = queue.filter(item => study.results[item.id]);
  const independent = practiced.filter(item => study.results[item.id].result === 'independent').length;
  const due = queue.filter(item => (study.results[item.id]?.due ?? 0) <= Date.now()).length;
  const imported = active.words.filter(word => word.ankiReviews);
  return <><Heading title="Прогресс" />
    <div className="metrics">
      <div><strong>{practiced.length}</strong><span>Попробовано вслух</span></div>
      <div><strong>{independent}</strong><span>Самостоятельно</span></div>
      <div><strong>{due}</strong><span>К повторению</span></div>
    </div>
    {imported.length > 0 && <Fold title={`История Anki · слов с ответами ${imported.length}`}>
      <p className="sub">Ответы в Anki учитываются отдельно от устной практики.</p>
      <div className="history">{imported.slice(0, 30).map(word => <div key={word.id}><button type="button" onClick={() => practice(word.id)}>{word.title}</button><span>{word.ankiReviews} ответов</span></div>)}</div>
      {imported.length > 30 && <p className="sub">Первые 30 слов. Остальные доступны в колоде и на карте.</p>}
    </Fold>}
    {practiced.length ? <div className="history">{practiced.map(item => {
      const result = study.results[item.id];
      return <div key={item.id}><button type="button" onClick={() => practice(item.id)}>{item.title}</button><span>{resultLabels[result.result]}</span><span>{result.due <= Date.now() ? 'Можно повторить сейчас' : 'Повторить ' + dateLabel(result.due)}</span></div>;
    })}</div> : <p className="sub">Отметь результат после первого устного ответа.</p>}
  </>;
}
