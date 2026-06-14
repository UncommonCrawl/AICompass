import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

const ANALYTICS_EVENTS_COLLECTION = "compass-events-v1";
const ALLOWED_EVENT_NAMES = new Set([
  "quiz_start",
  "quiz_complete",
  "result_share_click",
  "result_copy_click",
]);

export async function recordCompassEvent(eventName, details = {}) {
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return;

  try {
    await addDoc(collection(db, ANALYTICS_EVENTS_COLLECTION), {
      event_name: eventName,
      created_at: Timestamp.now(),
      details:
        details && typeof details === "object" && !Array.isArray(details)
          ? details
          : {},
    });
  } catch (error) {
    console.warn("Compass analytics event was not recorded:", error);
  }
}
