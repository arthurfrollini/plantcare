import { useEffect, useState } from 'react';
import type { User } from '@plantcare/shared';

import { avatarSource } from '../api/endpoints';
import { loadTokens } from './session';

/**
 * The account photo as an image source, or null for the initials. The request needs the access
 * token, as for plant photos. A failed image shows the initials until the avatar changes.
 */
export function useAvatarSource(user: User | null): {
  source: ReturnType<typeof avatarSource>;
  onError: () => void;
} {
  const [accessToken, setAccessToken] = useState<{ userId: string; token: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const avatarVersion = user?.avatarVersion;
  const hasAvatar = user?.hasAvatar;
  const userId = user?.id;
  useEffect(() => {
    if (!hasAvatar || !userId) return;
    let active = true;
    void loadTokens()
      .then((tokens) => {
        if (active) setAccessToken(tokens ? { userId, token: tokens.accessToken } : null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hasAvatar, avatarVersion, userId]);

  // The token only counts for the user it was loaded for.
  const avatarKey = `${userId ?? ''}-${avatarVersion ?? ''}`;
  const source =
    user && accessToken && accessToken.userId === user.id && failedKey !== avatarKey
      ? avatarSource(user, accessToken.token)
      : null;

  return { source, onError: () => setFailedKey(avatarKey) };
}
