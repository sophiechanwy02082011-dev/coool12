import OpenAI from 'openai';
import { env } from './config.js';
import { examById } from './exams.js';
import { examPack } from './examPacks.js';
import { calibrationSystem } from './examCalibration.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const jsonSchema = (name: string, schema: any) => ({ type: 'json_schema', name, strict: true, schema });

async function responses<T>(system: string, input: any, schema: any, model = env.OPENAI_MODEL): Promise<T> {
  const r = await client.responses.create({
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: typeof input === 'string' ? input : JSON.stringify(input) }] },
    ],
    text: { format: jsonSchema('response', schema) },
  } as any);
  const text = (r as any).output_text;
  if (!text) throw new Error('AI returned no structured output');
  return JSON.parse(text) as T;
}

const planSchema = {
  type: 'object', additionalProperties: false,
  properties: { days: { type: 'array', items: { type: 'object', additionalProperties: false,
    properties: { date: { type: 'string' }, minutes: { type: 'integer' }, focus: { type: 'string' },
      tasks: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { type: { type: 'string' }, title: { type: 'string' }, minutes: { type: 'integer' }, skill: { type: 'string' }, rationale: { type: 'string' } },
        required: ['type','title','minutes','skill','rationale']
      }}
    }, required: ['date','minutes','focus','tasks']
  }}}, required: ['days']
};

const planAuditSchema = {
  type: 'object', additionalProperties: false,
  properties: { valid: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } }, correctedPlan: planSchema },
  required: ['valid','issues','correctedPlan']
};

const qSchema = {
  type: 'object', additionalProperties: false,
  properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false,
    properties: {
      type: { type: 'string' }, difficulty: { type: 'number' }, skill: { type: 'string' }, prompt: { type: 'string' },
      choices: { type: ['array','null'], items: { type: 'string' } }, answer: { type: 'string' },
      maxScore: { type: 'number' }, commandWord: { type: 'string' }, assessmentObjective: { type: 'string' },
      rubric: { type: ['array','null'], items: { type: 'object', additionalProperties: false,
        properties: { criterion: { type: 'string' }, maxPoints: { type: 'number' }, requirements: { type: 'array', items: { type: 'string' } }, strictErrors: { type: 'array', items: { type: 'string' } } },
        required: ['criterion','maxPoints','requirements','strictErrors']
      }},
      explanation: { type: 'string' }, sourceChunkIds: { type: 'array', items: { type: 'string' } }, commonTraps: { type: 'array', items: { type: 'string' } }
    }, required: ['type','difficulty','skill','prompt','choices','answer','maxScore','commandWord','assessmentObjective','rubric','explanation','sourceChunkIds','commonTraps']
  }}}, required: ['questions']
};

const gradeSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    score: { type: 'number' }, maxScore: { type: 'number' }, confidence: { type: 'number' },
    strictErrors: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' }, corrections: { type: 'array', items: { type: 'string' } },
    modelAnswer: { type: 'string' }, retestSkill: { type: ['string','null'] },
    rubricOutcomes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { criterion: { type: 'string' }, awarded: { type: 'number' }, max: { type: 'number' }, reason: { type: 'string' } }, required: ['criterion','awarded','max','reason'] } },
    severity: { type: 'string' }
  }, required: ['score','maxScore','confidence','strictErrors','feedback','corrections','modelAnswer','retestSkill','rubricOutcomes','severity']
};
const gradeAuditSchema = { ...gradeSchema };
const diagnosticSchema = { type: 'object', additionalProperties: false, properties: { title:{type:'string'}, skills:{type:'array',items:{type:'object',additionalProperties:false,properties:{skill:{type:'string'},reason:{type:'string'},priority:{type:'number'}},required:['skill','reason','priority']}}}, required:['title','skills'] };
const gameSchema = { type:'object',additionalProperties:false,properties:{type:{type:'string'},title:{type:'string'},rules:{type:'string'},prompt:{type:'string'},choices:{type:'array',items:{type:'string'}},answer:{type:'string'},explanation:{type:'string'},skill:{type:'string'}},required:['type','title','rules','prompt','choices','answer','explanation','skill'] };
const cardSchema = { type:'object', additionalProperties:false, properties:{cards:{type:'array',items:{type:'object',additionalProperties:false,properties:{front:{type:'string'},back:{type:'string'},skill:{type:'string'}},required:['front','back','skill']}}}, required:['cards'] };

