import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnv } from "vite";

const RESULTS_COLLECTION = "compass-results-v2";
const PRIVATE_FINGERPRINT_FIELDS = [
  "ip_hash",
  "device_id_hash",
  "session_id_hash",
  "user_agent_hash",
];
const DOT_FIELDS = [
  "x",
  "y",
  "x_score",
  "y_score",
  "age",
  "country",
  "industry",
  "occupation",
  "notes",
  "demographics",
  "answers",
  "answers_hash",
];
const DEFAULT_LIMIT = 100;
const OPERATION_TIMEOUT_MS = 15_000;

function readArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function readLimit() {
  const raw = readArgValue("--limit");
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), 500)
    : DEFAULT_LIMIT;
}

function requireEnvValue(env, key) {
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function loadFirebaseConfig() {
  const mode = process.env.MODE || process.env.NODE_ENV || "development";
  const env = loadEnv(mode, process.cwd(), "");
  return {
    env,
    firebaseConfig: {
      apiKey: requireEnvValue(env, "VITE_FIREBASE_API_KEY"),
      authDomain: requireEnvValue(env, "VITE_FIREBASE_AUTH_DOMAIN"),
      projectId: requireEnvValue(env, "VITE_FIREBASE_PROJECT_ID"),
      storageBucket: requireEnvValue(env, "VITE_FIREBASE_STORAGE_BUCKET"),
      messagingSenderId: requireEnvValue(
        env,
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
      ),
      appId: requireEnvValue(env, "VITE_FIREBASE_APP_ID"),
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "",
    },
  };
}

function validateDot(docId, data) {
  const x = Number(data?.x ?? data?.x_score);
  const y = Number(data?.y ?? data?.y_score);
  return {
    id: docId,
    dotRenderable: Number.isFinite(x) && Number.isFinite(y),
    missingDotFields: DOT_FIELDS.filter((field) => data?.[field] === undefined),
    publicFingerprintFields: PRIVATE_FINGERPRINT_FIELDS.filter(
      (field) => data?.[field] !== undefined,
    ),
  };
}

function hasValidationFailure(result) {
  return (
    !result.dotRenderable ||
    result.missingDotFields.length > 0 ||
    result.publicFingerprintFields.length > 0
  );
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, firestoreValue(child)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ("mapValue" in value) {
    return parseFirestoreFields(value.mapValue.fields || {});
  }
  return undefined;
}

function parseFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [
      key,
      parseFirestoreValue(value),
    ]),
  );
}

function parseFirestoreDocument(document) {
  if (!document?.name) return null;
  const id = document.name.split("/").at(-1);
  return {
    id,
    data: parseFirestoreFields(document.fields || {}),
  };
}

function getFirebaseCliAccessToken() {
  const raw = execFileSync("firebase", ["login:list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(raw);
  const token = parsed?.result?.[0]?.tokens?.access_token;
  if (!token) {
    throw new Error("No Firebase CLI access token. Run `firebase login` first.");
  }
  return token;
}

async function firestoreRest(method, url, accessToken, body) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed ${response.status}: ${json?.error?.message || text}`,
    );
  }
  return json;
}

function publicRestUrl(firebaseConfig, path) {
  return (
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
    `/databases/(default)/documents${path}?key=${firebaseConfig.apiKey}`
  );
}

function buildTemporaryDot(docId) {
  const now = Date.now();
  return {
    submission_id: docId,
    created_at: now,
    ts: now,
    quiz_version: "codex-live-check",
    quizVersion: "codex-live-check",
    question_schema_version: "codex-live-check",
    questionSchemaVersion: "codex-live-check",
    question_schema: [],
    x_score: 0.12,
    y_score: -0.34,
    x: 0.12,
    y: -0.34,
    archetype: "Codex Live Check",
    demographics: {
      age: "30_44",
      country: "US",
      industry: "Technology",
      occupation: "Temporary verification dot",
      notes: "Temporary live Firestore dot render check.",
    },
    age: "30_44",
    country: "US",
    industry: "Technology",
    occupation: "Temporary verification dot",
    notes: "Temporary live Firestore dot render check.",
    question_order: ["q1"],
    question_keys: ["q1"],
    question_values: { q1: 0.5 },
    answers: { q1: 0.5 },
    answers_hash: "codex-live-check-answer-hash",
    question_responses: [],
    question_medians: {},
    result_schema_version: 3,
    resultSchemaVersion: 3,
    segments: {
      age: "30_44",
      country: "US",
      industry: "Technology",
    },
    is_repeat_ip_24h: false,
    is_repeat_device_24h: false,
    repeat_group_id: "",
    include_in_default_aggregate: false,
    include_in_device_priority_aggregate: false,
    repeat_classification: "codex_live_check",
    duplicate_policy_flags: [],
    ip_submission_count_24h: 0,
    is_ip_soft_limited: false,
    is_suspicious_repeat_pattern: false,
    is_dev: true,
  };
}

async function readExistingDots(firebaseConfig, maxDocs) {
  const response = await firestoreRest(
    "POST",
    publicRestUrl(firebaseConfig, ":runQuery"),
    "",
    {
      structuredQuery: {
        from: [{ collectionId: RESULTS_COLLECTION }],
        orderBy: [{ field: { fieldPath: "ts" }, direction: "ASCENDING" }],
        limit: maxDocs,
      },
    },
  );
  return response
    .map((entry) => parseFirestoreDocument(entry.document))
    .filter(Boolean)
    .map(({ id, data }) => validateDot(id, data));
}

async function runTemporaryDotProbe(firebaseConfig) {
  const accessToken = getFirebaseCliAccessToken();
  const docId = `codex_live_dot_check_${Date.now()}_${randomUUID()}`;
  const documentUrl =
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
    `/databases/(default)/documents/${RESULTS_COLLECTION}/${docId}`;
  let created = false;

  try {
    const tempDot = buildTemporaryDot(docId);
    await firestoreRest("PATCH", documentUrl, accessToken, {
      fields: Object.fromEntries(
        Object.entries(tempDot).map(([key, value]) => [
          key,
          firestoreValue(value),
        ]),
      ),
    });
    created = true;

    const publicDocument = await firestoreRest(
      "GET",
      publicRestUrl(firebaseConfig, `/${RESULTS_COLLECTION}/${docId}`),
      "",
    );
    const parsed = parseFirestoreDocument(publicDocument);
    return {
      docId,
      publicReadExists: Boolean(parsed),
      ...validateDot(docId, parsed?.data || null),
    };
  } finally {
    if (created) {
      await firestoreRest("DELETE", documentUrl, accessToken);
    }
  }
}

async function main() {
  const shouldCreateTemporaryDot = process.argv.includes("--temp");
  const maxDocs = readLimit();
  const { firebaseConfig } = loadFirebaseConfig();

  if (shouldCreateTemporaryDot) {
    const result = await runTemporaryDotProbe(firebaseConfig);
    const ok = result.publicReadExists && !hasValidationFailure(result);
    console.log(
      JSON.stringify(
        {
          mode: "temporary-dot",
          projectId: firebaseConfig.projectId,
          ok,
          cleanup: "deleted",
          result,
        },
        null,
        2,
      ),
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  const results = await readExistingDots(firebaseConfig, maxDocs);
  const failures = results.filter(hasValidationFailure);
  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        projectId: firebaseConfig.projectId,
        checked: results.length,
        ok: failures.length === 0,
        failures: failures.slice(0, 20),
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[check:dots] ${error?.message || error}`);
  process.exitCode = 1;
});
