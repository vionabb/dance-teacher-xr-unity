[Previous](./06-enhancing-the-educational-potential-of-tiktok-dance-videos.md) | [Index](../index.md) | [Next](./08-spatial-interface-investigations.md)

## 7 Toward an Adaptive Virtual Dance Coach

<a id="chap:chi27-dancecoach"></a>

This chapter examines what happened when the project moved beyond structured lesson generation and attempted to become a coaching system. The preceding chapters established three pieces of groundwork: interpretable representations matter, movement can be decomposed into more general learner-facing units, and structured lesson generation from online videos can improve learning outcomes. The next step was therefore not simply to add more automation, but to determine what it takes to turn a structured learning journey into guidance that is meaningful, timely, and instructionally useful.

This reframed the problem. Once the app became legible enough that users could understand what to practice and how to progress, the central bottleneck shifted to evaluation. The key problem was no longer how to sequence activities, but whether the system's account of learner performance was specific, trustworthy, and pedagogically meaningful enough to support adaptation.

That transition also sharpened one of the dissertation's recurring interdisciplinary tensions in a more concrete way. A coaching system has to formalize movement enough to quantify progress, choose practice activities, and generate feedback, but it also has to remain credible to the lived reality of embodied learning, where confidence, felt correctness, and trust do not reduce neatly to a scalar score. In this project, the tension appeared most clearly as a mismatch between what the system could compute and what users felt was actually helpful. This tension becomes especially visible in dance learning contexts.

