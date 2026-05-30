import { randomUUID } from "node:crypto";
import { loadEnv } from "vite";
import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  initializeFirestore,
} from "firebase/firestore";

const COLLECTION_NAME = "compass-results-v2";

function requireEnvValue(env, key) {
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

async function main() {
  const mode = process.env.MODE || process.env.NODE_ENV || "development";
  const env = loadEnv(mode, process.cwd(), "");

  const firebaseConfig = {
    apiKey: requireEnvValue(env, "VITE_FIREBASE_API_KEY"),
    authDomain: requireEnvValue(env, "VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnvValue(env, "VITE_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnvValue(env, "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnvValue(env, "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnvValue(env, "VITE_FIREBASE_APP_ID"),
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "",
  };

  const app = initializeApp(firebaseConfig, `compass-results-v2-test-${Date.now()}`);
  const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  });

  const now = Date.now();
  const nonce = randomUUID();
  const testSubmission = {
    submission_id: `manual_test_${nonce}`,
    created_at: now,
    ts: now,
    quiz_version: "manual-test",
    question_schema_version: "manual-test",
    question_schema: [],
    x_score: 0,
    y_score: 0,
    x: 0,
    y: 0,
    archetype: "Manual Test",
    demographics: {
      age: "",
      country: "",
      industry: "",
      occupation: "",
      notes: "",
    },
    age: "",
    country: "",
    industry: "",
    occupation: "",
    notes: "",
    question_order: [],
    question_keys: [],
    question_values: {},
    answers: {},
    question_responses: [],
    question_medians: {},
    result_schema_version: 3,
    segments: {
      age: "__UNSPECIFIED__",
      country: "__UNSPECIFIED__",
      industry: "__UNSPECIFIED__",
    },
    is_repeat_ip_24h: false,
    is_repeat_device_24h: false,
    repeat_group_id: "",
    include_in_default_aggregate: true,
    include_in_device_priority_aggregate: true,
    repeat_classification: "manual_test",
    is_dev: true,
  };

  console.log(`[test] Writing dev test doc to ${COLLECTION_NAME}...`);
  const docRef = await addDoc(collection(db, COLLECTION_NAME), testSubmission);
  console.log(`[test] Created doc: ${docRef.id}`);

  console.log("[test] Reading doc back...");
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Created document was not found on readback.");
  }
  const data = snap.data();
  if (data?.is_dev !== true) {
    throw new Error("Readback failed validation: is_dev is not true.");
  }
  console.log("[test] Readback passed (is_dev=true).");

  console.log("[test] Deleting test doc...");
  await deleteDoc(docRef);
  console.log("[test] Cleanup complete.");
}

main().catch((error) => {
  console.error("[test] Failed:", error?.message || error);
  process.exitCode = 1;
});
