import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspace } from '../context';
import { applyChatPackage, buildChatPrompt, parseChatPackage, safeSourceUrl } from '../domain/chat-package.js';
import { languageCodes, LanguageLabel } from './Language';
import { suggestMaterialLanguage } from '../domain/language-detection';
import { kinds, languageName, selectLanguage, upsert } from '../domain/model';
import type { MaterialKind, Resource } from '../domain/model';
import { StarterMaterials } from './StarterMaterials';
import { copyText, Fold, Heading, SourceLink, SourceText } from './common';

function TopicSelect({ value, change, fallback, language }: { value: string; change: (id: string) => void; fallback: string; language?: string }) {
  const { study } = useWorkspace();
  const topics = study.topics.filter(topic => topic.language === (language ?? study.language));
  return <select value={value} onChange={event => change(event.target.value)}>
    <option value="">{fallback}</option>
    {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
  </select>;
}

function MaterialForm({ resource, done }: { resource?: Resource; done: (id: string) => void }) {
  const { study, notify, update } = useWorkspace();
  const [title, setTitle] = useState(resource?.title ?? '');
  const [text, setText] = useState(resource?.text ?? '');
  const [kind, setKind] = useState<MaterialKind>(resource?.kind ?? 'reading');
  const [answer, setAnswer] = useState(resource?.answer ?? '');
  const [topic, setTopic] = useState(resource?.topicId ?? '');
  const [override, setOverride] = useState('');
  const detected = useMemo(() => resource ? undefined : suggestMaterialLanguage(kind === 'exercise' ? answer : text),
    [resource, kind, answer, text]);
  const language = resource?.language ?? (override || detected || study.language);
  const selectedTopic = study.topics.find(entry => entry.id === topic && entry.language === language)?.id;
  const options = [...new Set([study.language, language, ...Object.keys(study.languages), ...languageCodes])];

  async function importFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    if (!/\.(?:txt|md)$/i.test(file.name) || file.size > 1_000_000) { notify('Выбери файл .txt или .md до 1 МБ.'); return; }
    try {
      const contents = (await file.text()).trim();
      if (!input.isConnected || input.files?.[0] !== file) return;
      if (!contents || contents.length > 250000) throw new Error();
      setText(contents);
      setTitle(current => current || file.name.replace(/\.[^.]+$/, '').slice(0, 120));
      notify('Текст добавлен в форму. Сохрани материал.');
    } catch { notify('Не удалось прочитать текст. Можно вставить его вручную.'); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawUrl = String(form.get('url')).trim();
    const url = safeSourceUrl(rawUrl);
    const prompt = String(form.get('prompt')).trim();
    if (!title.trim()) { notify('Укажи название материала.'); return; }
    if (rawUrl && !url) { notify('Нужна ссылка с https:// или http://.'); return; }
    if (!text.trim() && !url && !(kind === 'exercise' && prompt)) { notify('Добавь текст, ссылку или условие упражнения.'); return; }
    const entry: Resource = {
      ...resource,
      id: resource?.id ?? crypto.randomUUID(), title: title.trim(), language, kind, text: text.trim(), prompt, url,
      topicId: selectedTopic,
      translation: String(form.get('translation')).trim() || undefined,
      answer: kind === 'exercise' ? answer.trim() : ''
    };
    if (update(current => ({ ...selectLanguage(current, language), resources: upsert(current.resources, entry) }))) {
      notify('Материал сохранён.');
      done(entry.id);
    }
  }

  return <form onSubmit={submit}>
    <label>Название <input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Например, «Как прошла встреча»" /></label>
    <div className="form-pair">
      <label>Тип материала <select value={kind} onChange={event => setKind(event.target.value as MaterialKind)}>
        {Object.entries(kinds).map(([value, entry]) => <option key={value} value={value}>{entry.label}</option>)}
      </select></label>
      <label>Тема на карте <TopicSelect value={selectedTopic ?? ''} change={setTopic} fallback="Без темы" language={language} /></label>
    </div>
    <label>Импортировать текст <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event => void importFile(event.currentTarget)} /></label>
    <label>Текст, диалог или условия задания <textarea rows={5} maxLength={250000} value={text} onChange={event => setText(event.target.value)} /></label>
    <div className="import-language"><LanguageLabel code={language} /><small>{detected && !override ? 'Определён по тексту' : override || resource ? 'Язык материала' : 'Текущий язык'}</small></div>
    {!resource && <details className="fold language-override"><summary>Уточнить язык материала</summary>
      <label>Язык текста <select value={override} onChange={event => setOverride(event.target.value)}>
        <option value="">Автоматически</option>
        {options.map(code => <option key={code} value={code}>{languageName(code)}</option>)}
      </select></label>
    </details>}
    <label>Перевод на русский <textarea name="translation" rows={3} defaultValue={resource?.translation} maxLength={250000} /></label>
    <label>Ссылка на источник <input name="url" type="url" defaultValue={resource?.url} maxLength={2000} placeholder="https://…" /></label>
    <label>Что сделать или сказать <textarea name="prompt" rows={2} defaultValue={resource?.prompt} maxLength={4000} /></label>
    {kind === 'exercise' && <label>Ответ для сравнения <textarea name="answer" rows={3} value={answer} onChange={event => setAnswer(event.target.value)} maxLength={12000} /></label>}
    <button type="submit" className="primary">Сохранить материал</button>
  </form>;
}

