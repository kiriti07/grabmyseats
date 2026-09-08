import { RequireAuth } from "@/components/auth/RequireAuth";

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
