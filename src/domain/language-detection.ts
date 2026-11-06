const languageHints: Record<string, RegExp> = {
  en: /\b(english|английский|the|you|could|will|with|meeting|please|from|this|would)\b|английск/i,
  es: /\b(español|spanish|hola|gracias|usted|pero|quiero|buenos|para|tienes|nosotros|está)\b|испанск/i,
  fr: /\b(french|français|bonjour|merci|vous|pour|avec|suis|nous|dans|cette|est)\b|французск/i,
  de: /\b(german|deutsch|danke|bitte|ich|nicht|mit|guten|und|oder|sind|eine)\b|немецк/i,
  pt: /\b(portuguese|português|obrigado|você|não|bom dia|vocês|comigo|também)\b|португальск/i,
  it: /\b(italian|italiano|grazie|buongiorno|voglio|siamo|della|abbiamo|anche|perché)\b|итальянск/i,
  zh: /\b(chinese|mandarin|hanzi)\b|中文|普通话|китайск/i,
  ja: /\b(japanese|nihongo|kanji)\b|日本語|японск/i,
  ko: /\b(korean)\b|한국어|корейск/i,
  ru: /\b(russian)\b|русский/i
};

export function suggestLanguage(samples: string[], hint = ''): string | undefined {
  const text = samples.slice(0, 80).join(' ').slice(0, 5000);
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Thai}/u.test(text)) return 'th';
  if (/\p{Script=Greek}/u.test(text)) return 'el';
  const named = Object.entries(languageHints).filter(([, pattern]) => pattern.test(hint)).map(([code]) => code);
  if (/\p{Script=Han}/u.test(text)) return named.includes('ja') ? 'ja' : 'zh';
  if (/\p{Script=Cyrillic}/u.test(text) && !/\p{Script=Latin}/u.test(text)) return /[іїєґ]/i.test(text) ? 'uk' : 'ru';
  if (named.length === 1) return named[0];
  const scores = Object.entries(languageHints)
    .map(([code, pattern]) => [code, samples.slice(0, 80).filter(sample => pattern.test(sample)).length] as const)
    .sort((a, b) => b[1] - a[1]);
  return scores[0][1] > scores[1][1] && scores[0][1] >= 2 ? scores[0][0] : undefined;
}

export function suggestMaterialLanguage(text: string) {
  const sample = text.trim().slice(0, 5000);
  if (sample.length < 18) return undefined;
  const sentences = sample.split(/(?<=[.!?。！？])\s*|\n+/u);
  const words = [...new Set(sample.toLowerCase().match(/[\p{L}\p{M}]+/gu))];
  return suggestLanguage(sentences) ?? suggestLanguage(words);
}
