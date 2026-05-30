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
    const isDevSubmission =
      payload.is_dev === true || payload.isDev === true;

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
    const segments =
      payload.segments && typeof payload.segments === "object"
        ? payload.segments
        : {
            age: demographics.age || "__UNSPECIFIED__",
            country: demographics.country || "__UNSPECIFIED__",
            industry: demographics.industry || "__UNSPECIFIED__",
          };

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
        const previousSubmissionSnap = !isDevSubmission && previousSubmissionId
          ? await txn.get(submissionRef)
          : null;
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
          ip_hash: ipHash,
          device_id_hash: deviceIdHash,
          session_id_hash: sessionIdHash,
          user_agent_hash: userAgentHash,
          is_dev: isDevSubmission,
        };

        txn.set(submissionRef, submissionDoc);

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
