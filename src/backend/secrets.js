import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
function key() {
 const value=Buffer.from(process.env.ACCOUNT_SECRET_KEY||'','hex');
 if(value.length!==32) throw new Error('ACCOUNT_SECRET_KEY must contain 32 random bytes in hex');
 return value;
}
export function encrypt(value) {
 if(!value) return null;
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
 return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
}
export function decrypt(value) {
 if(!value) return '';
 const bytes=Buffer.from(value), decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
}