const core = (exam: any) => {
  const pack = examPack(exam?.id ?? exam?.exam_id);
  return `
You are RecallForge's high-stakes exam engine. You are NOT a friendly answer generator. You are a conservative assessor and curriculum engine.
Never invent syllabus facts, marking rules, formulas, definitions, source claims, or exam structures. Prefer the supplied material and official exam profile.
When evidence is insufficient, say so. Never conceal uncertainty. Never call a question "official" unless it is literally an official source supplied by the user.
Use the current examination year/version. ${exam?.name ?? ''}: ${exam?.difficultyModel ?? ''}
For marking, treat the supplied rubric as binding. Award credit only for requirements actually satisfied. Do not penalize stylistic differences unless the rubric requires them.
For any factual, algebraic, unit, sign, terminology, command-word, evidence, or reasoning error that affects marks, identify it explicitly. Do not manufacture errors to appear strict.
The goal is demanding accuracy and transfer, not arbitrary harshness.
This is an EXAM-SPECIALIZED engine, not a generic tutor. All generation must follow the exam pack's assessment model, current version, subject/paper rules and verified calibration evidence.
Exam pack: ${pack.name}; provider: ${pack.provider}; difficulty model: ${pack.calibration.difficultyScale}; marking: ${pack.calibration.marking.join('; ')}.
For exam profiles, do not enter adaptive/high-stakes mode until the profile has enough verified calibration items.
`;
};

export async function extractImageText(buf: Buffer, mime: string) {
  const data = `data:${mime};base64,${buf.toString('base64')}`;
  const r = await client.responses.create({ model: env.OPENAI_MODEL, input: [{ role:'user', content:[
    { type:'input_text', text:'Extract study-relevant text, equations, diagrams described in words, tables, labels, and visible symbolic content. Preserve wording accurately. Never invent obscured content; mark uncertain text as [unclear].' },
    { type:'input_image', image_url:data }
  ]}] } as any);
  return (r as any).output_text ?? '';
}

function validatePlan(plan:any, profile:any){
  if(!plan || !Array.isArray(plan.days) || !plan.days.length) throw new Error('AI returned an empty study plan');
  const start=new Date(); start.setHours(0,0,0,0);
  const end=new Date(`${String(profile.test_date).slice(0,10)}T00:00:00`);
  const expected=Math.floor((end.getTime()-start.getTime())/86400000)+1;
  if(expected<1 || plan.days.length!==expected) throw new Error('Study plan day count is inconsistent with the test date');
  let prev='';
  for(const d of plan.days){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Study plan contains an invalid date');
    if(prev && d.date<=prev) throw new Error('Study plan dates are not strictly increasing');
    prev=d.date;
    const mins=Number(d.minutes); if(!Number.isFinite(mins)||mins<0||mins>Number(profile.daily_minutes)) throw new Error('Study plan exceeds the daily time budget');
    const sum=(d.tasks??[]).reduce((a:any,t:any)=>a+Number(t.minutes||0),0);
    if(sum!==mins || (d.tasks??[]).some((t:any)=>!Number.isFinite(Number(t.minutes))||Number(t.minutes)<=0)) throw new Error('Study plan task minutes are inconsistent');
  }
  if(plan.days[0].date!==start.toISOString().slice(0,10) || plan.days[plan.days.length-1]?.date!==String(profile.test_date).slice(0,10)) throw new Error('Study plan does not cover the full date range');
  return plan;
}

export async function generatePlan(profile:any, materials:any[]) {
  const exam = examById(profile.exam_id)!;
  const system = `${core(exam)} Build a dated study plan from TODAY through the test date. Cover all supplied material only as justified. Use retrieval practice, distributed practice, interleaving, cumulative tests, mixed difficulty, error correction, and realistic recovery days. Do not allocate more minutes than the student's daily budget. Include explicit review/retrieval blocks. The plan must be internally consistent: every day within the range, minutes sum to no more than the daily budget, tasks have positive minutes, and late-stage work shifts toward timed exam conditions.`;
  const draft = await responses<any>(system, {profile, materials: materials.map(m=>({id:m.id,name:m.original_name,content:(m.extracted_text??'').slice(0,16000)}))}, planSchema);
  const audit = await responses<any>(`${core(exam)} Audit this plan as a hostile scheduling QA system. Check date continuity, day count, daily-minute compliance, feasibility, coverage, repeated retrieval, distributed review, interleaving, cumulative testing, and test-date taper. Repair every issue you find. Return the corrected plan, even if the original was invalid.`, {profile, draft}, planAuditSchema, env.OPENAI_REASONING_MODEL);
  return validatePlan(audit.correctedPlan, profile);
}

