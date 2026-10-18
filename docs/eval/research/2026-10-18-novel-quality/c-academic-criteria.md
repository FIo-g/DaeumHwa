<!-- Aside 조사 원문 보고서 (C), 2026-10-18. Haiku가 Aside 브라우저로 수집. 검증 상태는 ../../novel-quality-criteria.md 5절 참고. -->


# Criteria for judging fiction quality, with a focus on AI-written stories

**Bottom line:** There is no single accepted rubric for story quality. The sources split into four families: (1) human-judged criteria for story generation (HANNA), (2) expert creativity tests (TTCW), (3) LLM-judged or preference-based benchmarks (EQ-Bench, WritingBench, LitBench), and (4) consistency and reader-response measures (ConStory-Bench, transportation/engagement scales). The strongest evidence that AI fiction falls short of professional writing comes from TTCW (expert-judged, 48 stories) and HANNA (human-rated, 1,056 stories, 2022-era systems). Benchmarks that use LLM judges are weaker evidence. Coverage of serialized or multi-chapter fiction is thin.

## Pages opened

I opened the full text or abstract page for every source below, except where noted. The ACM DOI for TTCW came from a search result and I did not open that page; I confirmed the CHI 2024 venue from the arXiv paper's ACM reference text.

## Quick comparison

| Source | Type | Scale | Peer-reviewed? |
|---|---|---|---|
| Chhun et al. 2022 (HANNA) | 6 human criteria | 5-point Likert, 3 raters per story | Yes (COLING 2022) |
| Chhun et al. 2024 (TACL) | LLM as story evaluator | Uses HANNA criteria | Yes (TACL 2024) |
| Chakrabarty et al. 2024 (TTCW) | 14 expert tests | Binary per test, count 0 to 14 | Yes (CHI 2024) |
| EQ-Bench Creative Writing v3 | LLM rubric + pairwise Elo | Rubric score; Elo anchored to reference models | No (self-published leaderboard) |
| WritingBench (Wu et al. 2025) | Query-specific criteria, LLM critic | 1 to 10 per criterion | Not verified (arXiv v4) |
| LitBench (Fein et al. 2026) | Pairwise human preference | Pairwise accuracy | Yes (EACL 2026) |
| ConStory-Bench (Li et al. 2026) | Consistency error taxonomy | Errors per 10K words | Yes (ACL Findings 2026) |
| NstAgent (Wan & Chen) | Long-form generation method | Uses ConStory and WritingBench metrics | Not verified (arXiv preprint) |
| Green & Brock 2000 (Transportation Scale) | Reader transportation | 7-point, 15 items | Yes (JPSP) |
| Busselle & Bilandzic 2009 (Narrative Engagement) | Reader engagement | Item-level scale, final 12 items | Yes (Media Psychology) |
| Doshi & Hauser 2024 | Human writers with GenAI ideas | 9-point evaluator ratings | Yes (Science Advances) |

## 1. Chhun et al. 2022: HANNA and six human criteria

- **Citation:** Chhun, C., Colombo, P., Suchanek, F. M., & Clavel, C. (2022). Of Human Criteria and Automatic Metrics: A Benchmark of the Evaluation of Story Generation. *Proceedings of COLING 2022*, pp. 5794-5836.
- **URLs:** https://aclanthology.org/2022.coling-1.509/ ; arXiv: https://arxiv.org/abs/2208.11646
- **Criteria (quoted from the paper):**
  1. Relevance (RE): "how well the story matches its prompt"
  2. Coherence (CH): "how much the story makes sense"
  3. Empathy (EM): "how well the reader understood the character's emotions"
  4. Surprise (SU): "how surprising the end of the story was"
  5. Engagement (EG): "how much the reader engaged with the story"
  6. Complexity (CX): "how elaborate the story is"
- **Scoring:** 5-point Likert from 1 (worst) to 5 (best), three Mechanical Turk workers per story, averaged. Each criterion has anchors. Example for Relevance: 1 = no relationship with the prompt, 3 = roughly matches, 5 = matches exactly. Example for Coherence: 1 = does not make sense at all, 5 = makes sense from beginning to end. Annotators saw a human story as a calibration reference.
- **Data:** 1,056 stories from 10 generation systems over 96 prompts, each prompt also paired with a human WritingPrompts story.
- **Reliability:** Intra-class coefficients were between 29% and 56%, which the authors call fair to moderate.
- **Findings:**
  - Human stories scored significantly higher on every criterion. Average human score was 3.76. The best system (GPT-2) averaged 2.72. The authors say all systems remain "noticeably below human performance."
  - Story-level correlations between the six criteria ranged from 16% (RE-SU) to 62% (CH-EG), so the criteria are reasonably distinct.
  - Of 72 automatic metrics, story-level correlations with human judgments were mostly weak or moderate. Correlations were stronger at the system level. The authors advise relying on human annotation.
