import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Account Sign-in | Home Made Food", template: "%s | Home Made Food" },
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
