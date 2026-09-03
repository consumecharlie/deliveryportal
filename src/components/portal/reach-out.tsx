"use client";

import { useState } from "react";

const NAME_MAX = 80;
const MESSAGE_MAX = 2000;

interface Props {
  token: string;
  /** Present on a project page so the note reaches that project's team. */
  listId?: string;
}

interface Sent {
  name: string;
  message: string;
}

const INTRO =
  "Have a question, need a file, or want to change something? Leave a note here and it goes straight to your project team.";

/**
 * A small chat-styled panel at the bottom of the portal. It does not collect
 * feedback on the work itself (review links do that); it is the "reach us"
 * door, so the copy stays short and the form stays two fields.
 */
export function ReachOut({ token, listId }: Props) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName) return setError("Please add your name");
    if (!trimmedMessage) return setError("Please write a message");
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, message: trimmedMessage, listId }),
      });
      if (res.ok) {
        setSent({ name: trimmedName, message: trimmedMessage });
        setMessage("");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        setError(body.error || "Please wait a bit before sending another note");
      } else if (res.status === 400 && body.error) {
        setError(body.error);
      } else {
        setError("Could not send, please try again");
      }
    } catch {
      setError("Could not send, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6" aria-labelledby="reach-out-title">
      <h2 id="reach-out-title" className="text-lg font-semibold">
        Need something? Send us a note.
      </h2>

      <div className="mt-4 flex flex-col gap-3">
        <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-3 text-sm text-neutral-800">
          {INTRO}
        </div>

        {sent && (
          <>
            <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#151919] px-4 py-3 text-sm text-white">
              {sent.message}
            </div>
            <p className="self-end text-xs text-neutral-500">
              From {sent.name}
            </p>
            <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-3 text-sm text-neutral-800" role="status">
              Sent. We&apos;ll get back to you shortly.
            </div>
          </>
        )}
      </div>

      {sent ? (
        <div className="mt-4">
          <button type="button" onClick={() => setSent(null)} className="portal-btn portal-btn-secondary">
            Send another note
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Your name</span>
            <input
              type="text"
              name="name"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-[#6ac387]/40 disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700">Message</span>
            <textarea
              name="message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={4}
              placeholder="Type your note here"
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              className="resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-[#6ac387]/40 disabled:opacity-60"
            />
            <span className="text-xs text-neutral-400">
              {message.length}/{MESSAGE_MAX}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="portal-btn portal-btn-primary">
              {busy ? "Sending" : "Send"}
            </button>
            {error && (
              <span className="text-sm text-red-700" role="alert">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
