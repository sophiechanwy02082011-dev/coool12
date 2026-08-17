# RecallForge evidence and calibration notes

## Learning science

- Retrieval practice: McDermott's 2021 Annual Review concludes that practicing retrieval shortly after learning slows forgetting and shows benefits across material types, learner ages/abilities and test types.
  https://pubmed.ncbi.nlm.nih.gov/33006925/
- Applied-school evidence: Agarwal, Nunes & Blunt's 2021 systematic review found retrieval practice consistently benefits student learning in real classroom/school settings.
  https://doi.org/10.1007/s10648-021-09595-9
- Learning-technique review: Dunlosky et al. rated practice testing and distributed practice as high-utility techniques; interleaving/self-explanation/elaborative interrogation were promising but had more limited evidence.
  https://pubmed.ncbi.nlm.nih.gov/26173288/
- FSRS/modern scheduling: Anki's current documentation describes desired retention and state variables involving difficulty, stability and retrievability. It cautions that pushing desired retention very high can sharply increase workload.
  https://docs.ankiweb.net/deck-options

The product therefore uses: initial encoding from source material -> early retrieval -> spaced retrieval -> interleaving -> cumulative mixed tests -> error-driven re-testing. It does not promise permanent memory because that would be scientifically indefensible.

## Exam-source calibration

### HKDSE
HKEAA publishes subject examination reports, question papers, marking schemes and comments on candidate performance. HKEAA also explains that marking schemes are guides to award marks, not single model answers, and that relevant, logically presented answers outside the scheme may still score.
https://www.hkeaa.edu.hk/en/Resources/publications/list_of_publications/hkdse_erqp_pub/
https://www.hkeaa.edu.hk/en/HKDSE/assessment/marking/marking_procedure_for_written_papers/

### AP
College Board publishes released questions with scoring guidelines, sample responses and score distributions for recent exams. Its score-setting process uses evidence-based standard setting and performance data; AP scores can combine MCQ and free-response/project components depending on course.
https://apcentral.collegeboard.org/courses/exam-dates
https://apcentral.collegeboard.org/courses/ap-precalculus/exam/past-exam-questions
https://apcentral.collegeboard.org/courses/how-ap-develops-courses-and-exams/score-setting-and-scoring

### IB Diploma
IB publishes official sample/specimen examination papers and mark schemes and describes assessment as subject-specific, with external examinations plus internal assessment components depending on the subject.
https://www.ibo.org/programmes/diploma-programme/assessment-and-exams/
https://www.ibo.org/programmes/diploma-programme/assessment-and-exams/sample-exam-papers/

### SAT
College Board's Student Question Bank contains thousands of official practice questions and filters by assessment, test section, domain, skill and difficulty level. That is a particularly useful calibration signal for an AI item generator.
https://satsuite.collegeboard.org/practice/student-question-bank

### TOEFL iBT
ETS's current page distinguishes test dates before and after January 21, 2026. For current tests, the updated TOEFL iBT is adaptive and uses Reading, Listening, Writing and Speaking task types with a 1–6 score scale, while a comparable 0–120 score is reported during the transition period.
https://www.ets.org/toefl/test-takers/ibt/about/content.html
https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html

### ACT / IELTS / Cambridge A Level
The code records official exam source pages as calibration anchors. The production system should bind each subject/year to its current official blueprint before enabling an "exam fidelity" claim.
https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-exam-sections-and-structure.html
https://ielts.org/take-a-test/test-types/ielts-academic-test
https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-levels/

## AI quality policy

1. User materials and official exam metadata outrank the model's generic knowledge.
2. Generated questions are original and must not be represented as official past-paper items.
3. Every generated question stores source-chunk identifiers.
4. Item generation is followed by an independent verification call.
5. Constructed responses are graded against explicit criteria and produce atomic corrections.
6. Failed items lead to targeted re-testing and increased review pressure.
7. A subject/year should not be marketed as "exact difficulty" until benchmarked against an authorized representative dataset using agreement metrics, distractor quality review, score-distribution checks and human examiner review.