- **Caveat:** These are 2022-era systems, not current frontier models.

## 2. Chhun, Suchanek & Clavel 2024: LLMs as story evaluators

- **Citation:** Chhun, C., Suchanek, F. M., & Clavel, C. (2024). Do Language Models Enjoy Their Own Stories? Prompting Large Language Models for Automatic Story Evaluation. *TACL* 12, 1122-1142. DOI: 10.1162/tacl_a_00689
- **URLs:** https://aclanthology.org/2024.tacl-1.62/ ; PDF: https://aclanthology.org/2024.tacl-1.62.pdf
- **Criteria:** Reuses the six HANNA criteria.
- **Findings:**
  - Overall LLM-human correlations were "moderate to weak," but system-level correlations were "very high," so LLMs can rank models reliably.
  - LLM ratings were self-consistent (high intra-class coefficients).
  - Adding detailed guidelines to the evaluation prompt did not reliably improve correlations.
  - LLMs "struggle at explaining their ratings with substantiated claims."
  - The authors state that LLMs "perform at least as well as humans for the generation of short stories." I did not re-verify the exact comparison behind this sentence. It appears to conflict with HANNA's finding that human stories score higher, which is worth checking before citing.

## 3. Chakrabarty et al. 2024: Torrance Test of Creative Writing (TTCW)

- **Citation:** Chakrabarty, T., Laban, P., Agarwal, D., Muresan, S., & Wu, C.-S. (2024). Art or Artifice? Large Language Models and the False Promise of Creativity. *CHI '24*, Honolulu. ACM DOI: 10.1145/3613904.3642731 (from search result; not opened).
- **URLs:** arXiv: https://arxiv.org/abs/2309.14556 ; HTML: https://arxiv.org/html/2309.14556v3
- **Design:** Adapts the Torrance Tests of Creative Thinking (process) to evaluate the creative product (short fiction), using the Consensual Assessment Technique. The grouping is the original TTCT's four dimensions.
- **The 14 tests (question wording from the paper where captured):**
  - **Fluency (5):**
    - Narrative Pacing (wording not captured in my fetch)
    - Scene vs Exposition: "Does the story display awareness and insight into the balance between scene and summary/exposition?"
    - Language Proficiency & Literary Devices: "Does the story make sophisticated use of idiom or metaphor or literary allusion?"
    - Narrative Ending: "Does the end of the story feel natural and earned, as opposed to arbitrary or abrupt?"
    - Understandability & Coherence: "Do the different elements of the story work together to form a unified, engaging, and satisfying whole?"
  - **Flexibility (3):**
    - Perspective & Voice Flexibility: "Does the story provide diverse perspectives...?"
    - Emotional Flexibility: "Does the story achieve a good balance between interiority and exteriority...?"
    - Structural Flexibility: "Does the story contain turns that are both surprising and appropriate?"
  - **Originality (3):**
    - Originality in Theme and Content: "Will an average reader of this story obtain a unique and original idea from reading it?"
    - Originality in Thought: "Is the story an original piece of writing without any cliches?"
    - Originality in Form & Structure: "Does the story show originality in its form?"
  - **Elaboration (3):**
    - World Building and Setting: "Does the writer make the fictional world believable at the sensory level?"
    - Character Development: "Does each character... feel developed at the appropriate complexity level...?"
    - Rhetorical Complexity: "Does the story operate at multiple 'levels' of meaning (surface and subtext)?"
- **Scoring:** Each test is binary (yes/no). Total passes range from 0 to 14. Tests are designed to be additive, and no single test is mandatory. Experts also wrote a justification for each judgment.
- **Study:** 10 creative writers judged 48 stories: 12 each from GPT-3.5, GPT-4, Claude v1.3, and 12 professional New Yorker stories.
- **Reliability:** Per-test Fleiss kappa ranged from 0.27 to 0.66 (average 0.41). Aggregate pass counts correlated at Pearson 0.69 across raters.
- **Findings:**
  - New Yorker stories passed 84.7% of tests on average (about 11.9 of 14).
  - GPT-3.5 passed under 10%. GPT-4 and Claude v1.3 were near 30%. The authors summarize this as LLM stories passing "3-10X less" tests.
  - Selected pass rates (New Yorker / GPT-4 / Claude v1.3):
    - Narrative Ending: 91.7 / 19.4 / 33.3
    - Originality in Thought: 91.7 / 44.4 / 19.4
    - Literary Devices: 88.9 / 36.1 / 13.9
    - Originality in Theme & Content: 75.0 / 19.4 / 11.1
    - Perspective & Voice: 72.2 / 16.7 / 19.4
  - Human-written stories were ranked most preferred 89% of the time.
  - LLMs as assessors: none correlated positively with expert judgments on average. GPT-4 exceeded 0.2 on two tests, which the authors say is still not moderate agreement.
