import { useEffect, useRef } from 'react';
import { useWorkspace } from '../context';
import { languageName, selectLanguage } from '../domain/model';

export const languageCodes = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ar', 'ru', 'uk'];

const regions: Record<string, string> = {
  en: 'GB', zh: 'CN', ja: 'JP', ko: 'KR', es: 'ES', fr: 'FR', de: 'DE', it: 'IT',
  pt: 'PT', ar: 'SA', ru: 'RU', uk: 'UA', hi: 'IN', nl: 'NL', el: 'GR', th: 'TH',
  pl: 'PL', tr: 'TR', sv: 'SE', id: 'ID', vi: 'VN'
};

export function LanguageFlag({ code }: { code: string }) {
  const locale = new Intl.Locale(code);
  const region = locale.region ?? (code === 'zh-Hant' ? 'TW' : regions[locale.language]);
  const flag = region && /^[A-Z]{2}$/.test(region)
    ? String.fromCodePoint(...Array.from(region, letter => letter.charCodeAt(0) + 127397)) : '🌐';
  return <span className="language-flag" aria-hidden="true">{flag}</span>;
}

export function LanguageLabel({ code }: { code: string }) {
  return <span className="language-label"><LanguageFlag code={code} /><span>{languageName(code)}</span></span>;
}

export function LanguageMenu() {
  const { study, update } = useWorkspace();
  const menu = useRef<HTMLDetailsElement>(null);
  const languages = Object.keys(study.languages);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.current && !menu.current.contains(event.target)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  if (languages.length < 2) return <span className="app-language" title={languageName(study.language)} aria-label={languageName(study.language)}><LanguageFlag code={study.language} /></span>;
  return <details className="app-language language-menu" ref={menu} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key !== 'Escape') return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary')?.focus();
  }}>
    <summary aria-label={'Язык · ' + languageName(study.language)} title={languageName(study.language)}><LanguageFlag code={study.language} /><span aria-hidden="true">⌄</span></summary>
    <div className="language-popover" aria-label="Изучаемые языки">
      {languages.map(code => <button type="button" key={code} aria-pressed={code === study.language} onClick={async () => {
        if (await update(current => selectLanguage(current, code))) {
          menu.current?.querySelector('summary')?.focus();
          if (menu.current) menu.current.open = false;
        }
      }}><LanguageLabel code={code} /></button>)}
    </div>
  </details>;
}
