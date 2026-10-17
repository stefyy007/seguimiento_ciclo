const Security = (() => {
  const META_KEY = 'miCicloSecurityMetaV1';
  const DB_NAME = 'MiCicloEncryptedDB';
  const STORE = 'secure';
  const DATA_KEY = 'payload';
  const te = new TextEncoder();
  const td = new TextDecoder();
  let masterKey = null;

  const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const b64url = bytes => b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const unb64url = str => unb64(str.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-str.length%4)%4));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function dbGet(key){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function dbSet(key,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}

  async function derivePinKey(pin,salt){
    const base=await crypto.subtle.importKey('raw',te.encode(pin),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function importAes(raw){return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
  async function exportAes(key){return new Uint8Array(await crypto.subtle.exportKey('raw',key));}
  async function encryptWith(key,bytes){const iv=rand(12);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);return{iv:b64(iv),ct:b64(ct)};}
  async function decryptWith(key,obj){return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(obj.iv)},key,unb64(obj.ct)));}

  function hasSetup(){return !!localStorage.getItem(META_KEY);}
  function getMeta(){const s=localStorage.getItem(META_KEY);return s?JSON.parse(s):null;}

  async function setup(pin,initialData){
    if(!/^\d{6}$/.test(pin)) throw new Error('El PIN debe tener 6 dígitos.');
    const salt=rand(16), pinKey=await derivePinKey(pin,salt), rawMaster=rand(32);
    masterKey=await importAes(rawMaster);
    const wrappedPin=await encryptWith(pinKey,rawMaster);
    const recoveryRaw=rand(32), recoveryKey=await importAes(recoveryRaw);
    const wrappedRecovery=await encryptWith(recoveryKey,rawMaster);
    const meta={version:1,salt:b64(salt),wrappedPin,wrappedRecovery,createdAt:new Date().toISOString()};
    localStorage.setItem(META_KEY,JSON.stringify(meta));
    await saveData(initialData);
    return b64url(recoveryRaw);
  }

  async function unlockWithPin(pin){
    const meta=getMeta(); if(!meta) throw new Error('La app no está configurada.');
    try{const pinKey=await derivePinKey(pin,unb64(meta.salt));const raw=await decryptWith(pinKey,meta.wrappedPin);masterKey=await importAes(raw);return true;}catch{masterKey=null;throw new Error('PIN incorrecto.');}
  }
  async function unlockWithRecovery(code){
    const meta=getMeta(); if(!meta) throw new Error('La app no está configurada.');
    try{const rawRecovery=unb64url(code.trim());const recoveryKey=await importAes(rawRecovery);const raw=await decryptWith(recoveryKey,meta.wrappedRecovery);masterKey=await importAes(raw);return true;}catch{masterKey=null;throw new Error('Clave de recuperación inválida.');}
  }
  function lock(){masterKey=null;}
  function isUnlocked(){return !!masterKey;}

  async function saveData(data){
    if(!masterKey) throw new Error('La app está bloqueada.');
    const enc=await encryptWith(masterKey,te.encode(JSON.stringify(data)));
    await dbSet(DATA_KEY,enc);
  }
  async function loadData(){
    if(!masterKey) throw new Error('La app está bloqueada.');
    const enc=await dbGet(DATA_KEY); if(!enc) return null;
    const bytes=await decryptWith(masterKey,enc); return JSON.parse(td.decode(bytes));
  }
  async function exportBackup(){
    const meta=getMeta(), payload=await dbGet(DATA_KEY);
    return {app:'Mi Ciclo',version:1,exportedAt:new Date().toISOString(),security:meta,payload};
  }
  async function importBackup(obj){
    if(!obj || obj.app!=='Mi Ciclo' || !obj.security || !obj.payload) throw new Error('El archivo no es un respaldo válido de Mi Ciclo.');
    localStorage.setItem(META_KEY,JSON.stringify(obj.security));
    await dbSet(DATA_KEY,obj.payload); masterKey=null;
  }
  return {hasSetup,setup,unlockWithPin,unlockWithRecovery,lock,isUnlocked,saveData,loadData,exportBackup,importBackup};
})();
