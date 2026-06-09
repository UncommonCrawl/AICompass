import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SOURCE_COLLECTION = "compass-results-v2";
const PUBLIC_DOTS_COLLECTION = "compass-public-dots-v1";
const PUBLIC_DOT_ARCHIVE_COLLECTION = "compass-public-dot-archive-v1";
const PUBLIC_DOT_ARCHIVE_DOC_ID = "latest";
const DEFAULT_PAGE_SIZE = 250;
const OPERATION_TIMEOUT_MS = 20_000;

function readArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function readPageSize() {
  const raw = readArgValue("--limit");
  if (!raw) return DEFAULT_PAGE_SIZE;
  const limit = Number(raw);
  return Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

function readProjectId() {
  return (
    readArgValue("--project") ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ""
  );
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function cleanString(value, maxLength = 512) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function pickPublicDemographics(source) {
  const safe = cleanObject(source);
  return {
    age: cleanString(safe.age, 64),
    country: cleanString(safe.country, 64),
    industry: cleanString(safe.industry, 128),
    occupation: cleanString(safe.occupation, 128),
    notes: cleanString(safe.notes, 512),
  };
}

function pickPublicSegments(source, demographics) {
  const safe = cleanObject(source);
  return {
    age: cleanString(safe.age, 64) || demographics.age || "__UNSPECIFIED__",
    country:
      cleanString(safe.country, 64) || demographics.country || "__UNSPECIFIED__",
    industry:
      cleanString(safe.industry, 128) ||
      demographics.industry ||
      "__UNSPECIFIED__",
  };
}

function pickPublicDot(data, submissionId) {
  const demographics = pickPublicDemographics(data.demographics);
  const segments = pickPublicSegments(data.segments, demographics);
  const xScore = Number(data.x ?? data.x_score);
  const yScore = Number(data.y ?? data.y_score);

  return {
    submission_id: cleanString(data.submission_id, 128) || submissionId,
    created_at: Number(data.created_at ?? data.ts) || Date.now(),
    ts: Number(data.ts ?? data.created_at) || Date.now(),
    x_score: Number.isFinite(xScore) ? xScore : 0,
    y_score: Number.isFinite(yScore) ? yScore : 0,
    x: Number.isFinite(xScore) ? xScore : 0,
    y: Number.isFinite(yScore) ? yScore : 0,
    archetype: cleanString(data.archetype, 128),
    demographics,
    age: cleanString(data.age, 64) || demographics.age,
    country: cleanString(data.country, 64) || demographics.country,
    industry: cleanString(data.industry, 128) || demographics.industry,
    occupation: cleanString(data.occupation, 128) || demographics.occupation,
    notes: cleanString(data.notes, 512) || demographics.notes,
    segments,
    include_in_default_aggregate: data.include_in_default_aggregate === true,
    include_in_device_priority_aggregate:
      data.include_in_device_priority_aggregate === true,
    is_repeat_ip_24h: data.is_repeat_ip_24h === true,
    is_repeat_device_24h: data.is_repeat_device_24h === true,
    repeat_classification: cleanString(data.repeat_classification, 128),
    is_dev: data.is_dev === true,
  };
}

function pickArchivePoint(publicDot, submissionId) {
  return {
    id: submissionId,
    x: publicDot.x,
    y: publicDot.y,
    ts: publicDot.ts,
  };
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

function docsMatch(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
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
          Object.entries(value).map(([key, child]) => [
            key,
            firestoreValue(child),
          ]),
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
  return {
    id: document.name.split("/").at(-1),
    name: document.name,
    data: parseFirestoreFields(document.fields || {}),
  };
}

function getFirebaseCliAccessToken() {
  const configPath = join(
    homedir(),
    ".config",
    "configstore",
    "firebase-tools.json",
  );
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const configToken = config?.tokens?.access_token;
    if (configToken) return configToken;
  } catch {
    // Fall back to the CLI below when the config file is unavailable.
  }

  const raw = execFileSync("firebase", ["login:list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(raw);
  const token =
    parsed?.tokens?.access_token || parsed?.result?.[0]?.tokens?.access_token;
  if (!token) {
    throw new Error("No Firebase CLI access token. Run `firebase login` first.");
  }
  return token;
}

async function firestoreRest(method, url, accessToken, body) {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
      `${method} ${url} failed ${response.status}: ${
        json?.error?.message || text
      }`,
    );
  }
  return json;
}

function documentsBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function documentName(projectId, collection, id) {
  return `projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
}

function documentFields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]),
  );
}

function topLevelFieldMask(currentData, nextData) {
  return [...new Set([...Object.keys(currentData || {}), ...Object.keys(nextData)])]
    .sort();
}

async function listSourcePage(projectId, accessToken, pageSize, pageToken) {
  const url = new URL(`${documentsBaseUrl(projectId)}/${SOURCE_COLLECTION}`);
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await firestoreRest("GET", url.toString(), accessToken);
  return {
    docs: (response.documents || []).map(parseFirestoreDocument).filter(Boolean),
    nextPageToken: response.nextPageToken || "",
  };
}

async function readPublicDocs(projectId, accessToken, ids) {
  if (ids.length === 0) return new Map();
  const response = await firestoreRest(
    "POST",
    `${documentsBaseUrl(projectId)}:batchGet`,
    accessToken,
    {
      documents: ids.map((id) =>
        documentName(projectId, PUBLIC_DOTS_COLLECTION, id),
      ),
    },
  );
  return new Map(
    response
      .map((entry) => parseFirestoreDocument(entry.found))
      .filter(Boolean)
      .map((doc) => [doc.id, doc]),
  );
}

async function commitWrites(projectId, accessToken, writes) {
  if (writes.length === 0) return;
  await firestoreRest(
    "POST",
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    accessToken,
    { writes },
  );
}

function publicDotWrite(projectId, id, publicDot, currentPublicDot) {
  return {
    update: {
      name: documentName(projectId, PUBLIC_DOTS_COLLECTION, id),
      fields: documentFields(publicDot),
    },
    updateMask: {
      fieldPaths: topLevelFieldMask(currentPublicDot?.data || {}, publicDot),
    },
  };
}

function archiveWrite(projectId, archivePoints) {
  return {
    update: {
      name: documentName(
        projectId,
        PUBLIC_DOT_ARCHIVE_COLLECTION,
        PUBLIC_DOT_ARCHIVE_DOC_ID,
      ),
      fields: documentFields({
        updated_at: Date.now(),
        points: archivePoints,
      }),
    },
  };
}

async function main() {
  const projectId = readProjectId();
  if (!projectId) {
    throw new Error("Missing --project=<firebase-project-id>.");
  }
  const accessToken = getFirebaseCliAccessToken();
  const shouldWrite = process.argv.includes("--write");
  const pageSize = readPageSize();

  let scannedCount = 0;
  let missingCount = 0;
  let staleCount = 0;
  let repairedCount = 0;
  let pageToken = "";
  const archivePoints = [];

  do {
    const page = await listSourcePage(projectId, accessToken, pageSize, pageToken);
    pageToken = page.nextPageToken;
    const publicDocsById = await readPublicDocs(
      projectId,
      accessToken,
      page.docs.map((doc) => doc.id),
    );
    const writes = [];

    for (const doc of page.docs) {
      scannedCount += 1;
      const publicDot = pickPublicDot(doc.data, doc.id);
      archivePoints.push(pickArchivePoint(publicDot, doc.id));
      const currentPublicDot = publicDocsById.get(doc.id);
      const isMissing = !currentPublicDot;
      const isStale =
        !isMissing && !docsMatch(currentPublicDot.data, publicDot);

      if (isMissing) missingCount += 1;
      if (isStale) staleCount += 1;
      if (!shouldWrite || (!isMissing && !isStale)) continue;

      writes.push(publicDotWrite(projectId, doc.id, publicDot, currentPublicDot));
    }

    if (shouldWrite && writes.length > 0) {
      await commitWrites(projectId, accessToken, writes);
      repairedCount += writes.length;
    }
  } while (pageToken);

  if (shouldWrite) {
    await commitWrites(projectId, accessToken, [
      archiveWrite(projectId, archivePoints),
    ]);
  }

  const summary = {
    mode: shouldWrite ? "write" : "dry-run",
    projectId,
    sourceCollection: SOURCE_COLLECTION,
    publicCollection: PUBLIC_DOTS_COLLECTION,
    archiveDocument: `${PUBLIC_DOT_ARCHIVE_COLLECTION}/${PUBLIC_DOT_ARCHIVE_DOC_ID}`,
    scanned: scannedCount,
    missing: missingCount,
    stale: staleCount,
    repaired: repairedCount,
    archivePoints: archivePoints.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite && (missingCount > 0 || staleCount > 0)) {
    console.log("[reconcile-public-dots] Re-run with --write to repair drift.");
  }
}

main().catch((error) => {
  console.error(`[reconcile-public-dots] ${error?.message || error}`);
  process.exitCode = 1;
});
