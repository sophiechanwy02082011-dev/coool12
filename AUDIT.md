# RecallForge production feature audit

## Implemented in this build

- Google OAuth authorization-code flow with server-side identity verification and encrypted Google refresh-token storage.
- Persistent PostgreSQL data model for profiles, materials, chunks, plans, tasks, questions, attempts, mastery, cards, reviews, mock exams, diagnostics, games and jobs.
- Exam-year aware profiles. HKDSE supports 2026–2029 profile selection so the application does not silently mix assessment frameworks across years.
- Exam profiles for HKDSE, AP, IB Diploma, SAT, TOEFL iBT, Cambridge International A Level, ACT, IELTS Academic, university/custom exams.
- Material ingestion: PDF, DOCX, XLSX/CSV, PPTX, plain text, JSON, images, YouTube transcript, web text, Google Docs and Google Sheets.
- File ownership enforcement: all profile-scoped endpoints verify that the authenticated user owns the profile/resource.
- Day-by-day plan generation followed by a second-pass adversarial schedule audit.
- Plan confirmation and persistent task completion.
- Easy / medium / hard / adaptive practice routing.
- Verified question generation with provenance and rubric metadata.
- Two independent grading passes plus chief-examiner adjudication for constructed responses.
- Deterministic MCQ scoring from the verified answer key; AI is not allowed to override the key.
- Flashcards using a DSR/FSRS-style memory state of difficulty, stability and retrievability.
- Diagnostic quiz generation and weak-area routing.
- Mock exam generation, timed execution state, answer persistence, hidden marking during the mock, and post-submission review.
- Retrieval games: classification, error hunt, sequence, two-truths-one-false, rapid choice.
- Tutor with misconception diagnosis, retrieval and transfer questions.
- Micro-lesson video storyboard/script generation.
- Focus timer with closed-book retrieval reminder.
- Analytics for skill-level accuracy, attempts, reviews and retrievability.
- Adaptive priority toward weak and uncertain skills while retaining mixed practice.

## High-stakes safeguards

The model is instructed to be conservative: it must not invent syllabus facts, marking rules or source claims; it must explicitly surface uncertainty; and it must not pretend generated questions are official past-paper questions.

Strict marking means criterion-based marking, not arbitrary harshness. A legitimate alternate answer should be credited when the rubric supports it; unsupported claims, wrong units/signs/notation, missing reasoning, contradictory statements and command-word failures are penalized when they affect the criterion.

Mock exams suppress item-level grading until submission so the student experiences a real test rather than receiving feedback after every question.

## Remaining production prerequisites

The application now self-initializes the PostgreSQL schema on startup and includes a local source/UI self-audit. The Docker image uses `npm install` because this source package intentionally does not ship a generated lockfile.

This source package still requires a real deployment environment, credentials, database instance, automated end-to-end tests, observability, backups, rate limiting, a content-rights review for any externally licensed exam materials, and human examiner validation before it should be marketed as a high-stakes replacement for qualified teachers or official practice resources.
