"use client";
import { useEffect, useRef, useState } from "react";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
import { formatIstDateTime } from "@/lib/time";
import { reactionEmoji } from "@/lib/teamValidation";
type Message = {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  replyTo: null | { id: string; authorName: string; body: string };
  reactions: { emoji: string; userId: string }[];
};
type ChatData = {
  messages: Message[];
  hasMore: boolean;
  userId: string;
  admin: boolean;
  muteChat: boolean;
};
export default function Chat() {
  const { data, error, loading, reload } = useTeamData<ChatData>(
    "/api/team/chat",
    5000,
  );
  const action = useAction(reload);
  const [text, setText] = useState(""),
    [reply, setReply] = useState<Message | null>(null),
    [older, setOlder] = useState<Message[]>([]),
    [more, setMore] = useState<boolean | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false),
    [olderError, setOlderError] = useState("");
  const bottom = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const lastSeen = useRef("");
  useEffect(() => {
    const last = data?.messages.at(-1);
    if (
      !last ||
      lastSeen.current === last.id ||
      document.visibilityState !== "visible"
    )
      return;
    const firstLoad = !lastSeen.current;
    lastSeen.current = last.id;
    void api("/api/team/chat", "PATCH", { lastSeenId: last.id }).catch(() => {
      lastSeen.current = "";
    });
    const box = scroll.current;
    if (box && (firstLoad || box.scrollHeight - box.scrollTop - box.clientHeight < 200))
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [data]);
  const messages = Array.from(
    new Map(
      [...older, ...(data?.messages || [])].map((m) => [m.id, m]),
    ).values(),
  ).sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  async function loadOlder() {
    if (!messages[0]) return;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const d = await api<ChatData>(`/api/team/chat?before=${messages[0].id}`);
      setOlder((prev) => [...d.messages, ...prev]);
      setMore(d.hasMore);
    } catch (e) {
      setOlderError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoadingOlder(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Team chat</h2>
          <p className="text-sm text-foreground/60">
            One group for staff and admins · updates every 5 seconds
          </p>
        </div>
        <button
          className="admin-button"
          disabled={action.busy || !data}
          onClick={() =>
            void action.run(() =>
              api("/api/team/profile", "PATCH", { muteChat: !data?.muteChat }),
            )
          }
        >
          {data?.muteChat ? "Unmute chat alerts" : "Mute chat alerts"}
        </button>
      </div>
      <ErrorNotice error={error || action.error || olderError} />
      <div className="admin-panel overflow-hidden">
        <div
          ref={scroll}
          className="h-[55vh] min-h-72 overflow-y-auto p-4 space-y-4"
          aria-label="Team messages"
        >
          {(more ?? data?.hasMore) && (
            <button
              className="admin-button w-full"
              disabled={loadingOlder}
              onClick={loadOlder}
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          )}
          {loading && !messages.length && <p>Loading messages…</p>}
          {!loading && !messages.length && (
            <p className="text-sm text-foreground/60 p-6 text-center">
              Start the conversation with your team.
            </p>
          )}
          {messages.map((m) => (
            <article
              key={m.id}
              className={`max-w-xl rounded-xl p-3 ${m.authorId === data?.userId ? "ml-auto bg-brand/5 border border-brand/15" : "bg-surface-muted"}`}
            >
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <strong>
                  {m.authorName}
                  {m.authorId === data?.userId ? " · You" : ""}
                </strong>
                <span className="text-foreground/60">
                  {formatIstDateTime(new Date(m.createdAt))}
                </span>
              </div>
              {m.replyTo && !m.deletedAt && (
                <blockquote className="border-l-2 border-brand/40 pl-2 my-2 text-xs text-foreground/60 break-words">
                  {m.replyTo.authorName}: {m.replyTo.body.slice(0, 150)}
                </blockquote>
              )}
              <p className="text-sm whitespace-pre-wrap break-words mt-2">
                {m.body}
              </p>
              {!m.deletedAt && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {reactionEmoji.map((emoji) => {
                    const rs = m.reactions.filter((r) => r.emoji === emoji);
                    return (
                      <button
                        key={emoji}
                        aria-label={`React ${emoji} to ${m.authorName}'s message`}
                        aria-pressed={rs.some((r) => r.userId === data?.userId)}
                        className={`rounded-md px-2 py-1 text-xs border ${rs.some((r) => r.userId === data?.userId) ? "border-brand bg-white" : "border-transparent hover:bg-white"}`}
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() =>
                            api(`/api/team/chat/${m.id}`, "POST", { emoji }),
                          )
                        }
                      >
                        {emoji}
                        {rs.length ? ` ${rs.length}` : ""}
                      </button>
                    );
                  })}
                  <button
                    className="text-xs text-brand underline"
                    onClick={() => setReply(m)}
                  >
                    Reply
                  </button>
                  {(data?.admin || m.authorId === data?.userId) && (
                    <button
                      disabled={action.busy}
                      className="text-xs text-danger underline ml-auto"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this message from the team chat?",
                          )
                        )
                          void action.run(async () => {
                            await api(`/api/team/chat/${m.id}`, "DELETE");
                            setOlder((old) =>
                              old.map((x) =>
                                x.id === m.id
                                  ? {
                                      ...x,
                                      body: "Message removed",
                                      deletedAt: new Date().toISOString(),
                                    }
                                  : x,
                              ),
                            );
                          });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          <div ref={bottom} />
        </div>
        <form
          className="p-4 border-t border-border space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .run(async () => {
                await api("/api/team/chat", "POST", {
                  body: text,
                  replyToId: reply?.id,
                });
                setText("");
                setReply(null);
              })
              .then((ok) => {
                if (ok) bottom.current?.scrollIntoView({ block: "nearest" });
              });
          }}
        >
          {reply && (
            <div className="text-xs flex justify-between gap-3">
              <p className="truncate">
                Reply to {reply.authorName}: {reply.body}
              </p>
              <button
                type="button"
                className="underline"
                onClick={() => setReply(null)}
              >
                Cancel reply
              </button>
            </div>
          )}
          <label className="sr-only" htmlFor="chat-message">
            Message
          </label>
          <textarea
            id="chat-message"
            className="input"
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the team…"
            required
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-foreground/55">
              {text.length}/2,000 · Text only
            </span>
            <button
              className="admin-button !bg-brand !text-white"
              disabled={action.busy || !text.trim() || !data}
            >
              {action.busy ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
