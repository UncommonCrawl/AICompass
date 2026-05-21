import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const profanityListRaw = readFileSync(
  join(__dirname, "profanity-en.txt"),
  "utf8",
);

const PROFANITY_WORDS = new Set(
  profanityListRaw
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean),
);

const TOKEN_REGEX = /[a-z0-9]+(?:['’][a-z0-9]+)*/gi;

function normalizeToken(token) {
  return token.toLowerCase().replaceAll("’", "'");
}

function maskToken(token) {
  return token.replace(/[a-z0-9]/gi, "*");
}

export function censorProfanity(value) {
  const text = typeof value === "string" ? value.normalize("NFKC") : "";
  if (text === "") {
    return { hasProfanity: false, censoredText: "" };
  }

  let hasProfanity = false;
  const censoredText = text.replace(TOKEN_REGEX, (token) => {
    const normalizedToken = normalizeToken(token);
    if (!PROFANITY_WORDS.has(normalizedToken)) {
      return token;
    }
    hasProfanity = true;
    return maskToken(token);
  });

  return {
    hasProfanity,
    censoredText,
  };
}
