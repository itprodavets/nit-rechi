import { assess, mergeWords, parseAnki, readStudy, sortForPractice, writeStudy } from './store.js';
import { deleteTake, getTake, isRecording, speak, stopSpeaking, stopVoice, toggleRecording } from './voice.js';
import { applyChatPackage, buildChatPrompt, parseChatPackage, safeSourceUrl } from './chat-package.js';

const screen = document.querySelector('#screen');
const notice = document.querySelector('#notice');
const languageNames = new Intl.DisplayNames(['ru'], { type: 'language' });
const formatter = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });
const resultLabels = { independent: 'Самостоятельно', assisted: 'С подсказкой', retry: 'Нужно повторить' };
const pages = ['practice', 'map', 'materials', 'progress', 'account'];
const resourceKinds = {
  reading: { label: 'Текст', action: 'Пересказать', prompt: 'Перескажи основные мысли своими словами.' },
  exercise: { label: 'Упражнение', action: 'Выполнить', prompt: 'Выполни задание и проговори ответ.' },
  dialogue: { label: 'Диалог', action: 'Разыграть', prompt: 'Разыграй диалог своими словами. Попробуй ответить за обоих собеседников.' },
  media: { label: 'Аудио или видео', action: 'Обсудить', prompt: 'Кратко расскажи, что ты понял, и прокомментируй одну мысль.' }
};
let study;
try { study = readStudy(); }
catch {
  notice.hidden = false;
  notice.textContent = 'Не удалось прочитать локальное хранилище. Открой приложение в обычном окне браузера.';
  throw new Error('Study storage unavailable');
}
let itemId;
let topicId;
let wordId;
let selectedResourceId;
let exchangeResourceId;
let revealed = false;
let takeUrl;
let takeVersion = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const h = escapeHtml;
const page = () => pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'practice';
const words = () => study.words.filter(word => word.language === study.language);
const topics = () => study.topics.filter(topic => topic.language === study.language);
const resources = () => study.resources.filter(resource => resource.language === study.language);
const practiceItems = () => sortForPractice([...words(), ...topics(), ...resources()], study.results);
const currentItem = () => practiceItems().find(item => item.id === itemId) ?? practiceItems()[0];
const currentTopic = () => topics().find(topic => topic.id === topicId) ?? topics()[0];
const displayLanguage = () => languageNames.of(study.language);
const dateLabel = value => formatter.format(new Date(value));

function alertUser(message = '') {
  notice.textContent = message;
  notice.hidden = !message;
}

function save() {
  try { writeStudy(study); return true; }
  catch { alertUser('Не удалось сохранить изменения. Проверь доступное место и настройки браузера.'); return false; }
}

function header(label, heading, detail = '') {
  return `<header class="heading"><p class="kicker">${h(label)}</p><h1>${h(heading)}</h1>${detail ? `<p class="sub">${h(detail)}</p>` : ''}</header>`;
}

function empty(message) {
  return `<div class="empty"><p>${h(message)}</p><a class="button primary" href="#materials">Добавить материал</a><a class="button" href="#account">Импортировать Anki</a><button type="button" data-action="demo">Попробовать на примере</button></div>`;
}

function renderSourceLink(value) {
  const url = safeSourceUrl(value);
  return url ? `<a class="resource-link" href="${h(url)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>` : '';
}

function voiceButtons(text, language) {
  return `<div class="actions"><button type="button" data-speak="${h(text)}" data-lang="${h(language)}">▶ Слушать</button><button type="button" data-speak="${h(text)}" data-lang="${h(language)}" data-slow>Медленнее</button>${text.length > 190 ? '<button type="button" data-action="stop-reading">Остановить</button>' : ''}</div>`;
}

function topicMaterials(topic) {
  return topic.materials ?? (topic.material ? [{ format: 'Материал', text: topic.material }] : []);
}

function renderMaterials(materials, language) {
  return materials.map(material => `<details class="fold material">
    <summary>${h(material.format)}</summary>
    <p class="source-text" lang="${h(language)}">${h(material.text)}</p>
    ${voiceButtons(material.text, language)}
  </details>`).join('');
}

