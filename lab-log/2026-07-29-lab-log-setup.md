---
date: 2026-07-29
tags: [lab-log, setup, infrastructure]
artifacts: []
---

# Lab log setup

## Intent

> "I want to keep a lab log to document the different decisions I make and our findings and interpretation as development occurs. [...] my goal with the lab log is to keep context as to how the research unfolds [...] The lab logs should be checked in. I expect that the lab log entries can be also useful for agents that need context. The lab log should make it easier to locate artifacts and write the final paper when the time comes."

> "The lab log should never reference artifacts that are not committed to git. I'd prefer any reference artifact files (usually images or .CSV files) to be copied over to the lab log directory, in an organized fashion."

> "Agents should automatically append lab log entries, but they should be so much bearing with it. Agents should be encouraged to incorporate my prompting language into the logs — anything that reflects my intent is most critical to include."

## Decisions

- **Lab log lives at repo root as `lab-log/`** — keeps it alongside `artifact-archive/` and other repo-level research infrastructure; easy to find for both humans and agents.
- **Flat dated markdown files** (`YYYY-MM-DD-slug.md`) rather than nested folders — simpler to scan and grep; multiple slugs per day when threads diverge.
- **YAML frontmatter with `date`, `tags`, `artifacts`** — lightweight, greppable, no tooling required; `artifacts` field makes it easy to locate committed figures when writing the paper.
- **Assets copied into `lab-log/assets/YYYY-MM-DD-slug/`** — all referenced artifact files are always committed; entries never point outside the repo or into `.gitignore`d paths.
- **Overlapping but distinct from `artifact-archive/`** — `artifact-archive/` is a timestamped snapshot archive (user-triggered); `lab-log/assets/` is the committed narrative copy. An important artifact can legitimately appear in both.
- **Agents write entries automatically** on any substantive user-driven session — capturing user intent verbatim is the top priority, not neutral technical documentation.

## Context

This is a solo research project (no collaborators). The log serves three purposes:
1. Continuity for agents picking up mid-project — the entries give the "why" behind the current state of the code and data.
2. Decision audit trail — when choices get revisited, there's a record of what was tried and what was concluded.
3. Paper writing aid — entries, tags, and committed figures make it straightforward to reconstruct the research narrative when drafting the thesis.

The relationship to the thesis: this project directly supports Chapter 7 (automatic coaching), and Chapter 6 (the CHI dance-learning study) provides the evaluation substrate. Decisions about metrics, model fitting, lesson plan structure, and coaching logic are the most thesis-relevant things to log.
