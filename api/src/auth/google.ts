import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

export type GoogleProfile = {
  googleId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type GoogleVerifier = (idToken: string) => Promise<GoogleProfile>;

const payloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export function createGoogleVerifier(clientIds: string[]): GoogleVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientIds,
    });
    const payload = payloadSchema.parse(ticket.getPayload());
    return {
      googleId: payload.sub,
      email: payload.email || null,
      emailVerified: payload.email_verified === true,
      name: payload.name || null,
    };
  };
}