function renderPractice() {
  const queue = practiceItems();
  const item = currentItem();
  const due = queue.filter(entry => (study.results[entry.id]?.due ?? 0) <= Date.now()).length;
  const main = header(displayLanguage(), 'Устная практика', due ? `К повторению · ${due} из ${queue.length}` : queue.length ? 'Можно потренироваться заранее' : '');
  if (!item) return main + empty('Начни со своего текста, упражнения или слов из Anki.');
  itemId = item.id;
  const isTopic = Boolean(item.links);
  const kind = resourceKinds[item.kind];
  const isWord = !isTopic && !kind;
  const materials = isTopic ? topicMaterials(item) : [];
  const reference = isWord ? item.example || item.title
    : isTopic ? materials.at(-1)?.text
    : item.kind === 'exercise' ? item.answer : item.text;
  const prompt = isWord ? (item.meaning ? `Вспомни, как сказать «${item.meaning}». Используй слово в своём предложении.` : 'Прослушай слово и попробуй употребить его в своём предложении.')
    : item.prompt || kind?.prompt || 'Расскажи о ситуации своими словами.';
  const referenceLabel = item.kind === 'exercise' ? 'Ответ для сравнения' : kind ? 'Исходный материал' : isTopic ? 'Материал темы' : 'Пример для сравнения';
  const language = h(item.language);
  return main + `
    <div class="session">
      <section class="task">
        <div class="task-top"><p class="kicker">Ответь вслух</p>
          <button type="button" class="subtle" data-action="next">Дальше →</button></div>
        ${!isWord ? `<h2>${h(item.title)}</h2>` : ''}
        <p class="prompt source-text">${h(prompt)}</p>
        ${item.kind === 'exercise' && item.text ? `<p class="source-text" lang="${language}">${h(item.text)}</p>` : ''}
        ${isWord && !item.meaning ? voiceButtons(item.title, item.language) : ''}
        <div class="recording">
          <button type="button" id="record" data-action="record">Записать ответ</button>
          <div id="take" class="take" hidden><audio controls preload="metadata" aria-label="Твоя запись"></audio><button type="button" class="subtle" data-action="delete-take">Удалить запись</button></div>
        </div>
        ${revealed ? `<div class="reference"><p class="kicker">${referenceLabel}</p>
          ${isWord ? `<h2 lang="${language}">${h(item.title)}</h2>` : ''}
          ${reference ? `<p class="source-text" lang="${language}">${h(reference)}</p>${voiceButtons(reference, item.language)}` : ''}
          ${renderSourceLink(item.url)}
          ${!reference && !item.url ? '<p>Можно добавить пример ответа в карточке материала.</p>' : ''}
          ${materials.length > 1 ? renderMaterials(materials.slice(0, -1), item.language) : ''}
        </div>` : `<button type="button" class="subtle reveal" data-action="reveal">${kind ? `Показать ${item.kind === 'exercise' ? 'ответ' : 'материал'}` : 'Показать пример'}</button>`}
      </section>
      <section class="assessment" aria-label="Самооценка ответа">
        <p class="kicker">Как получилось?</p>
        <div class="actions">
          <button type="button" data-result="retry">Нужно повторить</button>
          <button type="button" data-result="assisted">С подсказкой</button>
          <button type="button" class="primary" data-result="independent">Самостоятельно</button>
        </div>
      </section>
    </div>`;
}

