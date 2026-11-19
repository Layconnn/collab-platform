# Write a PRD

Create a product requirements document for a new multi-pull-request project.

1. Ask for the project name and the problem it solves if `$ARGUMENTS` does not say.
2. Create `apps/web/documentation/projects/<YYYY-MM-DD>-<kebab-name>/PRD.md` (today's date) with these sections:
   - **Problem** — who has it and the evidence.
   - **Goals and non-goals.**
   - **Users and flows** — numbered steps per flow.
   - **Requirements** — a table with stable IDs (`FR-1`, `FR-2`, … for functional, `NFR-1`, … for non-functional), each testable.
   - **Subdomains affected** — names from `ARCHITECTURE-commons.md`.
   - **Data and permissions** — new entities, tenant scoping, roles allowed per action.
   - **Risks and open questions.**
   - **Delivery plan** — the pull requests, each with a `Commons: Subdomain: task (FR-n)` title.
3. Add the project to `apps/web/documentation/commons-spec-map.md` under Projects and to `ROADMAP-commons.md` if it changes a phase.

Once implementation starts the PRD is author-owned: the plan-guard hook asks before it is edited.
