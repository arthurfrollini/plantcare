import { clearTokens, loadTokens, saveTokens } from './session';

describe('session', () => {
  beforeEach(clearTokens);

  it('returns null without tokens', async () => {
    expect(await loadTokens()).toBeNull();
  });

  it('round-trips and clears', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(await loadTokens()).toEqual({ accessToken: 'a', refreshToken: 'r' });
    await clearTokens();
    expect(await loadTokens()).toBeNull();
  });
});
