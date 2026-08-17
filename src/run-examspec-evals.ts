/** Minimal offline evaluation harness. Replace benchmark fixtures with independently
 * validated exam-specific items before making performance claims. */
import fs from 'node:fs/promises';

const file = process.argv[2] ?? './artifacts/benchmark.jsonl';
const text = await fs.readFile(file,'utf8');
const rows = text.split(/\r?\n/).filter(Boolean).map(JSON.parse);
const required = ['exam_id','subject','skill','type','difficulty','prompt','answer'];
let pass=0;
for(const [i,r] of rows.entries()){
  const ok = required.every(k => r[k] !== undefined && r[k] !== null && r[k] !== '');
  if(ok) pass++; else console.error(`FAIL row ${i+1}: missing required field`);
}
console.log(JSON.stringify({rows:rows.length, schemaPassRate:rows.length?pass/rows.length:0},null,2));
