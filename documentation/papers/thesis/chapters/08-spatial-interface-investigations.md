[Previous](./07-toward-an-adaptive-virtual-dance-coach.md) | [Index](../index.md) | [Next](./09-discussion.md)

## 8 Spatial Interface Investigations

<a id="chap:miscellaneous"></a>

This chapter gathers a set of exploratory projects on spatial interfaces for movement teaching. While these investigations do not serve as the primary evidentiary backbone of the dissertation, they probe important adjacent questions that the four main case studies only partially address. In particular, they stress-test the broader design space along three dimensions: accessibility of sensing and deployment, translation of movement across bodies and embodiments, and the limits of non-visual feedback channels.

Taken together, these projects help clarify that movement-teaching systems are shaped not only by how motion is represented and analyzed, but also by the body through which motion is presented and the modality through which feedback is delivered. The sections that follow therefore function as interface probes into alternative ways of sensing, embodying, and communicating movement, especially in cases where standard screen-based visual feedback may be insufficient, inaccessible, or transformed by the constraints of a different medium.

### 8.1 Gamified Sign Language Learning (DALI / SLAR)

<a id="sec:signlanguage-space-adventures"></a>

Learning and practicing American Sign Language (ASL) presents unique challenges. Unlike spoken or written languages, ASL relies on the use of 3-dimensional space and full-body articulation, making it difficult to learn through conventional 2-dimensional media. Existing video tutorials and mobile applications provide access to demonstrations, but typically lack mechanisms for verifying the correctness of a learner's signing.

Prior work in the Dartmouth Reality and Robotics Lab explored ASL instruction using a mixed reality system that presented first-person visualizations of both the learner's hands and a virtual instructor. However, this system required a stereo camera mounted to a head-mounted display as well as instrumented sensing gloves to capture hand motion, limiting its accessibility and scalability.

To explore a more accessible approach, we developed an interactive application for learning the ASL alphabet using the Oculus Quest. The system provided an immersive learning environment in which users could view both first- and third-person demonstrations of signs and compare them to their own hand configurations in real time. Rather than relying on external sensing hardware, the application leveraged the Quest's built-in hand-tracking capabilities, enabling deployment on commodity VR hardware.

The resulting application, *Sign Language Space Adventure*, framed alphabet practice within a space-themed instructional game. A robot avatar acted as both tutor and interface, demonstrating signs, responding to user performance, and exposing contextual controls such as hint and replay actions. This embodied design allowed instructional content, feedback, and navigation to be co-located in the 3D environment rather than separated into conventional menus and video panels.

From a technical perspective, the system used Oculus hand tracking to estimate the relative angles of finger joints and compare them against sign-specific tolerances derived from collected user data. This enabled joint-independent correctness thresholds and real-time feedback on a finger-by-finger basis, rather than reducing correctness to a single binary judgment. The handoff documentation also describes infrastructure for collecting per-letter joint positions and signing times, allowing the evaluation model to be iteratively improved as additional usage data accumulated.

#### 8.1.1 Development Team

This project was a collaboration between the Robotics and Reality (R&R) Lab and the Digital Applied Learning and Innovation (DALI) Lab at Dartmouth College, in partnership with a team led by Lora Quandt at Gallaudet University.

My role included drafting the project proposal for DALI's consideration and serving as an onboarder, peer advisor, and technical resource for the undergraduate development team. I created a proof-of-concept Quest application demonstrating ASL animation playback and hand-tracking-based interface components, and supported the team in extracting hand geometry from the Oculus API for evaluating user signing. A complete list of contributors to the project can be found in [table 13](#tab:slar_contributors).

Name & Role \\

Klara Barbarossa & Project Manager \\
Emma Wagner & Project Manager \\
Ardelle Ning & Designer \\
Wylie Kasai & Designer \\
Macy Toppan & Designer \\
Ashley Song & Developer \\
Sungjun Park & Developer \\
Anders Knospe & Developer \\
Benedict Tedjokusumo & Developer \\
Rohith Mandavilli & Developer \\
Nathan Schneider & Developer \\
Pape Sow Traoré & Developer \\
Andy Kotz & Developer \\
Mira Ram & Project Mentor \\
Theia Qu & Project Mentor \\
Ziray Hao & Project Mentor \\
Devin Balkcom & Principal Investigator \\
David Kraemer & Principal Investigator \\
Xia Zhou & Principal Investigator \\
Viona Blanchet & PhD Researcher \\
Qijia Shao & PhD Researcher \\
Megan Hillis & PhD Researcher \\
Amy Sniffen & PhD Researcher \\
Lorna Quandt & Gallaudet University \\
Ruthie Ferster & Gallaudet University \\
Athena Willis & Gallaudet University \\
Katilyn Weeks & Gallaudet University, ASL Demonstrator \\

