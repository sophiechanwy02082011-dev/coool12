export type ExamPack = {
  id: string;
  name: string;
  provider: string;
  currentVersion: string;
  officialSources: string[];
  calibration: {
    requiredFields: string[];
    difficultyScale: string;
    archetypes: string[];
    marking: string[];
  };
  retrievalPolicy: {
    requireSourceGrounding: boolean;
    allowGenerationWithoutOfficialSource: boolean;
    minVerifiedItemsBeforeAdaptive: number;
  };
};

export const examPacks: ExamPack[] = [
  {
    id: 'hkdse', name: 'HKDSE', provider: 'HKEAA', currentVersion: 'year-aware-2026+',
    officialSources: ['https://www.hkeaa.edu.hk/en/hkdse/assessment/assessment_framework/', 'https://www.hkeaa.edu.hk/en/hkdse/assessment/marking/marking_procedure_for_written_papers/'],
    calibration: { requiredFields: ['subject','year','paper','component','topic','assessmentObjective','commandWord','marks','difficulty','rubric'], difficultyScale: '1-10 calibrated per paper/component and grade-band target', archetypes: ['data interpretation','extended response','structured problem','source analysis','short answer','multiple choice'], marking: ['criterion-level scoring','acceptable-response set','alternative valid reasoning','units/notation','command-word compliance'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'ap', name: 'AP', provider: 'College Board', currentVersion: 'current',
    officialSources: ['https://apcentral.collegeboard.org/courses/how-ap-develops-courses-and-exams/past-exam-questions'],
    calibration: { requiredFields: ['course','year','section','skill','questionType','scoringGuideline','marks','difficulty','rubric'], difficultyScale: '1-10 by course and question type; anchored to released examples/scoring guidance', archetypes: ['MCQ','FRQ','source-based','argumentative','data analysis','calculation'], marking: ['rubric points','scoring guideline alignment','evidence/reasoning','part-by-part scoring'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'ib', name: 'IB Diploma', provider: 'IBO', currentVersion: 'current',
    officialSources: ['https://ibo.org/programmes/diploma-programme/assessment-and-exams/sample-exam-papers/'],
    calibration: { requiredFields: ['subject','level','paper','assessmentObjective','commandTerm','marks','rubric','difficulty'], difficultyScale: '1-10 by subject/level/paper', archetypes: ['data response','essay','source analysis','calculation','extended response'], marking: ['markscheme/rubric criterion scoring','command-term fulfillment','evidence','reasoning'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'sat', name: 'SAT', provider: 'College Board', currentVersion: 'digital',
    officialSources: ['https://satsuite.collegeboard.org/practice/student-question-bank'],
    calibration: { requiredFields: ['domain','skill','difficulty','questionType','rationale'], difficultyScale: 'official difficulty bands plus empirical calibration', archetypes: ['reading','writing','algebra','advanced math','problem solving','data analysis'], marking: ['single-best-answer','exact scoring','distractor analysis'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 200 }
  },
  {
    id: 'toefl', name: 'TOEFL iBT', provider: 'ETS', currentVersion: '2026-01-21+',
    officialSources: ['https://www.ets.org/toefl/institutions/ibt/about/content-structure.html'],
    calibration: { requiredFields: ['section','taskType','skill','scoreScale','rubric','difficulty'], difficultyScale: '1-10 per section/task; linked to official descriptors', archetypes: ['reading','listening','speaking','writing','integrated task'], marking: ['task fulfillment','language use','organization','delivery where applicable'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'ielts', name: 'IELTS Academic', provider: 'IELTS', currentVersion: 'current',
    officialSources: ['https://ielts.org/take-a-test/test-types/ielts-academic-test'],
    calibration: { requiredFields: ['section','taskType','bandDescriptor','criterion','difficulty'], difficultyScale: '1-10 per task and band target', archetypes: ['reading','listening','writing task 1','writing task 2','speaking'], marking: ['band-descriptor criterion scoring','task response','coherence','lexical resource','grammar','pronunciation'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'act', name: 'ACT', provider: 'ACT', currentVersion: 'current',
    officialSources: ['https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-exam-sections-and-structure.html'],
    calibration: { requiredFields: ['section','domain','skill','questionType','difficulty','rationale'], difficultyScale: '1-10 by section/domain', archetypes: ['English editing','math','reading','science/data interpretation','writing'], marking: ['single-best-answer','essay-domain scoring'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'cambridge-a-level', name: 'Cambridge International A Level', provider: 'Cambridge International', currentVersion: 'current',
    officialSources: ['https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-levels/'],
    calibration: { requiredFields: ['subject','paper','syllabus','assessmentObjective','commandWord','marks','markScheme','difficulty'], difficultyScale: '1-10 by syllabus/paper', archetypes: ['structured response','essay','calculation','data analysis','source analysis'], marking: ['mark-scheme point awarding','working','units','evidence','command word'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: false, minVerifiedItemsBeforeAdaptive: 100 }
  },
  {
    id: 'university', name: 'College / University Course', provider: 'Institution / Instructor', currentVersion: 'source-defined',
    officialSources: [],
    calibration: { requiredFields: ['course','week/topic','learningObjective','questionArchetype','marks','rubric','difficulty'], difficultyScale: '1-10 inferred only from supplied course evidence', archetypes: ['problem set','essay','case analysis','short answer','proof','lab/data analysis'], marking: ['instructor rubric','syllabus learning outcomes','past exam patterns'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: true, minVerifiedItemsBeforeAdaptive: 50 }
  },
  {
    id: 'custom', name: 'Custom Examination', provider: 'User supplied', currentVersion: 'source-defined',
    officialSources: [],
    calibration: { requiredFields: ['source','topic','skill','questionArchetype','marks','rubric','difficulty'], difficultyScale: '1-10 inferred from supplied examples and rubrics', archetypes: ['user-defined'], marking: ['user-supplied rubric takes precedence'] },
    retrievalPolicy: { requireSourceGrounding: true, allowGenerationWithoutOfficialSource: true, minVerifiedItemsBeforeAdaptive: 30 }
  }
];

export function examPack(id?: string) { return examPacks.find(p => p.id === id) ?? examPacks.find(p => p.id === 'custom')!; }
