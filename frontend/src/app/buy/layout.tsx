import { RequireAuth } from "@/components/auth/RequireAuth";

export default function BuyLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
