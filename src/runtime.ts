import path from "node:path";
import { SkillLoader } from "./skills/skillLoader.js";

/**
 * Runtime singletons. Stateful services initialized once at startup and
 * shared across the process. Distinct from `config.ts`, which holds
 * stateless constants and the API client.
 *
 * Dependency direction: config.ts -> runtime.ts (never the reverse).
 */
export const skillLoader = new SkillLoader(
  path.join(process.cwd(), "skills"),
);
