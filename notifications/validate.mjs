import fs from "node:fs";

const manifestPath = "notifications/manifest.json";
const raw = fs.readFileSync(manifestPath, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("Invalid JSON:", e.message);
  process.exit(1);
}

const errors = [];

if (typeof data.schemaVersion !== "number" || data.schemaVersion < 1) {
  errors.push("schemaVersion must be a positive integer");
}
if (!Array.isArray(data.messages)) {
  errors.push("messages must be an array");
  process.exit(1);
}

const ids = new Set();
for (const [i, msg] of data.messages.entries()) {
  const p = `messages[${i}]`;
  if (!msg.id || typeof msg.id !== "string") errors.push(`${p}: id required`);
  else if (ids.has(msg.id)) errors.push(`${p}: duplicate id ${msg.id}`);
  else ids.add(msg.id);

  if (!["promo", "tip", "release"].includes(msg.type)) {
    errors.push(`${p}: invalid type`);
  }
  for (const field of ["title", "body"]) {
    const o = msg[field];
    if (!o || typeof o !== "object" || !Object.keys(o).length) {
      errors.push(`${p}: ${field} must be a non-empty locale object`);
    }
  }
  const start = Date.parse(msg.startsAt);
  const end = Date.parse(msg.endsAt);
  if (Number.isNaN(start)) errors.push(`${p}: invalid startsAt`);
  if (Number.isNaN(end)) errors.push(`${p}: invalid endsAt`);
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
    errors.push(`${p}: endsAt must be after startsAt`);
  }
  if (msg.actionUrl) {
    try {
      const u = new URL(msg.actionUrl);
      if (u.protocol !== "https:") errors.push(`${p}: actionUrl must use https`);
    } catch {
      errors.push(`${p}: invalid actionUrl`);
    }
  }
}

if (errors.length) {
  console.error("Manifest validation failed:\n" + errors.join("\n"));
  process.exit(1);
}

console.log(`OK: ${data.messages.length} message(s)`);
