import type { Study, Topic } from './model';
import { starterStories, storyPrompts, officeStory, officePrompt } from './starter-stories.ts';

const situations = [
  ['home', 'Дома', 'Расскажи, что ты обычно делаешь дома после работы.'],
  ['cafe', 'В кафе', 'Закажи напиток и спроси, можно ли взять его с собой.'],
  ['day', 'Как прошёл день', 'Расскажи, что ты сделал сегодня и что тебе понравилось.'],
  ['store', 'В магазине', 'Спроси цену и уточни, есть ли нужный размер.'],
  ['supermarket', 'В супермаркете', 'Спроси, где найти нужный продукт, и попроси пакет.']
] as const;

const content: Record<string, [string, string][]> = {
  en: [
    ['At home', 'I usually cook dinner after work. Then I put the dishes away.'],
    ['At a café', 'Could I have a coffee, please? Can I get it to go?'],
    ['How my day went', 'I had a busy morning. The best part of my day was lunch with a friend.'],
    ['At a shop', 'How much is this? Do you have it in a larger size?'],
    ['At the supermarket', 'Excuse me, where can I find the eggs? Could I have a bag, please?']
  ],
  zh: [
    ['在家', '我通常下班后做晚饭。吃完饭我会洗碗。'],
    ['在咖啡馆', '请给我一杯咖啡。可以打包吗？'],
    ['今天过得怎么样', '今天上午我很忙。最开心的是和朋友一起吃午饭。'],
    ['在商店', '这个多少钱？有大一点的吗？'],
    ['在超市', '请问，鸡蛋在哪里？可以给我一个袋子吗？']
  ],
  es: [
    ['En casa', 'Normalmente preparo la cena después del trabajo. Luego lavo los platos.'],
    ['En una cafetería', 'Quisiera un café, por favor. ¿Me lo puede poner para llevar?'],
    ['Cómo me fue hoy', 'Esta mañana estuve muy ocupado. Lo mejor del día fue almorzar con un amigo.'],
    ['En una tienda', '¿Cuánto cuesta esto? ¿Lo tiene en una talla más grande?'],
    ['En el supermercado', 'Disculpe, ¿dónde están los huevos? ¿Me da una bolsa, por favor?']
  ]
};

export function starterTopics(language: string): Topic[] {
  const localized = content[language.split('-')[0]];
  return situations.map(([id, title, prompt], index) => ({
    id: 'starter:' + language + ':' + id,
    language,
    title: localized?.[index]?.[0] ?? title,
    prompt: storyPrompts[index] ?? prompt,
    links: [],
    materials: localized ? [{ format: 'Пример рассказа · вымышленная ситуация', text: starterStories[language.split('-')[0]][index] }] : []
  }));
}

export function upgradeStarterTopics(study: Study): Study {
  let changed = false;
  const topics = study.topics.map(topic => {
    const index = situations.findIndex(([id]) => topic.id === 'starter:' + topic.language + ':' + id);
    if (index < 0) {
      if (topic.id !== 'sample-office' || topic.language !== 'en') return topic;
      const prompt = topic.prompt === 'Представь разговор с коллегой. Расскажи о своём рабочем дне в 2–3 фразах.' ? officePrompt : topic.prompt;
      const oldMaterial = !topic.materials && topic.material === 'I overslept, so I’m running late. Could we reschedule our call for after lunch?';
      if (prompt === topic.prompt && !oldMaterial) return topic;
      changed = true;
      return { ...topic, prompt, ...(oldMaterial ? { material: undefined, materials: [{ format: 'Пример рассказа · вымышленная ситуация', text: officeStory }] } : {}) };
    }
    const example = starterTopics(topic.language)[index];
    const legacy = content[topic.language.split('-')[0]]?.[index]?.[1];
    const prompt = topic.prompt === situations[index][2] ? example.prompt : topic.prompt;
    const materials = topic.materials?.map(material => material.format === 'Пример ответа' && material.text === legacy ? example.materials![0] : material);
    if (prompt === topic.prompt && (!materials || materials.every((entry, i) => entry === topic.materials![i]))) return topic;
    changed = true;
    return { ...topic, prompt, ...(materials ? { materials } : {}) };
  });
  return changed ? { ...study, topics } : study;
}
