import AsyncStorage from '@react-native-async-storage/async-storage';

/** The name typed on the first screen, replaced by the account name after sign-in. */
export const LOCAL_NAME_KEY = '@plantcare:user';

const listeners = new Set<() => void>();

/** Stores a name edited on Profile and tells the screens showing it (the My plants header). */
export async function saveLocalName(name: string): Promise<void> {
  await AsyncStorage.setItem(LOCAL_NAME_KEY, name);
  listeners.forEach((listener) => listener());
}

export function onLocalNameChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
