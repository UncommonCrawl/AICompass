import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnv } from "vite";

const SUBMISSIONS_COLLECTION = "compass-results-v2";
const PUBLIC_DOTS_COLLECTION = "compass-public-dots-v1";
const DEFAULT_COUNT = 100;
const OPERATION_TIMEOUT_MS = 20_000;
const QUIZ_VERSION = "2026-05-29";
const RESULT_SCHEMA_VERSION = 3;
const RESPONSE_RANGE = { min: -2, max: 2 };
const DEV_WEIGHT_TARGET_TOTAL = 100;
const DEV_DEFAULT_STD_DEV = 0.4;
const DEV_IT_SOFTWARE_CLUSTER = { x: -0.05, y: 0.12, stdDev: 0.7 };
const DEV_FINANCE_DEFENSE_CLUSTER = { x: 0.22, y: 0.42, stdDev: 0.1 };
const DEV_OTHER_CLUSTER = { x: -0.79, y: -0.22, stdDev: DEV_DEFAULT_STD_DEV };
const DEV_EXTREME_Y_NEG_EDGE_RATE = 0.242;
const DEV_EXTREME_Y_POS_EDGE_RATE = 0.042;
const DEV_EXTREME_X_NEG_EDGE_RATE_TOP = 0.068;
const DEV_EXTREME_X_NEG_EDGE_MULTIPLIER_WHEN_Y_BELOW_TOP = 2;
const DEV_EXTREME_X_POS_EDGE_RATE = 0.056;
const DEV_TRENDLINE_X1 = -0.3;
const DEV_TRENDLINE_Y1 = -1;
const DEV_TRENDLINE_X2 = 1;
const DEV_TRENDLINE_Y2 = -0.2;
const DEV_IT_OCCUPATION_UNSPECIFIED_RATE = 8.8;
const DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE = 12.9;
const DEV_AGE_25_34_STUDENT_RATE = 22.9;
const DEV_AGE_65_PLUS_RETIRED_RATE = 58.7;
const DEV_AGE_65_PLUS_RETIREE_RATE = 22.7;
const UNKNOWN_SEGMENT_VALUE = "__UNSPECIFIED__";

