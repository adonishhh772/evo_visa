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

const STORAGE_KEY = "evo_visa_user_id";

type UserContextValue = {
  userId: string;
  setUserId: (value: string) => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState("demo_user");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored?.trim()) {
        setUserIdState(stored.trim());
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setUserId = useCallback((value: string) => {
    const next = value.trim() || "demo_user";
    setUserIdState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ userId, setUserId }), [userId, setUserId]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserId() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUserId must be used within UserProvider");
  }
  return context;
}
