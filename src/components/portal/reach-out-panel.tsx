"use client";

import { useEffect, useId, useRef, useState } from "react";

const NAME_MAX = 80;
const MESSAGE_MAX = 2000;
const CLOSE_AFTER_SENT_MS = 2000;

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
 * The "reach us" door: a header button that opens a right-side drawer with
 * the chat-styled note form. It does not collect feedback on the work itself
 * (review links do that), so the copy stays short and the form stays two
 * fields. The drawer is a native <dialog>: focus is trapped, Escape closes.
 */
export function ReachOutPanel({ token, listId }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number | null>(null);
  const titleId = useId();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    dialogRef.current?.close();
  }

  function onClosed() {
    // Reset the thread so the next visit starts clean; keep a name they typed.
    setSent(null);
    setError(null);
  }

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
        closeTimer.current = window.setTimeout(() => {
          closeTimer.current = null;
          dialogRef.current?.close();
        }, CLOSE_AFTER_SENT_MS);
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
    <>
      <button type="button" onClick={open} className="portal-btn portal-btn-secondary">
        Send us a note
      </button>

      <dialog
        ref={dialogRef}
        className="portal-drawer"
        aria-labelledby={titleId}
        onClose={onClosed}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="portal-drawer-inner">
          <div className="portal-drawer-head">
            <h2 id={titleId} className="portal-drawer-title">
              Send us a note
            </h2>
            <button type="button" onClick={close} className="portal-btn portal-btn-quiet" aria-label="Close">
              Close
            </button>
          </div>

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
            <div className="portal-drawer-foot">
              <button type="button" onClick={() => setSent(null)} className="portal-btn portal-btn-secondary">
                Send another note
              </button>
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
                <button type="submit" disabled={busy} className="portal-btn portal-btn-primary">
                  {busy ? "Sending" : "Send"}
                </button>
                {error && (
                  <span className="portal-error" role="alert">
                    {error}
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