function renderMap() {
  const vocabulary = words();
  const list = topics();
  const topic = currentTopic();
  const linked = topic ? vocabulary.filter(word => topic.links.includes(word.id)) : [];
  const nodes = linked.slice(0, 6);
  const layout = [[22, 24], [77, 24], [18, 51], [82, 51], [23, 78], [76, 78]];
  const selected = linked.find(word => word.id === wordId);
  const main = header(displayLanguage(), 'Карта разговорных тем');
  const topicResources = topic ? resources().filter(resource => resource.topicId === topic.id) : [];
  return main + `
    <div class="map-layout">
      <section class="map-workspace" aria-label="Тема и связанные слова">
        ${list.length ? `<label class="compact-field">Тема
          <select id="topic-select">${list.map(entry => `<option value="${h(entry.id)}" ${entry.id === topic.id ? 'selected' : ''}>${h(entry.title)}</option>`).join('')}</select>
        </label>` : ''}
        ${topic ? `<div class="network">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${nodes.map((entry, index) => {
              const [x, y] = layout[index];
              return `<path class="${entry.id === selected?.id ? 'active' : ''}" d="M50 50 C${x} 50 50 ${y} ${x} ${y}"/>`;
            }).join('')}
          </svg>
          <div class="core">${h(topic.title)}</div>
          ${nodes.map((entry, index) => `<button class="word-node" type="button" data-word="${h(entry.id)}" aria-pressed="${selected?.id === entry.id}" style="--x:${layout[index][0]}%;--y:${layout[index][1]}%" lang="${h(entry.language)}">${h(entry.title)}</button>`).join('')}
        </div>
        ${linked.length > nodes.length ? `<details class="fold"><summary>Все слова темы · ${linked.length}</summary><div class="actions">${linked.map(entry => `<button type="button" data-word="${h(entry.id)}">${h(entry.title)}</button>`).join('')}</div></details>` : ''}
        ${selected ? `<div class="word-detail"><strong lang="${h(selected.language)}">${h(selected.title)}</strong>
          ${selected.meaning ? `<p>${h(selected.meaning)}</p>` : ''}${selected.example ? `<p lang="${h(selected.language)}">${h(selected.example)}</p>` : ''}
          ${voiceButtons(selected.example || selected.title, selected.language)}
          ${selected.chatExamples?.length ? `<details class="fold"><summary>Примеры из чата</summary>
            ${selected.chatExamples.map(example => `<p class="source-text" lang="${h(selected.language)}">${h(example)}</p>`).join('')}
          </details>` : ''}
        </div>` : ''}
        <div class="actions"><button class="primary" type="button" data-practice="${h(topic.id)}">Практиковать тему</button><button type="button" data-action="edit-topic">Изменить тему</button></div>
        ${topicMaterials(topic).length ? `<details class="fold"><summary>Примеры к теме · ${topicMaterials(topic).length}</summary>${renderMaterials(topicMaterials(topic), topic.language)}</details>` : ''}
        ${topicResources.length ? `<details class="fold"><summary>Из библиотеки · ${topicResources.length}</summary><div class="actions">${topicResources.map(resource =>
          `<button type="button" data-read-resource="${h(resource.id)}">${h(resource.title)}</button>`
        ).join('')}</div></details>` : ''}`
        : '<p class="sub">Создай тему для ситуации, о которой хочешь уметь говорить. К теме можно привязать слова из Anki и материалы из библиотеки.</p>'}
      </section>
      <details class="fold editor" id="topic-editor" ${topic ? '' : 'open'}>
        <summary>Новая тема</summary>
        <form data-form="topic">
          <input type="hidden" name="id">
          <label>Ситуация <input name="title" required maxlength="90" placeholder="Я в офисе"></label>
          <label>Что сказать вслух <textarea name="prompt" rows="2" placeholder="Попроси перенести встречу и предложи время"></textarea></label>
          ${vocabulary.length ? `<fieldset><legend>Слова и контекст из Anki</legend>
            <label>Поиск по колоде <input type="search" id="word-filter" placeholder="Слово или фраза"></label>
            <div class="choices">${vocabulary.map(entry => `<label class="choice"><input type="checkbox" name="links" value="${h(entry.id)}"><span><strong lang="${h(entry.language)}">${h(entry.title)}</strong>${entry.example ? `<small lang="${h(entry.language)}">${h(entry.example)}</small>` : ''}</span></label>`).join('')}</div>
          </fieldset>` : ''}
          <div class="actions"><select name="format" aria-label="Вид материала"><option>диалог</option><option>предложения</option><option>рассказ</option></select><button type="button" data-action="make-prompt">Подготовить запрос для ИИ</button></div>
          <label id="prompt-output" hidden>Запрос для чата <textarea readonly rows="5"></textarea></label>
        <label>Добавить материал <textarea name="material" rows="4" placeholder="Вставь текст из чата или напиши свой"></textarea></label>
          <button type="submit" class="primary">Сохранить тему</button>
        </form>
      </details>
    </div>`;
}

