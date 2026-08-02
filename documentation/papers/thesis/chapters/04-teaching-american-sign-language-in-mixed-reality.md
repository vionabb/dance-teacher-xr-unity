[Previous](./03-introduction.md) | [Index](../index.md) | [Next](./05-decomposition-and-structured-representation-of-human-motion-capture.md)

## 4 Teaching American Sign Language in Mixed Reality

<a id="chap:ubicomp2019"></a>

A central challenge for movement-teaching systems is translating raw sensing into feedback that a learner can actually use. Sign language is an especially useful test case because it offers unusually strong representational priors: signs are already understood in terms of structured components such as handshape, location, orientation, and movement. This makes it possible to ask, in a relatively favorable domain, what an interpretable intermediate representation buys a teaching system and where such a representation begins to break down.

This project was conducted by Qijia Shao, Amy Sniffen, Viona Blanchet, Megan Hillis, Xinyu Shi, Themistoklis Haris, Jason Liu, Jason Lamberton, Melissa Malzkuhn, Lorna Quandt, James Mahoney, David Kraemer, and Xia Zhou ([Blanchet et al. 2025](11-references.md#ref-blanchetCHI2025)). It developed a mixed reality system for teaching American Sign Language (ASL), combining instrumented sensing with an interpretable representational layer to support learner-facing feedback. My contributions focused on implementing the mixed reality learning experience that turned sensing and HNS analysis into a usable instructional loop. I was primarily responsible for developing the Unity application that presented the lesson environment, coordinated demonstrations and feedback, and integrated real-time feedback, as well as the Python interface that connected the mixed reality system to the glove sensing pipeline via the Arduino control board. The hardware combined an HTC VIVE Pro headset with a ZED Mini stereo camera mounted on the front of the headset, as shown in [figure 1](#fig:teach-asl-mixed-reality--overallarchitecture). More broadly, ASL presents a concrete instance of a general movement-teaching problem: precise body motion is difficult to observe, explain, and execute, and standard learning media rarely provide the real-time, individualized feedback that a human instructor can offer.

To address that challenge, we built the system around the Hamburg Notation System (HNS) ([Hanke, Thomas 2004](11-references.md#ref-HNS)), a generalized notation system focused on the fundamental components of sign language. Much as the international phonetic alphabet factors spoken words into phonetic units independent of specific languages, HNS factors individual signs into a reduced set of primitive features describing physical movement. This was the key representational move of the project. By reasoning over handshape, location, orientation, and movement at the level of HNS features, the system could compare a learner's performance to a target sign in a way that was both scalable across signs and interpretable enough to support learner-facing feedback.

The mixed reality implementation combined sensing gloves with a head-mounted mixed reality display, allowing learners to see their own hands while following third-person and first-person demonstrations. This setup addressed a practical sensing problem as well as a pedagogical one. Existing motion sensing techniques either required heavy environmental instrumentation or suffered from occlusion during signing, and they were not well suited to sensing both fine-grained finger motion and coarse-grained hand motion relative to the body. Our approach used the gloves and display to capture the relevant motion information, then translated the resulting measurements into HNS features so that the system could provide immediate, descriptive feedback rather than opaque whole-sign judgments.

At the same time, HNS also reveals the limits of a domain-specific symbolic representation. Prior discussions of HNS note that it does not fully capture all of the nuance needed for richly human-like motion guidance ([Takkinen 2005](11-references.md#ref-takkinen2005hnsobservations)). More recent sign-language and assistive-robotics systems likewise continue to rely on highly structured descriptors of hand pose, posture, and tactile articulation rather than on coarse action labels alone ([DelPreto et al. 2022](11-references.md#ref-delpreto2022glove); [Chang et al. 2022](11-references.md#ref-chang2022tatum)). This reinforces an important thesis-level point: sign-language domains offer unusually strong representational structure, which makes interpretable sensing and feedback more feasible than in many other expressive movement settings. But that strength is also a limitation. HNS is tightly coupled to sign language, and the handcrafted machinery required to use it does not by itself generalize to broader movement coaching.

The ZED Mini supported a comparatively wide field of view for contemporaneous hardware, at $90\degree$ (H) $\times$ $60\degree$ (V) $\times$ $110\degree$ (D), which was important for maintaining a usable MR experience ([Stereolabs Inc. 2019](11-references.md#ref-zedmini)). The stereo camera used binocular feature matching to calculate pixelwise depth. Only the portions of the video stream within arm's reach, primarily the user's hands, were displayed; the rest of the user's visual field remained an opaque VR rendering.

### 4.1 Hamburg Notation System

<a id="sec:hns"></a>

The representational question in this system is not merely how to sense a sign, but how to decide what counts as a correct one. To provide useful feedback, the system must evaluate learner performance against some representation of the target sign. But accurate compared to what? There may be significant variability in how different experts perform the same sign, for reasons ranging from hand geometry to the mood the speaker intends to communicate. Several decades of research on sign-language notation provide one answer: a sign can be described in terms of structured component features rather than treated as an undifferentiated whole.

Within the broader framing of this thesis, HNS can be understood as an early answer to a much larger representational problem. Like Laban-inspired movement notation and other qualitative analysis systems, it makes motion legible by breaking it into named components rather than treating it as an uninterpreted trajectory. Its usefulness here is that it provides an intermediate representation that a learner-facing system can reason about. Its limitation is equally important: unlike more movement-general traditions of qualitative analysis, HNS is tightly coupled to sign language and therefore cannot by itself serve as a basis for broader expressive movement coaching.

<div class="figure"><figure data-latex-placement="htbp">
<img src="figures/ubicomp2019/Overall_new.png" />
<p><a id="fig:teach-asl-mixed-reality--overallarchitecture"></a></p>
<div class="caption"><em>Figure 1. System Architecture for MR ASL Teaching System. The system integrates sensing gloves, stereo camera input, and a Unity-based feedback module to translate motion into HNS-based corrective feedback</em></div>
</div></div>

<div class="figure"><figure data-latex-placement="t">
<p><a id="fig:feedback"></a></p>
<div class="caption"><em>Figure 2. Handshape features can be further divided into base handshapes and modifiers <span class="citation" data-cites="HNS">(<a href="#ref-HNS" role="doc-biblioref">Hanke, Thomas 2004</a>)</span>.</em></div>
</div></div>

#### 4.1.1 HNS Background.

*Hamburg Notation System* (HNS) is the collaborative effort of researchers across several nations to develop a nomenclature that can effectively describe all sign languages in written form. HNS provides a means to fractionate individual sign language signs into a reduced set of fundamental component elements that describe physical movements ([Hanke, Thomas 2004](11-references.md#ref-HNS)). Thus, each sign in ASL, or any sign language, can be described in terms of five component features:

- *Handshape*: HNS defines twelve basic handshapes ([figure 65](11-references.md#fig:HNS_base)) as the basis of ASL signs. In addition to the base handshape, signs may require finger modifiers. Modifiers target specific fingers to transform base handshapes into signs ([Hanke 2019b](11-references.md#ref-hns-documentation)). There are 8 modifiers ([figure 67](11-references.md#fig:hns_modifier)), with two classes: thumb modifiers and finger modifiers ([Hanke, Thomas 2004](11-references.md#ref-HNS)). Thumb modifiers specify which way the thumb should point during a sign. Finger modifiers indicate whether the fingers should be straight, bent, hooked, or flattened ([Hanke 2019a](11-references.md#ref-HNShandshapes)).

- *Location*: Hand location is defined by two components, the location of the hand within the frontal plane and on the z-axis with respect to the body. If one or both of these components are not specified, the hand is assumed to be located in the "neutral signing space," which is at a "natural" distance in front of the torso ([Hanke 2019b](11-references.md#ref-hns-documentation)). Additionally, for two-handed signs, the positions of the hands in relation to each other may also be described. There are seven possible locations in the frontal plane: head, mouth, pairy head, trunk, upper arm, lower arm, and lower extremities. [Figure 66](11-references.md#fig:hns_location) shows examples of symbols for signs that are performed at the center of the upper arm, the shoulder line, the ears, and the head.

- *Orientation*: The orientation of the hand is defined by the combination of two components: extended finger direction and palm orientation ([Hanke, Thomas 2004](11-references.md#ref-HNS)). The former describes the orientation of the knuckles with respect to the wrist, while the latter describes the orientation of the palm ([Hanke 2019b](11-references.md#ref-hns-documentation)). HNS provides symbols for both components in increments of $45~\degree$ ([Hanke 2019a](11-references.md#ref-HNShandshapes)). [Figure 69](11-references.md#fig:hns_orientation) shows all twelve possible palm orientations.

- *Movements*: Path movements (changes in hand position) can be performed in straight, curved, or zigzagged lines, with direction defined in increments of $45~\degree$ ([Hanke, Thomas 2004](11-references.md#ref-HNS)). In-place movements (changes in hand posture) can also be performed in sequence or in parallel with path movements. Diacritic symbols describe the size and speed of motion ([Hanke 2019a](11-references.md#ref-HNShandshapes)). Examples of the most common movements---straight, curved, wavy/zigzag, and circular---are shown in [figure 68](11-references.md#fig:hns_movement).

- *Non-manual features*: HNS provides coding schemes for a number of non-manual tiers including facial expression, head or body movements such as shoulder shrugging, eye gaze, and mouth position ([Hanke, Thomas 2004](11-references.md#ref-HNS)).

These features matter for the teaching system because they turn sign production into named dimensions that can be sensed, compared, and corrected. Rather than judging a whole sign as simply right or wrong, the system can reason about which aspect of the performance is off and present feedback at that level.

We focus on teaching the first four features in this study.

Armed with the sensing data (finger joint angles and contact, hand location, and hand orientation), the system converted raw measurements into HNS features in order to compute real-time feedback. Because the final handshape is a combination of one base handshape and finger modifiers, we used a layered approach that sequentially extracted modifiers and then classified the base handshape. The target handshape and remaining target features came from an ASL-HNS dictionary built for the lesson signs. Feedback was then generated from the discrepancy between the sensed and target HNS features, allowing the system to give descriptive feedback about how to transition from the performed hand configuration to the target one rather than overwhelming the learner with raw joint-angle corrections.

<div class="figure"><figure data-latex-placement="t">
<p><a id="fig:hns_features"></a></p>
<div class="caption"><em>Figure 3. Examples of (a) location, (b) orientation, and (c) movement features and their corresponding HNS symbols <span class="citation" data-cites="HNS">(<a href="#ref-HNS" role="doc-biblioref">Hanke, Thomas 2004</a>)</span>.</em></div>
</div></div>

<div class="figure"><figure data-latex-placement="htbp">
<p><br />
 <br />
 </p>
<p><a id="fig:ubicomp2019-storyboard"></a></p>
<div class="caption"><em>Figure 4. Lesson sequences. Users interact with the MR environment and navigate themselves by reaching their hands into specific buttons and highlighted areas. Users practice in four phases: observation, static handshape, guided motion, and completion</em></div>
</div></div>

#### 4.1.2 MR Environment.

The user experience was set up as a virtual classroom in which learners could see their own hands through selective video passthrough from the 3D stereo camera. We implemented this by modifying a forward-lighting shader to render passthrough only for pixels determined, from the depth buffer, to be within an arm's length of the HMD. To reduce cropping artifacts, we used high-contrast glove fabrics and ran the experiment in a well-lit room.

 Component & Description \\ 
 Learning Manager & Contains data for all lessons, including sign name, animation references, and target HNS encodings. \\ 
 Lesson Manager & Controls the state of the lesson within a finite state machine (one state corresponds to each screen capture in [figure 4](#fig:ubicomp2019-storyboard)). Also listens to data from the HNS classifier script and coordinates display of feedback to the user. \\
 Fungus Flowchart & Used to trigger pre-sequenced lesson actions within the environment, such as changing the whiteboard text or starting a particular animation clip. \\
 Feedback Manager & Loads feedback information from a tab-delimited file and determines feedback given observed and target HNS encodings. \\
 Menu Manager & Automates creation and placement of buttons within menus and switching between menus.\\ 

<a id="tab:ubicomp2019-software-components"></a>

The lesson was implemented as a single Unity scene. The ZED and SteamVR SDKs handled core mixed reality functions such as tracking the head-mounted display (HMD), rendering frames for both eyes, and aligning the virtual perspective with the HMD's physical orientation. Business logic was split among the components shown in [table 1](#tab:ubicomp2019-software-components). The main scene objects were a third-person teacher avatar ([figure 77](11-references.md#fig:ubicomp2019-storyboard-thirdpersslow)), positioned 1.5 meters in front of the learner; a first-person avatar ([figure 73](11-references.md#fig:ubicomp2019-storyboard-firstpershandshape)), derived from the teacher avatar but rendered as translucent arms; a whiteboard for real-time feedback ([figure 76](11-references.md#fig:ubicomp2019-storyboard-thirdpersfast)); and menu buttons for lesson selection ([figure 75](11-references.md#fig:ubicomp2019-storyboard-mainmenu)), which were generated programmatically at initialization.

<div class="figure"><figure data-latex-placement="htb">
<div class="center">
<img src="figures/ubicomp2019/Vicon_setup_1.png" />
</div>
<p><a id="fig:ubicomp2019-vicon_setup"></a></p>
<div class="caption"><em>Figure 5. A 16-camera motion capture Vicon system. 120 markers are placed on a native deaf signer: 19 markers on each hand, 48 markers on the face, and 34 markers on the upper body.</em></div>
</div></div>

#### 4.1.3 Digital Modeling.

Collaborators at Gallaudet University created the third-person teacher avatar by recording motion capture data and mapping it onto a 3D humanoid model. The avatar was modeled in Maya ([Autodesk, INC. 2019](11-references.md#ref-maya)), animated in Motionbuilder ([Autodesk, INC. 2018](11-references.md#ref-motionbuilder)), and driven by motion capture recorded with a 16-camera Vicon system comprising 8 MX Series ([Vicon Motion Systems Limited. 2006](11-references.md#ref-ViconMX)) and 8 Vero Series cameras ([Vicon Motion Systems. 2019](11-references.md#ref-VeroSeries)), as shown in [figure 5](#fig:ubicomp2019-vicon_setup). Markers were placed on 120 locations on the signer's body, with labeling done in Vicon Blade ([Motion Capture Manual. 2019](11-references.md#ref-ViconBlade)).

#### 4.1.4 Learning Lesson Design.

The lesson design implemented a simple instructional progression rather than a single repeated demonstration. The environment was designed for a seated learner and consisted of a virtual teacher avatar, a whiteboard, and disembodied first-person arms. Learners selected signs by reaching into menu buttons, with hand position detected using the ARTag-based tracking system. The lesson then moved from observation to static form acquisition to guided motion following.

The first step is a teacher demonstration, where the teacher avatar performs the sign three times at full speed ([figure 76](11-references.md#fig:ubicomp2019-storyboard-thirdpersfast)) and then another three times at 30% speed ([figure 77](11-references.md#fig:ubicomp2019-storyboard-thirdpersslow)). No explicit instruction or feedback is given to the learner during either of these steps, although the learner's ability to see their own hands and compare them to the avatar's can be considered a form of implicit feedback.

The lesson then transitions to a first-person instructional mode, where the teacher avatar is hidden and a cropped first-person avatar is presented ([figure 73](11-references.md#fig:ubicomp2019-storyboard-firstpershandshape)). For single-handed signs, only one arm is shown. These arms are oriented to match the learner's orientation, so the learner does not need to perform a mental rotation to understand how the avatar's arms and hands map to their own. The avatar's arms are translucent, but the hands are opaque. This allows the learner to see how the first-person avatar's shoulder, elbow, and wrist are configured without losing sight of the hands. Below and in front of the avatar's hands are position targets, visualized as translucent green and blue spheres.

At this point, the system waits for the learner to achieve the correct static handshape before continuing. Feedback is delivered as text on the whiteboard. The participant is able to see the target handshape, attempt to replicate it, and receive corrective feedback simultaneously. There is no time limit to this lesson step; however, there is a "skip" button that learners can use if they become frustrated while attempting to achieve the target handshape.

Once the learner achieves the correct handshape or selects the skip button, the lesson continues and plays the sign animation on the first-person hands at 30% speed ([figure 74](11-references.md#fig:ubicomp2019-storyboard-firstpersmotion)). The motion is repeated three times, and the learner is asked to follow the motion. After the learner performs the sign, the lesson automatically advances to a completion screen ([figure 72](11-references.md#fig:ubicomp2019-storyboard-completion)) that congratulates the learner and offers a choice to either repeat the sign or return to the main menu.

### 4.2 Results

This system demonstrates the practical value of an interpretable intermediate representation for automated movement feedback. By translating glove and motion data into HNS-relevant features, the system could provide targeted corrective information rather than merely replaying a demonstration for comparison. In that sense, the project establishes an important early point for the thesis: legible feedback depends on a representation layer between raw sensing and learner-facing instruction.

<div class="figure"><figure data-latex-placement="tb">
<embed src="figures/ubicomp2019/evaluation/expert-overall-secondgroup.eps" style="width:78.0%" />
<p><a id="fig:ubicomp2019-performance"></a></p>
<div class="caption"><em>Figure 6. Average expert ratings for handshape, orientation, and movement across four learning conditions (MR, interactive desktop, non-interactive desktop, and video baseline).</em></div>
</div></div>

We evaluated the system with 60 novice participants divided across four groups: an MR group using the full system, an interactive desktop (ID) group using a desktop version with sensing and feedback, a non-interactive desktop (NID) group without real-time feedback, and a Signbank video (SV) group learning from online videos. A mixed-design ANOVA revealed a significant main effect of learning group on performance ($F_{3,56}=29.05$, $p<0.001$, $\eta^2=0.609$), indicating that the four groups did not learn the signs equally well. Post-hoc Tukey tests showed that the MR group significantly outperformed the other three groups across the evaluated HNS features, while no other pairwise differences were significant overall. This establishes that the combination of immersive demonstration, real-time sensing, and HNS-based feedback produced substantially better learning outcomes than the desktop and video baselines.

Importantly, the benefit of the system was not uniform across all aspects of signing. The paper reports a significant interaction between learning group and feature type, indicating that the different systems did not perform proportionately across handshape, orientation, and movement. Follow-up analyses suggest a more specific division of labor among the design elements. Comparing the MR and ID groups indicates that the immersive environment contributed strongly to learning orientation and movement, likely because learners could align their bodies to the target motion more directly and inspect the demonstration from a more usable perspective. Comparing the ID and NID groups shows that real-time feedback contributed especially to handshape learning, where learners benefited from targeted correction rather than observation alone. In other words, the chapter does not simply show that "MR worked better"; it shows that different components of the system addressed different representational and perceptual bottlenecks in the learning process.

<div class="figure"><figure data-latex-placement="tb">
<div class="subfigure"><embed src="figures/ubicomp2019/evaluation/self-report-group1.eps" /></div>
<div class="subfigure"><embed src="figures/ubicomp2019/evaluation/self-report-group2.eps" /></div>
<p><a id="fig:ubicomp2019-selfreport"></a></p>
<div class="caption"><em>Figure 7. Participant self-reports on engagement, usefulness, feedback, first-person demonstration, and immersive environment across learning conditions.</em></div>
</div></div>

Self-reports reinforce this interpretation. Participants in the MR condition rated the lesson as highly engaging, with an average engagement score of 4.60 out of 5, and rated it as especially useful for beginners learning ASL. First-person hand demonstration was also rated as highly helpful across the interactive conditions. The paper notes that participants in the Signbank video condition sometimes mirrored one-handed signs with the wrong hand, suggesting that first-person demonstration reduced a genuine learning error rather than merely improving user satisfaction. Participants in the MR and ID conditions also rated the real-time feedback as highly useful. Together, these results suggest that the value of the system was not only that it improved expert-rated performance, but that it made the learning process feel more intelligible and actionable to novices.

At the same time, participant feedback exposed important limitations. Several users reported that the avatar's fingers occasionally appeared at unnatural angles or intersected the palm, making certain signs difficult or unpleasant to follow. Others encountered cases where the system failed to recognize a correct handshape and continued giving the same feedback, leaving them stuck at the handshape stage until they skipped ahead. Participants also expressed a desire for later-stage assessment and communicative use, such as being tested on what they had learned or applying signs in a more conversational setting. These issues matter because they show that even when a symbolic representation supports interpretable local correction, the quality of sensing, embodiment, and lesson progression still strongly shapes whether that feedback is usable in practice.

This clarifies the role of the chapter within the broader thesis. HNS made it possible to decompose sign performance into named components and provide feature-level feedback that learners could act on. That is the key contribution of this case study: it demonstrates that symbolic intermediate representations can support effective learner-facing feedback in a domain with strong representational priors. At the same time, the system depended on substantial handcrafted infrastructure, including a curated ASL-HNS dictionary, feature translation logic, and pre-authored feedback mappings. HNS also remained tightly coupled to sign language and did not by itself determine how practice should be sequenced, adapted, or extended into richer forms of learning. The broader lesson is therefore not simply that symbolic feedback works, but that interpretable representations are necessary and that the next step is to seek more movement-general representations and more explicit pedagogical structure.

[Previous](./03-introduction.md) | [Index](../index.md) | [Next](./05-decomposition-and-structured-representation-of-human-motion-capture.md)