const QUESTIONS = [
  {
    id: "y_office_jobs_decade",
    answerKey: "office_jobs_full_responsibilities_decade",
    axis: "y",
    direction: 1,
    label: "Office Job Responsibility",
    text: "Within the next decade, AI will be able to perform the full responsibilities of most white-collar office jobs.",
  },
  {
    id: "y_chatbots_not_understanding",
    answerKey: "chatbots_text_not_understanding",
    axis: "y",
    direction: -1,
    label: "Chatbot Understanding Skepticism",
    text: "What AI chatbots currently produce is closer to convincing-sounding text than real understanding.",
  },
  {
    id: "y_more_transformative_than_internet",
    answerKey: "ai_more_transformative_than_internet",
    axis: "y",
    direction: 1,
    label: "Beyond Internet Impact",
    text: "AI will have a more transformative impact on society than the internet.",
  },
  {
    id: "y_landmark_discovery_without_guidance",
    answerKey: "ai_landmark_discovery_without_guidance",
    axis: "y",
    direction: 1,
    label: "Autonomous Discovery",
    text: "Within the next decade, an AI system will make a landmark scientific discovery without direct human guidance.",
  },
  {
    id: "y_llm_abilities_plateauing",
    answerKey: "llm_abilities_plateauing",
    axis: "y",
    direction: -1,
    label: "LLM Plateau",
    text: "The abilities of large language models are beginning to plateau.",
  },
  {
    id: "y_llm_bypass_human_limits",
    answerKey: "llm_bypass_human_limits",
    axis: "y",
    direction: 1,
    label: "Bypassing Limits",
    text: "A sufficiently advanced large language model could bypass human-imposed limits and operate beyond its intended controls.",
  },
  {
    id: "y_far_from_self_improvement",
    answerKey: "ai_far_from_self_improvement",
    axis: "y",
    direction: -1,
    label: "Far from Self-Improvement",
    text: "AI systems are far away from being able to improve on themselves without human direction.",
  },
  {
    id: "y_ai_content_harder_future_training",
    answerKey: "ai_content_harder_future_training",
    axis: "y",
    direction: -1,
    label: "Training Degradation Risk",
    text: "As AI-generated content spreads online, it will become harder to train future AI systems without degrading their quality.",
  },
  {
    id: "x_pause_frontier_research_harmful",
    answerKey: "pause_frontier_research_harms",
    axis: "x",
    direction: 1,
    label: "Against Worldwide Pause",
    text: "A worldwide pause on frontier AI research would do more harm than good.",
  },
  {
    id: "x_public_access_worth_misuse_risk",
    answerKey: "public_powerful_ai_worth_misuse_risk",
    axis: "x",
    direction: 1,
    label: "Public Access Tradeoff",
    text: "Making powerful AI systems publicly available is worth the risk that some people will misuse them.",
  },
  {
    id: "x_energy_stricter_datacenter_rules",
    answerKey: "ai_energy_stricter_datacenter_rules",
    axis: "x",
    direction: -1,
    label: "Data Center Regulation",
    text: "The energy demands of AI data centers justify stricter rules for how those facilities are built and operated.",
  },
  {
    id: "x_liability_training_data_permission",
    answerKey: "liability_unpermitted_training_data",
    axis: "x",
    direction: -1,
    label: "Training Data Liability",
    text: "AI companies should be legally responsible when copyrighted or private material is used to train their models without permission.",
  },
  {
    id: "x_accept_genai_creative_works",
    answerKey: "accept_genai_creative_works",
    axis: "x",
    direction: 1,
    label: "Creative Adoption",
    text: "The use of generative AI in the creation art, music, film, and literature should be accepted.",
  },
  {
    id: "x_government_stop_high_risk_ai",
    answerKey: "gov_stop_high_risk_ai",
    axis: "x",
    direction: -1,
    label: "Government Stop Power",
    text: "Governments should have the power to stop the development or release of AI systems that pose serious public risks.",
  },
  {
    id: "x_allow_high_stakes_with_oversight",
    answerKey: "allow_ai_high_stakes_with_oversight",
    axis: "x",
    direction: 1,
    label: "High-Stakes Oversight",
    text: "With proper oversight, AI systems should be allowed to help make high-stakes decisions about people's lives.",
  },
  {
    id: "x_gains_not_worth_dependency_risk",
    answerKey: "ai_gains_not_worth_dependency",
    axis: "x",
    direction: -1,
    label: "Dependency Risk",
    text: "Potential gains from AI tools are not worth the risk of society becoming dependent on it.",
  },
];

const QUESTION_SCHEMA = QUESTIONS.map(({ id, answerKey, axis, direction, label, text }) => ({
  id,
  answerKey,
  axis,
  direction,
  label,
  text,
}));
const QUESTION_SCHEMA_VERSION = computeStableQuestionSchemaVersion(QUESTION_SCHEMA);
const QUESTION_MEDIAN_BY_ID = Object.fromEntries(QUESTIONS.map((question) => [question.id, 0]));
const QUADRANT_INFO = {
  topRight: "The Singulatarian",
  topLeft: "The Sentinel",
  bottomRight: "The Synthesist",
  bottomLeft: "The Skeptic",
};

