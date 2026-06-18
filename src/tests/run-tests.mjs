// Cross-platform test runner: finds all *.test.ts files and runs them via tsx.
// Uses the glob package for reliable cross-platform pattern expansion (Node 20+).
/* eslint-disable */

import { globSync } from "glob";
import { spawnSync } from "child_process";

const cwd = new URL("../..", import.meta.url);
const testFiles = globSync("src/tests/*.test.ts", { cwd });

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], { stdio: "inherit", cwd });

process.exit(result.status ?? 1);
