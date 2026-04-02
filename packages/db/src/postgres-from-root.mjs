/**
 * Načte balíček `postgres` z kořenového node_modules monorepa.
 * Pod pnpm může být `packages/db/node_modules/postgres` prázdný junction → přímý `import "postgres"` selže (Node legacy resolve).
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(repoRoot, "package.json"));
const postgres = require("postgres");
export default postgres;
