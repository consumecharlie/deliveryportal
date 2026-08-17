// Task 2a — validate the exact ClickUp field-update call WITHOUT changing the
// DELIVERABLE_TYPE field. Idempotent request (same options back), verify
// unchanged, auto-restore from backup on any mismatch. Controller-run only.
//
// v3 PUT /workspaces/{team}/fields/{uuid} 404s (v3 seems to key fields by a
// different id). v2 OPTIONS /field/{uuid} reports allow=PATCH, so we try the v2
// PATCH endpoint here.
import fs from "fs";

const g = (k) => {
  const m = fs.readFileSync(".env.local", "utf8").match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].replace(/^"|"$/g, "").trim() : "";
};
const CU = g("CLICKUP_API_TOKEN");
const FIELD = "bd34f878-d41d-416e-92c4-7d6d5b378442"; // DELIVERABLE_TYPE
const LIST = "901312119609"; // DELIVERY_SNIPPETS
const H = { Authorization: CU, "Content-Type": "application/json" };

const readOptions = async () => {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${LIST}/field`, { headers: H }).then((r) => r.json());
  const field = res.fields.find((f) => f.id === FIELD);
  return { name: field.name, type: field.type, options: field.type_config.options };
};

const { name, type, options } = await readOptions();
fs.writeFileSync("scratch-field-backup.json", JSON.stringify({ name, type, options }, null, 2));
console.log(`BACKUP written. field="${name}" type=${type} option count=${options.length}`);

const optionMap = options.map((o) => ({ id: o.id, name: o.name, color: o.color ?? null, orderindex: o.orderindex }));
// Single idempotent PATCH attempt — most likely body shape only. No looping on
// the real field. If this doesn't 2xx-and-verify, we STOP and report.
const body = { name, type_config: { options: optionMap } };
const res = await fetch(`https://api.clickup.com/api/v2/field/${FIELD}`, {
  method: "PATCH", headers: H, body: JSON.stringify(body),
});
console.log(`PATCH /api/v2/field/{id} -> ${res.status} ${(await res.text()).slice(0, 250).replace(/\n/g, " ")}`);

if (!res.ok) { console.log("PATCH not accepted. Field untouched. Stopping."); process.exit(0); }

const { options: after } = await readOptions();
const same = after.length === options.length && after.every((o, i) =>
  o.id === options[i].id && o.name === options[i].name && String(o.orderindex) === String(options[i].orderindex));
console.log(`VERIFY unchanged: ${same} | after count = ${after.length}`);

if (!same) {
  console.log("MISMATCH — restoring from backup...");
  const restore = await fetch(`https://api.clickup.com/api/v2/field/${FIELD}`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
  console.log("restore PATCH status:", restore.status);
  const { options: afterRestore } = await readOptions();
  console.log("post-restore count =", afterRestore.length);
} else {
  console.log("SUCCESS: v2 PATCH /field/{id} with { name, type_config:{ options } } is the confirmed shape.");
}
