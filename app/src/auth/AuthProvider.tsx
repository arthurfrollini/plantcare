import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthResponse, Locale, User } from '@plantcare/shared';

import { setSignedOutHandler } from '../api/client';
import {
  getMe,
  login,
  loginWithGoogle,
  logout,
  register,
  updateMe,
} from '../api/endpoints';
import { changeLanguage, currentLanguage } from '../i18n';
import { clearTokens, loadTokens, saveTokens } from './session';

const USER_KEY = '@plantcare:user';
const MY_PLANTS_CACHE_KEY = '@plantcare:myPlantsCache';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type AuthContextValue = {
  status: AuthStatus;
  /** Null while signed out, and while signed in but the account could not be loaded (offline). */
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  setLanguage: (language: Locale) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The account name replaces the one typed on the first screen, and the account language wins. */
async function adoptAccount(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, user.name);
  if (user.language !== currentLanguage()) await changeLanguage(user.language);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const startSession = useCallback(async (res: AuthResponse) => {
    await saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    await adoptAccount(res.user);
    setUser(res.user);
    setStatus('signedIn');
  }, []);

  useEffect(() => {
    let active = true;
    setSignedOutHandler(() => {
      setUser(null);
      setStatus('signedOut');
    });

    async function restore() {
      let tokens;
      try {
        tokens = await loadTokens();
      } catch {
        tokens = null;
      }
      if (!active) return;
      if (!tokens) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await getMe();
        if (!active) return;
        await adoptAccount(me);
        setUser(me);
        setStatus('signedIn');
      } catch {
        // A refresh the server rejects already moved status to signedOut through the handler.
        // Anything else (offline, 5xx) keeps the session; the account loads on a later start.
        if (active) setStatus((s) => (s === 'loading' ? 'signedIn' : s));
      }
    }
    void restore();

    return () => {
      active = false;
      setSignedOutHandler(() => undefined);
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await startSession(await login({ email, password }));
    },
    [startSession],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await startSession(await register({ name, email, password, language: currentLanguage() }));
    },
    [startSession],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      await startSession(await loginWithGoogle({ idToken, language: currentLanguage() }));
    },
    [startSession],
  );

  const signOut = useCallback(async () => {
    try {
      const tokens = await loadTokens();
      // Best effort: being offline must not keep the user signed in.
      if (tokens) await logout(tokens.refreshToken);
    } catch {
      // ignored on purpose
    }
    await clearTokens();
    await AsyncStorage.removeItem(MY_PLANTS_CACHE_KEY);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const setLanguage = useCallback(
    async (language: Locale) => {
      await changeLanguage(language);
      if (status === 'signedIn') setUser(await updateMe({ language }));
    },
    [status],
  );

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signInWithGoogle, signOut, setLanguage }),
    [status, user, signIn, signUp, signInWithGoogle, signOut, setLanguage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
