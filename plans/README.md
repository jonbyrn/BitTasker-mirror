# Plans (temporary workspace)

This directory is a **temporary** place for plans that AI agents (or humans) are actively using while implementing or fixing features.

## Purpose

- **Work in progress:** Put new or in-progress plans here while you are still drafting or executing them.
- **Canonical docs live in `docs/`:** When a plan is done or stable, move its content into the appropriate place under **`docs/`** and update any references. Then remove or archive the plan file from this directory.
- **Keep plans/ lean:** The goal is for `plans/` to hold only current, active plans. Finished or long-term documentation belongs in `docs/`.

## Where canonical docs live

| Topic                               | Location                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| **Task status**                     | `docs/tasks/task-status.md` – ownership, flow, resilience, debug            |
| **Testing (E2E, pipeline, triage)** | `docs/testing/` – README.md (overview), testing-in-ci.md, e2e-testing.md    |
| **CI/CD (Workers, GitLab)**         | `docs/ci/` – workers-pipeline-migration.md, workers-ci-setup-walkthrough.md |
| **Other project docs**              | `docs/` – see `docs/README.md` for the full index                           |

See **`docs/README.md`** for the full index.

## Workflow

1. Create or update a plan in `plans/` when starting a feature or fix.
2. As you make progress, update the relevant docs in `docs/` (e.g. add a section, fix a link, or merge the plan into an existing doc).
3. When the work is done, ensure all important content is in `docs/`, then remove the plan from `plans/` (or leave a one-line pointer if useful).
