import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * The account's own details, not the session's.
 *
 * A name lived in three places and agreed with itself by accident: the greeting
 * on the panel home read `user_metadata.full_name`, written once at signup and
 * never again; the avatar in the panel header used the first letter of the
 * *email*; and the profile screen read `profiles`. So renaming yourself in the
 * settings changed the settings screen and nothing else — the dashboard went on
 * greeting you by the name you had signed up with.
 *
 * `profiles` is the row the platform actually keeps, the one the admin console
 * reads, and the only one a person can edit. It is loaded here, once, beside the
 * session, and every screen reads `displayName` from this context. Saving goes
 * through `saveProfile`, which updates the context on success, so the header,
 * the greeting and the form all change on the same render.
 */

export type Profile = { full_name: string | null; phone: string | null };

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** null while loading, or when signed out. */
  profile: Profile | null;
  /** What to call this person on screen. Never empty for a signed-in user. */
  displayName: string;
  saveProfile: (patch: Profile) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  profile: null,
  displayName: "",
  saveProfile: async () => ({ error: "Non connecté." }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let live = true;
    void supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        // A missing row is not an error worth showing: `handle_new_user` creates
        // one on signup, and the display falls back to the signup metadata.
        if (error) console.error("Profile load failed:", error);
        setProfile(data ?? null);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const user = session?.user ?? null;

  const displayName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email?.split("@")[0] ||
    "";

  const saveProfile = useCallback(
    async (patch: Profile) => {
      if (!userId) return { error: "Non connecté." };
      // `.select()` on the way out is the point: an update that matches no row
      // returns success with no data, and reporting that as saved is the same
      // lie as an autosave badge that never saved anything.
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("full_name, phone")
        .maybeSingle();

      if (error) {
        console.error("Profile save failed:", error);
        return { error: "L'enregistrement a échoué. Vérifiez votre connexion et réessayez." };
      }
      if (!data) return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };

      setProfile(data);
      return { error: null };
    },
    [userId],
  );

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      profile,
      displayName,
      saveProfile,
    }),
    [session, user, loading, profile, displayName, saveProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
