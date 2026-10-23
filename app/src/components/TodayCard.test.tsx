import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { UserPlant } from '@plantcare/shared';

import { changeLanguage, initI18n } from '../i18n';
import { setToday } from '../plants/testClock';
import { userPlantFixture } from '../plants/testFixtures';
import type { TodayRow } from '../plants/today';
import { TodayCard, type TodayCardProps } from './TodayCard';

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', { testID: 'plant-illustration', ...props }) };
});

function plant(id: string, speciesName: string): UserPlant {
  return { ...userPlantFixture, id, speciesName };
}

// Thursday 2026-10-22, local time.
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute);

const rows: TodayRow[] = [
  { plant: plant('p1', 'Zamioculca'), time: at(22, 9, 30), done: false, late: true },
  { plant: plant('p2', 'Cactus'), time: at(22, 13, 0), done: true, late: false },
  { plant: plant('p3', 'Imbé'), time: at(22, 18, 30), done: false, late: false },
];

beforeAll(initI18n);

beforeEach(async () => {
  setToday(at(22, 12, 0));
  await changeLanguage('en');
});

afterEach(() => jest.useRealTimers());

function renderCard(props: Partial<TodayCardProps> = {}) {
  const onToggle = jest.fn();
  const onOpen = jest.fn();
  render(
    <TodayCard
      rows={rows}
      next={null}
      now={at(22, 12, 0)}
      accessToken={null}
      busyIds={new Set()}
      onToggle={onToggle}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onToggle, onOpen };
}

