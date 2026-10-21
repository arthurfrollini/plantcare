import type { Locale } from '@plantcare/shared';

/**
 * Picks the first supported language of an Accept-Language header, honouring
 * q-values. Any Portuguese tag maps to pt-BR, any English tag to en; anything
 * else falls back to en.
 */
export function resolveLocale(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return 'en';
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return {
        tag: tag.trim().toLowerCase(),
        q: Number.isNaN(q) ? 0 : q,
        index,
      };
    })
    .filter((entry) => entry.tag !== '' && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of ranked) {
    if (tag === 'pt' || tag.startsWith('pt-')) return 'pt-BR';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
