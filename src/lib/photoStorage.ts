import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Photos are written to disk under a private uploads root (NOT /public) and
// served only through /api/photos/[...key], which checks that the viewer is
// either the employee themself or an admin before returning the bytes.
//
// NOTE: on Railway (or any container platform) this directory is ephemeral
// unless you attach a persistent Volume mounted at UPLOADS_DIR — see the
// README before relying on this in production.
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

function extensionForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Saves a data: URL (e.g. "data:image/jpeg;base64,....") to disk under a
 * per-user subfolder and returns a storage *key* (not a URL) to persist in
 * the DB. Build the actual viewable URL with `photoUrlForKey`.
 */
export async function saveDataUrlPhoto(
  dataUrl: string,
  userId: string,
  tag: "in" | "out" | "profile"
): Promise<string> {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Expected a base64 image data URL.");
  }
  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  const MAX_BYTES = 6 * 1024 * 1024; // 6MB safety cap
  if (buffer.length > MAX_BYTES) {
    throw new Error("Photo is too large.");
  }

  const userDir = path.join(UPLOADS_ROOT, userId);
  await mkdir(userDir, { recursive: true });

  const filename = `${Date.now()}-${tag}-${crypto.randomUUID()}.${extensionForMime(mime)}`;
  await writeFile(path.join(userDir, filename), buffer);

  return `${userId}/${filename}`;
}

/** Given a stored key like "userId/filename.jpg", returns the app URL that serves it (access-controlled). */
export function photoUrlForKey(key: string): string {
  return `/api/photos/${key}`;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Reads a stored photo by key ("userId/filename.jpg"), guarding against path traversal. */
export async function readPhotoByKey(
  key: string
): Promise<{ buffer: Buffer; contentType: string; ownerUserId: string } | null> {
  const parts = key.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [ownerUserId, filename] = parts;
  if (ownerUserId.includes("..") || filename.includes("..")) return null;

  const filePath = path.join(UPLOADS_ROOT, ownerUserId, filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_ROOT))) return null; // traversal guard

  try {
    const buffer = await readFile(resolved);
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    return { buffer, contentType: MIME_BY_EXT[ext] || "application/octet-stream", ownerUserId };
  } catch {
    return null;
  }
}

/**
 * Deletes a stored photo by key ("userId/filename.jpg"), guarding against
 * path traversal the same way readPhotoByKey does. Best-effort: a missing
 * file (or any other failure) is swallowed, since the caller is usually
 * about to delete the database row regardless and a dangling file on disk
 * is a harmless leak, not something worth failing the request over.
 */
export async function deletePhotoByKey(key: string): Promise<void> {
  const parts = key.split("/").filter(Boolean);
  if (parts.length !== 2) return;
  const [ownerUserId, filename] = parts;
  if (ownerUserId.includes("..") || filename.includes("..")) return;

  const filePath = path.join(UPLOADS_ROOT, ownerUserId, filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_ROOT))) return; // traversal guard

  try {
    await unlink(resolved);
  } catch {
    // Already gone, or some other non-fatal issue — nothing more to do.
  }
}
