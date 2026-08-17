# RecallForge Exam-Specialization Pipeline

## What this changes
RecallForge now treats each exam as an **exam pack** rather than pretending one generic prompt can represent every assessment system.

Each pack defines the current version, official source URLs, required calibration metadata, question archetypes, difficulty model, marking model, grounding policy and minimum number of verified items before high-stakes adaptive generation is enabled.

## Why this is not a fake "trained on everything" claim
A model is not legitimately trained for all exams simply by giving it a long system prompt. Real specialization needs current specifications, authorized/licensed examples where required, mark schemes/rubrics, examiner guidance, benchmark data and independent evaluation. Copyrighted papers should only be ingested when use is authorized.

OpenAI's current platform supports tailoring models with fine-tuning, evals and distillation, but the correct production approach is to combine specialization data with retrieval/grounding and evaluation rather than blindly fine-tuning on mixed exam content. See the official platform overview. 

## Production loop
1. Import current official/public-domain/licensed specifications and examples.
2. Normalize every item into the calibration schema.
3. Human-review the rubric/answer/provenance.
4. Build exam-specific benchmark sets.
5. Generate synthetic training items only from verified calibration anchors.
6. Run adversarial item verification.
7. Run independent marker evaluations.
8. Freeze a validation set that the generator never sees.
9. Only unlock adaptive exam mode when minimum verified calibration thresholds are met.
10. Continuously re-evaluate when the exam provider changes the specification.

## Fine-tuning
The repository includes `scripts/build-exam-dataset.ts` to export **only verified records** into JSONL suitable for a model-tuning workflow. Do not upload copyrighted materials unless the project has authorization to use them.
