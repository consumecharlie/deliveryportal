"use client";

import { useState } from "react";
import Button from "./cm-button";

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
 * The "reach us" door: a chat-styled note form. It does not collect feedback
 * on the work itself (review links do that), so the copy stays short and the
 * form stays two fields. Lives inside the SEND US A NOTE window.
 */
export function ReachOutForm({ token, listId }: Props) {
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
    <div className="portal-note">
      <div className="portal-thread">
        <div className="portal-bubble portal-bubble-them">{INTRO}</div>
        {sent && (
          <>
            <div className="portal-bubble portal-bubble-you">{sent.message}</div>
            <p className="portal-bubble-meta">From {sent.name}</p>
            <div className="portal-bubble portal-bubble-them" role="status">
              Sent. We&apos;ll get back to you shortly.
            </div>
          </>
        )}
      </div>

      {sent ? (
        <div className="portal-form-actions">
          <Button type="button" variant="secondary" size="sm" onClick={() => setSent(null)}>
            Send another note
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="portal-form" noValidate>
          <label className="portal-field">
            <span>Your name</span>
            <input
              type="text"
              name="name"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="portal-input"
            />
          </label>
          <label className="portal-field">
            <span>Message</span>
            <textarea
              name="message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={5}
              placeholder="Type your note here"
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              className="portal-input"
            />
            <span className="portal-count">
              {message.length}/{MESSAGE_MAX}
            </span>
          </label>
          <div className="portal-form-actions">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Sending" : "Send"}
            </Button>
            {error && (
              <span className="portal-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
