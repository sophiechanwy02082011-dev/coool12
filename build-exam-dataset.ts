/**
 * Build a fine-tuning/evaluation dataset from ONLY human-verified, source-grounded items.
 * This is intentionally offline: it does not scrape copyrighted papers and does not label
 * synthetic items as official. Import authorized/public-domain/licensed examples first.
 */
import fs from 'node:fs/promises';
import { q, pool } from '../src/db.js';

const out = process.argv[2] ?? './artifacts/exam-dataset.jsonl';
const examId = process.argv[3] ?? '';
const rows = await q<any>(`
  select p.exam_id,p.exam_year,p.subject,q.type,q.difficulty,q.skill,q.prompt,q.choices,q.answer,q.rubric,q.explanation,q.provenance
  from questions q join study_profiles p on p.id=q.profile_id
  where q.verified=true and q.ai_verified=true and q.calibration_verified=true and ($1='' or p.exam_id=$1)
  order by q.created_at
`, [examId]);
await fs.mkdir(out.split('/').slice(0,-1).join('/') || '.', {recursive:true});
let n=0;
for(const r of rows.rows){
  const record = {
    exam_id:r.exam_id, exam_year:r.exam_year, subject:r.subject, type:r.type,
    difficulty:r.difficulty, skill:r.skill, prompt:r.prompt, choices:r.choices,
    answer:r.answer, rubric:r.rubric, explanation:r.explanation,
    provenance:r.provenance,
    approved_for_training:true,
  };
  await fs.appendFile(out, JSON.stringify(record)+'\n'); n++;
}
console.log(`Wrote ${n} verified records to ${out}`);
await pool.end();