function validateQuestions(items:any[], chunks:any[], count:number){
  const validSourceIds=new Set(chunks.map(c=>String(c.id)));
  if(!Array.isArray(items) || items.length!==count) throw new Error(`AI returned ${items?.length??0} questions; expected ${count}`);
  return items.map((q:any,idx:number)=>{
    if(!q.prompt?.trim()||!q.skill?.trim()) throw new Error(`Question ${idx+1} is missing required content`);
    const d=Number(q.difficulty); if(!Number.isFinite(d)||d<1||d>10) throw new Error(`Question ${idx+1} has invalid difficulty`);
    const max=Number(q.maxScore); if(!Number.isFinite(max)||max<=0) throw new Error(`Question ${idx+1} has invalid max score`);
    const refs=Array.isArray(q.sourceChunkIds)?q.sourceChunkIds.map(String):[]; if(!refs.length||refs.some((id:string)=>!validSourceIds.has(id))) throw new Error(`Question ${idx+1} contains an invalid source reference`);
    const type=String(q.type).toLowerCase();
    if(q.choices!==null){
      if(!Array.isArray(q.choices)||q.choices.length<2||q.choices.length>8) throw new Error(`Question ${idx+1} has invalid choices`);
      const answer=String(q.answer); const matching=q.choices.filter((c:string)=>c===answer); if(matching.length!==1) throw new Error(`Question ${idx+1} does not have exactly one verified choice key`);
      if(max!==1) throw new Error(`Question ${idx+1} MCQ max score must be 1`);
    } else if(!Array.isArray(q.rubric)||!q.rubric.length){
      throw new Error(`Question ${idx+1} constructed response has no rubric`);
    }
    if(!['mcq','multiple-choice','multiple choice'].includes(type) && q.choices!==null && q.choices.length){/* allow model-specific labels; choices are still objectively scored */}
    return {...q,difficulty:d,maxScore:max,sourceChunkIds:refs};
  });
}

export async function generateQuestions(profile:any,chunks:any[],count:number,mode='practice') {
  const exam = examById(profile.exam_id)!;
  const source = chunks.map(c=>`[CHUNK ${c.id}]\n${c.content}`).join('\n---\n');
  const generated = await responses<any>(`${core(exam)} ${calibrationSystem({examId:profile.exam_id,examYear:profile.exam_year,subject:profile.subject,sourceItems:chunks})} Write original exam-style questions. Never copy past-paper wording. Calibrate cognitive demand from assessment objectives, command words, mark allocation, question archetype, and target grade. Create clean MCQ distractors with exactly one best answer. For constructed response, create an atomic rubric. ${mode==='mock'?'Prefer authentic paper/component mix and realistic mark/time proportions.':''}`, {profile,mode,count,source}, qSchema);
  const verified = await responses<any>(`${core(exam)} ${calibrationSystem({examId:profile.exam_id,examYear:profile.exam_year,subject:profile.subject,sourceItems:chunks})} Adversarially verify every item. Reject or repair ambiguity, multiple defensible answers, unsupported content, mismatch to supplied material, bad distractors, incorrect answer, broken rubric totals, command-word mismatch, unrealistic marks, or implausible difficulty. Preserve and validate every source chunk ID. Return exactly the requested number of deliverable items.`, generated, qSchema, env.OPENAI_REASONING_MODEL);
  return validateQuestions(verified.questions,chunks,count);
}

function normalizeGrade(g:any,q:any){
  const max=Number(q.max_score ?? q.provenance?.maxScore ?? g.maxScore ?? 1); const score=Math.max(0,Math.min(max,Number(g.score)||0));
  return {...g,score,maxScore:max,confidence:Math.max(0,Math.min(1,Number(g.confidence)||0))};
}

