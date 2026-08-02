[Previous](./04-teaching-american-sign-language-in-mixed-reality.md) | [Index](../index.md) | [Next](./06-enhancing-the-educational-potential-of-tiktok-dance-videos.md)

## 5 Decomposition and Structured Representation of Human Motion Capture

<a id="chap:iser2020"></a>

This chapter turns from domain-specific symbolic representation to movement-general structure derived directly from motion data. Where the previous chapter relied on the Hamburg Notation System to make sign language interpretable and assessable, this work asks whether continuous human motion can be reorganized into discrete units that can be surfaced to learners without relying on a hand-authored notation system.

The central problem is a mismatch between continuous motion data and how humans learn movement. Motion capture systems produce high-dimensional continuous trajectories, while learners benefit from attending to smaller, coordinated units that can be practiced, recombined, and refined. In dance and motor-skill instruction, complex movement is commonly taught through part-based practice, marking, and other forms of decomposition rather than repeated exposure to full-motion trajectories ([Warburton et al. 2013](11-references.md#ref-warburton2013_markingbenefits); [Sigrist et al. 2013a](11-references.md#ref-sigrist2013augmented)). This chapter therefore asks what intermediate structures can bridge that gap.

To explore this, I worked with Qijia Shao, Xue Wei, Megan Hillis, David Kraemer, Weifu Wang, Xia Zhou, and Devin Balkcom. We developed techniques for decomposing motion into temporally bounded segments and skeletally localized components, and for recombining those decompositions into an Intermediate Motion Representation (IMR).

My contributions focused on integrating these decompositions into a teaching system. I led the design and implementation of the demonstration frontend and developed IMRs as an internal motion abstraction that structures how practice units are formed and presented. In particular, I designed how temporal segments and skeletal groupings are combined and surfaced in demonstrations, and integrated the decomposition methods into a pipeline that translates raw mocap data into structured representations that can guide pedagogy.

These decompositions are combined into an Intermediate Motion Representation (IMR), an internal abstraction that reduces perceptual complexity while preserving essential structure. More broadly, this work participates in a longer line of research seeking representations that sit between raw kinematics and fully symbolic descriptions of movement ([Bouchard and Badler 2015](11-references.md#ref-bouchard2015segmenting); [Camurri, Volpe, et al. 2016](11-references.md#ref-camurri2016dancer)).

The contribution of this chapter is a movement-general representation and demonstration pipeline rather than a validated account of learning outcomes. It shows how raw mocap data can be reorganized into structured demonstrations for learners and presented through prototype virtual and robotic frontends, while leaving empirical evaluation of instructional effectiveness to later work.

These design decisions are reflected in the demonstration frontends in [figure 9](#fig:iser2020-temporaldecomposition)[figure 10](#fig:iser2020-skeletalisolation). Temporal segmentation is visualized as a sequence of avatars that externalize temporal progression, while skeletal isolation is visualized through selective activation of joint groups. Together, these interfaces show how internal representations constrain and enable legible visualizations.

As the dissertation progressed, the focus shifted toward less equipment-heavy learning settings, including the video-based dance-learning system developed in the next chapter. A version of temporal decomposition was incorporated into that work, while fuller evaluation of the temporal decomposition and skeletal isolation techniques introduced here remains a direction for future research.

### 5.1 Technical Approach

<a id="sec:iser2020-approach"></a>

<div class="figure"><embed src="figures/iser2020/system.pdf" />
<p><a id="fig:iser2020-system"></a></p>
<div class="caption"><em>Figure 8. Pipeline from raw motion capture to intermediate representation and frontend demonstration</em></div></div>

Our system takes raw motion information in the form of mocap data as input. It then applies temporal segmentation and skeletal isolation to produce enriched representations of the motion, which we refer to as Intermediate Motion Representations (IMRs). These representations aim to capture structure at a level that is more compatible with human perception than raw trajectories, while remaining general across motion domains.

We developed an experimental 3D frontend to present these representations and also outlined a potential robotic frontend that could compile IMRs into teaching demonstrations. These frontends were designed to make the structure of the IMR perceptually accessible, rather than simply rendering the underlying motion data ([figure 9](#fig:iser2020-temporaldecomposition)[figure 10](#fig:iser2020-skeletalisolation)).

<div class="figure"><div class="figure">
<img src="figures/iser2020/virtualdemo.PNG" style="width:90.0%" />
<p><a id="fig:iser2020-temporaldecomposition"></a></p>
<div class="caption"><em>Figure 9. Temporal decomposition. Each temporal segment is assigned to a separate avatar and performed sequentially. The active segment is rendered with an opaque, animated avatar, while inactive segments remain static and semi-transparent, preserving temporal context without competing for attention.</em></div></div>
<div class="figure"><embed src="figures/iser2020/gamefrontend-lessoncaptioned.pdf" style="width:90.0%" />
<p><a id="fig:iser2020-skeletalisolation"></a></p>
<div class="caption"><em>Figure 10. Skeletal isolation. Motion is restricted to a subset of joints within a single temporal segment. The foreground avatar demonstrates an isolated version of the movement, while other joint groupings (shown here for illustration) represent alternative decompositions.</em></div></div>
<p><a id="fig:iser2020-decomposition-visualizations"></a></p>
<div class="caption"><em>Figure 11. Visualization of the two decomposition strategies underlying the IMR. Temporal decomposition organizes motion into sequential segments, while skeletal isolation reduces complexity by restricting attention to subsets of the body. Together, these illustrate how internal motion representations are translated into legible visual demonstrations.</em></div>
</div>

#### 5.1.1 Skeletal Isolation & Temporal Segmentation

<a id="sec:iser2020_isolation_segmentation"></a>

The temporal segmentation and skeletal isolation methods described in this section were developed by my collaborator Qijia Shao. My role focused on incorporating these methods into the learner-facing representation and demonstration pipeline described above.

Human mocap data is a high-dimensional time series with each frame representing the 3D spatial locations of the joints. A motion sequence $M$ is defined by a sequence of $n$ frames $[f_1, f_2, ... , f_n]$. Each frame $f_i$ is represented by a ($3k+3$)-dimensional vector: $f_i = [S_i, R_i(1), R_i(2), ... ,R_i(k)]$, where $k$ is the number of total joints, and $S_i = [S_{i_x},S_{i_y},S_{i_z}]$ represents the location of the root joint and $R_i = [R_{i_x}, R_{i_y}, R_{i_z}]$ represents the relative rotation of each joint. With the raw mocap data, learners learn the motion by watching the continuous movement sequences of $k$ joints, which is often overwhelming. The difficulty of interpreting such animation is twofold: 1) Temporally, learners need to pay attention to the whole sequences. 2) Skeletally, learners need to understand and coordinate the motion of $k$ joints at the same time. To better understand the level of difficulty for humans trying to reproduce the motion, we conduct temporal segmentation and skeletal isolation to produce motion enrichments, reducing the learning overhead. We can also explore the interplay between temporal segmentation, skeletal isolation, and difficulty of learning a motion by modifying the combination of the algorithm outputs.

#### 5.1.2 Temporal Segmentation.

Most existing temporal segmentation algorithms like ([Kruger et al. 2017](11-references.md#ref-bjrn)) segment the mocap sequence by their semantic meanings (i.e. segment a mixed motion sequence into different motion types). We are using similar approached but our purpose is to segment a long sequence of a single type of motion (e.g., ballet dancing, freestyle swimming) into several small representative motion clips and determine keyframes. The temporal segmentation is composed of three steps: dimension reduction, clustering, and keyframe extraction. Frames with minor differences may be separated into different clusters if we directly apply clustering methods to the raw mocap data, producing too many clusters. To reduce the number of clusters while maintaining the representative motion clips, we apply Principal Component Analysis (PCA) to each type of motion to reduce the number of joints in the mocap sequence while keeping the main information.

In the following steps, we formulate the temporal segmentation problem as a clustering problem. In this approach, similar frames in the reduced dimension are grouped into clusters and a representative frame is selected from each cluster as the keyframe. In our experiment, we applied k-means clustering  ([Lloyd 1982](11-references.md#ref-kmeans)) method to the mocap data after PCA analysis. For each type of motion, we applied the Silhouette method ([Rousseeuw 1987](11-references.md#ref-sil)) to find the optimal number of clusters . After clustering, consecutive frames in the same cluster are grouped together as representative motion clips. Then we choose the center of each cluster as the keyframes.

#### 5.1.3 Skeletal Isolation.

The goal of skeletal isolation is to divide the whole body motion into different parts, reducing the number of joints that learners need to pay attention to at the same time. We implement the skeletal isolation by two steps: joint angle calculation and correlation analysis.

We first calculate the joint angle values out of the raw mocap data for each frame. Then for each type of motion, we compute the Pearson correlation coefficient $r$ between each pair of joint angles and group the joints with $|r|>0.7$ together. Learners can then focus on one group of highly correlated joints at a time. This leads to different number of groups for different types of motions.

#### 5.1.4 Motion Feature Demonstration

<a id="sec:motion-feature-visualization"></a>

#### 5.1.5 Lesson Creation.

Our teaching system uses IMRs to construct basic learning activities. Temporal segments define short motion clips, while skeletal isolation restricts attention to subsets of the body. These components are combined into demonstrations that present motion in smaller, more focused units.

These units can be understood as proto-pedagogical building blocks: temporally bounded and skeletally localized fragments that approximate the "motion words" used by human coaches. Later activities recombine these units, gradually increasing complexity until the full motion is performed. Operationally, this corresponds to generating short demonstrations over temporal segments while restricting motion to selected joint groups, exposing each unit in isolation before recombination.

<div class="figure"><embed src="figures/iser2020/imr.pdf" />
<p><a id="fig:iser2020_imr"></a></p>
<div class="caption"><em>Figure 12. Intermediate Motion Representation (IMR) data structure.</em></div></div>

### 5.2 What Decomposition Reveals About Learnability

This case study demonstrates that it is possible to construct a movement-general intermediate representation directly from raw motion data, without relying on domain-specific symbolic systems. Temporal segmentation and skeletal isolation reduce the perceptual burden of continuous full-body motion by reorganizing it into smaller, more interpretable units that can be recombined into demonstrations.

At the same time, this work also makes an important limitation clear. While these representations make motion more legible, they do not by themselves constitute an effective teaching system, nor does this chapter establish through user study that they improve learning outcomes. The IMR defines what can be shown, but not how it should be practiced, sequenced, or adapted to a learner. In other words, representation alone does not determine pedagogy.

This clarifies the role of this chapter within the broader thesis. It establishes a movement-general representation that bridges raw data and human perception, but also reveals the need for an additional layer: a pedagogical structure that organizes practice over time and integrates feedback. The next chapter builds on this insight by examining how such structure can be generated and evaluated in a scalable learning system.

[Previous](./04-teaching-american-sign-language-in-mixed-reality.md) | [Index](../index.md) | [Next](./06-enhancing-the-educational-potential-of-tiktok-dance-videos.md)