function renderLibrary() {
  const entries = resources();
  const linkedTopics = topics();
  return header(displayLanguage(), 'Материалы', 'Тексты, упражнения и записи для разговорной практики.') + `
    <div class="library">
      <details class="fold" id="chat-exchange">
        <summary>Из чата с ИИ</summary>
        <form data-form="chat-package">
          <p class="sub">Обсуди материал в своём чате. Попроси выгрузить итоги в JSON и загрузи файл сюда.</p>
          <label>Куда добавить <select name="topic">
            <option value="">Тема из файла</option>
            ${linkedTopics.map(topic => `<option value="${h(topic.id)}">${h(topic.title)}</option>`).join('')}
          </select></label>
          <div class="actions"><button type="button" data-action="chat-prompt">Копировать команду для чата</button></div>
          <label id="chat-command" hidden>Команда для чата <textarea readonly rows="6"></textarea></label>
          <label>Файл из чата <input type="file" name="file" accept=".json,application/json"></label>
          <label>Или вставь JSON <textarea name="json" rows="4" maxlength="1000000"></textarea></label>
          <button type="submit" class="primary">Добавить в тему</button>
        </form>
      </details>
      <details class="fold" id="resource-editor" ${entries.length ? '' : 'open'}>
        <summary>Добавить материал</summary>
        <form data-form="resource">
          <input type="hidden" name="id">
          <label>Название <input name="title" required maxlength="120" placeholder="Например, «Как прошла встреча»"></label>
          <div class="form-pair">
            <label>Тип материала <select name="kind">${Object.entries(resourceKinds).map(([kind, details]) =>
              `<option value="${kind}">${details.label}</option>`).join('')}</select></label>
            <label>Тема на карте <select name="topic"><option value="">Без темы</option>${linkedTopics.map(topic =>
              `<option value="${h(topic.id)}">${h(topic.title)}</option>`).join('')}</select></label>
          </div>
          <label>Импортировать текст <input name="file" type="file" accept=".txt,.md,text/plain,text/markdown"></label>
          <label>Текст, диалог или условия задания <textarea name="text" rows="5" maxlength="250000"></textarea></label>
          <label>Ссылка на источник <input name="url" type="url" placeholder="https://…" maxlength="2000"></label>
          <label>Что сделать или сказать <textarea name="prompt" rows="2" maxlength="4000" placeholder="Например, объясни главную мысль своими словами"></textarea></label>
          <label id="resource-answer" hidden>Ответ для сравнения <textarea name="answer" rows="3" maxlength="12000"></textarea></label>
          <button type="submit" class="primary">Сохранить материал</button>
        </form>
      </details>
      <div class="library-list">${entries.map(resource => {
        const kind = resourceKinds[resource.kind];
        const topic = linkedTopics.find(entry => entry.id === resource.topicId);
        return `<article class="resource">
          <p class="kicker">${h(kind.label)}${topic ? ' · ' + h(topic.title) : ''}</p>
          <h2>${h(resource.title)}</h2>
          ${renderSourceLink(resource.url)}
          ${resource.text ? `<details class="fold" ${resource.id === selectedResourceId ? 'open' : ''}>
            <summary>${resource.kind === 'exercise' ? 'Читать условие' : 'Открыть текст'}</summary>
            <p class="source-text" lang="${h(resource.language)}">${h(resource.text)}</p>
            ${voiceButtons(resource.text, resource.language)}
          </details>` : ''}
          <div class="actions">
            <button class="primary" type="button" data-practice="${h(resource.id)}">${h(kind.action)}</button>
            <button type="button" data-edit-resource="${h(resource.id)}">Изменить</button>
            <button type="button" data-chat-resource="${h(resource.id)}">Взять в чат</button>
          </div>
        </article>`;
      }).join('')}</div>
    </div>`;
}

