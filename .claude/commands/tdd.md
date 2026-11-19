# Test-driven change

Implement `$ARGUMENTS` test-first.

1. Find the suite that owns the behavior: `apps/web/server/**/*.test.mjs` (`node --test`, Prisma and Redis faked in memory), the decision suites (real `_decision_test` database), or `apps/web/components/**/*.test.tsx` (Vitest + Testing Library, hooks mocked).
2. Write the failing test first, including the negative case for any permission or tenant rule. Run only that suite and confirm it fails for the expected reason.
3. Make the smallest change that passes. Re-run the suite, then typecheck and lint.
4. Refactor with the suite green. Report the tests added and the commands you ran with their results.
