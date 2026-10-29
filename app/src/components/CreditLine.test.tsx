import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { changeLanguage, initI18n } from '../i18n';
import { CreditLine } from './CreditLine';

beforeAll(initI18n);
beforeEach(() => changeLanguage('en'));

describe('CreditLine', () => {
  it('names the author and the licence, and says a CC BY photo was cropped', () => {
    render(
      <CreditLine credit={{ author: 'Jane Doe', license: 'CC BY-SA 4.0', source: 'https://x' }} />,
    );
    expect(screen.getByText('Photo: Jane Doe · CC BY-SA 4.0 (cropped)')).toBeOnTheScreen();
  });

  it('has no note for a public-domain photo', () => {
    render(<CreditLine credit={{ author: 'Jo', license: 'Public domain', source: 'https://x' }} />);
    expect(screen.getByText('Photo: Jo · Public domain')).toBeOnTheScreen();
  });

  it('reads in Portuguese', async () => {
    await changeLanguage('pt-BR');
    render(<CreditLine credit={{ author: 'Jo', license: 'CC BY', source: 'https://x' }} />);
    expect(screen.getByText('Foto: Jo · CC BY (recortada)')).toBeOnTheScreen();
  });

  it('opens the source page on a tap', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(
      <CreditLine
        credit={{ author: 'Jo', license: 'CC0', source: 'https://www.inaturalist.org/photos/1' }}
      />,
    );
    fireEvent.press(screen.getByRole('link'));
    expect(open).toHaveBeenCalledWith('https://www.inaturalist.org/photos/1');
    open.mockRestore();
  });
});
