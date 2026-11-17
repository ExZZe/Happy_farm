/* Мультиплеер для «Грядки»: общий рынок, онлайн, биржа семян, фермы игроков (просмотр, рейды, пакости), семена 35%.
   Подключать ПОСЛЕ основного скрипта игры: тег script с src="multiplayer.js" перед закрывающим body.
   Использует SB_URL / SB_KEY / lbId из игры. Таблицы и функции создаёт schema.sql (запускать целиком). */
(()=>{
const rpc=async(f,b)=>{const r=await fetch(SB_URL+'/rest/v1/rpc/'+f,{method:'POST',headers:sbH,body:JSON.stringify(b||{})});if(!r.ok)throw new Error(f+' '+r.status);const t=await r.text();return t?JSON.parse(t):null};
const el=(t,p)=>Object.assign(document.createElement(t),p||{});
// данные от других игроков — недоверенные: проверяем и ограничиваем
const ok=g=>g&&Number.isInteger(g.sp)&&SP[g.sp]&&(g.x==null||(Number.isInteger(g.x)&&SP[g.x]))&&Array.isArray(g.m)&&g.m.every(k=>MU[k])&&[g.h,g.z,g.r,g.y].every(Number.isFinite);
const cg=g=>({sp:g.sp,x:g.x==null?undefined:g.x,h:cl(g.h,-60,60),z:cl(g.z,.7,1.8),r:cl(g.r,.7,2),y:cl(g.y,1,4),m:[...new Set(g.m)]});
const cleanTile=t=>({till:cl(+t.till||0,0,1),hole:cl(+t.hole||0,0,1),wet:cl(+t.wet||0,0,1),ps:(Array.isArray(t.ps)?t.ps:[]).slice(0,3).filter(p=>p&&ok(p.g)&&Number.isFinite(p.age)).map(p=>({g:cg(p.g),age:cl(p.age,0,1e5)}))});
const emptyTile=()=>({till:0,hole:0,wet:0,ps:[]});
// подпись клетки без «шума» (рост, влажность): в рейде хозяину отправляются только реально изменённые клетки
const sig=t=>JSON.stringify([Math.round(t.till*4),Math.round(t.hole*4),t.ps.map(p=>sid(p.g)+'|'+p.g.m.join())]);
let vis=null;const mine=()=>vis?vis.mine:S.tiles,on=k=>!!(S.fx&&S.fx[k]>Date.now());

// ---------- 1. Общий рынок (по реальному времени, одинаков у всех) ----------
const cyc=()=>Math.floor(Date.now()/(DAY*1000));
const rng=n=>{let a=(n*2654435761)>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}};
rollMk=function(){const R=rng(cyc());S.mkc=cyc();S.mk=SP.map(()=>{const r=R(),u=R();return +(r<.18?1.4+u*.6:r<.36?.5+u*.25:.9+u*.2).toFixed(2)})};
rollMk();
setInterval(()=>{if(S.mkc!==cyc()){rollMk();fl(550,300,'Рынок обновился (общий для всех)','#9cf')}},1000);

// ---------- 2. Онлайн ----------
let ONL=[];const baseDraw=lbDraw;
lbDraw=function(){baseDraw();if(lbMode=='db'&&ONL.length)document.getElementById('lb').append(' · 🟢 онлайн: '+ONL.length)};
async function ping(){if(!S.name)return;try{await rpc('farm_ping',{p_id:lbId,p_name:S.name});ONL=(await rpc('farm_online'))||[];lbDraw()}catch(e){}}
async function claim(){try{const c=await rpc('farm_claim',{p_id:lbId});if(c>0){S.coins+=c;fl(550,300,'Биржа: +'+c+M,'#9f9')}}catch(e){}}

// ---------- 3. Урожай: каждое семя выпадает с шансом 35% ----------
harvest=function(tl,p,x,y){const g=p.g,c=Math.round(val(g));S.coins+=c;S.earn+=c;if(vis)vis.loot+=c;fl(x,y-10,'+'+c+M);
 let k=0;if(!on('blight'))for(let i=0,n=Math.max(1,Math.round(g.y));i<n;i++)if(Math.random()<.35)k++;
 if(k)addSeed(g,k);fl(x,y-28,on('blight')?'🥀 неурожай: семян нет':k?'🌱 семян: '+k:'семян нет',k?'#9f9':'#ccc');
 tl.ps=tl.ps.filter(q=>q!==p);if(!tl.ps.length){tl.hole=0;tl.till=0;tl.wet=0}for(let i=0;i<8;i++)burst(x,y,'#7bd35a')};

// ---------- 4. Пакости ----------
// Цены: доход ~300–600 монет/мин в середине игры, улучшения стоят 250–700. Пакость дороже того, что она отнимает у жертвы за минуту, но дешевле апгрейда.
const EF={
 boulder:{ic:'🪨',n:'Валун',p:600,dur:0,d:'раздавит случайную половину грядок вместе с растениями'},
 locust:{ic:'🦗',n:'Саранча',p:350,dur:0,d:'сожрёт до 8 растений'},
 blight:{ic:'🥀',n:'Неурожай',p:250,dur:180,d:'3 мин: урожай собирается, но семена не выпадают'},
 drought:{ic:'🏜',n:'Засуха',p:220,dur:180,d:'3 мин: грядки высыхают в 6 раз быстрее'},
 invert:{ic:'🔄',n:'Инверсия управления',p:200,dur:90,d:'90 с: курсор двигается зеркально'},
 rust:{ic:'🔧',n:'Ржавые инструменты',p:180,dur:180,d:'3 мин: инструменты работают втрое медленнее'}};
function applyFx(k,from){const E=EF[k],T0=mine();S.fx=S.fx||{};
 if(k=='boulder'){[...T0.keys()].sort(()=>Math.random()-.5).slice(0,Math.ceil(T0.length/2)).forEach(i=>{const t=T0[i];if(t.till||t.hole||t.ps.length)fl(FX+(i%CO)*T+T/2,FY+((i/CO)|0)*T+T/2,'🪨','#fff');T0[i]=emptyTile()})}
 else if(k=='locust'){const all=[];T0.forEach(t=>t.ps.forEach(p=>all.push([t,p])));all.sort(()=>Math.random()-.5).slice(0,8).forEach(([t,p])=>{t.ps=t.ps.filter(q=>q!==p);if(!t.ps.length){t.hole=0;t.till=0;t.wet=0}})}
 else S.fx[k]=Date.now()+E.dur*1000;
 fl(550,330,`${E.ic} ${from}: ${E.n}!`,'#f88')}
const a0=act;act=function(t,dt){a0(t,on('rust')?dt*.35:dt)};
const u0=update;update=function(dt){u0(dt);S.fx=S.fx||{};if(on('drought'))mine().forEach(t=>t.wet=Math.max(0,t.wet-dt*.1));if(vis&&Date.now()>vis.end)endRaid()};
// инверсия: зеркалим вычисление координат курсора внутри pos() игры
const gbr=C.getBoundingClientRect;C.getBoundingClientRect=function(){const r=gbr.call(this);return on('invert')?{left:r.right,top:r.bottom,width:-r.width,height:-r.height}:r};
const d1=draw;draw=function(){d1();X.save();X.textAlign='left';X.font='bold 14px sans-serif';
 if(vis){X.fillStyle='rgba(0,0,0,.7)';X.fillRect(20,18,700,32);X.fillStyle='#ffd23a';X.fillText(`🕵 Ферма «${vis.name}» · осталось ${Math.max(0,Math.ceil((vis.end-Date.now())/1000))} с · добыча ${vis.loot}${M} · инвентарь хозяина недоступен`,30,39)}
 const act_=Object.keys(EF).filter(on).map(k=>`${EF[k].ic} ${EF[k].n} ${Math.ceil((S.fx[k]-Date.now())/1000)}с`);if(act_.length){X.fillStyle='#ff9d9d';X.fillText(act_.join('  ·  '),30,82)}
 if(on('invert')){X.strokeStyle='#ffe27a';X.lineWidth=3;X.beginPath();X.arc(px,py,14,0,7);X.stroke()}X.restore()};

// ---------- 5. Фермы игроков: снимок, просмотр, рейд, пакости ----------
async function push(){if(!S.name)return;try{await rpc('farm_field_put',{p_id:lbId,p_name:S.name,p_tiles:mine()})}catch(e){}}
async function pull(){try{((await rpc('farm_effects_pull',{p_id:lbId}))||[]).forEach(e=>EF[e.kind]&&applyFx(e.kind,String(e.from_name).slice(0,16)));
 ((await rpc('farm_raids_pull',{p_id:lbId}))||[]).forEach(r=>{const T0=mine();let lost=0;(Array.isArray(r.changes)?r.changes:[]).forEach(c=>{if(!Number.isInteger(c.i)||c.i<0||c.i>=T0.length||!c.t)return;const t=cleanTile(c.t);lost+=T0[c.i].ps.length-t.ps.length;T0[c.i]=t});
  fl(550,300,`🕵 ${String(r.from_name).slice(0,16)} навестил твою ферму`+(lost>0?`: пропало растений — ${lost}`:''),'#f88')})}catch(e){}}
const xb=el('button',{textContent:'🚪 Уйти с чужой фермы',hidden:true});hud.append(xb);xb.onclick=()=>endRaid();
async function startRaid(f,fee){if(S.coins<fee){fl(550,330,'Не хватает монет','#f88');return}
 try{const r=await rpc('farm_raid_start',{p_id:lbId,p_pub:f.pub}),tiles=(r.tiles||[]).slice(0,CO*RO).map(cleanTile);while(tiles.length<CO*RO)tiles.push(emptyTile());
  S.coins-=fee;vis={pub:f.pub,name:String(r.name).slice(0,16),mine:S.tiles,orig:tiles.map(sig),loot:0,end:Date.now()+60000};S.tiles=tiles;
  held=null;parts=[];tools().forEach(t=>t.h=0);md.hidden=true;setMode('farm');xb.hidden=false;fl(550,330,'🕵 У тебя 60 секунд!','#ffd23a')}
 catch(e){fl(550,330,'Нельзя: у игрока защита или он офлайн','#f88')}}
function endRaid(){if(!vis)return;const v=vis,ch=[];S.tiles.forEach((t,i)=>{if(sig(t)!==v.orig[i])ch.push({i,t})});
 S.tiles=v.mine;vis=null;held=null;parts=[];tools().forEach(t=>t.h=0);xb.hidden=true;fl(550,330,`🕵 Рейд окончен: добыча ${v.loot}${M}`,'#ffd23a');
 rpc('farm_raid_commit',{p_id:lbId,p_pub:v.pub,p_changes:ch,p_loot:v.loot}).catch(()=>{})}
// во время рейда не сохраняем чужое поле как своё и блокируем лабораторию/магазин/сброс/биржу
const si=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(vis&&k=='farm2'){try{const o=JSON.parse(v);o.tiles=vis.mine;v=JSON.stringify(o)}catch(e){}}return si.call(this,k,v)};
document.addEventListener('click',e=>{if(vis&&e.target.closest&&e.target.closest('#bm,#bs,#bg,#bt,#bf,#bu')){e.stopPropagation();e.preventDefault();fl(550,330,'Сначала уйди с чужой фермы','#f88')}},true);
async function viewF(f){mb.innerHTML='<h2></h2><canvas width="540" height="360" style="max-width:100%"></canvas><p class="in"></p><div class="ac"></div>'+cls;mb.querySelector('h2').textContent='👁 Ферма «'+f.name+'»';opn();
 try{const tiles=((await rpc('farm_field_view',{p_pub:f.pub}))||[]).slice(0,CO*RO).map(cleanTile),c=mb.querySelector('canvas').getContext('2d');c.fillStyle='#2f4a26';c.fillRect(0,0,540,360);
  tiles.forEach((t,i)=>{const gx=i%CO,gy=(i/CO)|0,x=gx*60,y=gy*60;c.fillStyle=(gx+gy)%2?'#5f9c47':'#5a9642';c.fillRect(x,y,60,60);if(t.till>0){c.fillStyle=`hsl(26,42%,${32-t.wet*17}%)`;c.fillRect(x+4,y+4,52,52)}
   if(t.hole>0){c.fillStyle='#241508';c.beginPath();c.ellipse(x+30,y+30,16,11,0,0,7);c.fill()}
   const n=t.ps.length;t.ps.forEach((p,k)=>{const o=n==1?[0,0]:n==2?[[-13,0],[13,0]][k]:[[-14,-9],[14,-9],[0,12]][k];plant(c,x+30+o[0],y+30+o[1],p.g,Math.min(1,p.age/need(p.g)),(n==1?1:n==2?.72:.6)*.75)})});
  const ripe=tiles.flatMap(t=>t.ps).filter(p=>p.age>=need(p.g)),worth=Math.round(ripe.reduce((s,p)=>s+val(p.g),0)),fee=cl(Math.round(worth*.25),60,800);
  mb.querySelector('.in').textContent=`Спелых растений: ${ripe.length} (≈${worth}${M}). Это снимок: на деле ферма могла измениться. Рейд — 60 секунд на этой ферме, плата ${fee}${M} (25% стоимости спелого урожая, от 60 до 800). Твой инвентарь с тобой, хозяйский трогать нельзя.`;
  const b=el('button',{textContent:`🕵 Воровать — ${fee}${M}`});b.disabled=f.shielded;b.onclick=()=>startRaid(f,fee);mb.querySelector('.ac').append(b)}
 catch(e){mb.querySelector('.in').textContent='Не удалось загрузить ферму.'}}
