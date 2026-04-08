const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: "...",
  copy: "(c)",
  middot: "-"
};

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function decodeEntity(entity: string): string {
  const normalized = entity.trim();

  if (normalized.startsWith("#x") || normalized.startsWith("#X")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    if (Number.isFinite(codePoint)) {
      return String.fromCodePoint(codePoint);
    }

    return `&${entity};`;
  }

  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    if (Number.isFinite(codePoint)) {
      return String.fromCodePoint(codePoint);
    }

    return `&${entity};`;
  }

  return NAMED_ENTITIES[normalized] ?? `&${entity};`;
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&([^;]+);/g, (_, entity: string) => decodeEntity(entity));
}

export function stripHtmlToText(input: string): string {
  const noScripts = input.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noStyles.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeHtmlEntities(noTags));
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function parseHumanDateToIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(decodeHtmlEntities(value));
  const basic = normalized.match(
    /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i
  );

  if (basic) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, amPmRaw] = basic;
    const day = Number.parseInt(dayRaw, 10);
    const monthIndex = MONTH_MAP[monthRaw.toLowerCase()];
    const year = Number.parseInt(yearRaw, 10);

    if (Number.isFinite(day) && Number.isFinite(year) && monthIndex !== undefined) {
      let hour = hourRaw ? Number.parseInt(hourRaw, 10) : 0;
      const minute = minuteRaw ? Number.parseInt(minuteRaw, 10) : 0;

      if (amPmRaw) {
        const amPm = amPmRaw.toLowerCase();
        if (amPm === "pm" && hour < 12) {
          hour += 12;
        }
        if (amPm === "am" && hour === 12) {
          hour = 0;
        }
      }

      return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0)).toISOString();
    }
  }

  const timestamp = Date.parse(normalized);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return null;
}

export function toSlug(input: string, fallback: string): string {
  const normalized = normalizeWhitespace(decodeHtmlEntities(input)).toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length > 0) {
    return slug.slice(0, 120);
  }

  return fallback;
}

export function firstNonEmptyParagraph(text: string): string | null {
  const parts = text
    .split(/\n+/)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);

  return parts[0] ?? null;
}