export async function gradeAnswer(profile:any, question:any, response:any) {
  const exam = examById(profile.exam_id)!;
  const first = await responses<any>(`${core(exam)} ${calibrationSystem({examId:profile.exam_id,examYear:profile.exam_year,subject:profile.subject,sourceItems:[question]})} You are Marker A. Mark the response independently. Use the question, answer key, and rubric. For MCQ, compare against the stored correct answer exactly. For constructed responses, allocate each rubric criterion separately and show lost marks. A student does not receive marks merely for mentioning the correct topic; the required reasoning/evidence must be present.`, {question,response}, gradeSchema, env.OPENAI_REASONING_MODEL);
  const second = await responses<any>(`${core(exam)} ${calibrationSystem({examId:profile.exam_id,examYear:profile.exam_year,subject:profile.subject,sourceItems:[question]})} You are Marker B and an adversarial moderator. Re-mark independently. Focus on missed errors, over-marking, under-marking, units/notation, command words, unsupported claims, contradictions, and whether every awarded mark is justified by a rubric criterion. Do not see or imitate Marker A's score.`, {question,response}, gradeAuditSchema, env.OPENAI_REASONING_MODEL);
  const adjudicated = await responses<any>(`${core(exam)} You are the senior chief examiner. Adjudicate two independent marks. Do not split the difference mechanically. Reconstruct the correct marking decision from the question and rubric. Preserve any legitimate penalty and remove any hallucinated penalty. Return the final strict mark, exact errors, corrections, rubric breakdown, confidence, severity, and one retest skill.`, {question,response,markerA:first,markerB:second}, gradeSchema, env.OPENAI_REASONING_MODEL);
  return normalizeGrade(adjudicated,question);
}

export async function makeCards(profile:any,chunks:any[],count:number) {
  const source = chunks.map(c=>`[CHUNK ${c.id}] ${c.content}`).join('\n---\n');
  return (await responses<any>(`${core(examById(profile.exam_id))} Create active-recall cards. Each card tests one retrievable unit or one application. Prefer free recall, compare/contrast, sequence, why/how, worked-step reconstruction, and misconception checks. Avoid trivia, duplicated cards, and recognition-only prompts.`, {count,source}, cardSchema)).cards;
}

export async function tutor(profile:any, question:string, chunks:any[]) {
  return responses<any>(`${core(examById(profile.exam_id))} Be a Socratic tutor. Diagnose the likely misconception before teaching. Explain at the student's level, cite supplied material conceptually, then require retrieval and transfer. Never bluff.`, {question,materials:chunks.map(c=>c.content.slice(0,6000))}, {type:'object',additionalProperties:false,properties:{explanation:{type:'string'},misconception:{type:'string'},retrievalQuestion:{type:'string'},transferQuestion:{type:'string'},nextStep:{type:'string'}},required:['explanation','misconception','retrievalQuestion','transferQuestion','nextStep']});
}

export async function videoScript(profile:any,topic:string,chunks:any[]) {
  return responses<any>(`${core(examById(profile.exam_id))} Create a concise 60–120 second micro-lesson for ${topic}. Use simple visuals, one worked micro-example, one common trap, one exam connection, and two retrieval prompts. Stay inside supplied content.`, {topic,materials:chunks.map(c=>c.content.slice(0,6000))}, {type:'object',additionalProperties:false,properties:{title:{type:'string'},scenes:{type:'array',items:{type:'object',additionalProperties:false,properties:{seconds:{type:'integer'},visual:{type:'string'},narration:{type:'string'},onScreenText:{type:'string'}},required:['seconds','visual','narration','onScreenText']}},retrievalPrompts:{type:'array',items:{type:'string'}},examTrap:{type:'string'}},required:['title','scenes','retrievalPrompts','examTrap']});
}

export async function diagnostic(profile:any, skills:any[]) {
  return responses<any>(`${core(examById(profile.exam_id))} Analyze the user's historical mastery and attempts. Identify the highest-value weaknesses to diagnose next. Priority must reflect risk to the target grade, uncertainty, and prerequisite importance—not just the lowest score.`, {profile,skills}, diagnosticSchema, env.OPENAI_REASONING_MODEL);
}

export async function makeGame(profile:any, chunks:any[], mode='sorting') {
  const source = chunks.map(c=>`[CHUNK ${c.id}] ${c.content}`).join('\n---\n');
  return responses<any>(`${core(examById(profile.exam_id))} Create a short learning game that forces retrieval. Supported types: classification, error-hunt, sequence, two-truths-one-false, or rapid-choice. It must have one defensible answer and a meaningful explanation.`, {mode,source}, gameSchema);
}
