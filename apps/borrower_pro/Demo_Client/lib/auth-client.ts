import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3006",
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  updateUser,
} = authClient;

export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];
