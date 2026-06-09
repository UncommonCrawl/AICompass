import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { ISO_COUNTRIES } from "./isoCountries";
import aiCompassHeader from "../AI Compass header.png";

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

const RESPONSE_RANGE = {
  min: -2,
  max: 2,
  step: 0.01,
};
const RESPONSE_SLIDER_TRACK_SIZE_PX = 6;
const RESPONSE_SLIDER_THUMB_SIZE_PX = 18;
const RESPONSE_SLIDER_THUMB_RADIUS_PX = RESPONSE_SLIDER_THUMB_SIZE_PX / 2;
const RESPONSE_SLIDER_LABEL_MARGIN_PX = 4;

const QUESTION_SCHEMA = QUESTIONS.map((question) => ({
  id: question.id,
  answerKey: question.answerKey,
  axis: question.axis,
  direction: question.direction,
  label: question.label,
  text: question.text,
}));

function computeStableQuestionSchemaVersion(questionSchema) {
  const input = JSON.stringify(questionSchema);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `qs_${questionSchema.length}_${(hash >>> 0).toString(16)}`;
}

const RESULT_SCHEMA_VERSION = 3;
const COMPASS_PUBLIC_DOTS_COLLECTION = "compass-public-dots-v1";
const COMPASS_PUBLIC_DOT_ARCHIVE_COLLECTION = "compass-public-dot-archive-v1";
const COMPASS_PUBLIC_DOT_ARCHIVE_DOC_ID = "latest";
const COMPASS_METRICS_COLLECTION = "compass-metrics-v1";
const QUESTION_AVERAGES_DOC_ID = "question-averages-v1";
const COMPASS_SUBMIT_ENDPOINT = (
  import.meta.env.VITE_COMPASS_SUBMIT_ENDPOINT || ""
).trim();
const DEVICE_ID_STORAGE_KEY = "ai_compass_device_id_v1";
const SESSION_ID_STORAGE_KEY = "ai_compass_session_id_v1";
const LAST_RESULT_STORAGE_KEY = "ai_compass_last_result_v1";
const LAST_SUBMISSION_STORAGE_KEY = "ai_compass_last_submission_v1";
const QUIZ_DRAFT_STORAGE_KEY = "ai_compass_quiz_draft_v1";
const DEV_RESULT_PERSISTENCE_ENABLED_STORAGE_KEY =
  "ai_compass_dev_result_persistence_enabled_v1";
const DEV_PERF_VALVE_DEFAULTS = {
  noFirestore: false,
  noCanvas: false,
  noSvg: false,
  noHomeBody: false,
  noLoadingFade: false,
  noDevControls: false,
  noFpsMeter: false,
};
const DEV_PERF_VALVE_OPTIONS = [
  { key: "noFirestore", label: "Firestore" },
  { key: "noCanvas", label: "Canvas" },
  { key: "noSvg", label: "SVG" },
  { key: "noHomeBody", label: "Home body" },
  { key: "noLoadingFade", label: "Fade" },
  { key: "noDevControls", label: "Dev controls" },
  { key: "noFpsMeter", label: "FPS meter" },
];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RESUBMIT_LOCK_WINDOW_MS = DAY_MS;
const UNKNOWN_SEGMENT_VALUE = "__UNSPECIFIED__";
const QUIZ_VERSION = "2026-05-29";
const QUESTION_SCHEMA_VERSION =
  computeStableQuestionSchemaVersion(QUESTION_SCHEMA);
const QUESTION_MEDIAN_BY_ID = Object.fromEntries(
  QUESTIONS.map((question) => [question.id, 0]),
);
(() => {
  const seenByKey = {};
  for (const question of QUESTIONS) {
    const key =
      typeof question.answerKey === "string" ? question.answerKey : "";
    if (!key) {
      throw new Error(`Missing answerKey for question id "${question.id}"`);
    }
    if (seenByKey[key]) {
      throw new Error(
        `Duplicate answerKey "${key}" for question ids "${seenByKey[key].id}" and "${question.id}"`,
      );
    }
    seenByKey[key] = question;
  }
})();

const QUADRANT_INFO = {
  topRight: {
    name: "The Singulatarian",
    compassLabel: "Singulatarians",
    desc: "Believes transformative AI is near and wants to accelerate toward it.",
    color: "var(--color-ink)",
  },
  topLeft: {
    name: "The Sentinel",
    compassLabel: "Sentinels",
    desc: "Believes powerful AI is coming but fears what happens without guardrails.",
    color: "var(--color-ink)",
  },
  bottomRight: {
    name: "The Synthesist",
    compassLabel: "Synthesists",
    desc: "Wary of grand AI claims while believing in real-world applications.",
    color: "var(--color-ink)",
  },
  bottomLeft: {
    name: "The Skeptic",
    compassLabel: "Skeptics",
    desc: "Doubts transformative potential and favors strong restrictions.",
    color: "var(--color-ink)",
  },
};

const AGE_RANGES = [
  "Under 18",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
];

const INDUSTRY_OPTIONS = [
  "Agriculture & Forestry",
  "Architecture & Construction",
  "Arts & Entertainment",
  "Automotive & Transportation",
  "Banking & Finance",
  "Consumer Goods & Retail",
  "Education & Academia",
  "Energy & Utilities",
  "Government",
  "Healthcare",
  "Hospitality & Tourism",
  "IT & Software",
  "Insurance",
  "Legal Services",
  "Logistics Manufacturing",
  "Media & Journalism",
  "Military & Defense",
  "Non-Profit",
  "Professional Services",
  "Real Estate",
  "Science & Research",
  "Student",
  "Telecommunications",
  "Other",
];

const COUNTRY_OPTIONS = ISO_COUNTRIES;

function getAgeRangeLabel(value) {
  return value;
}

function formatCountryName(name) {
  return name.replace(/\s*\(the\)/gi, ", The");
}

const COUNTRY_NAME_BY_CODE = Object.fromEntries(
  COUNTRY_OPTIONS.map((country) => [
    country.code,
    formatCountryName(country.name),
  ]),
);
const PREFER_NOT_TO_SAY_VALUE = "__PREFER_NOT_TO_SAY__";
const OCCUPATION_CHAR_LIMIT = 30;
const NOTES_CHAR_LIMIT = 120;
const HEADER_ACTION_HEIGHT = 44;
const HEADER_BAR_HEIGHT = 118;
const FOOTER_BAR_HEIGHT = 20;
const HOME_SECTION_GAP = 20;
const GRAY = "#b8b8b8";
const LIGHT_GRAY = `color-mix(in oklab, ${GRAY} 20%, var(--color-paper) 80%)`;
const RESULTS_STRIP_BOTTOM_MARGIN = 16;
const UNSPECIFIED_FILTER_VALUE = "__UNSPECIFIED__";
const DROPDOWN_VIEWPORT_BUFFER = 10;
const DROPDOWN_MENU_MAX_HEIGHT = 200;
const INTERACTIVE_DOT_LIMIT = 1000;
const FIRESTORE_IN_FILTER_LIMIT = 30;
const COMPASS_DOT_COLOR = "#000000";
const DEFAULT_USER_DOT_COLOR = "#17a34a";
const COMPASS_DOT_BITMAP_DPR = 2;
const COMPASS_DOT_GEOMETRY = {
  radius: 3,
  size: 6,
  hoverRingRadius: 6.5,
  hoverRingPulseRadius: 9.5,
};

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
const DEV_IT_OCCUPATION_UNSPECIFIED_RATE = 8.8;
const DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE = 12.9;
const DEV_TRENDLINE_X1 = -0.3;
const DEV_TRENDLINE_Y1 = -1;
const DEV_TRENDLINE_X2 = 1;
const DEV_TRENDLINE_Y2 = -0.2;
const LOCAL_DEV_ID_PREFIX = "local_dev_";
const DEV_AGE_25_34_STUDENT_RATE = 22.9;
const DEV_AGE_65_PLUS_RETIRED_RATE = 58.7;
const DEV_AGE_65_PLUS_RETIREE_RATE = 22.7;
const DEV_FINANCE_DEFENSE_INDUSTRIES = new Set([
  "Banking & Finance",
  "Military & Defense",
]);
const LOCAL_DEV_DUMMY_RESULT_ID_PREFIX = "local_dev_dummy_user_";
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
  "Non-Profit": [
    "Copywriter",
    "Director",
    "outreach",
    "Case manager",
    "Volunteer",
    "Exec Director",
    "Ops Manager",
  ],
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

const DEV_INDUSTRY_WEIGHTS = buildWeightedChoices(
  DEV_BASELINE_INDUSTRY_ENTRIES,
);

const DEV_AGE_UNDER_18_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Student", weight: 78.9 },
  { value: "Other", weight: 7.2 },
  { value: "", weight: 13.9 },
]);

const DEV_AGE_18_24_FIXED_TOTAL = 53.2 + 12.4 + 8.4;
const DEV_AGE_18_24_EQUAL_REMAINDER =
  (DEV_WEIGHT_TARGET_TOTAL - DEV_AGE_18_24_FIXED_TOTAL) /
  DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.length;
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
  (DEV_WEIGHT_TARGET_TOTAL - DEV_AGE_25_34_STUDENT_RATE) /
  DEV_WEIGHT_TARGET_TOTAL;
const DEV_AGE_25_34_INDUSTRY_WEIGHTS = buildWeightedChoices([
  { value: "Student", weight: DEV_AGE_25_34_STUDENT_RATE },
  ...DEV_BASELINE_INDUSTRY_ENTRIES.map((entry) => ({
    value: entry.value,
    weight: entry.weight * DEV_AGE_25_34_REMAINDER_SCALE,
  })),
]);

const DEV_AGE_65_PLUS_FIXED_TOTAL = 59 + 25.8;
const DEV_AGE_65_PLUS_EQUAL_REMAINDER =
  (DEV_WEIGHT_TARGET_TOTAL - DEV_AGE_65_PLUS_FIXED_TOTAL) /
  DEV_INDUSTRIES_WITH_EQUAL_REMAINDER.length;
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
    weight:
      (DEV_WEIGHT_TARGET_TOTAL - DEV_IT_OCCUPATION_UNSPECIFIED_RATE) /
      DEV_IT_SOFTWARE_TITLES.length,
  })),
]);
const DEV_OTHER_OCCUPATION_WEIGHTS_BY_INDUSTRY = Object.fromEntries(
  Object.entries(DEV_OTHER_INDUSTRY_TITLES_BY_INDUSTRY).map(
    ([industry, titles]) => [
      industry,
      buildWeightedChoices([
        { value: "", weight: DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE },
        ...titles.map((title) => ({
          value: title,
          weight:
            (DEV_WEIGHT_TARGET_TOTAL - DEV_NON_IT_OCCUPATION_UNSPECIFIED_RATE) /
            titles.length,
        })),
      ]),
    ],
  ),
);

const THEME = {
  SiteBG: "var(--color-paper)",
  SiteText: "var(--color-ink)",
  SiteBorder: "var(--color-border)",
};

const TAB_STYLE_VARS = {
  outerBackground: "var(--tab-bg-outer)",
  formBackground: "var(--tab-bg-form)",
  menuBackground: "var(--tab-bg-menu)",
  borderColor: "var(--tab-border-color)",
  borderColorStrong: "var(--tab-border-color-strong)",
  borderColorSubtle: "var(--tab-border-color-subtle)",
  borderRadius: "var(--tab-radius)",
};

const tabBorder = (color = TAB_STYLE_VARS.borderColor) =>
  `var(--tab-border-width) var(--tab-border-style) ${color}`;

const ARCHETYPE_GRID_ORDER = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
];

function calculateScores(answers) {
  let xSum = 0,
    ySum = 0,
    xCount = 0,
    yCount = 0;
  for (const q of QUESTIONS) {
    const val = answers[q.id];
    if (val === undefined) continue;
    const score = val * q.direction;
    if (q.axis === "x") {
      xSum += score;
      xCount++;
    } else {
      ySum += score;
      yCount++;
    }
  }
  return {
    x: xCount > 0 ? xSum / (xCount * 2) : 0,
    y: yCount > 0 ? ySum / (yCount * 2) : 0,
  };
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
    questionOrder:
      questionOrder.length > 0 ? questionOrder : QUESTIONS.map((q) => q.id),
    questionKeys:
      questionOrder.length > 0
        ? questionOrder.map(
            (id) => QUESTIONS.find((q) => q.id === id)?.answerKey || id,
          )
        : QUESTIONS.map((q) => q.answerKey || q.id),
    questionValues: valuesByQuestionId,
    questionValuesByKey: valuesByQuestionKey,
    questionResponses: responses,
    questionMedians: QUESTION_MEDIAN_BY_ID,
  };
}

function buildQuestionAverageByIdMap(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const averagesById = {};
  for (const question of QUESTIONS) {
    const entry = source[question.id];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const avgTotal = Number(entry.avg_total);
    const countTotal = Number(entry.count_total);
    const hasTotalAggregate =
      Number.isFinite(countTotal) &&
      countTotal > 0 &&
      Number.isFinite(avgTotal);
    if (!hasTotalAggregate) continue;
    averagesById[question.id] = Math.max(
      RESPONSE_RANGE.min,
      Math.min(RESPONSE_RANGE.max, avgTotal),
    );
  }
  return averagesById;
}

function readQuestionResponseValueMap(result) {
  if (!result || typeof result !== "object") return {};
  if (!Array.isArray(result.question_responses)) return {};
  const valueMap = {};
  for (const response of result.question_responses) {
    if (!response || typeof response !== "object") continue;
    const questionId =
      typeof response.questionId === "string" ? response.questionId : "";
    if (!questionId) continue;
    const value = normalizeAnswerValue(response.value);
    if (value === null) continue;
    valueMap[questionId] = value;
  }
  return valueMap;
}

function extractAnswersByQuestionIdFromResult(result) {
  if (!result || typeof result !== "object") return {};
  const fromQuestionValues =
    result.questionValues && typeof result.questionValues === "object"
      ? result.questionValues
      : result.question_values && typeof result.question_values === "object"
        ? result.question_values
        : {};
  const fromAnswers =
    result.answers && typeof result.answers === "object" ? result.answers : {};
  const fromResponseValueMap = readQuestionResponseValueMap(result);
  const values = {};

  for (const question of QUESTIONS) {
    const rawValue =
      fromQuestionValues[question.id] ??
      fromAnswers[question.id] ??
      fromAnswers[question.answerKey] ??
      fromResponseValueMap[question.id] ??
      null;
    const normalizedValue = normalizeAnswerValue(rawValue);
    if (normalizedValue === null) continue;
    values[question.id] = normalizedValue;
  }

  return values;
}

function normalizeDevResultToCurrentQuestionSchema(result) {
  if (!result || typeof result !== "object") return result;
  const isDevEntry = isDevRecord(result);
  if (!isDevEntry) return result;

  const answersByQuestionId = extractAnswersByQuestionIdFromResult(result);
  const questionAnalytics = buildQuestionAnalyticsPayload(
    answersByQuestionId,
    QUESTIONS.map((question) => question.id),
  );

  return {
    ...result,
    quiz_version: QUIZ_VERSION,
    quizVersion: QUIZ_VERSION,
    question_schema_version: QUESTION_SCHEMA_VERSION,
    questionSchemaVersion: QUESTION_SCHEMA_VERSION,
    question_schema: QUESTION_SCHEMA,
    questionSchema: QUESTION_SCHEMA,
    question_order: questionAnalytics.questionOrder,
    question_keys: questionAnalytics.questionKeys,
    question_values: questionAnalytics.questionValues,
    question_responses: questionAnalytics.questionResponses,
    question_medians: questionAnalytics.questionMedians,
    ...questionAnalytics,
    answers: questionAnalytics.questionValuesByKey,
    is_dev: true,
  };
}

