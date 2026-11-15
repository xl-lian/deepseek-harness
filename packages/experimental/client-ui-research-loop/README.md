# @deepseek-ai/dsh-experimental-client-ui-research-loop

Research loop view and lab-notebook skin for Sessions that run the [science-research bundle](../science-research-bundle/README.md).

## Use this package

The [science-research bundle](../science-research-bundle/README.md) mounts this plugin as the `research-loop-ui` row; it is not mounted on its own.

- **Host half** (`src/index.ts`): registers the `scienceResearchLoop` session projection, a pure fold over the durable Session log. It follows each `research-loop` workflow run through its member labels (`r<N>-read-<focus>`, `r<N>-build-<id>`, `r<N>-check-<id>`, …), the fixed-grammar narration lines the bundle's workflow writes with `log()`, and the workflow's return value, and it keeps the latest `sagent research status` result (bash or `mcp__science-agent__sa_research`) as a ledger.
- **Client half** (`src/client/index.ts`): renders the projection in four places: a Notebook view tab beside Chat, a dock above the composer while a loop runs, a keyed Chat card at each run start, and a right-sidebar Notebook tab that the dock and card open.

The Notebook lists study-level shortcuts (question, guidance, state of knowledge, next-step plan, report) that open `research/` files in the right sidebar, then every loop run, oldest first. Each round shows:

- a stage rail: Retrieve, Plan, Experiment, Validate, Next step, each with its live status;
- Reading: one row per focus with its reader's status and note, the number of passes, whether the refine node judged reading enough, the coverage note, and the source and quote-checked citation counts once research status has run;
- the pre-registered plan: whether it was registered before any run, or why it was not, and whether the file changed after registration;
- an experiments table: attempts per step, verdict with confidence, role or evidence class (confirmatory or exploratory, with the `demoted_by` reasons), objections, and run ids linking to `runs/<id>/logs/stdout.log`; a row expands to its steps, each of which opens the step's child Session, and to the validation note;
- the next-step decision and reason, and any request for a human.

A run ends with its stop reason and the write-up answer, linked to `research/report.md`. With no run, the view states whether the Session runs the research preset and whether the research skill was loaded; it never invents a round. Workspace-relative paths resolve against the loop's `workspace` argument.

## Skin and brand

- A theme override layer (`src/client/theme.ts`, source `science-research-notebook`) with distinct light and dark values: paper surfaces, ink labels, an indigo accent for brand, focus, primary actions, and running state, teal for success, and serif markdown headings. The stored theme preference is unchanged.
- Scoped styles (`src/client/styles.ts`): a graph-paper ground behind the Notebook, serif section heads, ruled tables, tabular numerals, and monospace ids. Every verdict pairs its color with a text label.
- Brand slots at priority −1 (`sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`): a loop mark of five stage beads on a ring, and the Science Agent · Research wordmark; the document title gains the same suffix and a matching favicon.

## Model Experience

None. The plugin reads committed Session events and adds no model-visible input, tool, or prompt text, so it has no token or KV-cache effect.

## Known Limitations and Deferred Work

- Live detail comes from member labels and narration lines, because a workflow member's end event carries only its outcome. A science-agent change to the labels or to the bundle's narration grammar needs a matching change in `src/shared/labels.ts`; the bundle's sync fails when a label or result field the view reads disappears.
- Evidence classes, objection states, and literature counts appear only after the Session runs `sagent research status`; the fold does not read `.sa/` itself.
- The dock and Chat card open the right-sidebar Notebook; the conversation shell does not let them select the Notebook view tab.
- UI copy has English and Chinese dictionaries only; locale metadata, icon, DETAIL page, coverage, export JSDoc, and client i18n gates are not yet met, and the brand mark has no designer review.