function renderProgress() {
  const queue = practiceItems();
  const practiced = queue.filter(item => study.results[item.id]);
  const independent = practiced.filter(item => study.results[item.id].result === 'independent').length;
  const due = queue.filter(item => (study.results[item.id]?.due ?? 0) <= Date.now()).length;
  return header(displayLanguage(), 'Прогресс') + `
    <div class="metrics">
      <div><strong>${practiced.length}</strong><span>Попробовано вслух</span></div>
      <div><strong>${independent}</strong><span>Самостоятельно</span></div>
      <div><strong>${due}</strong><span>К повторению</span></div>
    </div>
    ${practiced.length ? `<div class="history">${practiced.map(item => {
      const result = study.results[item.id];
      return `<div><button type="button" data-practice="${h(item.id)}">${h(item.title)}</button><span>${h(resultLabels[result.result])}</span><span>${result.due <= Date.now() ? 'Можно повторить сейчас' : `Повторить ${dateLabel(result.due)}`}</span></div>`;
    }).join('')}</div>` : '<p class="sub">Отметь результат после первого устного ответа.</p>'}`;
}

function renderAccount() {
  const languages = Object.keys(study.languages);
  return header('Личное пространство', 'Кабинет') + `
    <details class="fold" open>
      <summary>Изучаемый язык</summary>
      <div class="settings">
        <label>Активный язык <select id="language-select">${languages.map(language => `<option value="${h(language)}" ${language === study.language ? 'selected' : ''}>${h(languageNames.of(language))}</option>`).join('')}</select></label>
        <form class="inline-form" data-form="language">
          <label>Добавить язык <input name="code" required placeholder="zh, es, ja…" list="language-options" autocomplete="off" maxlength="35"></label>
          <datalist id="language-options"><option value="zh">Китайский</option><option value="es">Испанский</option><option value="fr">Французский</option><option value="de">Немецкий</option><option value="ja">Японский</option><option value="ko">Корейский</option><option value="ar">Арабский</option></datalist>
          <button type="submit">Добавить</button>
        </form>
      </div>
    </details>
    <details class="fold">
      <summary>Колода Anki · ${words().length}</summary>
      <form data-form="anki">
        <label>Текстовый экспорт заметок из Anki <input type="file" name="file" accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values,text/csv" required></label>
        <div class="columns">
          <label>Колонка слова <input type="number" min="1" name="word" value="1" required></label>
          <label>Колонка значения <input type="number" min="0" name="meaning" value="2" required></label>
          <label>Колонка примера <input type="number" min="0" name="example" value="3" required></label>
        </div>
        <p class="sub">Поля нумеруются с 1. Для поля, которого нет в колоде, укажи 0.</p>
        <button class="primary" type="submit">Импортировать</button>
      </form>
    </details>`;
}

async function updateTake() {
  const version = ++takeVersion;
  const item = currentItem();
  const record = screen.querySelector('#record');
  const take = screen.querySelector('#take');
  if (takeUrl) { URL.revokeObjectURL(takeUrl); takeUrl = undefined; }
  if (!item || !take || !record) return;
  const recording = isRecording();
  record.textContent = recording ? 'Остановить запись' : 'Записать ответ';
  record.setAttribute('aria-pressed', String(recording));
  const audio = take.querySelector('audio');
  audio.pause();
  audio.removeAttribute('src');
  take.hidden = true;
  try {
    const file = await getTake(item.id);
    if (!file || version !== takeVersion) return;
    takeUrl = URL.createObjectURL(file);
    audio.src = takeUrl;
    take.hidden = false;
  } catch { /* Recording controls stay available if playback storage is unavailable. */ }
}

function render() {
  const current = page();
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  screen.innerHTML = { practice: renderPractice, map: renderMap, materials: renderLibrary, progress: renderProgress, account: renderAccount }[current]();
  updateTake();
}

function startPractice(id) {
  stopVoice();
  itemId = id;
  revealed = false;
  if (page() === 'practice') render();
  else location.hash = 'practice';
}

function nextItem() {
  const queue = practiceItems();
  const index = queue.findIndex(item => item.id === currentItem()?.id);
  startPractice(queue[(index + 1) % queue.length]?.id);
}