function ChatExchange({ source, setSource }: { source?: Resource; setSource: (resource?: Resource) => void }) {
  const { study, active, notify, update, openTopic } = useWorkspace();
  const [target, setTarget] = useState<string>();
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = target ?? source?.topicId ?? '';
  function prepare() {
    const topic = active.topics.find(entry => entry.id === selected);
    const content = source && { title: source.title, ...(source.text ? { text: source.text } : {}), ...(source.url ? { url: source.url } : {}) };
    const text = buildChatPrompt(study.language, topic?.title, content);
    setCommand(text);
    void copyText(text, notify);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('file') as File;
    const pasted = String(data.get('json')).trim();
    if (!file.size && !pasted) { notify('Выбери файл из чата или вставь JSON.'); return; }
    if (file.size && pasted) { notify('Используй файл или вставь JSON в поле.'); return; }
    if (file.size > 1_000_000) { notify('Файл должен быть меньше 1 МБ.'); return; }
    setBusy(true);
    try {
      const packet = parseChatPackage(file.size ? await file.text() : pasted);
      let result: ReturnType<typeof applyChatPackage> | undefined;
      const saved = update(current => {
        if (current.language !== study.language) throw new Error('Активный язык изменился. Открой форму ещё раз.');
        if (selected && !current.topics.some(topic => topic.id === selected && topic.language === packet.language)) {
          throw new Error('Язык выбранной темы отличается от языка пакета. Выбери «Тема из файла».');
        }
        result = applyChatPackage(selectLanguage(current, packet.language), packet, selected);
        return result.next;
      });
      if (saved && result) {
        notify(`«${result.topic.title}» · новых слов ${result.wordsAdded} · новых материалов ${result.materialsAdded}`);
        openTopic(result.topic.id);
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось импортировать пакет.'); }
    finally { setBusy(false); }
  }
  return <Fold title="Из чата с ИИ" open={source ? true : undefined}>
    <form onSubmit={submit}>
      <p className="sub">Обсуди материал в своём чате. Попроси выгрузить итоги в JSON и загрузи файл сюда.</p>
      {source && <div className="actions"><span>{source.title}</span><button type="button" onClick={() => { setSource(undefined); setCommand(''); }}>Убрать материал</button></div>}
      <label>Куда добавить <TopicSelect value={selected} change={setTarget} fallback="Тема из файла" /></label>
      <button type="button" onClick={prepare}>Копировать команду для чата</button>
      {command && <label>Команда для чата <textarea readOnly value={command} rows={6} /></label>}
      <label>Файл из чата <input type="file" name="file" accept=".json,application/json" /></label>
      <label>Или вставь JSON <textarea name="json" rows={4} maxLength={1000000} /></label>
      <button type="submit" className="primary" disabled={busy}>Добавить в тему</button>
    </form>
  </Fold>;
}

export function Materials() {
  const { active, resourceId, practice } = useWorkspace();
  const [editing, setEditing] = useState<Resource>();
  const [source, setSource] = useState<Resource>();
  const [opened, setOpened] = useState(resourceId);
  const [revision, reset] = useState(0);
  const editor = useRef<HTMLDetailsElement>(null);
  return <><Heading title="Материалы" detail="Тексты, упражнения и записи для разговорной практики." />
    <div className="library">
      <StarterMaterials />
      <ChatExchange key={source?.id ?? 'all'} source={source} setSource={setSource} />
      <details ref={editor} className="fold">
        <summary>{editing ? 'Редактировать материал' : 'Добавить материал'}</summary>
        <MaterialForm key={revision} resource={editing} done={id => {
          setOpened(id); setEditing(undefined); reset(value => value + 1);
          if (editor.current) editor.current.open = false;
        }} />
      </details>
      <div className="library-list">{active.resources.map(resource => {
        const kind = kinds[resource.kind];
        const topic = active.topics.find(entry => entry.id === resource.topicId);
        return <article key={resource.id} className="resource">
          <p className="kicker"><LanguageLabel code={resource.language} /> · {kind.label}{topic && ' · ' + topic.title}</p>
          <h2>{resource.title}</h2>
          <SourceLink url={resource.url} />
          {resource.text && <Fold title={resource.kind === 'exercise' ? 'Читать условие' : 'Открыть текст'} open={resource.id === opened || undefined}>
            <SourceText text={resource.text} language={resource.language} />
            {resource.translation && <Fold title="Перевод на русский"><p className="source-text" lang="ru">{resource.translation}</p></Fold>}
          </Fold>}
          <div className="actions">
            <button className="primary" type="button" onClick={() => practice(resource.id)}>{kind.action}</button>
            <button type="button" onClick={() => {
              setEditing(resource); reset(value => value + 1);
              if (editor.current) { editor.current.open = true; editor.current.scrollIntoView({ block: 'nearest' }); }
            }}>Изменить</button>
            <button type="button" onClick={() => setSource(resource)}>Взять в чат</button>
          </div>
        </article>;
      })}</div>
    </div>
  </>;
}
