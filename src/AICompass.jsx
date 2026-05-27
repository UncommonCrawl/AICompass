import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "./firebase";
import { ISO_COUNTRIES } from "./isoCountries";

const QUESTIONS = [
  {
    id: "y1",
    axis: "y",
    direction: 1,
    label: "The Scaling Hypothesis",
    text: "Simply scaling up current transformer architectures with more compute power and larger datasets will eventually lead to Artificial General Intelligence (AGI).",
  },
  {
    id: "y2",
    axis: "y",
    direction: 1,
    label: "The Nature of the Model",
    text: "Large Language Models possess genuine reasoning capabilities and internal world models, rather than just being highly advanced statistical pattern matchers.",
  },
  {
    id: "y3",
    axis: "y",
    direction: -1,
    label: "The Architectural Wall",
    text: "Auto-regressive LLMs are approaching a fundamental plateau; achieving true AGI will require entirely new architectures we haven't discovered yet.",
  },
  {
    id: "y4",
    axis: "y",
    direction: 1,
    label: "The Timeline",
    text: "An Artificial General Intelligence capable of outperforming humans at the majority of economically valuable work will be developed before the end of this decade.",
  },
  {
    id: "y5",
    axis: "y",
    direction: -1,
    label: "The Embodiment Hurdle",
    text: "True general intelligence cannot be achieved by software alone; it requires a physical body (robotics) to interact with and learn from the friction of the real world.",
  },
  {
    id: "y6",
    axis: "y",
    direction: -1,
    label: "The Data Ceiling",
    text: "As we exhaust high-quality human text, training models on synthetic (AI-generated) data will lead to model collapse rather than continued improvement.",
  },
  {
    id: "y7",
    axis: "y",
    direction: 1,
    label: "Recursive Self-Improvement",
    text: "Once an AI system reaches human-level proficiency in software engineering, it will rapidly upgrade its own code, leading to an immediate 'intelligence explosion'.",
  },
  {
    id: "y8",
    axis: "y",
    direction: -1,
    label: "The Hallucination Problem",
    text: "Current AI systems possess a fundamental ceiling in reliability and hallucination rates that cannot be solved by simply adding more data to the current paradigm.",
  },
  {
    id: "y9",
    axis: "y",
    direction: 1,
    label: "Biological Exceptionalism",
    text: "There is nothing fundamentally unique about the biological human brain that a digital neural network cannot eventually replicate and surpass.",
  },
  {
    id: "y10",
    axis: "y",
    direction: -1,
    label: "Diminishing Returns",
    text: "The massive leaps in capability seen from GPT-3 to GPT-4 will not be replicated in future generations; we are entering an era of marginal, incremental AI improvements.",
  },
  {
    id: "x1",
    axis: "x",
    direction: -1,
    label: "The Creator's Consent (Legal/Copyright)",
    text: "AI companies must be legally required to obtain explicit consent and provide compensation before training their models on copyrighted human works, such as scripts, books, and artwork.",
  },
  {
    id: "x2",
    axis: "x",
    direction: 1,
    label: "The Democratization of Execution (Philosophical/Innovation)",
    text: "AI is the ultimate democratizing force, allowing anyone with a compelling concept to execute complex creative or technical projects without needing massive budgets or specialized teams.",
  },
  {
    id: "x3",
    axis: "x",
    direction: -1,
    label: "The Pause and Regulate Mandate (Policy)",
    text: "Governments should enforce a global pause on training AI models more powerful than current state-of-the-art until robust, internationally agreed-upon safety frameworks are established.",
  },
  {
    id: "x4",
    axis: "x",
    direction: 1,
    label: "The Open-Source Imperative (Control)",
    text: "The weights of powerful frontier AI models should be open-sourced so that anyone can build upon them, rather than being gatekept by a few massive tech corporations.",
  },
  {
    id: "x5",
    axis: "x",
    direction: -1,
    label: "The Authenticity Crisis (Philosophical/Social)",
    text: "The proliferation of synthetic, AI-generated media threatens to drown out genuine human connection and the intrinsic value of authentic, original expression.",
  },
  {
    id: "x6",
    axis: "x",
    direction: 1,
    label: "The Geopolitical Race (Policy/Security)",
    text: "Accelerating domestic AI development is a geopolitical necessity; artificially slowing down only guarantees that adversarial nations will achieve technological dominance first.",
  },
  {
    id: "x7",
    axis: "x",
    direction: -1,
    label: "The Thermodynamic Toll (Environmental)",
    text: "The massive energy consumption, water usage, and ecological footprint required to train and run giant AI models is an unacceptable cost to the environment.",
  },
  {
    id: "x8",
    axis: "x",
    direction: 1,
    label: "The Post-Scarcity Vision (Economic)",
    text: "While AI will inevitably disrupt the labor market, we must push forward rapidly to unlock a post-scarcity economy where the cost of intelligence, healthcare, and services drops to near zero.",
  },
  {
    id: "x9",
    axis: "x",
    direction: -1,
    label: "The Existential Threat (Safety/X-Risk)",
    text: "The development of superintelligent AI poses a literal, existential threat to human survival that justifies extreme caution, even if it means permanently halting progress.",
  },
  {
    id: "x10",
    axis: "x",
    direction: 1,
    label: "The Trap of Regulatory Capture (Policy/Business)",
    text: "Heavy-handed government regulation of AI will ultimately serve as regulatory capture, protecting legacy tech monopolies and stifling independent innovation.",
  },
];

