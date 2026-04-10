import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { ClinicaDashboardShell } from "@/components/clinica-dashboard-shell";
import { dashboardPathForRole } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase-server";

export default async function ClinicaLayout({
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
    include: { clinic: true },
  });

  if (!dbUser) {
    redirect("/login");
  }

  if (dbUser.role !== UserRole.CLINICA) {
    redirect(dashboardPathForRole(dbUser.role));
  }

  return (
    <ClinicaDashboardShell
      clinicName={dbUser.clinic?.name ?? "Clínica"}
      clinicStatus={dbUser.clinic?.status ?? "NOVA"}
      userName={dbUser.name}
      userEmail={dbUser.email}
    >
      {children}
    </ClinicaDashboardShell>
  );
}
