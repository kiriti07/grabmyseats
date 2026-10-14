import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  PROTECTED_INDEXES,
  checkMigrationFiles,
  checkMigrationSql,
  migrationFiles,
} from "./migrationGuard";

const BACKEND = path.resolve(__dirname, "../..");

describe("migration guard", () => {
  it.each(PROTECTED_INDEXES)("catches Prisma's generated DROP INDEX for %s", (name) => {
    const sql = `-- DropIndex\nDROP INDEX "${name}";\n`;
    const [v, ...rest] = checkMigrationSql(sql, "m.sql");
    expect(rest).toHaveLength(0);
    expect(v).toMatchObject({ file: "m.sql", line: 2, reason: `drops protected index ${name}` });
  });

  it.each([
    'DROP INDEX IF EXISTS "Listing_movieName_trgm_idx"',
    'DROP INDEX CONCURRENTLY IF EXISTS "public"."Listing_theaterLocation_idx" CASCADE',
    "drop index venue_normalizedname_trgm_idx",
    'DROP INDEX "User_email_key", "TicketAlert_location_idx"',
    'ALTER TABLE "Listing" DROP CONSTRAINT "Listing_ticketFingerprint_live_key"',
    "DROP TRIGGER IF EXISTS trg_listing_theater_location ON \"Listing\"",
    "DROP FUNCTION set_ticket_alert_location()",
    "DROP EXTENSION IF EXISTS pg_trgm",
    "DROP EXTENSION postgis CASCADE",
  ])("catches: %s", (statement) => {
    expect(checkMigrationSql(`${statement};`)).toHaveLength(1);
  });

  it("finds a drop among other generated statements, with its line", () => {
    const sql = [
      "-- AlterTable",
      'ALTER TABLE "User" ALTER COLUMN "referralCode" SET DEFAULT gen();',
      "",
      "-- DropIndex",
      'DROP INDEX "Listing_movieName_trgm_idx";',
      "",
      "/* a block",
      "   comment */",
      'DROP INDEX "Venue_normalizedName_trgm_idx";',
    ].join("\n");
    expect(checkMigrationSql(sql).map((v) => v.line)).toEqual([5, 9]);
  });

  it.each([
    'DROP INDEX "User_email_key"',
    'DROP INDEX "Listing_movieName_idx"',
    'ALTER TABLE "Listing" DROP COLUMN "screenshotUrl"',
    "DROP EXTENSION IF EXISTS citext",
    "-- DROP INDEX \"Listing_movieName_trgm_idx\"",
    "SELECT 'DROP INDEX \"Listing_movieName_trgm_idx\"'",
  ])("allows: %s", (statement) => {
    expect(checkMigrationSql(`${statement};`)).toHaveLength(0);
  });

  it("allows dropping a trigger or function that the same migration re-creates", () => {
    const sql = `
      CREATE OR REPLACE FUNCTION set_listing_theater_location() RETURNS trigger AS $$
      BEGIN NEW."theaterLocation" := NULL; RETURN NEW; END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS trg_listing_theater_location ON "Listing";
      CREATE TRIGGER trg_listing_theater_location BEFORE INSERT ON "Listing"
      FOR EACH ROW EXECUTE FUNCTION set_listing_theater_location();
    `;
    expect(checkMigrationSql(sql)).toEqual([]);
  });

  it("every existing migration passes", () => {
    const files = migrationFiles(path.join(BACKEND, "prisma/migrations"));
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(checkMigrationFiles(files)).toEqual([]);
  });

  describe("command line (npm run check:migrations)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "migration-guard-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    function run(...files: string[]) {
      return spawnSync(
        process.execPath,
        ["-r", "ts-node/register/transpile-only", "scripts/checkMigrations.ts", ...files],
        { cwd: BACKEND, encoding: "utf8" },
      );
    }

    it("exits 0 on the real migrations", () => {
      const result = run();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no protected index");
    });

    it("exits 1 and names the file, line and index on a bad migration", () => {
      const bad = path.join(dir, "migration.sql");
      writeFileSync(bad, '-- DropIndex\nDROP INDEX "Listing_ticketFingerprint_live_key";\n');
      const result = run(bad);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("MIGRATION GUARD FAILED");
      expect(result.stderr).toContain("migration.sql:2");
      expect(result.stderr).toContain("drops protected index Listing_ticketFingerprint_live_key");
    });
  });
});
