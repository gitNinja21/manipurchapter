import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmployeeView from "@/components/admin/EmployeeView";

export default async function Page({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  if (!await requireAdmin()) redirect("/");
  const { employeeId } = await searchParams;
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: [{ name: "asc" }, { employeeCode: "asc" }],
    select: { id: true, name: true, employeeCode: true, active: true, approved: true, mustChangePassword: true },
  });
  if (!employees.length) return <p>No employees have been added yet.</p>;
  const employee = employeeId ? employees.find(e => e.id === employeeId) : employees[0];
  if (!employee) notFound();
  return <EmployeeView key={employee.id} employees={employees} employee={employee} />;
}
