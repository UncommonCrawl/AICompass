import { createHmac, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const db = getFirestore();
const HASH_SECRET = defineSecret("COMPASS_HASH_SECRET");
const SUBMISSIONS_COLLECTION = "compass-results-v2";
const PUBLIC_DOTS_COLLECTION = "compass-public-dots-v1";
const PUBLIC_DOT_ARCHIVE_COLLECTION = "compass-public-dot-archive-v1";
const PUBLIC_DOT_ARCHIVE_DOC_ID = "latest";
const SUBMISSION_PRIVATE_COLLECTION = "compass-submission-private-v1";
const REPEAT_SIGNALS_COLLECTION = "compass-repeat-signals-v1";
const METRICS_COLLECTION = "compass-metrics-v1";
const QUESTION_AVERAGES_DOC_ID = "question-averages-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const RESUBMIT_LOCK_WINDOW_MS = DAY_MS;
const IP_SOFT_WINDOW_MS = DAY_MS;
const IP_SOFT_ALLOW_COUNT = 3;
const IP_HARD_WINDOW_MS = 10 * 60 * 1000;
const IP_HARD_BLOCK_COUNT = 20;
const SUSPICIOUS_PATTERN_WINDOW_MS = 10 * 60 * 1000;
const SIGNAL_HISTORY_LIMIT = 120;
const SHARE_PAGE_URL = "https://theaicompass.io/";
const SHARE_TITLE = "The AI Compass: State Your Stance";
const SHARE_DESCRIPTION_FALLBACK = "Where do you stand on AI?";
const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 630;
const SHARE_IMAGE_BACKGROUND = { r: 255, g: 255, b: 255, a: 255 };
const SHARE_IMAGE_LINE = { r: 184, g: 184, b: 184, a: 255 };
const SHARE_IMAGE_MARKER = { r: 0, g: 0, b: 0, a: 255 };
const SHARE_IMAGE_INSET_X = 66;
const SHARE_IMAGE_INSET_Y = 58;
const SHARE_IMAGE_MARKER_SIZE = 28;

function hashValue(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function clampShareScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}

function getShareDescription(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return SHARE_DESCRIPTION_FALLBACK;
  }
  const progress =
    y >= 0 ? "Convinced of Progress" : "Unconvinced of Progress";
  const acceleration =
    x >= 0 ? "Supportive of Acceleration" : "Critical of Acceleration";
  return `I'm ${progress}, ${acceleration}. Where do you stand?`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readShareScores(req) {
  const rawX = Number(req.query.x);
  const rawY = Number(req.query.y);
  return {
    rawX,
    rawY,
    x: clampShareScore(rawX),
    y: clampShareScore(rawY),
    valid: Number.isFinite(rawX) && Number.isFinite(rawY),
  };
}

function getSiblingFunctionUrl(req, functionName) {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("host") || "";
  if (!host) return "";
  const origin = `${protocol}://${host}`;
  const requestPath = (req.originalUrl || req.url || "").split("?")[0];
  if (/^\/shareCompassResult/i.test(requestPath)) {
    return `${origin}${requestPath.replace(/^\/shareCompassResult/i, `/${functionName}`)}`;
  }
  if (/^sharecompassresult/i.test(host)) {
    return `${protocol}://${host.replace(/^sharecompassresult/i, functionName.toLowerCase())}`;
  }
  return `${origin}/${functionName}`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function setPngPixel(pixels, x, y, color) {
  if (
    x < 0 ||
    x >= SHARE_IMAGE_WIDTH ||
    y < 0 ||
    y >= SHARE_IMAGE_HEIGHT
  ) {
    return;
  }
  const index = (y * SHARE_IMAGE_WIDTH + x) * 4;
  pixels[index] = color.r;
  pixels[index + 1] = color.g;
  pixels[index + 2] = color.b;
  pixels[index + 3] = color.a;
}

function fillPngRect(pixels, x, y, width, height, color) {
  const startX = Math.max(0, Math.round(x));
  const startY = Math.max(0, Math.round(y));
  const endX = Math.min(SHARE_IMAGE_WIDTH, Math.round(x + width));
  const endY = Math.min(SHARE_IMAGE_HEIGHT, Math.round(y + height));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPngPixel(pixels, px, py, color);
    }
  }
}