describe('TodayCard', () => {
  it('shows the title, the progress and a row per plant in order with its time', () => {
    renderCard();

    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
    expect(screen.getByTestId('today-progress')).toBeOnTheScreen();
    const shown = screen.getAllByTestId('today-row');
    expect(shown.map((row) => within(row).getByTestId('today-name').props.children)).toEqual([
      'Zamioculca',
      'Cactus',
      'Imbé',
    ]);
    expect(shown.map((row) => within(row).getByTestId('today-time').props.children)).toEqual([
      '09:30',
      '13:00',
      '18:30',
    ]);
  });

  it('marks from the button and undoes from the done state', () => {
    const { onToggle } = renderCard();
    const [zamioculca, cactus, imbe] = screen.getAllByTestId('today-row');
    if (!zamioculca || !cactus || !imbe) throw new Error('three rows expected');

    fireEvent.press(within(imbe).getByText('Watered ✓'));
    expect(onToggle).toHaveBeenLastCalledWith(rows[2]);

    expect(within(cactus).queryByText('Watered ✓')).not.toBeOnTheScreen();
    fireEvent.press(within(cactus).getByText('✓ Watered'));
    expect(onToggle).toHaveBeenLastCalledWith(rows[1]);
  });

  it('opens the plant when its picture or name is tapped', () => {
    const { onOpen, onToggle } = renderCard();

    fireEvent.press(screen.getByText('Imbé'));

    expect(onOpen).toHaveBeenCalledWith(rows[2]?.plant);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows "late" on an unticked row whose time has passed', () => {
    renderCard();

    const [zamioculca] = screen.getAllByTestId('today-row');
    if (!zamioculca) throw new Error('row expected');
    expect(within(zamioculca).getByText('late')).toBeOnTheScreen();
    expect(screen.getAllByText('late')).toHaveLength(1);
  });

  it('disables each row whose request is in flight', () => {
    const { onToggle } = renderCard({ busyIds: new Set(['p1', 'p3']) });

    const imbe = screen.getByRole('button', { name: 'Mark Imbé as watered' });
    expect(imbe).toBeDisabled();
    fireEvent.press(imbe);
    expect(screen.getByRole('button', { name: 'Mark Zamioculca as watered' })).toBeDisabled();
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cactus watered' })).toBeEnabled();
  });

  it('names the plant on each button and says what undo does', () => {
    renderCard();

    const mark = screen.getByRole('button', { name: 'Mark Imbé as watered' });
    expect(mark.props.accessibilityHint).toBeUndefined();
    const undo = screen.getByRole('button', { name: 'Cactus watered' });
    expect(undo.props.accessibilityHint).toBe("Undoes today's watering");
    // The label already says it is watered; a checked state would read as a checkbox.
    expect(undo.props.accessibilityState.checked).toBeUndefined();
  });

  it('names the plant on each button in Portuguese', async () => {
    await changeLanguage('pt-BR');
    renderCard();

    expect(screen.getByRole('button', { name: 'Marcar Imbé como regada' })).toBeOnTheScreen();
    const undo = screen.getByRole('button', { name: 'Cactus regada' });
    expect(undo.props.accessibilityHint).toBe('Desfaz a rega de hoje');
  });

  it('says so when every plant is watered', () => {
    renderCard({ rows: rows.map((row) => ({ ...row, done: true, late: false })) });

    expect(screen.getByText('3 of 3')).toBeOnTheScreen();
    expect(screen.getByText('All watered today 🌱')).toBeOnTheScreen();
    expect(screen.queryByText('Watered ✓')).not.toBeOnTheScreen();
  });

  it('says nothing is due and when the next watering is', () => {
    renderCard({ rows: [], next: { plant: plant('p3', 'Imbé'), at: at(23, 8, 0) } });

    expect(screen.getByText('Nothing to water today 🌱')).toBeOnTheScreen();
    expect(screen.getByText('Next: Imbé tomorrow at 08:00')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-progress')).not.toBeOnTheScreen();
    expect(screen.queryByText(/of/)).not.toBeOnTheScreen();
  });

  it('names the weekday or the date for a later watering', () => {
    const imbe = plant('p3', 'Imbé');
    renderCard({ rows: [], next: { plant: imbe, at: at(24, 8, 0) } });
    expect(screen.getByText('Next: Imbé on Saturday at 08:00')).toBeOnTheScreen();

    renderCard({ rows: [], next: { plant: imbe, at: new Date(2026, 10, 19, 8, 0) } });
    expect(screen.getByText('Next: Imbé on November 19 at 08:00')).toBeOnTheScreen();
  });

  it('counts days from the now it is given, not from the clock', () => {
    const imbe = plant('p3', 'Imbé');
    // The clock says Thursday; the screen's now is Tuesday, so Friday is three days away.
    renderCard({ rows: [], now: at(20, 12, 0), next: { plant: imbe, at: at(23, 8, 0) } });
    expect(screen.getByText('Next: Imbé on Friday at 08:00')).toBeOnTheScreen();

    renderCard({ rows: [], now: at(20, 12, 0), next: { plant: imbe, at: at(21, 8, 0) } });
    expect(screen.getByText('Next: Imbé tomorrow at 08:00')).toBeOnTheScreen();
  });

  it('never says "tomorrow" for a watering later the same day', () => {
    renderCard({ rows: [], next: { plant: plant('p3', 'Imbé'), at: at(22, 23, 0) } });

    expect(screen.getByText('Next: Imbé on October 22 at 23:00')).toBeOnTheScreen();
  });

  it('leaves out the next watering when there is none', () => {
    renderCard({ rows: [], next: null });

    expect(screen.getByText('Nothing to water today 🌱')).toBeOnTheScreen();
    expect(screen.queryByText(/Next:/)).not.toBeOnTheScreen();
  });

  it('speaks Portuguese', async () => {
    await changeLanguage('pt-BR');
    renderCard();

    expect(screen.getByText('Hoje')).toBeOnTheScreen();
    expect(screen.getByText('1 de 3')).toBeOnTheScreen();
    expect(screen.getAllByText('Reguei ✓')).toHaveLength(2);
    expect(screen.getByText('✓ Regada')).toBeOnTheScreen();
    expect(screen.getByText('atrasada')).toBeOnTheScreen();
  });

  it('speaks Portuguese on the empty and the finished day', async () => {
    await changeLanguage('pt-BR');
    const imbe = plant('p3', 'Imbé');
    renderCard({ rows: [], next: { plant: imbe, at: at(23, 8, 0) } });
    expect(screen.getByText('Nada pra regar hoje 🌱')).toBeOnTheScreen();
    expect(screen.getByText('Próxima: Imbé amanhã às 08:00')).toBeOnTheScreen();

    renderCard({ rows: [], next: { plant: imbe, at: at(24, 8, 0) } });
    expect(screen.getByText('Próxima: Imbé sábado às 08:00')).toBeOnTheScreen();

    renderCard({ rows: [], next: { plant: imbe, at: new Date(2026, 10, 19, 8, 0) } });
    expect(screen.getByText('Próxima: Imbé em 19 de novembro às 08:00')).toBeOnTheScreen();

    renderCard({ rows: rows.map((row) => ({ ...row, done: true, late: false })) });
    expect(screen.getByText('Tudo regado hoje 🌱')).toBeOnTheScreen();
  });

  it('says "à" for one o\'clock in Portuguese and "às" for other hours', async () => {
    await changeLanguage('pt-BR');
    const imbe = plant('p3', 'Imbé');
    renderCard({ rows: [], next: { plant: imbe, at: at(23, 1, 30) } });
    expect(screen.getByText('Próxima: Imbé amanhã à 01:30')).toBeOnTheScreen();

    renderCard({ rows: [], next: { plant: imbe, at: at(23, 13, 0) } });
    expect(screen.getByText('Próxima: Imbé amanhã às 13:00')).toBeOnTheScreen();

    renderCard({ rows: [], next: { plant: imbe, at: at(24, 1, 0) } });
    expect(screen.getByText('Próxima: Imbé sábado à 01:00')).toBeOnTheScreen();
  });

  it('keeps "at" for one o\'clock in English', () => {
    renderCard({ rows: [], next: { plant: plant('p3', 'Imbé'), at: at(23, 1, 30) } });

    expect(screen.getByText('Next: Imbé tomorrow at 01:30')).toBeOnTheScreen();
  });
});
