# PlantCare app

A mobile app that reminds you to water your plants, with a schedule that fits each species.

## Tech stack

- [React Native](https://reactnative.dev/) 0.86 with [Expo](https://expo.dev/) SDK 57
- [TypeScript](https://www.typescriptlang.org/)
- [React Navigation](https://reactnavigation.org/) 7
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for the watering reminders

## Running it

Requires Node.js 22+.

1. Install dependencies from the repo root: `npm install`
2. Start the API first, see [`../api/README.md`](../api/README.md). The app needs it for sign-in, the plant catalog and your plants.
3. From `app/`, start the app: `npx expo start`
4. Open it on your phone with [Expo Go](https://expo.dev/go) (SDK 57) by scanning the QR code, or press `i` for the iOS simulator or `a` for the Android emulator.

The app finds the API on its own: it uses the address of the machine running Metro, on port 3333, so the phone and the computer only need to be on the same network. If they are not (on different networks, or through a tunnel), set `EXPO_PUBLIC_API_URL`.:

```sh
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333 npx expo start
```

Reminders are local notifications, which work in Expo Go. Allow notifications when the app asks the first time you save a plant.

## Google sign-in

The Google button is hidden. Real Google sign-in needs a development build with OAuth client IDs, which this setup does not have. Email and password sign-up and sign-in work in Expo Go.

## Checks to do on a phone

These cannot be covered by tests:

- Notifications: save a plant, allow notifications, and confirm a reminder arrives at the chosen time.
- Photo: take one with the camera and pick one from the gallery, then check it shows on My Plants.
- HEIC: pick a photo taken on an iPhone from the gallery and confirm the upload works.
- Offline: turn the API off and confirm the catalog shows a retry message and My Plants shows the last synced list.

## Checks

`npm run typecheck`, `npm run lint` and `npm test`.