<a id="tab:slar_contributors"></a>

The resulting system provided an accessible platform for practicing fingerspelling, with the goal of supporting broader engagement with ASL learning. The application was designed as a practice-oriented tool that could be used in informal settings, with potential future applications in educational and workplace contexts.

The undergraduate team expanded the system into multiple pedagogical modes targeting different levels of experience. Beginner-oriented activities included a letter signing game, a letter reading game in which the avatar produced a sign and the learner selected the corresponding letter, and a glossary that allowed direct lookup of alphabet signs with live feedback. More advanced practice was supported by a word-signing game that prompted users to fingerspell names of people or places, emphasizing a more realistic fingerspelling task than isolated toy words. A blasters mode further embedded signing within time-constrained play, requiring users to sign letters on incoming asteroids before collision.

The handoff materials are especially informative about the project's instructional design. During the 2021 winter term, the team introduced a dedicated learning mode for complete beginners and structured it around a "sandwich" sequence: the robot demonstrates a sign, the learner attempts it, and the robot demonstrates it again. This same scaffolding shaped the onboarding flow, which introduced the avatar, feedback system, and spaceship interface before guiding the user through practice on the letters A, B, and C and then a simplified blasters sequence. Letter packs in the learning mode unlocked corresponding content in the other games, while more experienced users could choose an expedited review path. These details show that the project evolved beyond a pure technical prototype into a deliberately scaffolded interactive curriculum.

The system also included persistence and deployment features that made it closer to a usable learning application than a one-off research demo. The game stored local progress and settings such as onboarding completion, top scores, audio preferences, brightness, and caption text size. A settings menu exposed these controls in-world through hand-tracked interaction. By 2021 the team had also prepared the application for distribution through Oculus App Lab, reflecting a practical emphasis on accessibility, maintainability, and public-facing deployment rather than lab-only use.

Within the broader context of this thesis, the project is significant less because it solved ASL instruction in general than because it explored a different point in the design space from the earlier mixed-reality ASL system. It asked what becomes possible when heavy instrumentation is removed, hand tracking becomes markerless, and instructional interaction is folded into a commodity immersive platform. The result was not merely a cheaper version of the earlier system. It was a different interface proposition: one that traded sensing precision for accessibility and, in doing so, exposed which aspects of learner-facing feedback could survive that trade.

The project also sharpened a more general lesson that recurs elsewhere in the dissertation. Static or near-static handshape evaluation is comparatively tractable: the system can reason about finger geometry, compare it to target tolerances, and provide localized feedback. But as soon as instruction moves from isolated letters toward richer spatiotemporal signing, the problem becomes much harder. Movement, timing, occlusion, and transitions between configurations all become part of correctness. In that respect, this probe surfaces a smaller-scale version of the same challenge that later appears in the dance-coaching work: it is easier to sense and score isolated form than to evaluate expressive motion unfolding over time.

#### 8.1.2 Challenges

A central technical challenge in this project was defining criteria for evaluating whether a sign should be considered "correct." The team explored prototype approaches based on thresholding and simple classifiers to compare observed hand configurations against target representations.

On the design side, the development of 3D assets and an instructional avatar required careful consideration to avoid uncanny or distracting visual effects. The handoff document also highlights several unresolved technical limitations that are important in the broader context of sign-language instruction: overlapping signs, signs with substantial movement, temporal recording of user signs, and replay or playback of user attempts.

These limitations underscore the gap between evaluating static handshapes and supporting the richer spatiotemporal structure of full ASL. Accordingly, while the implemented system achieved a compelling accessible platform for fingerspelling practice, extending the approach to dynamic signs involving motion, occlusion, or interactions outside the field of view remains an open challenge. The main value of this probe for the dissertation is therefore twofold: it demonstrates that immersive, markerless, commodity-hardware interfaces can support meaningful movement practice, and it clarifies how quickly the evaluation problem becomes more difficult once a domain moves from discrete configurations to temporally structured motion.