function createSharePreviewPng(x, y) {
  const pixels = Buffer.alloc(
    SHARE_IMAGE_WIDTH * SHARE_IMAGE_HEIGHT * 4,
    255,
  );
  const plotWidth = SHARE_IMAGE_WIDTH - SHARE_IMAGE_INSET_X * 2;
  const plotHeight = SHARE_IMAGE_HEIGHT - SHARE_IMAGE_INSET_Y * 2;
  const centerX = SHARE_IMAGE_INSET_X + plotWidth / 2;
  const centerY = SHARE_IMAGE_INSET_Y + plotHeight / 2;
  const clampedX = clampShareScore(x);
  const clampedY = clampShareScore(y);
  const markerX =
    centerX + clampedX * (plotWidth / 2) - SHARE_IMAGE_MARKER_SIZE / 2;
  const markerY =
    centerY - clampedY * (plotHeight / 2) - SHARE_IMAGE_MARKER_SIZE / 2;

  fillPngRect(
    pixels,
    0,
    0,
    SHARE_IMAGE_WIDTH,
    SHARE_IMAGE_HEIGHT,
    SHARE_IMAGE_BACKGROUND,
  );
  fillPngRect(
    pixels,
    SHARE_IMAGE_INSET_X,
    SHARE_IMAGE_INSET_Y,
    plotWidth,
    2,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    SHARE_IMAGE_INSET_X,
    SHARE_IMAGE_INSET_Y + plotHeight - 2,
    plotWidth,
    2,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    SHARE_IMAGE_INSET_X,
    SHARE_IMAGE_INSET_Y,
    2,
    plotHeight,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    SHARE_IMAGE_INSET_X + plotWidth - 2,
    SHARE_IMAGE_INSET_Y,
    2,
    plotHeight,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    centerX - 1,
    SHARE_IMAGE_INSET_Y,
    2,
    plotHeight,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    SHARE_IMAGE_INSET_X,
    centerY - 1,
    plotWidth,
    2,
    SHARE_IMAGE_LINE,
  );
  fillPngRect(
    pixels,
    markerX,
    markerY,
    SHARE_IMAGE_MARKER_SIZE,
    SHARE_IMAGE_MARKER_SIZE,
    SHARE_IMAGE_MARKER,
  );

  const rawRows = Buffer.alloc(
    (SHARE_IMAGE_WIDTH * 4 + 1) * SHARE_IMAGE_HEIGHT,
  );
  for (let row = 0; row < SHARE_IMAGE_HEIGHT; row += 1) {
    const sourceStart = row * SHARE_IMAGE_WIDTH * 4;
    const targetStart = row * (SHARE_IMAGE_WIDTH * 4 + 1);
    rawRows[targetStart] = 0;
    pixels.copy(
      rawRows,
      targetStart + 1,
      sourceStart,
      sourceStart + SHARE_IMAGE_WIDTH * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SHARE_IMAGE_WIDTH, 0);
  ihdr.writeUInt32BE(SHARE_IMAGE_HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(rawRows)),
    createPngChunk("IEND"),
  ]);
}

function getClientIp(req) {
  const forwarded = req.get("x-forwarded-for");
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    return forwarded.split(",")[0].trim();
  }
  const appEngineIp = req.get("x-appengine-user-ip");
  if (typeof appEngineIp === "string" && appEngineIp.trim() !== "") {
    return appEngineIp.trim();
  }
  return typeof req.ip === "string" ? req.ip : "";
}

function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (globalThis.Buffer?.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    try {
      return JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

function cleanString(value, maxLength = 2048) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function cleanAnswersMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = [];
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = cleanString(rawKey, 64);
    if (!key) continue;
    if (typeof rawVal !== "number" || Number.isNaN(rawVal)) continue;
    entries.push([key, Number(rawVal.toFixed(2))]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function cleanQuestionIdToKeyMap(questionOrder, questionKeys) {
  if (!Array.isArray(questionOrder) || !Array.isArray(questionKeys)) return {};
  const map = {};
  const total = Math.min(questionOrder.length, questionKeys.length);
  for (let i = 0; i < total; i += 1) {
    const id = cleanString(questionOrder[i], 64);
    const key = cleanString(questionKeys[i], 64);
    if (!id || !key) continue;
    map[id] = key;
  }
  return map;
}

function cleanQuestionSchema(value) {
  if (!Array.isArray(value)) return [];
  const schema = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = cleanString(entry.id, 64);
    const answerKey = cleanString(entry.answerKey || entry.questionKey, 64);
    if (!id || !answerKey) continue;
    schema.push({
      id,
      answerKey,
      axis: cleanString(entry.axis, 8),
      direction: cleanNumber(entry.direction),
      label: cleanString(entry.label, 128),
      text: cleanString(entry.text, 512),
    });
  }
  return schema;
}

function cleanQuestionIdToKeyMapFromSchema(questionSchema) {
  if (!Array.isArray(questionSchema)) return {};
  const map = {};
  for (const entry of questionSchema) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = cleanString(entry.id, 64);
    const key = cleanString(entry.answerKey || entry.questionKey, 64);
    if (!id || !key) continue;
    map[id] = key;
  }
  return map;
}

function cleanQuestionIdToKeyMapFromResponses(questionResponses) {
  if (!Array.isArray(questionResponses)) return {};
  const map = {};
  for (const response of questionResponses) {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      continue;
    }
    const id = cleanString(response.questionId, 64);
    const key = cleanString(response.questionKey, 64);
    if (!id || !key) continue;
    map[id] = key;
  }
  return map;
}

