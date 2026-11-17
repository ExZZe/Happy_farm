/* Авторизация для «Грядки»: ник + пароль, прогресс (монеты, семена, улучшения) хранится в Supabase.
   Подключать ПЕРЕД multiplayer.js:  <script src="auth.js"></script><script src="multiplayer.js"></script>
   Использует глобалы игры: S, SB_URL, sbH, lbId, lbSent, lbDraw, lbLoad, addSeed, sync, setMode, reset, save, SLT... Серверные функции — в auth.sql. */
(()=>{
const AK='farm2tok',AC='farm2acc',AN='farm2nm';
const KEYS=['coins','earn','seeds','disc','mu','hyb','up','best','mult','glue','day'];
const el=(t,p)=>Object.assign(document.createElement(t),p||{});
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const rpc=async(f,b,keep)=>{const r=await fetch(SB_URL+'/rest/v1/rpc/'+f,{method:'POST',headers:sbH,keepalive:!!keep,body:JSON.stringify(b||{})});if(!r.ok)throw new Error(f+' '+r.status);const t=await r.text();return t?JSON.parse(t):null};
const call=async(f,b)=>{try{return await rpc(f,b)}catch(e){throw new Error(/ 404/.test(e.message)?'На сервере нет функций входа: выполни auth.sql в Supabase':'Нет связи с сервером, попробуй ещё раз')}};
const newId=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,8);

let tok=null,lastFp='',lastOk=0,busy=false,ready;
window.authReady=new Promise(r=>ready=r);   // multiplayer.js стартует только после входа
const legacyName=S.name;S.name='';           // пока не вошли — ничего не отправляем в рейтинг

// ---------- данные аккаунта ----------
const pack=()=>{const o={ts:S.ts||0};KEYS.forEach(k=>o[k]=S[k]);return o};
const fpOf=()=>JSON.stringify(KEYS.filter(k=>k!='day').map(k=>S[k]));
const emptyTiles=()=>{S.tiles=[];for(let i=0;i<CO*RO;i++)S.tiles.push({till:0,hole:0,wet:0,ps:[]})};
function apply(d,same){const n=(v,a)=>Number.isFinite(v)?v:a,o=v=>v&&typeof v=='object'&&!Array.isArray(v)?v:{};
 S.coins=n(d.coins,25);S.earn=n(d.earn,0);S.best=n(d.best,0);S.day=n(d.day,1);S.ts=n(d.ts,0);
 S.disc=o(d.disc);S.mu=o(d.mu);S.hyb=o(d.hyb);S.up=o(d.up);if(d.mult!=null)S.mult=n(d.mult,1);if(d.glue!=null)S.glue=d.glue?1:0;
 const sd=(Array.isArray(d.seeds)?d.seeds:[]).filter(s=>s&&SP[s.sp]&&Number.isFinite(s.n)&&s.n>0&&Array.isArray(s.m));
 S.seeds=[];sd.forEach(s=>addSeed(s,s.n));
 if(!Array.isArray(d.seeds)){addSeed({sp:0,h:0,z:1,r:1,y:1,m:[]},10);addSeed({sp:1,h:0,z:1,r:1,y:1,m:[]},6)}
 if(!same)emptyTiles();            // поле не хранится на сервере; на чужом устройстве оно начинается пустым
 SLT=[null,null];parts=[];fls=[];sync();setMode('farm')}

async function push(force,keep){if(!tok)return;const fp=fpOf();if(!force&&fp===lastFp)return;if(fp!==lastFp)S.ts=Date.now();
 try{const r=await fetch(SB_URL+'/rest/v1/rpc/farm_save',{method:'POST',headers:sbH,keepalive:!!keep,body:JSON.stringify({p_token:tok,p_data:pack()})});
  if(!r.ok)throw 0;const ok=await r.json();if(ok===false){tok=null;ls.del(AK);showAuth('Сессия закончилась, войди заново');return}lastFp=fp;lastOk=Date.now()}catch(e){}}
setInterval(async()=>{if(!tok||busy)return;busy=true;try{await push()}finally{busy=false}},8000);
addEventListener('pagehide',()=>push(false,true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)push(false,true)});

// ---------- вход в аккаунт ----------
const bu=el('button',{id:'bu',hidden:true});hud.append(bu);
const drawBtn=()=>{bu.hidden=false;bu.textContent='👤 '+S.name};
function enter(r,mode){const same=ls.get(AC)===r.key,d=r.data||{};
 lbId=r.pid;ls.set('farm2id',r.pid);ls.set(AK,tok);ls.set(AN,r.name);
 if(mode=='reg'){S.ts=Date.now();lastFp=fpOf()}                         // регистрация: сервер уже получил наш прогресс
 else if(mode=='resume'&&same&&(d.ts||0)<=(S.ts||0))lastFp='';          // локальная копия новее — отправим её
 else{apply(d,same);lastFp=fpOf()}                                      // иначе источник правды — сервер
 ls.set(AC,r.key);S.name=r.name;lbSent=-1;lastOk=Date.now();
 drawBtn();au.style.display='none';ready();lbDraw();lbLoad();save()}

async function doLogin(u,p){const r=await call('farm_login',{p_name:u,p_pass:p});
 if(r.error)throw new Error(r.error=='locked'?'Слишком много неверных попыток. Подожди 5 минут':'Неверный ник или пароль');
 tok=r.token;enter(r,'login')}