function sabo(f){mb.innerHTML='<h2></h2><p>Эффект сработает у жертвы в течение ~10 секунд. После атаки у неё защита 2 минуты, а у тебя кулдаун 30 секунд.</p><div class="ef"></div>'+cls;mb.querySelector('h2').textContent='😈 Пакость для «'+f.name+'»';opn();
 Object.entries(EF).forEach(([k,E])=>{const d=el('div'),b=el('button',{textContent:`${E.ic} ${E.n} — ${E.p}${M}`});d.append(b,' '+E.d);
  b.onclick=async()=>{if(S.coins<E.p){fl(550,330,'Не хватает монет','#f88');return}b.disabled=true;
   try{await rpc('farm_effect_buy',{p_id:lbId,p_pub:f.pub,p_kind:k});S.coins-=E.p;fl(550,330,`${E.ic} ${E.n} отправлено: ${f.name}`,'#9f9');md.hidden=true}
   catch(e){fl(550,330,'Не вышло: защита, кулдаун или игрок офлайн','#f88');b.disabled=false}};
  mb.querySelector('.ef').append(d)})}
const bf=el('button',{textContent:'🌍 Фермы',id:'bf'});
async function openF(){mb.innerHTML='<h2>🌍 Фермы игроков</h2><p class="st"></p><div class="sh"></div><div class="ls">Загрузка…</div>'+cls;opn();const st=mb.querySelector('.st'),sh=mb.querySelector('.sh'),ls=mb.querySelector('.ls');
 if(!S.name){st.textContent='Сначала укажи имя в окне «🏆 Лидеры».';ls.textContent='';return}
 await push();st.textContent='Смотреть чужие грядки можно бесплатно. Воровать и вредить — за монеты. Фермы в списке — те, кто был в игре за последние 15 минут.';
 const sb=el('button',{textContent:'🛡 Защита на 10 минут — 150'+M});sb.onclick=async()=>{if(S.coins<150){fl(550,330,'Не хватает монет','#f88');return}try{await rpc('farm_shield',{p_id:lbId});S.coins-=150;fl(550,330,'🛡 Защита включена на 10 минут','#9f9')}catch(e){}};sh.append(sb);
 try{const L=((await rpc('farm_fields_list',{p_id:lbId}))||[]).filter(f=>!f.mine);ls.textContent='';
  L.forEach(f=>{const d=el('div'),b1=el('button',{textContent:'👁 Ферма / 🕵 Воровать'}),b3=el('button',{textContent:'😈 Пакость'});d.style.margin='8px 0';d.append(`${f.name} · растений: ${f.plants}${f.shielded?' · 🛡 защита':''}  `,b1,b3);
   b1.onclick=()=>viewF(f);b3.onclick=()=>sabo(f);b3.disabled=f.shielded;ls.append(d)});if(!L.length)ls.textContent='Других игроков с фермой пока нет.'}
 catch(e){ls.textContent='Недоступно: проверь, что schema.sql выполнен в Supabase.'}}
