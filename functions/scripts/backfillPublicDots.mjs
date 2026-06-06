import { initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const SOURCE_COLLECTION = "compass-results-v2";
const PUBLIC_DOTS_COLLECTION = "compass-public-dots-v1";
const MAX_DOCS_PER_BATCH = 250;

function readLimit() {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (!arg) return MAX_DOCS_PER_BATCH;
  const limit = Number(arg.slice("--limit=".length));
  return Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_DOCS_PER_BATCH)
    : MAX_DOCS_PER_BATCH;
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function pickPublicDot(data, submissionId) {
  const demographics = cleanObject(data.demographics);
  const segments = cleanObject(data.segments);
  const xScore = Number(data.x ?? data.x_score);
  const yScore = Number(data.y ?? data.y_score);

  return {
    submission_id: data.submission_id || submissionId,
    created_at: Number(data.created_at ?? data.ts) || Date.now(),
    ts: Number(data.ts ?? data.created_at) || Date.now(),
    x_score: Number.isFinite(xScore) ? xScore : 0,
    y_score: Number.isFinite(yScore) ? yScore : 0,
    x: Number.isFinite(xScore) ? xScore : 0,
    y: Number.isFinite(yScore) ? yScore : 0,
    archetype: typeof data.archetype === "string" ? data.archetype : "",
    demographics,
    age: typeof data.age === "string" ? data.age : demographics.age || "",
    country:
      typeof data.country === "string" ? data.country : demographics.country || "",
    industry:
      typeof data.industry === "string"
        ? data.industry
        : demographics.industry || "",
    occupation:
      typeof data.occupation === "string"
        ? data.occupation
        : demographics.occupation || "",
    notes: typeof data.notes === "string" ? data.notes : demographics.notes || "",
    segments,
    include_in_default_aggregate: data.include_in_default_aggregate === true,
    include_in_device_priority_aggregate:
      data.include_in_device_priority_aggregate === true,
    is_repeat_ip_24h: data.is_repeat_ip_24h === true,
    is_repeat_device_24h: data.is_repeat_device_24h === true,
    repeat_classification:
      typeof data.repeat_classification === "string"
        ? data.repeat_classification
        : "",
    is_dev: data.is_dev === true,
  };
}

initializeApp();

const shouldWrite = process.argv.includes("--write");
const pageLimit = readLimit();
const db = getFirestore();

let scannedCount = 0;
let projectedCount = 0;
let lastDoc = null;

for (;;) {
  let query = db
    .collection(SOURCE_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(pageLimit);
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snap = await query.get();
  if (snap.empty) break;

  const batch = db.batch();

  for (const doc of snap.docs) {
    scannedCount += 1;
    projectedCount += 1;
    if (!shouldWrite) continue;

    batch.set(
      db.collection(PUBLIC_DOTS_COLLECTION).doc(doc.id),
      pickPublicDot(doc.data(), doc.id),
      { merge: true },
    );
  }

  if (shouldWrite) {
    await batch.commit();
  }

  lastDoc = snap.docs.at(-1);
}

console.log(
  `[backfill-public-dots] scanned=${scannedCount} projected=${projectedCount} mode=${
    shouldWrite ? "write" : "dry-run"
  }`,
);

if (!shouldWrite && projectedCount > 0) {
  console.log(
    "[backfill-public-dots] Re-run with --write before deploying private read rules.",
  );
}
