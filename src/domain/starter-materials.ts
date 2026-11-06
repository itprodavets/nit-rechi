import type { Resource } from './model';

export const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = typeof levels[number];

type Lesson = {
  resource: Resource;
  glossary: ReadonlyMap<string, string>;
};

function englishLesson(level: Level, title: string, text: string, translation: string, prompt: string,
  words: [string, string][], kind: Resource['kind'] = 'reading'): Lesson {
  return {
    resource: { id: 'starter:en:' + level, title, text, translation, prompt, kind, language: 'en', url: '', answer: '' },
    glossary: new Map(words)
  };
}

export const englishLessons: Record<Level, Lesson> = {
  A1: englishLesson('A1', 'At the café',
    '“Hello. Can I have a small coffee, please?”\n“Of course. Would you like milk?”\n“Yes, please. How much is it?”\n“Three pounds.”',
    '«Здравствуйте. Можно мне маленький кофе, пожалуйста?»\n«Конечно. Добавить молоко?»\n«Да, пожалуйста. Сколько стоит?»\n«Три фунта».',
    'Представь, что ты в кафе. Закажи напиток и спроси, сколько он стоит.',
    [['coffee', 'кофе'], ['milk', 'молоко'], ['how much', 'сколько'], ['pounds', 'фунты']], 'dialogue'),
  A2: englishLesson('A2', 'A different way home',
    'I usually take the bus home after work. Yesterday it was late, so I walked to the station instead. On the way, I bought some bread and ran into my neighbour. We took the same train home.',
    'Обычно после работы я еду домой на автобусе. Вчера автобус опаздывал, поэтому я пошёл пешком на станцию. По дороге я купил хлеб и случайно встретил соседа. Мы поехали домой на одном поезде.',
    'Расскажи, как ты обычно добираешься домой и что однажды изменило твой маршрут.',
    [['usually', 'обычно'], ['instead', 'вместо этого'], ['on the way', 'по дороге'], ['ran into', 'случайно встретил']]),
  B1: englishLesson('B1', 'Moving a meeting',
    '“Could we reschedule our meeting? I need to finish a report before lunch.”\n“Sure. Would Thursday afternoon work for you?”\n“I’m free after three. I’ll send a new invitation.”\n“Thanks. Could you also let Nina know?”',
    '«Можем перенести встречу? Мне нужно закончить отчёт до обеда».\n«Конечно. В четверг после обеда тебе удобно?»\n«Я свободен после трёх. Отправлю новое приглашение».\n«Спасибо. Можешь ещё сообщить Нине?»',
    'Попроси перенести встречу, объясни причину и предложи два варианта времени.',
    [['reschedule', 'перенести на другое время'], ['report', 'отчёт'], ['work for you', 'тебе подойдёт'], ['let nina know', 'сообщить Нине']], 'dialogue'),
  B2: englishLesson('B2', 'A quieter office',
    'Our team tried keeping one afternoon a week free of meetings. The idea sounded simple, but urgent questions soon moved to group chats. After a month, we set aside a short time for questions at the start of each day. That gave people a reliable way to get answers while protecting time for work that required concentration.',
    'Наша команда попробовала оставлять один день в неделю после обеда без встреч. Идея казалась простой, но срочные вопросы быстро переместились в групповые чаты. Через месяц мы выделили немного времени на вопросы в начале каждого дня. Так коллеги могли своевременно получать ответы и сохраняли время для работы, требующей сосредоточенности.',
    'Объясни, какую проблему решал эксперимент. Предложи ещё одно правило и назови его возможный недостаток.',
    [['urgent', 'срочный'], ['set aside', 'выделили'], ['reliable', 'надёжный'], ['concentration', 'сосредоточенность']]),
  C1: englishLesson('C1', 'Measuring what matters',
    'The library used to report success in terms of visitor numbers. Once it extended its opening hours, the weekly total barely changed. Interviews revealed a shift the headline figure had missed: students with evening jobs and people caring for relatives could finally come in. The library kept tracking attendance, but started asking which groups benefited from the change and what barriers remained.',
    'Раньше библиотека оценивала успех по числу посетителей. Когда она продлила часы работы, недельный показатель почти не изменился. Опросы выявили сдвиг, которого не было видно по общей цифре: наконец смогли приходить студенты, работающие по вечерам, и люди, ухаживающие за родственниками. Библиотека продолжила учитывать посещаемость, а также стала выяснять, кому помогло изменение и какие препятствия остались.',
    'Сформулируй главный вывод. Предложи, как собрать данные о тех, кто всё ещё не может пользоваться библиотекой.',
    [['barely', 'едва, почти не'], ['headline figure', 'общий показатель'], ['attendance', 'посещаемость'], ['barriers', 'препятствия']]),
  C2: englishLesson('C2', 'The cost of a shortcut',
    'A team that replaces a lengthy approval process with a checklist may discover that it has merely relocated the work. Whoever drafted the checklist now makes decisions that were once open to challenge in individual cases. This may be a sensible trade-off when mistakes are easy to reverse. Where the consequences are lasting, however, the new process owes its legitimacy in part to whether someone can explain why an exception was refused.',
    'Команда, заменившая долгую процедуру согласования списком проверок, может обнаружить, что просто перенесла работу на другой этап. Решения, которые раньше можно было оспорить в каждом конкретном случае, теперь принимает составитель списка. Такой компромисс может быть разумным, если ошибки легко исправить. Однако при долговременных последствиях оправданность новой процедуры зависит в том числе от того, может ли кто-то объяснить, почему отказались сделать исключение.',
    'Разбери допущения автора. Приведи случай, когда быстрый порядок согласования оправдан даже при серьёзных последствиях.',
    [['merely', 'лишь, всего лишь'], ['open to challenge', 'можно оспорить'], ['trade-off', 'компромисс'], ['legitimacy', 'обоснованность, правомерность']])
};

export function englishReadingSource(level: Level) {
  return level === 'C2'
    ? { title: 'Cambridge English · чтение C1–C2', url: 'https://www.cambridgeenglish.org/learning-english/activities-for-learners/?level=proficient&skill=reading' }
    : { title: 'British Council · чтение ' + level, url: 'https://learnenglish.britishcouncil.org/free-resources/reading/' + level.toLowerCase() };
}
