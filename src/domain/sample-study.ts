import { officePrompt, officeStory } from './starter-stories';
import { selectLanguage } from './model';
import type { Study } from './model';

export function addExample(study: Study): Study {
  const examples = [
    { id: 'sample-oversleep', title: 'oversleep', meaning: 'проспать', example: 'I overslept and got to the office a little late.' },
    { id: 'sample-reschedule', title: 'reschedule', meaning: 'перенести на другое время', example: 'Could we reschedule our call for after lunch?' },
    { id: 'sample-errands', title: 'run errands', meaning: 'сходить по делам', example: 'I need to run a few errands during lunch.' },
    { id: 'sample-agree', title: 'agree', meaning: 'соглашаться', example: 'I agree with you. We need more time for this project.' },
    { id: 'sample-deadline', title: 'deadline', meaning: 'крайний срок', example: 'Can we finish this before the deadline?' }
  ].filter(word => !study.words.some(existing => existing.id === word.id)).map(word => ({ ...word, language: 'en' }));
  const topic = { id: 'sample-office', language: 'en', title: 'Я в офисе', links: ['sample-oversleep', 'sample-reschedule', 'sample-errands', 'sample-agree', 'sample-deadline'], prompt: officePrompt, materials: [{ format: 'Пример рассказа · вымышленная ситуация', text: officeStory }] };
  return { ...selectLanguage(study, 'en'), words: [...study.words, ...examples], topics: study.topics.some(entry => entry.id === topic.id) ? study.topics : [...study.topics, topic] };
}
