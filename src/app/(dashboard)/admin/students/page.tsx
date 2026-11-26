import { notFound, redirect } from "next/navigation";
import { checkAdminAccess } from "@/lib/supabase/admin-guard";
import { listStudentAccounts } from "@/lib/supabase/student-accounts";
import { StudentsAdminPanel } from "@/components/admin/students-admin-panel";
import { MarkInternalTraffic } from "@/components/analytics/mark-internal-traffic";

export default async function AdminStudentsPage() {
  const access = await checkAdminAccess();

  if (!access.ok) {
    if (access.reason === "no-user") redirect("/login");
    if (access.reason === "not-admin") notFound();
    if (access.reason === "mfa-not-enrolled") redirect("/settings");
    redirect("/admin/mfa-challenge");
  }

  const students = await listStudentAccounts();

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">生徒アカウント</h1>
      <StudentsAdminPanel initialStudents={students} />
      <MarkInternalTraffic />
    </div>
  );
}
