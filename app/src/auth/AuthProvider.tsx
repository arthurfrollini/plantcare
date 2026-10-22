import React, {
  createContext,
  useRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
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
import { clearTokens, loadTokens, saveTokens, sessionEpoch } from './session';

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

/** The account name replaces the one typed on the first screen. */
async function adoptName(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, user.name);
}

/**
 * Loads the account at start. After sign-in the device language is the source of truth: when the
 * account disagrees (an earlier PATCH failed), the local language is sent to the account instead
 * of switching the app back. Returns null when the user signed out while this was in flight.
 */
async function fetchAccount(): Promise<User | null> {
  const epoch = sessionEpoch();
  let me = await getMe();
  if (sessionEpoch() !== epoch) return null;
  await adoptName(me);
  if (me.language !== currentLanguage()) {
    try {
      me = await updateMe({ language: currentLanguage() });
    } catch {
      // Best effort; the next successful start tries again.
    }
  }
  return sessionEpoch() === epoch ? me : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const statusRef = useRef<AuthStatus>('loading');
  const refetching = useRef(false);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const startSession = useCallback(async (res: AuthResponse) => {
    await saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    await adoptName(res.user);
    // Signing in on a device applies the language chosen on the account.
    if (res.user.language !== currentLanguage()) await changeLanguage(res.user.language);
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
        const me = await fetchAccount();
        if (!active) return;
        if (me) {
          setUser(me);
          setStatus('signedIn');
        }
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

  // Signed in but the account never loaded (offline start): try again when the app comes back.
  useEffect(() => {
    if (status !== 'signedIn' || user) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || refetching.current) return;
      refetching.current = true;
      fetchAccount()
        .then((me) => {
          if (me) setUser(me);
        })
        .catch(() => undefined)
        .finally(() => {
          refetching.current = false;
        });
    });
    return () => subscription.remove();
  }, [status, user]);

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
    // Claimed before any await, so a second tap in the same frame is a no-op.
    if (statusRef.current === 'signedOut') return;
    statusRef.current = 'signedOut';
    let tokens = null;
    try {
      tokens = await loadTokens();
    } catch {
      // Signing out locally still goes ahead.
    }
    // Local sign-out is immediate; clearTokens also stops an in-flight refresh from restoring it.
    await clearTokens();
    await AsyncStorage.removeItem(MY_PLANTS_CACHE_KEY);
    setUser(null);
    setStatus('signedOut');
    // Best effort, not awaited: being offline must not hold the user in.
    if (tokens) void logout(tokens.refreshToken).catch(() => undefined);
  }, []);

  const setLanguage = useCallback(
    async (language: Locale) => {
      await changeLanguage(language);
      if (status !== 'signedIn') return;
      try {
        setUser(await updateMe({ language }));
      } catch {
        // The local choice stands; the next successful start sends it to the account.
      }
    },
    [status],
  );

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signInWithGoogle, signOut, setLanguage }),
    [status, user, signIn, signUp, signInWithGoogle, signOut, setLanguage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