function isDevRecord(record) {
  return record?.is_dev === true || record?.isDev === true;
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

function buildWeightedChoices(entries) {
  const choices = entries.map(({ value, weight }) => ({
    value,
    weight: Number(weight) || 0,
  }));
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  const delta = DEV_WEIGHT_TARGET_TOTAL - total;
  if (choices.length > 0 && Math.abs(delta) > Number.EPSILON) {
    choices[0] = {
      ...choices[0],
      weight: Number((choices[0].weight + delta).toFixed(4)),
    };
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
  // Edge clamp only: if a sampled value exceeds the plot bounds, pin to -1/1.
  return clampScore(mean + sampleStandardNormal() * stdDev);
}

function trendlineYAtX(x) {
  const slope =
    (DEV_TRENDLINE_Y2 - DEV_TRENDLINE_Y1) /
    (DEV_TRENDLINE_X2 - DEV_TRENDLINE_X1);
  return slope * (x - DEV_TRENDLINE_X1) + DEV_TRENDLINE_Y1;
}

function isBelowTrendline(scores) {
  return scores.y < trendlineYAtX(scores.x);
}

function alignExtremeBeliefScores(scores) {
  const alignedScores = { ...scores };

  // Y-axis alignments (mutually exclusive): y = -1 only when x < 0, or y = 1.
  const yNegativeEdgeRate =
    alignedScores.x < 0 ? DEV_EXTREME_Y_NEG_EDGE_RATE : 0;
  const yRoll = Math.random();
  if (yRoll < yNegativeEdgeRate) {
    alignedScores.y = -1;
  } else if (yRoll < yNegativeEdgeRate + DEV_EXTREME_Y_POS_EDGE_RATE) {
    alignedScores.y = 1;
  }

  // X-axis alignments (mutually exclusive): x = -1 gets 2x likelihood when y < 1.
  const xNegativeEdgeRate =
    alignedScores.y < 1
      ? DEV_EXTREME_X_NEG_EDGE_RATE_TOP *
        DEV_EXTREME_X_NEG_EDGE_MULTIPLIER_WHEN_Y_BELOW_TOP
      : DEV_EXTREME_X_NEG_EDGE_RATE_TOP;
  const xPositiveEdgeRate =
    alignedScores.y > 0 ? DEV_EXTREME_X_POS_EDGE_RATE : 0;
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
  const x = epsilon + Math.random() * (1 - epsilon);
  const y = -(epsilon + Math.random() * (1 - epsilon));
  return {
    x: clampScore(x),
    y: clampScore(y),
  };
}

function sampleTrendlineCompliantScores(scoreCluster) {
  const sampledScores = {
    x: sampleScoreAroundMean(scoreCluster.x, scoreCluster.stdDev),
    y: sampleScoreAroundMean(scoreCluster.y, scoreCluster.stdDev),
  };
  const alignedScores = alignExtremeBeliefScores(sampledScores);
  if (!isBelowTrendline(alignedScores)) return alignedScores;
  return sampleBottomRightQuadrantScore();
}

function pickDevIndustry(age) {
  if (age === "Under 18") {
    return pickWeightedValue(DEV_AGE_UNDER_18_INDUSTRY_WEIGHTS);
  }
  if (age === "18-24") {
    return pickWeightedValue(DEV_AGE_18_24_INDUSTRY_WEIGHTS);
  }
  if (age === "25-34") {
    return pickWeightedValue(DEV_AGE_25_34_INDUSTRY_WEIGHTS);
  }
  if (age === "65+") {
    return pickWeightedValue(DEV_AGE_65_PLUS_INDUSTRY_WEIGHTS);
  }
  return pickWeightedValue(DEV_INDUSTRY_WEIGHTS);
}

function pickDevOccupation(industry, age) {
  if (age === "65+") {
    const retiredRoll = Math.random() * DEV_WEIGHT_TARGET_TOTAL;
    if (retiredRoll < DEV_AGE_65_PLUS_RETIRED_RATE) return "Retired";
    if (
      retiredRoll <
      DEV_AGE_65_PLUS_RETIRED_RATE + DEV_AGE_65_PLUS_RETIREE_RATE
    ) {
      return "Retiree";
    }
  }
  if (industry === "IT & Software") {
    return pickWeightedValue(DEV_IT_OCCUPATION_WEIGHTS);
  }
  const nonItWeights = DEV_OTHER_OCCUPATION_WEIGHTS_BY_INDUSTRY[industry];
  if (!nonItWeights) return "";
  return pickWeightedValue(nonItWeights);
}

function normalizeOccupationForComparison(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeFilterValue(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : UNSPECIFIED_FILTER_VALUE;
}

function toFirestoreFilterValue(value) {
  return value === UNSPECIFIED_FILTER_VALUE ? "" : value;
}

function buildPublicDotQueryFilter(field, selectedValues, optionCount) {
  if (selectedValues.length === 0) return { empty: true, constraints: [] };
  if (selectedValues.length === optionCount) {
    return { empty: false, constraints: [] };
  }

  const firestoreValues = selectedValues.map(toFirestoreFilterValue);
  if (firestoreValues.length === 1) {
    return {
      empty: false,
      constraints: [where(field, "==", firestoreValues[0])],
      clientValues: selectedValues,
    };
  }
  if (firestoreValues.length <= FIRESTORE_IN_FILTER_LIMIT) {
    return {
      empty: false,
      constraints: [where(field, "in", firestoreValues)],
      clientValues: selectedValues,
    };
  }

  return { empty: false, constraints: [], clientValues: selectedValues };
}

function publicDotMatchesClientFilters(dot, clientFilters) {
  if (clientFilters.age) {
    if (!clientFilters.age.has(normalizeFilterValue(dot.age))) return false;
  }
  if (clientFilters.country) {
    if (!clientFilters.country.has(normalizeFilterValue(dot.country))) {
      return false;
    }
  }
  if (clientFilters.industry) {
    if (!clientFilters.industry.has(normalizeFilterValue(dot.industry))) {
      return false;
    }
  }
  return true;
}

function normalizePublicDot(docSnapshot) {
  const data = docSnapshot.data();
  const normalized = normalizeDevResultToCurrentQuestionSchema({
    id: docSnapshot.id,
    ...data,
  });
  const scores = extractScoresFromResult(normalized);
  if (!scores) {
    console.error("Skipping malformed public dot:", docSnapshot.id);
    return null;
  }
  return {
    ...normalized,
    x: scores.x,
    y: scores.y,
    x_score: scores.x,
    y_score: scores.y,
  };
}

function normalizeArchivePoints(source) {
  if (!source || typeof source !== "object") return [];
  const rawPoints = Array.isArray(source.points) ? source.points : [];
  return rawPoints
    .map((point, index) => {
      const x = Number(point?.x ?? point?.x_score);
      const y = Number(point?.y ?? point?.y_score);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        id:
          typeof point?.id === "string" && point.id.trim()
            ? point.id
            : `archive-${index}`,
        x,
        y,
      };
    })
    .filter(Boolean);
}

function useDropdownMenuLayout(open, rootRef) {
  const [menuPlacement, setMenuPlacement] = useState("down");
  const [menuMaxHeight, setMenuMaxHeight] = useState(DROPDOWN_MENU_MAX_HEIGHT);

  const updateMenuLayout = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportTop = (vv?.offsetTop ?? 0) + DROPDOWN_VIEWPORT_BUFFER;
    const viewportBottom =
      (vv ? vv.offsetTop + vv.height : window.innerHeight) -
      DROPDOWN_VIEWPORT_BUFFER;
    const spaceAbove = rect.top - viewportTop;
    const spaceBelow = viewportBottom - rect.bottom;
    const openUp = spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      0,
      Math.min(
        DROPDOWN_MENU_MAX_HEIGHT,
        Math.floor(openUp ? spaceAbove : spaceBelow),
      ),
    );
    setMenuPlacement(openUp ? "up" : "down");
    setMenuMaxHeight(maxHeight);
  }, [rootRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuLayout();
  }, [open, updateMenuLayout]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => updateMenuLayout();
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, [open, updateMenuLayout]);

  return { menuPlacement, menuMaxHeight, updateMenuLayout };
}

function createAnonymousUuid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateStorageId(storageType, key) {
  try {
    const storage =
      storageType === "session" ? window.sessionStorage : window.localStorage;
    const existing = storage.getItem(key);
    if (existing) return existing;
    const next = createAnonymousUuid();
    storage.setItem(key, next);
    return next;
  } catch {
    return createAnonymousUuid();
  }
}

function readLocalStorageItem(key) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageItem(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write errors.
  }
}

function removeLocalStorageItem(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage remove errors.
  }
}