- **Limitations (authors' own):** The expert panel is narrow, with a possible "highbrow" Western literary bias. The test is not a universal creativity benchmark.

## 4. EQ-Bench Creative Writing v3

- **Status:** Not peer-reviewed. Self-published leaderboard by the EQ-Bench project.
- **URLs:** Leaderboard: https://eqbench.com/creative_writing.html ; method: https://eqbench.com/about.html#creative-writing-v3 ; code link given on that page: https://github.com/EQ-bench/creative-writing-bench (the repo itself was not opened).
- **Method:** 32 writing prompts, each run 3 times (96 items). Rubric scoring is done by a judge model (Claude Sonnet 4 per the page). Pairwise matchups are judged on several criteria, with the winner on each criterion getting up to five "+" marks. Scores are combined into Elo ratings using a Glicko-style system.
- **Pairwise criteria (as listed on the page):**
  - Character authenticity and insight
  - Interesting and original
  - Writing quality
  - Coherence in plot, character choices, metaphor
  - Instruction following
  - World and atmosphere
  - Avoids cliches in characters, dialogue & plot
  - Avoids flowery verbosity & show-offy vocab
  - Avoids gratuitous metaphor or poetic overload
- **Caveat:** The "Rubric criteria" list on the about page I opened belongs to the separate EQ-Bench 3 emotional-intelligence benchmark. I did not capture the absolute rubric items for Creative Writing v3.
- **Scoring:** Rubric score is absolute. Elo is relative, anchored so DeepSeek-R1 = 1500 and ministral-3b = 200. Separate Repetition and Slop metrics are reported.
- **Bias controls:** Outputs truncated at 4,000 characters, both orderings averaged for position bias. The page lists self-bias and slop bias as not controlled.
- **Findings on AI vs. human writers:** None measured. The page says prompts were chosen to be hard for models ("humour, romance, spatial awareness, unusual first-person perspectives") and that "things language models typically struggle to represent to the level of human writers." This is the author's claim, not a measured result.

## 5. WritingBench (Wu et al., 2025)

- **Citation:** Wu, Y., Mei, J., Yan, M., et al. (2025). WritingBench: A Comprehensive Benchmark for Generative Writing. arXiv:2503.05244 (v4, Nov 2025). Venue not verified.
- **URLs:** https://arxiv.org/abs/2503.05244 ; https://arxiv.org/html/2503.05244v4 ; GitHub: https://github.com/X-PLUG/WritingBench
- **Scope:** 1,000 queries across 6 primary domains and 100 subdomains. Includes a "Literature & Art" domain, but it covers general writing, not fiction only.
- **Criteria approach:** Each query is labeled with three core requirements: style, format, and length. The judge model generates five query-specific criteria per prompt, each with a description and five scoring bands. The critic model scores each criterion 1 to 10.
- **Validation:** Dynamic criteria reached 84% human alignment, against 67% and 58% for two static-criteria baselines.
- **Findings:** Length is the weakest requirement across models. Claude-3.7-thinking leads across domains.
- **Use in other work:** NstAgent (below) reuses WritingBench's criteria pipeline for writing quality.

## 6. LitBench (Fein et al., 2026)

- **Citation:** Fein, D., Russo, S., Xiang, V., Jolly, K., Rafailov, R., & Haber, N. (2026). LitBench: A Benchmark and Dataset for Reliable Evaluation of Creative Writing. *Proceedings of EACL 2026 (Long Papers)*, pp. 7740-7755. DOI: 10.18653/v1/2026.eacl-long.362
- **URLs:** https://aclanthology.org/2026.eacl-long.362/ ; arXiv: https://arxiv.org/abs/2507.00769
- **Design:** Pairwise human preferences built from r/WritingPrompts upvotes. Test set of 2,480 pairs, training set of 43,827 pairs. Pairs with small upvote gaps were dropped, and length bias was pruned (65.25% of chosen stories were originally longer).
- **Scoring:** Agreement with human preference in pairwise verdicts.
- **Findings:**
  - Best off-the-shelf judge (Claude-3.7-Sonnet): 73% agreement.
  - Trained Bradley-Terry and generative reward models: 78%.
  - Chain-of-thought reduced reward-model accuracy.
  - An online study with 46 crowdworkers on newly generated GPT-4.1 and GPT-4o stories found the trained models' rankings aligned with human preferences.
- **Criteria:** The benchmark does not define explicit story criteria. The judge prompts test several "criteria" templates, including a "Writer-ly Criteria" template. Explanation features that predicted judge accuracy were "inspired by creative writing pedagogy," and plot discussion was the strongest predictor.
- **Caveat:** The method assumes Reddit upvotes reflect human preference, which the authors acknowledge as a limitation. It does not compare AI with professional fiction directly.

## 7. Long-form and serialized fiction: consistency

I did not find a dedicated study of serialized web fiction (episode-based publication). The closest work is the following.

### 7a. ConStory-Bench (Li et al., 2026)

- **Citation:** Li, J., Guo, X., Wu, Y., Lee, R. K.-W., Li, H., & Xie, Y. (2026). Lost in Stories: Consistency Bugs in Long Story Generation by LLMs. *Findings of ACL 2026*, pp. 8400-8428. DOI: 10.18653/v1/2026.findings-acl.410
- **URLs:** https://aclanthology.org/2026.findings-acl.410/ ; arXiv: https://arxiv.org/abs/2603.05890
- **Scope:** 2,000 prompts across four task types (generation, continuation, and two others). Target length 8,000 to 10,000 words.
- **Taxonomy (five categories, 19 subtypes):**
  - Timeline & Plot Logic (includes causal-logic violations)
  - Characterization (includes memory contradictions)
  - World-building & Setting (includes core-rule violations)
  - Factual & Detail Consistency (includes appearance mismatches)
  - Narrative & Style (includes perspective confusions)
- **Scoring:** ConStory-Checker, an LLM-judge pipeline that quotes exact evidence for each contradiction. Reported as Consistency Error Density (CED), errors per 10K words, where lower is better.
- **Findings:**
  - GPT-5-Reasoning had the lowest CED (0.113). Gemini-2.5-Pro was 0.305. Claude-Sonnet-4.5 was 0.520.
  - Errors cluster in factual and temporal dimensions, tend to appear mid-narrative, and co-occur. Factual errors correlated most with characterization (r = 0.304) and world-building (r = 0.255).
- **Limitations (authors):** English only, Western narrative conventions. The benchmark measures consistency, not overall quality.
- **Caveat:** I did not confirm whether ConStory includes a human-written baseline.

### 7b. NstAgent: Scaling Long-Form Story Generation (Wan & Chen)

- **Citation:** Wan, Z., & Chen, J. Scaling Long-Form Story Generation via Narrative State Tracking. arXiv:2609.35759 (preprint; peer-review status not verified).
- **URL:** https://arxiv.org/html/2609.35759v1
- **Metrics:** Subtype CED and Instance CED (from ConStory, extended to 100K words with scope markers). Writing quality is the mean of five WritingBench criteria on a 1 to 10 scale.
- **Findings:** The method keeps consistency and writing quality roughly stable from 10K to 100K words, while the RollSum baseline degrades more.
- **Judge issues:** The judge shares a model family with one backbone. In a control test, 25% of control pairs were reported as contradictions, which the authors flag as a precision problem.

## 8. Reader-response scales from psychology

### 8a. Green & Brock (2000): Transportation Scale

- **Citation:** Green, M. C., & Brock, T. C. (2000). The role of transportation in the persuasiveness of public narratives. *Journal of Personality and Social Psychology*, 79(5), 701-721. DOI: 10.1037/0022-3514.79.5.701
- **URLs:** https://doi.org/10.1037/0022-3514.79.5.701 ; PubMed: https://pubmed.ncbi.nlm.nih.gov/11079236/ (PubMed fetch returned no content; abstract confirmed via the ResearchGate page; full scale confirmed from an author-hosted PDF)
- **Items:** 15 items, 7-point scale from "not at all" (1) to "very much" (7). Examples from the scale:
  - "While I was reading the narrative, I could easily picture the events in it taking place."
  - "I could picture myself in the scene of the events described in the narrative."
  - "I was mentally involved in the narrative while reading it."
  - "The narrative affected me emotionally."
  - "I wanted to learn how the narrative ended."
  - "I found myself thinking of ways the narrative could have turned out differently."
  - "The events in the narrative have changed my life."
  - Four character-imagery items, e.g. "I had a vivid image of [character name]."
- **Structure:** Original EFA gave three factors (cognitive, emotional-affective, visual imagery). Items 2, 6, 8, and 10 loaded on none.
- **Findings:** Higher transportation increased story-consistent beliefs and evaluations of protagonists. Highly transported readers noticed fewer "false notes" in a story.

### 8b. Busselle & Bilandzic (2009): Narrative Engagement Scale

- **Citation:** Busselle, R., & Bilandzic, H. (2009). Measuring Narrative Engagement. *Media Psychology*, 12(4). DOI: 10.1080/15213260903287259 (page numbers not verified)
- **URL:** https://www.tandfonline.com/doi/abs/10.1080/15213260903287259
- **Dimensions:** Narrative understanding, attentional focus, emotional engagement, and narrative presence.
- **Development:** Started with 40 items. EFA and CFA reduced them. The final model in Study 3 (N = 179) used 12 items, three per subscale. Item-level response format was not captured.
- **Item examples in the text:** "During the program, I lost track of time" (dropped in EFA), "I found my mind wandering while the program was on" (attentional focus).
- **Findings:** Engagement correlated with enjoyment (r = .76 and .53 across two stimuli) and with transportation. The authors argue emotional engagement is distinct from Green & Brock's emotional items.

### 8c. Transportation Scale-Short Form (Appel et al., preprint)

- **Citation:** Appel, M., Gnambs, T., Richter, T., & Green, M. C. The Transportation Scale-Short Form (TS-SF). Preprint PDF; journal version not verified.
- **URL:** https://www.mcm.uni-wuerzburg.de/fileadmin/06110300/user_upload/Publikationen/Appel-_Gnambs-_Richter-_-_Green_-_TS-SF_-_PREPRINT.pdf
- **Use:** Six-item short form that the authors recommend for new studies to avoid inconsistent item subsets.

## 9. Evidence on AI fiction vs. human writers beyond benchmarks

- **Doshi & Hauser (2024), *Science Advances*, 10, eadn5290.** DOI: 10.1126/sciadv.adn5290. URL: https://www.science.org/doi/10.1126/sciadv.adn5290
  - Design: 293 writers wrote 8-sentence stories. Some received 1 or 5 GPT-4 story ideas. 600 Prolific evaluators rated stories on 9-point scales.
  - Scales: Novelty index (novel, original, rare; alpha 0.92) and usefulness index (appropriate, feasible, publishable; alpha 0.89), plus "well written," "enjoyable," "boring," "plot twist."
  - Findings: Novelty rose 5.4% (one idea) and 8.1% (five ideas) over human-only writers. Usefulness rose 9.0% with five ideas. Stories were rated better written and more enjoyable. Gains were larger for less creative writers. AI-assisted stories were more similar to each other (cosine similarity), so collective diversity fell.
  - Caveat: These were general online writers, not professionals, and the AI contributed ideas, not whole stories.

## Where AI fiction falls short (synthesis)

1. **Overall craft vs. professionals:** TTCW shows large gaps on the New Yorker baseline. The biggest gaps are in narrative ending, originality in thought and theme, literary devices, and perspective and voice.
2. **Human-rated quality:** HANNA shows human stories beat even the best 2022 system on all six criteria, with the largest gaps in surprise and empathy, though this is an older generation of models.
3. **Consistency over length:** ConStory finds factual and temporal contradictions cluster mid-story. NstAgent shows a method can reduce these, but only with explicit state tracking.
4. **Diversity:** Doshi & Hauser find AI-assisted stories converge on similar content.
5. **Automated judges disagree with experts:** Chakrabarty found LLM assessors do not match expert TTCW judgments. Chhun 2024 found story-level agreement is weak, though system-level rankings are strong. This means LLM-judged benchmarks such as EQ-Bench are best used for ranking models, not for absolute quality claims.

## What I could not verify

- Full wording of TTCW's Narrative Pacing test.
- Absolute rubric items for EQ-Bench Creative Writing v3 (the list I opened belongs to EQ-Bench 3).
- Venue for WritingBench and status of NstAgent (arXiv preprints).
- Item-level wording and response format for Busselle & Bilandzic.
- Journal version of the TS-SF short form.
- Whether ConStory-Bench includes a human baseline.
- Any dedicated study of serialized web fiction, which my search did not surface.

