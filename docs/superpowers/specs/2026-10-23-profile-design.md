# Profile screen redesign

Date: 2026-10-23. Builds on `main` after PR #4 (plant detail screen).

## Why

The Profile tab is a plain list (language, account) that looks nothing like the new plant detail screen, and it is missing basics people expect from an account screen: a photo, editing the name, changing the password and deleting the account. Arthur wants it to share the plant detail screen's look and to cover those basics.

## Goals

- Same visual language as the plant detail screen: green gradient header cutting the avatar circle in half, pencil to change the photo.
- Edit the name in place.
- Change the password.
- Sign out, and delete the account with a deliberate confirmation.

## Non-goals

- Changing the email address.
- Linking or unlinking Google (Google sign-in is still hidden in the app).
- Password reset by email ("forgot password").
- Notification settings.

## Anti-goals

- Deleting an account by accident: it must take a typed confirmation.
- A deleted account leaving anything behind on the device (tokens, cached plants, scheduled reminders) or on the server (plants, photos, avatar, sessions).

## The screen (signed in)

Top to bottom, inside the tab (no back button: Profile is a tab):

1. **Header**: the same green gradient as the plant detail screen, safe-area aware. A pencil on the right opens the photo sheet (the shared `BottomSheet`, same options and copy pattern as the plant photo sheet: Take a photo, Choose from gallery, and Remove photo when there is one). Changes save at once.
2. **Avatar**: the same circle size and white border as the plant photo, centred on the header's bottom edge. Shows the user's photo, else the initials (first letters of the first two words of the name, as today).
3. **Email** under the avatar, small and muted.
4. **Name**: a read-only row with the label "Name" / "Nome" and a pencil on the right (`space-between`, vertically centred). The pencil turns the value into a text input with Save and Cancel. Save trims the name, requires 1 to 60 characters (the API's current rule), PATCHes `/me`, and shows the same "Saved ✓" toast as the plant detail screen. Cancel restores the stored name.
5. **Language**: as today (English, Português (Brasil)).
6. **Account**:
   - "Change password" / "Alterar senha", only when the account has a password. Opens a sheet with current password, new password and confirmation. Save is enabled when all are filled, the new password meets the sign-up rule (8 to 128 characters and at most 72 bytes in UTF-8, the bcrypt limit the register route already enforces; move that rule to `packages/shared` so both sides use it) and both new fields match. A wrong current password shows an error in the sheet. On success the sheet closes with the toast.
   - "Sign out" / "Sair", as today.
   - "Delete account" / "Excluir conta", in red, last. Opens a sheet explaining that the account, its plants, photos and reminders are deleted for good, with a text field and a red "Confirm" / "Confirmar" button that is enabled only when the field reads exactly `DELETE` (English) or `EXCLUIR` (Portuguese), case-sensitive, after trimming. On success the app clears everything local and returns to the Welcome screen.

The avatar photo also replaces the initials in the "Hello, Arthur" header on My plants.

## Signed out

The header shows the initials of the name typed on the first screen, no pencil on the avatar. The name row edits that local name (stored as today). Language stays. The account section shows only "Sign in" / "Entrar". No password or delete rows.

## API

- `GET /me` and `PATCH /me` responses gain `email: string | null`, `hasPassword: boolean`, `hasAvatar: boolean`, `avatarVersion: string | null` (ISO time of the last avatar change, for cache busting, like `photoVersion` on plants).
- `POST /me/avatar` (multipart, same validation and 5 MB cap as plant photos), `GET /me/avatar` (authenticated, like plant photos), `DELETE /me/avatar`. Stored with the existing `PhotoStorage`.
- `POST /me/password` with `{ currentPassword, newPassword }`: 400 `invalid_password` when the new one breaks the sign-up rule, 403 `wrong_password` when the current one is wrong, 409 `no_password` for accounts without one. On success: new hash, every refresh token of the user revoked except the one presented in the request (the app sends its current refresh token in the body as `refreshToken`), 204. Rate limited like login.
- `DELETE /me`: deletes the user; plants, refresh tokens cascade; the user's plant photos and avatar files are removed from storage. 204.
- Migration: `User.avatarPath String?`, `User.avatarUpdatedAt DateTime?`.

## App

- Delete and sign-out share the local cleanup that sign-out already runs (tokens, My plants cache, scheduled reminders); delete also clears the locally typed name so Welcome starts fresh, then resets navigation to Welcome.
- The name edit and the password sheet reuse the existing `BottomSheet`, `Button` and toast patterns from the plant detail screen.

## Calls I made (Arthur can overturn)

- The confirmation word follows the app language: `DELETE` in English, `EXCLUIR` in Portuguese.
- Changing the password keeps this device signed in and signs out every other device.
- The email shows under the avatar; it is not editable.
- Name limit stays the API's current 1–60 characters.
- The avatar photo also shows on My plants' header.

## Left to the builder

Exact spacing, toast placement and test layout, following the plant detail screen's components and patterns; strings in both locale files.
