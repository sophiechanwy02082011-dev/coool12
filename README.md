# RecallForge — production-oriented adaptive exam study system

This is the production-oriented version of RecallForge. It is a server-backed application, not a browser-only demo.

## Main flow

1. Student signs in with Google.
2. Student selects an exam system, examination year, subject, test date, target grade/intensity, and daily study time.
3. Student uploads/imports as much source material as the configured storage allows.
4. The server extracts/chunks the material.
5. The AI produces a day-by-day plan and runs a second-pass feasibility/coverage audit.
6. Student confirms the plan.
7. The app provides adaptive practice, flashcards, diagnostics, mock exams, games, tutor, micro-lessons, focus timer, task tracking and analytics.
8. Mistakes update mastery and create future weak-skill retrieval pressure.

## Strict grading architecture

Generated constructed-response items are checked before delivery. Answers are then graded by Marker A and Marker B independently, followed by a chief-examiner adjudicator. MCQs are scored deterministically against the verified item key.

The system is intentionally strict but not arbitrary: it follows the supplied rubric, awards partial credit only where criteria are satisfied, and reports exact reasons for lost marks.

## Durable-memory architecture

The scheduler tracks difficulty, stability, retrievability and review history. Reviews are not fixed `1/3/7/14` intervals. The application combines scheduled retrieval with cumulative testing, interleaving, error-driven retesting and mixed difficulty.

## Current exam-source approach

HKDSE is examination-year aware. The profile links current HKEAA assessment-framework and examination-resource pages. AP, IB, SAT, TOEFL, A Level, ACT and IELTS profiles likewise reference their current official assessment resources.

The application must not call generated material "official". For the strongest calibration, supply authorized past-paper/example material and marking guides in the student's material vault or a separately licensed institutional source repository.

## Setup

Copy `.env.example` to `.env` and provide:

- `DATABASE_URL`
- `SESSION_SECRET` (at least 32 characters)
- `ENCRYPTION_KEY` (64 hex characters)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- storage configuration if using object storage

Then run:

```bash
npm install
npm run build
npm start
```

Apply `db/schema.sql` to PostgreSQL before starting the server.

## Important

The code is intentionally not presented as a guarantee that a student will pass any exam. Before high-stakes use, deploy with backups, monitoring, rate limits, benchmark datasets and human marking validation.


## High-stakes readiness boundary
AI-generated questions are marked `ai_verified` after adversarial verification but are not treated as independently exam-calibrated. Only `calibration_verified` benchmark items may enter the fine-tuning/evaluation dataset or satisfy the exam calibration readiness gate. Mock exams remain training mocks unless calibrated benchmark evidence has been loaded.
