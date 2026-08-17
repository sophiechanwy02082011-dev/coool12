import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

export function hashToken(token:string){return crypto.createHash('sha256').update(token).digest('hex');}
export function newToken(){return crypto.randomBytes(32).toString('base64url');}

function isPrivateIp(ip:string){
  if(net.isIP(ip)===4){
    const [a,b]=ip.split('.').map(Number);
    return a===10 || a===127 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || a===0;
  }
  if(net.isIP(ip)===6){
    const x=ip.toLowerCase();
    return x==='::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
  }
  return true;
}

export async function validateExternalUrl(raw:string){
  let u:URL;
  try{u=new URL(raw);}catch{throw new Error('Invalid URL');}
  if(!['http:','https:'].includes(u.protocol))throw new Error('Only HTTP(S) URLs are supported');
  if(u.username||u.password)throw new Error('Authenticated URLs are not supported');
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host==='metadata.google.internal'||host==='169.254.169.254')throw new Error('Blocked URL host');
  if(net.isIP(host)){if(isPrivateIp(host))throw new Error('Private-network URLs are blocked');}
  else {
    const addrs=await dns.lookup(host,{all:true});
    if(!addrs.length||addrs.some(a=>isPrivateIp(a.address)))throw new Error('URL resolves to a private-network address');
  }
  return u;
}
