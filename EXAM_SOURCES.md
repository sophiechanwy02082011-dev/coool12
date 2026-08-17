# Exam source map

RecallForge does not bundle copyrighted exam papers. Instead, each exam pack points at the current official source maintained by its assessment provider. The ingestion pipeline should import only materials the project is authorized to use, and every calibration item records provenance and authorization.

## Current official anchors

- HKDSE — HKEAA assessment frameworks and written-paper marking procedure.
- AP — College Board AP Central released questions/scoring guidance.
- IB Diploma — IBO sample/past examination paper hub.
- SAT — College Board Student Question Bank.
- TOEFL iBT — ETS current content/structure (date-aware because the format changed on 21 January 2026).
- IELTS Academic — IELTS task format and band descriptors.
- ACT — ACT current section structure and writing domains.
- Cambridge International A Level — Cambridge current qualification/syllabus pages.

The system must refresh these anchors when the provider changes its specification, and it must lock high-stakes adaptive generation when calibration is stale.
