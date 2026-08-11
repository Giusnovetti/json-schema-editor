# Draft-07 Compatibility Increment — Test Report

## Result

**76 passed, 0 failed** in the complete offline unit suite.

Breakdown:

- core / validation / composition / Draft-07 tests: 69 passed;
- graph position tests: 3 passed;
- graph projection tests: 4 passed.

## Draft-07 coverage

The new Draft-07 tests cover:

- detection of the Draft-07 `$schema` URI;
- dialect-specific `definitions` containers;
- mixed `dependencies` values:
  - property dependency arrays;
  - schema dependencies;
- tuple validation with `items: [...]`;
- `additionalItems` validation;
- Draft-07 local `$ref` resolution through `definitions`;
- Draft-07 `$ref` sibling semantics;
- structural schema validation for Draft-07-specific forms;
- Draft 2020-12 → Draft-07 conversion;
- Draft-07 → Draft 2020-12 conversion;
- conversion of `$defs` ↔ `definitions`;
- conversion of `dependentRequired` / `dependentSchemas` ↔ `dependencies`;
- conversion of `prefixItems` / `items` ↔ tuple `items` / `additionalItems`;
- rewriting local `$ref` pointers when dialect-specific containers move;
- stable node ids across dialect conversion;
- semantics-preserving conversion when the same 2020-12 trigger exists in both `dependentRequired` and `dependentSchemas`;
- dialect-aware pointers for newly created definitions and schema dependencies;
- Draft-07-specific graph projection labels.

## Regression found and fixed

The first dialect-conversion regression test exposed a real defect: converting a Draft 2020-12 definition from `/$defs/Item` to Draft-07 `/definitions/Item` moved the target node but initially left existing local references as `#/$defs/Item`.

The converter was fixed so pointer-prefix rewrites now update:

- every moved node pointer;
- local `$ref` keyword values in all graph nodes;
- semantic `ref` edges and edge ids.

The full suite was rerun after the fix and remains green.

## Additional checks

- `tsc -p tsconfig.core.json --noEmit`: PASS;
- complete application static TypeScript check using temporary declarations for unavailable external packages: PASS.

## Test execution environment

The project dependencies are not installed in this container, so the standard `npm test` command cannot launch Vitest. The npm registry is unavailable here.

To still execute the actual committed `*.test.ts` files, a temporary Vitest-compatible harness was created outside the repository. It implements only the matchers used by this test suite and runs the compiled test sources unchanged. No harness or dependency stubs are committed to the project.

Result:

```text
76 passed, 0 failed
```

On a normal development machine run:

```bash
npm install
npm test
npm run typecheck
npm run build
```
