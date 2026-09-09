"use client";

import { MacWindow, type WindowFrameProps } from "./mac-window";
import { NOTE_ID } from "./desktop-state";
import { ReachOutForm } from "./reach-out-panel";

interface Props extends WindowFrameProps {
  token: string;
  /** Present on a project page so the note reaches that project's team. */
  listId?: string;
}

/** SEND US A NOTE: the reach-out form as a window. */
export function NoteWindow({ token, listId, ...frame }: Props) {
  return (
    <MacWindow {...frame} id={NOTE_ID} title="Send us a note" canClose className="portal-window-note">
      <ReachOutForm token={token} listId={listId} />
    </MacWindow>
  );
}
