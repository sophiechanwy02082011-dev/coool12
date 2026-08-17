import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('..',import.meta.url).pathname;
const required=['src/server.ts','src/ai.ts','src/auth.ts','src/materials.ts','src/security.ts','src/srs.ts','src/examPacks.ts','src/examCalibration.ts','db/schema.sql','public/index.html'];
for(const f of required){if(!fs.existsSync(root+f))throw new Error(`Missing required file: ${f}`);}
const html=fs.readFileSync(root+'public/index.html','utf8');
const js=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
new vm.Script(js,{filename:'public/index.html#script'});
const server=fs.readFileSync(root+'src/server.ts','utf8');
const checks={
  noAnswerLeak: !/api\/questions\/next[\s\S]{0,800}select q\.\*/.test(server),
  calibrationSeparated: server.includes('calibration_verified,false') || server.includes('false,$12'),
  mockHasExpiry: server.includes('ends_at'),
  deterministicMcq: server.includes('objectiveGrade'),
  sessionHashing: fs.readFileSync(root+'src/auth.ts','utf8').includes('hashToken'),
  ssrfProtection: fs.readFileSync(root+'src/materials.ts','utf8').includes('validateExternalUrl'),
  srs: fs.readFileSync(root+'src/srs.ts','utf8').includes('stability') && fs.readFileSync(root+'src/srs.ts','utf8').includes('retrievability'),
};
for(const [k,v] of Object.entries(checks)) if(!v) throw new Error(`Self-audit failed: ${k}`);
console.log(JSON.stringify({ok:true,checks},null,2));
