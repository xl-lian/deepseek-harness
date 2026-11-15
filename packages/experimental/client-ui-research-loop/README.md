# @deepseek-ai/dsh-experimental-client-ui-research-loop

Research loop and paper-writing views, and the lab-notebook skin, for Sessions that run the [science-research bundle](../science-research-bundle/README.md).

## Use this package

The [science-research bundle](../science-research-bundle/README.md) mounts this plugin as the `research-loop-ui` row; it is not mounted on its own.

- **Host half** (`src/index.ts`): registers the `scienceResearchLoop` session projection, a pure fold over the durable Session log. It follows each `research-loop` workflow run through its member labels (`r<N>-read-<focus>`, `r<N>-build-<id>`, `r<N>-check-<id>`, …), the fixed-grammar narration lines the bundle's workflow writes with `log()`, and the workflow's return value, and it keeps the latest `sagent research status` result (bash or `mcp__science-agent__sa_research`) as a ledger. `src/projection/paper.ts` folds each `paper-writing` run the same way: its `paper-<step>` labels, its `Paper …:` narration lines, and the open issues from its return value.
- **Client half** (`src/client/index.ts`): renders the projection in four places: a Notebook view tab beside Chat, a dock above the composer while a loop or paper run is live, a keyed Chat card at each loop or paper run start, and a right-sidebar Notebook tab that sits beside Chat. The right sidebar's Start page lists it as a Notebook card; the view tab's **Open beside chat** button, the dock, and the card open it too.

The Notebook lists study-level shortcuts (question, guidance, state of knowledge, next-step plan, report) that open `research/` files in the right sidebar, then every loop run, oldest first. Each round shows:

- a stage rail: Retrieve, Plan, Experiment, Validate, Next step, each with its live status;
- Reading: one row per focus with its reader's status and note, the number of passes, whether the refine node judged reading enough, the coverage note, and the source and quote-checked citation counts once research status has run;
- the pre-registered plan: whether it was registered before any run, or why it was not, and whether the file changed after registration;
- an experiments table: attempts per step, verdict with confidence, role or evidence class (confirmatory or exploratory, with the `demoted_by` reasons), objections, and run ids linking to `runs/<id>/logs/stdout.log`; a row expands to its steps, each of which opens the step's child Session, and to the validation note;
- the next-step decision and reason, and any request for a human.

A run ends with its stop reason and the write-up answer, linked to `research/report.md`.

Paper runs follow the loop runs (`src/client/PaperSection.tsx`): a stage rail (Outline, Figures and tables, Draft, Audit, Revise, Compile), links to the PDF, LaTeX source, outline, bibliography, audit report, and review, each section with its word count, each figure or table with its status (a blocked one with its reason), the bibliography size and uncitable evidence ids, every audit pass with its blocking and minor counts, the issues still open, the review's recommendation, and the compile outcome. The steps list opens each step's child Session. With no run, the view states whether the Session runs the research preset and whether the research skill was loaded; it never invents a round. Workspace-relative paths resolve against the loop's `workspace` argument.

## Skin and brand

- A theme override layer (`src/client/theme.ts`, source `science-research-notebook`) with distinct light and dark values: paper surfaces, ink labels, an indigo accent for brand, focus, primary actions, and running state, teal for success, and serif markdown headings. The stored theme preference is unchanged.
- Scoped styles (`src/client/styles.ts`): a graph-paper ground behind the Notebook, serif section heads, ruled tables, tabular numerals, and monospace ids. Every verdict pairs its color with a text label.
- Brand slots at priority −1 (`sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`): a loop mark of five stage beads on a ring, and the Science Agent · Research wordmark; the document title gains the same suffix and a matching favicon.

## Model Experience

None. The plugin reads committed Session events and adds no model-visible input, tool, or prompt text, so it has no token or KV-cache effect.

## Known Limitations and Deferred Work

- Live detail comes from member labels and narration lines, because a workflow member's end event carries only its outcome. A science-agent change to the labels or to the narration grammar needs a matching change in `src/shared/labels.ts` or `src/shared/paper-labels.ts`; the bundle's sync fails when a label or result field the view reads disappears.
- The fold state is version 2 (paper runs were added); a Session cached at version 1 is folded again from its log.
- Evidence classes, objection states, and literature counts appear only after the Session runs `sagent research status`; the fold does not read `.sa/` itself.
- The dock and Chat card open the right-sidebar Notebook; the conversation shell does not let them select the Notebook view tab. **Open beside chat** selects Chat through the View's `openView` and clears the focus request at once, because Chat consumes none.
- UI copy has English and Chinese dictionaries only; locale metadata, icon, DETAIL page, coverage, export JSDoc, and client i18n gates are not yet met, and the brand mark has no designer review.