const RESPONSE_RANGE = {
  min: -2,
  max: 2,
  step: 0.01,
};

const RESULT_SCHEMA_VERSION = 3;
const COMPASS_RESULTS_COLLECTION = "compass-results-v2";
const COMPASS_SUBMIT_ENDPOINT = (
  import.meta.env.VITE_COMPASS_SUBMIT_ENDPOINT || ""
).trim();
const DEVICE_ID_STORAGE_KEY = "ai_compass_device_id_v1";
const SESSION_ID_STORAGE_KEY = "ai_compass_session_id_v1";
const LAST_RESULT_STORAGE_KEY = "ai_compass_last_result_v1";
const DEV_RESULT_PERSISTENCE_ENABLED_STORAGE_KEY =
  "ai_compass_dev_result_persistence_enabled_v1";
const UNKNOWN_SEGMENT_VALUE = "__UNSPECIFIED__";
const QUESTION_MEDIAN_BY_ID = Object.fromEntries(
  QUESTIONS.map((question) => [question.id, 0]),
);

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
const HOME_SECTION_GAP = 20;
const UNSPECIFIED_FILTER_VALUE = "__UNSPECIFIED__";
const DROPDOWN_VIEWPORT_BUFFER = 10;
const DROPDOWN_MENU_MAX_HEIGHT = 200;
const COMPASS_CANVAS_DPR_CAP_BASE = 2;
const COMPASS_CANVAS_DPR_CAP_HIGH = 3;
const COMPASS_CANVAS_HIGH_DPR_POINT_LIMIT = 1200;
const COMPASS_DOT_COLOR = "#000000";
const COMPASS_DOT_FADED_COLOR = "#b8b8b8";
const DEFAULT_USER_DOT_COLOR = "#17a34a";
const COMPASS_DOT_GEOMETRY = {
  radius: 3,
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
  const responses = [];

  for (const question of QUESTIONS) {
    const rawValue = normalizeAnswerValue(answers?.[question.id]);
    if (rawValue === null) continue;

    const weightedValue = Number((rawValue * question.direction).toFixed(4));
    valuesByQuestionId[question.id] = rawValue;
    responses.push({
      questionId: question.id,
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
    questionOrder:
      questionOrder.length > 0 ? questionOrder : QUESTIONS.map((q) => q.id),
    questionValues: valuesByQuestionId,
    questionResponses: responses,
    questionMedians: QUESTION_MEDIAN_BY_ID,
  };
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
  if (!rgb) return "rgba(139, 209, 165, 0.78)";
  const mixRatioWithWhite = 0.5;
  const alpha = 0.78;
  const r = Math.round(rgb.r * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite);
  const g = Math.round(rgb.g * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite);
  const b = Math.round(rgb.b * (1 - mixRatioWithWhite) + 255 * mixRatioWithWhite);
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
  const hasPersistedResult = Boolean(scores && userResult);
  return {
    scores: hasPersistedResult ? scores : null,
    userResult: hasPersistedResult ? userResult : null,
    screen: hasPersistedResult ? "results" : "home",
  };
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
    if (payload?.is_dev === true) {
      const createdAt = Number(payload.client_created_at) || Date.now();
      const xScore = Number(payload.x_score) || 0;
      const yScore = Number(payload.y_score) || 0;
      const demographics =
        payload.demographics && typeof payload.demographics === "object"
          ? payload.demographics
          : {};
      const submission = {
        created_at: createdAt,
        ts: createdAt,
        x_score: xScore,
        y_score: yScore,
        x: xScore,
        y: yScore,
        archetype:
          typeof payload.archetype === "string" ? payload.archetype : "",
        demographics,
        age: typeof demographics.age === "string" ? demographics.age : "",
        country:
          typeof demographics.country === "string" ? demographics.country : "",
        industry:
          typeof demographics.industry === "string"
            ? demographics.industry
            : "",
        occupation:
          typeof demographics.occupation === "string"
            ? demographics.occupation
            : "",
        notes: typeof demographics.notes === "string" ? demographics.notes : "",
        question_order: Array.isArray(payload.question_order)
          ? payload.question_order
          : [],
        question_values:
          payload.question_values && typeof payload.question_values === "object"
            ? payload.question_values
            : {},
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
        segments:
          payload.segments && typeof payload.segments === "object"
            ? payload.segments
            : {},
        is_repeat_ip_24h: false,
        is_repeat_device_24h: false,
        repeat_group_id: "",
        include_in_default_aggregate: true,
        include_in_device_priority_aggregate: true,
        repeat_classification: "first_or_stale",
        is_dev: true,
        isDev: true,
      };
      const docRef = await addDoc(
        collection(db, COMPASS_RESULTS_COLLECTION),
        submission,
      );
      return {
        ok: true,
        submission: {
          ...submission,
          submission_id: docRef.id,
          id: docRef.id,
        },
      };
    }
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
    throw new Error(message);
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
  const selectionState =
    enabledCount === options.length
      ? "plus"
      : enabledCount === 0
        ? "minus"
        : "mixed";
  const allEnabled = enabledCount === options.length;
  const selectionGlyph =
    selectionState === "plus" ? "+" : selectionState === "minus" ? "-" : "";
  const checklistBoxStyle = {
    width: 16,
    height: 16,
    border: "1px solid rgba(0,0,0,0.45)",
    borderRadius: 4,
    background: THEME.SiteBG,
    color: THEME.SiteText,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const checklistSymbolStyle = {
    display: "inline-block",
    fontSize: 11,
    lineHeight: 1,
    transform: "translate(0.3px, -0.5px)",
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
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
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
              onClick={() =>
                setDisabledValues(allEnabled ? options.map((o) => o.value) : [])
              }
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
                <span style={checklistSymbolStyle}>{selectionGlyph}</span>
              </span>
              <span>Select/Deselect All</span>
            </button>
            {options.map((option) => {
              const enabled = !disabledSet.has(option.value);
              return (
                <button
                  className="type-body-sm"
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDisabledValues((prev) =>
                      prev.includes(option.value)
                        ? prev.filter((v) => v !== option.value)
                        : [...prev, option.value],
                    )
                  }
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
                      {enabled ? "+" : ""}
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
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
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
                  color: "var(--color-ink)",
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
  userResult,
  activeQuadrant,
  disabledAges,
  disabledCountries,
  disabledIndustries,
  onCanvasDraw,
}) {
  const svgRef = useRef(null);
  const plotRef = useRef(null);
  const canvasRef = useRef(null);
  const hoveredDotIdRef = useRef(null);
  const hoverFrameRef = useRef(0);
  const pendingPointerRef = useRef(null);
  const [dims, setDims] = useState({ w: 960, h: 520 });
  const [hoveredDotId, setHoveredDotId] = useState(null);
  const [devFps, setDevFps] = useState(0);
  const userDotColor = useMemo(
    () => resolveCssColorVar("--user-button", DEFAULT_USER_DOT_COLOR),
    [],
  );
  const userDotFadedColor = useMemo(
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

  const quadFill = "rgba(0,0,0,0.08)";
  const quadrantFillRects = [
    { key: "topRight", x: cx, y: pad },
    { key: "topLeft", x: pad, y: pad },
    { key: "bottomRight", x: cx, y: cy },
    { key: "bottomLeft", x: pad, y: cy },
  ];
  const axisLabelTextStyle = {
    textAnchor: "middle",
    fill: "var(--color-ink)",
    opacity: 0.8,
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
    opacity: 0.25,
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
            !disabledAgeSet.has(normalizeFilterValue(dot.age)) &&
            !disabledCountrySet.has(normalizeFilterValue(dot.country)) &&
            !disabledIndustrySet.has(normalizeFilterValue(dot.industry)),
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
  const activeHoveredPoint = hoveredDotId
    ? plotPointById.get(hoveredDotId) || null
    : null;
  const activeHoveredDot =
    activeHoveredPoint && activeHoveredPoint.enabled
      ? activeHoveredPoint.dot
      : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dprCap =
      plotPoints.length <= COMPASS_CANVAS_HIGH_DPR_POINT_LIMIT
        ? COMPASS_CANVAS_DPR_CAP_HIGH
        : COMPASS_CANVAS_DPR_CAP_BASE;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const pixelWidth = Math.max(1, Math.round(dims.w * dpr));
    const pixelHeight = Math.max(1, Math.round(dims.h * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const drawDot = (point, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.sx, point.sy, point.dotRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dims.w, dims.h);

    // Draw faded dots first so enabled dots always sit above them.
    for (const point of plotPoints) {
      if (!point.enabled && !point.isUser) drawDot(point, COMPASS_DOT_FADED_COLOR);
    }
    for (const point of plotPoints) {
      if (!point.enabled && point.isUser) drawDot(point, userDotFadedColor);
    }
    for (const point of plotPoints) {
      if (point.enabled && !point.isUser) drawDot(point, COMPASS_DOT_COLOR);
    }
    for (const point of plotPoints) {
      if (point.enabled && point.isUser) drawDot(point, userDotColor);
    }

    onCanvasDraw?.();
  }, [plotPoints, dims.w, dims.h, onCanvasDraw, userDotColor, userDotFadedColor]);

  useEffect(
    () => () => {
      if (hoverFrameRef.current) {
        cancelAnimationFrame(hoverFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
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
  }, []);

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
      style={{ position: "relative", width: "100%", margin: "0 auto" }}
    >
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
            style={{ transition: "opacity 220ms ease" }}
          />
        ))}

        {/* Axes */}
        <line
          x1={cx}
          y1={pad}
          x2={cx}
          y2={dims.h - pad}
          stroke={THEME.SiteBorder}
          strokeWidth={1}
        />
        <line
          x1={pad}
          y1={cy}
          x2={dims.w - pad}
          y2={cy}
          stroke={THEME.SiteBorder}
          strokeWidth={1}
        />

        {/* Border */}
        <rect
          x={pad}
          y={pad}
          width={xRange * 2}
          height={yRange * 2}
          fill="none"
          stroke={THEME.SiteBorder}
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
            fill={QUADRANT_INFO[key].color}
            {...compassLabelTextStyle}
          >
            {QUADRANT_INFO[key].compassLabel.toUpperCase()}
          </text>
        ))}
      </svg>

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

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
        {activeHoveredPoint && activeHoveredPoint.enabled && (
          <circle
            cx={activeHoveredPoint.sx}
            cy={activeHoveredPoint.sy}
            r={activeHoveredPoint.dotRadius + 2}
            fill="none"
            stroke={THEME.SiteBG}
            strokeWidth={1.5}
          />
        )}
        {[activeHoveredPoint]
          .filter((point) => point && point.enabled)
          .map((point) => (
            <circle
              key={`pulse-${point.id}`}
              cx={point.sx}
              cy={point.sy}
              r={COMPASS_DOT_GEOMETRY.hoverRingRadius}
              fill="none"
              stroke={point.color}
              strokeWidth={1.5}
              opacity={0.6}
            >
              <animate
                attributeName="r"
                values={`${COMPASS_DOT_GEOMETRY.hoverRingRadius};${COMPASS_DOT_GEOMETRY.hoverRingPulseRadius};${COMPASS_DOT_GEOMETRY.hoverRingRadius}`}
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.6;0.2;0.6"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          ))}
      </svg>

      {/* Tooltip for hovered dot */}
      {activeHoveredDot &&
        (() => {
          const { sx, sy } = toSvg(activeHoveredDot.x, activeHoveredDot.y);
          const isRight = sx > cx;
          const isBottom = sy > cy;
          const isUserDot = Boolean(activeHoveredPoint?.isUser);
          const clampedHoverNotes = clampLabelText(
            activeHoveredDot.notes,
            NOTES_CHAR_LIMIT,
          );
          const noteText =
            isUserDot
              ? "Lorem ipsum dolor sit amet."
              : clampedHoverNotes;
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
      {import.meta.env.DEV && (
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
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(0,0,0,0.22)",
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
function QuizPage({ onComplete, onProgressChange }) {
  const orderedQuestions = QUESTIONS;
  const [answers, setAnswers] = useState({});
  const [ageRange, setAgeRange] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [ipCountryCode] = useState(() => getClientCountryHint());
  const [industry, setIndustry] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [notes, setNotes] = useState("");
  const allAnswered = orderedQuestions.every(
    (q) => answers[q.id] !== undefined,
  );
  const answeredCount = Object.keys(answers).length;
  const hasDemographicSelections =
    ageRange !== "" && countryCode !== "" && industry !== "";
  const canSubmit = allAnswered && hasDemographicSelections;
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
    });
  }, [answeredCount, orderedQuestions.length, canSubmit, onProgressChange]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <style>{`
        .response-slider-wrap {
          position: relative;
          width: 100%;
          height: 18px;
          display: flex;
          align-items: center;
        }

        .response-slider-rail {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 6px;
          border: 1px solid ${THEME.SiteText};
          border-radius: 999px;
          background: transparent;
          pointer-events: none;
          box-sizing: border-box;
          z-index: 1;
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
          height: 6px;
          border-radius: 999px;
          background: transparent;
          border: 0;
        }

        .response-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          margin-top: -6px;
          border-radius: 50%;
          background: ${THEME.SiteText};
          border: 1px solid ${THEME.SiteText};
          box-shadow: none;
          box-sizing: border-box;
          transition:
            background-color 1s ease,
            border-color 1s ease;
        }

        .response-slider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: transparent;
          border: 0;
        }

        .response-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${THEME.SiteText};
          border: 1px solid ${THEME.SiteText};
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
      `}</style>
      {/* Questions */}
      {orderedQuestions.map((q, i) => (
        <div
          key={q.id}
          style={{
            marginTop: i === 0 ? 0 : 0,
            marginBottom: 20,
            padding: "80px 40px",
            background:
              answers[q.id] !== undefined ? "rgba(0,0,0,0.015)" : THEME.SiteBG,
            border:
              answers[q.id] !== undefined
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
            <div className="response-slider-wrap">
              <div className="response-slider-rail" />
              <input
                className={`response-slider ${
                  answers[q.id] === undefined ? "is-unanswered" : ""
                }`}
                type="range"
                min={RESPONSE_RANGE.min}
                max={RESPONSE_RANGE.max}
                step={RESPONSE_RANGE.step}
                value={answers[q.id] ?? 0}
                aria-label={`Response slider for question ${i + 1}`}
                onChange={(e) =>
                  setAnswers((prev) => ({
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
      ))}

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
          />
        </div>
        <div>
          <SingleSelectDropdown
            label="Country"
            value={countryCode}
            onChange={setCountryCode}
            options={quizCountryOptions}
            placeholder="Select..."
          />
        </div>
        <div>
          <SingleSelectDropdown
            label="Industry"
            value={industry}
            onChange={setIndustry}
            options={quizIndustryOptions}
            placeholder="Select..."
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
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Software Engineer"
            maxLength={OCCUPATION_CHAR_LIMIT}
            style={inputStyle}
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
            onChange={(e) => setNotes(e.target.value.replace(/[\r\n]+/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Anything else you'd like to share"
            maxLength={NOTES_CHAR_LIMIT}
            rows={3}
            style={{
              ...inputStyle,
              height: 88,
              minHeight: 88,
              maxHeight: 88,
              resize: "none",
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
              : "rgba(0,0,0,0.03)",
            border: "none",
            color: canSubmit ? "var(--color-paper)" : "rgba(0,0,0,0.35)",
            borderRadius: "var(--radius-base)",
            cursor: canSubmit ? "pointer" : "default",
            transition: "all 0.3s",
          }}
        >
          {canSubmit ? (
            "See Results"
          ) : !allAnswered ? (
            <span className="type-label">
              {`Answer all ${orderedQuestions.length} questions to continue`}
            </span>
          ) : (
            "Select Age Range, Country, and Industry to continue"
          )}
        </button>
      </div>
    </div>
  );
}

// --- Main App ---
export default function AICompass() {
  const initialPersistedResultState = useMemo(
    () => readInitialPersistedResultState(),
    [],
  );
  const [screen, setScreen] = useState(initialPersistedResultState.screen); // home, quiz, results
  const [scores, setScores] = useState(initialPersistedResultState.scores);
  const [quizProgress, setQuizProgress] = useState({
    answered: 0,
    total: QUESTIONS.length,
    canSubmit: false,
  });
  const [results, setResults] = useState([]);
  const [userResult, setUserResult] = useState(
    initialPersistedResultState.userResult,
  );
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const [pinnedQuadrant, setPinnedQuadrant] = useState(null);
  const [firestoreError, setFirestoreError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearingDevDots, setClearingDevDots] = useState(false);
  const [devResultPersistenceEnabled, setDevResultPersistenceEnabled] =
    useState(() => readDevResultPersistenceEnabled());
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
  const resetQuizProgress = () =>
    setQuizProgress({
      answered: 0,
      total: QUESTIONS.length,
      canSubmit: false,
    });

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

  // Subscribe to live Firestore updates once on first render.
  useEffect(() => {
    const resultsQuery = query(
      collection(db, COMPASS_RESULTS_COLLECTION),
      orderBy("ts", "asc"),
    );

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const nextResults = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setHasInitialResultsSnapshot(true);
        setFirestoreError("");
        setResults((prev) => {
          const nextIds = new Set(nextResults.map((dot) => dot.id));
          const localOnlyDevDots = prev.filter((dot) => {
            if (dot?.isDev !== true) return false;
            if (typeof dot.id !== "string") return false;
            if (!dot.id.startsWith(LOCAL_DEV_ID_PREFIX)) return false;
            return !nextIds.has(dot.id);
          });
          return [...nextResults, ...localOnlyDevDots];
        });
        if (devResultPersistenceEnabled) {
          const latestMatch = nextResults
            .filter(
              (result) => extractDeviceUuidFromResult(result) === localDeviceId,
            )
            .sort(
              (a, b) => extractResultTimestamp(b) - extractResultTimestamp(a),
            )[0];
          const latestScores = extractScoresFromResult(latestMatch);
          if (latestMatch && latestScores) {
            setUserResult((prev) => prev || latestMatch);
            setScores((prev) => prev || latestScores);
            setScreen((prev) => (prev === "home" ? "results" : prev));
          }
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        setHasInitialResultsSnapshot(true);
        setFirestoreError(
          error?.code
            ? `Live sync unavailable (${error.code}).`
            : "Live sync unavailable right now.",
        );
      },
    );

    return unsubscribe;
  }, [devResultPersistenceEnabled, localDeviceId]);
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
    const activeScores = overrideScores || scores;
    if (!activeScores) return;
    setSubmitting(true);
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
      segments: demographicSegments,
      is_repeat_ip_24h: false,
      is_repeat_device_24h: false,
      include_in_default_aggregate: true,
      include_in_device_priority_aggregate: true,
      repeat_classification: "first_or_stale",
      repeat_group_id: "",
      created_at: clientCreatedAt,
      isDev: options.isDev === true,
      ts: clientCreatedAt,
    };
    const localId = `local-${Date.now()}`;

    setUserResult({ ...entry, id: localId });
    setScreen("results");

    const stallTimer = setTimeout(() => {
      setFirestoreError(
        "Submit request is taking too long. Check network/firewall and Firestore rules.",
      );
      setSubmitting(false);
    }, 8000);

    const payload = {
      x_score: activeScores.x,
      y_score: activeScores.y,
      archetype,
      demographics: entry.demographics,
      question_order: questionAnalytics.questionOrder,
      question_values: questionAnalytics.questionValues,
      question_responses: questionAnalytics.questionResponses,
      question_medians: questionAnalytics.questionMedians,
      segments: demographicSegments,
      result_schema_version: RESULT_SCHEMA_VERSION,
      is_dev: options.isDev === true,
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
        setFirestoreError("");
        if (options.isDev === true && !COMPASS_SUBMIT_ENDPOINT) {
          setResults((prev) => {
            const next = {
              ...entry,
              ...saved,
              id: savedId,
            };
            return [...prev.filter((dot) => dot.id !== savedId), next];
          });
        }
        setUserResult((prev) =>
          prev?.id === localId
            ? {
                ...entry,
                ...saved,
                id: savedId,
              }
            : prev,
        );
      })
      .catch((error) => {
        console.error("Survey submission error:", error);
        setFirestoreError(
          error?.message
            ? `Unable to submit (${error.message}).`
            : "Unable to submit right now.",
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
      { isDev: true },
    );
  };

  const handleClearDevDots = async () => {
    setClearingDevDots(true);
    try {
      const allDocsSnap = await getDocs(
        collection(db, COMPASS_RESULTS_COLLECTION),
      );

      const docsToDelete = allDocsSnap.docs.filter((docSnap) => {
        const data = docSnap.data();
        return data?.isDev === true;
      });

      await Promise.all(docsToDelete.map((docSnap) => deleteDoc(docSnap.ref)));
      setResults((prev) => prev.filter((r) => r.isDev !== true));
      setUserResult((prev) => (prev?.isDev === true ? null : prev));
      setFirestoreError("");
    } catch (error) {
      console.error("Clear dev dots error:", error);
      setFirestoreError(
        error?.code
          ? `Unable to clear dev dots (${error.code}).`
          : "Unable to clear dev dots right now.",
      );
    } finally {
      setClearingDevDots(false);
    }
  };

  const handleToggleDevResultPersistence = () => {
    const nextEnabled = !devResultPersistenceEnabled;
    setDevResultPersistenceEnabled(nextEnabled);
    if (!nextEnabled) {
      removeLocalStorageItem(LAST_RESULT_STORAGE_KEY);
      setUserResult(null);
      setScores(null);
      setScreen("home");
      return;
    }
    // Dev-only unified toggle behavior: enabling always loads a dummy user dot.
    const now = Date.now();
    const dummyScores = { x: -0.2, y: 0.28 };
    const archetype = QUADRANT_INFO[getQuadrant(dummyScores.x, dummyScores.y)].name;
    const dummyUserResult = {
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
      isDev: true,
      is_dev: true,
      created_at: now,
      ts: now,
      device_uuid: localDeviceId,
      deviceUuid: localDeviceId,
    };
    setScores(dummyScores);
    setUserResult(dummyUserResult);
    setScreen("results");
  };

  const quadrant = scores ? getQuadrant(scores.x, scores.y) : null;
  const qi = quadrant ? QUADRANT_INFO[quadrant] : null;
  const visibleResults = useMemo(() => {
    const withUser =
      userResult && !results.some((result) => result.id === userResult.id)
        ? [...results, userResult]
        : results;
    if (devResultPersistenceEnabled) return withUser;
    return withUser.filter((result) => {
      const id = typeof result?.id === "string" ? result.id : "";
      if (id.startsWith(LOCAL_DEV_DUMMY_RESULT_ID_PREFIX)) return false;
      return extractDeviceUuidFromResult(result) !== localDeviceId;
    });
  }, [results, userResult, devResultPersistenceEnabled, localDeviceId]);
  const showCompassView =
    screen === "home" || (screen === "results" && scores && qi);
  const activeQuadrant = pinnedQuadrant || hoveredQuadrant;
  const homeBodyReady = hasInitialResultsSnapshot && homeCanvasDrawn;
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overflow = "hidden";
    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehaviorY: "contain",
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
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          boxSizing: "border-box",
          padding: "14px 16px",
          background: THEME.SiteText,
          display: "flex",
          flexDirection: "column",
          gap: 6,
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
          }}
        >
          <h1
            className="type-display-lg"
            style={{
              fontSize: 30,
              letterSpacing: "0.15em",
              margin: 0,
              color: THEME.SiteBG,
              lineHeight: 1.3,
            }}
          >
            THE AI COMPASS
          </h1>
        </button>
        <div
          style={{
            height: HEADER_ACTION_HEIGHT,
            maxWidth: 640,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {(screen === "home" || screen === "results") && (
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
                className="type-body-sm"
                onClick={() => {
                  setScreen("quiz");
                  setScores(null);
                  resetQuizProgress();
                }}
                style={{
                  width: "fit-content",
                  height: "90%",
                  padding: "0 18px",
                  background: THEME.SiteBG,
                  border: "1px solid rgba(255,255,255,0.65)",
                  color: THEME.SiteText,
                  borderRadius: "var(--radius-base)",
                  cursor: "pointer",
                }}
              >
                TAKE THE QUIZ
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
                  background: "rgba(255,255,255,0.2)",
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
                }}
              >
                {quizProgress.answered} / {quizProgress.total} ANSWERED
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: `24px 48px 48px`,
          boxSizing: "border-box",
        }}
      >
        {firestoreError && (
          <div
            className="type-body-sm"
            style={{
              maxWidth: 1000,
              margin: "0 auto 16px",
              padding: "10px 12px",
              borderRadius: "var(--radius-base)",
              border: "1px solid rgba(255,179,0,0.4)",
              background: "rgba(0,0,0,0.08)",
              color: "var(--color-ink)",
            }}
          >
            {firestoreError}
          </div>
        )}

        {/* Home + Results Screen */}
        {showCompassView && (
          <div
            style={{
              position: "relative",
              minHeight: `calc(100vh - ${HEADER_BAR_HEIGHT + 24 + 48}px)`,
            }}
          >
            {showHomeLoading && (
              <div
                className="type-caption"
                style={{
                  position: "fixed",
                  left: "50%",
                  top: HEADER_BAR_HEIGHT + 200,
                  transform: "translateX(-50%)",
                  color: "var(--color-ink)",
                  opacity: homeBodyReady ? 0 : 1,
                  transition: "opacity 1s ease",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                LOADING
              </div>
            )}
            <div
              style={{
                opacity: homeBodyReady ? 1 : 0,
                transition: "opacity 1s ease",
                pointerEvents: homeBodyReady ? "auto" : "none",
              }}
            >
              {screen === "results" && scores && qi && (
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <div
                    className="type-label"
                    style={{
                      color: "var(--color-ink)",
                      marginBottom: 8,
                    }}
                  >
                    YOUR RESULT SECTION
                  </div>
                  <div
                    className="type-heading"
                    style={{
                      color: qi.color,
                      marginBottom: 8,
                    }}
                  >
                    {qi.name}
                  </div>
                  <p
                    className="type-body"
                    style={{
                      color: "var(--color-ink)",
                      maxWidth: 400,
                      margin: "0 auto 16px",
                    }}
                  >
                    {qi.desc}
                  </p>
                  <div
                    className="type-caption"
                    style={{
                      color: "var(--color-ink)",
                    }}
                  >
                    Advancement: {scores.x > 0 ? "+" : ""}
                    {(scores.x * 100).toFixed(0)}% &nbsp;|&nbsp; LLM Belief:{" "}
                    {scores.y > 0 ? "+" : ""}
                    {(scores.y * 100).toFixed(0)}%
                  </div>
                </div>
              )}
              <div style={{ marginTop: 0 }}>
                <Compass
                  results={visibleResults}
                  userResult={userResult}
                  activeQuadrant={activeQuadrant}
                  disabledAges={disabledAges}
                  disabledCountries={disabledCountries}
                  disabledIndustries={disabledIndustries}
                  onCanvasDraw={handleHomeCanvasDraw}
                />
              </div>

              <div
                style={{
                  marginTop: HOME_SECTION_GAP,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

              {/* Quadrant legend */}
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
              {import.meta.env.DEV && (
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
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid rgba(0,0,0,0.14)",
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
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid rgba(0,0,0,0.14)",
                      color: "var(--color-ink)",
                      borderRadius: "var(--radius-base)",
                      cursor: clearingDevDots ? "wait" : "pointer",
                      opacity: clearingDevDots ? 0.7 : 1,
                    }}
                  >
                    {clearingDevDots
                      ? "Clearing dev dots..."
                      : "Reset dev dots"}
                  </button>
                  <button
                    className="type-body-sm"
                    onClick={handleToggleDevResultPersistence}
                    style={{
                      padding: "8px 14px",
                      background: "rgba(0,0,0,0.08)",
                      border: "1px solid rgba(0,0,0,0.14)",
                      color: "var(--color-ink)",
                      borderRadius: "var(--radius-base)",
                      cursor: "pointer",
                    }}
                  >
                    Result persistence + dummy user:{" "}
                    {devResultPersistenceEnabled ? "On" : "Off"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quiz Screen */}
        {screen === "quiz" && (
          <div>
            <QuizPage
              onComplete={handleQuizComplete}
              onProgressChange={setQuizProgress}
            />
          </div>
        )}
      </div>

      {submitting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(255,255,255,0.8)",
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
