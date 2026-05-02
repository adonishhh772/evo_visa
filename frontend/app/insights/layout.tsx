import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learnings · EvoVisa",
};

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
