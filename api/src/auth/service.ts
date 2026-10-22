import { localeSchema, type User } from '@plantcare/shared';
import bcrypt from 'bcryptjs';
import { AppError } from '../errors';
import {
  Prisma,
  type PrismaClient,
  type User as UserRow,
} from '../generated/prisma/client';
import { GoogleUnavailableError, type GoogleVerifier } from './google';
import { hashRefreshToken, issueTokens } from './tokens';

const BCRYPT_COST = 12;

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toUserDto(user: UserRow): User {
  const language = localeSchema.safeParse(user.language);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    language: language.success ? language.data : 'en',
    hasPassword: user.passwordHash !== null,
    hasGoogle: user.googleId !== null,
    hasAvatar: user.avatarPath !== null,
    avatarVersion:
      user.avatarPath !== null && user.avatarUpdatedAt !== null
        ? user.avatarUpdatedAt.toISOString()
        : null,
  };
}

async function authResult(
  prisma: PrismaClient,
  user: UserRow,
): Promise<AuthResult> {
  const tokens = await issueTokens(prisma, user.id);
  return { ...tokens, user: toUserDto(user) };
}

export async function register(
  prisma: PrismaClient,
  input: { name: string; email: string; password: string; language?: string },
): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw emailTaken();
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await createUser(prisma, {
    name: input.name,
    email,
    passwordHash,
    ...(input.language ? { language: input.language } : {}),
  });
  return authResult(prisma, user);
}

async function createUser(
  prisma: PrismaClient,
  data: Prisma.UserCreateInput,
): Promise<UserRow> {
  try {
    return await prisma.user.create({ data });
  } catch (error) {
    // Unique violation from a concurrent registration (Prisma P2002).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw emailTaken();
    }
    throw error;
  }
}

function emailTaken(): AppError {
  return new AppError(409, 'email_taken', 'Email already registered');
}

// Cost-12 bcrypt hash of a throwaway string. Compared against when the email
// is unknown, so timing does not reveal it (precomputed, not hashed at import).
const DUMMY_HASH =
  '$2b$12$VvqHkhNEd846TFwHn2Qmg.4EWZETI4NYlkG5q.1zHWRfrqKGDa4f.';

export async function login(
  prisma: PrismaClient,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(input.email) },
  });
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !user.passwordHash || !valid) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }
  return authResult(prisma, user);
}

export async function refresh(
  prisma: PrismaClient,
  refreshToken: string,
): Promise<AuthResult> {
  const invalid = () =>
    new AppError(401, 'invalid_refresh_token', 'Invalid refresh token');
  const tokenHash = hashRefreshToken(refreshToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row) throw invalid();
  // deleteMany so that two concurrent uses of one token cannot both succeed.
  const { count } = await prisma.refreshToken.deleteMany({
    where: { id: row.id },
  });
  if (count === 0 || row.expiresAt <= new Date()) throw invalid();
  return authResult(prisma, row.user);
}

export async function logout(
  prisma: PrismaClient,
  refreshToken: string,
): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
}

export async function googleLogin(
  prisma: PrismaClient,
  verify: GoogleVerifier,
  input: { idToken: string; name?: string; language?: string },
): Promise<AuthResult> {
  let profile;
  try {
    profile = await verify(input.idToken);
  } catch (error) {
    if (error instanceof GoogleUnavailableError) {
      throw new AppError(
        502,
        'google_unavailable',
        'Google sign-in is temporarily unavailable',
      );
    }
    throw new AppError(401, 'invalid_google_token', 'Invalid Google ID token');
  }

  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
  });
  if (byGoogleId) return authResult(prisma, byGoogleId);

  const email = profile.email ? normalizeEmail(profile.email) : null;
  if (email && profile.emailVerified) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Only a verified address may claim an existing account.
      if (byEmail.googleId !== null) {
        throw new AppError(
          409,
          'google_account_conflict',
          'This email is linked to a different Google account',
        );
      }
      // Password sign-up never proved ownership of the email, so the password
      // and every session issued with it are revoked when Google proves it.
      const linked = await prisma.$transaction(async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: byEmail.id } });
        return tx.user.update({
          where: { id: byEmail.id },
          data: { googleId: profile.googleId, passwordHash: null },
        });
      });
      return authResult(prisma, linked);
    }
  }

  const name = (
    input.name?.trim() ||
    profile.name?.trim() ||
    email?.split('@')[0] ||
    'User'
  ).slice(0, 60);
  const user = await prisma.user.create({
    data: {
      name,
      // An unverified address is not stored, so it cannot squat on the email.
      email: email && profile.emailVerified ? email : null,
      googleId: profile.googleId,
      ...(input.language ? { language: input.language } : {}),
    },
  });
  return authResult(prisma, user);
}
