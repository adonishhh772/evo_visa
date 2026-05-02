"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchUserProfile } from "@/lib/api";
import { useUserId } from "@/components/layout/UserContext";

export type UserProfileRecord = Record<string, unknown>;

type UserProfileContextValue = {
  profile: UserProfileRecord | null | undefined;
  loading: boolean;
  reloadProfile: () => Promise<void>;
  applyProfileSnapshot: (snapshot: UserProfileRecord) => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { userId } = useUserId();
  const [profile, setProfile] = useState<UserProfileRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const reloadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchUserProfile(userId);
      setProfile(row?.profile ?? null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  const applyProfileSnapshot = useCallback((snapshot: UserProfileRecord) => {
    setProfile(snapshot);
  }, []);

  const value = useMemo(
    () => ({ profile, loading, reloadProfile, applyProfileSnapshot }),
    [profile, loading, reloadProfile, applyProfileSnapshot],
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error("useUserProfile must be used within UserProfileProvider");
  }
  return ctx;
}
