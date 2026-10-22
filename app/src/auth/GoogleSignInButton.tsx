import React, { useState } from 'react';

import { Button } from '../components/Button';
import { useAuth } from './AuthProvider';

/** Resolves to a Google ID token, or null when the user cancels. */
export type GoogleIdTokenProvider = () => Promise<string | null>;

type Props = {
  title: string;
  provider?: GoogleIdTokenProvider;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

/** Renders nothing unless a provider is passed; real Google sign-in needs a development build. */
export function GoogleSignInButton({ title, provider, onSuccess, onError }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!provider) return null;

  async function handlePress(getIdToken: GoogleIdTokenProvider) {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) return;
      await signInWithGoogle(idToken);
      onSuccess?.();
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  }

  return <Button title={title} disabled={busy} onPress={() => void handlePress(provider)} />;
}