const DEV_FINANCE_DEFENSE_INDUSTRIES = new Set(["Banking & Finance", "Military & Defense"]);
const DEV_INDUSTRIES_WITH_EQUAL_REMAINDER = [
  "IT & Software",
  "Education & Academia",
  "Science & Research",
  "Banking & Finance",
  "Non-Profit",
  "Military & Defense",
  "Arts & Entertainment",
  "Government",
  "Legal Services",
];
const DEV_IT_SOFTWARE_TITLES = [
  "software engineer",
  "senior software engineer",
  "Backend dev",
  "Frontend Developer",
  "devops engineer",
  "Site Reliability Engineer",
  "full stack",
  "QA tester",
  "product manager",
  "UI/UX",
  "Data Scientist",
  "Mobile dev (ios)",
  "Security Engineer",
  "Systems architect",
  "Database administrator",
  "Engineering manager",
  "Tech writer",
  "Cloud architect",
  "Data engineer",
  "Network Engineer",
  "unemployed",
  "QA automation",
  "Software dev",
  "Solutions Architect",
  "Security analyst",
  "VP",
  "machine learning engineer",
  "Release engineer",
  "TPM",
  "systems admin",
  "Embedded software",
  "Application dev",
  "support engineer",
  "SRE",
  "N/A",
  "Designer",
  "backend engineer",
  "frontend lead",
  "IT operations",
  "Devops lead",
  "Full-stack",
  "Qa",
  "Senior Data Scientist",
  "Devops",
  "Mobile developer",
  "Manager",
  "UI/UX Designer",
  "Cloud architect",
  "Machine Learning",
  "App Developer",
  "Embedded Dev",
  "None",
  "software developer",
  "Backend",
  "QA automation engineer",
  "Architect",
  "Frontend dev",
  "Eng Manager",
  "Mobile Dev",
  "Full Stack Dev",
  "database admin",
  "technical program manager",
  "Researcher",
  "Consultant",
  "Embedded software eng",
  "solutions arch",
];
const DEV_OTHER_INDUSTRY_TITLES_BY_INDUSTRY = {
  "Education & Academia": [
    "Adjunct Professor",
    "Research Assistant",
    "academic advisor",
    "Postdoc",
    "Academia",
    "History teacher",
    "registrar",
    "Teacher",
    "teacher",
    "Substitute teacher",
    "Instructional designer",
    "Administrator",
    "Lab Coordinator",
  ],
  "Science & Research": [
    "PI",
    "Lab Tech",
    "Clinical Research Associate",
    "Data Analyst",
    "Field Scientist",
    "Comp bio",
    "Research Scientist",
    "Lab Manager",
    "Statistician",
    "science comms",
  ],
  "Banking & Finance": [
    "Investment Analyst",
    "Financial Planner",
    "loan officer",
    "Quants",
    "Portfolio Manager",
    "Risk management",
    "Controller",
    "Personal Banker",
    "credit analyst",
    "Auditor",
  ],
  "Non-Profit": ["Copywriter", "Director", "outreach", "Case manager", "Volunteer", "Exec Director", "Ops Manager"],
  "Military & Defense": [
    "Intel Analyst",
    "systems eng",
    "Logistics Officer",
    "Cyber Specialist",
    "Operations Res. Analyst",
    "PM",
    "Training Instructor",
    "field tech",
    "defense contractor",
    "Mission Planner",
  ],
  "Arts & Entertainment": [
    "Creative Director",
    "Production Coord",
    "Agent",
    "Editor",
    "Unemployed",
    "None",
    "Student",
    "Sound Designer",
    "casting",
    "Development exec",
    "Actor",
    "Producer",
    "Legal",
  ],
  Government: [
    "Analyst",
    "Consultant",
    "PIO",
    "leg assistant",
    "Program Manager",
    "Development",
    "Compliance",
    "Admin clerk",
    "Grant manager",
    "Analyst",
  ],
  "Legal Services": [
    "Paralegal",
    "Associate attorney",
    "Secretary",
    "Court Reporter",
    "Law Clerk",
    "Compliance Counsel",
    "Managing Partner",
    "mediator",
    "Legal",
    "Discovery Specialist",
  ],
};

