import crypto from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from './config.js';
import { q } from './db.js';
import { encrypt } from './crypto.js';
import { OAuth2Client } from 'google-auth-library';
import { hashToken, newToken } from './security.js';

function googleClient(){return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.APP_ORIGIN}/auth/google/callback`);}
const scopes=['openid','email','profile','https://www.googleapis.com/auth/drive.readonly'];

type SessionUser={id:string,email:string,name:string,avatar_url?:string};
export async function getUser(req:FastifyRequest):Promise<SessionUser|null>{
  const token=req.cookies.rf_session;if(!token)return null;
  const row=await q<SessionUser>('select u.id,u.email,u.name,u.avatar_url from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()',[hashToken(token)]);
  return row.rows[0]??null;
}
async function setSession(reply:FastifyReply,userId:string){
  const token=newToken();
  await q('insert into sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval \'30 days\')',[userId,hashToken(token)]);
  reply.setCookie('rf_session',token,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*30});
}
export function authRoutes(app:FastifyInstance){
  app.get('/auth/google',(req,reply)=>{
    const state=crypto.randomBytes(24).toString('base64url');
    reply.setCookie('rf_oauth_state',state,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax',path:'/auth',maxAge:600});
    const google=googleClient();
    const url=google.generateAuthUrl({access_type:'offline',prompt:'consent',scope:scopes,state});
    reply.redirect(url);
  });
  app.get('/auth/google/callback',async(req,reply)=>{
    try{
      const qp=req.query as any;
      if(!qp.code||qp.state!==req.cookies.rf_oauth_state)return reply.code(400).send('Invalid OAuth state');
      const google=googleClient();
      const {tokens}=await google.getToken(qp.code);
      if(!tokens.id_token)throw new Error('Google returned no ID token');
      const ticket=await google.verifyIdToken({idToken:tokens.id_token,audience:env.GOOGLE_CLIENT_ID});
      const p=ticket.getPayload();
      if(!p?.sub||!p.email||!p.name)return reply.code(400).send('Google identity incomplete');
      const rt=tokens.refresh_token?encrypt(tokens.refresh_token):null;
      const r=await q<{id:string}>('insert into users(google_sub,email,name,avatar_url,google_refresh_token_enc) values($1,$2,$3,$4,$5) on conflict(google_sub) do update set email=excluded.email,name=excluded.name,avatar_url=excluded.avatar_url,google_refresh_token_enc=coalesce(excluded.google_refresh_token_enc,users.google_refresh_token_enc),updated_at=now() returning id',[p.sub,p.email,p.name,p.picture??null,rt]);
      await setSession(reply,r.rows[0].id);
      reply.clearCookie('rf_oauth_state',{path:'/auth'});
      reply.redirect('/');
    }catch(e){app.log.error(e);reply.code(500).send('Google authentication failed');}
  });
  app.post('/auth/logout',async(req,reply)=>{
    const token=req.cookies.rf_session;
    if(token)await q('delete from sessions where token_hash=$1',[hashToken(token)]);
    reply.clearCookie('rf_session',{path:'/'});reply.send({ok:true});
  });
}
export async function requireUser(req:FastifyRequest,reply:FastifyReply){
  const method=req.method.toUpperCase();
  if(!['GET','HEAD','OPTIONS'].includes(method)){
    const origin=req.headers.origin;
    if(origin && origin!==env.APP_ORIGIN)return reply.code(403).send({error:'Cross-origin request blocked'});
  }
  const u=await getUser(req);if(!u)return reply.code(401).send({error:'unauthenticated'});(req as any).user=u;
}
