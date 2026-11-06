type Span = { start: number; end: number };
type WordToken = Span & { text: string };

const englishForms: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'], do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'], run: ['ran', 'running', 'runs'],
  oversleep: ['overslept', 'oversleeps', 'oversleeping'], have: ['has', 'had', 'having'],
  say: ['says', 'said', 'saying'], make: ['makes', 'made', 'making'],
  take: ['takes', 'took', 'taken', 'taking'], get: ['gets', 'got', 'gotten', 'getting'],
  see: ['sees', 'saw', 'seen', 'seeing'], find: ['finds', 'found', 'finding'],
  meet: ['meets', 'met', 'meeting'], give: ['gives', 'gave', 'given', 'giving']
};

function tokenize(text: string, language: string): WordToken[] {
  const items = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(language, { granularity: 'word' }).segment(text))
      .filter(part => part.isWordLike).map(part => ({ segment: part.segment, index: part.index }))
    : Array.from(text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}]+)*/gu), match => ({ segment: match[0], index: match.index }));
  return items.map(({ segment, index }) => ({
    text: segment.normalize('NFKC').toLocaleLowerCase(language).replaceAll('’', "'"),
    start: index, end: index + segment.length
  }));
}

function forms(word: string, english: boolean) {
  const accepted = new Set([word]);
  if (!english || !/^[a-z]+$/.test(word)) return accepted;
  if (Object.hasOwn(englishForms, word)) return new Set([word, ...englishForms[word]]);
  if (word.length < 3) return accepted;
  if (/[^aeiou]y$/.test(word)) {
    accepted.add(word.slice(0, -1) + 'ies');
    accepted.add(word.slice(0, -1) + 'ied');
  } else {
    accepted.add(word + (/(?:s|x|z|sh|ch)$/.test(word) ? 'es' : 's'));
    accepted.add(word + (word.endsWith('e') ? 'd' : 'ed'));
  }
  accepted.add((/[^e]e$/.test(word) ? word.slice(0, -1) : word) + 'ing');
  return accepted;
}

export function inspectSpeech(transcript: string, targets: string[], language: string) {
  const english = new Intl.Locale(language).language === 'en';
  const tokens = tokenize(transcript, language);
  const words = targets.map(target => {
    const pattern = tokenize(target, language).map(token => forms(token.text, english));
    const index = pattern.length ? tokens.findIndex((_, at) => pattern.every((set, offset) => {
      const token = tokens[at + offset];
      if (!token || !set.has(token.text)) return false;
      return !offset || !/[.!?。！？]/u.test(transcript.slice(tokens[at + offset - 1].end, token.start));
    })) : -1;
    const span = index < 0 ? undefined : { start: tokens[index].start, end: tokens[index + pattern.length - 1].end };
    return { target, span };
  });
  const issues: (Span & { correction: string })[] = [];
  if (english) {
    for (const match of transcript.matchAll(/\b(I|he|she|it|we|you|they)\s+(am|is|are|has|have)\b/gi)) {
      const [phrase, subject, verb] = match;
      const person = subject.toLowerCase();
      const thirdPerson = ['he', 'she', 'it'].includes(person);
      const expected = /^(has|have)$/i.test(verb) ? thirdPerson ? 'has' : 'have'
        : person === 'i' ? 'am' : thirdPerson ? 'is' : 'are';
      if (verb.toLowerCase() !== expected) issues.push({
        start: match.index, end: match.index + phrase.length, correction: subject + ' ' + expected
      });
    }
  }
  return { words, issues };
}