function sample() {
  study.languages.en ??= {};
  study.language = 'en';
  mergeWords(study, [
    { id: 'sample-oversleep', language: 'en', title: 'oversleep', meaning: 'проспать', example: 'I overslept and got to the office a little late.' },
    { id: 'sample-reschedule', language: 'en', title: 'reschedule', meaning: 'перенести на другое время', example: 'Could we reschedule our call for after lunch?' },
    { id: 'sample-errands', language: 'en', title: 'run errands', meaning: 'сходить по делам', example: 'I need to run a few errands during lunch.' }
  ]);
  if (!study.topics.some(topic => topic.id === 'sample-office')) {
    study.topics.push({ id: 'sample-office', language: 'en', title: 'Я в офисе', links: ['sample-oversleep', 'sample-reschedule'], prompt: 'Ты проспал. Объясни коллегам, почему опаздываешь, и попроси перенести звонок.', material: 'I overslept, so I’m running late. Could we reschedule our call for after lunch?' });
  }
  if (save()) alertUser('Добавлен демонстрационный набор.');
  render();
}

function showTopicEditor() {
  const topic = currentTopic();
  const editor = screen.querySelector('#topic-editor');
  const form = editor.querySelector('form');
  editor.open = true;
  editor.querySelector('summary').textContent = 'Редактировать тему';
  for (const key of ['id', 'title', 'prompt']) form.elements[key].value = topic[key] ?? '';
  form.elements.material.value = '';
  form.querySelectorAll('input[name="links"]').forEach(input => { input.checked = topic.links.includes(input.value); });
  form.elements.title.focus();
}

function showResourceEditor(id) {
  const resource = resources().find(entry => entry.id === id);
  if (!resource) return;
  const editor = screen.querySelector('#resource-editor');
  const form = editor.querySelector('form');
  editor.open = true;
  editor.querySelector('summary').textContent = 'Редактировать материал';
  for (const key of ['id', 'title', 'kind', 'text', 'url', 'prompt', 'answer']) {
    form.elements[key].value = resource[key] ?? '';
  }
  form.elements.topic.value = resource.topicId ?? '';
  form.elements.file.value = '';
  form.querySelector('#resource-answer').hidden = resource.kind !== 'exercise';
  form.elements.title.focus();
}

async function fillTextFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (!/\.(?:txt|md)$/i.test(file.name) || file.size > 1_000_000) {
    alertUser('Выбери текстовый файл .txt или .md до 1 МБ.');
    input.value = '';
    return;
  }
  try {
    const text = (await file.text()).trim();
    if (!input.isConnected || input.files[0] !== file) return;
    if (!text || text.length > 250000) throw new Error();
    const form = input.form;
    form.elements.text.value = text;
    if (!form.elements.title.value) form.elements.title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
    alertUser('Текст добавлен в форму. Сохрани материал.');
  } catch {
    if (input.isConnected && input.files[0] === file) {
      input.value = '';
      alertUser('Не удалось прочитать текст. Можно вставить его вручную.');
    }
  }
}

async function preparePrompt(button) {
  const form = button.closest('form');
  const data = new FormData(form);
  const selected = words().filter(word => data.getAll('links').includes(word.id));
  const situation = data.get('title').trim();
  if (!situation) { alertUser('Введи название ситуации.'); return; }
  const output = form.querySelector('#prompt-output');
  const text = `Я изучаю язык ${displayLanguage()} (${study.language}). Ситуация — ${situation}. Напиши ${data.get('format')} на изучаемом языке. Верни только готовый текст для устной тренировки.` +
    (selected.length ? '\nИспользуй эти слова с учётом значения и исходного контекста.\n\n' +
      selected.map(word => [word.title, word.meaning, word.example].filter(Boolean).join(' · ')).join('\n') : '');
  output.hidden = false;
  output.querySelector('textarea').value = text;
  try { await navigator.clipboard.writeText(text); alertUser('Запрос скопирован. Вставь его в чат.'); }
  catch { output.querySelector('textarea').select(); alertUser('Запрос готов. Скопируй его из поля.'); }
}

