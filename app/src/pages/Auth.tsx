import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CommonActions, StackActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { toApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { takePendingSave, setPendingSave, type PendingSave } from '../plants/pendingSave';
import { confirmationParams, createPlantWithPhoto, syncAfterSave } from '../plants/savePlant';
import { GoogleSignInButton, type GoogleIdTokenProvider } from '../auth/GoogleSignInButton';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../routes/stack.routes';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

type ErrorKey =
  | 'invalid_credentials'
  | 'email_taken'
  | 'required'
  | 'validation_error'
  | 'rate_limited'
  | 'network'
  | 'unknown';

type PendingError = 'network' | 'unknown';

function errorKey(error: unknown): ErrorKey {
  const { code } = toApiError(error);
  switch (code) {
    case 'invalid_credentials':
    case 'email_taken':
    case 'validation_error':
    case 'rate_limited':
    case 'network':
      return code;
    default:
      return 'unknown';
  }
}

const MIN_PASSWORD = 8;

type Props = {
  /** No provider is wired in this app yet, so the Google button stays hidden. */
  googleProvider?: GoogleIdTokenProvider;
};

export function Auth({ googleProvider }: Props) {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const { t } = useTranslation();
  const { status, signIn, signUp } = useAuth();

  const [mode, setMode] = useState(route.params.mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Read synchronously, so two taps in the same frame cannot both submit.
  const submitting = useRef(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  // The name typed on the first screen is the starting point for a new account.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('@plantcare:user')
      .then((saved) => {
        if (active && saved) setName((current) => current || saved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Finishes the form the user filled in before signing up. The stored copy is removed before the
  // request, and the ref keeps a re-fired effect from starting a second run.
  const pendingStarted = useRef(false);
  const [pendingError, setPendingError] = useState<PendingError | null>(null);

  // Kept in memory too, so a retry works even when writing it back to storage failed.
  const pendingInMemory = useRef<PendingSave | null>(null);

  const finishPendingSave = useCallback(async () => {
    if (pendingStarted.current) return;
    pendingStarted.current = true;
    let pending: PendingSave | null = null;
    try {
      // Always take: it also clears a copy stored by an earlier failed attempt.
      const stored = await takePendingSave();
      pending = pendingInMemory.current ?? stored;
      pendingInMemory.current = null;
      if (!pending) {
        navigation.dispatch(StackActions.popTo('PlantSelect'));
        return;
      }
      const { catalogPlantId, ...values } = pending;
      const { photoFailed } = await createPlantWithPhoto(catalogPlantId, values);
      await syncAfterSave();
      // The stack becomes catalog, then confirmation: Back must not land on the filled form.
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'PlantSelect' },
            { name: 'Confirmation', params: confirmationParams(t, photoFailed) },
          ],
        }),
      );
    } catch (e) {
      // Nothing was created: keep the form so the retry button can send it again.
      pendingInMemory.current = pending;
      try {
        if (pending) await setPendingSave(pending);
      } catch {
        // The in-memory copy covers the retry.
      }
      setPendingError(toApiError(e).code === 'network' ? 'network' : 'unknown');
      // Stays marked as started: only the retry button runs it again, not a re-fired effect.
    }
  }, [navigation, t]);

  function retryPendingSave() {
    pendingStarted.current = false;
    setPendingError(null);
    void finishPendingSave();
  }

  // Signing in (or arriving here already signed in) leaves this screen for the catalog, or for the
  // confirmation once the plant saved before sign-up exists.
  useEffect(() => {
    if (status !== 'signedIn') return;
    if (route.params.afterAuth === 'savePendingPlant') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is only set after awaiting the request
      void finishPendingSave();
      return;
    }
    navigation.dispatch(StackActions.popTo('PlantSelect'));
  }, [status, navigation, route.params.afterAuth, finishPendingSave]);

  const signingUp = mode === 'signUp';

  // Signed in and saving the plant from before sign-up: no form, just progress or the retry.
  if (route.params.afterAuth === 'savePendingPlant' && status === 'signedIn') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {pendingError ? (
            <>
              <Text style={styles.error} accessibilityRole="alert">
                {t('plantForm.errors.pendingSave')} {t(`plantForm.errors.${pendingError}`)}
              </Text>
              <View style={styles.footer}>
                <Button title={t('plantForm.retry')} onPress={retryPendingSave} />
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.back')}
                >
                  <Text style={styles.switch}>{t('auth.back')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View accessibilityLabel={t('plantForm.saving')}>
              <ActivityIndicator color={colors.green} size="large" />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  async function handleSubmit() {
    if (submitting.current) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password || (signingUp && !name.trim())) {
      setError('required');
      return;
    }
    if (signingUp && password.length < MIN_PASSWORD) {
      setError('validation_error');
      return;
    }
    submitting.current = true;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      if (signingUp) await signUp(name.trim(), trimmedEmail, password);
      else await signIn(trimmedEmail, password);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(signingUp ? 'signIn' : 'signUp');
    setError(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            hitSlop={12}
            style={styles.back}
          >
            <Feather name="chevron-left" size={28} color={colors.heading} />
          </TouchableOpacity>

          <Text style={styles.title}>{t(signingUp ? 'auth.signUpTitle' : 'auth.signInTitle')}</Text>

          {signingUp && (
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('auth.name')}
              accessibilityLabel={t('auth.name')}
              autoCapitalize="words"
              editable={!busy}
            />
          )}
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email')}
            accessibilityLabel={t('auth.email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.password')}
            accessibilityLabel={t('auth.password')}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
          />

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {t(`auth.errors.${error}`)}
            </Text>
          )}

          <View style={styles.footer}>
            {busy ? (
              <View style={styles.loading} accessibilityLabel={t('auth.loading')}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <Button title={t(signingUp ? 'auth.signUp' : 'auth.signIn')} onPress={() => void handleSubmit()} />
            )}
            <GoogleSignInButton
              title={t('auth.google')}
              provider={googleProvider}
              onError={(e) => setError(errorKey(e))}
            />
          </View>

          <TouchableOpacity onPress={switchMode} disabled={busy} accessibilityRole="button">
            <Text style={styles.switch}>{t(signingUp ? 'auth.toSignIn' : 'auth.toSignUp')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 24,
  },
  back: {
    position: 'absolute',
    top: 12,
    left: 20,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    textAlign: 'center',
    color: colors.heading,
    fontFamily: fonts.heading,
    marginBottom: 24,
  },
  input: {
    borderBottomWidth: 1,
    borderColor: colors.gray,
    color: colors.heading,
    fontSize: 18,
    marginTop: 16,
    padding: 10,
  },
  error: {
    color: colors.red,
    fontFamily: fonts.text,
    fontSize: 15,
    marginTop: 16,
    textAlign: 'center',
  },
  footer: {
    marginTop: 32,
    gap: 12,
  },
  loading: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switch: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.green_dark,
    fontFamily: fonts.text,
    fontSize: 16,
  },
});
