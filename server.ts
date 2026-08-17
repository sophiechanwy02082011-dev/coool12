import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import statik from '@fastify/static';
import { env } from './config.js';
import { pool, q, initDb } from './db.js';
import { authRoutes, getUser, requireUser } from './auth.js';
import { exams, examById } from './exams.js';
import { examPacks } from './examPacks.js';
import { calibrationReadiness } from './examCalibration.js';
import { ensureUploadDir, saveMaterial } from './materials.js';
import { diagnostic, generatePlan, generateQuestions, gradeAnswer, makeCards, makeGame, tutor, videoScript } from './ai.js';
import { schedule } from './srs.js';

const app=Fastify({logger:true,bodyLimit:env.MAX_UPLOAD_BYTES+4_000_000});
await app.register(cookie,{secret:env.SESSION_SECRET});
await app.register(multipart,{limits:{fileSize:env.MAX_UPLOAD_BYTES,files:100}});
await app.register(statik,{root:path.resolve('./public'),prefix:'/'});
await initDb();
authRoutes(app);

const userProfile=async(req:any,id:string)=>{const u=req.user;return (await q<any>('select * from study_profiles where id=$1 and user_id=$2',[id,u.id])).rows[0]??null};
const dateOnly=(d:any)=>String(d).slice(0,10);
const publicQuestion=(q:any)=>({
  id:q.id,type:q.type,difficulty:q.difficulty,skill:q.skill,prompt:q.prompt,
  choices:q.choices,maxScore:Number(q.max_score??q.provenance?.maxScore??1),
  commandWord:q.provenance?.commandWord??null,assessmentObjective:q.provenance?.assessmentObjective??null
});
const parseChoices=(q:any)=>{if(!q.choices)return null;return Array.isArray(q.choices)?q.choices:JSON.parse(q.choices)};
const objectiveGrade=(q:any,response:any)=>{
  const choices=parseChoices(q); const key=String(q.answer); const raw=String(response??'');
  const submittedIndex=/^\d+$/.test(raw)?Number(raw):-1;
  const right=raw===key || (submittedIndex>=0 && submittedIndex<choices.length && String(choices[submittedIndex])===key);
  return {score:right?1:0,maxScore:1,confidence:1,strictErrors:right?[]:[`Incorrect answer. Expected the verified item key.`],feedback:right?'Correct. Continue to cumulative retrieval.':'Incorrect. Re-retrieve the tested skill and retry later.',corrections:right?[]:[`Review ${q.skill} and complete a delayed retrieval.`],modelAnswer:key,retestSkill:right?null:q.skill,rubricOutcomes:[{criterion:'Correct answer',awarded:right?1:0,max:1,reason:right?'Choice matches the verified answer.':'Choice does not match the verified answer.'}],severity:right?'none':'major'};
};
const ensureRange=(n:number,min:number,max:number,label:string)=>{if(!Number.isFinite(n)||n<min||n>max)throw new Error(`${label} must be between ${min} and ${max}`);return n;};
const requireConfirmed=(p:any,reply:any)=>{if(!p.confirmed_at){reply.code(409).send({error:'Confirm your study plan before starting this study mode.'});return false;}return true;};

app.get('/api/me',async req=>({user:await getUser(req)}));
app.get('/api/exams',async()=>({exams,examPacks}));
app.get('/api/exams/:examId/readiness',{preHandler:requireUser},async req=>{const u=(req as any).user;const examId=String((req.params as any).examId);const p=(await q<any>('select id,exam_year,subject from study_profiles where user_id=$1 and exam_id=$2 order by created_at desc limit 1',[u.id,examId])).rows[0];if(!p)return {adaptiveReady:false,warning:'Create a study profile first.'};return calibrationReadiness(p.id,examId);});

app.post('/api/profile',{preHandler:requireUser},async(req,reply)=>{
  const u=(req as any).user,b=req.body as any,e=examById(b.examId);if(!e)return reply.code(400).send({error:'Unknown exam'});
  const td=new Date(`${b.testDate}T00:00:00`); if(Number.isNaN(td.getTime())||td<=new Date())return reply.code(400).send({error:'Test date must be in the future'});
  const daily=Math.max(15,Math.min(600,Number(b.dailyMinutes)||90)); const target=Math.max(0,Math.min(12,Number(b.targetGrade)||10));
  const r=await q<{id:string}>('insert into study_profiles(user_id,exam_id,exam_year,subject,test_date,target_grade,daily_minutes) values($1,$2,$3,$4,$5,$6,$7) returning id',[u.id,b.examId,b.examYear?Number(b.examYear):null,b.subject?.trim()||null,b.testDate,target,daily]);return {id:r.rows[0].id};
});

