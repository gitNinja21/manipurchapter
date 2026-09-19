export function shouldChime(mode: string, muted: boolean, recipientId: string, authorId: string | null, authorRole: string | null) {
  return !muted && authorId !== recipientId && mode !== "OFF" && (mode === "ALL" || authorRole === "ADMIN");
}
