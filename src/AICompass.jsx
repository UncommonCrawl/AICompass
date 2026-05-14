import { useState, useEffect, useRef } from "react";
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

const QUADRANT_INFO = {
  topRight: {
    name: "Singularitarian",
    desc: "Believes transformative AI is near and wants to accelerate toward it.",
    color: "#1f1a16",
  },
  topLeft: {
    name: "Sentinel",
    desc: "Believes powerful AI is coming but fears what happens without guardrails.",
    color: "#1f1a16",
  },
  bottomRight: {
    name: "Synergist",
    desc: "Skeptical of grand AI claims but supports continued development freedom.",
    color: "#1f1a16",
  },
  bottomLeft: {
    name: "Skeptic",
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

const THEME = {
  SiteBG: "#f3ebde",
  SiteText: "#1f1a16",
  SiteBorder: "#b8aea2",
};

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

// --- Compass Visualization ---
function Compass({
  results,
  userResult,
  onDotClick,
  selectedDot,
  onClearSelection,
  activeQuadrant,
}) {
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ w: 960, h: 520 });
  const pad = 60;

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

  return (
    <div style={{ position: "relative", width: "100%", margin: "0 auto" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Quadrant fills */}
        <rect
          x={cx}
          y={pad}
          width={xRange}
          height={yRange}
          fill={quadFill}
          opacity={activeQuadrant === "topRight" ? 1 : 0}
          style={{ transition: "opacity 220ms ease" }}
        />
        <rect
          x={pad}
          y={pad}
          width={xRange}
          height={yRange}
          fill={quadFill}
          opacity={activeQuadrant === "topLeft" ? 1 : 0}
          style={{ transition: "opacity 220ms ease" }}
        />
        <rect
          x={cx}
          y={cy}
          width={xRange}
          height={yRange}
          fill={quadFill}
          opacity={activeQuadrant === "bottomRight" ? 1 : 0}
          style={{ transition: "opacity 220ms ease" }}
        />
        <rect
          x={pad}
          y={cy}
          width={xRange}
          height={yRange}
          fill={quadFill}
          opacity={activeQuadrant === "bottomLeft" ? 1 : 0}
          style={{ transition: "opacity 220ms ease" }}
        />

        {/* Grid lines */}
        {[-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].map((v) => {
          const { sx } = toSvg(v, 0);
          const { sy } = toSvg(0, v);
          return (
            <g key={v}>
              <line
                x1={sx}
                y1={pad}
                x2={sx}
                y2={dims.h - pad}
                stroke={THEME.SiteBorder}
                strokeWidth={0.5}
              />
              <line
                x1={pad}
                y1={sy}
                x2={dims.w - pad}
                y2={sy}
                stroke={THEME.SiteBorder}
                strokeWidth={0.5}
              />
            </g>
          );
        })}

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
        <text
          x={cx}
          y={pad - 18}
          textAnchor="middle"
          fill="#1f1a16"
          fontSize={10}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.8}
        >
          HIGH BELIEF IN LLM POTENTIAL
        </text>
        <text
          x={cx}
          y={dims.h - pad + 28}
          textAnchor="middle"
          fill="#1f1a16"
          fontSize={10}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.8}
        >
          LOW BELIEF IN LLM POTENTIAL
        </text>
        <text
          x={pad - 14}
          y={cy}
          textAnchor="middle"
          fill="#1f1a16"
          fontSize={10}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.8}
          transform={`rotate(-90,${pad - 14},${cy})`}
        >
          RESTRICT ADVANCEMENT
        </text>
        <text
          x={dims.w - pad + 14}
          y={cy}
          textAnchor="middle"
          fill="#1f1a16"
          fontSize={10}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.8}
          transform={`rotate(90,${dims.w - pad + 14},${cy})`}
        >
          ACCELERATE ADVANCEMENT
        </text>

        {/* Quadrant labels */}
        <text
          x={pad + 12}
          y={pad + 18}
          fill={QUADRANT_INFO.topLeft.color}
          fontSize={9}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.5}
        >
          {QUADRANT_INFO.topLeft.name}
        </text>
        <text
          x={dims.w - pad - 12}
          y={pad + 18}
          textAnchor="end"
          fill={QUADRANT_INFO.topRight.color}
          fontSize={9}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.5}
        >
          {QUADRANT_INFO.topRight.name}
        </text>
        <text
          x={pad + 12}
          y={dims.h - pad - 10}
          fill={QUADRANT_INFO.bottomLeft.color}
          fontSize={9}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.5}
        >
          {QUADRANT_INFO.bottomLeft.name}
        </text>
        <text
          x={dims.w - pad - 12}
          y={dims.h - pad - 10}
          textAnchor="end"
          fill={QUADRANT_INFO.bottomRight.color}
          fontSize={9}
          fontFamily="'IBM Plex Mono', monospace"
          opacity={0.5}
        >
          {QUADRANT_INFO.bottomRight.name}
        </text>

        {/* Result dots */}
        {results.map((r, i) => {
          const { sx, sy } = toSvg(r.x, r.y);
          const q = getQuadrant(r.x, r.y);
          const col = QUADRANT_INFO[q].color;
          const isUser = userResult && r.id === userResult.id;
          const isSelected = selectedDot && r.id === selectedDot.id;
          return (
            <g
              key={r.id || i}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onDotClick(r);
              }}
            >
              {(isUser || isSelected) && (
                <circle
                  cx={sx}
                  cy={sy}
                  r={isUser ? 8 : 7}
                  fill="none"
                  stroke={col}
                  strokeWidth={1.5}
                  opacity={0.6}
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
                opacity={isUser ? 1 : 0.7}
                stroke={isSelected ? THEME.SiteBG : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip for selected dot */}
      {selectedDot &&
        (() => {
          const { sx, sy } = toSvg(selectedDot.x, selectedDot.y);
          const isRight = sx > cx;
          const isBottom = sy > cy;
          const q = getQuadrant(selectedDot.x, selectedDot.y);
          const qi = QUADRANT_INFO[q];
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
          };
          return (
            <div style={tooltipStyle} onClick={(e) => e.stopPropagation()}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    color: THEME.SiteBG,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {qi.name}
                </span>
                <button
                  onClick={onClearSelection}
                  style={{
                    background: "none",
                    border: "none",
                    color: THEME.SiteBG,
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: THEME.SiteBG,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: 6,
                }}
              >
                x: {selectedDot.x.toFixed(2)} / y: {selectedDot.y.toFixed(2)}
              </div>
              {selectedDot.age && (
                <div
                  style={{
                    fontSize: 12,
                    color: THEME.SiteBG,
                    marginBottom: 2,
                  }}
                >
                  Age: {selectedDot.age}
                </div>
              )}
              {selectedDot.country && (
                <div
                  style={{
                    fontSize: 12,
                    color: THEME.SiteBG,
                    marginBottom: 2,
                  }}
                >
                  Country: {selectedDot.country}
                </div>
              )}
              {selectedDot.occupation && (
                <div style={{ fontSize: 12, color: THEME.SiteBG }}>
                  Occupation: {selectedDot.occupation}
                </div>
              )}
              {!selectedDot.age &&
                !selectedDot.country &&
                !selectedDot.occupation && (
                  <div
                    style={{
                      fontSize: 12,
                      color: THEME.SiteBG,
                      fontStyle: "italic",
                    }}
                  >
                    Anonymous
                  </div>
                )}
              {userResult && selectedDot.id === userResult.id && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    color: THEME.SiteBG,
                    fontFamily: "'IBM Plex Mono', monospace",
                    opacity: 0.7,
                  }}
                >
                  This is you
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

// --- Quiz Page ---
function QuizPage({ onComplete }) {
  const [shuffledQuestions] = useState(() => shuffleArray(QUESTIONS));
  const [answers, setAnswers] = useState({});
  const allAnswered = shuffledQuestions.every(
    (q) => answers[q.id] !== undefined,
  );

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
          border: 2px solid ${THEME.SiteText};
          box-shadow: none;
          box-sizing: border-box;
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
          border: 2px solid ${THEME.SiteText};
          box-shadow: none;
          box-sizing: border-box;
        }
      `}</style>
      {/* Progress */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "#f3ebde",
          paddingBottom: 16,
          paddingTop: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              color: "#1f1a16",
            }}
          >
            {Object.keys(answers).length} / {shuffledQuestions.length} answered
          </span>
          {allAnswered && (
            <button
              onClick={() => onComplete(answers)}
              style={{
                padding: "6px 20px",
                fontSize: 12,
                fontFamily: "'Newsreader', serif",
                fontWeight: 600,
                background: "linear-gradient(135deg, #6f8f7a, #8da67f)",
                border: "none",
                color: "#1f1a16",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              See Results
            </button>
          )}
        </div>
        <div
          style={{
            height: 3,
            background: "rgba(31,26,22,0.06)",
            borderRadius: 2,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(Object.keys(answers).length / shuffledQuestions.length) * 100}%`,
              background: "linear-gradient(90deg, #6f8f7a, #8da67f)",
              borderRadius: 2,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Questions */}
      {shuffledQuestions.map((q, i) => (
        <div
          key={q.id}
          style={{
            marginBottom: 20,
            padding: "80px 40px",
            background:
              answers[q.id] !== undefined
                ? "rgba(31,26,22,0.015)"
                : "rgba(31,26,22,0.02)",
            border:
              answers[q.id] !== undefined
                ? `1px solid ${THEME.SiteBorder}`
                : `1px solid ${THEME.SiteBorder}`,
            borderRadius: 10,
            transition: "border-color 0.2s",
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
                className="response-slider"
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

      {/* Bottom submit */}
      <div style={{ textAlign: "center", marginTop: 16, paddingBottom: 20 }}>
        <button
          onClick={() => allAnswered && onComplete(answers)}
          disabled={!allAnswered}
          style={{
            padding: "14px 40px",
            fontSize: 15,
            fontFamily: "'Newsreader', serif",
            fontWeight: 600,
            background: allAnswered
              ? "linear-gradient(135deg, #6f8f7a, #8da67f)"
              : "rgba(31,26,22,0.03)",
            border: "none",
            color: allAnswered ? "#1f1a16" : "rgba(31,26,22,0.35)",
            borderRadius: 10,
            cursor: allAnswered ? "pointer" : "default",
            transition: "all 0.3s",
          }}
        >
          {allAnswered
            ? "See Results"
            : `Answer all ${shuffledQuestions.length} questions to continue`}
        </button>
      </div>
    </div>
  );
}

// --- Demographics ---
function DemographicsPage({ onSubmit, onSkip }) {
  const [age, setAge] = useState("");
  const [country, setCountry] = useState("");
  const [occupation, setOccupation] = useState("");

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

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", textAlign: "center" }}>
      <h2
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 18,
          color: "#1f1a16",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        Before we plot you...
      </h2>
      <p
        style={{
          color: "#1f1a16",
          fontSize: 14,
          fontFamily: "'Newsreader', serif",
          marginBottom: 32,
        }}
      >
        Optionally share a bit about yourself. This info will be visible when
        others click your dot on the compass.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          textAlign: "left",
          marginBottom: 32,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 12,
              color: "#1f1a16",
              fontFamily: "'IBM Plex Mono', monospace",
              display: "block",
              marginBottom: 6,
            }}
          >
            Age Range
          </label>
          <select
            value={age}
            onChange={(e) => setAge(e.target.value)}
            style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
          >
            <option value="">Prefer not to say</option>
            {AGE_RANGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              color: "#1f1a16",
              fontFamily: "'IBM Plex Mono', monospace",
              display: "block",
              marginBottom: 6,
            }}
          >
            Country
          </label>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. United States"
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              color: "#1f1a16",
              fontFamily: "'IBM Plex Mono', monospace",
              display: "block",
              marginBottom: 6,
            }}
          >
            Occupation
          </label>
          <input
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="e.g. Software Engineer"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          onClick={() => onSkip()}
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
          Skip
        </button>
        <button
          onClick={() => onSubmit({ age, country, occupation })}
          style={{
            padding: "10px 28px",
            fontSize: 13,
            fontFamily: "'Newsreader', serif",
            fontWeight: 600,
            background: "linear-gradient(135deg, #6f8f7a, #8da67f)",
            border: "none",
            color: "#1f1a16",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Plot Me
        </button>
      </div>
    </div>
  );
}

// --- Main App ---
export default function AICompass() {
  const [screen, setScreen] = useState("home"); // home, quiz, demographics, results
  const [scores, setScores] = useState(null);
  const [results, setResults] = useState([]);
  const [userResult, setUserResult] = useState(null);
  const [selectedDot, setSelectedDot] = useState(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const [pinnedQuadrant, setPinnedQuadrant] = useState(null);
  const [firestoreError, setFirestoreError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearingDevDots, setClearingDevDots] = useState(false);

  // Subscribe to live Firestore updates once on first render.
  useEffect(() => {
    const resultsQuery = query(
      collection(db, "compass-results-v2"),
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

  const handleQuizComplete = (ans) => {
    const s = calculateScores(ans);
    setScores(s);
    setScreen("demographics");
  };

  const handleSubmit = (demo = {}, overrideScores = null, options = {}) => {
    const activeScores = overrideScores || scores;
    if (!activeScores) return;
    setSubmitting(true);
    const entry = {
      x: activeScores.x,
      y: activeScores.y,
      age: demo.age || "",
      country: demo.country || "",
      occupation: demo.occupation || "",
      isDev: options.isDev === true,
      ts: Date.now(),
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

    addDoc(collection(db, "compass-results-v2"), entry)
      .then((docRef) => {
        setFirestoreError("");
        setUserResult((prev) =>
          prev?.id === localId ? { ...entry, id: docRef.id } : prev,
        );
      })
      .catch((error) => {
        console.error("Firestore addDoc error:", error);
        setFirestoreError(
          error?.code
            ? `Unable to submit (${error.code}).`
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
    handleSubmit({}, devScores, { isDev: true });
  };

  const handleClearDevDots = async () => {
    setClearingDevDots(true);
    try {
      const allDocsSnap = await getDocs(collection(db, "compass-results-v2"));

      const docsToDelete = allDocsSnap.docs.filter((docSnap) => {
        const data = docSnap.data();
        return data?.isDev === true;
      });

      await Promise.all(docsToDelete.map((docSnap) => deleteDoc(docSnap.ref)));
      setResults((prev) => prev.filter((r) => r.isDev !== true));
      setSelectedDot((prev) => (prev?.isDev === true ? null : prev));
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
        padding: "24px 16px 60px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: screen === "home" ? 24 : 24,
          paddingTop: 0,
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
          }}
        >
          <h1
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 28,
              fontWeight: 600,
              margin: 0,
              color: "#1f1a16",
              lineHeight: 1.3,
            }}
          >
            The AI Compass
          </h1>
        </button>
        {screen === "home" && (
          <p
            style={{
              color: "#1f1a16",
              fontSize: 14,
              maxWidth: 1000,
              margin: "12px auto 0",
              lineHeight: 1,
            }}
          >
            A 16-question survey that maps your position on two axes: how much
            you believe in LLM potential, and how much you support unrestricted
            AI advancement.
          </p>
        )}
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
          <div style={{ textAlign: "center", marginBottom: 0 }}>
            <button
              onClick={() => {
                setScreen("quiz");
                setScores(null);
              }}
              style={{
                padding: "14px 40px",
                fontSize: 15,
                fontFamily: "'Newsreader', serif",
                fontWeight: 600,
                background: "#f3ebde",
                border: "1px solid rgba(31,26,22,0.2)",
                color: "#1f1a16",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Take the Quiz
            </button>
            {import.meta.env.DEV && (
              <div
                style={{
                  marginTop: 10,
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
          </div>

          <div onClick={() => setSelectedDot(null)}>
            <Compass
              results={results}
              userResult={userResult}
              selectedDot={selectedDot}
              onDotClick={setSelectedDot}
              onClearSelection={() => setSelectedDot(null)}
              activeQuadrant={activeQuadrant}
            />
          </div>

          <div style={{ textAlign: "center", marginTop: 0 }}>
            {results.length > 0 && (
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  color: "#1f1a16",
                }}
              >
                {results.length} response{results.length !== 1 ? "s" : ""}{" "}
                plotted
              </div>
            )}
          </div>

          {/* Quadrant legend */}
          <div
            style={{
              width: "100%",
              margin: "36px auto 0",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {Object.entries(QUADRANT_INFO).map(([key, val]) => (
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
            ))}
          </div>
        </>
      )}

      {/* Quiz Screen */}
      {screen === "quiz" && (
        <div>
          <QuizPage onComplete={handleQuizComplete} />
        </div>
      )}

      {/* Demographics Screen */}
      {screen === "demographics" && (
        <DemographicsPage
          onSubmit={(demo) => handleSubmit(demo)}
          onSkip={() => handleSubmit({})}
        />
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

          <div onClick={() => setSelectedDot(null)}>
            <Compass
              results={results}
              userResult={userResult}
              selectedDot={selectedDot}
              onDotClick={setSelectedDot}
              onClearSelection={() => setSelectedDot(null)}
            />
          </div>

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
              onClick={() => setScreen("home")}
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
