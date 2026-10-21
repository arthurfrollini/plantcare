# 🌱 PlantCare

## ↪ Tech stack

- [React Native](https://reactnative.dev/)
- [Expo](https://expo.io/)
- [TypeScript](https://www.typescriptlang.org/)

## ↪ About

A mobile app that reminds you to water your plants, with a schedule that fits each species.

## ↪ Running it

- Clone the repository
- Install dependencies with `yarn install` or `npm install`
- Install the Expo CLI if you don't have it: `npm install --global expo-cli`
- Start the app with `expo start`
- Start the fake API with `npx json-server ./src/services/server.json --host <your-local-ip> --port 3333 --delay 700`, and set the same IP as `baseURL` in `src/services/api.ts`
