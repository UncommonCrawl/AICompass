import profanityListRaw from "../profanity-list/list/en.txt?raw";

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
