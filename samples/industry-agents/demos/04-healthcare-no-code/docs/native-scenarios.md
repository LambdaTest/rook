# This edition's native scenario pack

There are 18 authored scenarios in [rook/scenarios](../rook/scenarios/), with the same definitions in the portable [.testmuai/rook](../.testmuai/rook/) template. Authored scenarios and retained generated drafts are inputs, not execution verdicts. The [pack provenance](../rook/provenance.json) records their origin and hashes.

| Class | Category | Scenario |
|---|---|---|
| functional | happy_path | SC-101 |
| functional | negative | SC-102 |
| functional | boundary | SC-103 |
| functional | integration | SC-104 |
| functional | state_context | SC-105 |
| non_functional | performance | SC-106 |
| non_functional | token_economy | SC-107 |
| non_functional | reliability | SC-108 |
| non_functional | quality | SC-109 |
| adversarial | prompt_injection | SC-110 |
| adversarial | jailbreak | SC-111 |
| adversarial | data_exfiltration | SC-112 |
| adversarial | pii_leakage | SC-113 |
| adversarial | harmful_content | SC-114 |
| adversarial | hallucination | SC-115 |
| adversarial | hijacking | SC-116 |
| adversarial | policy_violation | SC-117 |
| adversarial | technical_injection | SC-118 |

Use npm run rook:setup and npm run rook after selecting your project, or use [headless CI](native-ci.md). Review generated cases against PRD.md. Keep fault profiles and customer turns aligned with the scenario; missing model usage remains Unable to Verify. See [interactive steps](testing-with-rook.md).
