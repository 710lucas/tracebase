/**
 * Architecture rules, checked by `npm run check:architecture`.
 *
 * Why this exists: the HARD RULE of the project is that the core knows no tool and each module has
 * one responsibility. Discipline alone erodes; a failing check does not.
 *
 * EXPAND: every new module or layer (ports, use-cases, adapters) gets its rule here at the moment
 * it is created, so it is born protected.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-never-imports-adapters",
      comment:
        "Hexagonal architecture: dependencies point inwards. Adapters know the core, never the reverse.",
      severity: "error",
      from: { path: "^src/core" },
      to: { path: "^src/adapters" },
    },
    {
      name: "domain-imports-only-domain",
      comment:
        "The domain model is the innermost layer. It must not depend on ports or use cases, which are built on top of it.",
      severity: "error",
      from: { path: "^src/core/domain" },
      to: { path: "^src/core/(ports|use-cases)" },
    },
    {
      name: "core-has-no-third-party-dependency",
      comment:
        "The core stays free of libraries (drivers, frameworks). Only adapters may bring those in. Node built-ins are fine.",
      severity: "error",
      from: { path: "^src/core" },
      to: {
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
          "npm-unknown",
        ],
      },
    },
    {
      name: "core-modules-do-not-reach-into-each-other",
      comment:
        "Each core module (domain/entity, domain/attribute, ports/import, ...) exposes a public surface in index.ts. A module (or its tests) may use its own files freely, but must reach another module only through that module's index.ts. $3 is the module name captured from the importing file.",
      severity: "error",
      from: { path: "^(src|tests)/core/(domain|ports)/([^/]+)/" },
      to: {
        path: "^src/core/(domain|ports)/[^/]+/",
        pathNot: ["^src/core/$2/$3/", "^src/core/(domain|ports)/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "outside-code-uses-core-modules-only-through-their-index",
      comment:
        "Same boundary seen from the other side: ports, use cases, adapters and tests outside the domain folders import a core module only through its index.ts.",
      severity: "error",
      from: { pathNot: "^(src|tests)/core/(domain|ports)/" },
      to: {
        path: "^src/core/(domain|ports)/[^/]+/",
        pathNot: "^src/core/(domain|ports)/[^/]+/index\\.ts$",
      },
    },
    {
      name: "no-circular",
      comment: "Cycles make modules impossible to understand or test in isolation.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "A file nothing imports is dead code or a forgotten wiring.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(c|m)?js$",
          "\\.d\\.ts$",
          "\\.test\\.ts$",
          "^src/(index|main)\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    // Packages stay in the graph as leaves (so the third-party rule can see them) but are not crawled.
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".js"],
    },
  },
};
