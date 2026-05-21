import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
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
const COMPASS_SUBMIT_ENDPOINT =
  import.meta.env.VITE_COMPASS_SUBMIT_ENDPOINT || "";
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
  "Telecommunications",
  "Other",
];

const COUNTRY_OPTIONS = ISO_COUNTRIES;

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
const ARCHETYPE_BG_SOLID = "#efe6da";
const UNSPECIFIED_FILTER_VALUE = "__UNSPECIFIED__";
const DROPDOWN_VIEWPORT_BUFFER = 10;
const DROPDOWN_MENU_MAX_HEIGHT = 200;
const DEV_SAMPLE_OCCUPATION = "Lead Social Media Strategy Supervisor";
const DEV_SAMPLE_NOTES =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

const THEME = {
  SiteBG: "#f3ebde",
  SiteText: "#1f1a16",
  SiteBorder: "#b8aea2",
};

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

function normalizeFilterValue(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : UNSPECIFIED_FILTER_VALUE;
}

function useDropdownMenuLayout(open, rootRef) {
  const [menuPlacement, setMenuPlacement] = useState("down");
  const [menuMaxHeight, setMenuMaxHeight] = useState(DROPDOWN_MENU_MAX_HEIGHT);

  const updateMenuLayout = () => {
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
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuLayout();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleResizeOrScroll = () => updateMenuLayout();
    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [open]);

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
        border: "1px solid rgba(31,26,22,0.1)",
        borderRadius: 8,
        background: "rgba(31,26,22,0.02)",
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
          background: "rgba(31,26,22,0.02)",
          border: "1px solid rgba(31,26,22,0.14)",
          color: "#1f1a16",
          borderRadius: 6,
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
            background: ARCHETYPE_BG_SOLID,
            border: "1px solid rgba(31,26,22,0.2)",
            borderRadius: 8,
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
            }}
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
        border: "1px solid rgba(31,26,22,0.1)",
        borderRadius: 8,
        background: "rgba(31,26,22,0.02)",
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
          background: "rgba(31,26,22,0.02)",
          border: "1px solid rgba(31,26,22,0.14)",
          color: "#1f1a16",
          borderRadius: 6,
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
            background: ARCHETYPE_BG_SOLID,
            border: "1px solid rgba(31,26,22,0.2)",
            borderRadius: 8,
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
            }}
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
}) {
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ w: 960, h: 520 });
  const [hoveredDot, setHoveredDot] = useState(null);
  const axisLabelGap = 10;
  const axisLabelFontSize = 10;
  const pad = axisLabelGap + axisLabelFontSize + 2;

  useEffect(() => {
    const el = svgRef.current?.parentElement;
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
      x: cx,
      y: pad - axisLabelGap,
      text: "HIGH BELIEF IN LLM POTENTIAL",
    },
    {
      key: "bottom",
      x: cx,
      y: dims.h - pad + axisLabelGap + axisLabelFontSize,
      text: "LOW BELIEF IN LLM POTENTIAL",
    },
    {
      key: "left",
      x: pad - axisLabelGap,
      y: cy,
      text: "RESTRICT ADVANCEMENT",
      transform: `rotate(-90,${pad - axisLabelGap},${cy})`,
    },
    {
      key: "right",
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
  const isDotEnabled = (dot) =>
    !disabledAgeSet.has(normalizeFilterValue(dot.age)) &&
    !disabledCountrySet.has(normalizeFilterValue(dot.country)) &&
    !disabledIndustrySet.has(normalizeFilterValue(dot.industry));
  const activeHoveredDot =
    hoveredDot && isDotEnabled(hoveredDot) ? hoveredDot : null;

  return (
    <div style={{ position: "relative", width: "100%", margin: "0 auto" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{ width: "100%", height: "auto", display: "block" }}
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
        {axisLabels.map(({ key, x, y, text, transform }) => (
          <text
            key={key}
            x={x}
            y={y}
            transform={transform}
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

        {/* Larger hover hitboxes (2x dot radius), rendered beneath visible dots */}
        {results.map((r, i) => {
          const { sx, sy } = toSvg(r.x, r.y);
          const isUser = userResult && r.id === userResult.id;
          const dotRadius = isUser ? 5 : 3.5;
          const enabled = isDotEnabled(r);
          return (
            <circle
              key={`hitbox-${r.id || i}`}
              cx={sx}
              cy={sy}
              r={dotRadius * 2}
              fill="transparent"
              stroke="none"
              pointerEvents={enabled ? "all" : "none"}
              onMouseEnter={enabled ? () => setHoveredDot(r) : undefined}
              onMouseLeave={
                enabled
                  ? () =>
                      setHoveredDot((prev) => (prev?.id === r.id ? null : prev))
                  : undefined
              }
            />
          );
        })}

        {/* Result dots */}
        {results.map((r, i) => {
          const { sx, sy } = toSvg(r.x, r.y);
          const q = getQuadrant(r.x, r.y);
          const col = QUADRANT_INFO[q].color;
          const isUser = userResult && r.id === userResult.id;
          const isHovered = activeHoveredDot && r.id === activeHoveredDot.id;
          const enabled = isDotEnabled(r);
          const baseOpacity = isUser ? 1 : 0.7;
          return (
            <g key={r.id || i}>
              {enabled && (isUser || isHovered) && (
                <circle
                  cx={sx}
                  cy={sy}
                  r={isUser ? 8 : 7}
                  fill="none"
                  stroke={col}
                  strokeWidth={1.5}
                  opacity={0.6}
                  pointerEvents="none"
                >
                  <animate
                    attributeName="r"
                    values={isUser ? "8;12;8" : "7;10;7"}
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
              )}
              <circle
                cx={sx}
                cy={sy}
                r={isUser ? 5 : 3.5}
                fill={col}
                opacity={enabled ? baseOpacity : 0.2}
                stroke={isHovered ? THEME.SiteBG : "none"}
                strokeWidth={isHovered ? 1.5 : 0}
                style={{ cursor: enabled ? "pointer" : "default" }}
                onMouseEnter={enabled ? () => setHoveredDot(r) : undefined}
                onMouseLeave={
                  enabled
                    ? () =>
                        setHoveredDot((prev) =>
                          prev?.id === r.id ? null : prev,
                        )
                    : undefined
                }
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip for hovered dot */}
      {activeHoveredDot &&
        (() => {
          const { sx, sy } = toSvg(activeHoveredDot.x, activeHoveredDot.y);
          const isRight = sx > cx;
          const isBottom = sy > cy;
          const tooltipStyle = {
            position: "absolute",
            left: `${(sx / dims.w) * 100}%`,
            top: `${(sy / dims.h) * 100}%`,
            transform: `translate(${isRight ? "calc(-100% - 12px)" : "12px"}, ${isBottom ? "calc(-100% - 8px)" : "8px"})`,
            background: THEME.SiteText,
            border: `1px solid ${THEME.SiteBorder}`,
            borderRadius: 8,
            padding: "12px 16px",
            minWidth: 180,
            zIndex: 10,
            backdropFilter: "blur(12px)",
            lineHeight: 1.2,
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
                const age = activeHoveredDot.age?.trim() || "";
                const details = [country, age].filter(Boolean).join(", ");
                return (
                  <div style={{ fontSize: 12, color: THEME.SiteBG }}>
                    <strong>{title}</strong>
                    {details ? `, ${details}` : ""}
                  </div>
                );
              })()}
              {activeHoveredDot.notes && (
                <div
                  style={{
                    fontSize: 12,
                    color: THEME.SiteBG,
                    marginTop: 4,
                    fontStyle: "italic",
                  }}
                >
                  "{activeHoveredDot.notes}"
                </div>
              )}
            </div>
          );
        })()}
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
      ...AGE_RANGES.map((age) => ({ value: age, label: age })),
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
      ...INDUSTRY_OPTIONS.map((option) => ({ value: option, label: option })),
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
    background: "rgba(31,26,22,0.04)",
    border: "1px solid rgba(31,26,22,0.1)",
    color: "#1f1a16",
    borderRadius: 8,
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
        setFirestoreError("");
        setResults(nextResults);
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        setFirestoreError(
          error?.code
            ? `Live sync unavailable (${error.code}).`
            : "Live sync unavailable right now.",
        );
        setResults([]);
      },
    );

    return unsubscribe;
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
        setFirestoreError("");
        setUserResult((prev) =>
          prev?.id === localId
            ? {
                ...entry,
                ...saved,
                id: saved.submission_id || saved.id || prev.id,
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
    const devScores = {
      x: Number((Math.random() * 2 - 1).toFixed(4)),
      y: Number((Math.random() * 2 - 1).toFixed(4)),
    };
    setScores(devScores);
    const randomAge = AGE_RANGES[Math.floor(Math.random() * AGE_RANGES.length)];
    const randomCountry =
      COUNTRY_OPTIONS[Math.floor(Math.random() * COUNTRY_OPTIONS.length)]
        ?.code || "";
    const randomIndustry =
      INDUSTRY_OPTIONS[Math.floor(Math.random() * INDUSTRY_OPTIONS.length)] ||
      "";
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
        occupation: DEV_SAMPLE_OCCUPATION.slice(0, OCCUPATION_CHAR_LIMIT),
        notes: DEV_SAMPLE_NOTES.slice(0, NOTES_CHAR_LIMIT),
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
  const activeQuadrant = pinnedQuadrant || hoveredQuadrant;
  const ageFilterOptions = useMemo(
    () => [
      ...AGE_RANGES.map((age) => ({ value: age, label: age })),
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: THEME.SiteBG,
        color: THEME.SiteText,
        fontFamily: "'Newsreader', serif",
        padding: `${HEADER_BAR_HEIGHT + 24}px 48px 48px`,
        overscrollBehaviorY: "none",
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

      {/* Home Screen */}
      {screen === "home" && (
        <>
          <div style={{ marginTop: HOME_SECTION_GAP }}>
            <Compass
              results={results}
              userResult={userResult}
              activeQuadrant={activeQuadrant}
              disabledAges={disabledAges}
              disabledCountries={disabledCountries}
              disabledIndustries={disabledIndustries}
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
                    background: "rgba(31,26,22,0.02)",
                    border:
                      activeQuadrant === key
                        ? "1px solid rgba(31,26,22,0.35)"
                        : "1px solid rgba(31,26,22,0.06)",
                    borderRadius: 8,
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
                {clearingDevDots ? "Clearing dev dots..." : "Reset dev dots"}
              </button>
            </div>
          )}
        </>
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

      {/* Results Screen */}
      {screen === "results" && scores && qi && (
        <div>
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
              YOUR RESULT
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

          <Compass results={results} userResult={userResult} />

          <div
            style={{
              textAlign: "center",
              marginTop: 24,
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                setScreen("home");
                resetQuizProgress();
              }}
              style={{
                padding: "10px 24px",
                fontSize: 13,
                fontFamily: "'Newsreader', serif",
                background: "rgba(31,26,22,0.05)",
                border: "1px solid rgba(31,26,22,0.1)",
                color: "#1f1a16",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              View Compass
            </button>
            <button
              onClick={() => {
                setScreen("quiz");
                setScores(null);
                setUserResult(null);
                resetQuizProgress();
              }}
              style={{
                padding: "10px 24px",
                fontSize: 13,
                fontFamily: "'Newsreader', serif",
                background: "rgba(0,229,255,0.1)",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "#1f1a16",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Retake Quiz
            </button>
          </div>
        </div>
      )}

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
