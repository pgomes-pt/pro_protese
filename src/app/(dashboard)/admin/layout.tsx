import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { dashboardPathForRole } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
  });

  if (!dbUser) {
    redirect("/login");
  }

  if (dbUser.role !== UserRole.ADMIN) {
    redirect(dashboardPathForRole(dbUser.role));
  }

  return (
    <AdminDashboardShell userName={dbUser.name} userEmail={dbUser.email}>
      {children}
    </AdminDashboardShell>
  );
}
