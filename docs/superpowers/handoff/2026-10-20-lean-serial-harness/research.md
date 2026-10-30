# Research for the lean serial harness design (2026-10-20)

Five Haiku agents drove the Aside browser. Reports are as returned; items marked unverified were not seen by the agent.

# oss: Open-source long-fiction writing harnesses

FINDINGS

1. LongWriter / AgentWrite (ICLR 2025)

- URL: https://github.com/THUDM/LongWriter (Apache-2.0, 1,879 stars, last commit 2025-06-24)
- Pipeline: plan.py turns the instruction into a step-by-step plan, one step per paragraph-level beat. write.py then writes each step in order from a template holding the instruction, the full plan, the text so far, and the current step. No critique or revise stage.
- Consistency: no separate bible. Continuity comes from feeding the accumulated text and the full plan into every call.
- Length: length is set by the number of plan steps.
- Note: the AgentWrite plan step uses GPT-4o. Training data is for the separate LongWriter models.

2. Re3 (Yang et al. 2022) and DOC (ACL 2023)

- Re3: https://arxiv.org/abs/2210.06774. Venue not on the arXiv page, so unknown.
- DOC: ACL 2023 long paper, https://arxiv.org/abs/2212.10077 (aclanthology 2023.acl-long.190).
- Pipeline (Re3): Plan (setting, characters, 3-point outline) -> Draft (recursive reprompting, passage by passage, with plan and story state in each prompt) -> Rewrite (generate about 10 candidates in one call and rerank for coherence and premise relevance) -> Edit (keep attribute-value dictionaries of character facts, use an entailment model to flag contradictions in new passages only, and fix them with an edit call).
- Pipeline (DOC): hierarchical outline (depth 3, branching 2-5) with per-node event filtering, then drafting under a controller that steers toward the current outline leaf. Dropped Re3's edit step.
- Length: Re3 uses a token budget of about 3,072 tokens. DOC averages about 3,500 words.
- Per-chapter call total: unknown.

3. DOME (NAACL 2025)

- URL: https://arxiv.org/abs/2412.13575 (aclanthology 2025.naacl-long.63)
- Pipeline: one rough outline, expanded in stages into detailed outline items, with outline and story parts generated alternately so the outline adapts to what is already written.
- Memory: each sentence is stored as a temporal knowledge-graph quadruple (triples plus chapter number). Retrieval is entity-based, followed by LLM filtering. A conflict analyzer reports a conflict rate (conflicting quadruples divided by total quadruples).
- Cost: the paper reports an average of 16 LLM calls for knowledge-graph construction with Llama3-70B.
- Length control: unknown.

4. Agents' Room (Google DeepMind, ICLR 2025)

- URL: https://arxiv.org/abs/2410.02603
- Pipeline: four planning agents in fixed order (conflict, character, setting, plot), then five writing agents (exposition, rising action, climax, falling action, resolution). A deterministic orchestrator sets the call order and all agents share one scratchpad.
- Cost: about 9 calls per story. This is my count from the roster, not a number the paper states.
- Consistency: a shared scratchpad with agent labels. No explicit contradiction checker was found.

5. RecurrentGPT

- URL: https://github.com/aiwaves-cn/RecurrentGPT (GPL-3.0, 999 stars, last push 2024-05-15; latest commit unknown)
- Pipeline: each step takes the previous paragraph and the previous plan, writes the next paragraph, writes a new short plan, and rewrites a short-term memory summary.
- Memory: long-term memory stores a summary of every paragraph on disk and retrieves them by semantic search. Constant-size context per step.

Also observed:

