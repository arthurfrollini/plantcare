export type GoogleProfile = {
  googleId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type GoogleVerifier = (idToken: string) => Promise<GoogleProfile>;
