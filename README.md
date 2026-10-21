# 🌱 PlantCare

## ↪ Tech stack

- [React Native](https://reactnative.dev/) 0.88 with [Expo](https://expo.dev/) SDK 58
- [TypeScript](https://www.typescriptlang.org/)
- [React Navigation](https://reactnavigation.org/) 7
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for the watering reminders

## ↪ About

A mobile app that reminds you to water your plants, with a schedule that fits each species.

## ↪ Running it

Requires Node.js 20+.

1. Install dependencies: `npm install`
2. Start the fake API (json-server on port 3333): `npm run server`
3. In another terminal, start the app: `npx expo start`
4. Open it on your phone with [Expo Go](https://expo.dev/go) by scanning the QR code, or press `i` for the iOS simulator / `a` for the Android emulator.

The app finds the API on its own: it uses the address of the machine running Metro, so the phone and the computer only need to be on the same network. To point it somewhere else, set `EXPO_PUBLIC_API_URL`, e.g. `EXPO_PUBLIC_API_URL=http://192.168.0.10:3333 npx expo start`.

Reminders are local notifications, which work in Expo Go. Allow notifications when the app asks the first time you save a plant.
