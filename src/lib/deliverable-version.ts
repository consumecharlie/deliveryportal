/**
 * What a deliverable type says about the thing being revised and where the
 * send sits in its timeline. Pure, no I/O.
 *
 * The deliverable is the thing ("Edit", "Post Script", "Storyboards"); V1, V2,
 * Master and Final are positions in its timeline, not different deliverables.
 * So "Post Script Final" is the Post Script at its final version, and a page
 * that titles it "Final Post Script" and then calls it V1 is talking nonsense.
 *
 * Two rules are worth stating out loud:
 * - "Final X" and "X Final" are the terminal version of family X (Final
 *   Graphics belongs to Graphics), EXCEPT the handoff: "Final Delivery" and
 *   "Final Deliverables" are a deliverable of their own, because that send is
 *   the package of masters, subtitle versions and SRT files rather than
 *   another cut to review.
 * - "Potential Master" is the Edit family's terminal version, the last cut
 *   before that handoff, so an Edit runs V1, V2, V3, Master.
 *
 * A trailing qualifier ("Edit V2 - Animated") says how the thing was made, not
 * which thing it is, and real projects mix the two spellings inside one
 * deliverable: CallRail's Animated Brand Video sent "Edit V1", then "Edit V2 -
 * Animated", then "Potential Master - Animated". So the qualifier is parsed
 * out and reported, but it never splits the family.
 */

/** Where a send sits in its deliverable's timeline. */
export interface DeliverableVersion {
  /** The deliverable being revised: "Edit", "Post Script AV", "Final Delivery". */
  family: string;
  /** Short position label: "V1", "V2", "MASTER", "FINAL", or "" for a type with no version. */
  tag: string;
  /** Sort position inside the family, oldest first. */
  order: number;
  /** A trailing qualifier the type carried ("Animated", "Batch"). Never part of the family. */
  qualifier: string | null;
}

/** Master sits after every numbered version; Final (and the handoff) after Master. */
const MASTER_ORDER = 900;
const FINAL_ORDER = 1000;

const FINAL_DELIVERY = /^final\s+deliver(?:y|ies|ables?)$/i;
const LEADING_FINAL = /^final\s+(.+)$/i;
const TRAILING_VERSION = /^(.*?)\s*v(\d+)(?:\s*\+.*)?$/i;
const TRAILING_MASTER = /^(.*?)\s*potential\s+masters?$/i;
const TRAILING_FINAL = /^(.*?)\s*(?:finali[sz]e|final)$/i;
/** A trailing " - Animated" style qualifier: how it was made, not which thing. */
const TRAILING_QUALIFIER = /^(.*\S)\s+-\s+([^-]+)$/;
const HAS_VERSION_MARKER = /\b(?:v\d+|final|finali[sz]e|master|masters)\b/i;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** True for the handoff package, which is its own deliverable, not a version of the Edit. */
export function isFinalDeliveryType(deliverableType: string): boolean {
  return FINAL_DELIVERY.test(splitQualifier(collapse(deliverableType)).base);
}

function splitQualifier(type: string): { base: string; qualifier: string | null } {
  const m = TRAILING_QUALIFIER.exec(type);
  if (!m) return { base: type, qualifier: null };
  const qualifier = collapse(m[2]);
  // "Edit - V2" is a version, not a qualifier; only a plain word qualifies.
  if (!qualifier || HAS_VERSION_MARKER.test(qualifier)) return { base: type, qualifier: null };
  return { base: collapse(m[1]), qualifier };
}

/**
 * The Edit family owns Potential Master, so a bare "Potential Master" is an
 * Edit and "Spinoff Potential Master" stacks with "Spinoff Edit V2".
 */
function masterFamily(head: string): string {
  if (!head) return "Edit";
  return /\bedits?\b/i.test(head) ? head : `${head} Edit`;
}

export function parseDeliverableVersion(deliverableType: string): DeliverableVersion {
  const { base, qualifier } = splitQualifier(collapse(deliverableType));
  const none = { tag: "", order: 0 };
  if (!base) return { family: "", qualifier, ...none };

  // The handoff keeps its own name; it is never a version of the Edit.
  if (FINAL_DELIVERY.test(base)) {
    return { family: "Final Delivery", tag: "FINAL", order: FINAL_ORDER, qualifier };
  }

  const version = TRAILING_VERSION.exec(base);
  if (version && version[1]) {
    const n = Number(version[2]);
    return { family: collapse(version[1]), tag: `V${n}`, order: n, qualifier };
  }

  const master = TRAILING_MASTER.exec(base);
  if (master) {
    return {
      family: masterFamily(collapse(master[1])),
      tag: "MASTER",
      order: MASTER_ORDER,
      qualifier,
    };
  }

  const leadingFinal = LEADING_FINAL.exec(base);
  if (leadingFinal) {
    return { family: collapse(leadingFinal[1]), tag: "FINAL", order: FINAL_ORDER, qualifier };
  }

  const trailingFinal = TRAILING_FINAL.exec(base);
  if (trailingFinal && trailingFinal[1]) {
    return { family: collapse(trailingFinal[1]), tag: "FINAL", order: FINAL_ORDER, qualifier };
  }

  return { family: base, qualifier, ...none };
}

/** The deliverable a type belongs to, qualifier and version stripped. */
export function deliverableFamily(deliverableType: string): string {
  return parseDeliverableVersion(deliverableType).family;
}