function cleanQuestionEntries(payload) {
  const valuesById = cleanAnswersMap(payload?.question_values);
  const idToKey = {
    ...cleanQuestionIdToKeyMapFromResponses(payload?.question_responses),
    ...cleanQuestionIdToKeyMap(
      payload?.question_order,
      payload?.question_keys,
    ),
    ...cleanQuestionIdToKeyMapFromSchema(payload?.question_schema),
  };
  return Object.entries(valuesById).map(([questionId, value]) => ({
    questionId,
    questionKey: idToKey[questionId] || questionId,
    value,
  }));
}

function readMetricGroup(source) {
  return source && typeof source === "object" && !Array.isArray(source)
    ? source
    : {};
}

function readMetricEntry(source) {
  const safe = source && typeof source === "object" ? source : {};
  return {
    sum_total: cleanNumber(safe.sum_total),
    count_total: cleanNumber(safe.count_total),
    avg_total: cleanNumber(safe.avg_total),
    sum_default: cleanNumber(safe.sum_default),
    count_default: cleanNumber(safe.count_default),
    avg_default: cleanNumber(safe.avg_default),
    updated_at: cleanNumber(safe.updated_at),
    question_id: cleanString(safe.question_id, 64),
    question_key: cleanString(safe.question_key, 64),
  };
}

function upsertQuestionMetricEntry(
  existingEntry,
  { value, now, includeInDefaultAggregate, questionId, questionKey },
) {
  const prev = readMetricEntry(existingEntry);
  const sumTotal = Number((prev.sum_total + value).toFixed(4));
  const countTotal = prev.count_total + 1;
  const avgTotal = Number((sumTotal / countTotal).toFixed(4));

  const sumDefault = includeInDefaultAggregate
    ? Number((prev.sum_default + value).toFixed(4))
    : prev.sum_default;
  const countDefault = includeInDefaultAggregate
    ? prev.count_default + 1
    : prev.count_default;
  const avgDefault =
    countDefault > 0 ? Number((sumDefault / countDefault).toFixed(4)) : 0;

  return {
    question_id: questionId,
    question_key: questionKey,
    sum_total: sumTotal,
    count_total: countTotal,
    avg_total: avgTotal,
    sum_default: sumDefault,
    count_default: countDefault,
    avg_default: avgDefault,
    updated_at: now,
  };
}

function applyQuestionMetricDelta(
  existingEntry,
  {
    totalValueDelta = 0,
    totalCountDelta = 0,
    defaultValueDelta = 0,
    defaultCountDelta = 0,
    now,
    questionId,
    questionKey,
  },
) {
  const prev = readMetricEntry(existingEntry);
  const rawCountTotal = prev.count_total + totalCountDelta;
  const rawCountDefault = prev.count_default + defaultCountDelta;
  const countTotal = Math.max(0, rawCountTotal);
  const countDefault = Math.max(0, rawCountDefault);
  const sumTotal = countTotal > 0
    ? Number((prev.sum_total + totalValueDelta).toFixed(4))
    : 0;
  const sumDefault = countDefault > 0
    ? Number((prev.sum_default + defaultValueDelta).toFixed(4))
    : 0;
  const avgTotal = countTotal > 0 ? Number((sumTotal / countTotal).toFixed(4)) : 0;
  const avgDefault = countDefault > 0
    ? Number((sumDefault / countDefault).toFixed(4))
    : 0;

  return {
    question_id: questionId || prev.question_id,
    question_key: questionKey || prev.question_key,
    sum_total: sumTotal,
    count_total: countTotal,
    avg_total: avgTotal,
    sum_default: sumDefault,
    count_default: countDefault,
    avg_default: avgDefault,
    updated_at: now,
  };
}

