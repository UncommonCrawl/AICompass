import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { db } from "./firebase";
import { auth } from "./firebaseAuth";

const SUBMISSIONS_COLLECTION = "compass-results-v2";
const SUBMISSION_PRIVATE_COLLECTION = "compass-submission-private-v1";
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const RAW_SUBMISSIONS_LIMIT = 1000;
const RAW_SUBMISSIONS_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_TITLE = "AI Compass Dashboard";
const CHART_WIDTH = 920;
const CHART_HEIGHT = 280;
const CHART_MARGIN = { top: 28, right: 26, bottom: 44, left: 48 };

function getAuthErrorMessage(authError) {
  const code = authError?.code || "";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized for Google sign-in in Firebase Auth.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled for this Firebase project.";
  }
  if (code === "auth/configuration-not-found") {
    return "Firebase Auth is not configured for this project. Enable Authentication and the Google sign-in provider in Firebase Console.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished.";
  }
  return authError?.message || "Unable to start Google sign-in.";
}

function readNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function readText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function readTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatChartDay(day) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00`));
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function shortenHash(value) {
  const text = readText(value);
  if (!text) return "";
  return text.length <= 16 ? text : `${text.slice(0, 10)}...${text.slice(-6)}`;
}

function increment(map, key) {
  const label = key || "Unspecified";
  map.set(label, (map.get(label) || 0) + 1);
}

function sortedBreakdown(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function buildDailySeries(submissions) {
  const dayCounts = new Map();
  let firstTimestamp = null;

  for (const submission of submissions) {
    if (!submission.timestamp) continue;
    firstTimestamp =
      firstTimestamp === null
        ? submission.timestamp
        : Math.min(firstTimestamp, submission.timestamp);
    increment(dayCounts, formatDay(submission.timestamp));
  }

  if (firstTimestamp === null) return [];

  const firstDay = formatDay(firstTimestamp);
  const currentDay = formatDay(Date.now());
  const firstDayMs = Date.parse(`${firstDay}T00:00:00.000Z`);
  const currentDayMs = Date.parse(`${currentDay}T00:00:00.000Z`);
  const series = [];

  for (let dayMs = firstDayMs; dayMs <= currentDayMs; dayMs += DAY_MS) {
    const day = formatDay(dayMs);
    series.push({ day, count: dayCounts.get(day) || 0 });
  }

  return series;
}

function normalizeSubmission(docSnap) {
  const data = docSnap.data() || {};
  const demographics = data.demographics || {};
  const timestamp = readTimestamp(data.createdAt ?? data.created_at ?? data.ts);
  const flags = [
    ...(Array.isArray(data.debugFlags) ? data.debugFlags : []),
    ...(Array.isArray(data.duplicate_policy_flags)
      ? data.duplicate_policy_flags
      : []),
    data.is_dev ? "dev" : "",
    data.is_suspicious_repeat_pattern ? "suspicious_repeat" : "",
    data.is_repeat_device_24h ? "repeat_device_24h" : "",
    data.is_repeat_ip_24h ? "repeat_ip_24h" : "",
    data.repeat_classification &&
    data.repeat_classification !== "first_or_stale"
      ? data.repeat_classification
      : "",
  ].filter(Boolean);

  return {
    id: docSnap.id,
    isDev: data.is_dev === true || data.isDev === true,
    timestamp,
    x: readNumber(data.x, data.x_score),
    y: readNumber(data.y, data.y_score),
    archetype: readText(data.archetype),
    ageRange: readText(demographics.ageRange, demographics.age, data.ageRange, data.age),
    country: readText(demographics.country, data.country),
    industry: readText(demographics.industry, data.industry),
    source: readText(data.source),
    referrer: readText(data.referrer),
    deviceIdHash: shortenHash(data.deviceIdHash || data.device_id_hash),
    completionMs: readNumber(data.completionMs, data.completion_ms),
    flags: [...new Set(flags)],
  };
}

function mergePrivateSubmissionFields(submission, privateData) {
  if (!privateData || typeof privateData !== "object") return submission;
  return {
    ...submission,
    deviceIdHash:
      submission.deviceIdHash ||
      shortenHash(privateData.device_id_hash || privateData.deviceIdHash),
  };
}

function SubmissionsByDayChart({ days, loading }) {
  if (!days.length) {
    return <p className="admin-muted">{loading ? "Loading..." : "No data"}</p>;
  }

  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const maxCount = Math.max(1, ...days.map(({ count }) => count));
  const pointRadius = days.length > 180 ? 2.75 : days.length > 90 ? 3.25 : 4;
  const xFor = (index) =>
    CHART_MARGIN.left +
    (days.length === 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth);
  const yFor = (count) =>
    CHART_MARGIN.top + plotHeight - (count / maxCount) * plotHeight;
  const linePath = days
    .map(({ count }, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(count)}`)
    .join(" ");
  const yTicks = [...new Set([0, Math.ceil(maxCount / 2), maxCount])];
  const midIndex = Math.floor((days.length - 1) / 2);
  const xTicks = [
    { label: formatChartDay(days[0].day), index: 0, anchor: "start" },
    ...(days.length > 2
      ? [{ label: formatChartDay(days[midIndex].day), index: midIndex, anchor: "middle" }]
      : []),
    {
      label: formatChartDay(days[days.length - 1].day),
      index: days.length - 1,
      anchor: "end",
    },
  ];

  return (
    <div className="admin-chart-wrap" aria-label="Submissions by day chart">
      <svg
        className="admin-dot-chart"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <title>
          Submissions by day from {formatChartDay(days[0].day)} to{" "}
          {formatChartDay(days[days.length - 1].day)}
        </title>
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g className="admin-chart-gridline" key={tick}>
              <line
                x1={CHART_MARGIN.left}
                x2={CHART_WIDTH - CHART_MARGIN.right}
                y1={y}
                y2={y}
              />
              <text x={CHART_MARGIN.left - 12} y={y + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}
        <line
          className="admin-chart-axis"
          x1={CHART_MARGIN.left}
          x2={CHART_WIDTH - CHART_MARGIN.right}
          y1={CHART_MARGIN.top + plotHeight}
          y2={CHART_MARGIN.top + plotHeight}
        />
        <line
          className="admin-chart-axis"
          x1={CHART_MARGIN.left}
          x2={CHART_MARGIN.left}
          y1={CHART_MARGIN.top}
          y2={CHART_MARGIN.top + plotHeight}
        />
        <path className="admin-chart-line" d={linePath} />
        {days.map(({ day, count }, index) => {
          const x = xFor(index);
          const y = yFor(count);
          const label = `${formatChartDay(day)}: ${count} ${
            count === 1 ? "submission" : "submissions"
          }`;
          return (
            <g
              className="admin-chart-point-group"
              key={day}
              tabIndex="0"
              aria-label={label}
            >
              <circle
                className="admin-chart-point-hitbox"
                cx={x}
                cy={y}
                r={Math.max(8, pointRadius + 4)}
              />
              <circle
                className="admin-chart-point"
                cx={x}
                cy={y}
                r={pointRadius}
              />
              <text
                className="admin-chart-tooltip"
                x={Math.min(Math.max(x, 80), CHART_WIDTH - 80)}
                y={Math.max(18, y - 12)}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}
        {xTicks.map(({ label, index, anchor }) => (
          <text
            className="admin-chart-x-label"
            key={`${label}-${index}`}
            x={xFor(index)}
            y={CHART_HEIGHT - 12}
            textAnchor={anchor}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function BreakdownList({ entries }) {
  if (!entries.length) return <p className="admin-muted">No data</p>;
  return (
    <div className="admin-breakdown-list">
      {entries.slice(0, 10).map(([label, count]) => (
        <div className="admin-breakdown-row" key={label}>
          <span>{label}</span>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminDashboard() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [totalSubmissions, setTotalSubmissions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [rawSubmissionsPage, setRawSubmissionsPage] = useState(1);

  useEffect(() => {
    const previousTitle = document.title;
    let robotsMeta = document.querySelector('meta[name="robots"]');
    const createdRobotsMeta = !robotsMeta;
    const previousRobotsContent = robotsMeta?.getAttribute("content");

    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }

    document.title = DASHBOARD_TITLE;
    robotsMeta.setAttribute("content", "noindex, nofollow");

    return () => {
      document.title = previousTitle;
      if (createdRobotsMeta) {
        robotsMeta.remove();
      } else if (previousRobotsContent) {
        robotsMeta.setAttribute("content", previousRobotsContent);
      } else {
        robotsMeta.removeAttribute("content");
      }
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth).catch((authError) => {
      if (cancelled) return;
      console.error("Admin sign-in failed:", authError);
      setError(getAuthErrorMessage(authError));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async () => {
    setError("");
    setSigningIn(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      setAuthUser(result.user);
    } catch (authError) {
      console.error("Admin sign-in failed:", authError);
      if (authError?.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          console.error("Admin redirect sign-in failed:", redirectError);
          setError(getAuthErrorMessage(redirectError));
        }
      } else {
        setError(getAuthErrorMessage(authError));
      }
    } finally {
      setSigningIn(false);
    }
  };

  const adminEmail = authUser?.email?.toLowerCase() || "";
  const isConfigured = ADMIN_EMAILS.length > 0;
  const isAuthorized = isConfigured && ADMIN_EMAILS.includes(adminEmail);

  useEffect(() => {
    if (!authReady || !isAuthorized) return;

    let cancelled = false;
    async function loadSubmissions() {
      setLoading(true);
      setError("");
      try {
        const submissionsRef = collection(db, SUBMISSIONS_COLLECTION);
        const docsSnap = await getDocs(
          query(submissionsRef, orderBy("created_at", "desc")),
        );
        if (cancelled) return;
        const normalized = docsSnap.docs
          .map(normalizeSubmission)
          .filter((submission) => !submission.isDev);
        const privateDocs = await Promise.all(
          normalized.slice(0, RAW_SUBMISSIONS_LIMIT).map(async (submission) => {
            try {
              const privateSnap = await getDoc(
                doc(db, SUBMISSION_PRIVATE_COLLECTION, submission.id),
              );
              return [submission.id, privateSnap.exists() ? privateSnap.data() : null];
            } catch {
              return [submission.id, null];
            }
          }),
        );
        const privateById = new Map(privateDocs);
        setTotalSubmissions(normalized.length);
        setSubmissions(
          normalized.map((submission) =>
            mergePrivateSubmissionFields(submission, privateById.get(submission.id)),
          ),
        );
      } catch (loadError) {
        console.error("Admin submission load failed:", loadError);
        if (!cancelled) {
          setError("Unable to load submissions. Check admin allowlist and Firestore rules.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubmissions();
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthorized]);

  const stats = useMemo(() => {
    const archetypes = new Map();
    const ages = new Map();
    const countries = new Map();
    const industries = new Map();
    let xTotal = 0;
    let xCount = 0;
    let yTotal = 0;
    let yCount = 0;

    for (const submission of submissions) {
      increment(archetypes, submission.archetype);
      increment(ages, submission.ageRange);
      increment(countries, submission.country);
      increment(industries, submission.industry);
      if (Number.isFinite(submission.x)) {
        xTotal += submission.x;
        xCount += 1;
      }
      if (Number.isFinite(submission.y)) {
        yTotal += submission.y;
        yCount += 1;
      }
    }

    return {
      averageX: xCount ? xTotal / xCount : null,
      averageY: yCount ? yTotal / yCount : null,
      archetypes: sortedBreakdown(archetypes),
      ages: sortedBreakdown(ages),
      countries: sortedBreakdown(countries),
      industries: sortedBreakdown(industries),
      days: buildDailySeries(submissions),
    };
  }, [submissions]);

  const rawSubmissions = submissions.slice(0, RAW_SUBMISSIONS_LIMIT);
  const rawSubmissionsTotalPages = Math.max(
    1,
    Math.ceil(rawSubmissions.length / RAW_SUBMISSIONS_PAGE_SIZE),
  );
  const displayedRawSubmissionsPage = Math.min(
    rawSubmissionsPage,
    rawSubmissionsTotalPages,
  );
  const rawSubmissionsPageStart =
    (displayedRawSubmissionsPage - 1) * RAW_SUBMISSIONS_PAGE_SIZE;
  const rawSubmissionsPageEnd = Math.min(
    rawSubmissionsPageStart + RAW_SUBMISSIONS_PAGE_SIZE,
    rawSubmissions.length,
  );
  const recentSubmissions = rawSubmissions.slice(
    rawSubmissionsPageStart,
    rawSubmissionsPageEnd,
  );

  if (!authReady) {
    return <main className="admin-page">Loading...</main>;
  }

  if (!isConfigured) {
    return (
      <main className="admin-page admin-auth-card">
        <h1>{DASHBOARD_TITLE}</h1>
        <p>Dashboard access is not configured for this build.</p>
        <p className="admin-muted">
          Set VITE_ADMIN_EMAILS to a comma-separated list of allowed Google
          account emails.
        </p>
        {authUser && (
          <>
            <p className="admin-muted">Signed in as {authUser.email}</p>
            <button type="button" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </>
        )}
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="admin-page admin-auth-card">
        <h1>{DASHBOARD_TITLE}</h1>
        <p>Sign in to view private submission data.</p>
        {error && <div className="admin-error">{error}</div>}
        <button type="button" onClick={handleSignIn} disabled={signingIn}>
          {signingIn ? "Signing in..." : "Sign in with Google"}
        </button>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="admin-page admin-auth-card">
        <h1>{DASHBOARD_TITLE}</h1>
        <p>Not authorized.</p>
        <p className="admin-muted">{authUser.email}</p>
        <button type="button" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>{DASHBOARD_TITLE}</h1>
          <p className="admin-muted">
            Signed in as {authUser.email}
          </p>
        </div>
        <button type="button" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </header>

      {error && <div className="admin-error">{error}</div>}

      <section className="admin-card-grid">
        <div className="admin-card">
          <span>Total submissions</span>
          <strong>{totalSubmissions ?? (loading ? "..." : submissions.length)}</strong>
        </div>
        <div className="admin-card">
          <span>Average X</span>
          <strong>{formatNumber(stats.averageX)}</strong>
        </div>
        <div className="admin-card">
          <span>Average Y</span>
          <strong>{formatNumber(stats.averageY)}</strong>
        </div>
      </section>

      <section className="admin-section">
        <h2>Submissions by day</h2>
        <SubmissionsByDayChart days={stats.days} loading={loading} />
      </section>

      <section className="admin-breakdown-grid">
        <div className="admin-section">
          <h2>Archetype split</h2>
          <BreakdownList entries={stats.archetypes} />
        </div>
        <div className="admin-section">
          <h2>Age range</h2>
          <BreakdownList entries={stats.ages} />
        </div>
        <div className="admin-section">
          <h2>Country</h2>
          <BreakdownList entries={stats.countries} />
        </div>
        <div className="admin-section">
          <h2>Industry</h2>
          <BreakdownList entries={stats.industries} />
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Recent raw submissions</h2>
            <p className="admin-muted">
              {rawSubmissions.length
                ? `Showing ${rawSubmissionsPageStart + 1}-${rawSubmissionsPageEnd} of ${rawSubmissions.length} most recent submissions`
                : loading
                  ? "Loading..."
                  : "No submissions found"}
              {submissions.length > RAW_SUBMISSIONS_LIMIT
                ? `, capped at ${RAW_SUBMISSIONS_LIMIT}`
                : ""}
            </p>
          </div>
          <div className="admin-pagination" aria-label="Recent submissions pagination">
            <button
              type="button"
              onClick={() => setRawSubmissionsPage(displayedRawSubmissionsPage - 1)}
              disabled={displayedRawSubmissionsPage <= 1}
            >
              Previous
            </button>
            <span>
              Page {displayedRawSubmissionsPage} of {rawSubmissionsTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setRawSubmissionsPage(displayedRawSubmissionsPage + 1)}
              disabled={displayedRawSubmissionsPage >= rawSubmissionsTotalPages}
            >
              Next
            </button>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>X</th>
                <th>Y</th>
                <th>Archetype</th>
                <th>Age range</th>
                <th>Country</th>
                <th>Industry</th>
                <th>Source/referrer</th>
                <th>Device hash</th>
                <th>Completion</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {recentSubmissions.map((submission) => (
                <tr key={submission.id}>
                  <td>{formatTimestamp(submission.timestamp)}</td>
                  <td>{formatNumber(submission.x)}</td>
                  <td>{formatNumber(submission.y)}</td>
                  <td>{submission.archetype || "Unspecified"}</td>
                  <td>{submission.ageRange || "Unspecified"}</td>
                  <td>{submission.country || "Unspecified"}</td>
                  <td>{submission.industry || "Unspecified"}</td>
                  <td>{[submission.source, submission.referrer].filter(Boolean).join(" / ") || ""}</td>
                  <td>{submission.deviceIdHash}</td>
                  <td>{submission.completionMs ? `${submission.completionMs} ms` : ""}</td>
                  <td>{submission.flags.join(", ")}</td>
                </tr>
              ))}
              {!recentSubmissions.length && (
                <tr>
                  <td colSpan="11">{loading ? "Loading..." : "No submissions found"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default AdminDashboard;
