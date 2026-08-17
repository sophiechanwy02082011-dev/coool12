import crypto from 'node:crypto';
import { env } from './config.js';
const key=Buffer.from(env.ENCRYPTION_KEY,'hex');
export function encrypt(value:string){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const enc=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;}
export function decrypt(value:string){const [ivS,tagS,dataS]=value.split('.');const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivS,'base64url'));decipher.setAuthTag(Buffer.from(tagS,'base64url'));return Buffer.concat([decipher.update(Buffer.from(dataS,'base64url')),decipher.final()]).toString('utf8');}