function cleanDemographics(demo) {
  const source = demo && typeof demo === "object" ? demo : {};
  return {
    age: cleanString(source.age, 64),
    country: cleanString(source.country, 64),
    industry: cleanString(source.industry, 128),
    occupation: cleanString(source.occupation, 128),
    notes: cleanString(source.notes, 512),
  };
}

function cleanPublicSegments(source, demographics) {
  const safe = source && typeof source === "object" ? source : {};
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

function readRecentSubmissionTimestamps(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

function readRecentSignatureEntries(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const at = Number(rawEntry.at);
    const answersHash = cleanString(rawEntry.answers_hash, 128);
    const demographicsHash = cleanString(rawEntry.demographics_hash, 128);
    if (!Number.isFinite(at) || at <= 0) continue;
    if (!answersHash || !demographicsHash) continue;
    entries.push({
      at,
      answers_hash: answersHash,
      demographics_hash: demographicsHash,
    });
  }
  return entries;
}

export const shareCompassImage = onRequest(
  {
    cors: true,
  },
  (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).send("Method not allowed.");
      return;
    }

    const scores = readShareScores(req);
    const png = createSharePreviewPng(scores.x, scores.y);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Content-Type", "image/png");
    if (req.method === "HEAD") {
      res.status(200).send("");
      return;
    }
    res.status(200).send(png);
  },
);