async function prepareChatExchange(resource) {
  const pane = screen.querySelector('#chat-exchange');
  pane.open = true;
  const form = pane.querySelector('form');
  if (resource) {
    exchangeResourceId = resource.id;
    form.elements.topic.value = resource.topicId ?? '';
  }
  const selectedSource = resources().find(entry => entry.id === exchangeResourceId);
  const topic = topics().find(entry => entry.id === form.elements.topic.value);
  const source = selectedSource && {
    title: selectedSource.title, ...(selectedSource.text ? { text: selectedSource.text } : {}), ...(selectedSource.url ? { url: selectedSource.url } : {})
  };
  const output = form.querySelector('#chat-command');
  const textarea = output.querySelector('textarea');
  output.hidden = false;
  textarea.value = buildChatPrompt(study.language, topic?.title, source);
  try { await navigator.clipboard.writeText(textarea.value); alertUser('Команда скопирована. Вставь её в свой чат.'); }
  catch { textarea.focus(); textarea.select(); alertUser('Скопируй команду из поля.'); }
}

screen.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.speak) speak(button.dataset.speak, button.dataset.lang, button.hasAttribute('data-slow'), alertUser);
  if (button.dataset.practice) startPractice(button.dataset.practice);
  if (button.dataset.word) { wordId = button.dataset.word; render(); }
  if (button.dataset.editResource) showResourceEditor(button.dataset.editResource);
  if (button.dataset.chatResource) await prepareChatExchange(resources().find(entry => entry.id === button.dataset.chatResource));
  if (button.dataset.readResource) {
    selectedResourceId = button.dataset.readResource;
    location.hash = 'materials';
  }
  if (button.dataset.result && currentItem()) {
    const item = currentItem();
    assess(study, item.id, button.dataset.result);
    if (save()) {
      alertUser(button.dataset.result === 'retry' ? 'Попробуй ответить ещё раз.' : `Следующее повторение · ${dateLabel(study.results[item.id].due)}`);
    }
    if (button.dataset.result === 'retry') startPractice(item.id);
    else startPractice(practiceItems().find(entry => entry.id !== item.id)?.id ?? item.id);
  }
  switch (button.dataset.action) {
    case 'next': nextItem(); break;
    case 'demo': sample(); break;
    case 'reveal': revealed = true; render(); screen.querySelector('.reference button')?.focus(); break;
    case 'record':
      await toggleRecording(currentItem().id, message => { alertUser(message); updateTake(); });
      break;
    case 'delete-take':
      try { await deleteTake(currentItem().id); updateTake(); alertUser('Запись удалена.'); }
      catch { alertUser('Не удалось удалить запись.'); }
      break;
    case 'edit-topic': showTopicEditor(); break;
    case 'make-prompt': await preparePrompt(button); break;
    case 'chat-prompt': await prepareChatExchange(); break;
    case 'stop-reading': stopSpeaking(); break;
  }
});

screen.addEventListener('change', event => {
  const field = event.target;
  if (field.form?.dataset.form === 'resource') {
    if (field.name === 'kind') field.form.querySelector('#resource-answer').hidden = field.value !== 'exercise';
    if (field.name === 'file') fillTextFile(field);
  }
  if (event.target.id === 'language-select') {
    study.language = event.target.value;
    itemId = topicId = wordId = undefined;
    revealed = false;
    save();
    render();
  }
  if (event.target.id === 'topic-select') { topicId = event.target.value; wordId = undefined; render(); }
});

screen.addEventListener('input', event => {
  if (event.target.id !== 'word-filter') return;
  const query = event.target.value.trim().toLocaleLowerCase(study.language);
  screen.querySelectorAll('.choice').forEach(choice => {
    choice.hidden = !choice.textContent.toLocaleLowerCase(study.language).includes(query);
  });
});

