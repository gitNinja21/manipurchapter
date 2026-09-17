import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      employeeCode: user.employeeCode,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      approved: user.approved,
      profilePhotoUrl: user.profilePhoto ? `/api/photos/${user.profilePhoto}` : null,
    },
  });
}