const DEV_AGE_WEIGHTS = buildWeightedChoices([
  { value: "Under 18", weight: 4 },
  { value: "18-24", weight: 19.2 },
  { value: "25-34", weight: 37.7 },
  { value: "35-44", weight: 16.2 },
  { value: "45-54", weight: 5.8 },
  { value: "55-64", weight: 2.1 },
  { value: "65+", weight: 1.8 },
  { value: "", weight: 14.2 },
]);
const DEV_LOCATION_WEIGHTS = buildWeightedChoices([
  { value: "US", weight: 62.9 },
  { value: "", weight: 15.5 },
  { value: "CA", weight: 8.1 },
  { value: "GB", weight: 8.4 },
  { value: "NL", weight: 2.2 },
  { value: "BE", weight: 0.4 },
  { value: "IE", weight: 0.8 },
  { value: "NZ", weight: 0.6 },
  { value: "AU", weight: 0.3 },
  { value: "DE", weight: 0.3 },
  { value: "IL", weight: 0.2 },
  { value: "SG", weight: 0.1 },
  { value: "UA", weight: 0.1 },
  { value: "CH", weight: 0.1 },
]);
const DEV_BASELINE_INDUSTRY_ENTRIES = [
  { value: "IT & Software", weight: 73.8 },
  { value: "", weight: 9.1 },
  { value: "Other", weight: 5.4 },
  { value: "Education & Academia", weight: 2.2 },
  { value: "Science & Research", weight: 3.2 },
  { value: "Banking & Finance", weight: 3.9 },
  { value: "Non-Profit", weight: 0.4 },
  { value: "Military & Defense", weight: 0.6 },
  { value: "Arts & Entertainment", weight: 0.5 },
  { value: "Government", weight: 0.7 },
  { value: "Legal Services", weight: 0.2 },
];
const DEV_INDUSTRY_WEIGHTS = buildWeightedChoices(DEV_BASELINE_INDUSTRY_ENTRIES);
const DEV_AGE_UNDER_18_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Student", weight: 78.9 },
  { value: "Other", weight: 7.2 },
  { value: "", weight: 13.9 },
]);
const DEV_AGE_18_24_EQUAL_REMAINDER =
  (DEV_WEIGHT_TARGET_TOTAL - (53.2 + 12.4 + 8.4)) / DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.length;
const DEV_AGE_18_24_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Student", weight: 53.2 },
  { value: "", weight: 12.4 },
  { value: "Other", weight: 8.4 },
  ...DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.map((industry) => ({
    value: industry,
    weight: DEV_AGE_18_24_EQUAL_REMAINDER,
  })),
]);
const DEV_AGE_25_34_REMAINDER_SCALE =
  (DEV_WEIGHT_TARGET_TOTAL - DEV_AGE_25_34_STUDENT_RATE) / DEV_WEIGHT_TARGET_TOTAL;
const DEV_AGE_25_34_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Student", weight: DEV_AGE_25_34_STUDENT_RATE },
  ...DEV_BASELINE_INDUSTRY_ENTRIES.map((entry) => ({
    value: entry.value,
    weight: entry.weight * DEV_AGE_25_34_REMAINDER_SCALE,
  })),
]);
const DEV_AGE_65_PLUS_EQUAL_REMAINDER =
  (DEV_WEIGHT_TARGET_TOTAL - (59 + 25.8)) / DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.length;
const DEV_AGE_65_PLUS_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Other", weight: 59 },
  { value: "", weight: 25.8 },
  ...DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.map((industry) => ({
    value: industry,
    weight: DEV_AGE_65_PLUS_EQUAL_REMAINDER,
  })),
]);
const DEV_IT_OCCUPATION_WEIGHTS = buildWeightedChoices([
  { value: "", weight: DEV_IT_OCCUPATION_UNSPECIFIED_RATE },
  ...DEV_IT_SOFTWARE_TITLES.map((title) => ({
    value: title,
    weight: (DEV_WEIGHT_TARGET_TOTAL - DEV_IT_OCCUPATION_UNSPECIFIED_RATE) / DEV_IT_SOFTWARE_TITLES.length,
  })),
]);
const DEV_OTHER_OCCUPATION_WEIGHTS_BY_INDUSTRY = Object.fromEntries(
  Object.entries(DEV_OTHER_INDUSTRY_TITLES_BY_INDUSTRY).map(([industry, titles]) => [
    industry,
    buildWeightedChoices([
      { value: "", weight: DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE },
      ...titles.map((title) => ({
        value: title,
        weight: (DEV_WEIGHT_TARGET_TOTAL - DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE) / titles.length,
      })),
    ]),
  ]),
);

function readArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function readCount() {
  const raw = readArgValue("--count");
  const parsed = Number(raw || DEFAULT_COUNT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : DEFAULT_COUNT;
}

function requireEnvValue(env, key) {
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function getAccessToken() {
  try {
    const token = execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: OPERATION_TIMEOUT_MS,
    }).trim();
    if (token) return token;
  } catch {
    // Fall through to Firebase CLI auth below.
  }

  const raw = execFileSync("firebase", ["login:list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: OPERATION_TIMEOUT_MS,
    env: { ...process.env, FIREBASE_SKIP_UPDATE_CHECK: "1" },
  });
  const parsed = JSON.parse(raw);
  const token = parsed?.result?.[0]?.tokens?.access_token;
  if (!token) throw new Error("No usable gcloud or Firebase CLI access token.");
  return token;
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { stringValue: String(value) };
}

async function firestoreRest(method, url, accessToken, body = undefined) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with HTTP ${response.status}: ${JSON.stringify(responseBody)}`);
  }
  return responseBody;
}

function documentUrl(projectId, collectionName, docId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`;
}

function computeStableQuestionSchemaVersion(questionSchema) {
  const input = JSON.stringify(questionSchema);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `qs_${questionSchema.length}_${(hash >>> 0).toString(16)}`;
}

function buildWeightedChoices(entries) {
  const choices = entries.map(({ value, weight }) => ({ value, weight: Number(weight) || 0 }));
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  const delta = DEV_WEIGHT_TARGET_TOTAL - total;
  if (choices.length > 0 && Math.abs(delta) > Number.EPSILON) {
    choices[0] = { ...choices[0], weight: Number((choices[0].weight + delta).toFixed(4)) };
  }
  return choices;
}

function pickWeightedValue(weightedChoices) {
  const total = weightedChoices.reduce((sum, choice) => sum + choice.weight, 0);
  if (total <= 0) return "";
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const choice of weightedChoices) {
    cumulative += choice.weight;
    if (roll < cumulative) return choice.value;
  }
  return weightedChoices[weightedChoices.length - 1]?.value ?? "";
}

function normalizeAnswerValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(2));
}

function buildQuestionAnalyticsPayload(answers, questionOrder = []) {
  const valuesByQuestionId = {};
  const valuesByQuestionKey = {};
  const responses = [];
  for (const question of QUESTIONS) {
    const rawValue = normalizeAnswerValue(answers?.[question.id]);
    if (rawValue === null) continue;
    const weightedValue = Number((rawValue * question.direction).toFixed(4));
    const questionKey = question.answerKey || question.id;
    valuesByQuestionId[question.id] = rawValue;
    valuesByQuestionKey[questionKey] = rawValue;
    responses.push({
      questionId: question.id,
      questionKey,
      questionLabel: question.label || "",
      questionText: question.text,
      axis: question.axis,
      direction: question.direction,
      value: rawValue,
      weightedValue,
      median: QUESTION_MEDIAN_BY_ID[question.id] ?? 0,
    });
  }
  return {
    questionSchemaVersion: QUESTION_SCHEMA_VERSION,
    questionSchema: QUESTION_SCHEMA,
    questionOrder: questionOrder.length > 0 ? questionOrder : QUESTIONS.map((question) => question.id),
    questionKeys:
      questionOrder.length > 0
        ? questionOrder.map((id) => QUESTIONS.find((question) => question.id === id)?.answerKey || id)
        : QUESTIONS.map((question) => question.answerKey || question.id),
    questionValues: valuesByQuestionId,
    questionValuesByKey: valuesByQuestionKey,
    questionResponses: responses,
    questionMedians: QUESTION_MEDIAN_BY_ID,
  };
}

function sampleStandardNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clampScore(value) {
  return Number(Math.min(1, Math.max(-1, value)).toFixed(4));
}

function sampleScoreAroundMean(mean, stdDev) {
  return clampScore(mean + sampleStandardNormal() * stdDev);
}

function trendlineYAtX(x) {
  const slope = (DEV_TRENDLINE_Y2 - DEV_TRENDLINE_Y1) / (DEV_TRENDLINE_X2 - DEV_TRENDLINE_X1);
  return slope * (x - DEV_TRENDLINE_X1) + DEV_TRENDLINE_Y1;
}

function isBelowTrendline(scores) {
  return scores.y < trendlineYAtX(scores.x);
}

