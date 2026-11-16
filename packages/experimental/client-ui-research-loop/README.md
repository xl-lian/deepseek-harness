# @deepseek-ai/dsh-experimental-client-ui-research-loop

The Notebook for Sessions that run the [science-research bundle](../science-research-bundle/README.md): research loop runs, experiment campaign rounds, paper-writing runs, and the agent's activity outside a loop, in one view with the lab-notebook skin.

## Use this package

The [science-research bundle](../science-research-bundle/README.md) mounts this plugin as the `research-loop-ui` row; it is not mounted on its own.

- **Host half** (`src/index.ts`): registers two session projections, both pure folds over the durable Session log.
  - `scienceResearchLoop` chains three folds. The research fold follows each `research-loop` workflow run through its member labels (`r<N>-read-<focus>`, `r<N>-build-<id>`, `r<N>-check-<id>`, …), the fixed-grammar narration lines the bundle's workflow writes with `log()`, and the workflow's return value, and keeps the latest `sagent research status` result (bash or `mcp__science-agent__sa_research`) as a ledger. The paper fold (`src/projection/paper.ts`) follows each `paper-writing` run the same way. The campaign fold (`src/projection/campaign.ts`) builds seven-stage rounds (Scout, Hypotheses, Engineer, Verifier, Statistician, Decide, Report) from `science-campaign`, `science-round`, and `kaggle-round` workflow runs, `sagent round|decide|report|verify|run|data|hypothesis|experiment` commands in bash, the `mcp__science-agent__sa_*` tools, and the `sa_*` role tools (`src/shared/classify.ts`). One `science-campaign` run holds every round of its campaign; the fold starts the next round at each `Round <n>: <round id> mode=<mode>` line the workflow logs, and the run's Chat card follows its latest round. Ledger reads (`hypothesis|experiment list|show`, `--help`) add nothing, a round id is taken only from a literal token (never a shell variable such as `$r`), a new workflow call never continues a round that already ended, and `round end --outcome aborted` marks the round Cancelled.
  - `scienceResearchActivity` (`src/projection/activity.ts`) keeps, per turn, the shell commands and file writes and edits that no loop records, with the turn's prompt as its headline, and follows a command that keeps running as a background job until the job settles. Any `sagent` command, `workflow` call, science-agent MCP tool, or role tool is left out.
- **Client half** (`src/client/index.ts`): renders both projections in four places: a Notebook view tab beside Chat, a dock above the composer, a keyed Chat card at each research run, campaign round, and paper run, and a right-sidebar Notebook tab that sits beside Chat. The right sidebar's Start page lists it as a Notebook card; the view tab's **Open beside chat** button, the dock, and the cards open it too.

The Notebook lists study-level shortcuts (question, guidance, state of knowledge, next-step plan, report) that open `research/` files in the right sidebar, then one timeline of research runs, campaign rounds, and paper runs, oldest first.

A research round shows:

- a stage rail: Retrieve, Plan, Experiment, Validate, Next step, each with its live status;
- Reading: one row per focus with its reader's status and note, the number of passes, whether the refine node judged reading enough, the coverage note, and the source and quote-checked citation counts once research status has run;
- the pre-registered plan: whether it was registered before any run, or why it was not, and whether the file changed after registration;
- an experiments table: attempts per step, verdict with confidence, role or evidence class (confirmatory or exploratory, with the `demoted_by` reasons), objections, and run ids linking to `runs/<id>/logs/stdout.log`; a row expands to its steps, each of which opens the step's child Session, and to the validation note;
- the next-step decision and reason, and any request for a human.

A research run ends with its stop reason and the write-up answer, linked to `research/report.md`.

A campaign round (`src/client/CampaignRounds.tsx`) shows its round id, mode, status, and the seven-stage rail, then one ring per experiment (hypothesis) with a repair chord when the engineer repaired a run. Selecting a ring node shows that stage for the experiment: member rows with plan, metrics, trust, blocking checks, files, verdict and log links, and the child Session inline; verifier checks grouped by result; the decision's candidates; and the report's strict-check outcome.

Paper runs (`src/client/PaperSection.tsx`) show a stage rail (Outline, Figures and tables, Draft, Audit, Revise, Compile), links to the PDF, LaTeX source, outline, bibliography, audit report, and review, each section with its word count, each figure or table with its status, every audit pass, the issues still open, the review's recommendation, and the compile outcome.

The Activity section (`src/client/ActivitySection.tsx`) lists the activity turns, newest first: each command with its description, command text, status, and duration, a Background tag on a command still running as a job, and the files the turn changed. It is the main content when no loop has run, and a collapsed section under the timeline otherwise, open while its latest turn runs. The pane shows the last three turns.

The dock shows one strip: a running research run, else a live campaign round, else a running paper run, else a running activity turn. With nothing recorded, the view states whether the Session runs the research preset and whether a science-agent skill was loaded; it never invents a round. Workspace-relative paths resolve against the loop's `workspace` argument.

## Skin and brand

- A theme override layer (`src/client/theme.ts`, source `science-research-notebook`) with distinct light and dark values: sage-tinted surfaces and ink labels, a forest-green accent for brand, focus, primary actions, and running state, an olive green for success, and serif markdown headings. The stored theme preference is unchanged.
- Scoped styles (`src/client/styles.ts`): a graph-paper ground behind the Notebook, serif section heads, ruled tables, tabular numerals, and monospace ids. Campaign rings use the same color constants, so they follow the light and dark values. Every verdict pairs its color with a text label.
- Brand slots at priority −1 (`sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`): a loop mark of five stage beads on a ring, and the Science Agent · Research wordmark; the document title gains the same suffix and a matching favicon.

## Model Experience

None. The plugin reads committed Session events and adds no model-visible input, tool, or prompt text, so it has no token or KV-cache effect.

## Known Limitations and Deferred Work

- Live detail comes from member labels and narration lines, because a workflow member's end event carries only its outcome. A science-agent change to the labels or to the narration grammar needs a matching change in `src/shared/labels.ts`, `src/shared/paper-labels.ts`, or `src/shared/classify.ts`; the bundle's sync fails when a label or result field the view reads disappears.
- The `scienceResearchLoop` state is version 4 (version 3 added campaign rounds; version 4 splits a campaign run's rounds); a Session cached at an older version is folded again from its log, so Sessions from the retired science profile show their campaign rounds here.
- A campaign run's round boundaries come from its recorded log lines, which the workflow tool caps per run (`maxRecordedLogLines`, 500 by default); rounds after the cap stay in the last recorded round. science-research-bundle's sync fails when the synced `science-campaign.js` stops writing the round line.
- Evidence classes, objection states, and literature counts appear only after the Session runs `sagent research status`; the folds do not read `.sa/` themselves.
- Activity covers shell commands and file writes and edits only; reads, searches, and other tools are not listed.
- The dock and Chat cards open the right-sidebar Notebook; the conversation shell does not let them select the Notebook view tab. **Open beside chat** selects Chat through the View's `openView` and clears the focus request at once, because Chat consumes none.
- UI copy has English and Chinese dictionaries only; locale metadata, icon, DETAIL page, coverage, export JSDoc, and client i18n gates are not yet met, and the brand mark has no designer review.