app.post('/api/materials/link',{preHandler:requireUser},async(req,reply)=>{try{const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return reply.code(404).send({error:'Profile not found'});await saveMaterial(u.id,p.id,{kind:'link',url:b.url,metadata:{label:b.label}});return {ok:true};}catch(e:any){return reply.code(400).send({error:e.message});}});
app.post('/api/materials/text',{preHandler:requireUser},async(req,reply)=>{try{const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return reply.code(404).send({error:'Profile not found'});const id=await saveMaterial(u.id,p.id,{kind:'text',originalName:b.name??'Pasted notes',text:b.text,mimeType:'text/plain'});return {id};}catch(e:any){return reply.code(400).send({error:e.message});}});
app.post('/api/materials/upload',{preHandler:requireUser},async(req,reply)=>{const u=(req as any).user;const parts=req.parts();let profileId='';const ids:string[]=[];for await(const p of parts){if(p.type==='field'&&p.fieldname==='profileId')profileId=String(p.value);if(p.type==='file'){if(!profileId)return reply.code(400).send({error:'profileId required'});const prof=await userProfile(req,profileId);if(!prof)return reply.code(404).send({error:'Profile not found'});await ensureUploadDir();const safe=path.basename(p.filename).replace(/[^a-zA-Z0-9._-]/g,'_');const key=`${u.id}/${Date.now()}-${crypto.randomBytes(10).toString('hex')}-${safe}`;const full=path.resolve(env.UPLOAD_DIR,key);await fs.mkdir(path.dirname(full),{recursive:true});await pipeline(p.file,(await import('node:fs')).createWriteStream(full));ids.push(await saveMaterial(u.id,profileId,{kind:p.mimetype.startsWith('image/')?'image':'file',originalName:p.filename,mimeType:p.mimetype,storageKey:key,filePath:full}));}}return {ids};});
app.get('/api/materials',{preHandler:requireUser},async req=>{const u=(req as any).user,p=await userProfile(req,String((req.query as any).profileId));if(!p)return {materials:[]};const r=await q<any>('select id,kind,original_name,source_url,mime_type,status,error,created_at from materials where profile_id=$1 and user_id=$2 order by created_at desc',[p.id,u.id]);return {materials:r.rows};});

app.post('/api/plan/generate',{preHandler:requireUser},async(req,reply)=>{try{const u=(req as any).user;const p=await userProfile(req,String((req.body as any).profileId));if(!p)return reply.code(404).send({error:'Profile not found'});const mats=(await q<any>('select id,original_name,extracted_text from materials where profile_id=$1 and status=\'ready\'',[p.id])).rows;if(!mats.length)return reply.code(400).send({error:'Upload at least one ready material first'});const plan=await generatePlan(p,mats);await q('update study_profiles set plan_json=$1,updated_at=now() where id=$2',[plan,p.id]);await q('delete from study_tasks where profile_id=$1',[p.id]);for(const d of plan.days){for(const t of d.tasks){await q('insert into study_tasks(profile_id,study_date,task_type,title,minutes,topic,payload) values($1,$2,$3,$4,$5,$6,$7)',[p.id,d.date,t.type,t.title,t.minutes,t.skill,JSON.stringify(t)]);}}return plan;}catch(e:any){req.log.error(e);return reply.code(500).send({error:'Plan generation failed'});}});
app.post('/api/plan/confirm',{preHandler:requireUser},async req=>{const p=await userProfile(req,String((req.body as any).profileId));if(!p)throw new Error('Profile not found');if(!p.plan_json)return {error:'Generate a plan first'};await q('update study_profiles set confirmed_at=now(),updated_at=now() where id=$1',[p.id]);return {ok:true};});
app.get('/api/tasks',{preHandler:requireUser},async req=>{const p=await userProfile(req,String((req.query as any).profileId));if(!p)return {tasks:[]};const r=await q<any>('select * from study_tasks where profile_id=$1 order by study_date,created_at',[p.id]);return {tasks:r.rows};});
app.post('/api/tasks/:id/complete',{preHandler:requireUser},async req=>{const p=await userProfile(req,String((req.body as any).profileId));if(!p)return {error:'Profile not found'};const id=String((req.params as any).id);await q('update study_tasks set completed_at=case when completed_at is null then now() else null end where id=$1 and profile_id=$2',[id,p.id]);return {ok:true};});