- AI_NovelGenerator: https://github.com/YILING0013/AI_NovelGenerator (AGPL-3.0, 6,301 stars, last push 2026-10-16). Pipeline: idea -> world -> volumes -> arcs -> scenes -> chapter plan -> prose, with a chapter-check workflow. Memory is a MongoDB project database that tracks changes to characters, relationships, items and world rules per chapter.
- MuMuAINovel: https://github.com/xiamuceer-j/MuMuAINovel (GPL-3.0, 3,207 stars). Wizard for outline, characters and worldview; chapter generation with a word-count limit; one-click rewrite from analysis; foreshadowing tracker.
- Long-Novel-GPT: https://github.com/MaoXiaoYuZ/Long-Novel-GPT (1,247 stars, license unknown). Outline -> chapter summaries -> body, expanding roughly 200-character beats to about 2K characters. Uses a plot summary updated after each revision.
- Dramatron: https://github.com/google-deepmind/dramatron (Apache-2.0, 1,133 stars, last commit 2024-07-16). Staged generation (log line, title, characters, places, storyline, scenes, dialogue), each stage regenerable by the author.
- WriteHERE (arXiv 2503.08275, https://github.com/principia-ai/WriteHERE): recursive DAG task planning with a scheduler. Venue unknown. Not a fixed outline.

FIT FOR DAEUMHWA

1. Per-beat generation with a per-beat word budget (LongWriter/Long-Novel-GPT). The author gets a fixed beat list they can edit, and each beat gets its own length target. This directly targets the "too short" weakness and gives the author one place to change direction. Each beat call sees the full beat plan and the text so far.

2. Candidate-and-rerank in one call (Re3's rewrite). Ask for several drafts in one response, then pick by a cheap rule (length fit, forbidden terms, fact matches). This adds quality without extra round-trips, which matters for light-model latency.

3. Fact dictionary plus entailment-style check on new text only (Re3's edit step and DOME's conflict rate). This matches the wiki model: check each new passage only against the wiki facts it touches, flag conflicts as author-facing proposals, and never let the AI write the wiki directly. Retrieval is entity-keyed, which keeps context small.

4. Rolling short-term summary plus per-chapter summaries retrieved by semantic search (RecurrentGPT). Keeps prompt size flat as the serial grows, which lowers cost per chapter. Summaries of chapters the author has saved can be reused as the continuity source.

5. Fixed structural roles for the chapter ending (Agents' Room's exposition-to-resolution roster). Give the writing step a role per beat, such as turn, climax or hook, so chapter endings get a required trigger rather than a generic close. Collapse the planning roster into one planning call to avoid Agents' Room's 9-call cost.

Caveat: none of these projects reports per-chapter cost against a quality score on a light model. The evidence is from papers and READMEs, not from measured results.

ASIDE FAILURES

- Discovery run (r1-discovery.log, Aside task covering all paper and repo candidates): the agent started but the log ended mid-plan, with no report. Exit 127.
- Repo run (r2-repos.log, first attempt): wrapped the call in `timeout`, which is not installed on this macOS machine. Exit 127. Rerun without `timeout` succeeded.
- Papers run (r3-papers.log): succeeded. Re3 venue and WriteHERE venue are unknown. Per-chapter call totals for DOC, DOME, WriteHERE and Re3 are unknown. DOME length target is unknown.
- Stars and dates come from the GitHub API as seen in the Aside report. Last commit date for AI_NovelGenerator, MuMuAINovel and RecurrentGPT is unknown (only last push was reported).

Scratchpad: /private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/research/r2-repos.log and /private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/research/r3-papers.log

# papers: Research on long story generation with small or cheap models

FINDINGS

Discovery and repo checks (Aside, 2026-10-20). Star counts and dates are snapshots.

- Re3 (EMNLP 2022), https://arxiv.org/abs/2210.06774. Plan, draft, rewrite, edit pipeline on GPT-3. Older baseline. Code: https://github.com/yangkevin2/emnlp22-re3-story-generation (257 stars, MIT, last commit 2022-12-21).
- DOC (ACL 2023), https://arxiv.org/abs/2212.10077. Detailed outline plus controller. Code: https://github.com/yangkevin2/doc-story-generation (161 stars, MIT, 2023-10-27).
- DOME (NAACL 2025), https://arxiv.org/abs/2412.13575. Dynamic hierarchical outline plus memory. Tested only on Qwen1.5-72B, Llama-3-70B and Yi-1.5-34B. Ent-2 12.29 vs 9.06 for direct prompting. Conflict rate 0.56 vs 0.66, and 4.52 without memory. Human ranking from 3 graduate students on 20 stories. Code: https://github.com/Qianyue-Wang1/NAACL-25-DOME-story-generation (4 stars, no license detected).
- Agents' Room (ICLR 2025), https://arxiv.org/abs/2410.02603. Multi-agent plan, then write. Gemini 1.5 Flash; Gemma2-9B-it tested with an LLM judge only. Zero-shot plan+write beat end-to-end 80.00% on the judge. Human pairwise preference favored the agents over baselines (figure values unverified). Judge vs human Spearman 0.62 by system. No generation code public; only the dataset repo, https://github.com/google-deepmind/tell_me_a_story.
- WriteHERE (EMNLP 2025), https://arxiv.org/abs/2503.08275. Recursive adaptive planning. GPT-4o, Claude-3.5-Sonnet and DeepSeek-R1 only. Strength score 2.14 vs 0.87 for Agents' Room on GPT-4o. No 7B to 9B model. Code: https://github.com/principia-ai/WriteHERE (976 stars, license not returned by the API).
- CogWriter (Findings of ACL 2025), https://arxiv.org/abs/2502.12568. Planner plus parallel generators plus monitor. Tested on Qwen-2.5-14B and Llama-3.3-70B. Llama-3.1-8B planning failed, with no numbers. Benchmark is rule-based (LongGenBench), with no quality judge. Code: https://github.com/KaiyangWan/CogWriter (14 stars, MIT).
- LongStory, https://arxiv.org/abs/2311.15208. BART/GPT-2 era. Coherence at 50 paragraphs is lowest for LongStory (63.67 vs 67.95). Weak evidence.
- LongWriter / AgentWrite (ICLR 2025), https://arxiv.org/abs/2408.07055. Plan, then paragraph-by-paragraph writing. Extends GPT-4o from about 2k to about 20k words. A 9B-class model was trained. Code: https://github.com/THUDM/LongWriter (1,879 stars, Apache-2.0).

Techniques for small models.

- Best-of-N and judges. LitBench, https://arxiv.org/abs/2507.00769 (ACL 2026). Best zero-shot judge is Claude-3.7-Sonnet at 73% agreement with humans. Trained 1B to 8B reward models reach 78%. Small zero-shot judges fail on creative writing. StoryRMB / StoryReward, https://arxiv.org/html/2605.04831v1 (ICLR 2026). An 8B reward model beats larger models. Best-of-16 win-rate numbers are unverified (figure only).
- Critique-and-revise. Self-Refine, https://arxiv.org/abs/2303.17651 (NeurIPS 2023), reports +5 to 40% absolute, but only on GPT-3.5 and GPT-4. SelFee (KAIST, 7B with forced revisions scores 101.4 vs 98.2 for 13B) is a general-prompt, fine-tuned result. No fiction-specific small-model numbers found.
- Length control. Countdown markers, https://arxiv.org/abs/2508.13805. Strict length compliance goes from under 30% to over 95% on GPT-4.1. Prompt-only, one-shot. Not tested on small models; not fiction-specific.
- Repetition. Antislop, https://arxiv.org/abs/2510.15061. Some stock names appear up to 85,513 times more often than in human text. Antislop sampler and FTPO suppress about 90% of slop with quality within 1%. Smallest model tested is 12B, and it needs logit access. Avoidance Decoding, https://arxiv.org/abs/2509.02170, reports about 30% less repetition across branches (model size unverified).
- Small models on creative writing. BART-large fine-tuned, https://arxiv.org/abs/2409.11547 (COLING 2025), scored 2.11 vs 1.85 for humans on short pieces. It lost on surprise (3% vs 15% for BART).
- Show-don't-tell and voice. No paper found that measures a technique for either. TTCW, https://arxiv.org/abs/2309.14556, is diagnostic only.

FIT FOR DAEUMHWA

Inference from the evidence, not a measured result on our models.

1. Beat-level plan with a trigger and an ending check, before prose. The plan-then-write gain is the most consistent result (Agents' Room, AgentWrite). Plan each scene with its emotional trigger and chapter-end hook in a single cheap call. This targets our measured weaknesses of emotion without a trigger, repeated beats and weak endings. It costs one short call. Caveat: Agents' Room's small-model evidence is judge-only.
2. Countdown length control inside the draft prompt, replacing the current draft-then-fix length loop where possible. The prompt-level effect is large (under 30% to over 95% on GPT-4.1). It is untested on light models, so run a short check on Haiku ko and Luna ko before relying on it.
3. Cheap slop and repetition guard in code. Detect stock names and repeated n-grams against the context pack and the author's own style sample, then regenerate only the offending paragraph. This is an adaptation of Antislop, and it avoids the logit access the paper needs.
4. Two-candidate selection only where it pays off, such as the chapter ending. A trained 8B reward model beat zero-shot API judges (StoryRMB, LitBench), but training one is outside our budget. A zero-shot judge is weak on creative writing, so do not rely on one for full best-of-N.
5. Skip for now: full Re3/DOME/WriteHERE hierarchies (too many calls, tested only on 70B-class or GPT-4o), and Self-Refine on small models (not shown to transfer). For voice, no paper gives a method. Use the author's style sample and a per-character speech profile in the context pack. This is my inference, not a finding.

ASIDE FAILURES

None. Three Aside tasks finished and wrote reports (logs in the scratchpad research folder, e.g. r1-discovery.log, r3-techniques.log, r4-numbers.log). The research folder also holds logs from other sessions (a1, a2, r1-edit-learning, r1-tools, r2-repos) that I did not use.

# intent: Following author intent with few instructions and little editing

FINDINGS

1. PRELUDE / CIPHER (NeurIPS 2024). arXiv https://arxiv.org/abs/2404.15269. The LLM infers a natural-language preference from each author edit, stores it with a context embedding, and retrieves the k nearest preferences into the prompt. No fine-tuning. Evaluated on summarization and email with a GPT-4 simulated user, not real authors. CIPHER had the lowest edit distance. Failure case seen in the excerpt: inferred preferences drift to generic text such as "concise and coherent storytelling."
   Code: https://github.com/gao-g/prelude, MIT, 46 stars, last push 2024-11-23. Research code.

2. "Can AI writing be salvaged?" CHI 2025. arXiv https://arxiv.org/abs/2409.14509, ACM DL 10.1145/3706598.3713559. 8,035 expert edits on literary fiction and creative nonfiction. Argues that edited > original is a more useful preference pair than binary accept/reject. Numbers not checked.

3. "Catch Me If You Can? Not Yet" EMNLP 2025 Findings. https://arxiv.org/abs/2509.14543. About 400 authors. 5-shot in-context examples move output closer to the author's style than zero-shot, but not faithfully. Suggests choosing exemplars carefully rather than at random. Code: https://github.com/jaaack-wang/llms-implicit-writing-styles-imitation, MIT, 6 stars, 2026-01-16 update.

4. Pearl (CustomNLP4U 2024). https://aclanthology.org/2024.customnlp4u-1.16. A retriever trained to pick the user's past documents as few-shot examples, calibrated to generation quality. No official repo found.

5. LaMP (ACL 2024). https://aclanthology.org/2024.acl-long.399. Personalization benchmark plus retrieval baselines (BM25, recency, per-user LoRA). Code: https://github.com/LaMP-Benchmark/LaMP, 210 stars, last push 2025-02-18, CC-BY-NC-SA, so non-commercial.

6. Preference Feature Preservation (Findings ACL 2025). https://aclanthology.org/2025.findings-acl.1034. Extracts explicit features such as "Style: Clarity, Tone: Formal" and places them in the system prompt. Not writing-specific.

7. Wordcraft (IUI 2022, not CHI). DOI 10.1145/3490099.3511105. 25 hobbyist writers. Users with a custom "use your own prompt" control made more requests (7.31 vs 4.35), accepted more suggestions, and kept ownership. Writers wanted free-form instructions, not only fixed buttons. No code found.

8. CoAuthor (CHI 2022). arXiv https://arxiv.org/abs/2201.06796. Code: https://github.com/minalee-research/coauthor-interface, MIT, 102 stars. Taking more AI text lowered writers' sense of ownership. Style and voice were not measured.

9. Dramatron (CHI 2023). arXiv https://arxiv.org/abs/2209.14958. Code: https://github.com/google-deepmind/dramatron, Apache-2.0, 1,133 stars, last push 2024-07-16. Hierarchical prompt chaining (title, characters, beats, locations, dialogue) gives editable pieces. With 15 professionals, output was called "formulaic." Judged from the abstract and README only.

10. Story-tool repos with memory or lorebook features (star counts from the GitHub API, features unverified): NovelClaw (https://github.com/iLearn-Lab/NovelClaw, MIT, 380, memory-first, pushed 2026-10-12); ai-novel-studio (MIT, 234, persistent character state); SillyTavern World Info lorebook (AGPL-3.0, 34,718, reference implementation for keyword-triggered entries).

11. Author complaints (sources with visible text only):

- Sudowrite feedback board, "Muse ignores outline, character bible and logic" (https://feedback.sudowrite.com/p/muse-ignores-outline-character-bible-and-logic): dropped outline beats, changed a character's gender, contradicted earlier chapters.
- Sudowrite feedback board, "Muse not following specific instructions" (https://feedback.sudowrite.com/p/muse-not-following-specific-instructions): unrelated prose added, so users delete about 90%.
- r/WritingWithAI 1ni81n8: distinct character voices flatten into generic "helpful" prose over a long draft.
- r/WritingWithAI 1sbsn8g: repeated words and phrases are hard to remove after they are written.
- r/WritingWithAI 1u6h7ww: purple prose and sensory overuse ("smell of ozone"); authors ban words in prompts.
- r/WritingWithAI 1dvnmix: a Story Bible revealed the mystery answer in nearly every paragraph (spoiler leak).
- Trustpilot via checkthat.ai (undated): chapter endings summarize like an essay; Royal Road forum says AI closes chapters with conclusive statements instead of letting the cliffhanger land.
- Korean Facebook post (kyeongeop.lim, undated): after a few episodes the co-writer forgets agreed settings and flow, even with a synopsis and character sheet.

12. Workarounds authors report: sample dialogue lines per character in a lorebook entry (NovelAI thread 1dgqqtl, Korean translation); one-sentence voice lines for anger, fear and hiding (Naver blog, snippet only); NovelCrafter guidance to keep codex descriptions short, put appearance in notes (the AI "latches onto vivid appearance details and repeats them"), avoid spoilers (the AI reads the full entry), and use progressions for changes (https://www.novelcrafter.com/help/docs/codex/guidelines-for-descriptions, 2026-03-19).

FIT FOR DAEUMHWA

1. Edit-to-rule memory (CIPHER pattern). After each author edit or request, make one small call that turns it into a short, specific rule (for example "no sensory list in the first line of a scene"), store it with the project, and inject the top-k relevant rules into the next draft. This gives "applied right away and kept applied" without fine-tuning, and the cost is one small call per edit. Risk: the PRELUDE paper shows rules drifting to generic statements, so the author must be able to view and edit them.

2. Explicit, author-owned rules file, not auto-generated style. Ownership studies (CoAuthor, Wordcraft) and the Dramatron feedback both say writers want control and find heavy AI text formulaic. Keep a short list of rules, banned phrases and per-character voice lines that the author edits. The AI proposes rule diffs; it does not silently change them. Feature-to-system-prompt (item 6) is the cheap way to make these persistent.

3. Exemplar selection from the author's own prose. Few-shot helps (5-shot beats zero-shot) but is not faithful. Pick 2 to 3 passages from the author's sample text by similarity to the scene's emotion and characters, not at random. This is cheap and fits the style-card design. Use a small voice-check guard on the output.

4. Guards that match the measured failures. Map the complaints to code checks that cost no extra model call: outline beat and character-gender consistency against the wiki; spoiler filter that excludes reveal-locked facts from the context pack until the chapter that reveals them; repeated n-gram and banned-phrase check; check that the last paragraph is not a summary sentence. Per-character voice lines (lorebook sample dialogue) directly target the "characters sound alike" weakness.

5. Keep the wiki entries short and spoiler-aware, following NovelCrafter's guidance. Shorter entries are cheaper per chapter for light models and reduce the vivid-detail repetition the complaints describe.

ASIDE FAILURES

None. Four Aside tasks ran to completion (edit-learning papers, author complaints, co-writing studies, and a first run that finished with no console output but a full log). Reddit r/NovelAI English threads, velog, GeekNews and Naver blog bodies were not reachable; their content above is snippet-only or unverified. Reddit dates are mostly absent. Vendor claims (Sudowrite ~60% editing time, NovelCrafter BYOK price) are unverified.

# cost: Cost and latency engineering for light cloud LLMs

FINDINGS

1. Anthropic pricing, Claude Haiku 5.5 (per MTok, as extracted by Aside from https://docs.anthropic.com/en/docs/about-claude/pricing; read through a fetch tool, not raw HTML)
   - Prompts up to 100k tokens: input $0.10, output $0.50, 5m cache write $0.125, 1h cache write $0.20, cache read $0.01.
   - Prompts over 100k tokens: input $0.50, output $2.50, 5m cache write $0.625, 1h cache write $1, cache read $0.05.
   - Batch (50% off, stated on the page): up to 100k, input $0.05 and output $0.25; over 100k, input $0.25 and output $1.25.
   - Batch cache-write and cache-read prices for Haiku 5.5: unknown.

2. Anthropic prompt caching (https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
   - Technique: `cache_control` on content blocks (explicit breakpoints) or a top-level field (automatic caching). Breakpoints are free. You pay only for cache writes, cache reads and regular input.
   - Minimum cacheable prompt for Haiku 5.5: 512 tokens. Shorter prompts are processed without caching and no error is returned.
   - Default TTL is 5 minutes, refreshed free on each use. `"ttl": "1h"` is opt-in at 2x base input. A 1h entry must come before 5m entries.
   - Lookback window: 20 blocks.

3. OpenAI pricing (https://developers.openai.com/api/docs/pricing, Standard tier, short-context column, USD per 1M, input / cached input / output)
   - gpt-5.4-mini $0.75 / $0.075 / $4.50
   - gpt-5.4-nano $0.20 / $0.02 / $1.25
   - gpt-5-mini $0.25 / $0.025 / $2.00
   - gpt-5-nano $0.05 / $0.005 / $0.40
   - gpt-4.1-mini $0.40 / $0.10 / $1.60
   - gpt-4.1-nano $0.10 / $0.025 / $0.40
   - gpt-4o-mini $0.15 / $0.075 / $0.60
   - gpt-6-luna $0.10 / $0.01 / $0.50 (cache write $0.125; long context $0.20 / $0.02 / $0.75)
   - gpt-5.6-luna $0.20 / $0.02 / $1.20 (cache write $0.25; long context $0.40 / $0.04 / $1.80)
   - Batch tab is about 50% of Standard for the rows checked. Batch cached-input prices are missing for gpt-4.1-mini, gpt-4.1-nano and gpt-4o-mini. Whether batch and cache discounts stack: unknown.

4. OpenAI prompt caching (https://developers.openai.com/api/docs/guides/prompt-caching)
   - Cached input is "discounted up to 95%". On GPT-5.6 and later, reads cost 0.1x and writes 1.25x, with minimum 1,024 visible input tokens. TTL is `prompt_cache_options.ttl` = "30m", refreshed on reuse.
   - Earlier models use `prompt_cache_retention`: "in_memory" or "24h". 24h is not listed for the mini/nano models.
   - Minimum length for mini/nano: unknown.

5. FrugalGPT, arXiv 2305.05176 (2023). LLM cascade that learns which model to query per input. Abstract claims matching GPT-4 performance at up to 98% cost reduction. Venue beyond arXiv: unverified.

6. RouteLLM, arXiv 2406.18665 (2024). Learned router trained on preference data. Abstract claims over 2x cost reduction in some cases without quality loss. Repo https://github.com/lm-sys/RouteLLM: 5,619 stars, Apache-2.0, last commit 2024-08-10. The repo looks unmaintained since then.

7. LLMLingua, arXiv 2310.05736 (EMNLP 2023). Prompt compression with up to 20x claimed. LLMLingua-2, arXiv 2403.12968 (Findings of ACL 2024). Claims 3x to 6x faster compression and 1.6x to 2.9x end-to-end latency gain at 2x to 5x compression. Repo https://github.com/microsoft/LLMLingua: 6,760 stars, MIT, last commit 2026-09-10. These are the papers' own numbers, not independent results. Compression of story-bible facts risks dropping names and numbers, so it needs checking.

8. Story planning and consistency
   - Re3, arXiv 2210.06774 (EMNLP 2022). Outline, recursive drafting, then a consistency edit. Abstract: +14% coherent plots and +20% premise relevance vs direct writing. Official code https://github.com/yangkevin2/emnlp22-re3-story-generation (257 stars, MIT, last push 2022-12-21).
   - DOC, arXiv 2212.10077 (ACL 2023). Detailed outline with a controller. Abstract: +22.5% plot coherence and +28.2% outline relevance vs Re3, by human eval.
   - DOME, arXiv 2412.13575 (NAACL 2025). Dynamic outline with temporal knowledge-graph memory. No numbers in the abstract.
   - ConStory-Bench and ConStory-Checker, arXiv 2603.05890 (Mar 2026). Checker recall 55% (550 of 1,000 injected errors) vs 17.1% for human experts. Checker model size is unverified.
   - Retrieval vs full story-bible context: no direct head-to-head found (unknown).
   - Open-source references: https://github.com/Xiaoyangy/novel-studio (Apache-2.0, 144 stars, pushed 2026-09-23; RAG memory, checkpoint recovery). https://github.com/YfengJ/novel-studio-ai (6 stars, no license listed; accepted chapters only write to memory, and continuity checks combine LLM output with hard rules).

Not researched: effort/thinking budget effects on prose quality, and structured-output reliability for light models. These were not in the Aside tasks run.

FIT FOR DAEUMHWA

1. Prompt caching on a stable prefix. Put the style cards, character voice notes and fixed rules in a cached block ahead of the per-chapter wiki slice. Haiku 5.5 cache reads cost $0.01 vs $0.10 uncached, and the 512-token minimum is easy to meet. This cuts input cost on the many calls per chapter (draft, beats, guards, checks). Keep the 5m TTL in mind: a writing session with pauses longer than 5 minutes loses the cache, so a 1h TTL may pay off.

2. Batch for non-interactive work. Continuity checks, fact extraction after save, and reader simulation can run at 50% off on batch. Keep the drafting call interactive, since the author waits on it.

3. Cheap planner, main-model prose. Use a cheap model (for example gpt-6-luna at $0.10 / $0.50, or Haiku 5.5 at $0.10 / $0.50) for scene beats, emotional-trigger checks and length plans. Send only the prose call to the stronger model. This targets the measured weaknesses (no trigger, repeated beats, weak endings) at low cost. Cascade or routing papers support the idea, but the gains are abstract-level claims.

4. Outline-first generation (Re3 / DOC pattern). Plan beats with explicit trigger and ending requirements before drafting. Re3 and DOC report gains in coherence and outline adherence, which is the same failure family as chapter-length misses and emotional change without a cause.

5. Checker on fact extraction, not on prose. ConStory shows that a checker finds more injected errors than humans do (recall 55% vs 17%), but the numbers are for injected errors and the model is unknown. Use a checker as a pre-save warning and keep the author as final approver, as the spec requires.

Compression (LLMLingua) is lower priority. It could cut the context pack, but it may drop the names and numbers that continuity checks need.

ASIDE FAILURES

None. Four Aside tasks ran and each returned a report between the markers. The Anthropic and OpenAI pricing pages were read through Aside's page extraction, so the numbers are as extracted, not checked against raw HTML. The routing and compression task was not separately re-run for the Korean and Chinese sources the brief allowed. Final result logs are in /private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/research/a1-anthropic-pricing.log, a2-openai-pricing.log, a3-routing-compression.log and a4-story-planning.log.

# products: How commercial AI fiction tools structure the workflow

FINDINGS

1. **Sudowrite** (https://docs.sudowrite.com; pricing https://www.sudowrite.com/pricing)
   - Author provides once: a Story Bible with Genre, Style, Synopsis, Characters, Worldbuilding and Outline. Any field can be typed or generated, and Rewrite takes a revision instruction.
   - Per chapter: an Outline, then numbered Scenes, then Draft. Draft has an "Extra Instructions" field that is not persistent across chapters.
   - Reapplication: Write and Draft pull up to 20,000 words from the current and up to 25 linked prior documents. On overflow it drops items in this order: Worldbuilding, Characters, previous chapter text, linked outline summary, Genre, Key Details, Tone, Style.
   - Length: no word-count control. Length follows the scene count.
   - Style: "Match My Style" fills the Style field from a writing sample.
   - Pricing: credits, about $10, $22 and $44 per month. Docs example: 200 words cost about 70 credits on a small model and over 8,000 on a large one. Credits are not per word.

2. **NovelCrafter** (https://www.novelcrafter.com/features/codex; https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting)
   - Author provides once: a Codex with auto-detected names and aliases, plus time-stamped Progressions.
   - Each entry has a tracking mode: Always Include, Include when detected, Don't include when detected, or Never include. Context is assembled in a fixed order: mentions in the beat, then manual references, POV entry, global entries, child entries.
   - Per chapter: a natural-language scene beat. Scene summaries of about 80 words are reused as context.
   - Reusable prompt components via `{include("...")}`. Prompt Preview shows the exact text sent.
   - Pricing: $4 to $20 per month. No AI included; the author pays their own provider.

3. **NovelAI** (https://docs.novelai.net/en/text/lorebook/; storysettings page)
   - Lorebook entries fire on keywords within a search range of up to 10,000 characters, with a token budget and insertion order.
   - Memory sits at the top of context. Author's Note sits near the latest text and has the strongest effect on the next output.
   - No per-chapter object. Chapter direction is typed by hand.
   - Pricing: flat monthly, unlimited text (per the earlier research task).

4. **Typetak / 타입탁** (https://www.typetak.com/ko; https://typetak.com/ko/guide/outline-drafting; https://typetak.com/ko/pricing)
   - Author sets up a 월드 (characters, places, factions, relationships). The agent can build it from conversation or import manuscripts. Style is set per manuscript.
   - Per chapter: "다음 화" produces a 초고 계획 card with outline items and a 분량 (length) target. The author edits the card, then presses 그대로 쓰기 and a drafting sub-agent writes. The author can force a node with "라온 노드 참고".
   - Length is "as close as possible", not guaranteed.
   - Pricing conflict: the pricing page says Pro $9 and Max $29 per month, while the landing page says paid plans start at "$12/월". Unresolved.

5. **Webnovel AI** (https://webnovelai.io/ko; https://webnovelai.io/ko/pricing)
   - Author sets a concept, world sheets, character sheets, pacing and a chapter-by-chapter outline with an optional word target. Then a style preset and POV.
   - Pricing: no subscription. Credit packs of $50 to $500. Standard generation costs 1 credit, advanced 2, premium 3. Failed generations are not refunded.

6. **Wrtn / 뤼튼 Crack story** (https://help.crack.wrtn.ai/guide/user/tutorial/story/1): a character chat platform, not a chapter manuscript tool. Setup is a profile, story info, example dialogues and a keyword book. It has no chapter plan. Length control is unknown.

7. **Squibler** (https://www.squibler.io/pricing/): generates a full book from a concept, organized into chapters and scenes. Plus is about $16 to $30 per month. Credit cost per action is unknown.

8. **Jasper**: no fiction feature found on official pages. Unverified as a fiction tool.

9. **Research papers and repos**
   - Re3 (EMNLP 2022, https://arxiv.org/abs/2210.06774): plan first, then recursive reprompting with plan and story-state context, reranking for coherence, then an edit pass for factual consistency. Several calls per passage.
   - DOC (ACL 2023, https://arxiv.org/abs/2212.10077): hierarchical detailed outline, then a controller steers each passage toward outline details.
   - LongWriter (arXiv 2408.07055): AgentWrite plans and writes section by section to reach 10k+ words. The length angle is a fine-tune, which does not apply to a gateway model.
   - doc-story-generation (https://github.com/yangkevin2/doc-story-generation): MIT, 161 stars, last push 2023-10-27. Old stack, needs large models.
   - novel-studio-ai (https://github.com/YfengJ/novel-studio-ai): 6 stars, last commit 2026-06-30. Story bible, outline, character state, graph facts, a context pack before drafting, and a separate continuity check. Accepted chapters only update canon. License not found, so do not copy code.
   - NovelForge (https://github.com/xiehuanyi/NovelForge): 2 stars, last commit 2026-04-03, MIT per README (LICENSE not confirmed). Multi-agent with a 3-layer memory. Its 1M-word claim is self-reported.

FIT FOR DAEUMHWA

1. **Tiered wiki injection with a drop order (NovelCrafter tracking modes plus Sudowrite's overflow order).** Each entry gets Always, When detected, or Never. The pack has a fixed priority order, and the lowest-priority items drop first. This keeps the context small, which suits a cheap light model. Persistent rules and style go in "Always", so they are never dropped.

2. **Persistent author directives as a short always-on note (NovelAI Author's Note, NovelCrafter prompt components).** A request like "keep the tone dry" becomes a stored directive that every later draft applies. This directly addresses the goal that requests are applied right away and keep being applied. Sudowrite's per-run "Extra Instructions" is the failure mode to avoid.

3. **A plan card before one draft call (Typetak 초고 계획 card, Sudowrite Scenes).** The author edits a short list of beats with a length target. The system then runs one draft call per chapter. Beat count and target length are what fix the length misses. It also gives the author a cheap place to fix direction before paying for prose.

4. **Rolling chapter summaries as memory (NovelCrafter scene summary, Re3 state, DOC outline).** Store an approximately 80-word summary per accepted chapter and feed these in place of full prior text. This is cheaper than Sudowrite's 20,000-word window and reduces setting drift and repeated beats.

5. **One plan call, one draft, one check (DOC/Re3 shape without reranking).** Re3's rerank-and-edit loop costs several calls per passage, which conflicts with the cost goal. Take the outline-first and summary-memory parts and skip the reranking.

ASIDE FAILURES

- None of the three Aside runs timed out or errored. Run logs are in /private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/research/r1-tools.log, r2-korean.log and r3-papers.log.
- Gaps: the iwritenovel official page returned empty, OpenNovel's profile failed to load, the Wrtn subscription page returned 404, and the GitHub stats came from rendered pages because the API was rate-limited.
- Not verified: Pensiv and Novela pricing, Korean GeekNews and velog coverage (no relevant posts surfaced), Squibler's consistency mechanism, and the LongWriter length prompts.
