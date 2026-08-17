import { q } from './db.js';
import { examPack } from './examPacks.js';

export type CalibrationContext = {
  examId: string;
  examYear?: number | null;
  subject?: string | null;
  sourceItems: any[];
};

export function calibrationSystem(ctx: CalibrationContext) {
  const pack = examPack(ctx.examId);
  const sourceSummary = ctx.sourceItems.slice(0, 12).map((x:any) => ({
    id: x.id, kind: x.kind, topic: x.topic, skill: x.skill, archetype: x.archetype,
    difficulty: x.difficulty, marks: x.marks, metadata: x.metadata
  }));
  return `EXAM PACK: ${pack.name} (${pack.provider})\nVERSION: ${pack.currentVersion}\nYEAR: ${ctx.examYear ?? 'user/course-defined'}\nSUBJECT: ${ctx.subject ?? 'not specified'}\nREQUIRED CALIBRATION FIELDS: ${pack.calibration.requiredFields.join(', ')}\nDIFFICULTY MODEL: ${pack.calibration.difficultyScale}\nQUESTION ARCHETYPES: ${pack.calibration.archetypes.join(', ')}\nMARKING MODEL: ${pack.calibration.marking.join('; ')}\nSOURCE-GROUNDED GENERATION: ${pack.retrievalPolicy.requireSourceGrounding}\nEXAMPLES ALREADY VERIFIED: ${sourceSummary.length}\nNever claim equivalence to an official difficulty score unless an empirical calibration record exists. Never call user-generated content official.`;
}

export async function getVerifiedCalibrationItems(profileId:string, limit=200) {
  return (await q<any>(`select id, provenance, type, skill, difficulty, rubric, prompt from questions where profile_id=$1 and calibration_verified=true order by created_at desc limit $2`, [profileId, limit])).rows;
}

export async function calibrationReadiness(profileId:string, examId:string) {
  const pack = examPack(examId);
  const rows = await getVerifiedCalibrationItems(profileId, 500);
  const bySkill = new Set(rows.map(r=>r.skill));
  const verified = rows.length;
  return {
    verifiedItems: verified,
    distinctSkills: bySkill.size,
    minimum: pack.retrievalPolicy.minVerifiedItemsBeforeAdaptive,
    adaptiveReady: verified >= pack.retrievalPolicy.minVerifiedItemsBeforeAdaptive,
    warning: verified < pack.retrievalPolicy.minVerifiedItemsBeforeAdaptive
      ? `Adaptive exam-mode generation is locked until at least ${pack.retrievalPolicy.minVerifiedItemsBeforeAdaptive} verified items exist for this profile.`
      : null
  };
}