async function doReg(u,p){const fresh=!!ls.get(AC);               // на устройстве уже был чужой аккаунт — начинаем с нуля
 if(fresh){reset();S.best=0}
 const pid=(!fresh&&lbId&&lbId.length>=16)?lbId:newId();
 const r=await call('farm_register',{p_name:u,p_pass:p,p_pid:pid,p_data:pack()});
 if(r.error)throw new Error({name:'Ник: 3–16 символов — буквы, цифры, _ . -',pass:'Пароль: от 6 до 72 символов',taken:'Этот ник уже занят',pid:'Ошибка идентификатора, обнови страницу',data:'Слишком большой прогресс'}[r.error]||'Не удалось зарегистрироваться');
 tok=r.token;enter(r,'reg')}

// ---------- окно входа ----------
const au=el('div',{id:'au'});au.style.cssText='position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;overflow:auto';document.body.append(au);
function showAuth(msg,tab0){let tab=tab0||(ls.get(AC)?'in':'up'),bz=0;au.style.display='flex';
 au.innerHTML=`<form style="background:var(--pn);color:var(--fg);padding:20px;border-radius:12px;width:min(360px,90%);box-sizing:border-box">
  <h2 style="margin:0 0 10px">🌱 Грядка</h2><div class="tb"><button type="button" data-t="in">Вход</button><button type="button" data-t="up">Регистрация</button></div>
  <p class="hn" style="font-size:13px;opacity:.85;margin:10px 0 4px"></p>
  <input name="u" maxlength="16" placeholder="Никнейм" autocomplete="username"><input name="p" type="password" maxlength="72" placeholder="Пароль"><input name="p2" type="password" maxlength="72" placeholder="Повтори пароль" autocomplete="new-password">
  <p class="er" style="color:#f88;min-height:1.3em;margin:6px 0"></p><button type="submit" class="go" style="width:100%"></button></form>`;
 const f=au.firstElementChild,er=f.querySelector('.er'),go=f.querySelector('.go'),hn=f.querySelector('.hn');
 f.querySelectorAll('input').forEach(i=>i.style.cssText='display:block;width:100%;box-sizing:border-box;margin:6px 0;padding:9px;border-radius:8px;border:1px solid var(--ac);background:var(--bg);color:var(--fg);font:inherit');
 const draw=()=>{f.querySelectorAll('.tb button').forEach(b=>{const on=b.dataset.t==tab;b.style.background=on?'var(--ac)':'var(--pn)';b.style.color=on?'#1d1a14':'var(--fg)'});
  f.p2.style.display=tab=='up'?'block':'none';f.p.autocomplete=tab=='up'?'new-password':'current-password';go.textContent=tab=='up'?'Создать аккаунт':'Войти';
  hn.textContent=tab=='up'?(ls.get(AC)?'Новый аккаунт начнёт с нуля. Монеты, семена и улучшения будут сохраняться в базе.':'Монеты, семена и улучшения с этого устройства перейдут в новый аккаунт и будут сохраняться в базе.'):'Войди, чтобы загрузить сохранённые монеты, семена и улучшения. Поле на новом устройстве начнётся пустым.'};
 f.querySelectorAll('.tb button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;er.textContent='';draw()});
 f.u.value=legacyName||ls.get(AN)||'';draw();er.textContent=msg||'';
 f.onsubmit=async e=>{e.preventDefault();if(bz)return;const u=f.u.value.trim(),p=f.p.value;er.textContent='';
  if(!u||!p){er.textContent='Введи ник и пароль';return}if(tab=='up'&&p!==f.p2.value){er.textContent='Пароли не совпадают';return}
  bz=1;go.disabled=true;try{tab=='up'?await doReg(u,p):await doLogin(u,p)}catch(x){er.textContent=x.message}bz=0;go.disabled=false};
 setTimeout(()=>f.u.focus(),50)}

// ---------- окно аккаунта ----------
bu.onclick=()=>{mb.innerHTML='<h2>👤 Аккаунт</h2><p class="a1"></p><p class="a2" style="opacity:.8;font-size:13px"></p><button class="s1">💾 Сохранить сейчас</button> <button class="s2">🚪 Выйти</button>'+cls;md.hidden=false;
 const a1=mb.querySelector('.a1'),a2=mb.querySelector('.a2'),st=()=>a2.textContent='Прогресс сохраняется автоматически. '+(lastOk?'Последнее сохранение: '+new Date(lastOk).toLocaleTimeString('ru'):'Ещё не сохранялось')+'. Поле не сохраняется.';
 a1.textContent='Ты вошёл как «'+S.name+'»';st();
 mb.querySelector('.s1').onclick=async()=>{await push(true);st()};
 mb.querySelector('.s2').onclick=async()=>{await push(true);try{await rpc('farm_logout',{p_token:tok})}catch(e){}ls.del(AK);location.reload()}};
// в аккаунте ник менять нельзя: он привязан к входу
const bl0=bl.onclick;bl.onclick=()=>{bl0();const ni=mb.querySelector('.nm'),sv=mb.querySelector('.sv');if(tok&&ni){ni.value=S.name;ni.disabled=true;sv.hidden=true}};

// ---------- старт ----------
async function boot(){const t=ls.get(AK);if(!t){showAuth();return}
 try{const r=await rpc('farm_resume',{p_token:t});if(r&&!r.error){tok=t;enter(r,'resume')}else{ls.del(AK);showAuth(r&&r.error=='session'?'Сессия закончилась, войди заново':'')}}
 catch(e){au.style.display='flex';au.innerHTML='<p style="color:#fff;font-size:17px">Нет связи с сервером… пробую снова</p>';setTimeout(boot,4000)}}
boot();
})();
