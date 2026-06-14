import { lazy, Suspense } from "react";
import AICompass from "./AICompass.jsx";

const AdminDashboard = lazy(() => import("./AdminDashboard.jsx"));

function Root() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathname === "/admin" ? (
    <Suspense fallback={<main className="admin-page">Loading...</main>}>
      <AdminDashboard />
    </Suspense>
  ) : (
    <AICompass />
  );
}

export default Root;
