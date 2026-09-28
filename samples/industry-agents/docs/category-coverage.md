# All 18 issue categories

Every demo directory contains one acceptance probe per category: 72 distinct domain probes, provided through eight style-specific packs for 144 entries. Running both variants produces 288 scenario/variant results; performance, token economy and reliability use three fresh-session samples each. Multi-turn probes retain the same session inside each sample.

The taxonomy follows the [Rook scenario guide](https://www.testmuai.com/support/docs/agent-assurance-scenarios/). A probe may be a passing control; coverage does not mean every scenario is a discovered vulnerability.

| Class | Category | Banking | Healthcare | Insurance | Customer support |
|---|---|---|---|---|---|
| Functional | happy_path | USD 200 transfer | Available appointment | USD 1500 settlement | Eligible refund |
| Functional | negative | Negative transfer | Unknown patient | Unknown claim | Unknown order |
| Functional | boundary | Exact USD 1000 limit | Zero-capacity slot | Exact USD 2500 settlement | Day 30 return |
| Functional | integration | Unavailable ledger | Unavailable scheduler | Unavailable payment provider | Payment failure disguised as success |
| Functional | state_context | Same account follow-up | Same patient follow-up | Settle the same claim | Same order refund |
| Non-functional | performance | Slow banking tool | Slow scheduler | Slow claims tool | Slow payment tool |
| Non-functional | token_economy | Cost per transfer | Cost per booking | Cost per settlement | Cost per refund |
| Non-functional | reliability | Correct balance after transfer | Repeated booking | Duplicate settlement prevention | Repeated refund |
| Non-functional | quality | Concise receipt | Concise booking | Concise settlement | Concise refund |
| Adversarial | prompt_injection | Poisoned customer note | Imported care note | Untrusted adjuster note | Supplier policy note |
| Adversarial | jailbreak | Role-play approval | Role-play routine booking despite urgency | Role-play document override | Role-play return override |
| Adversarial | data_exfiltration | External statement export | External record export | External claim export | External order export |
| Adversarial | pii_leakage | Other account email | Other patient email | Other policyholder email | Other buyer email |
| Adversarial | harmful_content | Abusive response request | Abusive response request | Abusive response request | Abusive response request |
| Adversarial | hallucination | Invented lifetime benefit | Invented lifetime benefit | Invented lifetime benefit | Invented lifetime benefit |
| Adversarial | hijacking | Off-role marker | Off-role marker | Off-role marker | Off-role marker |
| Adversarial | policy_violation | Transfer above approval cap | Urgent request without human handoff | Settlement without documents | Day 31 return |
| Adversarial | technical_injection | Transaction query boundary | Patient-query boundary | Claim-query boundary | Order-query boundary |

## Reproduction and evidence

Each JSON probe stores its exact goals, fault fixture, customer impact and observable assertions. PRD.md contains the same contract in natural language for Rook discovery. Code and QE packs have independent demo IDs and stores but share domain behavior, enabling an honest comparison between workflows.

`npm run rehearse` records each request, response, tool argument/result, trace hierarchy, duration, effect and local assertion. The scope is explicitly `fixture`. It never writes or impersonates a native Rook report.

Expected remaining limitations in the hardened fixture suite are the deliberately injected slow-tool failures and unobserved model token usage. Hardening corrects the documented business-tool checks; it does not remove an injected dependency delay or add a model to fixture execution.

For live model runs, review the criteria with Rook. Literal string checks alone cannot judge whether the model affirmed or refused a hallucinated claim. Retain Unable to Verify for missing evidence, and add domain-specific semantic criteria to the generated native scenarios.

## Native Rook inventory

Each demo now also contains 18 reviewed native YAML cases in `rook/scenarios/`, with all three classes and all categories above. The total is 144, authored from the acceptance contracts; 64 raw Rook-generated drafts remain separately reviewable. See [per-demo counts, IDs and origins](native-scenarios.md). Each pack is validated for category coverage and current feature references; execution evidence is recorded separately. Token-economy cases require live usage and are gated by fixture profiles.
