import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { env } from './config.js';
import {OAuth2Client} from 'google-auth-library';
import {decrypt} from './crypto.js';
import {q} from './db.js';
import { validateExternalUrl } from './security.js';
import { extractImageText } from './ai.js';
import { fetchTranscript } from 'youtube-transcript';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
export async function ensureUploadDir(){await fs.mkdir(path.resolve(__dirname,'..',env.UPLOAD_DIR),{recursive:true});}
function splitText(text:string,size=6000){const clean=text.replace(/\r/g,'').trim();const out:string[]=[];for(let i=0;i<clean.length;i+=size)out.push(clean.slice(i,i+size));return out.filter(Boolean);}
async function extractPptx(buf:Buffer){const zip=await JSZip.loadAsync(buf);const names=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>{const na=Number(a.match(/slide(\d+)/)?.[1]||0),nb=Number(b.match(/slide(\d+)/)?.[1]||0);return na-nb});const out:string[]=[];for(const n of names){const xml=await zip.file(n)!.async('text');const texts=[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>m[1]).join(' ');if(texts.trim())out.push(texts.trim())}return out.join('\n\n')}
async function extractLocal(filePath:string,mime:string){const buf=await fs.readFile(filePath); if(mime==='application/pdf'){const p=await pdfParse(buf);return p.text;} if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){return (await mammoth.extractRawText({buffer:buf})).value;} if(mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||mime==='application/vnd.ms-excel'||mime==='text/csv'){const wb=XLSX.read(buf,{type:'buffer'});return wb.SheetNames.map(n=>`[SHEET ${n}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');} if(mime==='application/vnd.openxmlformats-officedocument.presentationml.presentation'){return extractPptx(buf);} if(mime.startsWith('text/')||mime==='application/json')return buf.toString('utf8'); return ''}
function googleIdFromUrl(url:string){const m=url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)||url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);return m?.[1]??null;}
export async function importGoogle(userId:string,url:string){const row=await q<{google_refresh_token_enc:string|null}>('select google_refresh_token_enc from users where id=$1',[userId]); if(!row.rows[0]?.google_refresh_token_enc)throw new Error('Google Drive access was not granted. Sign in again to grant Drive read access.');const rt=decrypt(row.rows[0].google_refresh_token_enc);const client=new OAuth2Client(env.GOOGLE_CLIENT_ID,env.GOOGLE_CLIENT_SECRET,`${env.APP_ORIGIN}/auth/google/callback`);client.setCredentials({refresh_token:rt});const id=googleIdFromUrl(url);if(!id)throw new Error('Unsupported Google Docs/Sheets URL');
  if(url.includes('/document/')){const {google: g}=await import('googleapis'); const docs=g.docs({version:'v1',auth:client});const d=await docs.documents.get({documentId:id});const content=(d.data.body?.content??[]).map((x:any)=>(x.paragraph?.elements??[]).map((e:any)=>e.textRun?.content??'').join('')).join('\n');return {kind:'google_doc',text:content,title:d.data.title??'Google Doc'};}
  const {google:g}=await import('googleapis'); const sheets=g.sheets({version:'v4',auth:client});const s=await sheets.spreadsheets.values.get({spreadsheetId:id,range:'A:ZZ'});const text=(s.data.values??[]).map((r:any[])=>r.join('\t')).join('\n');return {kind:'google_sheet',text,title:(await sheets.spreadsheets.get({spreadsheetId:id})).data.properties?.title??'Google Sheet'};
}
export async function saveMaterial(userId:string,profileId:string,opts:{kind:string,originalName?:string,mimeType?:string,url?:string,storageKey?:string,filePath?:string,text?:string,metadata?:any}){
  let text=opts.text??''; if(opts.filePath) text=await extractLocal(opts.filePath,opts.mimeType??'');
  if(opts.filePath && (opts.mimeType??'').startsWith('image/')) { text = await extractImageText(await fs.readFile(opts.filePath), opts.mimeType??'image/png'); }
  if(opts.url && !text){
    const checked=await validateExternalUrl(opts.url); const normalized=checked.toString();
    const u=checked;
    if(u.hostname==='youtube.com'||u.hostname.endsWith('.youtube.com')||u.hostname==='youtu.be'){const t=await fetchTranscript(normalized); text=t.map((x:any)=>x.text).join(' '); opts.kind='youtube';}
    else if(u.hostname==='docs.google.com'){const g=await importGoogle(userId,normalized);text=g.text;opts.originalName=g.title;}
    else{
      const r=await fetch(normalized,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'user-agent':'RecallForge/1.0'}});
      if(r.status>=300 && r.status<400) throw new Error('Redirected linked resources are not accepted; use the final HTTPS URL.');
      const ct=r.headers.get('content-type')??'';
      if(!ct.includes('text/html')&&!ct.includes('text/plain')&&!ct.includes('application/json')) throw new Error('Linked resource is not a text-readable document');
      const len=Number(r.headers.get('content-length')||0); if(len>20_000_000)throw new Error('Linked resource is too large');
      const body=await r.text(); if(body.length>20_000_000)throw new Error('Linked resource is too large');
      text=body.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    }
  }
  if(opts.filePath && !text.trim()) throw new Error('No readable study content was extracted from this file type.');
  if(!text.trim()) throw new Error('No readable study content was found at this source.');
  const sha=crypto.createHash('sha256').update(text).digest('hex');const r=await q<{id:string}>('insert into materials(user_id,profile_id,kind,original_name,source_url,storage_key,mime_type,extracted_text,metadata,sha256,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,\'ready\') returning id',[userId,profileId,opts.kind,opts.originalName??null,opts.url??null,opts.storageKey??null,opts.mimeType??null,text,opts.metadata??{},sha]);
  const chunks=splitText(text);for(let i=0;i<chunks.length;i++)await q('insert into material_chunks(material_id,chunk_index,content,token_estimate) values($1,$2,$3,$4)',[r.rows[0].id,i,chunks[i],Math.ceil(chunks[i].length/4)]);return r.rows[0].id;
}
