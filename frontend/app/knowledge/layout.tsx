import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge base · EvoVisa",
};

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