screen.addEventListener('submit', async event => {
  const form = event.target;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === 'language') {
    try {
      const [language] = Intl.getCanonicalLocales(data.get('code').trim());
      if (!language) throw new Error();
      study.languages[language] ??= {};
      study.language = language;
      itemId = topicId = wordId = undefined;
      revealed = false;
      save();
      render();
    } catch { alertUser('Введи код языка, например es, zh или en-GB.'); }
  }
  if (form.dataset.form === 'anki') {
    const file = data.get('file');
    const language = study.language;
    if (!file?.size) { alertUser('Выбери текстовый экспорт Anki.'); return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const imported = parseAnki(await file.text(), language, ['word', 'meaning', 'example'].map(key => Number(data.get(key))));
      if (!imported.length) throw new Error('В файле не нашлось строк со словами.');
      const added = mergeWords(study, imported);
      if (save()) alertUser(`Строк прочитано · ${imported.length}. Новых записей · ${added}.`);
      render();
      const pane = screen.querySelector('form[data-form="anki"]')?.closest('details');
      if (pane) pane.open = true;
    } catch (error) { alertUser(error.message || 'Не удалось импортировать файл.'); }
    finally { submit.disabled = false; }
  }
  if (form.dataset.form === 'topic') {
    const title = data.get('title').trim();
    const links = data.getAll('links');
    if (!title) { alertUser('Введи название темы.'); return; }
    const id = data.get('id') || crypto.randomUUID();
    const index = study.topics.findIndex(topic => topic.id === id);
    const materials = index === -1 ? [] : [...topicMaterials(study.topics[index])];
    const material = data.get('material').trim();
    if (material && !materials.some(entry => entry.text === material)) materials.push({ format: data.get('format'), text: material });
    const entry = { id, title, language: study.language, links, prompt: data.get('prompt').trim(), materials };
    if (index === -1) study.topics.push(entry);
    else study.topics[index] = entry;
    topicId = id;
    if (save()) alertUser('Тема сохранена.');
    render();
  }
  if (form.dataset.form === 'resource') {
    const title = data.get('title').trim();
    const kind = data.get('kind');
    const text = data.get('text').trim();
    const prompt = data.get('prompt').trim();
    const rawUrl = data.get('url').trim();
    const url = safeSourceUrl(rawUrl);
    if (!title || !Object.hasOwn(resourceKinds, kind)) { alertUser('Укажи название и тип материала.'); return; }
    if (rawUrl && !url) { alertUser('Нужна ссылка на источник, начинающаяся с https:// или http://.'); return; }
    if (!text && !url && !(kind === 'exercise' && prompt)) {
      alertUser('Добавь текст, ссылку на источник или условие упражнения.');
      return;
    }
    const id = data.get('id') || crypto.randomUUID();
    const topic = topics().find(entry => entry.id === data.get('topic'));
    const entry = {
      id, title, kind, text, prompt, url, language: study.language, topicId: topic?.id,
      answer: kind === 'exercise' ? data.get('answer').trim() : ''
    };
    const index = study.resources.findIndex(resource => resource.id === id);
    if (index === -1) study.resources.push(entry);
    else study.resources[index] = entry;
    selectedResourceId = id;
    if (save()) alertUser('Материал сохранён.');
    render();
  }
  if (form.dataset.form === 'chat-package') {
    const file = data.get('file');
    const pasted = data.get('json').trim();
    const language = study.language;
    if (!file?.size && !pasted) { alertUser('Выбери файл из чата или вставь JSON.'); return; }
    if (file?.size && pasted) { alertUser('Используй файл или вставь JSON в поле.'); return; }
    if (file?.size > 1_000_000) { alertUser('Файл должен быть меньше 1 МБ.'); return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const text = file?.size ? await file.text() : pasted;
      if (!form.isConnected || study.language !== language) return;
      const packet = parseChatPackage(text, language);
      const { next, topic, wordsAdded, materialsAdded } = applyChatPackage(study, packet, data.get('topic'));
      try { writeStudy(next); }
      catch { throw new Error('Браузер не смог сохранить пакет. Проверь свободное место в хранилище.'); }
      study = next;
      topicId = topic.id;
      wordId = undefined;
      alertUser(`«${topic.title}» · новых слов ${wordsAdded} · новых материалов ${materialsAdded}`);
      location.hash = 'map';
    } catch (error) { alertUser(error.message); }
    finally { submit.disabled = false; }
  }
});

window.addEventListener('hashchange', () => { stopVoice(); render(); window.scrollTo(0, 0); });
window.addEventListener('pagehide', stopVoice);
render();
