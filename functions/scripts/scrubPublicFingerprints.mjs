import { initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";

const PUBLIC_COLLECTION = "compass-results-v2";
const PRIVATE_COLLECTION = "compass-submission-private-v1";
const MAX_DOCS_PER_BATCH = 250;
const FINGERPRINT_FIELDS = [
  "ip_hash",
  "device_id_hash",
  "session_id_hash",
  "user_agent_hash",
];

function readLimit() {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (!arg) return MAX_DOCS_PER_BATCH;
  const limit = Number(arg.slice("--limit=".length));
  return Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_DOCS_PER_BATCH)
    : MAX_DOCS_PER_BATCH;
}

function pickFingerprintFields(data) {
  const picked = {};
  for (const field of FINGERPRINT_FIELDS) {
    if (typeof data[field] === "string" && data[field].trim() !== "") {
      picked[field] = data[field];
    }
  }
  return picked;
}

initializeApp();

const shouldWrite = process.argv.includes("--write");
const pageLimit = readLimit();
const db = getFirestore();

let scannedCount = 0;
let scrubbedCount = 0;
let lastDoc = null;

for (;;) {
  let query = db
    .collection(PUBLIC_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(pageLimit);
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snap = await query.get();
  if (snap.empty) break;

  const batch = db.batch();
  let batchWrites = 0;

  for (const doc of snap.docs) {
    scannedCount += 1;
    const fingerprints = pickFingerprintFields(doc.data());
    if (Object.keys(fingerprints).length === 0) continue;

    scrubbedCount += 1;
    if (!shouldWrite) continue;

    const now = Date.now();
    batch.set(
      db.collection(PRIVATE_COLLECTION).doc(doc.id),
      {
        submission_id: doc.id,
        migrated_at: now,
        updated_at: now,
        ...fingerprints,
      },
      { merge: true },
    );
    batch.update(
      doc.ref,
      Object.fromEntries(
        FINGERPRINT_FIELDS.map((field) => [field, FieldValue.delete()]),
      ),
    );
    batchWrites += 2;
  }

  if (shouldWrite && batchWrites > 0) {
    await batch.commit();
  }

  lastDoc = snap.docs.at(-1);
}

console.log(
  `[scrub] scanned=${scannedCount} docs_with_public_fingerprints=${scrubbedCount} mode=${
    shouldWrite ? "write" : "dry-run"
  }`,
);

if (!shouldWrite && scrubbedCount > 0) {
  console.log(
    "[scrub] Re-run with --write to copy fingerprints private and delete them public.",
  );
}
