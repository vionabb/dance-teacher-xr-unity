[Previous](./09-discussion.md) | [Index](../index.md) | [Next](./11-references.md)

## 10 Future Directions

<a id="chap:future-directions"></a>

The preceding chapters argue for a practical path toward automatic coaching for expressive movement, but also make clear how much remains unresolved. Future systems will need richer expressive metrics than correctness alone, a better account of how expressive goals vary across social and cultural contexts, and interfaces that support exploration and stylistic development rather than only replication. Because expressive movement learning sits between computational modeling, pedagogy, and embodied practice, progress will also require methods that translate between these perspectives.

The central open question emerging from this work is whether effective coaching systems require tightly integrated models of evaluation, pedagogy, and learner state, or whether simpler, more modular designs could achieve comparable outcomes. The preceding chapters suggest that these components became tightly coupled in practice, but it remains unclear whether that coupling is fundamental to the problem or a consequence of particular design choices. The directions below therefore focus not only on extending individual components, but on clarifying how these components relate and whether alternative decompositions of the problem are possible.

### 10.1 Toward a Conceptual Model of Expressive Movement Learning

The work in this dissertation points toward the need for a more explicit conceptual model of expressive movement learning systems. Across chapters, several core elements recur:

- movement representation (e.g., pose, segmentation, motion primitives)

- performance evaluation

- learner state (e.g., confidence, difficulty, affect)

- pedagogical policy (e.g., sequencing, feedback, difficulty modulation)

These components do not operate independently. Evaluation constrains what pedagogical decisions are possible, pedagogical structure shapes the data available for evaluation, and learner state mediates how evaluation should be interpreted. Representations, in turn, determine what aspects of motion can be measured at all.

One way to interpret this system is as a set of interacting components rather than a linear pipeline. Making these relationships explicit would provide a clearer foundation for both system design and empirical study. In particular, such a model enables testing alternative decompositions of the system, clarifying which components must be tightly integrated and which can remain modular.

### 10.2 Segmentation as a Bridge Between Disciplines

Segmentation provides a concrete test case for the coupling question introduced above. Temporal segmentation emerged throughout this work as a shared structure across computational modeling, pedagogy, and dance practice. In computational terms, segmentation discretizes continuous motion signals. In pedagogy, it defines units of practice and supports chunking. In dance practice, it aligns with how experienced dancers phrase and organize movement.

This suggests that segmentation may function as a boundary object across these domains: a representation that can be interpreted differently by each community while still supporting coordination among them. Future work could investigate this role more directly by comparing segmentation strategies derived from computational methods with those produced by human experts.

