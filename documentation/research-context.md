# Research Context

This is the concise, self-contained research context for the AI Motion Coach repository. It describes the provenance and claim boundaries needed to work on the code; it is not a replacement for the dissertation or published paper.

## Research lineage

The earlier CHI 2025 dance-learning work investigated how automatically generated practice plans and interface features could help people learn short TikTok dances. It supplies participant performances, human similarity-to-reference ratings, and derived pose data that now support technical evaluation of candidate motion metrics.

The later adaptive-coaching work built a browser-based choreography-learning system. Its current lesson structure turns phrase-level segments into stages and checkpoints, with each activity progressing through `mark -> drill -> full out`. The formative pilots showed that this guided learning journey was clearer than the earlier tree-based interface, but also made the quality and interpretability of movement evaluation the central remaining problem.

## What the current repository does

The active system combines:

- offline extraction, preprocessing, audio/complexity analysis, and lesson-bundle generation;
- browser lesson delivery and webcam pose estimation;
- live and terminal motion-evaluation pathways;
- experiment code that compares automatic metrics with prior human ratings.

It is an operational research prototype. It should not be described as a validated adaptive tutor or as evidence that its scores, feedback, audio groupings, complexity heuristics, or learner-state decisions are pedagogically valid. See [project state](project-state.md) for the current implementation boundary and [technical architecture](technical-architecture.md) for the contracts behind these components.

## Evidence and open questions

The prior study ratings are useful grounding data for technical metric validation, but correlation with those ratings is not equivalent to useful coaching. Current research therefore needs to keep four questions separate:

1. Is a metric well defined and technically stable for its intended pose input?
2. Does it align with the available human similarity ratings?
3. Is it reliable enough to expose to a learner as feedback?
4. Does using it improve feedback, sequencing, trust, or learning?

The latter two questions remain open. A future metric-validation document should record settled metric semantics, acceptance criteria, dataset splits, failure modes, and the decision about whether each signal is learner-facing. A new user-study protocol and analysis plan should be created only once those decisions are sufficiently settled.

## Primary sources outside this repository

When this repository is used alongside the dissertation workspace, the authoritative sources are `thesis/Content/3-chi25-tiktok.tex` and `thesis/Content/3-chi27-aicoach.tex`. They provide the complete study and thesis narrative. The code repository intentionally keeps only this stable summary so it can be cloned and understood independently.
