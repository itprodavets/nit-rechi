# Нить речи

Личное приложение для чтения, упражнений и разговорной практики. Начать можно с текстов, заданий, ссылок или заметок из Anki.

## Запуск

Нужен Node.js 24 LTS.

```sh
npm ci
npm run dev
```

Открой адрес, который выведет Vite. Браузер запросит доступ к микрофону при первой записи. Для озвучки используются голоса на устройстве.

## Импорт Anki

В «Моих словах» открой «Импорт Anki» и выбери файл. Поддерживаются архивы .apkg и .colpkg, базы .anki2, .anki21, .sqlite и .sqlite3, а также текстовые .txt, .tsv и .csv. Перед импортом проверь выбранные поля и предложенный код языка. Если в файле несколько колод или типов заметок, можно выбрать нужный набор.

Чтобы получить историю повторений, экспортируй архив с включённым расписанием. История открывается в карточке слова и доступна из «Прогресса». Она хранится отдельно от результатов устной практики. Архивы обрабатываются в браузере, изображения и аудио из Anki не копируются.

Для работы на телефоне ограничены размер распакованной базы (64 МБ), число заметок (50 000) и число ответов (500 000). Если коллекция больше, экспортируй нужную колоду отдельно.

## Занятие на сегодня

«Сегодня» — главный экран. Выбери приблизительное время: 5, 10 или 15 минут. Приложение предложит до 3, 5 или 8 слов соответственно. В приоритете недавние ошибки Anki и слова, которым нужна практика. История Anki не обязательна. Если слов ещё нет, можно попробовать пример «Я в офисе».

Вспомни слово по подсказке, затем скажи или напиши свою фразу. Пример открывается после попытки или по запросу. Трудные слова возвращаются один раз в конце занятия. Успех при немедленном повторении не увеличивает интервал как успех в другой день. Расписание разных способов ответа учитывается отдельно.

Занятие можно прервать и продолжить после перезагрузки: сохраняются этап и оценённые ответы. Незавершённый текст ответа не сохраняется. Устные оценки остаются самооценкой, а локальная проверка текста ищет целевое слово и отдельные ошибки, без полной проверки смысла или грамматики. Время занятия — ориентир, не таймер.

## Своя тема и материалы

1. В «Материалах» вставь текст, загрузи файл .txt или .md, добавь упражнение или ссылку. Для упражнения можно указать ответ, который откроется по запросу во время практики.
2. На карте создай разговорную тему и привяжи слова. При добавлении материала можно привязать его к теме.
3. В практике ответь вслух, запиши себя, затем открой и прослушай пример. Отметь, удалось ли ответить самостоятельно. Это назначит следующее повторение.

## Перенос из чата с ИИ

В «Материалах» открой «Из чата с ИИ» и скопируй команду. Чтобы передать в чат текст или ссылку из библиотеки, нажми «Взять в чат» на материале. Попроси вернуть файл nit-rechi.json, затем загрузи его или вставь JSON. Пакет добавит слова, контексты, диалоги и упражнения в выбранную тему. Повторный импорт проходит без дублей. Для переноса API-ключ не нужен.

## Структура и данные

- `src/components/` — экраны и общие компоненты React.
- `src/domain/` — модели, расписание практики, разбор файлов, операции с хранилищем и запись голоса.
- `src/domain/anki-worker.ts` — распаковка Anki и чтение SQLite в отдельном потоке браузера.

Слова, темы и результаты хранятся в браузере. Записи и история Anki хранятся в IndexedDB. Используй тот же браузер и адрес, чтобы вернуться к данным.

GitHub Actions собирает сайт командой `npm run build` и публикует `dist` на GitHub Pages.

## Dialogue by topic

On **Today → Диалог по теме**, choose an existing or new topic and up to 12 words. **Сегодня / Вчера / За неделю** use actual review timestamps in the imported Anki history, with local calendar-day boundaries; importing a file today does not make its old reviews today's reviews. **Весь словарь** also includes unreviewed words. The same preparation is available under My words → Диалог из повторений.

The dialogue uses exactly the checked words and adds their links to the chosen topic. It has spoken role-play, written alternating turns, original word examples and existing topic dialogues. Written word matching checks only the learner's turns and remains advisory; users explicitly assess each word. Skipped ratings do not change progress. No model API is required: copy the selected topic/words to an external AI chat and bring its `nit-rechi.json` result back through Materials.

Drafts are stored per language and can be resumed or reconfigured without replacing the daily retrieval lesson. Written turns autosave after a short pause or when leaving the field; completion saves the dialogue as a material associated with the topic. Written and spoken outcomes stay separate. The vocabulary workspace uses available desktop width, with stacked word/context/progress sections on smaller screens.
