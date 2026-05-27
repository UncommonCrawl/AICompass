import { createHmac, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

initializeApp();

const db = getFirestore();
const HASH_SECRET = defineSecret("COMPASS_HASH_SECRET");
const SUBMISSIONS_COLLECTION = "compass-results-v2";
const REPEAT_SIGNALS_COLLECTION = "compass-repeat-signals-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function hashValue(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
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

    const deviceUuid = cleanString(payload.device_uuid, 256);
    const sessionUuid = cleanString(payload.session_uuid, 256);
    const submittedUserAgent = cleanString(payload.user_agent, 1024);
    const requestUserAgent = cleanString(req.get("user-agent"), 1024);
    const userAgent = submittedUserAgent || requestUserAgent;
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
    const answersHash = hashValue(secret, `answers:${JSON.stringify(answers)}`);
    const segments =
      payload.segments && typeof payload.segments === "object"
        ? payload.segments
        : {
            age: demographics.age || "__UNSPECIFIED__",
            country: demographics.country || "__UNSPECIFIED__",
            industry: demographics.industry || "__UNSPECIFIED__",
          };

    const submissionId = `sub_${randomUUID()}`;
    const submissionRef = db.collection(SUBMISSIONS_COLLECTION).doc(submissionId);
    const ipSignalRef = ipHash
      ? db.collection(REPEAT_SIGNALS_COLLECTION).doc(`ip_${ipHash}`)
      : null;
    const deviceSignalRef = deviceIdHash
      ? db.collection(REPEAT_SIGNALS_COLLECTION).doc(`device_${deviceIdHash}`)
      : null;

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

        const lockedAnswersHash = cleanString(
          deviceSignal?.locked_answers_hash,
          128,
        );
        if (lockedAnswersHash && lockedAnswersHash !== answersHash) {
          const error = new Error("Answers are locked for this device.");
          error.code = "answers_locked";
          throw error;
        }

        const ipLast = typeof ipSignal?.last_submission_at === "number"
          ? ipSignal.last_submission_at
          : 0;
        const deviceLast = typeof deviceSignal?.last_submission_at === "number"
          ? deviceSignal.last_submission_at
          : 0;

        const isRepeatIp24h = ipLast >= cutoff;
        const isRepeatDevice24h = deviceLast >= cutoff;
        const includeInDefaultAggregate = !(isRepeatIp24h || isRepeatDevice24h);
        const includeInDevicePriorityAggregate = !isRepeatDevice24h;
        const repeatClassification = isRepeatDevice24h
          ? "repeat_device_24h"
          : isRepeatIp24h
            ? "repeat_ip_24h_only"
            : "first_or_stale";
        const repeatGroupId = isRepeatIp24h || isRepeatDevice24h
          ? cleanString(
              ipSignal?.repeat_group_id || deviceSignal?.repeat_group_id || "",
              96,
            ) || `rg_${randomUUID()}`
          : "";

        const xScore = cleanNumber(payload.x_score);
        const yScore = cleanNumber(payload.y_score);
        const submissionDoc = {
          submission_id: submissionId,
          created_at: now,
          ts: now,
          x_score: xScore,
          y_score: yScore,
          x: xScore,
          y: yScore,
          archetype: cleanString(payload.archetype, 128),
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
          ip_hash: ipHash,
          device_id_hash: deviceIdHash,
          session_id_hash: sessionIdHash,
          user_agent_hash: userAgentHash,
          is_dev: payload.is_dev === true,
          isDev: payload.is_dev === true,
        };

        txn.set(submissionRef, submissionDoc);

        if (ipSignalRef) {
          txn.set(
            ipSignalRef,
            {
              signal_type: "ip",
              hash: ipHash,
              last_submission_at: now,
              repeat_group_id: repeatGroupId,
              updated_at: now,
            },
            { merge: true },
          );
        }

        if (deviceSignalRef) {
          txn.set(
            deviceSignalRef,
            {
              signal_type: "device",
              hash: deviceIdHash,
              last_submission_at: now,
              repeat_group_id: repeatGroupId,
              locked_answers_hash: lockedAnswersHash || answersHash,
              updated_at: now,
            },
            { merge: true },
          );
        }

        savedSubmission = submissionDoc;
      });
    } catch (error) {
      if (error?.code === "answers_locked") {
        res.status(409).json({ error: "Answers are locked for this device." });
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