function alignExtremeBeliefScores(scores) {
  const alignedScores = { ...scores };
  const yNegativeEdgeRate = alignedScores.x < 0 ? DEV_EXTREME_Y_NEG_EDGE_RATE : 0;
  const yRoll = Math.random();
  if (yRoll < yNegativeEdgeRate) {
    alignedScores.y = -1;
  } else if (yRoll < yNegativeEdgeRate + DEV_EXTREME_Y_POS_EDGE_RATE) {
    alignedScores.y = 1;
  }
  const xNegativeEdgeRate =
    alignedScores.y < 1
      ? DEV_EXTREME_X_NEG_EDGE_RATE_TOP * DEV_EXTREME_X_NEG_EDGE_MULTIPLIER_WHEN_Y_BELOW_TOP
      : DEV_EXTREME_X_NEG_EDGE_RATE_TOP;
  const xPositiveEdgeRate = alignedScores.y > 0 ? DEV_EXTREME_X_POS_EDGE_RATE : 0;
  const xRoll = Math.random();
  if (xRoll < xNegativeEdgeRate) {
    alignedScores.x = -1;
  } else if (xRoll < xNegativeEdgeRate + xPositiveEdgeRate) {
    alignedScores.x = 1;
  }
  return alignedScores;
}

function sampleBottomRightQuadrantScore() {
  const epsilon = 0.0001;
  return {
    x: clampScore(epsilon + Math.random() * (1 - epsilon)),
    y: clampScore(-(epsilon + Math.random() * (1 - epsilon))),
  };
}

function sampleTrendlineCompliantScores(scoreCluster) {
  const sampledScores = {
    x: sampleScoreAroundMean(scoreCluster.x, scoreCluster.stdDev),
    y: sampleScoreAroundMean(scoreCluster.y, scoreCluster.stdDev),
  };
  const alignedScores = alignExtremeBeliefScores(sampledScores);
  return isBelowTrendline(alignedScores) ? sampleBottomRightQuadrantScore() : alignedScores;
}

function pickDevIndustry(age) {
  if (age === "Under 18") return pickWeightedValue(DEV_AGE_UNDER_18_INDUSTRY_WEIGHTS);
  if (age === "18-24") return pickWeightedValue(DEV_AGE_18_24_INDUSTRY_WEIGHTS);
  if (age === "25-34") return pickWeightedValue(DEV_AGE_25_34_INDUSTRY_WEIGHTS);
  if (age === "65+") return pickWeightedValue(DEV_AGE_65_PLUS_INDUSTRY_WEIGHTS);
  return pickWeightedValue(DEV_INDUSTRY_WEIGHTS);
}

function pickDevOccupation(industry, age) {
  if (age === "65+") {
    const retiredRoll = Math.random() * DEV_WEIGHT_TARGET_TOTAL;
    if (retiredRoll < DEV_AGE_65_PLUS_RETIRED_RATE) return "Retired";
    if (retiredRoll < DEV_AGE_65_PLUS_RETIRED_RATE + DEV_AGE_65_PLUS_RETIREE_RATE) return "Retiree";
  }
  if (industry === "IT & Software") return pickWeightedValue(DEV_IT_OCCUPATION_WEIGHTS);
  return pickWeightedValue(DEV_OTHER_OCCUPATION_WEIGHTS_BY_INDUSTRY[industry] || []);
}

function normalizeSegmentValue(value) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned !== "" ? cleaned : UNKNOWN_SEGMENT_VALUE;
}

function buildDemographicSegments(demo) {
  return {
    age: normalizeSegmentValue(demo.age),
    country: normalizeSegmentValue(demo.country),
    industry: normalizeSegmentValue(demo.industry),
  };
}

function getQuadrant(x, y) {
  if (y >= 0 && x >= 0) return "topRight";
  if (y >= 0 && x < 0) return "topLeft";
  if (y < 0 && x >= 0) return "bottomRight";
  return "bottomLeft";
}

