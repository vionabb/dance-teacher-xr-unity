---
date: 2026-10-01
tags: [metrics, visualization, frontend, dataset]
artifacts: []
---

# Dance-first performance browsing

## User intent

Viona asked to select a dance first, with reference video thumbnails, then choose a participant by number and video thumbnail. Selecting a performance should open its metric visualization, allow switching metrics there, and use the last visualized metric when another participant is selected.

## Decision

The local dataset browser groups performances by dance before showing participants. Each selectable performance remains a full ordered set of segments. When one participant has more than one performance for a dance, the cards retain study and condition details so the recordings are distinguishable. The most recently viewed metric is a browsing preference; the selected performance and time remain part of the review URL.

## Implementation and checks

The local `/research` view shows reference-video stills for dances and participant-video stills for their performances. It generates each still from a validated local video path in memory, using the existing bounded thumbnail cache and loopback-only development access checks. Dance choices come from the catalog. The manual-file links for both metrics remain available.

Opening a performance uses the last inspected metric, saved locally in the browser. The review's metric selector updates that preference while preserving the performance and global timeline position. Returning to browsing restores the selected dance. The performance review continues to scrub through its segments as one timeline.

The catalog parser also now recognizes the evidenced unhyphenated Study 2 dance names `lastchristmas`, `madatdisney`, and `pajamaparty`. Previously, these paired recordings were omitted because the segment parser only matched hyphenated names. A deterministic fixture found zero performances with those names before the fix and three after it. The focused catalog tests passed (8/8), and the frontend build passed.

In the live local preview, reference and participant stills loaded, and a four-segment performance opened in Viona2D. Switching to Qijia2D retained that performance; returning to its dance and selecting another participant opened Qijia2D. After the parser fix, Participant 010's Study 2 emoji and control recordings appeared as separate cards under Mad at Disney, and the five-segment emoji recording opened in the inspector. Dance and participant cards were also reviewed at a 390 × 844 viewport, and the review's bottom chart remained visible at the desktop viewport. No participant frame or screenshot was saved.

## Research status

This changes the inspection workflow and presentation of existing data. It does not validate either metric or change dissertation claims.
