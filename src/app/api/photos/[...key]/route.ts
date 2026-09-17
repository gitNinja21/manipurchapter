import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readPhotoByKey } from "@/lib/photoStorage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { key } = await params;
  const joined = key.join("/");

  const photo = await readPhotoByKey(joined);
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Only the employee themself, or an admin, may view a given selfie.
  if (user.role !== "ADMIN" && user.id !== photo.ownerUserId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Buffer isn't directly assignable to BodyInit under the DOM lib types;
  // Uint8Array (copied out of the Buffer's backing store) is.
  const bytes = new Uint8Array(photo.buffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
