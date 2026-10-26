import {
  authResponseSchema,
  catalogPageSchema,
  catalogPlantSchema,
  userPlantSchema,
  userSchema,
  type AuthResponse,
  type CatalogPage,
  type CatalogPlant,
  type CreateUserPlant,
  type Difficulty,
  type Light,
  type Locale,
  type UpdateUserPlant,
  type User,
  type UserPlant,
} from '@plantcare/shared';
import { z } from 'zod';

import type { PlantPhoto } from '../plants/pickPhoto';
import { api } from './client';
import { assetUrl } from './config';

export function listCatalog(
  q: {
    search?: string;
    light?: Light;
    difficulty?: Difficulty;
    page?: number;
  },
  signal?: AbortSignal,
): Promise<CatalogPage> {
  return api
    .get('/plants', { params: q, signal })
    .then((r) => catalogPageSchema.parse(r.data));
}

export function getCatalogPlant(id: string): Promise<CatalogPlant> {
  return api
    .get(`/plants/${encodeURIComponent(id)}`)
    .then((r) => catalogPlantSchema.parse(r.data));
}

export function register(b: {
  name: string;
  email: string;
  password: string;
  language: Locale;
}): Promise<AuthResponse> {
  return api.post('/auth/register', b).then((r) => authResponseSchema.parse(r.data));
}

export function login(b: { email: string; password: string }): Promise<AuthResponse> {
  return api.post('/auth/login', b).then((r) => authResponseSchema.parse(r.data));
}

export function loginWithGoogle(b: {
  idToken: string;
  name?: string;
  language: Locale;
}): Promise<AuthResponse> {
  return api.post('/auth/google', b).then((r) => authResponseSchema.parse(r.data));
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken });
}

export function getMe(): Promise<User> {
  return api.get('/me').then((r) => userSchema.parse(r.data));
}

export function updateMe(b: { name?: string; language?: Locale }): Promise<User> {
  return api.patch('/me', b).then((r) => userSchema.parse(r.data));
}

export function listMyPlants(): Promise<UserPlant[]> {
  return api.get('/me/plants').then((r) => z.array(userPlantSchema).parse(r.data));
}

export function createMyPlant(b: CreateUserPlant): Promise<UserPlant> {
  return api.post('/me/plants', b).then((r) => userPlantSchema.parse(r.data));
}

export function updateMyPlant(id: string, b: UpdateUserPlant): Promise<UserPlant> {
  return api
    .patch(`/me/plants/${encodeURIComponent(id)}`, b)
    .then((r) => userPlantSchema.parse(r.data));
}

export function deletePlantPhoto(id: string): Promise<UserPlant> {
  return api
    .delete(`/me/plants/${encodeURIComponent(id)}/photo`)
    .then((r) => userPlantSchema.parse(r.data));
}

export async function deleteMyPlant(id: string): Promise<void> {
  await api.delete(`/me/plants/${encodeURIComponent(id)}`);
}

export function markWatered(id: string, wateredOn: string): Promise<UserPlant> {
  return api
    .post(`/me/plants/${encodeURIComponent(id)}/waterings`, { wateredOn })
    .then((r) => userPlantSchema.parse(r.data));
}

export function undoWatered(id: string, wateredOn: string): Promise<UserPlant> {
  return api
    .delete(`/me/plants/${encodeURIComponent(id)}/waterings/${encodeURIComponent(wateredOn)}`)
    .then((r) => userPlantSchema.parse(r.data));
}

export function uploadPlantPhoto(
  id: string,
  file: { uri: string; mimeType: string },
): Promise<UserPlant> {
  const form = new FormData();
  // React Native reads the upload from this {uri, name, type} part (see form-data.d.ts).
  form.append('photo', { uri: file.uri, name: 'photo', type: file.mimeType });
  return api
    .post(`/me/plants/${encodeURIComponent(id)}/photo`, form, { timeout: 60000 })
    .then((r) => userPlantSchema.parse(r.data));
}

export function plantPhotoSource(
  plant: UserPlant,
  accessToken: string,
): { uri: string; headers: Record<string, string>; cacheKey: string } | null {
  if (!plant.hasPhoto) return null;
  return {
    uri: assetUrl(`/me/plants/${encodeURIComponent(plant.id)}/photo`),
    headers: { Authorization: `Bearer ${accessToken}` },
    cacheKey: `${plant.id}-${plant.photoVersion ?? ''}`,
  };
}

export function uploadAvatar(photo: PlantPhoto): Promise<User> {
  const form = new FormData();
  form.append('photo', { uri: photo.uri, name: 'photo', type: photo.mimeType });
  return api
    .post('/me/avatar', form, { timeout: 60000 })
    .then((r) => userSchema.parse(r.data));
}

export function deleteAvatar(): Promise<User> {
  return api.delete('/me/avatar').then((r) => userSchema.parse(r.data));
}

export function avatarSource(
  user: User,
  accessToken: string,
): { uri: string; headers: Record<string, string>; cacheKey: string } | null {
  if (!user.hasAvatar) return null;
  return {
    uri: assetUrl('/me/avatar'),
    headers: { Authorization: `Bearer ${accessToken}` },
    cacheKey: `avatar-${user.avatarVersion ?? ''}`,
  };
}

/** Changes the password; this device keeps its session, every other one is signed out. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  // The refresh token is added at send time: a retry after a refresh must keep the new one.
  await api.post('/me/password', undefined, {
    bodyWithRefreshToken: { currentPassword, newPassword },
  });
}

export async function deleteAccount(): Promise<void> {
  await api.delete('/me');
}
