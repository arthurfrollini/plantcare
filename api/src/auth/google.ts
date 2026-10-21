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

/** Google's signing keys could not be fetched; says nothing about the token. */
export class GoogleUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GoogleUnavailableError';
  }
}

export function createGoogleVerifier(clientIds: string[]): GoogleVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    // verifyIdToken fetches the certificates first and then checks the token;
    // only the fetch can fail for transport reasons. Fetching here (the result
    // is cached on the client) separates the two without parsing messages.
    try {
      await client.getFederatedSignonCertsAsync();
    } catch (error) {
      throw new GoogleUnavailableError('Could not fetch Google certificates', {
        cause: error,
      });
    }
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
