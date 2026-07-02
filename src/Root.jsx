import { lazy, Suspense } from "react";
import AICompass from "./AICompass.jsx";

const AdminDashboard = lazy(() => import("./AdminDashboard.jsx"));

function DashboardRoute() {
  return (
    <Suspense fallback={<main className="admin-page">Loading...</main>}>
      <AdminDashboard />
    </Suspense>
  );
}

function Root() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/admin") {
    window.history.replaceState(null, "", "/");
    return <AICompass />;
  }

  return pathname === "/dashboard" ? (
    <DashboardRoute />
  ) : (
    <AICompass />
  );
}

export default Root;