bf.onclick=openF;

// ---------- 6. Биржа семян ----------
const bt=el('button',{textContent:'🤝 Биржа',id:'bt'});bl.after(bt);bt.after(bf);
async function openX(){
 mb.innerHTML='<h2>🤝 Биржа семян</h2><p class="st"></p><h3>Выставить свои семена</h3><div class="po"></div><h3>Предложения игроков</h3><div class="tl">Загрузка…</div>'+cls;opn();
 const st=mb.querySelector('.st'),po=mb.querySelector('.po'),tl=mb.querySelector('.tl');
 if(!S.name){st.textContent='Сначала укажи имя в окне «🏆 Лидеры».';po.remove();tl.textContent='';return}
 st.textContent='Покупка — за монеты. Продавец получает их в течение ~20 секунд (при открытой игре). Можно держать до 5 лотов.';
 S.seeds.filter(s=>s.n>0).slice(0,12).forEach(s=>{
  const q=el('input',{type:'number',min:1,max:s.n,value:s.n}),p=el('input',{type:'number',min:1,value:Math.max(1,Math.round(base(s)*3*s.n))}),b=el('button',{textContent:'Выставить'}),d=el('div');
  q.style.width='60px';p.style.width='80px';d.append(`${nm(s)} ×${s.n}: кол-во `,q,' цена за всё ',p,' ',b);
  b.onclick=async()=>{const n=cl(+q.value|0,1,s.n),pr=Math.max(1,+p.value|0),g={sp:s.sp,x:s.x,h:s.h,z:s.z,r:s.r,y:s.y,m:[...s.m]};s.n-=n;sync();
   try{await rpc('farm_trade_post',{p_id:lbId,p_name:S.name,p_seed:g,p_qty:n,p_price:pr})}catch(e){addSeed(g,n);fl(550,330,'Не удалось выставить (лимит 5 лотов?)','#f88')}openX()};
  po.append(d)});
 if(!po.children.length)po.textContent='Нет семян.';
 try{const L=((await rpc('farm_trades_list',{p_id:lbId}))||[]).filter(t=>ok(t.seed));tl.textContent='';
  L.forEach(t=>{const b=el('button',{textContent:t.mine?'Снять':'Купить'}),d=el('div');
   d.append(`${nm(t.seed)} ×${t.qty} · ${t.seed.m.map(k=>MU[k][0]).join(', ')||'без мутаций'} · ${t.price}${M} · ${t.seller_name} `,b);
   b.onclick=async()=>{b.disabled=true;try{
     if(t.mine){const r=await rpc('farm_trade_cancel',{p_trade:t.id,p_id:lbId});if(r&&ok(r.seed))addSeed(cg(r.seed),r.qty)}
     else{if(S.coins<t.price){fl(550,330,'Не хватает монет','#f88');b.disabled=false;return}
      const r=await rpc('farm_trade_buy',{p_trade:t.id,p_buyer:lbId});if(r&&ok(r.seed)){S.coins-=r.price;addSeed(cg(r.seed),r.qty)}else fl(550,330,'Уже продано','#f88')}
    }catch(e){}openX()};
   tl.append(d)});
  if(!L.length)tl.textContent='Пока пусто.'}
 catch(e){tl.textContent='Биржа недоступна: проверь связь и что schema.sql выполнен в Supabase.'}}
bt.onclick=openX;

// подсказки
const bh0=bh.onclick;bh.onclick=()=>{bh0();const u=mb.querySelector('ul');if(u)u.insertAdjacentHTML('beforeend','<li><b>Урожай</b> — каждое семя из растения выпадает с шансом 35%, так что семян может не быть вовсе.</li><li><b>🌍 Фермы</b> — смотри чужие грядки, воруй спелый урожай за 25% его стоимости (60 секунд на чужом поле, инвентарь хозяина не тронуть) или вредь: валун, саранча, неурожай, засуха, инверсия управления, ржавые инструменты. После атаки у жертвы защита; 🛡 можно купить заранее.</li>')};
(window.authReady||Promise.resolve()).then(()=>{ping();claim();push();pull();setInterval(()=>{ping();claim();pull()},10000);setInterval(push,20000)});
})();