Dance is an expressive movement domain that many people want to learn, but access to instruction is often constrained by social anxiety, cost, or time. This motivates the need for a flexible, approachable system for independent choreography learning. Over the course of training, dance practitioners develop methods for efficiently learning new choreographies, employing structured practice techniques such as imitation, segmentation, and marking ([Rivière et al. 2018](11-references.md#ref-riviere2018dancers)). Beginners who are just starting their dance journey often lack such methods, compounding the difficulty of learning new choreographies.

This project was carried out by Viona Blanchet, Sixuan Han, Yeongji Lee, Megan Hillis, Qijia Shao, Xia Zhou, David Kraemer, and Devin Balkcom. It developed a virtual dance-coaching system for guiding non-dancers through choreography learning by breaking dances into manageable pieces and organizing practice into a structured "learning journey," informed by dance practice ([Rivière et al. 2018](11-references.md#ref-riviere2018dancers)) and motor learning research ([Sigrist et al. 2013a](11-references.md#ref-sigrist2013augmented)). My contributions centered on the design and implementation of the system, including the web application, learning-journey structure, motion-metric experiments, and feedback pipeline. Sixuan Han contributed design input, metric implementation work, and assistance with the user studies. The intended goal was a closed-loop virtual coach, but in practice the project became a test of how far structured pedagogy and natural-language feedback could carry the system before evaluation quality became the limiting factor.

The resulting web application automatically generates practice structure from dance videos, estimates the user's motion from webcam video, computes performance metrics, and produces natural-language coaching suggestions.

There have been other dance teaching systems presented in the the HCI literature (see ([Raheb et al. 2019](11-references.md#ref-raheb2019dance)) for a survey). Many of these works focus on 3D visualizations and incorporate feedback tailored for a specific dance. Some have developed techniques that generalize to a wide variety of dances ([Marquardt et al. 2012](11-references.md#ref-marquardt2012supermirror); [Anderson et al. 2013](11-references.md#ref-anderson2013youmove); [Z. Zhou et al. 2021](11-references.md#ref-zhou2021syncup); [Tsuchida et al. 2022](11-references.md#ref-tsuchida2022dance)), but these have limited practice structure and typically require motion capture hardware.

### 7.1 Related Work for Adaptive Coaching

<a id="sec:coaching-system-design"></a>

The previous chapter reviewed prior work most directly tied to video-based dance teaching and structured lesson generation. This section focuses more narrowly on the additional literature that becomes important once the design problem shifts from organizing lessons to judging learner state, deciding what kind of feedback is appropriate, and determining what should happen next in practice. The relevant question here is no longer only how to structure movement for learning, but how a system might recognize progress well enough to coach.

Literature in motor learning offers a useful foundation for the design of physical skill coaching systems. Motor learning can be classified into three levels: the cognitive stage, an attention-demanding phase with rapid learning in which the initial motor program is formed and is often constrained by working memory capacity; the associative stage, in which the motor program is enhanced and learners refine their ability to detect and correct performance errors while variability of performance decreases; and the autonomous stage, in which movements are performed consistently and without much conscious effort ([Schmidt and Lee 2025](11-references.md#ref-schmidtlee2025motor)). Formation of a conceptual model (aka mental model) is critical in the early cognitive stage of motor learning, forming the basis of error detection and correction capabilities ([Fitts and Posner 1967](11-references.md#ref-fitts1967human)).

For the present chapter, this stage-based account matters because any adaptive coach needs, at least implicitly, some model of where the learner is. A system that cannot distinguish between early conceptual formation and later refinement cannot reliably decide what kind of support to provide, even before the additional complexities of expressive dance performance are taken into account.

Several strands of prior work point to the importance of supporting cognition around movement, not just movement execution itself. Cognitive rehearsal, also known as mental practice and sometimes imagined practice, has been shown to enhance motor learning and performance ([Sattelmayer et al. 2016](11-references.md#ref-sattelmayer2016); [Rivière et al. 2018](11-references.md#ref-riviere2018dancers)). Movement reduction, or the act of partially performing a movement routine, with smaller gestures or vocalizations taking the place of full-out motions, is associated with cognitive benefits and enhanced learning. In dance this often appears as marking, which is theorized to conserve working memory by letting learners focus on sequence and positioning while omitting some of the demands of full execution ([Warburton et al. 2013](11-references.md#ref-warburton2013_markingbenefits)). Relatedly, experienced practitioners develop a larger inventory of movement primitives in their domain, allowing them to observe, chunk, and remember movement more efficiently ([Leh et al. 2023](11-references.md#ref-leh2023dance_primitive_representation)). For this project, that literature directly motivated the inclusion of marking as a designed practice step rather than treating it as an incidental learner strategy, and more broadly suggested that the system needed to support internalization of choreography rather than only repeated execution.

Prior work on augmented feedback also suggests several relevant design considerations. Both concurrent feedback (during-motion) and terminal feedback (after-motion) have been shown to be beneficial to learning complex movement tasks. Concurrent feedback and frequent terminal feedback are especially useful in the cognitive phase, but can foster a dependency on this guidance and interfere with the development of learners' own error detection capabilities if overused. Trials offering concurrent feedback should therefore be interspersed with no-feedback trials, and the frequency of terminal feedback should also be decreased over time, a principle known as fading feedback ([Sigrist et al. 2013a](11-references.md#ref-sigrist2013augmented), [2013b](11-references.md#ref-sigrist2013_rowtask)). Feedback also seems to be most effective if provided after good trials, due to the positive reinforcement of correct motions and increases in motivation ([Sigrist et al. 2013b](11-references.md#ref-sigrist2013_rowtask); [Wulf and Lewthwaite 2016](11-references.md#ref-wulf2016optimizing)). In addition, self-controlled feedback, in which the learner controls when to receive feedback, has been shown to be superior to externally imposed terminal feedback. Promoting self-estimation of error and delaying external provision of terminal feedback by a few seconds can further benefit error detection learning ([Sigrist et al. 2013a](11-references.md#ref-sigrist2013augmented)). When the learner is in the cognitive stage of motor learning, terminal feedback should be prescriptive, informing the user how to correct the error, whereas descriptive feedback can be helpful once a learner has formed a conceptual model of the motion ([Sigrist et al. 2013a](11-references.md#ref-sigrist2013augmented)).

Taken together, this literature implies that a coaching system cannot treat feedback as a static output channel. It has to decide when to intervene, how often to intervene, and in what form that intervention should occur. Feedback policy is therefore part of the intelligence problem, not a presentation layer placed on top of motion analysis.

Motor-learning work also emphasizes the role of motivation, attentional focus, and the distinction between performance and learning. High performance expectations are an important enabler of motor performance and learning ([Wulf and Lewthwaite 2016](11-references.md#ref-wulf2016optimizing)). Directing attention toward external task effects rather than internal body configuration tends to produce better movement performance and learning, likely because it reduces conscious interference with motor organization ([Wulf and Lewthwaite 2016](11-references.md#ref-wulf2016optimizing)). Among these concerns, the distinction between performance and learning is especially important here. Performance on a given trial is highly variable and can be influenced by fatigue, concentration, and context, whereas learning refers to more durable improvements that persist over time and can transfer to related movements ([Pyke 2012](11-references.md#ref-pyke2012coachingexcellence_movementphases)). For a coaching system, this means that a single performance score cannot simply be equated with a learner's underlying state of skill.

Recent HCI work on physical skill learning reinforces several of these design requirements. Weng et al. show that AI coaching for basketball shooting becomes more actionable when it is grounded in an expert-derived standard operating procedure, giving the feedback system a more interpretable rubric for diagnosing and communicating errors ([Weng et al. 2025](11-references.md#ref-weng2025_sop_basketball)). In a different movement domain, Wang et al. show that structured "micro-progression" can itself be a core design primitive: their drumming system decomposes learning into staged progressions for rhythm comprehension and limb coordination rather than treating practice as undifferentiated repetition ([Wang et al. 2025](11-references.md#ref-wang2025_mrdrum)). These systems are narrower in domain than the ambitions of the present chapter, but they point in the same direction: adaptive movement teaching depends on interpretable instructional structure, not just more automated feedback. A related result appears in beginner dance learning: Kawełczyk et al. ([2025](11-references.md#ref-kawelczyk2025morethanprecision)) found that a motion-capture feedback system detected alignment errors more precisely than human instruction, yet learners reported greater perceived improvement and preference with the human instructor. This reinforces a central constraint for adaptive coaching systems: more precise movement analysis does not by itself produce feedback that feels trustworthy, motivating, or instructionally sufficient.

They also highlight a methodological issue that matters here. If coaching systems aim to improve learning rather than only immediate task performance, they should be evaluated accordingly. Villa et al., for example, compare EMS, electrotactile, and control conditions using measures of learning trajectory, consolidation, and transfer rather than relying only on end-of-session performance ([Villa et al. 2025](11-references.md#ref-villa2025_ems_motorlearning)). This is relevant here because the present system never reached that level of evaluation maturity; it remained closer to a formative probe than a validated adaptive tutor.

Beyond feedback, coaching literature also provides guidance on how practice content and ordering should be structured. Human coaches often analyze motion in phases such as preparation, execution, and follow-through, because phase-based analysis supports more targeted feedback and focused drills ([Pyke 2012](11-references.md#ref-pyke2012coachingexcellence_movementphases)). Practice ordering matters as well: variable or randomized practice can improve long-term learning at the cost of temporarily worse performance, though beginners may initially benefit from more blocked practice while forming a basic motor program ([Pyke 2012](11-references.md#ref-pyke2012coachingexcellence_movementphases)). This suggests that adaptive coaching is not only a matter of scoring a performance, but of deciding what unit of movement to focus on and how practice should be sequenced.

A related but more abstract point is that motor learning may proceed through several overlapping processes, including error-based learning, reinforcement learning, use-dependent learning, and cognitive strategy-based learning ([Spampinato and Celnik 2021](11-references.md#ref-spampinato2021_multiple_ml_processes)). These processes engage different mechanisms and can benefit from different kinds of instruction. For the present work, this reinforces a broader caution: a single scalar metric or single feedback style is unlikely to capture all of the pedagogical functions a coach might need to serve.

### 7.2 Literature-Based Design

The literature above informed both the implemented design of the system and a larger, more aspirational coaching agenda that was only partially realized. At the implemented level, it motivated the structured learning journey, the use of marking as an early practice step, the progressive reduction of guidance within a practice activity, and the distinction between concurrent and terminal feedback. At the aspirational level, it suggested a richer student model, learner-state-aware sequencing, and more adaptive feedback policies than the system ultimately achieved.

In practice, four design principles were especially influential. First, beginners in the cognitive stage should be helped to form a conceptual model of the choreography before being asked to perform it fully, which motivated the inclusion of previewing, segmentation, and marking. Second, guidance should fade across the practice sequence, which motivated the `mark `$\rightarrow$` drill `$\rightarrow$` full out` progression. Third, feedback should be learner-facing and prescriptive when possible, which motivated both the live skeleton overlay and the natural-language coaching layer. Fourth, performance should not be treated as identical to learning, which motivated an interest in aggregating performance over repetitions and eventually adapting sequencing rather than reacting to a single score.

At the same time, the literature also suggested capabilities that were not fully implemented. A mature student model might track not only nominal movement accuracy, but variability, confidence, working-memory burden, or self-evaluation. A more fully adaptive pedagogical model might fade or reintroduce feedback according to learner history, nudge learners toward self-controlled feedback at strategically useful times, or move from blocked to more varied practice once the learner had formed an initial motor program. These ideas were important to the conceptual design of the project, but they remained future-facing rather than fully operationalized in the implemented system.

This affects how the work should be interpreted. The project was not a finished intelligent tutoring system, but an operational probe into how much of the motor-learning literature could be translated into a working choreography coach. It operationalized a subset of those principles in a functioning web-based system, and in doing so made clearer which parts of the problem yielded to that translation and which parts did not.

### 7.3 Pilot 1: Evaluation of the Tree-Based Learning Interface

<div class="figure"><img src="figures/virtualdancecoach/moco-paper/v0-uist-sic-dancetreepage-blur.png" />
<p><a id="fig:moco24-pilotstudy-ux-dancetreepage"></a></p>
<div class="caption"><em>Figure 27. Pilot version of the app. Note the tree-structured segmentation with accuracy-based color-coding and the practice settings controls on the right.</em></div></div>

<div class="figure"><img src="figures/virtualdancecoach/uist-sic/existing-dance-app.png" />
<p><a id="fig:uistsic-existing-web-app"></a></p>
<div class="caption"><em>Figure 28. Pilot Feedback UX. A single accuracy score (out of 5.0) is reported, along with a limb-by-limb accuracy in the form of a color-coded illustration.</em></div></div>

The first pilot study was less a test of sophisticated coaching than a test of whether the system was understandable enough to be used at all. The initial version of the app paired a tree-based learning interface with a simple feedback display, shown in [figure 27](#fig:moco24-pilotstudy-ux-dancetreepage)[figure 28](#fig:uistsic-existing-web-app). T he interface represented dances as recursively segmented trees, while feedback was presented primarily through a single motion-accuracy score and limb-level color coding. Users could click on nodes to preview clips and configure practice settings such as playback speed, visibility of the dance video and webcam feed, and whether automatic feedback was enabled. Practice sessions then reported a motion-accuracy score, limb-level visual feedback, and natural-language coaching suggestions via text-to-speech. In this version, users themselves had to decide what to practice and how to configure the experience.

To evaluate the pilot version of the app, six users with varying dance experience (ranging from none to over 10 years) were recruited (4 female, 2 male, ages 19 to 30). The participants were given approximately 30 minutes to engage with the dance learning app, during which they recorded feedback via a series of short-answer questions. Feedback topics included the perceived helpfulness and accuracy of the automatic feedback, the clarity and usability of the interface that breaking down the dance into pieces, and overall positive and negative aspects of the app. This was followed by a 15 minute semi-structured group discussion focusing on three questions: what aspects of the experience went well, what went poorly, and how could the app be improved.

The pilot identified several shortcomings, but they all pointed toward a common diagnosis: the system lacked legibility at multiple levels. Users found the multi-layer dance tree difficult to interpret and the color-coding unclear. User 1 remarked, "it is not intuitive in terms of the design for nodes," while User 2 asked, "how many color versions are there? Is it just red/yellow/green?" More importantly, participants did not know how they were supposed to construct an effective practice session from the available controls and segments. In other words, the app offered lots of options, but little guidance.

Another major issue was the opacity of evaluation, especially because feedback was concentrated into a single score and coarse limb-level cues rather than an interpretable account of what had gone well or poorly. User 3 noted that "It's cool that it's coming up with a number, but \[I\] have no idea how it comes up with that number," while User 4 observed that the app often gave high accuracy scores even when the user felt there was still substantial room for improvement. User 1 cautioned against over-reliance on the score itself, saying "maybe \[the system\] should show the score the first couple of times, but not all of the time \... there's only so much a number can tell you," and then advocated for playback of the user's own performance so they could decide whether they agreed with the system's assessment.

Participants also highlighted the absence of onboarding and the lack of a clear sense of progress during practice. They reported changing configuration preferences as they advanced in learning the choreography, toggling automatic feedback and the visibility of the dance video and webcam feed. This suggested that even when the system offered potentially useful controls, it was putting too much of the burden of instructional decision-making on the learner.

Taken together, these findings suggested that the first bottleneck was not yet fine-grained coaching intelligence, but basic legibility of the learning experience itself. Before the system could offer sophisticated coaching, it first had to become understandable enough that users knew what to practice, how to progress, and how to interpret the interface. The next iteration therefore focused on making the practice structure more explicit, reducing the burden on users to decide what to do next, and offering a more guided progression through the choreography.

The redesign therefore targeted both sides of the pilot experience: the navigation structure through which learners chose what to practice, and the feedback interface through which they interpreted their progress.

### 7.4 Second Iteration: Design & Implementation

The pilot study revealed that users were intimidated by the lesson menu page and unsure how they should go about learning the choreography. In redesigning that experience, I drew inspiration from Duolingo, which in 2022 moved from a more user-directed interface toward a "learning path" that guides learners through a sequenced progression ([Munson et al. 2022](11-references.md#ref-duolingoLearningPath)). The goal here was to replace the recursively segmented dance tree ([figure 27](#fig:moco24-pilotstudy-ux-dancetreepage)) with a clearer, more guided sequence of learning activities ([figure 29](#fig:moco24-screenshot-learningjourney)) and a more legible practice interface ([figure 32](#fig:moco24-screenshot-drill-inprogress)[figure 30](#fig:moco24-screenshot-drill-feedback)).

The learning journey guides the users through learning the choreography using an incremental part learning approach ([Fontana et al. 2009](11-references.md#ref-fontana2009wholevspartpractice)). The dance is broken down into segments of 8-beats in length. We then adopt a segments-and-checkpoints teaching approach in which the user learns up to 3 segments individually, and then practices a checkpoint activity which combines the segments together, as can be seen in [figure 29](#fig:moco24-screenshot-learningjourney). This is repeated with remaining segments until the entire dance is learned, after which there is a final activity in which the user practices the entire choreography.

<a id="tab:moco24-practice-step-parameters"></a>

 
 \#
 & Step 
 & Speed \
 & Speed \?
 & Display
 & Concurrent \
 & Terminal \ \\
 
 1 & Mark & 0.5x & Yes & Dance Video Only & No & No\\
 2 & Drill & 0.75x & Yes & Dance Video\ Webcam & Yes & Yes\\
 3 & Full Out & 1x & No & Webcam Only & No & Yes\\
 
 

Each practice activity adopts a three-step structure ([table 7](#tab:moco24-practice-step-parameters)) designed around fading guidance. The first step is *mark*, in which the user follows along to the dance video and rehearses the choreography using small, representative motions rather than full-out execution. Marking is widely used by dancers and has been shown to support learning by reducing cognitive load and helping learners form a workable conceptual model of the sequence ([Kirsh 2013](11-references.md#ref-kirsh2013markingDanceTechniques); [Rivière et al. 2018](11-references.md#ref-riviere2018dancers); [Mayer 2017](11-references.md#ref-mayer2017using)). This is followed by *drill*, in which the user practices the movement with both the dance video and webcam visible, allowing them to take cues from the reference and self-monitor as desired. The final step is *full out*, which removes concurrent feedback, hides the reference video, and fixes the music to full speed, pushing the learner toward a more performance-like attempt.

To support feedback, the system uses the webcam feed as an input stream and performs live pose estimation of the user's movement ([figure 33](#fig:moco24-feedback-architecture)) using the Mediapipe PoseLandmarker solution ([[Lugaresi et al.].nocase 2019](11-references.md#ref-lugaresi2019mediapipe)). The resulting pose data are then used to compute several motion metrics. In the implemented system, these metrics served two roles: they powered a live visual feedback layer during drill practice, and they generated a scalar summary that was later translated into natural-language coaching. This pipeline was ambitious, but it was also where many of the chapter's deeper problems would surface.

The resulting pose data is used to compute a series of motion metrics, including:

- 2D pose similarity, which compares the image-frame orientation of eight upper-body vectors with the corresponding vectors in the reference dance video.

- 3D pose similarity, which compares inner angles between pairs of vectors along the upper body with the corresponding inner angles from the reference dance video.

 This method is invariant to camera angle and could be more explainable in theory. It is also better able to handle articulation that is orthogonal to the plane of the video, such as a hand pointing toward the camera.

- Kinematic error metrics, which compare the velocity, acceleration, and jerk of 3D landmarks with the corresponding values from the reference dance video, taking the difference and then summarizing by RMSE. We did not make use of the kinematic error metric computations in the live system, as we found the results to be inconsistent, which could be attributable to landmarks being out of frame, insufficient frame rates, or insufficiently accurate pose estimation.

The 2D similarity metric is used to deliver concurrent feedback during the course of practice attempts by drawing a skeleton of the user's pose over their webcam stream and color-coding each vector based on its measured similarity, bucketing the similarity scores into good (green), fair (yellow), and poor (red) categories based on empirically determined thresholds, as shown in [figure 32](#fig:moco24-screenshot-drill-inprogress).

The 3D skeleton similarity metric is used to provide terminal feedback after the practice attempt is over. The app uses a simple threshold approach to determine whether to recommend that the user repeat the current learning activity or move onto the next one. A natural-language rendition of this feedback is then generated using the Claude 2 LLM from Anthropic. The model is prompted to impersonate an AI dance coach and communicate both the system's coaching recommendation and its evaluation of the user's performance, while also being given contextual information about the structure of the learning journey and the user's progress through it. The resulting message is verbalized using text-to-speech and displayed alongside the similarity score, as shown in [figure 30](#fig:moco24-screenshot-drill-feedback). This language layer was intended to make the app's coaching feel more human and pedagogically legible, but one of the chapter's key findings is that sounding like a coach is not the same as being useful as one.

<div class="figure"><div class="figure">
<img src="figures/virtualdancecoach/moco-paper/learnjourney-secondactivity-blurred.png" />
<p><a id="fig:moco24-screenshot-learningjourney"></a></p>
<div class="caption"><em>Figure 29. Structured Learning Journey</em></div></div>
<div class="figure"><img src="figures/virtualdancecoach/moco-paper/drill-feedback-good-blurred.png" />
<p><a id="fig:moco24-screenshot-drill-feedback"></a></p>
<div class="caption"><em>Figure 30. Practice Interface with Natural Language Feedback</em></div></div>
<p><a id="fig:moco24-app2"></a></p>
<div class="caption"><em>Figure 31. Redesigned user interface for the dance coaching system. Top: the guided learning journey, which organizes practice into sequenced activities. Bottom: the practice interface after an attempt, showing scalar evaluation and LLM-generated terminal feedback.</em></div>
</div>

<div class="figure"><img src="figures/virtualdancecoach/moco-paper/drill-inprogress-blurred.png" />
<p><a id="fig:moco24-screenshot-drill-inprogress"></a></p>
<div class="caption"><em>Figure 32. Practice interface during a <em>drill</em> step. Both the reference dance video and webcam feed are visible, and live motion-accuracy feedback is shown as a color-coded skeleton overlay.</em></div></div>

<div class="figure"><figure data-latex-placement="tb">
<embed src="figures/virtualdancecoach/moco-paper/FeedbackArchitecture.pdf" style="width:4in" />
<p><a id="fig:moco24-feedback-architecture"></a></p>
<div class="caption"><em>Figure 33. Feedback pipeline for the virtual dance coach. Webcam video is processed by pose estimation, translated into motion metrics, and used to generate both live visual feedback during drill practice and terminal coaching feedback after an attempt.</em></div>
</div></div>

<div class="figure"><embed src="figures/virtualdancecoach/uist-sic/technical-schematic.pdf" />
<p><a id="fig:uistsic-llm-integration"></a></p>
<div class="caption"><em>Figure 34. Schematic of LLM integration for generating feedback in the dance coaching system. For each of the tasks, the LLM is supplied with relevant context from the app and asked to generate empathetic, adaptive output.</em></div></div>

### 7.5 Pilot 2: Evaluation of the Guided Learning Interface

The second pilot study was intended to evaluate whether the redesigned system had become more understandable and more useful as a learning tool. Five participants with varying levels of dance experience engaged with the system in either in-person or asynchronous settings. Participants were asked to use the app, reflect on their experience, and provide feedback on the landing page, the segmented learning journey, the `mark `$\rightarrow$` drill `$\rightarrow$` full out` sequence, and the usefulness of the automatic feedback.

As with the first pilot, this study should be understood as formative. The sample size is small and the responses are primarily qualitative, but they provide a useful view into how the redesigned system was perceived and where it remained limited.

<a id="tab:chi27-secondpilot-summary"></a>

Aspect & Observed pattern \\

Interface intuitiveness & 3/5 very helpful, 2/5 somewhat helpful \\
Dance segmentation & 4/5 very helpful, 1/5 somewhat helpful \\
Learning-journey structure & 3/5 very helpful, 2/5 somewhat helpful \\
Color-coded skeleton & 2/5 somewhat helpful, 3/5 neutral \\
Accuracy score & 1/5 very helpful, 2/5 somewhat helpful, 1/5 neutral, 1/5 somewhat unhelpful \\
AI text feedback & 2/5 somewhat helpful, 1/5 neutral, 1/5 somewhat unhelpful, 1/5 unhelpful \\

Participants generally found the redesigned interface and learning journey to be clear and approachable. The landing page was described as "clean," "intuitive," and "user-friendly," and the checkpoint-based learning journey was frequently cited as a meaningful improvement over the earlier tree-based interface. Participants described the new structure as more streamlined and easier to follow, particularly for beginners, with one noting that it felt "more intuitive" and "easier to use for beginner dancers." At the same time, some participants expressed a desire for greater flexibility, such as the ability to preview larger sections of the dance or move more freely through the choreography. This suggests that while the checkpointed structure improved accessibility, it also introduced constraints that may not align with the needs of more experienced learners.

The `mark `$\rightarrow$` drill `$\rightarrow$` full out` progression was one of the most consistently well-received aspects of the redesign. Participants described the sequence as making sense and helping them learn in manageable steps, with one identifying it as their favorite aspect of the system. This progression appeared to provide a clear sense of what to do next during practice and supported incremental learning of the choreography.

The color-coded skeleton feedback produced a more mixed response. While it was not consistently rated as highly helpful, participants appeared to use it to reason about the system's tracking behavior. In particular, it helped users notice when parts of their body were out of frame and adjust their positioning accordingly. This suggests that even relatively simple visual feedback can support interaction with the sensing system, though participants also requested more explicit setup guidance to ensure proper camera framing.

In contrast, the evaluation and feedback components remained a clear point of weakness. Accuracy scores were frequently described as difficult to interpret or misaligned with participants' own sense of performance. Some participants reported consistently receiving scores in a narrow range (e.g., the 70--80 range) even when they believed they had performed well, while others noted that the system appeared to overestimate performance in cases where they intentionally deviated from the choreography. These responses indicate that the score was not yet functioning as a trustworthy or meaningful signal of performance.

The natural-language feedback showed a similar pattern. While some participants found it encouraging or engaging, others described it as too general or insufficiently informative, with comments such as "a lot of the feedback is pretty general." More broadly, the feedback often lacked the specificity needed to guide improvement, and its conversational tone did not compensate for limitations in the underlying evaluation. Several participants also suggested that the system should more clearly communicate what aspects of dance it can and cannot evaluate, noting that elements such as expression, texture, and energy fall outside the scope of the current sensing pipeline.

Taken together, these results suggest a clear shift in the system's strengths and limitations. The redesign improved the legibility of the learning experience: participants better understood how to navigate the app, how to structure their practice, and what was expected of them. However, this improvement made the limitations of the feedback unavoidable. Once the practice structure became clear, the central issue was no longer what to do next, but whether the system's evaluation could meaningfully support improvement.

### 7.6 From Interface Redesign to the Feedback Problem

Results from the second pilot showed that the primary bottleneck had shifted. The redesign addressed many of the problems exposed by the first pilot: it reduced confusion around navigation and produced a more coherent and usable pedagogical structure. In particular, the checkpointed learning journey and the `mark `$\rightarrow$` drill `$\rightarrow$` full out` sequence gave learners a clearer sense of how to proceed through practice. In that sense, structured practice improved before sophisticated coaching did. But that success also made the remaining bottleneck much easier to see. Once users could understand what the app was asking them to do, the central question became whether the system's evaluative signal was good enough to help them improve.

That question was larger than interface polish. A learner-facing coaching system needs performance estimates that are not only computationally convenient, but interpretable, trustworthy, and specific enough to support pedagogical decisions. By the end of the second pilot, it was increasingly clear that the original 'motion accuracy' score was not carrying enough meaning to anchor that kind of loop. This realization motivated the next technical turn in the work: if the broader goal was to close the loop among movement analysis, feedback generation, and learner adaptation, then the motion-understanding layer itself needed more serious investigation.

#### 7.6.1 Mean Calculation

Given a set of accuracy measurements $V={v_0, ..., v_n}$, we needed a way to aggregate them into an overall score for a dance performance. Our initial approach was the arithmetic mean, which is straightforward and remained the production choice for the 2D metrics. However, it tended to mask local failures: a substantial error in one part of the body could be washed out by stronger agreement elsewhere, producing scores that felt too generous relative to human perception.

To address this, we looked for methods to vary the weight of low or high values on the output score. One could perform a weighted arithmetic mean and assign higher weights to lower scores, however this gives us a lot of parameters to choose in terms of what this weighing function would look like.

As an alternative, we considered the different methods of taking the length of a vector (distance functions), called p-norms, given as: $$L_p(V)=\sqrt[p]{\sum_{i=0}^{n}{v_i^p}}$$ These have the desirable feature of allowing us to continually adjust the behavior of the distance function using a single parameter, $p$. However, these distance functions increase with the dimensionality of the vectors. To convert the p-norm distance function into an averaging function, we divide by a scalar, $\sqrt[p]{n}$, which is the largest factor by which the distance metric could exceed the largest individual value in the vector $v$. The resulting metric is: $$pmean(p, V)=\frac{\sqrt[p]{\sum_{i=0}^{n}{v_i^p}}}{\sqrt[p]{n}}$$

This generalized `pmean` family was implemented as an exploratory tool, but I did not end up using the generalized version in production. In retrospect, that was the right call: for `pmean` to be useful as a production scoring function, it would need either an empirical calibration process ahead of time or an adaptive mechanism for determining how strongly bad values should be punished in a given context. What did survive into the implemented metrics was the broader intuition behind it. The production 2D metrics continued to use arithmetic means, while the 3D skeleton-angle metric used a harmonic mean specifically to punish bad local values more strongly. That design choice followed directly from the pilot observation that users could receive good overall scores even when they had failed to mirror important parts of the dance well, or at all.

This formulation provides considerable flexibility in choosing the weighing of large vs smaller values, all parameterized by a single value $p$. As you can see in , this metric equals several well-known averaging functions at certain values of p.

<a id="tab:p-norm-metrics"></a>

$p$& p-Norm& p-Mean\\

$-\infty$& & Min \\
$-1$& & Harmonic Mean \\
$0^-$, $0^+$& $\dagger$ & Geometric Mean \\
$1$& Manhattan Dist & Arithmetic Mean\\
$2$& Euclidean Dist & \\
$\infty$& Chebyshev Dist & Max \\

### 7.7 Motion Quantification

<a id="sec:motion-quantification"></a>

The metric work described in this section happened after the second pilot had made the limitations of the original feedback harder to ignore. The redesigned learning journey improved the usability of the app, but it did not solve the deeper question of how the system could produce feedback that was actually meaningful to learners. The first version of the coaching system had reused the same upper-body 2D pose-similarity technique introduced in our earlier TikTok-dance paper:

Baseline 2D Pose Similarity
 <a id="metric:qijia2d"></a>
 In each frame, the system compares eight upper-body vectors spanning the shoulders, torso, and arms, normalizes those vectors to remove differences in body scale and camera distance, and computes the discrepancy between the learner and reference directions. Per-frame discrepancies are then averaged over the clip and rescaled into a $0$--$5$ score, where higher values indicate closer agreement. This baseline approach was attractive because it was simple, computationally cheap, and interpretable enough to drive the live red-yellow-green skeleton overlay shown during drill practice.

At the same time, the baseline metric made its limitations visible. A purely 2D directional comparison can become unstable when a limb points toward or away from the camera, and it does not distinguish clearly among pose-shape errors, motion-dynamics errors, and timing errors. To explore what a more coaching-oriented evaluation stack might require, I implemented several additional metrics in the web frontend and compared their behavior against human ratings using an offline evaluation pipeline and fitting script that computed per-metric correlations and simple predictive models from a shared set of prerecorded performances. The goal was not to identify a universally best metric or to claim that adaptive coaching had been solved. Rather, it was to investigate a narrower but crucial question: what kinds of motion description might support more meaningful feedback and eventually help close the loop among sensing, pedagogy, and learner adaptation?

Weighted 2D Angle-Magnitude Dissimilarity
 <a id="metric:jules2D"></a>
 This metric addresses a specific weakness of the earlier 2D vector-orientation approach: angle comparisons are only reliable when a limb is well projected in the image plane. When an arm points partly toward the camera, small 3D changes can produce unstable 2D angles even if the movement still looks plausible to a human observer. The metric therefore keeps the same eight upper-body comparison vectors as the earlier method, but computes two discrepancies for each one: an angle discrepancy and a scale-adjusted magnitude discrepancy. The user vector length is first normalized by a body-scale indicator so that performers recorded at different distances remain comparable. The metric then estimates how trustworthy angle is for that vector by looking at its observed 2D length; short projected vectors are treated as unreliable for angle and shift the weighting toward magnitude, whereas long projected vectors shift the weighting toward angle. The resulting blended dissimilarities are averaged across vectors and frames using the arithmetic mean, producing a clip-level score on a $0$--$1$ dissimilarity scale, where lower values are better. In practice, this makes the metric more tolerant of foreshortening and perspective effects than the baseline 2D directional score while preserving a fairly interpretable vector-by-vector breakdown.

3D Joint-Angle Similarity
 <a id="metric:angle3D"></a>
 A second limitation of the 2D family is that it remains tied to camera space. The 3D joint-angle metric instead compares how articulated the body is. For a fixed set of upper-body angle relationships, including shoulder pitch, shoulder yaw, elbow bend, and neck-to-shoulder alignment, the system computes the inner angle for both the learner and the reference pose, takes the absolute difference, and scales that difference by an expected range of motion. Each comparison yields a similarity score in $[0,1]$, and these per-angle scores are combined with a weighted harmonic mean that gives extra influence to elbow-bend errors. The harmonic mean was chosen specifically to punish badly performed local values more strongly, rather than allowing them to be washed out by several stronger joints. The metric produces per-frame similarity scores, a clip-level mean score, a standard deviation that reflects consistency across the clip, and per-angle summaries for diagnostic interpretation. Conceptually, this metric still describes pose shape, but it does so in body-centered geometric terms rather than image-plane terms.

 The per-angle similarities $s_i \in [0,1]$ are aggregated using a weighted harmonic mean:

 $$
 S = \frac{\sum_i w_i}{\sum_i \frac{w_i}{s_i}}
 $$
 
 where $w_i$ reflects the relative importance of each joint relationship. This aggregation penalizes poorly matched joints more strongly than an arithmetic mean.

Kinematic Derivative Error
 <a id="metric:kinematicMAEs"></a>
 The preceding metrics focus on whether the learner reaches a similar pose. They do not directly capture whether the movement unfolds with a similar energetic profile. The kinematic metric was designed to target that problem by comparing derivatives of joint motion over time. For both 2D and 3D pose streams, the implementation computes velocity, acceleration, and jerk from consecutive frames for the learner and reference tracks, optionally normalizes by body scale, and then compares the resulting derivative vectors joint by joint. The final summary reports paired 2D and 3D error descriptors rather than a single score, including mean absolute error and root mean squared error for velocity, acceleration, and jerk. Lower values indicate closer agreement. This representation is attractive because it distinguishes steady disagreement from short error spikes and because it asks about motion quality rather than static pose similarity. 
 
 In this dataset, however, these metrics proved the most fragile of the implemented descriptors. Derivative estimates amplify timestamp irregularities, missing landmarks, and visibility noise, and the resulting signals were not well aligned with human similarity judgments ([table 10](#tab:motionmetric-correlations)). This result should be interpreted cautiously: it may reflect both the sensitivity of derivative-based features to noise and limitations in the current normalization and embodiment-mapping assumptions, rather than indicating that motion dynamics are intrinsically uninformative.

Temporal Alignment Offset
 <a id="metric:angle3Ddtw"></a>
 Timing errors are yet another phenomenon that should not be collapsed into a pose-similarity score. The temporal alignment metric therefore treats synchronization as its own problem. Using the 3D pose stream, the system first computes pose flow vectors between successive frames, bins those flow vectors into an eight-bin directional histogram for each frame, and then differentiates that posegram over time to form an impact envelope. Intuitively, the envelope spikes when the dancer is moving strongly or changing motion direction. The learner and reference envelopes are then multiplied by a Gaussian weighting function centered in the clip to reduce edge effects, and cross-correlation is computed over all lags. The lag with maximum correlation is reported as the best temporal offset, both in frames and in seconds. Unlike the previous metrics, this output is not a direct quality score: it is an alignment estimate indicating whether the learner is early, late, or synchronized. It is therefore best understood as a timing descriptor that complements, rather than replaces, the pose-shape metrics.

<a id="tab:motionmetric-correlations"></a>

Metric & Spearman & Pearson \\

Baseline 2D pose similarity & 0.37 & 0.40 \\
3D joint-angle unwarped similarity & 0.35 & 0.39 \\
3D joint-angle DTW warping distance & 0.32 & 0.31 \\
Weighted 2D angle-magnitude dissimilarity & 0.32 & 0.32 \\
3D joint-angle DTW warping distance (avg per frame) & 0.28 & 0.32 \\
3D joint-angle DTW warping factor & 0.23 & 0.23 \\

Velocity-based kinematic error & -0.08 & -0.04 \\
Acceleration-based kinematic error & -0.09 & -0.05 \\
Jerk-based kinematic error & -0.09 & -0.05 \\

<div class="figure"><embed src="figures/motion-metrics/correlation_with_human_ratings.pdf" style="width:3in" />
<p><a id="fig:motionmetrics-human-correlation"></a></p>
<div class="caption"><em>Figure 35. Correlation of motion metrics with human similarity ratings. Pose-based metrics (2D and 3D) and DTW distance measures cluster in a similar performance range (<span class="math inline"> ≈ 0.35</span>–<span class="math inline">0.40</span>), indicating a shared ceiling for pose-shape representations. The DTW warping factor provides only weak signal, while kinematic derivative metrics (velocity, acceleration, jerk) show near-zero or negative correlation, suggesting that these descriptors do not align well with human perceptual judgments in this setting.</em></div></div>

Taken together, these metrics span three different analytic roles. The baseline 2D method, the weighted 2D angle-magnitude metric, and the 3D joint-angle metric are all pose-shape measures: they ask how similar the learner's body configuration is to the reference at a given moment. The kinematic descriptors instead ask whether the motion evolves with comparable velocity, acceleration, and jerk, while the temporal-alignment metric asks whether the movement happens at the right time.

Treating these outputs as complementary rather than interchangeable proved important during evaluation. As shown in [figure 36](#fig:motionmetric-crosscorr), the pose-based metrics are highly correlated with one another, while the kinematic descriptors form a separate but internally redundant cluster. This structure suggests that the metric set contains fewer independent signals than its size might imply.

Using the offline fitting pipeline, I compared these metric outputs against human similarity ratings and also evaluated simple predictive models built from the metric set. Across individual metrics, correlations with human ratings were modest, with the strongest pose-based measures reaching Pearson correlations of approximately $0.40$ ([table 10](#tab:motionmetric-correlations) and [figure 35](#fig:motionmetrics-human-correlation)). Pose-based metrics, including both 2D and 3D variants, reached similar correlation levels, suggesting a shared ceiling for pose-shape representations in this setting. Temporal-alignment features provided a weaker but partially independent signal, while kinematic derivative metrics did not align with human ratings.

<a id="tab:motionmetric-regression"></a>

Model & Max $R^2$ \\

Linear regression & 0.27 \\
Ridge regression & 0.25 \\
Random forest regressor & 0.25 \\
Elastic net & -0.03 \\

Combining features did not substantially improve performance. The best-performing regression model, a linear regression, explained approximately $27\%$ of the variance in human ratings ($R^2 \approx 0.27$, [table 11](#tab:motionmetric-regression)), with ridge regression and random forest models achieving similar results. This indicates that the limitation lies in the representational sufficiency of the features rather than model capacity.

<div class="figure"><embed src="figures/motion-metrics/metric_to_metric_correlations.pdf" />
<p><a id="fig:motionmetric-crosscorr"></a></p>
<div class="caption"><em>Figure 36. Metric-to-metric correlation matrix. Pose-based metrics are strongly correlated with one another, while kinematic derivative metrics form a separate, highly redundant cluster. Cross-family correlations are comparatively weak.</em></div></div>

Analysis of feature relationships helps explain this ceiling. The pose-based metrics (both 2D and 3D variants) were highly correlated with one another, indicating that they largely captured the same underlying signal. In contrast, kinematic derivative metrics (velocity, acceleration, and jerk) were also highly correlated among themselves but showed near-zero or slightly negative correlation with human ratings. Temporal alignment features provided a partially independent signal, but with only moderate alignment to human judgment.

Taken together, these results suggest that the metric set did not span a sufficiently rich space of perceptually relevant features. Adding more features of the same type or increasing model complexity did not substantially improve predictive performance.

One likely source of that mismatch is input quality. The earlier CHI analyses included manual cleaning steps that identified badly estimated frames and either excluded them, corrected them, or interpolated across them before final scoring. The present frontend metrics operate on noisier pose streams without that human cleanup layer. Visibility analysis supports this interpretation. As shown in [figure 38](#fig:motionquantification-overallvisibilitydistribution), landmark visibility is strongly bimodal: joints tend to be either clearly visible or effectively absent from the frame. The jointwise view in [figure 37](#fig:motionquanitification-visibilitybyjoint) shows why. User-submitted dance videos are strongly face-and-torso centered, hands and arms move in and out of occlusion, and knees and lower-leg landmarks are rarely dependable. A metric that aggregates all landmarks as if they were equally valid and equally visible is therefore making an observational assumption that the data do not support.

<div class="figure"><img src="figures/motion-metrics/study1-pixelposes-segmented.mean_joint_visibility.png" />
<p><a id="fig:motionquanitification-visibilitybyjoint"></a></p>
<div class="caption"><em>Figure 37. Jointwise landmark visibility distributions from user-submitted dance videos gathered from <a href="#study:system-evaluation">study 1</a> in <a href="#chap:chi-tiktok-dance">reference</a>, as estimated using Google Mediapipe <span class="citation" data-cites="lugaresi2019mediapipe">(<a href="#ref-lugaresi2019mediapipe" role="doc-biblioref"><span class="nocase">Lugaresi et al.</span> 2019</a>)</span>. The face and torso are highly visible, hand landmarks are moderately visible, and leg landmarks are minimally visible.</em></div></div>

<div class="figure"><img src="figures/motion-metrics/study1-pixelposes-segmented.overall_visibility_distribution.png" />
<p><a id="fig:motionquantification-overallvisibilitydistribution"></a></p>
<div class="caption"><em>Figure 38. Landmark visibility aggregated across landmarks, drawn from user-submitted dance videos gathered in <a href="#chap:chi-tiktok-dance">reference</a>, <a href="#study:system-evaluation">study 1</a>, as estimated using Google Mediapipe <span class="citation" data-cites="lugaresi2019mediapipe">(<a href="#ref-lugaresi2019mediapipe" role="doc-biblioref"><span class="nocase">Lugaresi et al.</span> 2019</a>)</span>. The distribution is bimodal, with landmarks tending to be either clearly visible or effectively out of frame.</em></div></div>

The same issue also has a perceptual dimension. Even if all joints were equally visible, they would not be equally salient to a human observer. A practical heuristic that emerged in my 2025 analyses was that we tend to notice joints that move. To operationalize that idea, I computed a simple motion-energy quantity from squared joint velocity, filtered to valid frames, enforced left-right symmetry, and normalized the result into a set of perceptual weights. The resulting distribution, shown in [figure 39](#fig:motionmetrics-landmarkenergybyjoint-study1) and summarized in [table 12](#tab:motionmetrics-symmetricaljointweights-study1), places by far the greatest weight on the hands and substantial weight on the elbows and hips. This is intuitively plausible for these dance clips: hand trajectories and arm styling are both visually prominent and pedagogically important, whereas feet and lower legs are often either minimally visible or only weakly informative in the captured framing.

<div class="figure"><img src="figures/motion-metrics/study1-pixelposes-segmented.joint_motion_energy_distribution_3d.png" />
<p><a id="fig:motionmetrics-landmarkenergybyjoint-study1"></a></p>
<div class="caption"><em>Figure 39. Motion-energy distribution by joint. Hand landmarks carry the highest motion energy, followed by elbows and hips, supporting their greater perceptual relevance in these dance clips.</em></div></div>

Joint & Weight \\

ankle & 0.007 \\
head & 0.053 \\
elbow & 0.160 \\
eye & 0.052 \\
toe & 0.009 \\
hip & 0.115 \\
hand & 0.495 \\
knee & 0.014 \\
shoulder & 0.075 \\
heel & 0.015 \\

<a id="tab:motionmetrics-symmetricaljointweights-study1"></a>

These observations suggest that motion metrics in real-world settings must be designed with incomplete and unreliable data as a first-class constraint. Rather than assuming uniformly valid inputs, metric design may need to incorporate explicit handling of occlusion, visibility decay, and confidence weighting from the outset. In this project, such mechanisms were explored post hoc through visibility filtering and joint weighting, but a more principled approach would treat measurement quality as part of the signal itself. For example, metric outputs could include time-varying confidence estimates alongside similarity scores, enabling downstream feedback systems to distinguish between low performance and low measurement reliability.

These observations suggest a more realistic path forward than simply searching for a better single score. The most immediate improvement would be visibility-aware preprocessing or aggregation, so that unreliable frames contribute less to the final summary. A second direction is non-uniform joint weighting, whether through static perceptual weights such as those above or through context-sensitive weighting schemes. A third is nonlinear error scaling, since some geometric deviations are perceptually negligible while others are salient even when numerically small. More ambitiously, the evaluation stack could shift from hand-designed metrics toward a learned rating-prediction model that absorbs visibility, relative joint importance, and temporal context more implicitly.

One implication of these results is that future evaluation may need to move beyond hand-designed geometric summaries toward learned perceptual models. A sequence model trained to predict human similarity judgments from paired learner--reference motion streams could, in principle, learn visibility-sensitive weighting, temporal dependencies, and embodiment-normalized comparisons more flexibly than the current metric stack. Such models could also explicitly incorporate landmark visibility as part of the input, allowing them to distinguish between low performance and low measurement reliability. The present results suggest that this direction may be necessary to capture aspects of movement quality that are not well described by framewise pose similarity or low-order motion derivatives alone.

The broader lesson from these experiments is that coarse motion metrics may still be useful for sequencing practice and tracking progress, but they were not enough to ground the kind of closed-loop coaching envisioned in the larger research agenda. Pose-shape and timing descriptors remained only partially aligned with human judgment, expressive movement qualities remained poorly captured, and the project did not arrive at a learner model capable of using these measurements to adapt feedback and practice flow intelligently. In that sense, the metric work substantially clarified the motion-understanding problem, but it did not by itself complete the coaching system.

### 7.8 Towards Closing the Feedback Loop

The metric work was not the only technical strand pursued in response to the broader coaching agenda. These investigations followed a redesign that had improved the usability of practice structure without resolving the evaluative core of coaching. In parallel, I also investigated methods for automatically structuring dances and estimating their difficulty, with the goal of supporting more adaptive pedagogical decisions than the implemented system ultimately achieved. These strands are best understood not as a grab bag of side experiments, but as parallel attempts at closing the same loop from different directions.

One part of that agenda was a planned shift from a user-directed practice sequence toward a more agent-directed one. After the second pilot, I began scaffolding code for a learner-state-aware coaching loop in which the system would query the user's perceived difficulty, confidence, or emotional state and use that information alongside performance estimates to choose what to practice next. The intended architecture and decision logic for that next step are discussed in the future directions chapter ([figure 48](10-future-directions.md#fig:adaptivecoaching_userexperienceflow)[figure 49](10-future-directions.md#fig:adaptivecoaching_decisiontree)), because they describe a future-facing coaching design rather than the system that was fully implemented here. This planned shift also functioned as a methodological stress test: if the AI coach could make sequencing decisions at least as well as users made them for themselves, that would strengthen confidence that the system's user modeling and content modeling were capturing something pedagogically real. In the implemented system, however, this work remained at the level of partial scaffolding rather than an integrated learner-state pipeline or finished decision layer.

One such strand concerned automatic dance-tree generation from music structure. In the motion pipeline, I developed an audio-analysis workflow that extracted audio from clips, computed tempo and cross-similarity information, and generated dance trees from the resulting structural analyses. See [figure 40](#fig:chi27-audio-grouping-probe) for a hand-inspected cross-similarity plot. The intended role of this work was to make lesson structure less hand-authored by deriving pedagogically meaningful groupings from recurring musical structure. This helped push the system toward more automatic segmentation, but it did not by itself solve the harder problem of whether the resulting segments were the right units for learner support, nor did it provide the evaluative basis needed for adaptive coaching feedback.

<div class="figure"><img src="figures/chi27-audiogroupings/waacking-basic-freestyle.png" />
<p><a id="fig:chi27-audio-grouping-probe"></a></p>
<div class="caption"><em>Figure 40. Representative annotated cross-similarity output from the audio-grouping workflow. Block structure along the diagonal shows contiguous segments of similar auditory structure, which can be used to propose higher-level dance groupings for lesson generation. This grouping strategy was used to construct the multi-layered “dance trees” segmentations used in the pilot version of the app. This probe made automatic lesson structure less hand-authored, but it did not by itself establish whether the resulting segments were pedagogically optimal.</em></div></div>

Another strand focused on motion complexity and difficulty estimation. In the complexity-analysis code, I explored heuristics based on cumulative distance, velocity, acceleration, and jerk, combined with tempo, landmark weighting, visibility handling, and tree-level aggregation. The goal was to estimate which dance segments might be more demanding and to use that information in pedagogical structure, such as ordering, difficulty progression, or complexity-aware dance-tree generation. The intended progression policy is sketched later in [figure 50](10-future-directions.md#fig:adaptivecoaching_difficultyprogression), but that figure belongs to the future-work framing because I did not complete the adaptive AI-driven decision making it would have required. This work moved toward a more learner-sensitive notion of lesson planning, but remained incomplete: the resulting heuristics were not validated as learner-facing difficulty measures, and they were never fully connected to an adaptive student model.

Taken together, these secondary strands make the chapter's outcome easier to interpret. The project did not stop at a weak accuracy score and an encouraging language layer. It pursued multiple routes toward a more substantive coaching loop: better segmentation, better notions of complexity, richer motion metrics, and the beginnings of learner-state-aware sequencing. What remained unresolved was the integration problem. A genuinely adaptive coach would have needed these strands to work together in concert with learner modeling and pedagogical decision logic, and that full coupling was only partially realized here.

### 7.9 Conclusion

This case study succeeded in building and iterating toward a structured choreography-learning system. The first pilot showed that the original tree-based interface and score presentation were difficult to interpret.

The redesign then produced a more legible learning journey, and the second pilot suggested that this practice structure, especially the checkpointed progression and the `mark `$\rightarrow$` drill `$\rightarrow$` full out` sequence, was clearer and more approachable for learners. In that sense, the work demonstrates that pedagogical structure and interface design matter: users need the system to make sense before they can benefit from what it is trying to teach.

At the same time, the chapter also shows that usable structure is not enough. Once the learning journey became more coherent, the remaining bottleneck was the meaning of the feedback itself. The second pilot made clear that a coarse motion-accuracy score and generic natural-language coaching could not yet provide the kind of specific, trustworthy, and substantively useful guidance needed for an adaptive coaching system. This realization motivated the subsequent metric investigations and the broader turn toward difficulty modeling and learner-state-aware adaptation as the next technical layer of the project.

Those later investigations deepened the technical foundation of the project. Work on motion quantification, music-structure-based grouping, and complexity estimation all pushed toward a system that could analyze movement and organize practice more intelligently. But the full agenda was only partially realized. Meaningful motion understanding, interpretable feedback generation, learner modeling over time, and adaptive sequencing logic turned out to be more tightly coupled than the initial architecture suggested. Progress on any one of these strands helped clarify the problem, but none was sufficient on its own.

That the system was only partially realized is not merely a limitation; it is also a finding: once practice structure becomes usable, the central challenge of a virtual coach shifts to evaluation, namely how learner performance is represented, scored, interpreted, and translated into pedagogical action. The contribution is therefore both constructive and diagnostic: it demonstrates a plausible path from legible interface design and structured practice toward adaptive coaching, while also showing that a closed-loop expressive movement tutor requires tighter integration among representation, evaluation, pedagogy, learner modeling, and sequencing than was successfully implemented.

[Previous](./06-enhancing-the-educational-potential-of-tiktok-dance-videos.md) | [Index](../index.md) | [Next](./08-spatial-interface-investigations.md)
