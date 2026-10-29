import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { UserPlant } from '@plantcare/shared';

import { changeLanguage, initI18n } from '../i18n';
import { userPlantFixture } from '../plants/testFixtures';
import { PlantCardSecondary } from './PlantCardSecondary';

// Wednesday, October 28, 2026, 10:00.
const now = new Date(2026, 9, 28, 10, 0);

beforeAll(initI18n);
beforeEach(() => changeLanguage('en'));

function renderCard(plant: UserPlant, next: Date | null) {
  render(
    <PlantCardSecondary
      plant={plant}
      next={next}
      now={now}
      accessToken={null}
      readOnly={false}
      onPress={jest.fn()}
      handleRemove={jest.fn()}
      onPhotoError={() => Promise.resolve(null)}
    />,
  );
}

describe('PlantCardSecondary', () => {
  it('says when the next watering is, in words', () => {
    renderCard(userPlantFixture, new Date(2026, 9, 29, 12, 55));

    expect(within(screen.getByTestId('next-watering')).getByText('Tomorrow at 12:55')).toBeOnTheScreen();
  });

  it('names the weekday for a watering later in the week', () => {
    renderCard(userPlantFixture, new Date(2026, 9, 30, 12, 55));

    expect(within(screen.getByTestId('next-watering')).getByText('Friday at 12:55')).toBeOnTheScreen();
  });

  it('shows the species with its scientific name, never the nickname', () => {
    renderCard({ ...userPlantFixture, nickname: 'Pikachu' }, null);

    expect(screen.getByText('Monstera')).toBeOnTheScreen();
    expect(screen.getByText('Monstera deliciosa')).toBeOnTheScreen();
    expect(screen.queryByText('Pikachu')).not.toBeOnTheScreen();
  });

  it('flags a plant with an open check-up', () => {
    renderCard(
      {
        ...userPlantFixture,
        openCheckup: {
          id: 'k1',
          createdAt: '2026-10-27T12:00:00.000Z',
          description: null,
          problem: 'Overwatering',
          steps: ['Let the soil dry out.'],
          whenToWorry: 'If the stems go soft.',
          status: 'open',
          healedAt: null,
          photoUrl: '/me/plants/p1/checkups/k1/photo',
        },
      },
      null,
    );

    expect(screen.getByText('🤒 Needs care')).toBeOnTheScreen();
  });
});