### 8.2 Technical Probe: Robot Expressive Motion

<a id="sec:robot-motion-expression"></a>

Mixed reality interfaces provide immersive, spatially aligned representations of motion, but require the learner to wear a headset and operate within a constrained perceptual setup. These systems remain fundamentally visual: even when rendered in 3D, avatars cannot be physically co-present or interacted with.

To explore an alternative form of embodiment, I investigated the use of a physically instantiated motion coach in the form of a humanoid robot (NAO 6). Unlike screen-based or mixed-reality representations, a robot occupies the same physical space as the learner and produces motion through a tangible body.

To probe this space, I developed a real-time teleoperation system that maps human pose data to the NAO robot. The system functions as a representation and retargeting pipeline, transforming human motion captured from video into executable joint commands.

This system is not intended as a deployable teaching interface. Rather, it serves as a *technical probe*, designed to surface constraints, design tensions, and open questions surrounding robotic embodiment for expressive movement.

This exploration centers the following question:

*What happens when expressive human motion is translated into a physically constrained robotic body?*

#### 8.2.1 Related Work

Prior work in human-robot choreography has explored how robots can acquire and perform motion derived from human partners, often through learning-from-demonstration (LfD) techniques. Martin et al. ([Martin et al. 2022](11-references.md#ref-martin2022_dancingbeyonddemonstration)) present a framework for choreographic collaboration in which a dancer teaches motion phrases to a robot, which are then recomposed into a live performance.

Their system combines kinesthetic teaching with a behavior-based control architecture, representing motion as modular primitives that can be sequenced and recomposed using a hierarchical state machine. This approach allows the robot to vary learned material through motif parameters such as timing or amplitude, but it also depends on a substantial intermediate layer of choreographic abstraction. Motion is not directly retargeted from a human body to a robot body in real time; rather, it is translated into robot-compatible behaviors through careful engineering and ongoing human oversight.

That difference is important for interpreting the present probe. Martin et al. show one viable path for expressive robot motion: adapt human intent into a structured robotic vocabulary. The system explored here takes the opposite route and therefore exposes the opposite problem. By attempting more direct real-time retargeting onto a humanoid platform, it reduces the intermediate abstraction layer but makes the constraints of robotic embodiment much harder to ignore. Together, these approaches outline a broader design space for expressive robot motion: one can preserve more choreographic structure by abstracting and recomposing, or preserve more immediate correspondence by retargeting directly, but both paths run into hard limits imposed by the robot body.

That design space also connects this section to a wider HRI and animation literature in which motion is treated as observer-facing communication. What matters is not only whether a body can reproduce a trajectory, but whether it can preserve the timing, emphasis, and legibility through which that motion is interpreted ([Dragan et al. 2013](11-references.md#ref-dragan2013legiblity); [Lasseter 1987](11-references.md#ref-lasseter1987principles); [Chi et al. 2000](11-references.md#ref-chi2000emote)). This probe is therefore less about robot learning in the usual sense than about expressive translation across bodies.

[Figure 55](#fig:nao6-teleoperation-demo) shows a representative teleoperation example, comparing the source human pose with the pose achieved by the NAO robot after retargeting.

<div class="figure"><div class="figure">
<img src="figures/nao/nao-teleop-achievedpose.jpg" />
<div class="caption"><em>Figure 41. Achieved robot pose</em></div></div>
<div class="figure"><img src="figures/nao/nao-teleop-srcpose.jpg" />
<div class="caption"><em>Figure 42. Source human pose</em></div></div>
<p><a id="fig:nao6-teleoperation-demo"></a></p>
<div class="caption"><em>Figure 43. NAO 6 teleoperation example showing the achieved robot pose alongside the (mirrored) source human pose.</em></div>
</div>

#### 8.2.2 Technical Architecture

#### 8.2.3 Overview

The system implements a real-time pipeline that transforms visual input into robot control signals ([figure 44](#fig:nao6-teleoperation-pipeline)). Human motion is captured from video, converted into a skeletal representation, retargeted to the NAO's kinematic structure, and transmitted as joint commands.

<div class="figure"><embed src="figures/nao/nao6_teleoperation_pipeline.drawio.pdf" />
<p><a id="fig:nao6-teleoperation-pipeline"></a></p>
<div class="caption"><em>Figure 44. Teleoperation pipeline for mapping human motion to NAO robot execution. The implemented system uses monocular pose estimation and the Python qi API, which provides a subset of NAOqi control functionality. Alternative control pathways (e.g., LoLA via ROS2) offer higher-fidelity actuation at the cost of increased system complexity. The robot provides accurate joint-state feedback via encoders, though a fully closed-loop control system was not implemented. This figure highlights how sensing, mapping, and control layers interact to shape the fidelity and responsiveness of expressive movement.</em></div></div>

This architecture mirrors the motion processing pipeline used elsewhere in the thesis, but introduces a critical distinction: the target body is no longer human. Instead, motion must be translated into a platform with substantially fewer degrees of freedom, different joint limits, and restricted control interfaces.

This shift reframes the problem from one of representation alone to one of *embodiment translation*. The challenge is no longer just how to describe motion in a tractable way, but how much of that motion remains meaningful once it is re-encoded through a body with different capabilities.

#### 8.2.4 Motion Representation Pipeline

The system begins by extracting 3D human pose using MediaPipe, producing a set of spatial landmarks per frame. These landmarks are transformed into a structured skeletal representation, from which joint-relative transforms are computed.

This intermediate representation abstracts away from raw pixel data while preserving geometric relationships between body segments. It plays a role analogous to the Intermediate Motion Representation (IMR) described earlier in this thesis, but is optimized for real-time retargeting rather than instructional decomposition.

As in other parts of this work, this stage reflects a central design requirement: motion representations must balance fidelity, interpretability, and computational tractability.

#### 8.2.5 Retargeting to NAO

Retargeting human motion to the NAO requires mapping a high-dimensional skeletal representation onto a significantly reduced set of controllable joints. Joint angles are computed from geometric relationships between body segments. Shoulder rotation is derived from upper-arm direction relative to the torso, elbow flexion from the angle between upper and lower arm segments, and head orientation from an estimate of gaze direction.

This mapping necessarily collapses much of the structure present in human motion. The NAO lacks articulation in the hands and spine, and its joint ranges are limited relative to human movement. As a result, expressive features are either coarsened into larger joint motions or omitted entirely.

This introduces a central tension between *expressivity* and *feasibility*. Geometric correspondence can often be approximated, but expressive qualities such as timing nuance, fluidity, and micro-adjustment are not directly preserved under that mapping. The problem is therefore not merely one of lower resolution. It is that some expressive information has no obvious robotic equivalent in the target body.

#### 8.2.6 Control Interfaces and System Constraints

Beyond kinematic differences, the NAO platform imposes significant constraints at the level of control.

At the time this work began, the primary Python interface to NAO (NAOqi) did not support Python 3, limiting its usability in modern development environments. A newer Python 3-compatible library (qi) has since become available, but provides only partial access to the robot's capabilities and exhibits limited throughput for real-time control.

Lower-level control has also evolved across platform generations. The legacy Device Communication Manager (DCM), which enabled higher-frequency joint control, has been replaced by the LoLA (Low-Level Architecture) interface. However, LoLA is not directly accessible through the standard NAO software stack and instead requires flashing the robot with a custom Ubuntu 22.04 image and interfacing through ROS 2 (Humble).

Even with such modifications, access to true low-level control remains limited. The robot exposes primarily position-based joint control with restricted update rates, and does not provide the sensing fidelity or computational capacity required for advanced whole-body control approaches. Prior work has noted similar limitations, including restricted access to embedded controllers and limited sensing capabilities, which complicate the implementation of dynamic control strategies ([Kim et al. 2016](11-references.md#ref-kim2016nao)).

In practice, achieving expressive, dynamically responsive motion on the NAO requires substantial engineering effort, including custom control pipelines, system-level modifications, and careful tuning of control loops. This level of development is typically undertaken by dedicated robotics teams (e.g., RoboCup teams) and falls outside the scope of this thesis.

As a result, the system presented here operates within the constraints of high-level position control, prioritizing accessibility and rapid prototyping over dynamic fidelity.

#### 8.2.7 Control Constraints and Temporal Behavior

To ensure physically plausible motion, the system enforces joint limits, velocity constraints, and temporal smoothing between successive frames. These constraints are necessary for safe operation but introduce additional distortion relative to the source motion.

In particular, smoothing and rate limiting dampen rapid changes in direction and timing, resulting in motion that is more stable but less responsive. This matters because timing is not merely an implementation detail of expressive movement. In many dance motions, timing is part of the expression itself. A robot can therefore preserve gross spatial form while still losing much of the perceived character of the movement.

#### 8.2.8 Input Modalities

The system supports both live webcam input and prerecorded motion. In both cases, the same processing pipeline is applied frame-by-frame.

This design highlights a key property of the system: it is representation-driven rather than input-driven. Robot behavior depends only on the extracted pose representation, not on the source of the motion data. This aligns with the broader goal of the thesis of enabling systems that can ingest and reinterpret arbitrary movement content.

#### 8.2.9 Limitations

#### 8.2.10 Embodiment Constraints

The NAO robot's physical structure limits its ability to represent expressive human motion. The absence of articulated hands, restricted joint ranges, and reduced degrees of freedom constrain the range of achievable poses.

Movements involving fine motor control, fluid torso articulation, or extended spatial reach are simplified or distorted. These differences are not merely quantitative but qualitative: the resulting motion often conveys a different character than the original.

#### 8.2.11 System-Level Constraints

Equally significant are limitations imposed by the software and control stack. Restricted access to low-level control, limited control bandwidth, and incomplete tooling reduce the ability to experiment with dynamic behaviors such as balance modulation, timing variation, or force-based expression.

These constraints shape not only how motion is executed, but which forms of motion are feasible to explore at all.

#### 8.2.12 Discussion

Although this system was not evaluated in a formal user study, it provides useful insight into a central challenge for movement-oriented HCI systems: expressive human motion does not transfer cleanly across bodies with fundamentally different capabilities. The current implementation relies on geometric retargeting, prioritizing spatial correspondence between human and robot joints. However, this approach does not explicitly account for expressive dimensions such as timing, energy, or stylistic emphasis, and the technical constraints of the robot further suppress those qualities even when the mapping is spatially reasonable.

Given the constraints of low-cost humanoid robots, a more promising direction may be *constraint-aware expressive retargeting*. Rather than attempting to reproduce human motion directly, such approaches would adapt motion to the capabilities of the robot while trying to preserve the expressive features that matter most perceptually. This may involve re-encoding expression across modalities: large-amplitude arm motion may substitute for missing hand articulation, while timing variation may be used to convey emphasis or affect.

Compared to screen-based or mixed-reality systems, robotic embodiment introduces a distinct tradeoff. Physical presence and shared space offer advantages for co-located interaction, but come at the cost of reduced expressive bandwidth and increased technical complexity.

This probe highlights a key lesson within the broader context of this thesis: the challenge is not simply to transfer motion between bodies, but to translate it across embodiments. That is why this section sits outside the core four-case-study arc. It does not establish a new coaching result on its own, but it reinforces a dissertation-level theme from the expressivity literature: movement-support systems must account for how expression survives, degrades, or changes when it is re-encoded through a different body and interface.

#### 8.2.13 Future Directions

Future work may explore retargeting approaches that explicitly preserve expressive features, evaluate how users perceive and learn from robot-performed motion, and investigate alternative robotic platforms with improved kinematics or more accessible control interfaces. Hybrid systems that combine robotic embodiment with visual augmentation may also offer a promising middle ground.

### 8.3 Vibrotactile Feedback

<a id="sec:vibrotactile-feedback"></a>

In addition to visual and spatial interfaces, I explored the use of wearable haptic feedback as an alternative modality for conveying motion guidance. This work investigates whether vibrotactile signals can provide intuitive, low-attention feedback for fine-grained motor control, particularly in contexts where the visual channel is already saturated.

#### 8.3.1 Motivation

Many movement learning systems rely heavily on visual feedback, such as video demonstrations, avatars, or overlaid annotations. While effective, these approaches place substantial cognitive and perceptual demands on the learner, who must map observed motion onto their own body in real time. This challenge is especially pronounced for hand-centric tasks such as sign language, where occlusion, high degrees of freedom, and unfamiliar configurations make imitation difficult.

Prior work in haptics suggests that tactile feedback can be effective for drawing attention and conveying temporal cues, but its utility for communicating detailed motion information remains unclear. In particular, the hand presents a challenging surface for haptic design due to its small size and dense sensory resolution. This project examines whether vibrotactile patterns can encode corrective feedback for finger motion in a way that is both interpretable and actionable. More recent work on wrist-worn haptics suggests that the challenge is not simply whether users can perceive remote tactile signals, but whether the mapping from a felt cue to a mechanical or motor interpretation is congruent enough to remain legible ([Sarac et al. 2022](11-references.md#ref-sarac2022wrist); [Adeyemi et al. 2024](11-references.md#ref-adeyemi2024cowrhap)). That framing is important for this exploration: the design problem is not only actuator placement or signal salience, but how much structure the feedback mapping preserves between an intended movement correction and the sensation delivered to the body.

#### 8.3.2 System Design

To explore this question, I developed a wearable vibrotactile device in the form of a flexible tape that can be attached directly to the body or integrated into clothing. The device consists of a 10 cm strip of medical-grade tape with embedded actuators and visual indicators, shown in [figure 45](#fig:hapticfeedback-systemdesign).

Specifically, the system includes:

- Four evenly spaced vibrotactile actuators (ERM motors) mounted on the skin-facing side of the tape

- Four RGB LEDs mounted on the outward-facing side, aligned with the actuators

- An ESP-8266 microcontroller for wireless control

- A PWM motor driver enabling independent actuation of each motor

The actuators were spaced approximately 2 cm apart, allowing localized stimulation along a finger. LEDs were synchronized with the vibration signals to provide a redundant visual channel for debugging and exploratory multimodal feedback.

<div class="figure"><figure data-latex-placement="t">
<div class="subfigure"><img src="figures/hapticfeedback/fig1-tape-design-with-leds.jpg" style="height:1.75in" />
<p><a id="fig:hapticfeedback-systemdesign-tapedesign"></a></p>
<div class="caption"><em>(a). Tape design with top mount LEDs indicated in red and undermount haptic drivers indicated in yellow</em></div></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig1-tape-connection-hardware.jpg" style="height:1.75in" />
<p><a id="fig:hapticfeedback-systemdesign-tapeconnection"></a></p>
<div class="caption"><em>(b). Tape connection to supporting hardware via a 1m long ribbon.</em></div></div>
<p><a id="fig:hapticfeedback-systemdesign"></a></p>
<div class="caption"><em>Figure 45. System design of the haptic feedback tape.</em></div>
</div></div>

The system was programmed using CircuitPython and supported real-time control of spatiotemporal activation patterns across the actuators. The control electronics are summarized in the circuit schematic in [figure 46](#fig:hapticfeedback-circuit-diagram).

<div class="figure"><figure data-latex-placement="t">
<img src="figures/hapticfeedback/fig2-circuit-diagram.png" style="width:80.0%" />
<p><a id="fig:hapticfeedback-circuit-diagram"></a></p>
<div class="caption"><em>Figure 46. Circuit diagram of the haptic feedback tape.</em></div>
</div></div>

#### 8.3.3 Feedback Encoding

The core design question in this project was how to encode motion guidance into vibrotactile signals. Drawing from prior work on mapping tactile stimulation to body motion primitives, I implemented four feedback patterns intended to communicate finger-level corrections. The full actuation sequences are listed in [table 14](#tab:hapticfeedback-actuation_sequences), and [figure 47](#fig:hapticfeedback-actuationsequence) shows one example sequence rendered across time.

- **Straighten--Converge:** A converging activation pattern indicating that the finger should extend (top tendon engagement)

- **Curl--Diverge:** A diverging pattern indicating that the finger should curl

- **Straighten--Linear:** A sequential activation from fingertip to knuckle

- **Curl--Linear:** A sequential activation from knuckle to fingertip

Each pattern consisted of a sequence of discrete activation steps, with actuation durations of approximately 120 ms and inter-step delays of 300 ms. These patterns were designed to leverage both spatial and temporal variation to encode directionality and intent.

<a id="tab:hapticfeedback-actuation_sequences"></a>

Signal & Pattern: knuckle -- joint1 -- joint2 -- fingertip \\

Straighten-Converge &
.... o..o *oo* o**o .oo. .... \\

Curl-Diverge &
.... .oo. o**o *oo* o..o .... \\

Straighten-Linear &
.... ...o ..o* .o*o o*o. *o.. o... \\

Curl-Linear &
.... o... *o.. o*o. .o*o ..o* ...o \\

<div class="figure"><figure data-latex-placement="t">
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-1.jpg" /></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-2.jpg" /></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-3.jpg" /></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-4.jpg" /></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-5.jpg" /></div>
<div class="subfigure"><img src="figures/hapticfeedback/fig3-actuation-sequence-6.jpg" /></div>
<p><a id="fig:hapticfeedback-actuationsequence"></a></p>
<div class="caption"><em>Figure 47. Actuator activation sequence for the Straighten-Converge feedback signal.</em></div>
</div></div>

#### 8.3.4 Evaluation

To assess the interpretability of these signals, I conducted a pilot study with three participants. The device was mounted on the middle finger of each participant's dominant hand. After a brief onboarding phase in which each signal was demonstrated, participants completed 40 trials in which they were asked to classify each signal as indicating either a "curl" or "straighten" action.

Results showed that participants performed only slightly above chance across all conditions, with accuracy ranging from 53% to 60%. These findings suggest that the proposed spatiotemporal vibration patterns were difficult to reliably distinguish and interpret.

Qualitative feedback reinforced this result. Participants reported difficulty perceiving differences between patterns and uncertainty about how signals mapped to intended actions. Several participants suggested simplifying the encoding scheme, for example by using distinct frequencies or global activation patterns rather than multi-step sequences.

#### 8.3.5 Discussion

These results highlight important limitations of vibrotactile feedback for fine-grained motor instruction, particularly on small and sensitive body regions such as the hand. The main issue does not appear to be simple detectability alone. Rather, the pilot suggests a breakdown in interpretability: participants could feel that something happened, but struggled to reliably infer the intended corrective meaning of the pattern.

First, while the human hand is capable of high-resolution tactile perception, this does not necessarily translate to reliable interpretation of complex spatiotemporal patterns. Variability in actuator-skin contact, differences in pressure, and temporal integration effects may all obscure the intended signal structure.

Second, the mapping between vibration patterns and motor intent was not inherently intuitive. Unlike force-feedback or physical guidance, which can directly induce or constrain motion, vibrotactile signals require an additional layer of cognitive decoding. In that sense, this design asked users to infer symbolic corrective intent from a relatively low-bandwidth signal on a very small body region. That is a much harder task than simply perceiving that two tactile patterns are different.

This aligns with later wrist-haptics literature showing that users can perceive mechanically meaningful differences through distal haptic cues when the mapping remains simple and structurally coherent, but that congruence and subjective intuitiveness do not automatically follow from detectability alone ([Sarac et al. 2022](11-references.md#ref-sarac2022wrist); [Adeyemi et al. 2024](11-references.md#ref-adeyemi2024cowrhap)). In that sense, the weak pilot results here should not be read as evidence that wearable haptics are categorically unsuited to movement tutoring. A better reading is that this particular design attempted to communicate too much corrective structure through patterns that lacked a sufficiently natural sensorimotor mapping.

From the perspective of movement-tutoring system design, this probe clarifies an important limit of alternative modalities. Visual systems often struggle because they demand too much attention or too much interpretation from the learner. This haptic system struggled for almost the opposite reason: the channel was low-attention, but also too low-bandwidth and too weakly structured to support rich corrective explanation. The result suggests that haptics may be most effective not as a standalone channel for detailed instruction, but as a supplemental channel for simpler signals.

From the perspective of movement tutoring system design, these findings suggest that vibrotactile feedback may be better suited for:

- Attention-direction cues (e.g., highlighting which body part to focus on)

- Temporal signaling (e.g., rhythm or timing)

- Simple binary or low-dimensional feedback signals

rather than detailed corrective instruction.

#### 8.3.6 Future Directions

This exploration points toward several promising directions for future work.

On the hardware side, emerging materials such as flexible electrostatic actuators may enable higher-resolution and more expressive haptic feedback while maintaining a wearable form factor. Additionally, improving consistency of actuator contact and exploring alternative placements (e.g., forearm vs. fingers) may improve signal clarity.

On the interaction design side, simplifying the feedback vocabulary and integrating haptics with other modalities (visual, auditory, or proprioceptive) may yield more effective multimodal teaching systems.

More broadly, this project contributes to the thesis by probing the limits of haptic feedback as a channel for motion communication. It helps clarify which aspects of movement learning may plausibly be offloaded from vision and which remain difficult to encode without a richer or more naturally mapped modality. The most plausible near-term role for haptics in this design space may therefore be not rich corrective explanation, but attention direction, timing support, or other low-dimensional guidance layered onto more legible visual or spatial instruction.

[Previous](./07-toward-an-adaptive-virtual-dance-coach.md) | [Index](../index.md) | [Next](./09-discussion.md)