function buildDevDot(index) {
  const randomAge = pickWeightedValue(DEV_AGE_WEIGHTS);
  const randomCountry = pickWeightedValue(DEV_LOCATION_WEIGHTS);
  const randomIndustry = pickDevIndustry(randomAge);
  const randomOccupation = pickDevOccupation(randomIndustry, randomAge);
  const scoreCluster =
    randomIndustry === "IT & Software"
      ? DEV_IT_SOFTWARE_CLUSTER
      : DEV_FINANCE_DEFENSE_INDUSTRIES.has(randomIndustry)
        ? DEV_FINANCE_DEFENSE_CLUSTER
        : DEV_OTHER_CLUSTER;
  const scores = sampleTrendlineCompliantScores(scoreCluster);
  const answers = Object.fromEntries(
    QUESTIONS.map((question) => [
      question.id,
      Number((Math.random() * (RESPONSE_RANGE.max - RESPONSE_RANGE.min) + RESPONSE_RANGE.min).toFixed(2)),
    ]),
  );
  const questionAnalytics = buildQuestionAnalyticsPayload(
    answers,
    QUESTIONS.map((question) => question.id),
  );
  const now = Date.now() + index;
  const submissionId = `local_dev_${now}_${randomUUID()}`;
  const demographics = {
    age: randomAge,
    country: randomCountry,
    industry: randomIndustry,
    occupation: randomOccupation,
    notes: "",
  };
  const segments = buildDemographicSegments(demographics);
  const archetype = QUADRANT_INFO[getQuadrant(scores.x, scores.y)];
  const shared = {
    submission_id: submissionId,
    created_at: now,
    ts: now,
    x_score: scores.x,
    y_score: scores.y,
    x: scores.x,
    y: scores.y,
    archetype,
    demographics,
    age: demographics.age,
    country: demographics.country,
    industry: demographics.industry,
    occupation: demographics.occupation,
    notes: demographics.notes,
    segments,
    include_in_default_aggregate: false,
    include_in_device_priority_aggregate: false,
    is_repeat_ip_24h: false,
    is_repeat_device_24h: false,
    repeat_classification: "dev_submission",
    is_dev: true,
  };
  const submissionDoc = {
    ...shared,
    quiz_version: QUIZ_VERSION,
    quizVersion: QUIZ_VERSION,
    question_schema_version: questionAnalytics.questionSchemaVersion,
    questionSchemaVersion: questionAnalytics.questionSchemaVersion,
    question_schema: questionAnalytics.questionSchema,
    answers: questionAnalytics.questionValuesByKey,
    question_order: questionAnalytics.questionOrder,
    question_keys: questionAnalytics.questionKeys,
    question_values: questionAnalytics.questionValues,
    question_responses: questionAnalytics.questionResponses,
    question_medians: questionAnalytics.questionMedians,
    result_schema_version: RESULT_SCHEMA_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    repeat_group_id: "",
    duplicate_policy_flags: [],
    ip_submission_count_24h: 0,
    is_ip_soft_limited: false,
    is_suspicious_repeat_pattern: false,
  };
  return {
    submissionId,
    submissionDoc,
    publicDotDoc: shared,
  };
}

async function writeDocument(projectId, accessToken, collectionName, docId, data) {
  await firestoreRest("PATCH", documentUrl(projectId, collectionName, docId), accessToken, {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)])),
  });
}

async function main() {
  const count = readCount();
  const env = loadEnv(process.env.MODE || process.env.NODE_ENV || "development", process.cwd(), "");
  const projectId =
    readArgValue("--project") ||
    env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "";
  requireEnvValue({ VITE_FIREBASE_PROJECT_ID: projectId }, "VITE_FIREBASE_PROJECT_ID");

  const accessToken = getAccessToken();
  const createdIds = [];
  for (let i = 0; i < count; i += 1) {
    const dot = buildDevDot(i);
    await writeDocument(projectId, accessToken, SUBMISSIONS_COLLECTION, dot.submissionId, dot.submissionDoc);
    await writeDocument(projectId, accessToken, PUBLIC_DOTS_COLLECTION, dot.submissionId, dot.publicDotDoc);
    createdIds.push(dot.submissionId);
    if ((i + 1) % 10 === 0 || i + 1 === count) {
      console.log(`[create-dev-dots] Created ${i + 1}/${count}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        created: createdIds.length,
        firstId: createdIds[0] || "",
        lastId: createdIds[createdIds.length - 1] || "",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[create-dev-dots] ${error?.message || error}`);
  process.exitCode = 1;
});