export const shareCompassResult = onRequest(
  {
    cors: true,
  },
  (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).send("Method not allowed.");
      return;
    }

    const scores = readShareScores(req);
    const imageUrl = new URL(getSiblingFunctionUrl(req, "shareCompassImage"));
    imageUrl.searchParams.set("x", scores.x.toFixed(4));
    imageUrl.searchParams.set("y", scores.y.toFixed(4));

    const pageUrl = new URL(SHARE_PAGE_URL);
    if (scores.valid) {
      pageUrl.searchParams.set("x", scores.x.toFixed(4));
      pageUrl.searchParams.set("y", scores.y.toFixed(4));
    }

    const description = getShareDescription(scores.rawX, scores.rawY);
    const safeTitle = escapeHtml(SHARE_TITLE);
    const safeDescription = escapeHtml(description);
    const safePageUrl = escapeHtml(pageUrl.toString());
    const safeImageUrl = escapeHtml(imageUrl.toString());

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safePageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${safePageUrl}" />
    <meta property="og:site_name" content="AI Compass" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeImageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${SHARE_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${SHARE_IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="A minimalist AI Compass result preview with one black marker on the compass." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${safePageUrl}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImageUrl}" />
    <meta name="twitter:image:alt" content="A minimalist AI Compass result preview with one black marker on the compass." />
    <meta http-equiv="refresh" content="0; url=${safePageUrl}" />
    <script>window.location.replace(${JSON.stringify(pageUrl.toString())});</script>
  </head>
  <body>
    <a href="${safePageUrl}">Continue to The AI Compass</a>
  </body>
</html>`;

    res.set("Cache-Control", "public, max-age=86400");
    res.set("Content-Type", "text/html; charset=utf-8");
    if (req.method === "HEAD") {
      res.status(200).send("");
      return;
    }
    res.status(200).send(html);
  },
);

export const submitCompassResult = onRequest(
  {
    cors: true,
    secrets: [HASH_SECRET],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const payload = readBody(req);
    const now = Date.now();
    const cutoff = now - DAY_MS;
    const secret = HASH_SECRET.value();
    const quizVersion = cleanString(payload.quiz_version, 32);
    const questionSchemaVersion = cleanString(
      payload.question_schema_version,
      128,
    );
    const questionSchema = cleanQuestionSchema(payload.question_schema);
    // Dev controls intentionally self-designate test entries so local/dev UI can
    // create removable samples without tripping repeat or aggregate guardrails.
    const isDevSubmission = payload.is_dev === true;

    const deviceUuid = cleanString(payload.device_uuid, 256);
    const sessionUuid = cleanString(payload.session_uuid, 256);
    const submittedUserAgent = cleanString(payload.user_agent, 1024);
    const requestUserAgent = cleanString(req.get("user-agent"), 1024);
    const userAgent = submittedUserAgent || requestUserAgent;
    const source = cleanString(payload.source, 256) || "direct";
    const referrer = cleanString(payload.referrer, 2048);
    const ip = cleanString(getClientIp(req), 128);

    const ipHash = ip ? hashValue(secret, `ip:${ip}`) : "";
    const deviceIdHash = deviceUuid
      ? hashValue(secret, `device:${deviceUuid}`)
      : "";
    const sessionIdHash = sessionUuid
      ? hashValue(secret, `session:${sessionUuid}`)
      : "";
    const userAgentHash = userAgent
      ? hashValue(secret, `ua:${userAgent}`)
      : "";

    const demographics = cleanDemographics(payload.demographics);
    const answers = cleanAnswersMap(
      payload.answers && typeof payload.answers === "object"
        ? payload.answers
        : payload.question_values,
    );
    const questionEntries = cleanQuestionEntries(payload);
    const answersHash = hashValue(secret, `answers:${JSON.stringify(answers)}`);
    const demographicsHash = hashValue(
      secret,
      `demographics:${JSON.stringify({
        age: demographics.age,
        country: demographics.country,
        industry: demographics.industry,
        occupation: demographics.occupation,
      })}`,
    );
    const segments = cleanPublicSegments(payload.segments, demographics);

    const fallbackSubmissionId = `sub_${randomUUID()}`;
    const ipSignalRef = ipHash
      ? db.collection(REPEAT_SIGNALS_COLLECTION).doc(`ip_${ipHash}`)
      : null;
    const deviceSignalRef = deviceIdHash
      ? db.collection(REPEAT_SIGNALS_COLLECTION).doc(`device_${deviceIdHash}`)
      : null;
    const questionAveragesRef = db
      .collection(METRICS_COLLECTION)
      .doc(QUESTION_AVERAGES_DOC_ID);

    let savedSubmission = null;

    try {
      await db.runTransaction(async (txn) => {
        const ipSignalSnap = ipSignalRef ? await txn.get(ipSignalRef) : null;
        const deviceSignalSnap = deviceSignalRef
          ? await txn.get(deviceSignalRef)
          : null;

        const ipSignal = ipSignalSnap?.exists ? ipSignalSnap.data() : null;
        const deviceSignal = deviceSignalSnap?.exists
          ? deviceSignalSnap.data()
          : null;
        const questionAveragesSnap = await txn.get(questionAveragesRef);
        const questionAverages = questionAveragesSnap?.exists
          ? questionAveragesSnap.data()
          : null;

        const lockedAnswersHash = cleanString(
          deviceSignal?.locked_answers_hash,
          128,
        );
        const lockedQuizVersion = cleanString(
          deviceSignal?.locked_quiz_version,
          32,
        );
        const sameQuizVersion =
          lockedQuizVersion !== "" &&
          quizVersion !== "" &&
          lockedQuizVersion === quizVersion;
        const ipLast = typeof ipSignal?.last_submission_at === "number"
          ? ipSignal.last_submission_at
          : 0;
        const deviceLast = typeof deviceSignal?.last_submission_at === "number"
          ? deviceSignal.last_submission_at
          : 0;
        const lockWindowExpiresAt =
          deviceLast > 0 ? deviceLast + RESUBMIT_LOCK_WINDOW_MS : 0;
        const isLockWindowActive = lockWindowExpiresAt > now;
        if (
          !isDevSubmission &&
          sameQuizVersion &&
          lockedAnswersHash &&
          lockedAnswersHash !== answersHash &&
          isLockWindowActive
        ) {
          const error = new Error("Answers are locked for this device.");
          error.code = "answers_locked";
          error.retryAfterMs = Math.max(0, lockWindowExpiresAt - now);
          error.retryAt = lockWindowExpiresAt;
          throw error;
        }

        const isRepeatIp24h = ipLast >= cutoff;
        const isRepeatDevice24h = deviceLast >= cutoff;
        const recentIpSubmissionTimestamps = readRecentSubmissionTimestamps(
          ipSignal?.recent_submission_timestamps,
        );
        const ipSoftWindowCutoff = now - IP_SOFT_WINDOW_MS;
        const ipHardWindowCutoff = now - IP_HARD_WINDOW_MS;
        const recentIpSubmissionsInSoftWindow = recentIpSubmissionTimestamps
          .filter((timestamp) => timestamp >= ipSoftWindowCutoff)
          .sort((a, b) => a - b);
        const recentIpSubmissionsInHardWindow = recentIpSubmissionsInSoftWindow
          .filter((timestamp) => timestamp >= ipHardWindowCutoff)
          .sort((a, b) => a - b);
        if (
          !isDevSubmission &&
          recentIpSubmissionsInHardWindow.length >= IP_HARD_BLOCK_COUNT
        ) {
          const earliestHardWindowTimestamp = recentIpSubmissionsInHardWindow[0];
          const retryAt = earliestHardWindowTimestamp + IP_HARD_WINDOW_MS;
          const error = new Error(
            "Too many submissions from this network. Please try again later.",
          );
          error.code = "ip_rate_limited";
          error.retryAfterMs = Math.max(0, retryAt - now);
          error.retryAt = retryAt;
          throw error;
        }
        const recentSignatureEntries = readRecentSignatureEntries(
          ipSignal?.recent_submission_signatures,
        );
        const recentSignatureEntriesInSoftWindow = recentSignatureEntries.filter(
          (entry) => entry.at >= ipSoftWindowCutoff,
        );
        const recentSignatureEntriesInSuspiciousWindow =
          recentSignatureEntries.filter(
            (entry) => entry.at >= now - SUSPICIOUS_PATTERN_WINDOW_MS,
          );
        const isIpSoftLimited =
          !isDevSubmission &&
          ipHash !== "" &&
          recentIpSubmissionsInSoftWindow.length >= IP_SOFT_ALLOW_COUNT;
        const hasRapidDuplicatePattern = !isDevSubmission &&
          recentSignatureEntriesInSuspiciousWindow.some(
            (entry) =>
              entry.answers_hash === answersHash &&
              entry.demographics_hash === demographicsHash,
          );
        const excludedByDuplicatePolicy =
          isRepeatDevice24h || isIpSoftLimited || hasRapidDuplicatePattern;
        const includeInDefaultAggregate = !excludedByDuplicatePolicy;
        const includeInDevicePriorityAggregate = !excludedByDuplicatePolicy;
        const repeatClassification = isDevSubmission
          ? "dev_submission"
          : hasRapidDuplicatePattern
          ? "duplicate_pattern_rapid"
          : isRepeatDevice24h
            ? "repeat_device_24h"
            : isIpSoftLimited
              ? "repeat_ip_rate_limited"
              : isRepeatIp24h
                ? "repeat_ip_24h_only"
                : "first_or_stale";
        const duplicatePolicyFlags = [
          isRepeatDevice24h ? "repeat_device_24h" : "",
          isIpSoftLimited ? "ip_soft_limit_exceeded" : "",
          hasRapidDuplicatePattern ? "rapid_duplicate_pattern" : "",
        ].filter(Boolean);
        const nextRecentIpSubmissionTimestamps = [
          ...recentIpSubmissionsInSoftWindow,
          now,
        ].slice(-SIGNAL_HISTORY_LIMIT);
        const nextRecentSignatureEntries = [
          ...recentSignatureEntriesInSoftWindow,
          {
            at: now,
            answers_hash: answersHash,
            demographics_hash: demographicsHash,
          },
        ].slice(-SIGNAL_HISTORY_LIMIT);
        const repeatGroupId = isRepeatIp24h || isRepeatDevice24h
          ? cleanString(
              ipSignal?.repeat_group_id || deviceSignal?.repeat_group_id || "",
              96,
            ) || `rg_${randomUUID()}`
          : "";
        const previousSubmissionIdRaw = cleanString(
          deviceSignal?.latest_submission_id || deviceSignal?.submission_id,
          128,
        );
        const previousSubmissionId =
          previousSubmissionIdRaw.startsWith("sub_") &&
          !previousSubmissionIdRaw.includes("/")
            ? previousSubmissionIdRaw
            : "";
        const submissionId = isDevSubmission
          ? fallbackSubmissionId
          : previousSubmissionId || fallbackSubmissionId;
        const submissionRef = db.collection(SUBMISSIONS_COLLECTION).doc(submissionId);
        const privateSubmissionRef = db
          .collection(SUBMISSION_PRIVATE_COLLECTION)
          .doc(submissionId);
        const archiveRef = db
          .collection(PUBLIC_DOT_ARCHIVE_COLLECTION)
          .doc(PUBLIC_DOT_ARCHIVE_DOC_ID);
        const previousSubmissionSnap = !isDevSubmission && previousSubmissionId
          ? await txn.get(submissionRef)
          : null;
        const archiveSnap = await txn.get(archiveRef);
        const previousSubmission =
          previousSubmissionSnap?.exists ? previousSubmissionSnap.data() : null;
        const previousIncludedInDefaultAggregate =
          previousSubmission?.include_in_default_aggregate === true;

        const xScore = cleanNumber(payload.x_score);
        const yScore = cleanNumber(payload.y_score);
        const submissionDoc = {
          submission_id: submissionId,
          created_at: now,
          ts: now,
          quiz_version: quizVersion,
          quizVersion: quizVersion,
          question_schema_version: questionSchemaVersion,
          questionSchemaVersion: questionSchemaVersion,
          question_schema: questionSchema,
          x_score: xScore,
          y_score: yScore,
          x: xScore,
          y: yScore,
          archetype: cleanString(payload.archetype, 128),
          source,
          referrer,
          demographics,
          age: demographics.age,
          country: demographics.country,
          industry: demographics.industry,
          occupation: demographics.occupation,
          notes: demographics.notes,
          question_order: Array.isArray(payload.question_order)
            ? payload.question_order
            : [],
          question_keys: Array.isArray(payload.question_keys)
            ? payload.question_keys
            : [],
          question_values:
            payload.question_values && typeof payload.question_values === "object"
              ? payload.question_values
              : {},
          answers,
          answers_hash: answersHash,
          question_responses: Array.isArray(payload.question_responses)
            ? payload.question_responses
            : [],
          question_medians:
            payload.question_medians &&
            typeof payload.question_medians === "object"
              ? payload.question_medians
              : {},
          result_schema_version: Number(payload.result_schema_version) || 3,
          resultSchemaVersion: Number(payload.result_schema_version) || 3,
          segments,
          is_repeat_ip_24h: isRepeatIp24h,
          is_repeat_device_24h: isRepeatDevice24h,
          repeat_group_id: repeatGroupId,
          include_in_default_aggregate: includeInDefaultAggregate,
          include_in_device_priority_aggregate: includeInDevicePriorityAggregate,
          repeat_classification: repeatClassification,
          duplicate_policy_flags: duplicatePolicyFlags,
          ip_submission_count_24h: recentIpSubmissionsInSoftWindow.length + 1,
          is_ip_soft_limited: isIpSoftLimited,
          is_suspicious_repeat_pattern: hasRapidDuplicatePattern,
          is_dev: isDevSubmission,
        };
        const privateSubmissionDoc = {
          submission_id: submissionId,
          created_at: now,
          updated_at: now,
          quiz_version: quizVersion,
          ip_hash: ipHash,
          device_id_hash: deviceIdHash,
          session_id_hash: sessionIdHash,
          user_agent_hash: userAgentHash,
          is_dev: isDevSubmission,
        };
        const publicDotDoc = {
          submission_id: submissionId,
          created_at: now,
          ts: now,
          x_score: xScore,
          y_score: yScore,
          x: xScore,
          y: yScore,
          archetype: submissionDoc.archetype,
          demographics,
          age: demographics.age,
          country: demographics.country,
          industry: demographics.industry,
          occupation: demographics.occupation,
          notes: demographics.notes,
          segments,
          include_in_default_aggregate: includeInDefaultAggregate,
          include_in_device_priority_aggregate: includeInDevicePriorityAggregate,
          is_repeat_ip_24h: isRepeatIp24h,
          is_repeat_device_24h: isRepeatDevice24h,
          repeat_classification: repeatClassification,
          is_dev: isDevSubmission,
        };
        const archivePoint = {
          id: submissionId,
          x: xScore,
          y: yScore,
          ts: now,
          is_dev: isDevSubmission,
        };

        txn.set(submissionRef, submissionDoc);
        txn.set(
          db.collection(PUBLIC_DOTS_COLLECTION).doc(submissionId),
          publicDotDoc,
        );
        txn.set(
          db
            .collection(PUBLIC_DOT_ARCHIVE_COLLECTION)
            .doc(PUBLIC_DOT_ARCHIVE_DOC_ID),
          {
            updated_at: now,
            points: [
              ...(Array.isArray(archiveSnap.data()?.points)
                ? archiveSnap
                    .data()
                    .points.filter((point) => point?.id !== submissionId)
                : []),
              archivePoint,
            ],
          },
          { merge: true },
        );
        txn.set(privateSubmissionRef, privateSubmissionDoc);

        if (ipSignalRef && !isDevSubmission) {
          txn.set(
            ipSignalRef,
            {
              signal_type: "ip",
              hash: ipHash,
              last_submission_at: now,
              repeat_group_id: repeatGroupId,
              recent_submission_timestamps: nextRecentIpSubmissionTimestamps,
              recent_submission_signatures: nextRecentSignatureEntries,
              updated_at: now,
            },
            { merge: true },
          );
        }

        if (deviceSignalRef && !isDevSubmission) {
          txn.set(
            deviceSignalRef,
            {
              signal_type: "device",
              hash: deviceIdHash,
              last_submission_at: now,
              repeat_group_id: repeatGroupId,
              locked_answers_hash: answersHash,
              locked_quiz_version: quizVersion || lockedQuizVersion,
              latest_submission_id: submissionId,
              updated_at: now,
            },
            { merge: true },
          );
        }

        const metricsById = {
          ...readMetricGroup(questionAverages?.questions_by_id),
        };
        const metricsByKey = {
          ...readMetricGroup(questionAverages?.questions_by_key),
        };
        const previousQuestionEntries = previousSubmission
          ? cleanQuestionEntries(previousSubmission)
          : [];
        for (const entry of previousQuestionEntries) {
          metricsById[entry.questionId] = applyQuestionMetricDelta(
            metricsById[entry.questionId],
            {
              totalValueDelta: -entry.value,
              totalCountDelta: -1,
              defaultValueDelta: previousIncludedInDefaultAggregate
                ? -entry.value
                : 0,
              defaultCountDelta: previousIncludedInDefaultAggregate ? -1 : 0,
              now,
              questionId: entry.questionId,
              questionKey: entry.questionKey,
            },
          );
          metricsByKey[entry.questionKey] = applyQuestionMetricDelta(
            metricsByKey[entry.questionKey],
            {
              totalValueDelta: -entry.value,
              totalCountDelta: -1,
              defaultValueDelta: previousIncludedInDefaultAggregate
                ? -entry.value
                : 0,
              defaultCountDelta: previousIncludedInDefaultAggregate ? -1 : 0,
              now,
              questionId: entry.questionId,
              questionKey: entry.questionKey,
            },
          );
        }
        for (const entry of questionEntries) {
          metricsById[entry.questionId] = upsertQuestionMetricEntry(
            metricsById[entry.questionId],
            {
              value: entry.value,
              now,
              includeInDefaultAggregate,
              questionId: entry.questionId,
              questionKey: entry.questionKey,
            },
          );
          metricsByKey[entry.questionKey] = upsertQuestionMetricEntry(
            metricsByKey[entry.questionKey],
            {
              value: entry.value,
              now,
              includeInDefaultAggregate,
              questionId: entry.questionId,
              questionKey: entry.questionKey,
            },
          );
        }

        const previousSubmissionCountTotal = cleanNumber(
          questionAverages?.submission_count_total,
        );
        const previousSubmissionCountDefault = cleanNumber(
          questionAverages?.submission_count_default,
        );
        const totalCountDelta = previousSubmission ? 0 : 1;
        const defaultCountDelta = previousSubmission
          ? (includeInDefaultAggregate ? 1 : 0) -
            (previousIncludedInDefaultAggregate ? 1 : 0)
          : includeInDefaultAggregate
            ? 1
            : 0;
        txn.set(
          questionAveragesRef,
          {
            updated_at: now,
            submission_count_total: Math.max(
              0,
              previousSubmissionCountTotal + totalCountDelta,
            ),
            submission_count_default: Math.max(
              0,
              previousSubmissionCountDefault + defaultCountDelta,
            ),
            questions_by_id: metricsById,
            questions_by_key: metricsByKey,
          },
          { merge: true },
        );

        savedSubmission = submissionDoc;
      });
    } catch (error) {
      if (error?.code === "answers_locked") {
        res.status(409).json({
          error: "Answers are locked for this device.",
          code: "answers_locked",
          retry_after_ms: Math.max(0, Number(error.retryAfterMs) || 0),
          retry_at: Number(error.retryAt) || 0,
        });
        return;
      }
      if (error?.code === "ip_rate_limited") {
        res.status(429).json({
          error:
            "Too many submissions from this network. Please try again later.",
          code: "ip_rate_limited",
          retry_after_ms: Math.max(0, Number(error.retryAfterMs) || 0),
          retry_at: Number(error.retryAt) || 0,
        });
        return;
      }
      throw error;
    }

    res.status(200).json({
      ok: true,
      submission: savedSubmission,
    });
  },
);
