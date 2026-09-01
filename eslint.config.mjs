import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  //
  // Nested-directory globs (`**/.next/**` etc.) rather than top-level-only
  // ones (`.next/**`) — this repo's worktrees live under .claude/worktrees/,
  // so a top-level-only pattern misses each worktree's own build output and
  // sweeps thousands of unrelated compiled-JS findings into every lint run.
  globalIgnores([
    // Default ignores of eslint-config-next, generalized to match at any depth:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Stray local/scratch files under worktree roots (never committed, not
    // part of any worktree's actual source) shouldn't fail lint.
    ".claude/worktrees/*/*.js",
  ]),
]);

export default eslintConfig;
