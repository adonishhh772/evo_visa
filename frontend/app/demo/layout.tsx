import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo · EvoVisa",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