app.get('/api/dashboard',{preHandler:requireUser},async req=>{const u=(req as any).user;const p=(await q<any>('select * from study_profiles where user_id=$1 order by created_at desc limit 1',[u.id])).rows[0]??null;if(!p)return {profile:null};const tasks=(await q<any>('select * from study_tasks where profile_id=$1 order by study_date,created_at',[p.id])).rows;const cards=(await q<any>('select * from cards where profile_id=$1 and user_id=$2 and due_at<=now() order by due_at limit 100',[p.id,u.id])).rows;const mastery=(await q<any>('select skill,mastery,confidence,attempts,correct from mastery where profile_id=$1 and user_id=$2 order by mastery asc',[p.id,u.id])).rows;const today=dateOnly(new Date());const stats=(await q<any>('select count(*) filter(where created_at::date=$1) reviews,count(*) filter(where created_at::date=$1 and score is not null and score/nullif(max_score,0)<1) mistakes,coalesce(avg(score/nullif(max_score,0)) filter(where created_at::date=$1),0) accuracy from attempts where user_id=$2',[today,u.id])).rows[0];return {profile:p,tasks,cards,mastery,stats};});

async function addQuestionSet(p:any,qs:any[]){
  const ids:string[]=[];
  for(const item of qs){
    const max=Number(item.maxScore); const choices=item.choices===null?null:item.choices;
    const r=await q<{id:string}>(`insert into questions(profile_id,material_refs,type,difficulty,skill,prompt,choices,answer,rubric,explanation,provenance,verified,ai_verified,calibration_verified,max_score)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,true,false,$12) returning id`,[
      p.id,item.sourceChunkIds,item.type,item.difficulty,item.skill,item.prompt,choices?JSON.stringify(choices):null,
      JSON.stringify(item.answer),item.rubric?JSON.stringify(item.rubric):null,item.explanation,
      JSON.stringify({sourceChunkIds:item.sourceChunkIds,commandWord:item.commandWord,assessmentObjective:item.assessmentObjective,commonTraps:item.commonTraps,maxScore:max}),max]);
    ids.push(r.rows[0].id);
  }
  return ids;
}
app.post('/api/questions/generate',{preHandler:requireUser},async(req,reply)=>{try{const p=await userProfile(req,String((req.body as any).profileId));if(!p)return reply.code(404).send({error:'Profile not found'});if(!requireConfirmed(p,reply))return;const b=req.body as any;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 30',[p.id])).rows;if(!chunks.length)return reply.code(400).send({error:'Upload material first'});const qs=await generateQuestions(p,chunks,Math.min(30,Math.max(1,Number(b.count)||10)),b.mode??'mixed');return {ids:await addQuestionSet(p,qs)};}catch(e:any){req.log.error(e);return reply.code(500).send({error:'Question generation failed'});}});
app.get('/api/questions/next',{preHandler:requireUser},async req=>{const u=(req as any).user,p=await userProfile(req,String((req.query as any).profileId)),mode=String((req.query as any).mode||'adaptive');if(!p)return {question:null};let extra='';if(mode==='easy')extra=' and q.difficulty<=3.5';else if(mode==='medium')extra=' and q.difficulty>3.5 and q.difficulty<=7';else if(mode==='hard')extra=' and q.difficulty>7';const r=await q<any>(`select q.id,q.type,q.difficulty,q.skill,q.prompt,q.choices,q.max_score,q.provenance from questions q where q.profile_id=$1 and q.verified=true and q.ai_verified=true and not exists(select 1 from attempts a where a.question_id=q.id and a.user_id=$2) ${extra} order by case when exists(select 1 from mastery m where m.profile_id=q.profile_id and m.user_id=$2 and m.skill=q.skill and m.mastery<0.55) then 0 else 1 end, case when $3='adaptive' then abs(q.difficulty-6.5) else q.difficulty end, random() limit 1`,[p.id,u.id,mode]);return {question:r.rows[0]?publicQuestion(r.rows[0]):null};});
app.post('/api/questions/:id/grade',{preHandler:requireUser},async req=>{
  const u=(req as any).user;
  const qn=(await q<any>('select q.*,p.id as profile_id,p.user_id,p.exam_id,p.subject,p.target_grade,p.exam_year from questions q join study_profiles p on p.id=q.profile_id where q.id=$1 and p.user_id=$2 and q.verified=true and q.ai_verified=true',[String((req.params as any).id),u.id])).rows[0];
  if(!qn)return replyOrError(req,'Question not found');
  const response=(req.body as any).response;
  const grade=qn.choices?objectiveGrade(qn,response):await gradeAnswer({exam_id:qn.exam_id,subject:qn.subject,target_grade:qn.target_grade,exam_year:qn.exam_year},qn,response);
  const ratio=Number(grade.maxScore)?Number(grade.score)/Number(grade.maxScore):0;
  await q('insert into attempts(user_id,question_id,task_type,response,score,max_score,strict_errors,ai_feedback,grading) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[u.id,qn.id,(req.body as any).taskType??'practice',JSON.stringify(response),grade.score,grade.maxScore,JSON.stringify(grade.strictErrors),grade.feedback,JSON.stringify(grade)]);
  await q('insert into mastery(user_id,profile_id,skill,mastery,confidence,attempts,correct,last_seen_at) values($1,$2,$3,$4,$5,1,$6,now()) on conflict(user_id,profile_id,skill) do update set mastery=greatest(0,least(1,mastery*0.75+excluded.mastery*0.25)),confidence=least(1,mastery.confidence+0.04),attempts=mastery.attempts+1,correct=mastery.correct+excluded.correct,last_seen_at=now()',[u.id,qn.profile_id,qn.skill,ratio,0.5,ratio>=0.999?1:0]);
  return grade;
});
function replyOrError(req:any,message:string){return {error:message};}

app.post('/api/cards/generate',{preHandler:requireUser},async(req,reply)=>{const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return reply.code(404).send({error:'Profile not found'});if(!requireConfirmed(p,reply))return;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 35',[p.id])).rows;if(!chunks.length)return reply.code(400).send({error:'Upload material first'});const cards=await makeCards(p,chunks,Math.min(60,Number(b.count)||25));for(const c of cards)await q('insert into cards(user_id,profile_id,front,back,source_refs,due_at) values($1,$2,$3,$4,$5,now())',[u.id,p.id,c.front,c.back,chunks.map(x=>x.id)]);return {count:cards.length};});
app.post('/api/cards/:id/review',{preHandler:requireUser},async req=>{const u=(req as any).user,b=req.body as any;const rating=Number(b.rating);if(![1,2,3,4].includes(rating))return {error:'Rating must be 1-4'};const r=await q<any>('select * from cards where id=$1 and user_id=$2',[String((req.params as any).id),u.id]);if(!r.rows[0])return {error:'Card not found'};const c=r.rows[0];const next=schedule({stability:c.stability,difficulty:c.difficulty,retrievability:c.retrievability,reps:c.reps,lapses:c.lapses,dueAt:new Date(c.due_at),lastRating:c.last_rating,lastReviewedAt:c.last_reviewed_at?new Date(c.last_reviewed_at):undefined},rating as any,new Date(),Number(b.desiredRetention??0.9));await q('update cards set stability=$1,difficulty=$2,retrievability=$3,reps=$4,lapses=$5,last_rating=$6,last_reviewed_at=$7,due_at=$8 where id=$9 and user_id=$10',[next.stability,next.difficulty,next.retrievability,next.reps,next.lapses,next.lastRating,next.lastReviewedAt,next.dueAt,c.id,u.id]);await q('insert into card_reviews(card_id,user_id,rating,elapsed_ms,retrievability) values($1,$2,$3,$4,$5)',[c.id,u.id,rating,b.elapsedMs??null,next.retrievability]);return {ok:true,dueAt:next.dueAt,retrievability:next.retrievability};});

app.post('/api/diagnostic/generate',{preHandler:requireUser},async(req,reply)=>{const u=(req as any).user;const p=await userProfile(req,String((req.body as any).profileId));if(!p)return reply.code(404).send({error:'Profile not found'});if(!requireConfirmed(p,reply))return;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 35',[p.id])).rows;if(!chunks.length)return reply.code(400).send({error:'Upload material first'});const qs=await generateQuestions(p,chunks,12,'diagnostic');const ids=await addQuestionSet(p,qs);const r=await q<{id:string}>('insert into diagnostic_runs(user_id,profile_id,question_ids) values($1,$2,$3) returning id',[u.id,p.id,ids]);return {id:r.rows[0].id,questionIds:ids};});
app.get('/api/diagnostic/next',{preHandler:requireUser},async req=>{const u=(req as any).user,id=String((req.query as any).id);const r=await q<any>('select d.*,p.exam_id,p.subject,p.target_grade from diagnostic_runs d join study_profiles p on p.id=d.profile_id where d.id=$1 and d.user_id=$2',[id,u.id]);if(!r.rows[0])return {question:null};const d=r.rows[0];const done=(await q<any>('select question_id from attempts where user_id=$1 and question_id=any($2::uuid[])',[u.id,d.question_ids])).rows.map((x:any)=>x.question_id);const next=d.question_ids.find((x:string)=>!done.includes(x));if(!next)return {question:null,done:true};const qq=(await q<any>('select id,type,difficulty,skill,prompt,choices,max_score,provenance from questions where id=$1 and verified=true and ai_verified=true',[next])).rows[0];return {question:qq?publicQuestion(qq):null};});

app.post('/api/mock/generate',{preHandler:requireUser},async(req,reply)=>{
  const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return reply.code(404).send({error:'Profile not found'});if(!requireConfirmed(p,reply))return;
  const count=ensureRange(Number(b.count)||25,5,50,'Question count'); const duration=ensureRange(Number(b.duration)||120,10,300,'Duration');
  const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 50',[p.id])).rows;if(!chunks.length)return reply.code(400).send({error:'Upload material first'});
  const qs=await generateQuestions(p,chunks,count,'mock');const ids=await addQuestionSet(p,qs);
  const r=await q<{id:string}>('insert into mock_exams(user_id,profile_id,title,mode,status,duration_minutes,blueprint,question_ids) values($1,$2,$3,\'full\',\'draft\',$4,$5,$6) returning id',[u.id,p.id,b.title||'RecallForge Mock Exam',duration,JSON.stringify({type:'mixed',targetGrade:p.target_grade,calibration:'AI-verified training mock; not an official-equivalent score unless calibration data is loaded'}),ids]);
  return {id:r.rows[0].id,questionIds:ids,duration};
});
app.get('/api/mock/:id',{preHandler:requireUser},async req=>{
  const u=(req as any).user,id=String((req.params as any).id);const m=(await q<any>('select * from mock_exams where id=$1 and user_id=$2',[id,u.id])).rows[0];if(!m)return {error:'Mock not found'};
  const qs=(await q<any>('select id,type,difficulty,skill,prompt,choices,max_score,provenance from questions where id=any($1::uuid[])',[m.question_ids])).rows;
  const answers=(await q<any>('select question_id,response from mock_answers where mock_id=$1',[id])).rows;
  const submitted=m.status==='submitted';
  const details=submitted?(await q<any>('select question_id,response,score,max_score,grading from mock_answers where mock_id=$1',[id])).rows:answers;
  return {mock:m,questions:qs.map(publicQuestion),answers:details,scoreReleased:submitted};
});
app.post('/api/mock/:id/start',{preHandler:requireUser},async req=>{
  const u=(req as any).user,id=String((req.params as any).id);const m=(await q<any>('select id,status,duration_minutes,started_at,ends_at from mock_exams where id=$1 and user_id=$2',[id,u.id])).rows[0];if(!m)return {error:'Mock not found'};
  if(m.status==='submitted')return {error:'Mock already submitted'};
  const ends=m.ends_at??new Date(Date.now()+Number(m.duration_minutes||120)*60000);
  await q('update mock_exams set status=\'active\',started_at=coalesce(started_at,now()),ends_at=coalesce(ends_at,$1) where id=$2 and user_id=$3',[ends,id,u.id]);return {ok:true,endsAt:ends};
});
app.post('/api/mock/:id/answer',{preHandler:requireUser},async req=>{
  const u=(req as any).user,id=String((req.params as any).id),b=req.body as any;
  const mock=(await q<any>('select m.*,p.exam_id,p.subject,p.target_grade,p.exam_year from mock_exams m join study_profiles p on p.id=m.profile_id where m.id=$1 and m.user_id=$2',[id,u.id])).rows[0];if(!mock)return {error:'Mock not found'};
  if(mock.status!=='active')return {error:'Mock is not active'};
  if(mock.ends_at && new Date(mock.ends_at).getTime()<=Date.now())return {error:'Time has expired; submit the mock now.'};
  const question=(await q<any>('select * from questions where id=$1 and id=any($2::uuid[]) and verified=true and ai_verified=true',[b.questionId,mock.question_ids])).rows[0];if(!question)return {error:'Question not in mock'};
  await q('insert into mock_answers(mock_id,question_id,response,submitted_at) values($1,$2,$3,now()) on conflict(mock_id,question_id) do update set response=excluded.response,submitted_at=excluded.submitted_at',[id,question.id,JSON.stringify(b.response)]);
  return {ok:true,scoreHidden:true};
});
app.post('/api/mock/:id/submit',{preHandler:requireUser},async req=>{
  const u=(req as any).user,id=String((req.params as any).id);const mock=(await q<any>('select m.*,p.exam_id,p.subject,p.target_grade,p.exam_year from mock_exams m join study_profiles p on p.id=m.profile_id where m.id=$1 and m.user_id=$2',[id,u.id])).rows[0];if(!mock)return {error:'Mock not found'};
  if(mock.status==='submitted')return {ok:true,...(mock.result??{}),details:await q<any>('select question_id,score,max_score,grading from mock_answers where mock_id=$1',[id]).then(x=>x.rows)};
  if(!['active'].includes(mock.status))return {error:'Start the mock before submitting it'};
  const questions=(await q<any>('select * from questions where id=any($1::uuid[]) and verified=true and ai_verified=true',[mock.question_ids])).rows;
  const answers=(await q<any>('select * from mock_answers where mock_id=$1',[id])).rows; const byId=new Map<string,any>(answers.map((a:any)=>[String(a.question_id),a]));
  const details:any[]=[]; let total=0,maxTotal=0;
  for(const qn of questions){
    const a=byId.get(String(qn.id)); const max=Number(qn.max_score??qn.provenance?.maxScore??1); maxTotal+=max;
    let grade:any;
    if(!a){grade={score:0,maxScore:max,confidence:1,strictErrors:['No answer submitted.'],feedback:'No answer was submitted; the available marks cannot be awarded.',corrections:[`Review ${qn.skill} and attempt this item under retrieval conditions.`],modelAnswer:'',retestSkill:qn.skill,rubricOutcomes:[],severity:'major'};}
    else if(qn.choices){grade=objectiveGrade(qn,JSON.parse(a.response));}
    else grade=await gradeAnswer({exam_id:mock.exam_id,subject:mock.subject,target_grade:mock.target_grade,exam_year:mock.exam_year},qn,JSON.parse(a.response));
    grade={...grade,score:Math.max(0,Math.min(max,Number(grade.score)||0)),maxScore:max}; total+=Number(grade.score)||0;
    if(a){await q('update mock_answers set score=$1,max_score=$2,grading=$3,submitted_at=now() where mock_id=$4 and question_id=$5',[grade.score,max,JSON.stringify(grade),id,qn.id]);}
    await q('insert into attempts(user_id,question_id,task_type,response,score,max_score,strict_errors,ai_feedback,grading) values($1,$2,\'mock\',$3,$4,$5,$6,$7,$8)',[u.id,qn.id,a?.response??JSON.stringify(null),grade.score,max,JSON.stringify(grade.strictErrors),grade.feedback,JSON.stringify(grade)]);
    const ratio=max?Number(grade.score)/max:0; await q('insert into mastery(user_id,profile_id,skill,mastery,confidence,attempts,correct,last_seen_at) values($1,$2,$3,$4,$5,1,$6,now()) on conflict(user_id,profile_id,skill) do update set mastery=greatest(0,least(1,mastery*0.75+excluded.mastery*0.25)),confidence=least(1,mastery.confidence+0.04),attempts=mastery.attempts+1,correct=mastery.correct+excluded.correct,last_seen_at=now()',[u.id,mock.profile_id,qn.skill,ratio,0.5,ratio>=0.999?1:0]);
    details.push({question_id:qn.id,score:grade.score,max_score:max,grading:grade});
  }
  const result={percentage:maxTotal?total/maxTotal:0,strict:true,expired:Boolean(mock.ends_at && new Date(mock.ends_at).getTime()<=Date.now()),totalScore:total,maxScore:maxTotal};
  await q('update mock_exams set status=\'submitted\',submitted_at=now(),total_score=$1,max_score=$2,result=$3 where id=$4 and user_id=$5',[total,maxTotal,JSON.stringify(result),id,u.id]);
  return {ok:true,...result,details};
});
app.post('/api/game/generate',{preHandler:requireUser},async(req,reply)=>{const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return reply.code(404).send({error:'Profile not found'});if(!requireConfirmed(p,reply))return;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 25',[p.id])).rows;if(!chunks.length)return reply.code(400).send({error:'Upload material first'});const g=await makeGame(p,chunks,b.mode||'classification');const r=await q<{id:string}>('insert into games(user_id,profile_id,game_type,payload,skill) values($1,$2,$3,$4,$5) returning id',[u.id,p.id,g.type,JSON.stringify(g),g.skill]);return {id:r.rows[0].id,game:g};});
app.post('/api/game/:id/complete',{preHandler:requireUser},async req=>{const u=(req as any).user,b=req.body as any;await q('update games set score=$1,completed_at=now() where id=$2 and user_id=$3',[Number(b.correct)?1:0,String((req.params as any).id),u.id]);return {ok:true};});

app.post('/api/tutor',{preHandler:requireUser},async (req,reply)=>{const b=req.body as any,p=await userProfile(req,b.profileId);if(!p)throw new Error('Profile not found');if(!requireConfirmed(p,reply))return;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 15',[p.id])).rows;return tutor(p,b.question,chunks);});
app.post('/api/video-script',{preHandler:requireUser},async (req,reply)=>{const b=req.body as any,p=await userProfile(req,b.profileId);if(!p)throw new Error('Profile not found');if(!requireConfirmed(p,reply))return;const chunks=(await q<any>('select mc.id,mc.content from material_chunks mc join materials m on m.id=mc.material_id where m.profile_id=$1 and m.status=\'ready\' order by random() limit 15',[p.id])).rows;return videoScript(p,b.topic,chunks);});
app.post('/api/diagnostic/analyze',{preHandler:requireUser},async req=>{const u=(req as any).user,b=req.body as any,p=await userProfile(req,b.profileId);if(!p)return {error:'Profile not found'};const skills=(await q<any>('select skill,mastery,confidence,attempts,correct from mastery where profile_id=$1 and user_id=$2',[p.id,u.id])).rows;return diagnostic(p,skills);});
app.get('/api/analytics',{preHandler:requireUser},async req=>{const u=(req as any).user,p=await userProfile(req,String((req.query as any).profileId));if(!p)return {analytics:null};const a=await q<any>('select skill,count(*) attempts,avg(score/nullif(max_score,0)) accuracy from attempts a join questions qn on qn.id=a.question_id where a.user_id=$1 and qn.profile_id=$2 group by skill order by accuracy asc',[u.id,p.id]);const r=await q<any>('select count(*) reviews,avg(retrievability) retrievability from card_reviews cr join cards c on c.id=cr.card_id where cr.user_id=$1 and c.profile_id=$2',[u.id,p.id]);return {skills:a.rows,reviews:r.rows[0]};});

app.get('/health',async()=>({ok:true,service:'recallforge',time:new Date().toISOString()}));
app.get('/*',async(req,reply)=>reply.sendFile('index.html'));
await app.listen({port:env.PORT,host:'0.0.0.0'});
process.on('SIGTERM',async()=>{await app.close();await pool.end();process.exit(0)});
