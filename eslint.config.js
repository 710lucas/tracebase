// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint rules, checked by `npm run lint`.
 *
 * Division of labour (one responsibility per tool, like the code):
 *  - `tsc` checks types.
 *  - `dependency-cruiser` checks who may import whom (see `.dependency-cruiser.cjs`).
 *  - ESLint catches bug-prone and inconsistent code that the two above do not see.
 *  - Formatting is NOT decided here; that is Prettier's job (step 1c).
 *
 * EXPAND: rules that need type information (`recommendedTypeChecked`) can be added once the code
 * base is big enough for them to pay off; they are slower because they run the type checker.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**"] },
  eslint.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      // `import type` keeps type-only imports out of the runtime. `tsc` already enforces it through
      // `verbatimModuleSyntax`; this rule makes the editor fix it automatically.
      "@typescript-eslint/consistent-type-imports": "error",
      // `==` coerces types silently; `===` states exactly what is compared.
      eqeqeq: ["error", "always"],
      // The domain objects are frozen; a stray `let` that is never reassigned hides that intent.
      "prefer-const": "error",
      // Production code does not print. Logging will go through a port when it is needed.
      "no-console": "error",
    },
  },
  {
    // CommonJS config files (dependency-cruiser requires `.cjs`) use the `module` global.
    files: ["**/*.cjs"],
    languageOptions: { globals: { module: "writable" } },
  },
  {
    // The entry point and the adapters talk to the outside world, the terminal included. The core
    // keeps the rule: it never prints.
    files: ["src/main.ts", "src/adapters/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Tests may use non-null assertions on fixtures; asserting on `undefined` is the point there.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
