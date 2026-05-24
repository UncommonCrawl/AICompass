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
  // Y-axis: LLM Potential Belief (positive = more belief)
  {
    id: "y1",
    axis: "y",
    direction: 1,
    text: "Within the next few years, AI will be able to do most white-collar office work as well as a trained human.",
  },
  {
    id: "y2",
    axis: "y",
    direction: 1,
    text: "AI systems will soon be able to design and improve other AI systems without human guidance.",
  },
  {
    id: "y3",
    axis: "y",
    direction: -1,
    text: "Most of what AI chatbots produce today is convincing-sounding text, not real understanding.",
  },
  {
    id: "y4",
    axis: "y",
    direction: 1,
    text: "AI will replace more jobs than it creates over the next decade.",
  },
  {
    id: "y5",
    axis: "y",
    direction: -1,
    text: "We are approaching a ceiling with current AI; the dramatic leaps in ability are mostly behind us.",
  },
  {
    id: "y6",
    axis: "y",
    direction: -1,
    text: "As AI trains on more AI-generated content online, the quality of its output will noticeably decline.",
  },
  {
    id: "y7",
    axis: "y",
    direction: 1,
    text: "Within my lifetime, AI will be better than human doctors at diagnosing diseases.",
  },
  {
    id: "y8",
    axis: "y",
    direction: -1,
    text: "Today's AI is fundamentally a text prediction engine; it will never truly reason or think.",
  },
  // X-axis: Advancement Support (positive = more pro-advancement)
  {
    id: "x1",
    axis: "x",
    direction: -1,
    text: "Governments should have the power to shut down AI projects they consider dangerous.",
  },
  {
    id: "x2",
    axis: "x",
    direction: 1,
    text: "AI companies should be able to release new models to the public without needing government approval first.",
  },
  {
    id: "x3",
    axis: "x",
    direction: 1,
    text: "A worldwide pause on cutting-edge AI research would do more harm than good.",
  },
  {
    id: "x4",
    axis: "x",
    direction: -1,
    text: "The inner workings of powerful AI models should be kept private to prevent misuse.",
  },
  {
    id: "x5",
    axis: "x",
    direction: 1,
    text: "Getting AI into people's hands quickly is worth the risk of occasional misuse.",
  },
  {
    id: "x6",
    axis: "x",
    direction: -1,
    text: "AI development is moving too fast for anyone to understand the consequences.",
  },
  {
    id: "x7",
    axis: "x",
    direction: 1,
    text: "Competition between companies, not government rules, is the best way to keep AI development responsible.",
  },
  {
    id: "x8",
    axis: "x",
    direction: -1,
    text: "Companies building the most powerful AI systems should be required to get a license from the government.",
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
const UNKNOWN_SEGMENT_VALUE = "__UNSPECIFIED__";
const QUESTION_MEDIAN_BY_ID = Object.fromEntries(
  QUESTIONS.map((question) => [question.id, 0]),
);

const QUADRANT_INFO = {
  topRight: {
    name: "The Singulatarian",
    compassLabel: "Singulatarians",
    desc: "Believes transformative AI is near and wants to accelerate toward it.",
    color: "#1f1a16",
  },
  topLeft: {
    name: "The Sentinel",
    compassLabel: "Sentinels",
    desc: "Believes powerful AI is coming but fears what happens without guardrails.",
    color: "#1f1a16",
  },
  bottomRight: {
    name: "The Synthesist",
    compassLabel: "Synthesists",
    desc: "Wary of grand AI claims while believing in real-world applications.",
    color: "#1f1a16",
  },
  bottomLeft: {
    name: "The Skeptic",
    compassLabel: "Skeptics",
    desc: "Doubts transformative potential and favors strong restrictions.",
    color: "#1f1a16",
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
const OCCUPATION_CHAR_LIMIT = 24;
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
const COMPASS_DOT_COLOR = "#5d5852";
const COMPASS_DOT_FADED_COLOR = "#c7c1b7";
const COMPASS_DOT_RADIUS = 3;
const COMPASS_USER_DOT_RADIUS = 4.5;

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
  SiteBG: "#f3ebde",
  SiteText: "#1f1a16",
  SiteBorder: "#b8aea2",
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

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
        archetype: typeof payload.archetype === "string" ? payload.archetype : "",
        demographics,
        age: typeof demographics.age === "string" ? demographics.age : "",
        country: typeof demographics.country === "string" ? demographics.country : "",
        industry:
          typeof demographics.industry === "string" ? demographics.industry : "",
        occupation:
          typeof demographics.occupation === "string" ? demographics.occupation : "",
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
          payload.question_medians && typeof payload.question_medians === "object"
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
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          color: "#1f1a16",
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
          fontSize: 12,
          fontFamily: "'Newsreader', serif",
          background: TAB_STYLE_VARS.outerBackground,
          border: tabBorder(),
          color: "#1f1a16",
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
                color: "#1f1a16",
                fontFamily: "'Newsreader', serif",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: "1px solid rgba(31,26,22,0.45)",
                  borderRadius: 4,
                  background: THEME.SiteBG,
                  color: THEME.SiteText,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  lineHeight: 1,
                }}
              >
                {selectionGlyph}
              </span>
              <span>Select/Deselect All</span>
            </button>
            {options.map((option) => {
              const enabled = !disabledSet.has(option.value);
              return (
                <button
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
                    color: "#1f1a16",
                    fontFamily: "'Newsreader', serif",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      border: "1px solid rgba(31,26,22,0.45)",
                      borderRadius: 4,
                      background: THEME.SiteBG,
                      color: THEME.SiteText,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      lineHeight: 1,
                    }}
                  >
                    {enabled ? "+" : ""}
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
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          color: "#1f1a16",
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
          fontSize: 12,
          fontFamily: "'Newsreader', serif",
          background: TAB_STYLE_VARS.outerBackground,
          border: tabBorder(),
          color: "#1f1a16",
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
                  color: "#1f1a16",
                  fontFamily: "'Newsreader', serif",
                  fontSize: 12,
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
  const axisLabelGap = 10;
  const axisLabelFontSize = 10;
  const xAxisLetterSpacingEm = 0.1;
  const yAxisLetterSpacingEm = xAxisLetterSpacingEm * 0.5;
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

  const quadFill = "rgba(31,26,22,0.08)";
  const quadrantFillRects = [
    { key: "topRight", x: cx, y: pad },
    { key: "topLeft", x: pad, y: pad },
    { key: "bottomRight", x: cx, y: cy },
    { key: "bottomLeft", x: pad, y: cy },
  ];
  const axisLabelTextStyle = {
    textAnchor: "middle",
    fill: "#1f1a16",
    fontSize: axisLabelFontSize,
    fontFamily: "'IBM Plex Mono', monospace",
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
    fontSize: 9,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: "0.15em",
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
        const dotRadius = isUser ? COMPASS_USER_DOT_RADIUS : COMPASS_DOT_RADIUS;
        const quadrant = getQuadrant(dot.x, dot.y);
        return {
          id: dot.id || `idx-${i}`,
          dot,
          sx,
          sy,
          color: QUADRANT_INFO[quadrant].color,
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
    ],
  );
  const plotPointById = useMemo(
    () => new Map(plotPoints.map((point) => [point.id, point])),
    [plotPoints],
  );
  const userPoint = useMemo(
    () => plotPoints.find((point) => point.isUser && point.enabled) || null,
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
      if (!point.enabled) drawDot(point, COMPASS_DOT_FADED_COLOR);
    }
    for (const point of plotPoints) {
      if (point.enabled) drawDot(point, COMPASS_DOT_COLOR);
    }

    onCanvasDraw?.();
  }, [plotPoints, dims.w, dims.h, onCanvasDraw]);

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
            key={key}
            x={x}
            y={y}
            transform={transform}
            letterSpacing={`${
              axis === "y" ? yAxisLetterSpacingEm : xAxisLetterSpacingEm
            }em`}
            {...axisLabelTextStyle}
          >
            {text}
          </text>
        ))}

        {/* Quadrant labels */}
        {compassLabelPositions.map(({ key, x, y }) => (
          <text
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
            r={activeHoveredPoint.dotRadius}
            fill="none"
            stroke={THEME.SiteBG}
            strokeWidth={1.5}
          />
        )}
        {[userPoint, activeHoveredPoint]
          .filter((point, index, list) => {
            if (!point || !point.enabled) return false;
            return (
              list.findIndex((candidate) => candidate?.id === point.id) ===
              index
            );
          })
          .map((point) => (
            <circle
              key={`pulse-${point.id}`}
              cx={point.sx}
              cy={point.sy}
              r={point.isUser ? 7.5 : 6.5}
              fill="none"
              stroke={point.color}
              strokeWidth={1.5}
              opacity={0.6}
            >
              <animate
                attributeName="r"
                values={point.isUser ? "7.5;11.5;7.5" : "6.5;9.5;6.5"}
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
          const noteText =
            typeof activeHoveredDot.notes === "string"
              ? activeHoveredDot.notes.trim()
              : "";
          const hasNotes = noteText.length > 0;
          const tooltipStyle = {
            position: "absolute",
            left: `${(sx / dims.w) * 100}%`,
            top: `${(sy / dims.h) * 100}%`,
            transform: `translate(${isRight ? "calc(-100% - 12px)" : "12px"}, ${isBottom ? "calc(-100% - 8px)" : "8px"})`,
            background: THEME.SiteText,
            border: `1px solid ${THEME.SiteBorder}`,
            borderRadius: 8,
            padding: hasNotes ? "12px 16px" : "14px 16px 11px",
            minWidth: 180,
            zIndex: 10,
          };
          return (
            <div style={tooltipStyle}>
              {(() => {
                const title =
                  activeHoveredDot.occupation?.trim() || "Anonymous";
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
          );
        })()}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            padding: "4px 6px",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "#1f1a16",
            background: "rgba(243,235,222,0.88)",
            border: "1px solid rgba(31,26,22,0.22)",
            borderRadius: 6,
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
  const [shuffledQuestions] = useState(() => shuffleArray(QUESTIONS));
  const [answers, setAnswers] = useState({});
  const [ageRange, setAgeRange] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [ipCountryCode] = useState(() => getClientCountryHint());
  const [industry, setIndustry] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [notes, setNotes] = useState("");
  const allAnswered = shuffledQuestions.every(
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
    fontSize: 14,
    fontFamily: "'Newsreader', serif",
    background: TAB_STYLE_VARS.formBackground,
    border: tabBorder(),
    color: "#1f1a16",
    borderRadius: TAB_STYLE_VARS.borderRadius,
    outline: "none",
    boxSizing: "border-box",
  };
  const fieldLabelStyle = {
    fontSize: 12,
    color: "#1f1a16",
    fontFamily: "'IBM Plex Mono', monospace",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    textAlign: "left",
  };

  useEffect(() => {
    onProgressChange?.({
      answered: answeredCount,
      total: shuffledQuestions.length,
      canSubmit,
    });
  }, [answeredCount, shuffledQuestions.length, canSubmit, onProgressChange]);

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
      {shuffledQuestions.map((q, i) => (
        <div
          key={q.id}
          style={{
            marginTop: i === 0 ? 0 : 0,
            marginBottom: 20,
            padding: "80px 40px",
            background:
              answers[q.id] !== undefined
                ? "rgba(31,26,22,0.015)"
                : THEME.SiteBG,
            border:
              answers[q.id] !== undefined
                ? `1px solid ${THEME.SiteText}`
                : `1px solid ${THEME.SiteBorder}`,
            borderRadius: 10,
            transition: "background-color 1s ease, border-color 1s ease",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#1f1a16",
              fontFamily: "'IBM Plex Mono', monospace",
              marginBottom: 8,
            }}
          >
            Q{i + 1}
          </div>
          <div
            style={{
              fontSize: 15,
              color: "#1f1a16",
              lineHeight: 1.55,
              marginBottom: 16,
              fontFamily: "'Newsreader', serif",
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
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono', monospace",
                color: "#1f1a16",
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
            style={{
              color: "#b00020",
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
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
            <span>Job Title</span>
            <span>
              {trimmedJobTitle.length}/{OCCUPATION_CHAR_LIMIT}
            </span>
          </label>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Software Engineer"
            maxLength={OCCUPATION_CHAR_LIMIT}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>
            <span>Additional Notes</span>
            <span>
              {trimmedNotes.length}/{NOTES_CHAR_LIMIT}
            </span>
          </label>
          <textarea
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
          onClick={() =>
            canSubmit &&
            onComplete({
              answers,
              questionOrder: shuffledQuestions.map((question) => question.id),
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
            fontSize: 15,
            fontFamily: "'Newsreader', serif",
            fontWeight: 600,
            background: canSubmit
              ? "linear-gradient(135deg, #6f8f7a, #8da67f)"
              : "rgba(31,26,22,0.03)",
            border: "none",
            color: canSubmit ? "#1f1a16" : "rgba(31,26,22,0.35)",
            borderRadius: 10,
            cursor: canSubmit ? "pointer" : "default",
            transition: "all 0.3s",
          }}
        >
          {canSubmit
            ? "See Results"
            : !allAnswered
              ? `Answer all ${shuffledQuestions.length} questions to continue`
              : "Select Age Range, Country, and Industry to continue"}
        </button>
      </div>
    </div>
  );
}

// --- Main App ---
export default function AICompass() {
  const [screen, setScreen] = useState("home"); // home, quiz, results
  const [scores, setScores] = useState(null);
  const [quizProgress, setQuizProgress] = useState({
    answered: 0,
    total: QUESTIONS.length,
    canSubmit: false,
  });
  const [results, setResults] = useState([]);
  const [userResult, setUserResult] = useState(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const [pinnedQuadrant, setPinnedQuadrant] = useState(null);
  const [firestoreError, setFirestoreError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearingDevDots, setClearingDevDots] = useState(false);
  const [disabledAges, setDisabledAges] = useState([]);
  const [disabledCountries, setDisabledCountries] = useState([]);
  const [disabledIndustries, setDisabledIndustries] = useState([]);
  const [filterIpCountryCode] = useState(() => getClientCountryHint());
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
  }, []);
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

  const quadrant = scores ? getQuadrant(scores.x, scores.y) : null;
  const qi = quadrant ? QUADRANT_INFO[quadrant] : null;
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
        overflow: "hidden",
        background: THEME.SiteBG,
        color: THEME.SiteText,
        fontFamily: "'Newsreader', serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          boxSizing: "border-box",
          padding: "14px 16px",
          background: THEME.SiteText,
          display: "flex",
          flexDirection: "column",
          gap: 12,
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
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 26,
              fontWeight: 200,
              letterSpacing: "0.2em",
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
                onClick={() => {
                  setScreen("quiz");
                  setScores(null);
                  resetQuizProgress();
                }}
                style={{
                  width: "fit-content",
                  height: "100%",
                  padding: "0 14px",
                  fontSize: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 500,
                  background: THEME.SiteBG,
                  border: "1px solid rgba(243,235,222,0.65)",
                  color: THEME.SiteText,
                  borderRadius: 10,
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
                  background: "rgba(243,235,222,0.2)",
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
                style={{
                  height: HEADER_ACTION_HEIGHT * 0.75 - 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
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
          height: "100%",
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          WebkitOverflowScrolling: "touch",
          padding: `${HEADER_BAR_HEIGHT + 24}px 48px 48px`,
          boxSizing: "border-box",
        }}
      >
        {firestoreError && (
          <div
            style={{
              maxWidth: 1000,
              margin: "0 auto 16px",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,179,0,0.4)",
              background: "rgba(31,26,22,0.08)",
              color: "#1f1a16",
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
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
                style={{
                  position: "fixed",
                  left: "50%",
                  top: HEADER_BAR_HEIGHT + 200,
                  transform: "translateX(-50%)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 14,
                  letterSpacing: "0.2em",
                  color: "#1f1a16",
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
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      color: "#1f1a16",
                      letterSpacing: 2,
                      marginBottom: 8,
                    }}
                  >
                    YOUR RESULT SECTION
                  </div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 24,
                      color: qi.color,
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    {qi.name}
                  </div>
                  <p
                    style={{
                      color: "#1f1a16",
                      fontSize: 14,
                      maxWidth: 400,
                      margin: "0 auto 16px",
                      lineHeight: 1.55,
                    }}
                  >
                    {qi.desc}
                  </p>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12,
                      color: "#1f1a16",
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
                  results={results}
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
                        padding: "12px 14px",
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
                        style={{
                          color: val.color,
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 12,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {val.name}
                      </div>
                      <div
                        style={{
                          color: "#1f1a16",
                          fontSize: 12,
                          lineHeight: 1.45,
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
                    onClick={handleDevShortcutSubmit}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontWeight: 500,
                      background: "rgba(31,26,22,0.08)",
                      border: "1px solid rgba(31,26,22,0.14)",
                      color: "#1f1a16",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    Dev shortcut: random dot
                  </button>
                  <button
                    onClick={handleClearDevDots}
                    disabled={clearingDevDots}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontWeight: 500,
                      background: "rgba(31,26,22,0.08)",
                      border: "1px solid rgba(31,26,22,0.14)",
                      color: "#1f1a16",
                      borderRadius: 8,
                      cursor: clearingDevDots ? "wait" : "pointer",
                      opacity: clearingDevDots ? 0.7 : 1,
                    }}
                  >
                    {clearingDevDots
                      ? "Clearing dev dots..."
                      : "Reset dev dots"}
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
            background: "rgba(243,235,222,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14,
              color: "#1f1a16",
            }}
          >
            Plotting your position...
          </div>
        </div>
      )}
    </div>
  );
}
