import { describe, it, expect } from "vitest";
import { parseDeliverableVersion, isFinalDeliveryType } from "@/lib/deliverable-version";

const parse = (t: string) => parseDeliverableVersion(t);

describe("parseDeliverableVersion", () => {
  it("numbered versions belong to the family they revise", () => {
    expect(parse("Edit V1")).toMatchObject({ family: "Edit", tag: "V1", order: 1 });
    expect(parse("Edit V2")).toMatchObject({ family: "Edit", tag: "V2", order: 2 });
    expect(parse("Edit V3")).toMatchObject({ family: "Edit", tag: "V3", order: 3 });
    expect(parse("Post Script V1")).toMatchObject({ family: "Post Script", tag: "V1" });
    expect(parse("Post AV V2")).toMatchObject({ family: "Post AV", tag: "V2" });
    expect(parse("Storyboards V2")).toMatchObject({ family: "Storyboards", tag: "V2" });
    expect(parse("Caption & Title Design Presets V1")).toMatchObject({ family: "Caption & Title Design Presets", tag: "V1" });
    expect(parse("LoC Edit V1")).toMatchObject({ family: "LoC Edit", tag: "V1" });
  });

  it("an extra attached to a version is still that version", () => {
    expect(parse("AV Script V1 + Loom")).toMatchObject({ family: "AV Script", tag: "V1", order: 1 });
    expect(parse("Storyboards V1 + Loom & Animatic")).toMatchObject({ family: "Storyboards", tag: "V1" });
    expect(parse("VBP V1 + Loom")).toMatchObject({ family: "VBP", tag: "V1" });
  });

  it("Final X and X Final are the terminal version of family X", () => {
    expect(parse("Post Script Final")).toMatchObject({ family: "Post Script", tag: "FINAL", order: 1000 });
    expect(parse("AV Script Final")).toMatchObject({ family: "AV Script", tag: "FINAL" });
    expect(parse("Storyboards Final")).toMatchObject({ family: "Storyboards", tag: "FINAL" });
    expect(parse("VBP Final")).toMatchObject({ family: "VBP", tag: "FINAL" });
    expect(parse("Interview Questions Final")).toMatchObject({ family: "Interview Questions", tag: "FINAL" });
    expect(parse("Final Music Playlist")).toMatchObject({ family: "Music Playlist", tag: "FINAL" });
    expect(parse("Storyboards Finalize")).toMatchObject({ family: "Storyboards", tag: "FINAL" });
  });

  it("Potential Master is the Edit family's terminal version, before the handoff", () => {
    expect(parse("Potential Master")).toMatchObject({ family: "Edit", tag: "MASTER", order: 900 });
    expect(parse("Potential Masters")).toMatchObject({ family: "Edit", tag: "MASTER" });
    // Master sorts after every numbered version and before Final.
    expect(parse("Potential Master").order).toBeGreaterThan(parse("Edit V3").order);
    expect(parse("Potential Master").order).toBeLessThan(parse("Post Script Final").order);
    // A qualified family keeps its own Master.
    expect(parse("Spinoff Potential Master")).toMatchObject({ family: "Spinoff Edit", tag: "MASTER" });
    expect(parse("Spinoff Edit V2")).toMatchObject({ family: "Spinoff Edit", tag: "V2" });
  });

  it("Final Delivery is the handoff, a deliverable of its own", () => {
    expect(parse("Final Delivery")).toMatchObject({ family: "Final Delivery", tag: "FINAL" });
    expect(parse("Final Deliverables")).toMatchObject({ family: "Final Delivery", tag: "FINAL" });
    expect(parse("Final Deliverable")).toMatchObject({ family: "Final Delivery", tag: "FINAL" });
    expect(isFinalDeliveryType("Final Delivery")).toBe(true);
    expect(isFinalDeliveryType("Final Delivery - Batch")).toBe(true);
    expect(isFinalDeliveryType("Final Music Playlist")).toBe(false);
    expect(isFinalDeliveryType("Edit V1")).toBe(false);
    // It never folds into Edit, so it never stacks as a version of one.
    expect(parse("Final Delivery").family).not.toBe(parse("Potential Master").family);
  });

  it("a trailing qualifier says how it was made and never splits the family", () => {
    expect(parse("Edit V1 - Animated")).toMatchObject({ family: "Edit", tag: "V1", qualifier: "Animated" });
    expect(parse("Edit V2 - Animated")).toMatchObject({ family: "Edit", tag: "V2", qualifier: "Animated" });
    expect(parse("Potential Master - Animated")).toMatchObject({ family: "Edit", tag: "MASTER" });
    expect(parse("Edit V1 - Batch")).toMatchObject({ family: "Edit", tag: "V1", qualifier: "Batch" });
    expect(parse("Potential Masters - Batch")).toMatchObject({ family: "Edit", tag: "MASTER" });
    expect(parse("Final Delivery - Batch")).toMatchObject({ family: "Final Delivery", tag: "FINAL" });
    // Real projects mix the spellings inside one deliverable, so all of these
    // are one Edit, in order, however each send happened to be typed.
    const animated = ["Potential Master - Animated", "Edit V1", "Edit V2 - Animated"].map(parse);
    expect(new Set(animated.map((v) => v.family))).toEqual(new Set(["Edit"]));
    expect([...animated].sort((a, b) => a.order - b.order).map((v) => v.tag)).toEqual(["V1", "V2", "MASTER"]);
  });

  it("a type with no version marker is its own family with no tag", () => {
    expect(parse("Production Schedule")).toMatchObject({ family: "Production Schedule", tag: "", order: 0 });
    expect(parse("Voiceover Options")).toMatchObject({ family: "Voiceover Options", tag: "" });
    expect(parse("Generative Stills")).toMatchObject({ family: "Generative Stills", tag: "" });
    // And it stacks with its own numbered versions.
    expect(parse("Generative Stills V2").family).toBe(parse("Generative Stills").family);
    expect(parse("")).toMatchObject({ family: "", tag: "", order: 0 });
  });

  it("is case and whitespace tolerant", () => {
    expect(parse("  edit  v2  ")).toMatchObject({ family: "edit", tag: "V2", order: 2 });
    expect(parse("potential master")).toMatchObject({ family: "Edit", tag: "MASTER" });
    expect(parse("final delivery")).toMatchObject({ family: "Final Delivery", tag: "FINAL" });
  });
});
