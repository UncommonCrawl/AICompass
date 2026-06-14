import AICompass from "./AICompass.jsx";
import AdminDashboard from "./AdminDashboard.jsx";

function Root() {
  return window.location.pathname === "/admin" ? (
    <AdminDashboard />
  ) : (
    <AICompass />
  );
}

export default Root;
