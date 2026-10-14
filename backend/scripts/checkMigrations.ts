// Fails (exit 1) if any migration drops one of the hand-written search
// indexes, the duplicate-ticket index, or the PostGIS triggers - see
// src/lib/migrationGuard.ts for the list and why.
//
//   npm run check:migrations -w backend                 # every migration
//   npm run check:migrations -w backend -- path/to/migration.sql ...
//
// Run it after `prisma migrate dev --create-only` (npm run migrate:new does
// both) and before applying anything. Read-only: never touches a database.
import path from "node:path";
import { checkMigrationFiles, migrationFiles } from "../src/lib/migrationGuard";

const RED = "\x1b[1;31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const args = process.argv.slice(2);
const files = args.length
  ? args.map((f) => path.resolve(f))
  : migrationFiles(path.resolve(__dirname, "../prisma/migrations"));

const violations = checkMigrationFiles(files);

if (violations.length === 0) {
  console.log(`${GREEN}✓ ${files.length} migration file(s) checked - no protected index, trigger or extension is dropped.${RESET}`);
  process.exit(0);
}

console.error(`\n${RED}✗ MIGRATION GUARD FAILED - DO NOT APPLY THESE MIGRATIONS${RESET}\n`);
for (const v of violations) {
  const relative = path.relative(process.cwd(), v.file);
  const shown = relative.startsWith("..") ? v.file : relative;
  console.error(`${RED}${shown}:${v.line}${RESET}  ${v.reason}`);
  console.error(`    ${v.statement}\n`);
}
console.error(
  `${RED}Prisma can't see these hand-written objects, so it generates DROPs for them as drift.\n` +
    `Delete the flagged statements from the migration file, re-run this check, then apply.${RESET}\n`,
);
process.exit(1);
