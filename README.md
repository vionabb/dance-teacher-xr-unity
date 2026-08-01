# Dance Teacher XR

Research code for automatically structuring short dance lessons from video and investigating the transition from a guided learning interface toward an adaptive virtual dance coach.

The active system has two primary subprojects:

- [motion-pipeline/](motion-pipeline/): offline Python processing for pose extraction, preprocessing, audio/complexity analysis, dance-tree generation, bundle export, and research analysis.
- [svelte-web-frontend/](svelte-web-frontend/): SvelteKit application for lesson delivery, webcam pose estimation, motion evaluation, feedback, and teaching-agent logic.

Unity, A-Frame, BVH, and NAO/retargeting code represent earlier or secondary investigations. They remain useful historical context but are not the main chapter-focused development path.

## Start here

- Coding agents: [AGENTS.md](AGENTS.md)
- Repository map: [documentation/repository-summary.md](documentation/repository-summary.md)
- Documentation index: [documentation/README.md](documentation/README.md)
- Current research maturity: [documentation/experimental-status.md](documentation/experimental-status.md)
- Data and artifact access: [documentation/dataset.md](documentation/dataset.md)

For cross-project work, open [dance-teacher-xr-unity.code-workspace](dance-teacher-xr-unity.code-workspace). For setup and commands, follow the README in the subproject you are changing.

## Research framing

The earlier CHI 2025 work evaluated automatically generated practice plans for learning TikTok dance challenges. The current repository reuses those study assets to evaluate motion metrics and develops a different, still-automated lesson structure: a checkpointed learning journey in which segments progress through `mark -> drill -> full out`. The longer-term goal is a closed feedback loop that connects movement evaluation, learner state, feedback, and sequencing. That adaptive loop is still incomplete; see [documentation/experimental-status.md](documentation/experimental-status.md).

The current thesis source places these projects in [chapter 6](documentation/papers/thesis/chapters/06-enhancing-the-educational-potential-of-tiktok-dance-videos.md) and [chapter 7](documentation/papers/thesis/chapters/07-toward-an-adaptive-virtual-dance-coach.md), although earlier notes use chapter-4/chapter-5 working numbers.