One concrete direction would be to evaluate the temporal segmentation approach used in this dissertation against alternative methods, including unsupervised motion segmentation ([Krüger et al. 2017](11-references.md#ref-kruger2017unsupervisedtemporalsegmentation)) and recent work on dance video segmentation that combines visual and audio features ([Endo et al. 2024](11-references.md#ref-endo2024dancemovesegmentation)). These could also be compared against dancer-derived segmentation practices ([Rivière et al. 2018](11-references.md#ref-riviere2018dancers)).

If segmentation can serve as a stable interface across modeling, pedagogy, and practice, this would support more modular system architectures. If not, it would suggest that tighter integration across components is unavoidable. Other potential boundary objects include feedback units, difficulty annotations, and motion primitives, which similarly bridge representation, pedagogy, and learner interpretation.

### 10.3 Agent-Directed Adaptive Coaching

This direction represents the most direct continuation of the system developed in this dissertation. The next design step was to shift the system from a largely user-directed practice flow toward a more agent-directed one, in which the coaching model selects the next activity based on a combination of learner state and performance evidence.

Prior work on adaptive dance lesson generation provides a precedent for system-directed sequencing ([Yang et al. 2013](11-references.md#ref-yang2013twophasedancelesson)). If an AI coach could choose what users should practice next and those users learned at least as well as, or better than, users choosing for themselves, that would provide evidence that the underlying user and content models capture pedagogically meaningful structure.

The planned architecture for that shift is shown in [figure 48](#fig:adaptivecoaching_userexperienceflow). Rather than asking the user to select among suggested next steps, the updated flow would have the system gather lightweight learner-state input after each activity, especially self-reports of difficulty, confidence, or affect, and use that information together with performance evaluation to select the next practice activity.

This design depends on an explicit policy for balancing learner affect and learning challenge. [Figure 49](#fig:adaptivecoaching_decisiontree) captures the proposed rule-based decision layer: the first priority is to avoid driving the learner into an unproductive state, while a second layer pushes practice toward the edge of the learner's ability. [Figure 50](#fig:adaptivecoaching_difficultyprogression) sketches the corresponding progression policy, varying segment length and playback speed to modulate difficulty.

More broadly, this direction raises the architectural question posed above: whether effective coaching requires tightly integrated models of learner state, evaluation, and sequencing, or whether simpler designs could rely on partial signals such as self-assessment or heuristic progression rules.

### 10.4 Richer Motion Representation and Evaluation

The adaptive-coaching work suggests that future progress will depend not on a single better similarity score, but on a richer evaluation stack. The motion-quantification experiments suggest that improving evaluation will require moving beyond single scalar scores toward representations that capture multiple aspects of movement, including pose, timing, and dynamic qualities.

Future systems will likely need to combine multiple analytic views of movement rather than collapse everything into one scalar score, treating pose, timing, and dynamics as complementary signals for different pedagogical decisions. Intermediate representations such as motion primitives, phase-based analyses, and expressive descriptors may help explain not just that a performance diverged, but how and why.

<div class="figure"><img src="figures/adaptive-coaching/user-experience-flow.png" />
<p><a id="fig:adaptivecoaching_userexperienceflow"></a></p>
<div class="caption"><em>Figure 48. Planned user-experience flow for a future agent-directed coaching system. The design shifts from user-selected next steps toward AI-selected practice activities informed by self-reported difficulty, confidence, or affect in addition to performance estimates.</em></div></div>

<div class="figure"><img src="figures/adaptive-coaching/coaching-decision-tree.png" />
<p><a id="fig:adaptivecoaching_decisiontree"></a></p>
<div class="caption"><em>Figure 49. Planned rule-based decision tree for learner-state-aware coaching, designed to balance learner affect with performance-based progression.</em></div></div>

<div class="figure"><img src="figures/adaptive-coaching/difficulty-progression.png" style="width:5in" />
<p><a id="fig:adaptivecoaching_difficultyprogression"></a></p>
<div class="caption"><em>Figure 50. Planned difficulty progression for a future adaptive coaching model. The progression varies segment length and playback speed, but it was not implemented because the learner-state-aware AI decision layer that would have driven it remained unfinished.</em></div></div>

A natural extension of this work is to move beyond evaluating movement against a fixed reference movement and toward systems that adjust the reference itself. Simplification-based approaches and staged lesson generation suggest that learners may benefit from adaptive targets that evolve with their capabilities ([Han et al. 2026](11-references.md#ref-han2026makesimplemakedance); [Yang et al. 2013](11-references.md#ref-yang2013twophasedancelesson)).

#### 10.4.1 Evaluation as Functional Decomposition

Evaluating expressive movement coaching systems poses a challenge similar to evaluating large language models. In both cases, the goal is not to recover a single ground-truth answer, but to assess the quality of system outputs that are subjective, context-dependent, and task-specific. Just as the question "what is good text output?" does not admit a single metric, the question "what is good pedagogical output for an AI coach?" is similarly underdetermined.

It is therefore important to distinguish between evaluating the learner and evaluating the system. Much of the work in this dissertation focuses on estimating learner performance, but future work must also evaluate the coaching system itself: its feedback, decisions, and pedagogical outputs. The framework proposed here focuses on this latter problem.

Future evaluation could be organized around several functional categories:

#### 10.4.2 Perceptual alignment.

How well do the system's internal judgments of motion similarity align with human perception?

#### 10.4.3 Transformational evaluation.

Can the system produce useful transformations of motion, such as simplifying choreography, adapting difficulty, or modifying style?

#### 10.4.4 Pedagogical decision evaluation.

Can the system make appropriate decisions about practice progression, such as when to advance, repeat, or adjust difficulty based on performance or performance history?

#### 10.4.5 Feedback and explanation evaluation.

Does the system generate feedback that is specific, actionable, and aligned with observed performance?

#### 10.4.6 Structural representation evaluation.

Are intermediate representations, such as segmentation, useful for organizing practice and supporting learning?

Rather than aggregating these into a single score, each category defines a family of task-specific evaluation settings, analogous to benchmark suites used in LLM evaluation. Each task isolates a particular function of the system, such as generating feedback, selecting practice steps, or transforming motion, allowing performance to be assessed in a more controlled and interpretable way.

Because of the subjective nature of expressive movement, such evaluations should prioritize within-subject comparisons (e.g., pairwise or ranking-based judgments) rather than absolute scoring, which may vary significantly across evaluators.

This decomposition also provides a way to test the coupling question introduced earlier. If systems perform well on isolated evaluation tasks but fail when integrated, this would suggest that tighter coupling among components is necessary. Conversely, strong performance across modular tasks would support the feasibility of more decomposed architectures.

### 10.5 Spatial Interfaces for Expressive Movement

This direction is not independent of the architectural questions above, but interacts with them in important ways. Prior work in this dissertation suggests that representation and interface design are partially coupled: the way movement is modeled constrains how it can be exposed to the learner, and interface choices in turn shape how that model is used and interpreted.

For example, interpretable representations such as segmented motion or joint-level feedback become meaningful only when they are surfaced through appropriate interaction and visualization. Conversely, spatial or embodied interfaces may require different forms of representation altogether, such as spatial referencing, tactile encoding, or environment-aware feedback.

Several probes in this dissertation explored mixed reality, wearable haptics, and robot embodiment, but none fully resolved how to provide guidance that remains intuitive and pedagogically meaningful. A more spatially situated coach could keep the learner's attention in their environment and within their own body while still offering guidance, for example through scene-aware interaction or tactile cues ([Delmerico et al. 2022](11-references.md#ref-delmerico2022spatial); [Shvo et al. 2022](11-references.md#ref-shvo2022tom); [Andriella et al. 2025](11-references.md#ref-andriella2025mentalising)).

Extending coaching into spatial and embodied interfaces therefore raises both interaction and representation challenges. Rather than being a purely downstream concern, interface design may reshape what kinds of models are viable and what forms of feedback are pedagogically effective.

### 10.6 Gender-Affirming Expressive Movement

<a id="sec:gender-affirm-expressive-movement"></a>

This domain serves as a stress test for the evaluation and representation challenges described above. Gendered and stylistic movement qualities are difficult to define, measure, and standardize, making them a useful probe for the conceptual model outlined in this chapter.

For trans people in particular, movement is an under-examined aspect of gender transition. While medical transition has been the primary focus of research, how one moves also shapes confidence, recognizability, and social experience.

A first step in this space is measurement rather than end-to-end coaching. One direction would be to investigate whether computational systems can detect or describe gender-coded movement qualities in bounded cultural contexts, for example within contemporary Western social dance. Such work could draw on movement-analysis frameworks such as weight, time, space, and flow ([Bernardet et al. 2019](11-references.md#ref-bernardet2019assessing)), while remaining explicit that movement gendering is subjective and culturally situated rather than universal.

If such qualities could be measured in ways that align with human judgments, a later step could extend the systems developed in this dissertation toward tools that support exploration and refinement of expressive identity. The goal would not be normative conformity, but to support self-directed experimentation and agency in how individuals inhabit and present their bodies.

Taken together, these directions suggest that the next phase of work in expressive movement learning systems is not only to improve individual components, but to better understand their relationships. The central challenge is not only building better representations, evaluation methods, or pedagogical strategies, but determining which components must be tightly integrated and which can remain modular in a functional coaching system.

[Previous](./09-discussion.md) | [Index](../index.md) | [Next](./11-references.md)
