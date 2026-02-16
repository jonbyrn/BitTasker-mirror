# Coverage in GitLab — How It Works and What Else You Can Do

This doc explains how GitLab gets coverage into the merge request widget, and what other coverage-related features are available.

---

## 1. How the merge request coverage widget gets its data

GitLab uses **two separate mechanisms** that work together:

### A. The percentage (and “change vs. target”) — `coverage` keyword

- **Where:** In `.gitlab-ci.yml`, the job that runs your tests has a **`coverage:`** key with a **regex**.
- **What happens:**
  1. The job runs (e.g. `npm run test:ci -- --coverage`) and prints output to the **job log** (the console output GitLab stores).
  2. After the job finishes, GitLab runs the regex against the **entire job log text**.
  3. The regex must have **one capturing group** `(...)` that matches the number you want (e.g. the “Lines” percentage).
  4. GitLab takes that captured value (e.g. `22.37`) and stores it as **this pipeline’s coverage** for that job.
- **Merge request widget:**
  - GitLab knows the **MR source branch** and **target branch**.
  - It has (or had) a pipeline for the **target branch** that also had a job with a `coverage` regex; it uses the **last successful** such pipeline on the target to get “target coverage”.
  - It compares **this MR pipeline’s coverage** to **target’s coverage** and shows:
    - Current coverage %
    - **Change vs. target** (e.g. +1.2% or -0.5%).

So: **no API call from the runner**. GitLab simply **parses the job log with the regex** and stores the number. The “change” is **MR pipeline coverage vs. target branch’s stored coverage**.

**In BitTasker:** The `coverage` job has:

```yaml
coverage: '/All files[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*(\d+\.?\d*)%?/'
```

That matches the Vitest text table line (e.g. `All files | 22.37 | 68.19 | 35.85 | 22.37`) and captures the **fourth number** (Lines %). That value is what appears in the widget.

---

### B. Line-by-line coverage in the diff — `artifacts: reports: coverage_report`

- **Where:** The same job (or another job) uploads an artifact with **`reports: coverage_report`** and a path to a **Cobertura** (or JaCoCo) XML file.
- **What happens:**
  1. The test run generates a file (e.g. `coverage/cobertura-coverage.xml`) in a format GitLab understands.
  2. The job declares that file as a **report** artifact: `coverage_report` with `coverage_format: cobertura` and `path: coverage/cobertura-coverage.xml`.
  3. GitLab stores the artifact and runs a **background job** that parses the XML and attaches “covered / not covered” to specific **lines of source code**.
  4. In the MR **Changes** tab, when you view the diff, GitLab overlays that data on the lines (e.g. green = covered, orange = not covered).

So: **no regex here**. GitLab reads the **structured report file** (Cobertura/JaCoCo) and uses it only for **diff visualization**. It does **not** use this file for the single percentage in the widget; the widget number comes from the `coverage` regex (job log).

**In BitTasker:** The `coverage` job uploads `coverage/cobertura-coverage.xml` as `coverage_report`. That’s why you see line-by-line coloring in the MR diff (when the report is parsed).

---

## 2. Summary table

| What you see | Source of data |
|--------------|----------------|
| **Coverage % in MR widget** | Regex on the **job log** (`coverage` keyword). |
| **Change vs. target branch** | Comparison: MR pipeline’s extracted % vs. target branch’s last stored %. |
| **Green/orange lines in MR diff** | Parsed **Cobertura (or JaCoCo) artifact** (`coverage_report`). |

---

## 3. What else is possible (in “that department”)

### Available on all tiers (Free / Premium / Ultimate)

- **Coverage regex** — Already in use; drives the widget percentage and “change vs. target.”
- **Coverage report artifact (Cobertura/JaCoCo)** — Already in use; drives diff visualization.
- **Repository analytics → Test coverage** — **Analyze → Repository analytics** in the project: view **coverage over time** (history) and optionally download CSV. You pick which job’s coverage to track (e.g. the job that has the `coverage` keyword).
- **Coverage badge** — In **Settings → General → Badges** you can add a “Test coverage report” badge that shows the latest coverage % from the default branch (or chosen job). Good for README or dashboards.

### Premium / Ultimate only

- **Coverage-Check approval rule** — In **Settings → Merge request approvals**: add a rule named **`Coverage-Check`** and enable it. Then, if an MR **reduces** coverage compared to the target branch, that rule will require an extra approval before merge. (If the target has no coverage data yet, the rule can still block; see GitLab docs.)

### Optional pipeline tweaks (any tier)

- **Aggregate multiple jobs** — If you split tests (e.g. unit + integration) into separate jobs, you can add a `coverage` regex to **each** job. GitLab will **aggregate** those values (e.g. combine into one number or show per job depending on UI). Same idea: each job’s log is parsed; GitLab combines the results.
- **Wildcard coverage reports** — You can upload multiple Cobertura files (e.g. `coverage/unit/cobertura.xml` and `coverage/integration/cobertura.xml`) via a wildcard path so the MR diff shows combined line coverage from all of them.

---

## 4. References

- [GitLab: Code coverage](https://docs.gitlab.com/ee/ci/testing/code_coverage.html) — coverage keyword, regex, Cobertura/JaCoCo, approval rule, badges, analytics.
- [GitLab: Cobertura coverage report](https://docs.gitlab.com/ee/ci/testing/code_coverage/cobertura.html) — format and limits (e.g. max 100 `<source>` nodes, 10 MiB file).
- BitTasker CI: `.gitlab-ci.yml` → `coverage` job; Vitest config: `vite.config.ts` → `test.coverage`.
