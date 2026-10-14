import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Objects the migrations create by hand because schema.prisma can't express
// them. Prisma doesn't know they exist, so `prisma migrate dev` treats them
// as drift and generates DROP statements for them - which would quietly
// break search, "near me", alerts, and duplicate-ticket detection. Every
// generated migration must be checked against this list before it's applied
// (npm run check:migrations, or npm run migrate:new which runs it).
export const PROTECTED_INDEXES = [
  "Listing_movieName_trgm_idx", // trigram movie search
  "Listing_theaterLocation_idx", // GiST, listings near me
  "TicketAlert_location_idx", // GiST, alerts near a new listing
  "TicketAlert_titleQuery_trgm_idx", // trigram alert matching
  "Venue_normalizedName_trgm_idx", // trigram venue lookup
  "Listing_ticketFingerprint_live_key", // partial unique: one live listing per ticket
];

// The PostGIS triggers that fill the geography columns those GiST indexes
// cover, and their functions. Dropping one is fine only when the same
// migration creates it again (20260830124200 and 20260905120000 do).
export const PROTECTED_TRIGGERS = ["trg_listing_theater_location", "trg_ticket_alert_location"];
export const PROTECTED_FUNCTIONS = ["set_listing_theater_location", "set_ticket_alert_location"];

// Dropping either extension drops every index above that depends on it.
export const PROTECTED_EXTENSIONS = ["pg_trgm", "postgis"];

export interface MigrationViolation {
  file: string;
  line: number;
  statement: string;
  reason: string;
}

interface Statement {
  text: string;
  line: number;
}

// Splits SQL into statements, dropping comments, and skipping over string
// literals and dollar-quoted bodies (function definitions contain ';').
// Each statement keeps the line it starts on.
function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let current = "";
  let line = 1;
  let startLine = 1;
  let i = 0;

  const push = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) statements.push({ text, line: startLine });
    current = "";
  };

  while (i < sql.length) {
    const ch = sql[i];
    if (!current.trim() && /\S/.test(ch) && !sql.startsWith("--", i) && !sql.startsWith("/*", i)) {
      startLine = line;
    }

    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      line += (sql.slice(i, stop).match(/\n/g) ?? []).length;
      current += " ";
      i = stop;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (ch === "'" || dollar) {
      const close = dollar ? dollar[0] : "'";
      const end = sql.indexOf(close, i + close.length);
      const stop = end === -1 ? sql.length : end + close.length;
      const body = sql.slice(i, stop);
      line += (body.match(/\n/g) ?? []).length;
      current += body;
      i = stop;
      continue;
    }
    if (ch === ";") {
      push();
      i++;
      continue;
    }
    if (ch === "\n") line++;
    current += ch;
    i++;
  }
  push();
  return statements;
}

// '"public"."Listing_movieName_trgm_idx"' -> 'listing_moviename_trgm_idx'.
// Compared case-insensitively on purpose: better a false alarm than a miss.
function bareName(raw: string): string {
  const last = raw.trim().split(".").pop() ?? "";
  return last.replace(/"/g, "").replace(/\(.*$/, "").trim().toLowerCase();
}

function names(list: string): string[] {
  return list
    .replace(/\s+(CASCADE|RESTRICT)\s*$/i, "")
    .split(",")
    .map(bareName)
    .filter(Boolean);
}

// Lowercased name -> the name as written above, for messages.
const lower = (xs: string[]) => new Map(xs.map((x) => [x.toLowerCase(), x]));

export function checkMigrationSql(sql: string, file = "<sql>"): MigrationViolation[] {
  const statements = splitStatements(sql);
  const indexes = lower(PROTECTED_INDEXES);
  const triggers = lower(PROTECTED_TRIGGERS);
  const functions = lower(PROTECTED_FUNCTIONS);
  const extensions = lower(PROTECTED_EXTENSIONS);
  const violations: MigrationViolation[] = [];
  const flag = (s: Statement, reason: string) =>
    violations.push({ file, line: s.line, statement: s.text, reason });

  // Whether a statement after `index` re-creates this trigger/function.
  const recreatedLater = (index: number, kind: "TRIGGER" | "FUNCTION", name: string) =>
    statements.slice(index + 1).some((s) => {
      const m = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?${kind}\\s+([^\\s(]+)`, "i").exec(s.text);
      return !!m && bareName(m[1]) === name;
    });

  statements.forEach((s, index) => {
    let m = /^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(.+)$/i.exec(s.text);
    if (m) {
      for (const name of names(m[1])) {
        if (indexes.has(name)) flag(s, `drops protected index ${indexes.get(name)}`);
      }
      return;
    }

    m = /^ALTER\s+TABLE\s+.+\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\S+)/i.exec(s.text);
    if (m && indexes.has(bareName(m[1]))) {
      flag(s, `drops protected index ${indexes.get(bareName(m[1]))}`);
      return;
    }

    m = /^DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\S+)/i.exec(s.text);
    if (m) {
      const name = bareName(m[1]);
      if (triggers.has(name) && !recreatedLater(index, "TRIGGER", name)) {
        flag(s, `drops PostGIS trigger ${triggers.get(name)} without re-creating it`);
      }
      return;
    }

    m = /^DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(.+)$/i.exec(s.text);
    if (m) {
      for (const name of names(m[1])) {
        if (functions.has(name) && !recreatedLater(index, "FUNCTION", name)) {
          flag(s, `drops PostGIS trigger function ${functions.get(name)} without re-creating it`);
        }
      }
      return;
    }

    m = /^DROP\s+EXTENSION\s+(?:IF\s+EXISTS\s+)?(.+)$/i.exec(s.text);
    if (m) {
      for (const name of names(m[1])) {
        if (extensions.has(name)) flag(s, `drops extension ${extensions.get(name)} (and every index built on it)`);
      }
    }
  });

  return violations;
}

// Every prisma/migrations/*/migration.sql under migrationsDir, oldest first.
export function migrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(migrationsDir, d.name, "migration.sql"))
    .filter((f) => existsSync(f))
    .sort();
}

export function checkMigrationFiles(files: string[]): MigrationViolation[] {
  return files.flatMap((f) => checkMigrationSql(readFileSync(f, "utf8"), f));
}
