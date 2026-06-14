import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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
const RECENT_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAY_CUTOFF = Date.now() - 30 * DAY_MS;

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
  const [error, setError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
  }, []);

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
        const [countSnap, docsSnap] = await Promise.all([
          getCountFromServer(submissionsRef),
          getDocs(query(submissionsRef, orderBy("created_at", "desc"))),
        ]);
        if (cancelled) return;
        const normalized = docsSnap.docs.map(normalizeSubmission);
        const privateDocs = await Promise.all(
          normalized.slice(0, RECENT_LIMIT).map(async (submission) => {
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
        setTotalSubmissions(countSnap.data().count);
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
    const dayCounts = new Map();
    let xTotal = 0;
    let xCount = 0;
    let yTotal = 0;
    let yCount = 0;

    for (const submission of submissions) {
      increment(archetypes, submission.archetype);
      increment(ages, submission.ageRange);
      increment(countries, submission.country);
      increment(industries, submission.industry);
      if (submission.timestamp >= THIRTY_DAY_CUTOFF) {
        increment(dayCounts, formatDay(submission.timestamp));
      }
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
      days: [...dayCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [submissions]);

  const recentSubmissions = submissions.slice(0, RECENT_LIMIT);

  if (!authReady) {
    return <main className="admin-page">Loading...</main>;
  }

  if (!authUser) {
    return (
      <main className="admin-page admin-auth-card">
        <h1>AI Compass Admin</h1>
        <p>Sign in to view private submission data.</p>
        <button type="button" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>
          Sign in with Google
        </button>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="admin-page admin-auth-card">
        <h1>AI Compass Admin</h1>
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
          <h1>AI Compass Admin</h1>
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
        <h2>Submissions by day, last 30 days</h2>
        <div className="admin-day-grid">
          {stats.days.length ? (
            stats.days.map(([day, count]) => (
              <div className="admin-day-row" key={day}>
                <span>{day}</span>
                <strong>{count}</strong>
              </div>
            ))
          ) : (
            <p className="admin-muted">{loading ? "Loading..." : "No data"}</p>
          )}
        </div>
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
        <h2>Recent raw submissions</h2>
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
