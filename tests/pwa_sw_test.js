'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
async function main() {
  const listeners={};const cachesDB=new Map();const seen=[];
  const base='https://u.github.io/trionfo-ferrarese/';
  const response=(url,ok=true)=>({url,ok,status:ok?200:404, type:'basic',clone(){return this;}});
  const mockCache=()=>({
    async addAll(urls){for(const url of urls) {if(!url.startsWith(base))throw new Error('BAD PATH '+url);this.data.set(url,response(url));} },
    data:new Map(),
    async match(req){return this.data.get(typeof req==='string'?req:req.url)},
    async put(req,res){this.data.set(typeof req==='string'?req:req.url,res)}
  });
  const caches={
    async open(name){if(!cachesDB.has(name))cachesDB.set(name,mockCache());return cachesDB.get(name);},
    async keys(){return [...cachesDB.keys()]},
    async delete(name){return cachesDB.delete(name)},
    async match(req){for(const v of cachesDB.values()){const r=await v.match(req);if(r)return r;}},
  };
  let offline=false,modelPresent=true;
  const f=async (request) => {
    const url=typeof request==='string'?request:request.url;
    seen.push(url);
    if(offline)throw Error('offline');
    return response(url,modelPresent||!url.endsWith('trionfo_v14.onnx'));
  };
  const self={registration:{scope:base},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  vm.runInNewContext(source,{self,URL,caches,fetch:f,Response:{error:()=>({ok:false})}}, {filename:'sw.js'});
  let promise;
  listeners.install({waitUntil: v=>{promise=v;}});await promise;
  assert.equal(cachesDB.size,1);
  const shell=[...cachesDB.values()][0];
  assert.equal(shell.data.size,54, '41 card PNGs + 13 shell entries');
  assert(shell.data.has(base+'assets/cards/denari_asso.png'));
  assert(shell.data.has(base+'index.html'));
  listeners.activate({waitUntil:v=>{promise=v;}});await promise;
  const sent=[];
  const msg=async type=>{
    sent.length=0;
    listeners.message({data:{type},ports:[{postMessage:v=>sent.push(v)}],waitUntil:v=>{promise=v;}});
    await promise;return sent.slice();
  };
  let r=await msg('OFFLINE_STATUS');assert.equal(r.at(-1).ready,false);
  r=await msg('OFFLINE_PREPARE');assert.equal(r.at(-1).type,'DONE');assert.equal(r.at(-1).ready,true);
  assert.equal(r.filter(m=>m.type==='PROGRESS').length,4);
  r=await msg('OFFLINE_STATUS');assert.equal(r.at(-1).ready,true);
  offline=true;
  const request={url:base+'models/trionfo_v14.onnx',method:'GET',mode:'no-cors'};
  listeners.fetch({request,respondWith:v=>{promise=v;}});
  const fallback=await promise;
  assert.equal(fallback.url,request.url, 'model should remain cached offline');
  listeners.fetch({request:{url:base+'index.html',method:'GET',mode:'navigate'},respondWith:v=>{promise=v;}});
  assert.equal((await promise).url,base+'index.html');
  offline=false;modelPresent=false;
  r=await msg('OFFLINE_PREPARE');assert.equal(r.at(-1).type,'ERROR', 'missing model must never be reported ready');
  console.log('OK: GitHub /repo/ scope, 41 card images cached, runtime/model cache and offline fallback, fail-closed on missing ONNX.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
