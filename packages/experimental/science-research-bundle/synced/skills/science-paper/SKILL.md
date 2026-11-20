---
name: science-paper
description: >
  Write a scientific paper (LaTeX source and PDF) from a finished science-agent research record:
  an outline that ties every claim to its experiment, a bibliography from the ledger's
  quote-verified literature, figures and tables from recorded run outputs, one agent per section,
  an audit of every number and citation against the record, a referee review, revision, and a PDF
  build. The paper reports the recorded research and adds no experiment, number, or source. Use this
  skill when the user asks to write, draft, or revise a paper, manuscript, preprint, or article about
  research done in a science-agent workspace. Triggers include "write a paper", "draft the
  manuscript", "turn this into a paper", "arXiv", "写论文", "写成论文", "论文初稿", "修改论文".
  The research itself is the science-research skill.
version: 0.11.0
---

# Science-Agent Paper Writing

A paper workspace is a research workspace that has a record: `research/state.md` or
`research/report.md`, the round notebooks, the runs, and the ledger. The `paper-writing` workflow
turns that record into `paper/main.tex` and `paper/build/main.pdf`:

```text
setup:    sagent paper init                       paper/ from the template; is Tectonic installed?
outline:  paper-outline                           thesis, claim table, section plans, figure list
figures:  paper-references ∥ paper-item ×N        bibliography from the ledger; figures and tables from runs
draft:    paper-section ×5, then ×2               body sections, then abstract and conclusion
audit:    sagent paper check ∥ paper-audit ∥ paper-review
revise:   [paper-revise per part → audit]*        until nothing blocks or maxRevisions
compile:  [sagent paper compile → paper-fix]*     Tectonic, LaTeX repairs
```

Each node is an agent whose instructions are `plugin/agents/paper-<node>.md`. The prompts make every
judgment: what the paper claims, how a figure shows it, whether a sentence overstates its evidence.
The workflow only sequences nodes and enforces caps. Code only creates the files, lists static
problems (undefined citations and references, missing files, bibliography entries with no ledger
evidence id), and compiles.

## DeepSeek Harness runtime

You are running inside the DeepSeek Harness (dsh), not Claude Code. The runtime mapping:

- File and shell tools are `read`, `write`, `edit`, `glob`, `grep`, `bash`.
- The dsh `workflow` tool runs JavaScript orchestration. The profile saves the bundle's
  `paper-writing` workflow by name; every node prompt is embedded in the script, so the script never
  enters your context and no node depends on registered agent types.
- **Mapping rule.** Wherever this skill says `Workflow({name: "science-agent:paper-writing", args})`,
  call `workflow({name: "paper-writing", args})` with the same args minus `agentPrefix` and
  `useAgentTypes`. If the `workflow` tool refuses (for example `unknown saved workflow
  "paper-writing"`), report its error verbatim, say that the dsh server must be restarted to load
  the profile's saved workflows, and stop: do not write the paper by hand, because that run would
  have no audit and no Notebook view. Only when the `workflow` tool is absent from your tools, say so
  and do the steps by hand as described below.
- The Notebook view shows each paper run: its stages, sections, figures and tables, audit passes,
  open issues, review, and the PDF, which opens in the right sidebar.

## Non-negotiables

1. The paper reports the recorded research. No node runs an experiment, computes a new number, or
   cites a source that is not literature evidence in the ledger.
2. Every number is copied from a validation file or run output with its digits unchanged, and is
   followed by `\runid{<run ids>}`; the draft prints the ids, `\showrunidsfalse` hides them.
3. A result whose evidence class is `exploratory` is written as exploratory (`\expl`), never as
   established. Refuted hypotheses, null results, failed experiments, open objections, and
   limitations stay in the paper.
4. Never invent an author, affiliation, funding source, acknowledgement, or data statement. Pass
   the authors the user names, or none.
5. Write only under `paper/`. Never edit `.sa/`, `runs/`, or `research/` for the paper.

## Preflight

```bash
sagent -w <ws> research status --json       # what the record holds
```

If the workspace has no `research/state.md` or `research/report.md`, say that the research loop must
run first (the science-research skill) and stop. If no experiment has a verdict, say so before going
on: the paper can only report what the record holds. Take the authors and the venue or length from
the user's words; ask only when they asked for a specific venue whose rules you do not know.

## Run the workflow

```text
Workflow({
  name: "science-agent:paper-writing",
  args: {
    workspace: "<absolute workspace>",
    saBin: "sagent",
    authors: "<names as the user gave them, or omit>",
    venue: "<venue, length, or emphasis, or omit>",
    maxItems: 6,           // figures and tables
    maxRevisions: 2,       // revise → audit passes
    maxCompileFixes: 3     // LaTeX repair attempts
  }
})
```

The script is saved in the profile and embeds every node prompt, so it needs no agent types or script path. A rerun keeps every file under `paper/` that exists and rewrites what its nodes are asked to write.

Without the `workflow` tool, say so and do the steps by hand in the order above: `sagent paper init`,
then for each node run `sagent paper prompt <node>` and do what it says, then `sagent paper check`
and `sagent paper compile`.

## Without Tectonic

`sagent paper compile` reports `reason: no-tectonic` when Tectonic is not installed. The LaTeX
sources are complete; give the user `brew install tectonic` (or the install for their platform),
then run `sagent -w <ws> paper compile --json`. Tectonic downloads the LaTeX packages it needs on
first use, so the first build needs network access.

## Changing the paper afterwards

Edit files under `paper/` by the same rules: numbers copied with `\runid{...}`, citations only from
`paper/references.bib`. Then run `sagent -w <ws> paper check --json` and `sagent -w <ws> paper
compile --json`. An audit issue is resolved by changing the text to match the record, never the
reverse.

## Reporting to the user

1. The title and the files: `paper/main.tex`, and `paper/build/main.pdf` when it was built.
2. The audit: how many numbers and citations were checked, and every blocking issue still open,
   quoted from `result.audit.open`.
3. The review's recommendation and its main points (`paper/review.md`).
4. What the paper does not claim, from the "Not in this paper" list in `paper/outline.md`.
5. Figures or tables the outline wanted but the record could not support (`blocked` items).

Say plainly what is guaranteed: code checks that citations and references resolve and that every
bibliography entry names ledger evidence; the audit node checks numbers and claim strength against
the record. Whether the prose is accurate is a model judgment, made by an agent that did not write it.
