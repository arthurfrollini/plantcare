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

export async function deleteMyPlant(id: string): Promise<void> {
  await api.delete(`/me/plants/${encodeURIComponent(id)}`);
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
