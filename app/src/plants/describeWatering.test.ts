import { changeLanguage, initI18n } from '../i18n';
import i18n from 'i18next';
import { describeWatering } from './describeWatering';

// Wednesday, October 28, 2026, 10:00.
const now = new Date(2026, 9, 28, 10, 0);
const t = i18n.t.bind(i18n);

beforeAll(initI18n);
beforeEach(() => changeLanguage('en'));

describe('describeWatering', () => {
  it('says today, tomorrow, the weekday within a week, then the date', () => {
    expect(describeWatering(t, new Date(2026, 9, 28, 12, 55), now)).toBe('Today at 12:55');
    expect(describeWatering(t, new Date(2026, 9, 29, 12, 55), now)).toBe('Tomorrow at 12:55');
    expect(describeWatering(t, new Date(2026, 9, 30, 8, 0), now)).toBe('Friday at 08:00');
    expect(describeWatering(t, new Date(2026, 10, 3, 8, 0), now)).toBe('Tuesday at 08:00');
    expect(describeWatering(t, new Date(2026, 10, 4, 8, 0), now)).toBe('November 4 at 08:00');
  });

  it('speaks Portuguese, with "à" for one o\'clock', async () => {
    await changeLanguage('pt-BR');

    expect(describeWatering(t, new Date(2026, 9, 28, 12, 55), now)).toBe('Hoje às 12:55');
    expect(describeWatering(t, new Date(2026, 9, 29, 1, 30), now)).toBe('Amanhã à 01:30');
    expect(describeWatering(t, new Date(2026, 9, 30, 8, 0), now)).toBe('Sexta-feira às 08:00');
    expect(describeWatering(t, new Date(2026, 10, 4, 8, 0), now)).toBe('4 de novembro às 08:00');
  });
});