function readJsonFromLocalStorage(key) {
  const raw = readLocalStorageItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readDevResultPersistenceEnabled() {
  if (!import.meta.env.DEV) return true;
  const raw = readLocalStorageItem(DEV_RESULT_PERSISTENCE_ENABLED_STORAGE_KEY);
  if (raw === "0") return false;
  if (raw === "1") return true;
  return true;
}

function extractScoresFromResult(result) {
  if (!result || typeof result !== "object") return null;
  const x = Number(result.x ?? result.x_score);
  const y = Number(result.y ?? result.y_score);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function extractDeviceUuidFromResult(result) {
  if (!result || typeof result !== "object") return "";
  const fromSnake = result.device_uuid;
  if (typeof fromSnake === "string" && fromSnake.trim()) return fromSnake;
  const fromCamel = result.deviceUuid;
  if (typeof fromCamel === "string" && fromCamel.trim()) return fromCamel;
  return "";
}

function extractResultTimestamp(result) {
  if (!result || typeof result !== "object") return 0;
  const value = Number(result.ts ?? result.created_at);
  return Number.isFinite(value) ? value : 0;
}

function buildPersistableResultSnapshot(scores, userResult) {
  const safeScores = extractScoresFromResult(scores);
  if (!safeScores || !userResult || typeof userResult !== "object") return null;
  return {
    scores: safeScores,
    userResult,
    savedAt: Date.now(),
  };
}

function extractQuizVersionFromRecord(record) {
  if (!record || typeof record !== "object") return "";
  if (typeof record.quizVersion === "string") return record.quizVersion.trim();
  if (typeof record.quiz_version === "string")
    return record.quiz_version.trim();
  return "";
}

function extractQuestionSchemaVersionFromRecord(record) {
  if (!record || typeof record !== "object") return "";
  if (typeof record.questionSchemaVersion === "string") {
    return record.questionSchemaVersion.trim();
  }
  if (typeof record.question_schema_version === "string") {
    return record.question_schema_version.trim();
  }
  return "";
}

function clampLabelText(value, maxChars) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function resolveCssColorVar(name, fallback) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function parseColorToRgb(color) {
  if (typeof color !== "string") return null;
  const raw = color.trim();
  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  const longHex = raw.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return {
      r: parseInt(longHex[1].slice(0, 2), 16),
      g: parseInt(longHex[1].slice(2, 4), 16),
      b: parseInt(longHex[1].slice(4, 6), 16),
    };
  }
  const rgb = raw.match(
    /^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (!rgb) return null;
  return {
    r: Math.max(0, Math.min(255, Number(rgb[1]))),
    g: Math.max(0, Math.min(255, Number(rgb[2]))),
    b: Math.max(0, Math.min(255, Number(rgb[3]))),
  };
}

function createFadedUserDotColor(baseColor) {
  const rgb = parseColorToRgb(baseColor);
  if (!rgb) return "rgba(139, 209, 165, 1)";
  const mixRatioWithWhite = 0.5;
  const alpha = 1;
  const r = Math.round(
    rgb.r * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  const g = Math.round(
    rgb.g * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  const b = Math.round(
    rgb.b * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createWhitenedGreenFromColor(baseColor) {
  const rgb = parseColorToRgb(baseColor);
  if (!rgb) return "rgba(174, 223, 191, 1)";
  const mixRatioWithWhite = 0.28;
  const alpha = 1;
  const r = Math.round(
    rgb.r * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  const g = Math.round(
    rgb.g * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  const b = Math.round(
    rgb.b * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite,
  );
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readInitialPersistedResultState() {
  if (!readDevResultPersistenceEnabled()) {
    return {
      scores: null,
      userResult: null,
      screen: "home",
    };
  }
  const persisted = readJsonFromLocalStorage(LAST_RESULT_STORAGE_KEY);
  const scores = extractScoresFromResult(persisted?.scores);
  const userResult =
    persisted?.userResult && typeof persisted.userResult === "object"
      ? persisted.userResult
      : null;
  const persistedQuizVersion = extractQuizVersionFromRecord(userResult);
  const persistedQuestionSchemaVersion =
    extractQuestionSchemaVersionFromRecord(userResult);
  const isQuestionSchemaMatch =
    persistedQuestionSchemaVersion === "" ||
    persistedQuestionSchemaVersion === QUESTION_SCHEMA_VERSION;
  if (persistedQuizVersion !== QUIZ_VERSION || !isQuestionSchemaMatch) {
    removeLocalStorageItem(LAST_RESULT_STORAGE_KEY);
    return {
      scores: null,
      userResult: null,
      screen: "home",
    };
  }
  const hasPersistedResult = Boolean(scores && userResult);
  return {
    scores: hasPersistedResult ? scores : null,
    userResult: hasPersistedResult ? userResult : null,
    screen: hasPersistedResult ? "results" : "home",
  };
}

function normalizeShortText(value, maxLength = 256) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getLockWindowExpiresAt(timestamp) {
  const base = Number(timestamp);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base + RESUBMIT_LOCK_WINDOW_MS;
}

function getRemainingLockMs(lockExpiresAt, now = Date.now()) {
  const expiresAt = Number(lockExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 0;
  return Math.max(0, expiresAt - now);
}

function formatDayHourCountdown(remainingMs) {
  const safeMs = Math.max(0, Number(remainingMs) || 0);
  if (safeMs <= 0) return "0d 0h";
  const totalHours = Math.ceil(safeMs / HOUR_MS);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

function readRetryAtFromError(error) {
  const retryAt = Number(error?.retryAt);
  if (Number.isFinite(retryAt) && retryAt > 0) return retryAt;
  const retryAfterMs = Number(error?.retryAfterMs);
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Date.now() + retryAfterMs;
  }
  return 0;
}

function readInitialLocalSubmission() {
  const submission = readJsonFromLocalStorage(LAST_SUBMISSION_STORAGE_KEY);
  if (!submission || typeof submission !== "object") return null;
  const storedQuizVersion = normalizeShortText(submission.quizVersion, 32);
  if (storedQuizVersion !== QUIZ_VERSION) {
    removeLocalStorageItem(LAST_SUBMISSION_STORAGE_KEY);
    return null;
  }
  const answers =
    submission.answers && typeof submission.answers === "object"
      ? submission.answers
      : {};
  const answersByQuestionId =
    submission.answersByQuestionId &&
    typeof submission.answersByQuestionId === "object"
      ? submission.answersByQuestionId
      : {};
  const demographics =
    submission.demographics && typeof submission.demographics === "object"
      ? submission.demographics
      : {};
  const createdAt = Number(submission.createdAt);
  const questionSchemaVersion = normalizeShortText(
    submission.questionSchemaVersion || submission.question_schema_version,
    128,
  );
  const normalizedQuestionSchemaVersion =
    questionSchemaVersion || QUESTION_SCHEMA_VERSION;
  if (normalizedQuestionSchemaVersion !== QUESTION_SCHEMA_VERSION) {
    removeLocalStorageItem(LAST_SUBMISSION_STORAGE_KEY);
    return null;
  }
  const questionSchema =
    Array.isArray(submission.questionSchema) ||
    Array.isArray(submission.question_schema)
      ? submission.questionSchema || submission.question_schema
      : QUESTION_SCHEMA;
  return {
    submissionId: normalizeShortText(submission.submissionId, 128),
    quizVersion: storedQuizVersion,
    questionSchemaVersion: normalizedQuestionSchemaVersion,
    questionSchema,
    answers,
    answersByQuestionId,
    xScore: Number(submission.xScore) || 0,
    yScore: Number(submission.yScore) || 0,
    archetype: normalizeShortText(submission.archetype, 128),
    demographics: {
      ageRange: normalizeShortText(
        demographics.ageRange || demographics.age,
        64,
      ),
      country: normalizeShortText(demographics.country, 64),
      industry: normalizeShortText(demographics.industry, 128),
      occupation: normalizeShortText(demographics.occupation, 128),
      notes: normalizeShortText(demographics.notes, 512),
    },
    questionOrder: Array.isArray(submission.questionOrder)
      ? submission.questionOrder
      : [],
    questionKeys: Array.isArray(submission.questionKeys)
      ? submission.questionKeys
      : [],
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
  };
}

function readInitialQuizDraft(localSubmission = null) {
  const draft = readJsonFromLocalStorage(QUIZ_DRAFT_STORAGE_KEY);
  if (!draft || typeof draft !== "object") return null;
  const storedQuizVersion = normalizeShortText(draft.quizVersion, 32);
  if (storedQuizVersion !== QUIZ_VERSION) {
    removeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY);
    return null;
  }
  const questionSchemaVersion = normalizeShortText(
    draft.questionSchemaVersion || draft.question_schema_version,
    128,
  );
  const normalizedQuestionSchemaVersion =
    questionSchemaVersion || QUESTION_SCHEMA_VERSION;
  if (normalizedQuestionSchemaVersion !== QUESTION_SCHEMA_VERSION) {
    removeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY);
    return null;
  }
  const savedAt = Number(draft.savedAt);
  const latestSubmissionCreatedAt = Number(localSubmission?.createdAt);
  if (
    Number.isFinite(savedAt) &&
    Number.isFinite(latestSubmissionCreatedAt) &&
    latestSubmissionCreatedAt > 0 &&
    savedAt <= latestSubmissionCreatedAt
  ) {
    removeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY);
    return null;
  }
  const answers =
    draft.answers && typeof draft.answers === "object" ? draft.answers : {};
  const demographics =
    draft.demographics && typeof draft.demographics === "object"
      ? draft.demographics
      : {};
  return {
    quizVersion: storedQuizVersion,
    questionSchemaVersion: normalizedQuestionSchemaVersion,
    answers,
    demographics: {
      ageRange: normalizeShortText(
        demographics.ageRange || demographics.age,
        64,
      ),
      country: normalizeShortText(demographics.country, 64),
      industry: normalizeShortText(demographics.industry, 128),
      occupation: normalizeShortText(
        demographics.occupation,
        OCCUPATION_CHAR_LIMIT,
      ),
      notes: normalizeShortText(demographics.notes, NOTES_CHAR_LIMIT),
    },
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
  };
}

function buildInitialQuizFormState(localSubmission, quizDraft = null) {
  const answers = {};
  const submissionByKey =
    localSubmission?.answers && typeof localSubmission.answers === "object"
      ? localSubmission.answers
      : {};
  const submissionById =
    localSubmission?.answersByQuestionId &&
    typeof localSubmission.answersByQuestionId === "object"
      ? localSubmission.answersByQuestionId
      : {};
  const draftById =
    quizDraft?.answers && typeof quizDraft.answers === "object"
      ? quizDraft.answers
      : {};
  for (const question of QUESTIONS) {
    const rawValue =
      draftById[question.id] ??
      submissionById[question.id] ??
      submissionByKey[question.answerKey] ??
      null;
    const normalizedValue = normalizeAnswerValue(rawValue);
    if (normalizedValue === null) continue;
    answers[question.id] = normalizedValue;
  }
  const submissionDemo =
    localSubmission?.demographics &&
    typeof localSubmission.demographics === "object"
      ? localSubmission.demographics
      : {};
  const draftDemo =
    quizDraft?.demographics && typeof quizDraft.demographics === "object"
      ? quizDraft.demographics
      : {};
  return {
    answers,
    ageRange: normalizeShortText(
      draftDemo.ageRange ||
        draftDemo.age ||
        submissionDemo.ageRange ||
        submissionDemo.age,
      64,
    ),
    countryCode: normalizeShortText(
      draftDemo.country || submissionDemo.country,
      64,
    ),
    industry: normalizeShortText(
      draftDemo.industry || submissionDemo.industry,
      128,
    ),
    jobTitle: normalizeShortText(
      draftDemo.occupation || submissionDemo.occupation,
      OCCUPATION_CHAR_LIMIT,
    ),
    notes: normalizeShortText(
      draftDemo.notes || submissionDemo.notes,
      NOTES_CHAR_LIMIT,
    ),
  };
}

function buildQuizDraftSnapshot({
  answers,
  ageRange,
  countryCode,
  industry,
  jobTitle,
  notes,
}) {
  const normalizedAnswers = {};
  for (const question of QUESTIONS) {
    const normalizedValue = normalizeAnswerValue(answers?.[question.id]);
    if (normalizedValue === null) continue;
    normalizedAnswers[question.id] = normalizedValue;
  }
  const normalizedDraft = {
    quizVersion: QUIZ_VERSION,
    questionSchemaVersion: QUESTION_SCHEMA_VERSION,
    answers: normalizedAnswers,
    demographics: {
      ageRange: normalizeShortText(ageRange, 64),
      country: normalizeShortText(countryCode, 64),
      industry: normalizeShortText(industry, 128),
      occupation: normalizeShortText(jobTitle, OCCUPATION_CHAR_LIMIT),
      notes: normalizeShortText(notes, NOTES_CHAR_LIMIT),
    },
    savedAt: Date.now(),
  };
  const hasAnswerValues = Object.keys(normalizedAnswers).length > 0;
  const hasDemographicValues = Object.values(normalizedDraft.demographics).some(
    (value) => value !== "",
  );
  if (!hasAnswerValues && !hasDemographicValues) return null;
  return normalizedDraft;
}

function getClientCountryHint() {
  if (typeof navigator === "undefined") return "";
  const locales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const locale of locales) {
    if (typeof locale !== "string") continue;
    const parts = locale.split(/[-_]/);
    const maybeCode = parts[1]?.toUpperCase();
    if (maybeCode && COUNTRY_NAME_BY_CODE[maybeCode]) return maybeCode;
  }
  return "";
}

async function submitCompassResult(payload) {
  if (!COMPASS_SUBMIT_ENDPOINT) {
    throw new Error(
      "Submission endpoint missing. Set VITE_COMPASS_SUBMIT_ENDPOINT.",
    );
  }
  const response = await fetch(COMPASS_SUBMIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body?.error === "string" && body.error.trim() !== ""
        ? body.error
        : `HTTP ${response.status}`;
    const error = new Error(message);
    error.code = typeof body?.code === "string" ? body.code : "";
    error.retryAfterMs = Number(body?.retry_after_ms) || 0;
    error.retryAt = Number(body?.retry_at) || 0;
    throw error;
  }
  return body;
}

function MultiSelectFilter({
  label,
  options,
  disabledValues,
  setDisabledValues,
}) {
  const disabledSet = new Set(disabledValues);
  const enabledCount = options.length - disabledValues.length;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const { menuPlacement, menuMaxHeight, updateMenuLayout } =
    useDropdownMenuLayout(open, rootRef);
  const enabledOptions = options.filter((opt) => !disabledSet.has(opt.value));
  const previewLabel =
    enabledCount === options.length
      ? "All"
      : enabledCount === 0
        ? "N/A"
        : enabledCount === 1
          ? enabledOptions[0].label
          : "Custom...";
  const allEnabled = enabledCount === options.length;
  const selectedGlyph = "✓";
  const allSelectionGlyph = allEnabled ? selectedGlyph : "";
  const toggleOption = (value) =>
    setDisabledValues((prev) => {
      if (prev.length === 0) {
        return options
          .filter((option) => option.value !== value)
          .map((option) => option.value);
      }

      const next = prev.includes(value)
        ? prev.filter((disabledValue) => disabledValue !== value)
        : [...prev, value];

      return next.length === options.length ? [] : next;
    });
  const checklistBoxStyle = {
    width: 16,
    height: 16,
    border:
      "1px solid color-mix(in oklab, var(--color-ink) 45%, var(--color-paper))",
    borderRadius: 4,
    background: THEME.SiteBG,
    color: THEME.SiteText,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const checklistSymbolStyle = {
    display: "inline-block",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 11,
    lineHeight: 1,
    transform: "translate(0.3px, 0.2px)",
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        border: tabBorder(),
        borderRadius: TAB_STYLE_VARS.borderRadius,
        background: TAB_STYLE_VARS.outerBackground,
        padding: "8px 10px",
      }}
    >
      <label
        className="type-subheading"
        style={{
          color: "var(--color-ink)",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span>{label}</span>
      </label>
      <style>
        {`
          .filter-menu-scroll::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      <button
        className="type-body-sm"
        type="button"
        onPointerDown={(e) => {
          if (open) e.stopPropagation();
        }}
        onClick={() => {
          if (!open) {
            updateMenuLayout();
            setOpen(true);
            return;
          }
          setOpen(false);
        }}
        style={{
          width: "100%",
          height: 34,
          padding: "8px 10px",
          background: TAB_STYLE_VARS.outerBackground,
          border: tabBorder(),
          color: "var(--color-ink)",
          borderRadius: TAB_STYLE_VARS.borderRadius,
          outline: "none",
          boxSizing: "border-box",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <span>{previewLabel}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(menuPlacement === "up" ? { bottom: "100%" } : { top: "100%" }),
            background: TAB_STYLE_VARS.menuBackground,
            border: tabBorder(),
            borderRadius: TAB_STYLE_VARS.borderRadius,
            boxShadow:
              "0 8px 20px color-mix(in oklab, var(--color-ink) 8%, transparent)",
            padding: 8,
            zIndex: 30,
          }}
        >
          <div
            className="filter-menu-scroll"
            style={{
              maxHeight: menuMaxHeight,
              overflowY: "auto",
              display: "grid",
              gap: 0,
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <button
              className="type-body-sm"
              type="button"
              onClick={() => setDisabledValues([])}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 8px",
                border: "none",
                background: "transparent",
                color: "var(--color-ink)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={checklistBoxStyle}>
                <span style={checklistSymbolStyle}>{allSelectionGlyph}</span>
              </span>
              <span>All</span>
            </button>
            {options.map((option) => {
              const enabled = !disabledSet.has(option.value);
              const explicitlySelected = !allEnabled && enabled;
              return (
                <button
                  className="type-body-sm"
                  key={option.value}
                  type="button"
                  onClick={() => toggleOption(option.value)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 8px",
                    border: "none",
                    background: "transparent",
                    color: "var(--color-ink)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={checklistBoxStyle}>
                    <span style={checklistSymbolStyle}>
                      {explicitlySelected ? selectedGlyph : ""}
                    </span>
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleSelectDropdown({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  textColor = "var(--color-ink)",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const { menuPlacement, menuMaxHeight, updateMenuLayout } =
    useDropdownMenuLayout(open, rootRef);
  const previewLabel =
    options.find((option) => option.value === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        border: tabBorder(),
        borderRadius: TAB_STYLE_VARS.borderRadius,
        background: TAB_STYLE_VARS.outerBackground,
        padding: "8px 10px",
      }}
    >
      <label
        className="type-subheading"
        style={{
          color: "var(--color-ink)",
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span>{label}</span>
      </label>
      <style>
        {`
          .filter-menu-scroll::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      <button
        className="type-body-sm"
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          if (open) e.stopPropagation();
        }}
        onClick={() => {
          if (disabled) return;
          if (!open) {
            updateMenuLayout();
            setOpen(true);
            return;
          }
          setOpen(false);
        }}
        style={{
          width: "100%",
          height: 34,
          padding: "8px 10px",
          background: TAB_STYLE_VARS.outerBackground,
          border: tabBorder(),
          color: textColor,
          borderRadius: TAB_STYLE_VARS.borderRadius,
          outline: "none",
          boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <span>{previewLabel}</span>
      </button>
      {open && !disabled && (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(menuPlacement === "up" ? { bottom: "100%" } : { top: "100%" }),
            background: TAB_STYLE_VARS.menuBackground,
            border: tabBorder(),
            borderRadius: TAB_STYLE_VARS.borderRadius,
            boxShadow:
              "0 8px 20px color-mix(in oklab, var(--color-ink) 8%, transparent)",
            padding: 8,
            zIndex: 30,
          }}
        >
          <div
            className="filter-menu-scroll"
            style={{
              maxHeight: menuMaxHeight,
              overflowY: "auto",
              display: "grid",
              gap: 0,
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {options.map((option) => (
              <button
                className="type-body-sm"
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 8px",
                  border: "none",
                  background: "transparent",
                  color: textColor,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Compass Visualization ---
function Compass({
  results,
  archivePoints = [],
  userResult,
  activeQuadrant,
  disabledAges,
  disabledCountries,
  disabledIndustries,
  onCanvasDraw,
  showAverageMarker = false,
  showResultMarkers = false,
  perfValves = DEV_PERF_VALVE_DEFAULTS,
}) {
  const svgRef = useRef(null);
  const plotRef = useRef(null);
  const hoveredDotIdRef = useRef(null);
  const hoverFrameRef = useRef(0);
  const pendingPointerRef = useRef(null);
  const dotBitmapUrlRef = useRef("");
  const dotBitmapGenerationRef = useRef(0);
  const [dims, setDims] = useState({ w: 960, h: 520 });
  const [hoveredDotId, setHoveredDotId] = useState(null);
  const [devFps, setDevFps] = useState(0);
  const [dotBitmapUrl, setDotBitmapUrl] = useState("");
  const userDotColor = useMemo(
    () => resolveCssColorVar("--user-button", DEFAULT_USER_DOT_COLOR),
    [],
  );
  const userDotGrayColor = useMemo(
    () => createFadedUserDotColor(userDotColor),
    [userDotColor],
  );
  const axisLabelGap = 10;
  const axisLabelFontSize = 10;
  const xAxisLetterSpacingEm = 0.1;
  const yAxisLetterSpacingEm = 0.02;
  const pad = axisLabelGap + axisLabelFontSize + 2;

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const minHeight = 300;
    const maxHeight = 560;
    const aspectRatio = 0.58;
    const viewportPadding = 24;

    const updateDims = () => {
      const { width } = el.getBoundingClientRect();
      const nextW = Math.max(320, width);
      const availableViewportHeight = Math.max(
        minHeight,
        window.innerHeight - el.getBoundingClientRect().top - viewportPadding,
      );
      const naturalHeight = nextW * aspectRatio;
      const nextH = Math.max(
        minHeight,
        Math.min(maxHeight, naturalHeight, availableViewportHeight),
      );
      setDims({ w: nextW, h: nextH });
    };

    const ro = new ResizeObserver((entries) => {
      if (!entries.length) return;
      updateDims();
    });
    ro.observe(el);
    window.addEventListener("resize", updateDims);
    updateDims();

    return () => {
      window.removeEventListener("resize", updateDims);
      ro.disconnect();
    };
  }, []);

  const cx = dims.w / 2,
    cy = dims.h / 2;
  const xRange = cx - pad;
  const yRange = cy - pad;

  const toSvg = (xVal, yVal) => ({
    sx: cx + xVal * xRange,
    sy: cy - yVal * yRange,
  });

  const quadFill =
    "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))";
  const quadrantFillRects = [
    { key: "topRight", x: cx, y: pad },
    { key: "topLeft", x: pad, y: pad },
    { key: "bottomRight", x: cx, y: cy },
    { key: "bottomLeft", x: pad, y: cy },
  ];
  const axisLabelTextStyle = {
    textAnchor: "middle",
    fill: "var(--color-ink)",
  };
  const axisLabels = [
    {
      key: "top",
      axis: "y",
      x: cx,
      y: pad - axisLabelGap,
      text: "HIGH BELIEF IN LLM POTENTIAL",
    },
    {
      key: "bottom",
      axis: "y",
      x: cx,
      y: dims.h - pad + axisLabelGap + axisLabelFontSize,
      text: "LOW BELIEF IN LLM POTENTIAL",
    },
    {
      key: "left",
      axis: "x",
      x: pad - axisLabelGap,
      y: cy,
      text: "RESTRICT ADVANCEMENT",
      transform: `rotate(-90,${pad - axisLabelGap},${cy})`,
    },
    {
      key: "right",
      axis: "x",
      x: dims.w - pad + axisLabelGap,
      y: cy,
      text: "ACCELERATE ADVANCEMENT",
      transform: `rotate(90,${dims.w - pad + axisLabelGap},${cy})`,
    },
  ];
  const compassLabelTextStyle = {
    textAnchor: "middle",
    dominantBaseline: "middle",
  };
  const compassLabelPositions = [
    { key: "topLeft", x: pad + xRange / 2, y: pad + yRange / 2 },
    { key: "topRight", x: cx + xRange / 2, y: pad + yRange / 2 },
    { key: "bottomLeft", x: pad + xRange / 2, y: cy + yRange / 2 },
    { key: "bottomRight", x: cx + xRange / 2, y: cy + yRange / 2 },
  ];
  const disabledAgeSet = useMemo(() => new Set(disabledAges), [disabledAges]);
  const disabledCountrySet = useMemo(
    () => new Set(disabledCountries),
    [disabledCountries],
  );
  const disabledIndustrySet = useMemo(
    () => new Set(disabledIndustries),
    [disabledIndustries],
  );
  const plotPoints = useMemo(
    () =>
      results.map((dot, i) => {
        const sx = cx + dot.x * xRange;
        const sy = cy - dot.y * yRange;
        const isUser = Boolean(userResult && dot.id === userResult.id);
        const dotRadius = COMPASS_DOT_GEOMETRY.radius;
        const quadrant = getQuadrant(dot.x, dot.y);
        return {
          id: dot.id || `idx-${i}`,
          dot,
          sx,
          sy,
          color: isUser ? userDotColor : QUADRANT_INFO[quadrant].color,
          isUser,
          dotRadius,
          hitRadius: dotRadius * 2,
          enabled:
            isUser ||
            (!disabledAgeSet.has(normalizeFilterValue(dot.age)) &&
              !disabledCountrySet.has(normalizeFilterValue(dot.country)) &&
              !disabledIndustrySet.has(normalizeFilterValue(dot.industry))),
        };
      }),
    [
      results,
      userResult,
      cx,
      cy,
      xRange,
      yRange,
      disabledAgeSet,
      disabledCountrySet,
      disabledIndustrySet,
      userDotColor,
    ],
  );
  const plotPointById = useMemo(
    () => new Map(plotPoints.map((point) => [point.id, point])),
    [plotPoints],
  );
  const hasCanvasPoints = plotPoints.length + archivePoints.length > 0;
  const shouldRenderDotBitmap = !perfValves.noCanvas && hasCanvasPoints;
  const dotBitmapDpr = Math.min(
    window.devicePixelRatio || 1,
    COMPASS_DOT_BITMAP_DPR,
  );
  const activeHoveredPoint = hoveredDotId
    ? plotPointById.get(hoveredDotId) || null
    : null;
  const activeHoveredDot =
    activeHoveredPoint && activeHoveredPoint.enabled
      ? activeHoveredPoint.dot
      : null;
  const userScores = useMemo(
    () => extractScoresFromResult(userResult),
    [userResult],
  );
  const userMarkerPoint = useMemo(() => {
    if (!showResultMarkers || !userScores) return null;
    return {
      sx: cx + userScores.x * xRange,
      sy: cy - userScores.y * yRange,
    };
  }, [showResultMarkers, userScores, cx, cy, xRange, yRange]);
  const globalAverageScores = useMemo(() => {
    if (!showAverageMarker) return null;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const result of results) {
      const pointScores = extractScoresFromResult(result);
      if (!pointScores) continue;
      sumX += pointScores.x;
      sumY += pointScores.y;
      count += 1;
    }
    if (count === 0) return null;
    return {
      x: sumX / count,
      y: sumY / count,
    };
  }, [showAverageMarker, results]);
  const globalAveragePoint = useMemo(() => {
    if (!globalAverageScores) return null;
    return {
      sx: cx + globalAverageScores.x * xRange,
      sy: cy - globalAverageScores.y * yRange,
    };
  }, [globalAverageScores, cx, cy, xRange, yRange]);

  useEffect(() => {
    const generation = dotBitmapGenerationRef.current + 1;
    dotBitmapGenerationRef.current = generation;

    if (!shouldRenderDotBitmap) {
      const previousUrl = dotBitmapUrlRef.current;
      dotBitmapUrlRef.current = "";
      queueMicrotask(() => {
        if (dotBitmapGenerationRef.current !== generation) return;
        setDotBitmapUrl("");
      });
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      onCanvasDraw?.();
      return;
    }

    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixelWidth = Math.max(1, Math.round(dims.w * dotBitmapDpr));
    const pixelHeight = Math.max(1, Math.round(dims.h * dotBitmapDpr));
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.imageSmoothingEnabled = false;

    const markerSize = Math.max(
      1,
      Math.round(COMPASS_DOT_GEOMETRY.size * dotBitmapDpr),
    );
    const markerOffset = markerSize / 2;
    const getMarkerRect = (sx, sy) => ({
      x: Math.round(sx * dotBitmapDpr - markerOffset),
      y: Math.round(sy * dotBitmapDpr - markerOffset),
      size: markerSize,
    });

    const drawDot = (point, color) => {
      const rect = getMarkerRect(point.sx, point.sy);
      ctx.fillStyle = color;
      ctx.fillRect(rect.x, rect.y, rect.size, rect.size);
    };
    const drawArchiveDot = (point) => {
      const sx = cx + point.x * xRange;
      const sy = cy - point.y * yRange;
      const rect = getMarkerRect(sx, sy);
      ctx.fillStyle = GRAY;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(rect.x, rect.y, rect.size, rect.size);
      ctx.globalAlpha = 1;
    };

    ctx.clearRect(0, 0, pixelWidth, pixelHeight);

    for (const point of archivePoints) {
      drawArchiveDot(point);
    }

    // Draw gray dots first so enabled dots always sit above them.
    for (const point of plotPoints) {
      if (!point.enabled && !point.isUser) drawDot(point, GRAY);
    }
    for (const point of plotPoints) {
      if (!point.enabled && point.isUser) drawDot(point, userDotGrayColor);
    }
    for (const point of plotPoints) {
      if (point.enabled && !point.isUser) drawDot(point, COMPASS_DOT_COLOR);
    }
    for (const point of plotPoints) {
      if (point.enabled && point.isUser) drawDot(point, userDotColor);
    }

    canvas.toBlob((blob) => {
      if (cancelled || !blob || dotBitmapGenerationRef.current !== generation) {
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      const previousUrl = dotBitmapUrlRef.current;
      dotBitmapUrlRef.current = nextUrl;
      setDotBitmapUrl(nextUrl);
      if (previousUrl) {
        setTimeout(() => URL.revokeObjectURL(previousUrl), 0);
      }
      onCanvasDraw?.();
    });

    return () => {
      cancelled = true;
    };
  }, [
    plotPoints,
    dims.w,
    dims.h,
    onCanvasDraw,
    userDotColor,
    userDotGrayColor,
    archivePoints,
    cx,
    cy,
    xRange,
    yRange,
    dotBitmapDpr,
    shouldRenderDotBitmap,
  ]);

  useEffect(
    () => () => {
      if (hoverFrameRef.current) {
        cancelAnimationFrame(hoverFrameRef.current);
      }
      const previousUrl = dotBitmapUrlRef.current;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
        dotBitmapUrlRef.current = "";
      }
    },
    [],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || perfValves.noFpsMeter) return;
    let rafId = 0;
    let frameCount = 0;
    let sampleStart = performance.now();

    const tick = (now) => {
      frameCount += 1;
      const elapsed = now - sampleStart;
      if (elapsed >= 500) {
        const nextFps = (frameCount * 1000) / elapsed;
        setDevFps(nextFps);
        frameCount = 0;
        sampleStart = now;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [perfValves.noFpsMeter]);

  const updateHoveredPointFromPointer = (clientX, clientY) => {
    const plotElement = plotRef.current;
    if (!plotElement) return;
    const rect = plotElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const pointerX = ((clientX - rect.left) / rect.width) * dims.w;
    const pointerY = ((clientY - rect.top) / rect.height) * dims.h;

    let bestMatch = null;
    let bestDistanceSq = Infinity;
    for (const point of plotPoints) {
      if (!point.enabled) continue;
      const dx = pointerX - point.sx;
      const dy = pointerY - point.sy;
      const radius = point.hitRadius + 2;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radius * radius && distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestMatch = point;
      }
    }

    const nextHoveredDotId = bestMatch ? bestMatch.id : null;
    if (hoveredDotIdRef.current !== nextHoveredDotId) {
      hoveredDotIdRef.current = nextHoveredDotId;
      setHoveredDotId(nextHoveredDotId);
    }
  };

  const handlePlotMouseMove = (event) => {
    pendingPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (hoverFrameRef.current) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = 0;
      const pointer = pendingPointerRef.current;
      if (!pointer) return;
      updateHoveredPointFromPointer(pointer.clientX, pointer.clientY);
    });
  };

  const handlePlotMouseLeave = () => {
    pendingPointerRef.current = null;
    if (hoverFrameRef.current) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = 0;
    }
    if (hoveredDotIdRef.current !== null) {
      hoveredDotIdRef.current = null;
      setHoveredDotId(null);
    }
  };

  return (
    <div
      ref={plotRef}
      onMouseMove={handlePlotMouseMove}
      onMouseLeave={handlePlotMouseLeave}
      style={{
        position: "relative",
        width: "100%",
        height: perfValves.noSvg ? dims.h : undefined,
        margin: "0 auto",
      }}
    >
      {!perfValves.noSvg && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          style={{ width: "100%", height: "auto", display: "block", zIndex: 1 }}
        >
          {/* Quadrant fills */}
          {quadrantFillRects.map(({ key, x, y }) => (
            <rect
              key={key}
              x={x}
              y={y}
              width={xRange}
              height={yRange}
              fill={quadFill}
              opacity={activeQuadrant === key ? 1 : 0}
            />
          ))}

          {/* Axes */}
          <line
            x1={cx}
            y1={pad}
            x2={cx}
            y2={dims.h - pad}
            stroke={GRAY}
            strokeWidth={1}
          />
          <line
            x1={pad}
            y1={cy}
            x2={dims.w - pad}
            y2={cy}
            stroke={GRAY}
            strokeWidth={1}
          />

          {/* Border */}
          <rect
            x={pad}
            y={pad}
            width={xRange * 2}
            height={yRange * 2}
            fill="none"
            stroke={GRAY}
            strokeWidth={1}
          />

          {/* Axis labels */}
          {axisLabels.map(({ key, axis, x, y, text, transform }) => (
            <text
              className="type-caption"
              key={key}
              x={x}
              y={y}
              transform={transform}
              style={{
                letterSpacing: `${
                  axis === "y" ? yAxisLetterSpacingEm : xAxisLetterSpacingEm
                }em`,
              }}
              {...axisLabelTextStyle}
            >
              {text}
            </text>
          ))}

          {/* Quadrant labels */}
          {compassLabelPositions.map(({ key, x, y }) => (
            <text
              className="type-caption"
              key={key}
              x={x}
              y={y}
              fill={GRAY}
              {...compassLabelTextStyle}
            >
              {QUADRANT_INFO[key].compassLabel.toUpperCase()}
            </text>
          ))}
        </svg>
      )}

      {dotBitmapUrl && (
        <img
          src={dotBitmapUrl}
          aria-hidden="true"
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      )}

      {!perfValves.noSvg && (
        <svg
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {showResultMarkers && userMarkerPoint && (
            <>
              <rect
                x={userMarkerPoint.sx - COMPASS_DOT_GEOMETRY.radius}
                y={userMarkerPoint.sy - COMPASS_DOT_GEOMETRY.radius}
                width={COMPASS_DOT_GEOMETRY.size}
                height={COMPASS_DOT_GEOMETRY.size}
                fill={userDotColor}
              />
              <text
                className="type-caption color-ink"
                x={userMarkerPoint.sx}
                y={userMarkerPoint.sy - COMPASS_DOT_GEOMETRY.radius - 8}
                fill="currentColor"
                textAnchor="middle"
              >
                YOU
              </text>
            </>
          )}
          {showAverageMarker && globalAveragePoint && (
            <>
              <rect
                x={globalAveragePoint.sx - COMPASS_DOT_GEOMETRY.radius}
                y={globalAveragePoint.sy - COMPASS_DOT_GEOMETRY.radius}
                width={COMPASS_DOT_GEOMETRY.size}
                height={COMPASS_DOT_GEOMETRY.size}
                fill={GRAY}
              />
              <text
                className="type-caption color-muted"
                x={globalAveragePoint.sx}
                y={globalAveragePoint.sy + COMPASS_DOT_GEOMETRY.radius + 6}
                fill="currentColor"
                textAnchor="middle"
                dominantBaseline="hanging"
              >
                AVG
              </text>
            </>
          )}
          {[activeHoveredPoint]
            .filter((point) => point && point.enabled)
            .map((point) => (
              <rect
                key={`pulse-${point.id}`}
                x={point.sx - COMPASS_DOT_GEOMETRY.hoverRingRadius}
                y={point.sy - COMPASS_DOT_GEOMETRY.hoverRingRadius}
                width={COMPASS_DOT_GEOMETRY.hoverRingRadius * 2}
                height={COMPASS_DOT_GEOMETRY.hoverRingRadius * 2}
                fill="none"
                stroke={point.color}
                strokeWidth={1.5}
                opacity={0.6}
              >
                <animate
                  attributeName="x"
                  values={`${point.sx - COMPASS_DOT_GEOMETRY.hoverRingRadius};${point.sx - COMPASS_DOT_GEOMETRY.hoverRingPulseRadius};${point.sx - COMPASS_DOT_GEOMETRY.hoverRingRadius}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values={`${point.sy - COMPASS_DOT_GEOMETRY.hoverRingRadius};${point.sy - COMPASS_DOT_GEOMETRY.hoverRingPulseRadius};${point.sy - COMPASS_DOT_GEOMETRY.hoverRingRadius}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="width"
                  values={`${COMPASS_DOT_GEOMETRY.hoverRingRadius * 2};${COMPASS_DOT_GEOMETRY.hoverRingPulseRadius * 2};${COMPASS_DOT_GEOMETRY.hoverRingRadius * 2}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="height"
                  values={`${COMPASS_DOT_GEOMETRY.hoverRingRadius * 2};${COMPASS_DOT_GEOMETRY.hoverRingPulseRadius * 2};${COMPASS_DOT_GEOMETRY.hoverRingRadius * 2}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.6;0.2;0.6"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </rect>
            ))}
        </svg>
      )}

      {/* Tooltip for hovered dot */}
      {activeHoveredDot &&
        (() => {
          const { sx, sy } = toSvg(activeHoveredDot.x, activeHoveredDot.y);
          const isRight = sx > cx;
          const isBottom = sy > cy;
          const clampedHoverNotes = clampLabelText(
            activeHoveredDot.notes,
            NOTES_CHAR_LIMIT,
          );
          const noteText = clampedHoverNotes;
          const hasNotes = noteText.length > 0;
          const tooltipTextNudgeYPx = -2;
          const tooltipStyle = {
            position: "absolute",
            left: `${(sx / dims.w) * 100}%`,
            top: `${(sy / dims.h) * 100}%`,
            transform: `translate(${isRight ? "calc(-100% - 12px)" : "12px"}, ${isBottom ? "calc(-100% - 8px)" : "8px"})`,
            background: THEME.SiteText,
            border: `1px solid ${THEME.SiteBorder}`,
            borderRadius: "var(--radius-base)",
            padding: hasNotes ? "12px 16px" : "14px 16px 11px",
            minWidth: 180,
            zIndex: 10,
          };
          return (
            <div style={tooltipStyle}>
              <div
                style={{ transform: `translateY(${tooltipTextNudgeYPx}px)` }}
              >
                {(() => {
                  const clampedTitle = clampLabelText(
                    activeHoveredDot.occupation,
                    OCCUPATION_CHAR_LIMIT,
                  );
                  const titleBase = clampedTitle || "Anonymous";
                  const title = activeHoveredPoint?.isUser
                    ? `${titleBase} (You)`
                    : titleBase;
                  const country =
                    activeHoveredDot.country &&
                    COUNTRY_NAME_BY_CODE[activeHoveredDot.country]
                      ? COUNTRY_NAME_BY_CODE[activeHoveredDot.country]
                      : "";
                  const ageRaw = activeHoveredDot.age?.trim() || "";
                  const age = ageRaw ? getAgeRangeLabel(ageRaw) : "";
                  const details = [country, age].filter(Boolean).join(", ");
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: THEME.SiteBG,
                        lineHeight: hasNotes ? 1.15 : 1.05,
                      }}
                    >
                      <strong>{title}</strong>
                      {details ? `, ${details}` : ""}
                    </div>
                  );
                })()}
                {hasNotes && (
                  <div
                    style={{
                      fontSize: 12,
                      color: THEME.SiteBG,
                      marginTop: 4,
                      lineHeight: 1.2,
                      fontStyle: "italic",
                    }}
                  >
                    "{noteText}"
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      {import.meta.env.DEV && !perfValves.noFpsMeter && (
        <div
          className="type-caption"
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            padding: "4px 6px",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--color-ink)",
            background:
              "color-mix(in oklab, var(--color-paper) 88%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--color-ink) 22%, var(--color-paper))",
            borderRadius: "var(--radius-base)",
            pointerEvents: "none",
            zIndex: 12,
          }}
        >
          FPS {Math.round(devFps)} · PTS {plotPoints.length}
        </div>
      )}
    </div>
  );
}

// --- Quiz Page ---
function QuizPage({
  onComplete,
  onProgressChange,
  initialSubmission = null,
  initialDraft = null,
  onDraftChange,
  editAnswersEnabled = false,
  editAnswersUnlocked = false,
  resetAnswersRequest = 0,
  questionAveragesById = {},
  submitError = "",
}) {
  const orderedQuestions = QUESTIONS;
  const initialFormState = useMemo(
    () => buildInitialQuizFormState(initialSubmission, initialDraft),
    [initialSubmission, initialDraft],
  );
  const initialSubmittedFormState = useMemo(
    () => buildInitialQuizFormState(initialSubmission),
    [initialSubmission],
  );
  const [answers, setAnswers] = useState(() => initialFormState.answers);
  const [ageRange, setAgeRange] = useState(() => initialFormState.ageRange);
  const [countryCode, setCountryCode] = useState(
    () => initialFormState.countryCode,
  );
  const [ipCountryCode] = useState(() => getClientCountryHint());
  const [industry, setIndustry] = useState(() => initialFormState.industry);
  const [jobTitle, setJobTitle] = useState(() => initialFormState.jobTitle);
  const [notes, setNotes] = useState(() => initialFormState.notes);
  const lastResetAnswersRequestRef = useRef(resetAnswersRequest);
  const [sliderVisualWidthPx, setSliderVisualWidthPx] = useState(0);
  const [lockCountdownNow, setLockCountdownNow] = useState(() => Date.now());
  const hasSavedAnswers =
    Object.keys(initialSubmittedFormState.answers).length > 0;
  const resubmitLockExpiresAt = getLockWindowExpiresAt(
    initialSubmission?.createdAt,
  );
  const remainingLockMs = getRemainingLockMs(
    resubmitLockExpiresAt,
    lockCountdownNow,
  );
  const answersLocked = hasSavedAnswers && remainingLockMs > 0;
  const isRetakeReady = hasSavedAnswers && remainingLockMs <= 0;
  const needsEditToResubmit = isRetakeReady && !editAnswersUnlocked;
  const isEditingPaused =
    isRetakeReady && editAnswersUnlocked && !editAnswersEnabled;
  const inputsLocked = answersLocked || needsEditToResubmit || isEditingPaused;
  const isLabelSlidersState =
    answersLocked || (isRetakeReady && !editAnswersEnabled);
  const resubmitCountdown = formatDayHourCountdown(remainingLockMs);
  const allAnswered = orderedQuestions.every(
    (q) => answers[q.id] !== undefined,
  );
  const answeredCount = orderedQuestions.filter(
    (question) => answers[question.id] !== undefined,
  ).length;
  const hasDemographicSelections =
    ageRange !== "" && countryCode !== "" && industry !== "";
  const missingDemographicLabels = [
    ageRange === "" ? "Age Range" : "",
    countryCode === "" ? "Country" : "",
    industry === "" ? "Industry" : "",
  ].filter(Boolean);
  const missingDemographicText =
    missingDemographicLabels.length === 1
      ? missingDemographicLabels[0]
      : missingDemographicLabels.length === 2
        ? `${missingDemographicLabels[0]} and ${missingDemographicLabels[1]}`
        : `${missingDemographicLabels
            .slice(0, -1)
            .join(", ")}, and ${missingDemographicLabels.at(-1)}`;
  const canSubmit =
    !answersLocked &&
    !needsEditToResubmit &&
    allAnswered &&
    hasDemographicSelections;
  const normalizedCountry =
    countryCode === PREFER_NOT_TO_SAY_VALUE ? "" : countryCode;
  const normalizedAge = ageRange === PREFER_NOT_TO_SAY_VALUE ? "" : ageRange;
  const normalizedIndustry =
    industry === PREFER_NOT_TO_SAY_VALUE ? "" : industry;
  const quizAgeOptions = useMemo(
    () => [
      { value: PREFER_NOT_TO_SAY_VALUE, label: "Prefer not to say" },
      ...AGE_RANGES.map((age) => ({
        value: age,
        label: getAgeRangeLabel(age),
      })),
    ],
    [],
  );
  const quizCountryOptions = useMemo(() => {
    const orderedCountries = COUNTRY_OPTIONS.filter(
      (country) => country.code !== ipCountryCode,
    ).map((country) => ({
      value: country.code,
      label:
        COUNTRY_NAME_BY_CODE[country.code] || formatCountryName(country.name),
    }));
    const ipOption =
      ipCountryCode && COUNTRY_NAME_BY_CODE[ipCountryCode]
        ? [{ value: ipCountryCode, label: COUNTRY_NAME_BY_CODE[ipCountryCode] }]
        : [];
    return [
      { value: PREFER_NOT_TO_SAY_VALUE, label: "Prefer not to say" },
      ...ipOption,
      ...orderedCountries,
    ];
  }, [ipCountryCode]);
  const quizIndustryOptions = useMemo(
    () => [
      { value: PREFER_NOT_TO_SAY_VALUE, label: "Prefer not to say" },
      ...INDUSTRY_OPTIONS.map((option) => ({
        value: option,
        label: option,
      })),
    ],
    [],
  );
  const trimmedJobTitle = jobTitle.slice(0, OCCUPATION_CHAR_LIMIT);
  const trimmedNotes = notes.slice(0, NOTES_CHAR_LIMIT);
  const hasEditedFromLastSubmitted = useMemo(() => {
    if (!hasSavedAnswers) return false;
    for (const question of orderedQuestions) {
      const initialValue = normalizeAnswerValue(
        initialSubmittedFormState.answers[question.id],
      );
      const currentValue = normalizeAnswerValue(answers[question.id]);
      if (initialValue !== currentValue) return true;
    }
    if (ageRange !== initialSubmittedFormState.ageRange) return true;
    if (countryCode !== initialSubmittedFormState.countryCode) return true;
    if (industry !== initialSubmittedFormState.industry) return true;
    if (trimmedJobTitle !== initialSubmittedFormState.jobTitle) return true;
    if (trimmedNotes !== initialSubmittedFormState.notes) return true;
    return false;
  }, [
    hasSavedAnswers,
    orderedQuestions,
    initialSubmittedFormState.answers,
    initialSubmittedFormState.ageRange,
    initialSubmittedFormState.countryCode,
    initialSubmittedFormState.industry,
    initialSubmittedFormState.jobTitle,
    initialSubmittedFormState.notes,
    answers,
    ageRange,
    countryCode,
    industry,
    trimmedJobTitle,
    trimmedNotes,
  ]);
  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: TAB_STYLE_VARS.formBackground,
    border: tabBorder(),
    color: "var(--color-ink)",
    borderRadius: TAB_STYLE_VARS.borderRadius,
    outline: "none",
    boxSizing: "border-box",
  };
  const lockedFieldTextColor = inputsLocked ? GRAY : "var(--color-ink)";
  const userDotColor = useMemo(
    () => resolveCssColorVar("--user-button", DEFAULT_USER_DOT_COLOR),
    [],
  );
  const labelSliderIconColor = useMemo(
    () => createWhitenedGreenFromColor(createFadedUserDotColor(userDotColor)),
    [userDotColor],
  );
  const fieldLabelStyle = {
    color: "var(--color-ink)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    textAlign: "left",
  };

  useEffect(() => {
    onProgressChange?.({
      answered: answeredCount,
      total: orderedQuestions.length,
      canSubmit,
      canEditAnswers: isRetakeReady,
      editAnswersEnabled,
      editAnswersUnlocked,
      hasEditedFromLastSubmitted,
    });
  }, [
    answeredCount,
    orderedQuestions.length,
    canSubmit,
    isRetakeReady,
    editAnswersEnabled,
    editAnswersUnlocked,
    hasEditedFromLastSubmitted,
    onProgressChange,
  ]);

  useEffect(() => {
    if (lastResetAnswersRequestRef.current === resetAnswersRequest) return;
    lastResetAnswersRequestRef.current = resetAnswersRequest;
    if (!hasSavedAnswers) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAnswers(initialSubmittedFormState.answers);
      setAgeRange(initialSubmittedFormState.ageRange);
      setCountryCode(initialSubmittedFormState.countryCode);
      setIndustry(initialSubmittedFormState.industry);
      setJobTitle(initialSubmittedFormState.jobTitle);
      setNotes(initialSubmittedFormState.notes);
    });
    return () => {
      cancelled = true;
    };
  }, [
    resetAnswersRequest,
    hasSavedAnswers,
    initialSubmittedFormState.answers,
    initialSubmittedFormState.ageRange,
    initialSubmittedFormState.countryCode,
    initialSubmittedFormState.industry,
    initialSubmittedFormState.jobTitle,
    initialSubmittedFormState.notes,
  ]);

  useEffect(() => {
    const nextDraft = buildQuizDraftSnapshot({
      answers,
      ageRange,
      countryCode,
      industry,
      jobTitle: trimmedJobTitle,
      notes: trimmedNotes,
    });
    onDraftChange?.(
      hasSavedAnswers && !hasEditedFromLastSubmitted ? null : nextDraft,
    );
  }, [
    answers,
    ageRange,
    countryCode,
    industry,
    trimmedJobTitle,
    trimmedNotes,
    hasSavedAnswers,
    hasEditedFromLastSubmitted,
    onDraftChange,
  ]);

  useEffect(() => {
    if (!hasSavedAnswers) {
      return;
    }
    const timer = setInterval(() => {
      setLockCountdownNow(Date.now());
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [hasSavedAnswers]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <style>{`
        .response-slider-wrap {
          --slider-thumb-color: ${THEME.SiteText};
          --slider-rail-color: ${THEME.SiteText};
          position: relative;
          width: 100%;
          height: 18px;
          display: flex;
          align-items: center;
        }

        .response-slider-wrap.is-locked {
          --slider-thumb-color: ${GRAY};
          --slider-rail-color: ${GRAY};
        }

        .response-slider-wrap.is-label-sliders {
          --slider-thumb-color: ${labelSliderIconColor};
        }

        .response-slider-rail {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 6px;
          border: 1px solid var(--slider-rail-color);
          border-radius: 999px;
          background: transparent;
          pointer-events: none;
          box-sizing: border-box;
          z-index: 1;
          transition: border-color 1s ease;
        }

        .response-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          margin: 0;
          height: 18px;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          outline: none;
          overflow: visible;
          position: relative;
          z-index: 2;
        }

        .response-slider::-webkit-slider-runnable-track {
          height: ${RESPONSE_SLIDER_TRACK_SIZE_PX}px;
          border-radius: 999px;
          background: transparent;
          border: 0;
        }

        .response-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          height: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          margin-top: ${(RESPONSE_SLIDER_TRACK_SIZE_PX - RESPONSE_SLIDER_THUMB_SIZE_PX) / 2}px;
          border-radius: 50%;
          background: var(--slider-thumb-color);
          border: 1px solid var(--slider-thumb-color);
          box-shadow: none;
          box-sizing: border-box;
          transition:
            background-color 1s ease,
            border-color 1s ease;
        }

        .response-slider::-moz-range-track {
          height: ${RESPONSE_SLIDER_TRACK_SIZE_PX}px;
          border-radius: 999px;
          background: transparent;
          border: 0;
        }

        .response-slider::-moz-range-thumb {
          width: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          height: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          border-radius: 50%;
          background: var(--slider-thumb-color);
          border: 1px solid var(--slider-thumb-color);
          box-shadow: none;
          box-sizing: border-box;
          transition:
            background-color 1s ease,
            border-color 1s ease;
        }

        .response-slider.is-unanswered::-webkit-slider-thumb {
          background: ${THEME.SiteBG};
          border: 1px solid ${THEME.SiteText};
        }

        .response-slider.is-unanswered::-moz-range-thumb {
          background: ${THEME.SiteBG};
          border: 1px solid ${THEME.SiteText};
        }

        .response-slider.is-locked {
          cursor: not-allowed;
        }

        .response-slider-user-label {
          position: absolute;
          top: 50%;
          transform: translate(
            -50%,
            calc(-100% - ${RESPONSE_SLIDER_THUMB_SIZE_PX / 2 + RESPONSE_SLIDER_LABEL_MARGIN_PX}px)
          );
          margin: ${RESPONSE_SLIDER_LABEL_MARGIN_PX}px 0;
          white-space: nowrap;
          color: var(--color-ink);
          pointer-events: none;
          z-index: 3;
          opacity: 0;
        }

        .response-slider-user-label.is-visible {
          opacity: 1;
        }

        .response-slider-avg-thumb {
          position: absolute;
          top: 50%;
          width: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          height: ${RESPONSE_SLIDER_THUMB_SIZE_PX}px;
          border-radius: 50%;
          background: ${GRAY};
          border: 1px solid ${GRAY};
          box-sizing: border-box;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 2;
          opacity: 0;
        }

        .response-slider-avg-thumb.is-visible {
          opacity: 1;
        }

      `}</style>
      {/* Questions */}
      {orderedQuestions.map((q, i) => {
        const answerValue = answers[q.id];
        const sliderValue = answerValue ?? 0;
        const sliderThumbPercent = Math.max(
          0,
          Math.min(
            100,
            ((sliderValue - RESPONSE_RANGE.min) /
              (RESPONSE_RANGE.max - RESPONSE_RANGE.min)) *
              100,
          ),
        );
        const sliderThumbCenterLeft = `calc(${RESPONSE_SLIDER_THUMB_SIZE_PX / 2}px + (${sliderThumbPercent} * (100% - ${RESPONSE_SLIDER_THUMB_SIZE_PX}px) / 100))`;
        const hasAnsweredValue = answerValue !== undefined;
        const showSliderYouLabel = isLabelSlidersState && hasAnsweredValue;
        const avgValue = Number(questionAveragesById[q.id]);
        const hasAverageValue = Number.isFinite(avgValue);
        const avgThumbPercent = hasAverageValue
          ? Math.max(
              0,
              Math.min(
                100,
                ((avgValue - RESPONSE_RANGE.min) /
                  (RESPONSE_RANGE.max - RESPONSE_RANGE.min)) *
                  100,
              ),
            )
          : 0;
        const avgThumbCenterLeft = `calc(${RESPONSE_SLIDER_THUMB_SIZE_PX / 2}px + (${avgThumbPercent} * (100% - ${RESPONSE_SLIDER_THUMB_SIZE_PX}px) / 100))`;
        const showSliderAvgMarker = isLabelSlidersState && hasAverageValue;
        const thumbCenterDistancePx =
          (Math.abs(sliderThumbPercent - avgThumbPercent) / 100) *
          Math.max(0, sliderVisualWidthPx - RESPONSE_SLIDER_THUMB_SIZE_PX);
        const thumbsOverlap =
          hasAnsweredValue &&
          hasAverageValue &&
          sliderVisualWidthPx > 0 &&
          thumbCenterDistancePx <= RESPONSE_SLIDER_THUMB_RADIUS_PX * 2;
        const showSliderAvgLabel = showSliderAvgMarker && !thumbsOverlap;
        return (
          <div
            key={q.id}
            style={{
              marginTop: i === 0 ? 0 : 0,
              marginBottom: 20,
              padding: "80px 40px",
              background:
                answerValue !== undefined
                  ? "color-mix(in oklab, var(--color-ink) 1.5%, var(--color-paper))"
                  : THEME.SiteBG,
              border:
                answerValue !== undefined
                  ? `1px solid ${THEME.SiteText}`
                  : `1px solid ${THEME.SiteBorder}`,
              borderRadius: "var(--radius-base)",
              transition: "background-color 1s ease, border-color 1s ease",
            }}
          >
            <div
              className="type-label"
              style={{
                color: "var(--color-ink)",
                marginBottom: 8,
              }}
            >
              Q{i + 1}
            </div>
            <div
              className="type-body"
              style={{
                color: "var(--color-ink)",
                marginBottom: 16,
              }}
            >
              {q.text}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                className={`response-slider-wrap ${inputsLocked ? "is-locked" : ""} ${
                  isLabelSlidersState ? "is-label-sliders" : ""
                }`}
              >
                <div className="response-slider-rail" />
                {hasAnsweredValue && (
                  <span
                    className={`type-caption-small response-slider-user-label ${
                      showSliderYouLabel ? "is-visible" : ""
                    }`}
                    style={{ left: sliderThumbCenterLeft }}
                  >
                    YOU
                  </span>
                )}
                {hasAverageValue && (
                  <>
                    <span
                      className={`response-slider-avg-thumb ${
                        showSliderAvgMarker ? "is-visible" : ""
                      }`}
                      style={{ left: avgThumbCenterLeft }}
                    />
                    <span
                      className={`type-caption-small response-slider-user-label ${
                        showSliderAvgLabel ? "is-visible" : ""
                      }`}
                      style={{ left: avgThumbCenterLeft }}
                    >
                      AVG
                    </span>
                  </>
                )}
                <input
                  className={`response-slider ${
                    answerValue === undefined ? "is-unanswered" : ""
                  } ${inputsLocked ? "is-locked" : ""}`}
                  type="range"
                  min={RESPONSE_RANGE.min}
                  max={RESPONSE_RANGE.max}
                  step={RESPONSE_RANGE.step}
                  value={sliderValue}
                  ref={(node) => {
                    if (!node) return;
                    const nextWidth = Math.round(
                      node.getBoundingClientRect().width,
                    );
                    if (
                      Number.isFinite(nextWidth) &&
                      nextWidth > 0 &&
                      nextWidth !== sliderVisualWidthPx
                    ) {
                      setSliderVisualWidthPx(nextWidth);
                    }
                  }}
                  disabled={inputsLocked}
                  aria-label={`Response slider for question ${i + 1}`}
                  onChange={(e) =>
                    inputsLocked
                      ? undefined
                      : setAnswers((prev) => ({
                          ...prev,
                          [q.id]: Number(e.target.value),
                        }))
                  }
                />
              </div>
              <div
                className="type-caption"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--color-ink)",
                }}
              >
                <span>Strongly Disagree</span>
                <span>Strongly Agree</span>
              </div>
            </div>
          </div>
        );
      })}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {allAnswered && !hasDemographicSelections && (
          <div
            className="type-body-sm"
            style={{
              color: "#b00020",
              textAlign: "right",
            }}
          >
            Please select Age Range, Country, and Industry.
          </div>
        )}
        <div>
          <SingleSelectDropdown
            label="Age Range"
            value={ageRange}
            onChange={setAgeRange}
            options={quizAgeOptions}
            placeholder="Select..."
            disabled={inputsLocked}
            textColor={lockedFieldTextColor}
          />
        </div>
        <div>
          <SingleSelectDropdown
            label="Country"
            value={countryCode}
            onChange={setCountryCode}
            options={quizCountryOptions}
            placeholder="Select..."
            disabled={inputsLocked}
            textColor={lockedFieldTextColor}
          />
        </div>
        <div>
          <SingleSelectDropdown
            label="Industry"
            value={industry}
            onChange={setIndustry}
            options={quizIndustryOptions}
            placeholder="Select..."
            disabled={inputsLocked}
            textColor={lockedFieldTextColor}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>
            <span className="type-subheading">Job Title</span>
            <span className="type-label">
              {trimmedJobTitle.length}/{OCCUPATION_CHAR_LIMIT}
            </span>
          </label>
          <input
            className="type-body"
            value={jobTitle}
            onChange={(e) =>
              inputsLocked ? undefined : setJobTitle(e.target.value)
            }
            placeholder={inputsLocked ? "" : "e.g. Software Engineer"}
            maxLength={OCCUPATION_CHAR_LIMIT}
            disabled={inputsLocked}
            style={{
              ...inputStyle,
              color: lockedFieldTextColor,
              cursor: inputsLocked ? "not-allowed" : "text",
            }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>
            <span className="type-subheading">Additional Notes</span>
            <span className="type-label">
              {trimmedNotes.length}/{NOTES_CHAR_LIMIT}
            </span>
          </label>
          <textarea
            className="type-body"
            value={notes}
            onChange={(e) =>
              inputsLocked
                ? undefined
                : setNotes(e.target.value.replace(/[\r\n]+/g, " "))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={
              inputsLocked ? "" : "Anything else you'd like to share"
            }
            maxLength={NOTES_CHAR_LIMIT}
            disabled={inputsLocked}
            rows={3}
            style={{
              ...inputStyle,
              color: lockedFieldTextColor,
              height: 88,
              minHeight: 88,
              maxHeight: 88,
              resize: "none",
              cursor: inputsLocked ? "not-allowed" : "text",
            }}
          />
        </div>
      </div>

      {/* Bottom submit */}
      <div style={{ textAlign: "center", marginTop: 16, paddingBottom: 20 }}>
        <button
          className="type-body"
          onClick={() =>
            canSubmit &&
            onComplete({
              answers,
              questionOrder: orderedQuestions.map((question) => question.id),
              demographics: {
                age: normalizedAge,
                country: normalizedCountry,
                industry: normalizedIndustry,
                occupation: trimmedJobTitle,
                notes: trimmedNotes,
              },
            })
          }
          disabled={!canSubmit}
          style={{
            padding: "14px 40px",
            fontWeight: "var(--font-weight-semibold)",
            background: canSubmit
              ? "linear-gradient(135deg, #000000, #2c2c2c)"
              : "color-mix(in oklab, var(--color-ink) 3%, var(--color-paper))",
            border: "none",
            color: canSubmit
              ? "var(--color-paper)"
              : "color-mix(in oklab, var(--color-ink) 35%, var(--color-paper))",
            borderRadius: "var(--radius-base)",
            cursor: canSubmit ? "pointer" : "default",
            transition: "all 0.3s",
          }}
        >
          {canSubmit ? (
            hasEditedFromLastSubmitted ? (
              "Resubmit"
            ) : (
              "See Results"
            )
          ) : answersLocked ? (
            `Resubmission opens in ${resubmitCountdown}`
          ) : needsEditToResubmit ? (
            "SELECT 'EDIT ANSWERS' TO RESUBMIT"
          ) : !allAnswered ? (
            <span className="type-label">
              {`Answer all ${orderedQuestions.length} questions to continue`}
            </span>
          ) : (
            `Select ${missingDemographicText} to continue`
          )}
        </button>
        {submitError && (
          <div
            className="type-body-sm app-error-message"
            style={{
              "--app-error-max-width": "520px",
              "--app-error-margin": "10px auto 0",
            }}
          >
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main App ---
export default function AICompass() {
  const initialLocalSubmission = useMemo(
    () => readInitialLocalSubmission(),
    [],
  );
  const initialQuizDraft = useMemo(
    () => readInitialQuizDraft(initialLocalSubmission),
    [initialLocalSubmission],
  );
  const initialPersistedResultState = useMemo(
    () => readInitialPersistedResultState(),
    [],
  );
  const [screen, setScreen] = useState(
    initialQuizDraft ? "quiz" : initialPersistedResultState.screen,
  ); // home, quiz, results
  const [scores, setScores] = useState(initialPersistedResultState.scores);
  const [quizProgress, setQuizProgress] = useState({
    answered: 0,
    total: QUESTIONS.length,
    canSubmit: false,
    canEditAnswers: false,
    editAnswersEnabled: false,
    editAnswersUnlocked: false,
    hasEditedFromLastSubmitted: false,
  });
  const [quizEditAnswersEnabled, setQuizEditAnswersEnabled] = useState(false);
  const [quizEditAnswersUnlocked, setQuizEditAnswersUnlocked] = useState(false);
  const [quizResetAnswersRequest, setQuizResetAnswersRequest] = useState(0);
  const [results, setResults] = useState([]);
  const [archivePoints, setArchivePoints] = useState([]);
  const [questionAveragesById, setQuestionAveragesById] = useState({});
  const [userResult, setUserResult] = useState(
    initialPersistedResultState.userResult,
  );
  const [latestLocalSubmission, setLatestLocalSubmission] = useState(
    initialLocalSubmission,
  );
  const [quizDraft, setQuizDraft] = useState(initialQuizDraft);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const [pinnedQuadrant, setPinnedQuadrant] = useState(null);
  const [firestoreError, setFirestoreError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearingDevDots, setClearingDevDots] = useState(false);
  const [devResultPersistenceEnabled, setDevResultPersistenceEnabled] =
    useState(() => readDevResultPersistenceEnabled());
  const [devRetakableDummyEnabled, setDevRetakableDummyEnabled] =
    useState(false);
  const [devPerfValves, setDevPerfValves] = useState(DEV_PERF_VALVE_DEFAULTS);
  const [disabledAges, setDisabledAges] = useState([]);
  const [disabledCountries, setDisabledCountries] = useState([]);
  const [disabledIndustries, setDisabledIndustries] = useState([]);
  const [filterIpCountryCode] = useState(() => getClientCountryHint());
  const localDeviceId = useMemo(
    () => getOrCreateStorageId("local", DEVICE_ID_STORAGE_KEY),
    [],
  );
  const [hasInitialResultsSnapshot, setHasInitialResultsSnapshot] =
    useState(false);
  const [homeCanvasDrawn, setHomeCanvasDrawn] = useState(false);
  const [showHomeLoading, setShowHomeLoading] = useState(true);
  const [submissionLockRetryAt, setSubmissionLockRetryAt] = useState(0);
  const [lockCountdownNow, setLockCountdownNow] = useState(() => Date.now());
  const lockCountdownText = useMemo(() => {
    const remaining = getRemainingLockMs(
      submissionLockRetryAt,
      lockCountdownNow,
    );
    if (remaining <= 0) return "";
    return formatDayHourCountdown(remaining);
  }, [submissionLockRetryAt, lockCountdownNow]);
  const resetQuizProgress = () =>
    setQuizProgress({
      answered: 0,
      total: QUESTIONS.length,
      canSubmit: false,
      canEditAnswers: false,
      editAnswersEnabled: false,
      editAnswersUnlocked: false,
      hasEditedFromLastSubmitted: false,
    });
  const handleQuizDraftChange = useCallback((nextDraft) => {
    setSubmitError("");
    setQuizDraft(nextDraft);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    writeLocalStorageItem(
      DEV_RESULT_PERSISTENCE_ENABLED_STORAGE_KEY,
      devResultPersistenceEnabled ? "1" : "0",
    );
  }, [devResultPersistenceEnabled]);

  useEffect(() => {
    if (!devResultPersistenceEnabled) return;
    const snapshot = buildPersistableResultSnapshot(scores, userResult);
    if (!snapshot) return;
    writeLocalStorageItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [devResultPersistenceEnabled, scores, userResult]);

  useEffect(() => {
    if (!latestLocalSubmission) return;
    writeLocalStorageItem(
      LAST_SUBMISSION_STORAGE_KEY,
      JSON.stringify(latestLocalSubmission),
    );
  }, [latestLocalSubmission]);

  useEffect(() => {
    if (!quizDraft) {
      removeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY);
      return;
    }
    writeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY, JSON.stringify(quizDraft));
  }, [quizDraft]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLockCountdownNow(Date.now());
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (devPerfValves.noFirestore) {
      return;
    }
    let cancelled = false;
    getDoc(
      doc(
        db,
        COMPASS_PUBLIC_DOT_ARCHIVE_COLLECTION,
        COMPASS_PUBLIC_DOT_ARCHIVE_DOC_ID,
      ),
    )
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        setArchivePoints(normalizeArchivePoints(snapshot.data()));
      })
      .catch((error) => {
        console.error("Firestore archive load error:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [devPerfValves.noFirestore]);

  // Load the public map once, then listen only for dots created after this page
  // session started. The submitter's own dot remains optimistic via userResult.
  useEffect(() => {
    if (devPerfValves.noFirestore) {
      queueMicrotask(() => {
        setHasInitialResultsSnapshot(true);
        setFirestoreError("");
      });
      return;
    }
    let cancelled = false;
    const pageLoadStartedAt = Date.now();
    const publicDotsCollection = collection(db, COMPASS_PUBLIC_DOTS_COLLECTION);
    const ageOptionValues = [...AGE_RANGES, UNSPECIFIED_FILTER_VALUE];
    const countryOptionValues = [
      ...COUNTRY_OPTIONS.map((country) => country.code),
      UNSPECIFIED_FILTER_VALUE,
    ];
    const industryOptionValues = [
      ...INDUSTRY_OPTIONS,
      UNSPECIFIED_FILTER_VALUE,
    ];
    const selectedAges = ageOptionValues.filter(
      (value) => !disabledAges.includes(value),
    );
    const selectedCountries = countryOptionValues.filter(
      (value) => !disabledCountries.includes(value),
    );
    const selectedIndustries = industryOptionValues.filter(
      (value) => !disabledIndustries.includes(value),
    );
    const queryFilters = [];
    const clientFilters = {};
    let hasInFilter = false;
    let hasEmptyFilter = false;
    const addFilter = (field, selectedValues, optionCount) => {
      const filter = buildPublicDotQueryFilter(
        field,
        selectedValues,
        optionCount,
      );
      if (filter.empty) {
        hasEmptyFilter = true;
        return;
      }
      const constraint = filter.constraints[0];
      if (constraint) {
        const usesIn = selectedValues.length > 1;
        if (!usesIn || !hasInFilter) {
          queryFilters.push(constraint);
          if (usesIn) hasInFilter = true;
          return;
        }
      }
      if (filter.clientValues) {
        clientFilters[field] = new Set(filter.clientValues);
      }
    };
    addFilter("age", selectedAges, ageOptionValues.length);
    addFilter("country", selectedCountries, countryOptionValues.length);
    addFilter("industry", selectedIndustries, industryOptionValues.length);
    const normalizePublicDots = (docs) =>
      docs
        .map(normalizePublicDot)
        .filter(Boolean)
        .filter((dot) => publicDotMatchesClientFilters(dot, clientFilters));
    const mergePublicDots = (prev, nextDots) => {
      const byId = new Map();
      for (const dot of prev) {
        const id = typeof dot?.id === "string" ? dot.id : "";
        if (id) byId.set(id, dot);
      }
      for (const dot of nextDots) {
        const id = typeof dot?.id === "string" ? dot.id : "";
        if (id) byId.set(id, dot);
      }
      return [...byId.values()]
        .sort((a, b) => extractResultTimestamp(b) - extractResultTimestamp(a))
        .slice(0, INTERACTIVE_DOT_LIMIT);
    };

    if (hasEmptyFilter) {
      queueMicrotask(() => {
        if (cancelled) return;
        setResults([]);
        setHasInitialResultsSnapshot(true);
      });
      return () => {
        cancelled = true;
      };
    }

    getDocs(
      query(
        publicDotsCollection,
        ...queryFilters,
        orderBy("ts", "desc"),
        limit(INTERACTIVE_DOT_LIMIT),
      ),
    )
      .then((snapshot) => {
        if (cancelled) return;
        const nextResults = normalizePublicDots(snapshot.docs);
        setHasInitialResultsSnapshot(true);
        setFirestoreError("");
        setResults(nextResults.slice(0, INTERACTIVE_DOT_LIMIT));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Firestore initial load error:", error);
        setHasInitialResultsSnapshot(true);
        setFirestoreError("The live map is temporarily unavailable.");
      });

    const recentResultsQuery = query(
      publicDotsCollection,
      ...queryFilters,
      where("ts", ">", pageLoadStartedAt),
      orderBy("ts", "desc"),
      limit(INTERACTIVE_DOT_LIMIT),
    );

    const unsubscribe = onSnapshot(
      recentResultsQuery,
      (snapshot) => {
        if (cancelled) return;
        const nextResults = normalizePublicDots(snapshot.docs);
        setFirestoreError("");
        setResults((prev) => {
          const removedIds = new Set(
            snapshot
              .docChanges()
              .filter((change) => change.type === "removed")
              .map((change) => change.doc.id),
          );
          const keptResults = removedIds.size
            ? prev.filter((dot) => !removedIds.has(dot.id))
            : prev;
          return mergePublicDots(keptResults, nextResults);
        });
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    disabledAges,
    disabledCountries,
    disabledIndustries,
    devPerfValves.noFirestore,
  ]);

  useEffect(() => {
    if (devPerfValves.noFirestore) {
      return;
    }
    const questionAveragesRef = doc(
      db,
      COMPASS_METRICS_COLLECTION,
      QUESTION_AVERAGES_DOC_ID,
    );
    const unsubscribe = onSnapshot(
      questionAveragesRef,
      (snapshot) => {
        const nextAveragesById = buildQuestionAverageByIdMap(
          snapshot.exists() ? snapshot.data()?.questions_by_id : null,
        );
        setQuestionAveragesById(nextAveragesById);
      },
      (error) => {
        console.error("Question averages onSnapshot error:", error);
        setQuestionAveragesById({});
      },
    );
    return unsubscribe;
  }, [devPerfValves.noFirestore]);
  const handleHomeCanvasDraw = useCallback(() => {
    setHomeCanvasDrawn((prev) => (prev ? prev : true));
  }, []);

  const handleQuizComplete = ({
    answers,
    questionOrder = [],
    demographics = {},
  }) => {
    const s = calculateScores(answers);
    setScores(s);
    handleSubmit(
      demographics,
      s,
      {
        answers,
        questionOrder,
      },
      {},
    );
  };

  const handleSubmit = (
    demo = {},
    overrideScores = null,
    questionData = {},
    options = {},
  ) => {
    const isDevSubmit = options?.is_dev === true;
    const activeScores = overrideScores || scores;
    if (!activeScores) return;
    setSubmitting(true);
    setSubmitError("");
    const questionAnalytics = buildQuestionAnalyticsPayload(
      questionData.answers || {},
      questionData.questionOrder || [],
    );
    const demographicSegments = buildDemographicSegments(demo);
    const quadrantKey = getQuadrant(activeScores.x, activeScores.y);
    const archetype = QUADRANT_INFO[quadrantKey]?.name || "";
    const clientCreatedAt = Date.now();
    const entry = {
      x: activeScores.x,
      y: activeScores.y,
      x_score: activeScores.x,
      y_score: activeScores.y,
      archetype,
      age: demo.age || "",
      country: demo.country || "",
      industry: demo.industry || "",
      occupation: demo.occupation || "",
      notes: demo.notes || "",
      demographics: {
        age: demo.age || "",
        country: demo.country || "",
        industry: demo.industry || "",
        occupation: demo.occupation || "",
        notes: demo.notes || "",
      },
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      ...questionAnalytics,
      question_schema_version: questionAnalytics.questionSchemaVersion,
      questionSchemaVersion: questionAnalytics.questionSchemaVersion,
      question_schema: questionAnalytics.questionSchema,
      answers: questionAnalytics.questionValuesByKey,
      segments: demographicSegments,
      is_repeat_ip_24h: false,
      is_repeat_device_24h: false,
      include_in_default_aggregate: true,
      include_in_device_priority_aggregate: true,
      repeat_classification: "first_or_stale",
      repeat_group_id: "",
      created_at: clientCreatedAt,
      is_dev: isDevSubmit,
      ts: clientCreatedAt,
    };
    const localId = `local-${Date.now()}`;
    const localSubmissionSnapshot = {
      submissionId: localId,
      quizVersion: QUIZ_VERSION,
      questionSchemaVersion: questionAnalytics.questionSchemaVersion,
      questionSchema: questionAnalytics.questionSchema,
      answers: questionAnalytics.questionValuesByKey,
      answersByQuestionId: questionAnalytics.questionValues,
      xScore: activeScores.x,
      yScore: activeScores.y,
      archetype,
      demographics: {
        ageRange: demo.age || "",
        country: demo.country || "",
        industry: demo.industry || "",
        occupation: demo.occupation || "",
        notes: demo.notes || "",
      },
      questionOrder: questionAnalytics.questionOrder,
      questionKeys: questionAnalytics.questionKeys,
      createdAt: clientCreatedAt,
    };

    const stallTimer = setTimeout(() => {
      setSubmitError(
        "We could not save your result yet. Your answers are still saved on this device.",
      );
      setSubmitting(false);
    }, 8000);

    const payload = {
      quiz_version: QUIZ_VERSION,
      question_schema_version: questionAnalytics.questionSchemaVersion,
      question_schema: questionAnalytics.questionSchema,
      x_score: activeScores.x,
      y_score: activeScores.y,
      archetype,
      demographics: entry.demographics,
      question_order: questionAnalytics.questionOrder,
      question_keys: questionAnalytics.questionKeys,
      question_values: questionAnalytics.questionValues,
      answers: questionAnalytics.questionValuesByKey,
      question_responses: questionAnalytics.questionResponses,
      question_medians: questionAnalytics.questionMedians,
      segments: demographicSegments,
      result_schema_version: RESULT_SCHEMA_VERSION,
      is_dev: isDevSubmit,
      client_created_at: clientCreatedAt,
      device_uuid: getOrCreateStorageId("local", DEVICE_ID_STORAGE_KEY),
      session_uuid: getOrCreateStorageId("session", SESSION_ID_STORAGE_KEY),
      user_agent: navigator.userAgent || "",
    };

    submitCompassResult(payload)
      .then((responseBody) => {
        const saved = responseBody?.submission;
        if (!saved || typeof saved !== "object") {
          throw new Error("Invalid submit response");
        }
        const savedId = saved.submission_id || saved.id || localId;
        const mergedSavedEntry = {
          ...entry,
          ...saved,
          id: savedId,
        };
        const normalizedSavedEntry = isDevSubmit
          ? normalizeDevResultToCurrentQuestionSchema(mergedSavedEntry)
          : mergedSavedEntry;
        setFirestoreError("");
        setSubmitError("");
        setSubmissionLockRetryAt(0);
        if (isDevSubmit && !COMPASS_SUBMIT_ENDPOINT) {
          setResults((prev) => {
            return [
              ...prev.filter((dot) => dot.id !== savedId),
              normalizedSavedEntry,
            ];
          });
        }
        setUserResult(normalizedSavedEntry);
        setScreen("results");
        setQuizDraft(null);
        setLatestLocalSubmission({
          ...localSubmissionSnapshot,
          submissionId: savedId,
          createdAt: Number(saved.created_at ?? saved.ts) || clientCreatedAt,
        });
      })
      .catch((error) => {
        console.error("Survey submission error:", error);
        if (error?.code === "answers_locked") {
          const fallbackRetryAt = getLockWindowExpiresAt(
            latestLocalSubmission?.createdAt,
          );
          const retryAt = readRetryAtFromError(error) || fallbackRetryAt;
          setSubmissionLockRetryAt(retryAt);
          setFirestoreError("");
          setSubmitError("");
          return;
        }
        setSubmissionLockRetryAt(0);
        setSubmitError(
          error?.code === "ip_rate_limited"
            ? "Too many submissions from this network. Please try again later."
            : "We could not save your result yet. Your answers are still saved on this device.",
        );
      })
      .finally(() => {
        clearTimeout(stallTimer);
        setSubmitting(false);
      });
  };

  const handleDevShortcutSubmit = () => {
    const randomAge = pickWeightedValue(DEV_AGE_WEIGHTS);
    const randomCountry = pickWeightedValue(DEV_LOCATION_WEIGHTS);
    const randomIndustry = pickDevIndustry(randomAge);
    let randomOccupation = pickDevOccupation(randomIndustry, randomAge);
    const usedOccupationKeys = new Set(
      [...results, userResult]
        .filter(Boolean)
        .map((dot) => normalizeOccupationForComparison(dot.occupation))
        .filter(Boolean),
    );
    const randomOccupationKey =
      normalizeOccupationForComparison(randomOccupation);
    if (randomOccupationKey && usedOccupationKeys.has(randomOccupationKey)) {
      randomOccupation = usedOccupationKeys.has("anonymous") ? "" : "Anonymous";
    }

    const scoreCluster =
      randomIndustry === "IT & Software"
        ? DEV_IT_SOFTWARE_CLUSTER
        : DEV_FINANCE_DEFENSE_INDUSTRIES.has(randomIndustry)
          ? DEV_FINANCE_DEFENSE_CLUSTER
          : DEV_OTHER_CLUSTER;

    const devScores = sampleTrendlineCompliantScores(scoreCluster);
    setScores(devScores);
    const devAnswers = Object.fromEntries(
      QUESTIONS.map((question) => [
        question.id,
        Number(
          (
            Math.random() * (RESPONSE_RANGE.max - RESPONSE_RANGE.min) +
            RESPONSE_RANGE.min
          ).toFixed(2),
        ),
      ]),
    );
    handleSubmit(
      {
        age: randomAge,
        country: randomCountry,
        industry: randomIndustry,
        occupation: randomOccupation,
      },
      devScores,
      {
        answers: devAnswers,
        questionOrder: QUESTIONS.map((question) => question.id),
      },
      { is_dev: true },
    );
  };

  const handleClearDevDots = async () => {
    setClearingDevDots(true);
    try {
      const allDocsSnap = await getDocs(
        collection(db, COMPASS_PUBLIC_DOTS_COLLECTION),
      );

      const docsToDelete = allDocsSnap.docs.filter((docSnap) => {
        const data = docSnap.data();
        return isDevRecord(data);
      });

      await Promise.all(docsToDelete.map((docSnap) => deleteDoc(docSnap.ref)));
      setResults((prev) => prev.filter((r) => !isDevRecord(r)));
      setUserResult((prev) => (isDevRecord(prev) ? null : prev));
      setFirestoreError("");
    } catch (error) {
      console.error("Clear dev dots error:", error);
      setFirestoreError("Unable to clear dev dots right now.");
    } finally {
      setClearingDevDots(false);
    }
  };

  const buildDummyDevState = () => {
    const now = Date.now();
    const dummyAnswersById = Object.fromEntries(
      QUESTIONS.map((question) => [
        question.id,
        Number(
          (
            Math.random() * (RESPONSE_RANGE.max - RESPONSE_RANGE.min) +
            RESPONSE_RANGE.min
          ).toFixed(2),
        ),
      ]),
    );
    const dummyQuestionAnalytics = buildQuestionAnalyticsPayload(
      dummyAnswersById,
      QUESTIONS.map((question) => question.id),
    );
    const dummyScores = calculateScores(dummyAnswersById);
    const archetype =
      QUADRANT_INFO[getQuadrant(dummyScores.x, dummyScores.y)].name;
    const dummyUserResult = normalizeDevResultToCurrentQuestionSchema({
      id: `${LOCAL_DEV_DUMMY_RESULT_ID_PREFIX}${now}`,
      x: dummyScores.x,
      y: dummyScores.y,
      x_score: dummyScores.x,
      y_score: dummyScores.y,
      archetype,
      age: "35-44",
      country: "US",
      industry: "IT & Software",
      occupation: "Anonymous",
      notes: "",
      demographics: {
        age: "35-44",
        country: "US",
        industry: "IT & Software",
        occupation: "Anonymous",
        notes: "",
      },
      ...dummyQuestionAnalytics,
      question_schema_version: dummyQuestionAnalytics.questionSchemaVersion,
      questionSchemaVersion: dummyQuestionAnalytics.questionSchemaVersion,
      question_schema: dummyQuestionAnalytics.questionSchema,
      answers: dummyQuestionAnalytics.questionValuesByKey,
      is_dev: true,
      created_at: now,
      ts: now,
      device_uuid: localDeviceId,
      deviceUuid: localDeviceId,
    });
    const dummyLocalSubmission = {
      submissionId: dummyUserResult.id,
      quizVersion: QUIZ_VERSION,
      questionSchemaVersion: dummyQuestionAnalytics.questionSchemaVersion,
      questionSchema: dummyQuestionAnalytics.questionSchema,
      answers: dummyQuestionAnalytics.questionValuesByKey,
      answersByQuestionId: dummyQuestionAnalytics.questionValues,
      xScore: dummyScores.x,
      yScore: dummyScores.y,
      archetype,
      demographics: {
        ageRange: "35-44",
        country: "US",
        industry: "IT & Software",
        occupation: "Anonymous",
        notes: "",
      },
      questionOrder: dummyQuestionAnalytics.questionOrder,
      questionKeys: dummyQuestionAnalytics.questionKeys,
      // Dev convenience: start from a 23h remaining lock window.
      createdAt: now - HOUR_MS,
    };
    return { dummyScores, dummyUserResult, dummyLocalSubmission };
  };

  const handleToggleDevResultPersistence = () => {
    const nextEnabled = !devResultPersistenceEnabled;
    setDevResultPersistenceEnabled(nextEnabled);
    setDevRetakableDummyEnabled(false);
    if (!nextEnabled) {
      removeLocalStorageItem(LAST_RESULT_STORAGE_KEY);
      removeLocalStorageItem(LAST_SUBMISSION_STORAGE_KEY);
      removeLocalStorageItem(QUIZ_DRAFT_STORAGE_KEY);
      setQuizDraft(null);
      setLatestLocalSubmission(null);
      setUserResult(null);
      setScores(null);
      setScreen("home");
      return;
    }
    // Dev-only unified toggle behavior: enabling always loads a dummy user dot.
    const { dummyScores, dummyUserResult, dummyLocalSubmission } =
      buildDummyDevState();
    setScores(dummyScores);
    setUserResult(dummyUserResult);
    setLatestLocalSubmission(dummyLocalSubmission);
    setSubmissionLockRetryAt(0);
    setFirestoreError("");
    resetQuizProgress();
    setScreen("results");
  };

  const handleToggleDummyRetakable = () => {
    if (!devResultPersistenceEnabled) return;
    const nextRetakable = !devRetakableDummyEnabled;
    const { dummyScores, dummyUserResult, dummyLocalSubmission } =
      buildDummyDevState();
    const now = Date.now();
    setDevRetakableDummyEnabled(nextRetakable);
    setDevResultPersistenceEnabled(true);
    if (!scores) {
      setScores(dummyScores);
    }
    if (!userResult) {
      setUserResult(dummyUserResult);
    }
    setLatestLocalSubmission((prev) => {
      const base =
        prev && typeof prev === "object" ? prev : dummyLocalSubmission;
      return {
        ...base,
        createdAt: nextRetakable ? now - (DAY_MS + HOUR_MS) : now - HOUR_MS,
      };
    });
    setQuizEditAnswersEnabled(nextRetakable);
    setQuizEditAnswersUnlocked(nextRetakable);
    setSubmissionLockRetryAt(0);
    setFirestoreError("");
    resetQuizProgress();
    setScreen("results");
  };
  const handleShowDevErrors = () => {
    setFirestoreError("The live map is temporarily unavailable.");
    setSubmitError(
      "We could not save your result yet. Your answers are still saved on this device.",
    );
  };

  const fallbackSubmissionScores = useMemo(() => {
    const x = Number(latestLocalSubmission?.xScore);
    const y = Number(latestLocalSubmission?.yScore);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }, [latestLocalSubmission]);
  const resultScores = scores || fallbackSubmissionScores;
  const quadrant = resultScores
    ? getQuadrant(resultScores.x, resultScores.y)
    : null;
  const qi = quadrant ? QUADRANT_INFO[quadrant] : null;
  const resultArchetypeName =
    qi?.name || latestLocalSubmission?.archetype || "Unknown";
  const resultArchetypeDesc = qi?.desc || "";
  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;

    const archetype = resultArchetypeName || "Unknown";
    const message = `I'm a ${archetype}. Where do you stand on AI?`;
    const shareUrl = window.location.href;
    const shareText = `${message} ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "The AI Compass",
          text: message,
          url: shareUrl,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        return;
      } catch {
        // Continue to web share fallback when clipboard is unavailable.
      }
    }

    const tweetIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(tweetIntent, "_blank", "noopener,noreferrer");
  }, [resultArchetypeName]);
  const hasCompletedQuiz = Boolean(
    (latestLocalSubmission?.answersByQuestionId &&
      typeof latestLocalSubmission.answersByQuestionId === "object" &&
      Object.keys(latestLocalSubmission.answersByQuestionId).length > 0) ||
    (userResult && typeof userResult === "object"),
  );
  const visibleResults = useMemo(() => {
    // Keep the current user's dot independent of the capped public feed.
    const withUser =
      userResult && !results.some((result) => result.id === userResult.id)
        ? [...results, userResult]
        : results;
    if (devResultPersistenceEnabled) return withUser;
    return withUser.filter((result) => {
      const id = typeof result?.id === "string" ? result.id : "";
      if (userResult && id === userResult.id) return true;
      if (id.startsWith(LOCAL_DEV_DUMMY_RESULT_ID_PREFIX)) return false;
      return extractDeviceUuidFromResult(result) !== localDeviceId;
    });
  }, [results, userResult, devResultPersistenceEnabled, localDeviceId]);
  const effectiveVisibleResults = devPerfValves.noFirestore
    ? []
    : visibleResults;
  const effectiveArchivePoints = devPerfValves.noFirestore ? [] : archivePoints;
  const effectiveQuestionAveragesById = devPerfValves.noFirestore
    ? {}
    : questionAveragesById;
  const showCompassView = screen === "home" || screen === "results";
  const showHomepageChrome = showCompassView;
  const showHeaderActionRow = screen === "home" || screen === "quiz";
  const showResultsStrip = screen === "results" && hasCompletedQuiz;
  const activeQuadrant = pinnedQuadrant || hoveredQuadrant;
  const homeBodyReady = hasInitialResultsSnapshot && homeCanvasDrawn;
  const effectiveHomeBodyReady = true;
  const showEffectiveHomeLoading =
    !devPerfValves.noLoadingFade && showHomeLoading && !homeBodyReady;
  const toggleDevPerfValve = (key) => {
    setDevPerfValves((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };
  const resetDevPerfValves = () => {
    setDevPerfValves(DEV_PERF_VALVE_DEFAULTS);
  };
  const devPerfValvePanel = import.meta.env.DEV ? (
    <div
      style={{
        margin: "0 auto 12px",
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap",
        background:
          "color-mix(in oklab, var(--color-ink) 5%, var(--color-paper))",
        border:
          "1px solid color-mix(in oklab, var(--color-ink) 12%, var(--color-paper))",
        borderRadius: "var(--radius-base)",
      }}
    >
      <span
        className="type-caption"
        style={{
          color: "var(--color-ink)",
          marginRight: 2,
        }}
      >
        PERF
      </span>
      {DEV_PERF_VALVE_OPTIONS.map(({ key, label }) => {
        const enabled = devPerfValves[key];
        return (
          <button
            key={key}
            className="type-caption"
            type="button"
            onClick={() => toggleDevPerfValve(key)}
            style={{
              padding: "6px 8px",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 18%, var(--color-paper))",
              borderRadius: "var(--radius-base)",
              background: enabled ? "var(--color-ink)" : "var(--color-paper)",
              color: enabled ? "var(--color-paper)" : "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            {enabled ? "NO " : ""}
            {label}
          </button>
        );
      })}
      <button
        className="type-caption"
        type="button"
        onClick={resetDevPerfValves}
        style={{
          padding: "6px 8px",
          border:
            "1px solid color-mix(in oklab, var(--color-ink) 18%, var(--color-paper))",
          borderRadius: "var(--radius-base)",
          background: "transparent",
          color: "var(--color-ink)",
          cursor: "pointer",
        }}
      >
        RESET
      </button>
    </div>
  ) : null;
  useEffect(() => {
    if (!homeBodyReady || !showHomeLoading) return;
    const timeoutId = setTimeout(() => {
      setShowHomeLoading(false);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [homeBodyReady, showHomeLoading]);
  const ageFilterOptions = useMemo(
    () => [
      ...AGE_RANGES.map((age) => ({
        value: age,
        label: getAgeRangeLabel(age),
      })),
      { value: UNSPECIFIED_FILTER_VALUE, label: "Unspecified" },
    ],
    [],
  );
  const industryFilterOptions = useMemo(
    () => [
      ...INDUSTRY_OPTIONS.map((industry) => ({
        value: industry,
        label: industry,
      })),
      { value: UNSPECIFIED_FILTER_VALUE, label: "Unspecified" },
    ],
    [],
  );
  const countryFilterOptions = useMemo(() => {
    const options = COUNTRY_OPTIONS.map((country) => ({
      value: country.code,
      label:
        COUNTRY_NAME_BY_CODE[country.code] || formatCountryName(country.name),
    }));
    if (filterIpCountryCode) {
      const pinned = options.find(
        (option) => option.value === filterIpCountryCode,
      );
      if (pinned) {
        const rest = options.filter(
          (option) => option.value !== filterIpCountryCode,
        );
        return [
          pinned,
          ...rest,
          { value: UNSPECIFIED_FILTER_VALUE, label: "Unspecified" },
        ];
      }
    }
    return [
      ...options,
      { value: UNSPECIFIED_FILTER_VALUE, label: "Unspecified" },
    ];
  }, [filterIpCountryCode]);

  useEffect(() => {
    if (screen !== "results") return;
    if (!submitting) return;

    const safety = setTimeout(() => {
      setSubmitting(false);
    }, 12000);

    return () => clearTimeout(safety);
  }, [screen, submitting]);

  const homepageBelowCompassContent = (
    <>
      {/* Keep homepage body content here so it appears in both home and results states. */}
      <div
        className="homepage-filter-grid"
        style={{
          marginTop: HOME_SECTION_GAP,
          display: "grid",
          gap: 10,
        }}
      >
        <MultiSelectFilter
          label="AGE"
          options={ageFilterOptions}
          disabledValues={disabledAges}
          setDisabledValues={setDisabledAges}
        />
        <MultiSelectFilter
          label="LOCATION"
          options={countryFilterOptions}
          disabledValues={disabledCountries}
          setDisabledValues={setDisabledCountries}
        />
        <MultiSelectFilter
          label="INDUSTRY"
          options={industryFilterOptions}
          disabledValues={disabledIndustries}
          setDisabledValues={setDisabledIndustries}
        />
      </div>

      <div
        style={{
          width: "100%",
          margin: `${HOME_SECTION_GAP}px auto 0`,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {ARCHETYPE_GRID_ORDER.map((key) => {
          const val = QUADRANT_INFO[key];
          return (
            <div
              key={key}
              onMouseEnter={() => {
                if (!pinnedQuadrant) setHoveredQuadrant(key);
              }}
              onMouseLeave={() => {
                if (!pinnedQuadrant) setHoveredQuadrant(null);
              }}
              onClick={() =>
                setPinnedQuadrant((prev) => {
                  if (prev === key) return null;
                  setHoveredQuadrant(null);
                  return key;
                })
              }
              style={{
                padding: "24px 14px",
                background: TAB_STYLE_VARS.outerBackground,
                border:
                  activeQuadrant === key
                    ? tabBorder(TAB_STYLE_VARS.borderColorStrong)
                    : tabBorder(TAB_STYLE_VARS.borderColorSubtle),
                borderRadius: TAB_STYLE_VARS.borderRadius,
                cursor: "pointer",
                transition: "border-color 220ms ease",
              }}
            >
              <div
                className="type-heading"
                style={{
                  color: val.color,
                  marginBottom: 4,
                }}
              >
                {val.name}
              </div>
              <div
                className="type-body-sm"
                style={{
                  color: "var(--color-ink)",
                }}
              >
                {val.desc}
              </div>
            </div>
          );
        })}
      </div>
      {import.meta.env.DEV && !devPerfValves.noDevControls && (
        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            className="type-body-sm"
            onClick={handleDevShortcutSubmit}
            style={{
              padding: "8px 14px",
              background:
                "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 14%, var(--color-paper))",
              color: "var(--color-ink)",
              borderRadius: "var(--radius-base)",
              cursor: "pointer",
            }}
          >
            Dev shortcut: random dot
          </button>
          <button
            className="type-body-sm"
            onClick={handleClearDevDots}
            disabled={clearingDevDots}
            style={{
              padding: "8px 14px",
              background:
                "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 14%, var(--color-paper))",
              color: "var(--color-ink)",
              borderRadius: "var(--radius-base)",
              cursor: clearingDevDots ? "wait" : "pointer",
            }}
          >
            {clearingDevDots ? "Clearing dev dots..." : "Reset dev dots"}
          </button>
          <button
            className="type-body-sm"
            onClick={handleToggleDevResultPersistence}
            style={{
              padding: "8px 14px",
              background:
                "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 14%, var(--color-paper))",
              color: "var(--color-ink)",
              borderRadius: "var(--radius-base)",
              cursor: "pointer",
            }}
          >
            Result persistence + dummy user:{" "}
            {devResultPersistenceEnabled ? "On" : "Off"}
          </button>
          <button
            className="type-body-sm"
            onClick={handleToggleDummyRetakable}
            disabled={!devResultPersistenceEnabled}
            style={{
              padding: "8px 14px",
              background: !devResultPersistenceEnabled
                ? "color-mix(in oklab, var(--color-ink) 4%, var(--color-paper))"
                : "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 14%, var(--color-paper))",
              color: !devResultPersistenceEnabled
                ? "color-mix(in oklab, var(--color-ink) 45%, var(--color-paper))"
                : "var(--color-ink)",
              borderRadius: "var(--radius-base)",
              cursor: !devResultPersistenceEnabled ? "not-allowed" : "pointer",
            }}
          >
            Dummy user + retakable quiz:{" "}
            {devRetakableDummyEnabled ? "On" : "Off"}
          </button>
          <button
            className="type-body-sm"
            onClick={handleShowDevErrors}
            style={{
              padding: "8px 14px",
              background:
                "color-mix(in oklab, var(--color-ink) 8%, var(--color-paper))",
              border:
                "1px solid color-mix(in oklab, var(--color-ink) 14%, var(--color-paper))",
              color: "var(--color-ink)",
              borderRadius: "var(--radius-base)",
              cursor: "pointer",
            }}
          >
            SHOW ERRORS
          </button>
        </div>
      )}
      <section
        style={{
          width: "100%",
          maxWidth: 640,
          margin: "26px auto 0",
          textAlign: "center",
        }}
      >
        <div
          className="type-display-lg"
          style={{
            color: "var(--color-ink)",
            marginBottom: 8,
          }}
        >
          ABOUT
        </div>
        <p
          className="type-body-sm"
          style={{
            color: "var(--color-ink)",
            maxWidth: "50%",
            margin: "0 auto",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          As large language models (LLMs) become more visible, more contested,
          and more present in our daily lives, public opinion on AI is no longer
          captured by a simple divide between optimism and skepticism.
        </p>
        <p
          className="type-body-sm"
          style={{
            color: "var(--color-ink)",
            maxWidth: "50%",
            margin: "12px auto 0",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          One can believe AI will be transformative while opposing the way it is
          being developed; others may doubt its most ambitious promises while
          still supporting practical adoption.
        </p>
        <p
          className="type-body-sm"
          style={{
            color: "var(--color-ink)",
            maxWidth: "50%",
            margin: "12px auto 0",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          The project maps those views across two dimensions: confidence in AI’s
          abilities and approval of AI’s direction.
        </p>
        <p
          className="type-body-sm"
          style={{
            color: "var(--color-ink)",
            maxWidth: "50%",
            margin: "12px auto 0",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          By separating belief in what AI can do from judgment about what should
          happen next, AI Compass creates a clearer picture of how individuals,
          communities, and demographics relate to one of the defining
          technologies of our time.
        </p>
      </section>
    </>
  );

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        WebkitOverflowScrolling: "touch",
        background: THEME.SiteBG,
        color: THEME.SiteText,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          zIndex: 20,
          boxSizing: "border-box",
          padding: "16px 16px 8px",
          background: THEME.SiteText,
          display: "flex",
          flexDirection: "column",
          gap: showHeaderActionRow ? 10 : 0,
        }}
      >
        <button
          onClick={() => setScreen("home")}
          aria-label="Go to AI Compass home"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            alignSelf: "center",
            width: "min(100%, 493px)",
          }}
        >
          <img
            src={aiCompassHeader}
            alt="AI Compass"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
            }}
          />
        </button>
        {!showHeaderActionRow && (
          <div aria-hidden="true" style={{ height: 8 }} />
        )}
        {showHeaderActionRow && (
          <div
            style={{
              height: HEADER_ACTION_HEIGHT,
              maxWidth: 640,
              width: "100%",
              margin: "0 auto",
            }}
          >
            {screen === "home" && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <button
                  className="type-body-sm compass-action-button"
                  onClick={() => {
                    setScreen("quiz");
                    setScores(null);
                    setQuizEditAnswersEnabled(false);
                    setQuizEditAnswersUnlocked(false);
                    resetQuizProgress();
                  }}
                  style={{
                    "--compass-action-bg": THEME.SiteBG,
                    "--compass-action-color": THEME.SiteText,
                    "--compass-action-border":
                      "color-mix(in oklab, var(--color-paper) 65%, transparent)",
                    "--compass-action-height": "36px",
                    "--compass-action-padding-inline": "14px",
                  }}
                >
                  {hasCompletedQuiz ? "YOUR ANSWERS" : "TAKE THE QUIZ"}
                </button>
              </div>
            )}
            {screen === "quiz" && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: HEADER_ACTION_HEIGHT * 0.25,
                    background:
                      "color-mix(in oklab, var(--color-paper) 20%, transparent)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(quizProgress.answered / quizProgress.total) * 100}%`,
                      height: "100%",
                      background: THEME.SiteBG,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div
                  className="type-caption"
                  style={{
                    height: HEADER_ACTION_HEIGHT * 0.75 - 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: THEME.SiteBG,
                    gap: 8,
                  }}
                >
                  <span>
                    {quizProgress.answered} / {quizProgress.total} ANSWERED
                  </span>
                  {quizProgress.canEditAnswers && (
                    <>
                      <span aria-hidden="true">•</span>
                      <button
                        type="button"
                        className="type-caption"
                        onClick={() => {
                          setQuizEditAnswersEnabled((prev) => {
                            const next = !prev;
                            if (next) setQuizEditAnswersUnlocked(true);
                            return next;
                          });
                        }}
                        style={{
                          border: "none",
                          background: "none",
                          padding: 0,
                          margin: 0,
                          color: THEME.SiteBG,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        {quizProgress.editAnswersEnabled
                          ? "EDITING ANSWERS"
                          : "EDIT ANSWERS"}
                      </button>
                      {quizProgress.editAnswersEnabled &&
                        quizProgress.hasEditedFromLastSubmitted && (
                          <>
                            <span aria-hidden="true">•</span>
                            <button
                              type="button"
                              className="type-caption"
                              onClick={() => {
                                setQuizResetAnswersRequest(
                                  (request) => request + 1,
                                );
                                setQuizEditAnswersEnabled(false);
                                setQuizEditAnswersUnlocked(false);
                              }}
                              style={{
                                border: "none",
                                background: "none",
                                padding: 0,
                                margin: 0,
                                color: THEME.SiteBG,
                                textDecoration: "underline",
                                cursor: "pointer",
                              }}
                            >
                              RESET
                            </button>
                          </>
                        )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          background: showResultsStrip
            ? `linear-gradient(to bottom, ${LIGHT_GRAY} 0, ${LIGHT_GRAY} 192px, ${THEME.SiteBG} 192px, ${THEME.SiteBG} 100%)`
            : THEME.SiteBG,
        }}
      >
        <div
          style={{
            padding: `${showResultsStrip ? 0 : 16}px 48px ${showHomepageChrome ? 20 : 48}px`,
            boxSizing: "border-box",
            background: THEME.SiteBG,
          }}
        >
          {/* Home + Results Screen */}
          {showCompassView && (
            <div
              style={{
                position: "relative",
                minHeight: `calc(100vh - ${HEADER_BAR_HEIGHT + (showHomepageChrome ? FOOTER_BAR_HEIGHT + 5 : 0) + 24 + (showHomepageChrome ? 40 : 48)}px)`,
              }}
            >
              {showEffectiveHomeLoading && (
                <div
                  className="type-caption"
                  style={{
                    position: "fixed",
                    left: "50%",
                    top: HEADER_BAR_HEIGHT + 200,
                    transform: "translateX(-50%)",
                    color: "var(--color-ink)",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  LOADING
                </div>
              )}
              {devPerfValvePanel}
              <div
                style={{
                  pointerEvents: effectiveHomeBodyReady ? "auto" : "none",
                }}
              >
                {showResultsStrip && (
                  <div
                    style={{
                      marginInline: -48,
                      marginBottom: RESULTS_STRIP_BOTTOM_MARGIN,
                      padding: "14px 48px 18px",
                      background: LIGHT_GRAY,
                    }}
                  >
                    <div
                      style={{
                        textAlign: "center",
                        marginInline: "auto",
                        maxWidth: 560,
                      }}
                    >
                      <div
                        className="type-label"
                        style={{
                          color: "var(--color-ink)",
                          marginBottom: 8,
                        }}
                      >
                        YOU ARE
                      </div>
                      <div
                        className="type-heading"
                        style={{
                          color: "var(--color-ink)",
                          marginBottom: 8,
                        }}
                      >
                        {resultArchetypeName}
                      </div>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 216,
                          height: 1,
                          margin: "0 auto 12px",
                          background:
                            "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-ink) 95%, transparent) 35%, color-mix(in oklab, var(--color-ink) 95%, transparent) 65%, transparent 100%)",
                        }}
                      />
                      <p
                        className="type-body"
                        style={{
                          color: "var(--color-ink)",
                          maxWidth: 400,
                          margin: "0 auto 16px",
                        }}
                      >
                        {resultArchetypeDesc}
                      </p>
                      <div
                        className="type-caption"
                        style={{
                          color: "var(--color-ink)",
                        }}
                      >
                        {resultScores ? (
                          <>
                            Advancement: {resultScores.x > 0 ? "+" : ""}
                            {(resultScores.x * 100).toFixed(0)}% &nbsp;|&nbsp;
                            LLM Belief: {resultScores.y > 0 ? "+" : ""}
                            {(resultScores.y * 100).toFixed(0)}%
                          </>
                        ) : (
                          "Results available"
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, max-content)",
                          justifyContent: "center",
                          gap: 10,
                          marginTop: 18,
                        }}
                      >
                        <button
                          type="button"
                          className="type-body-sm compass-action-button"
                          onClick={handleShare}
                          style={{
                            "--compass-action-width": "120px",
                            "--compass-action-border": GRAY,
                            "--compass-action-bg": THEME.SiteBG,
                            "--compass-action-color": THEME.SiteText,
                          }}
                        >
                          SHARE
                        </button>
                        <button
                          type="button"
                          className="type-body-sm compass-action-button"
                          onClick={() => {
                            setScreen("quiz");
                            setScores(null);
                            setQuizEditAnswersEnabled(false);
                            setQuizEditAnswersUnlocked(false);
                            resetQuizProgress();
                          }}
                          style={{
                            "--compass-action-width": "120px",
                            "--compass-action-border": GRAY,
                            "--compass-action-bg": THEME.SiteBG,
                            "--compass-action-color": THEME.SiteText,
                          }}
                        >
                          REVIEW
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {(lockCountdownText || firestoreError) && (
                  <div
                    className="type-body-sm app-error-message"
                    style={{
                      "--app-error-margin": "0 auto 12px",
                    }}
                  >
                    {lockCountdownText
                      ? `Resubmission opens in ${lockCountdownText}.`
                      : firestoreError}
                  </div>
                )}
                <div style={{ marginTop: 0 }}>
                  <Compass
                    results={effectiveVisibleResults}
                    archivePoints={effectiveArchivePoints}
                    userResult={userResult}
                    activeQuadrant={activeQuadrant}
                    disabledAges={disabledAges}
                    disabledCountries={disabledCountries}
                    disabledIndustries={disabledIndustries}
                    onCanvasDraw={handleHomeCanvasDraw}
                    showAverageMarker={showCompassView}
                    showResultMarkers={screen === "results"}
                    perfValves={devPerfValves}
                  />
                </div>
                {!devPerfValves.noHomeBody && homepageBelowCompassContent}
              </div>
            </div>
          )}

          {/* Quiz Screen */}
          {screen === "quiz" && (
            <div>
              <QuizPage
                onComplete={handleQuizComplete}
                onProgressChange={setQuizProgress}
                initialSubmission={latestLocalSubmission}
                initialDraft={quizDraft}
                onDraftChange={handleQuizDraftChange}
                editAnswersEnabled={quizEditAnswersEnabled}
                editAnswersUnlocked={quizEditAnswersUnlocked}
                resetAnswersRequest={quizResetAnswersRequest}
                questionAveragesById={effectiveQuestionAveragesById}
                submitError={submitError}
              />
            </div>
          )}
        </div>

        {showHomepageChrome && (
          <footer
            style={{
              height: FOOTER_BAR_HEIGHT,
              marginBottom: 5,
              background: THEME.SiteBG,
              color: THEME.SiteText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 12px",
              boxSizing: "border-box",
            }}
          >
            <span className="type-body-sm">
              Created by{" "}
              <a
                href="https://www.linkedin.com/in/keithherrmann/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: THEME.SiteText,
                }}
              >
                Keith Herrmann
              </a>{" "}
              •{" "}
              <a
                href="mailto:uncommoncrawl@gmail.com"
                style={{
                  color: THEME.SiteText,
                }}
              >
                Contact
              </a>
            </span>
          </footer>
        )}
      </div>

      {submitting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background:
              "color-mix(in oklab, var(--color-paper) 80%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            className="type-caption"
            style={{
              color: "var(--color-ink)",
            }}
          >
            Plotting your position...
          </div>
        </div>
      )}
    </div>
  );
}
