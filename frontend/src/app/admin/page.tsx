"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Bare /admin has nothing of its own to show - send it straight to the
// dashboard (still gated by app/admin/layout.tsx's session check either
// way).
export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return null;
}
