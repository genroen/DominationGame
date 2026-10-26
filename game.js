/* Signal Dominion: browser edition. No build tools or external libraries required. */
(() => {
  'use strict';
  const SOURCE = Array.isArray(window.SIGNAL_LEVELS) ? window.SIGNAL_LEVELS : [];
  const INF = 1e9;
  const LIMIT_MS = 180000;
  const LS_KEY = 'signal_dominion_web_v1';
  const MUSIC = [
    {name:'Classic Ambient',file:'ambient_loop.wav',description:'Calm, atmospheric background loop'},
    {name:'Neon After Midnight',file:'neon_after_midnight.mp3',description:'Electronic night-city atmosphere'},
    {name:'Sunlit Dunes',file:'sunlit_dunes.mp3',description:'Warm, relaxing soundtrack'}
  ];
  const NICKNAMES = ['NodePilot','SignalFox','GraphRider','RadiusAce','ParSeeker','CircuitOwl','VertexNova','RelayMage'];
  const RIVAL_NAMES = ['Nova','Byte','Orbit','Vega','Quark','Lyra','Atlas','Echo'];
  const $main = document.getElementById('main');
  const $modal = document.getElementById('modal-root');
  const $toast = document.getElementById('toast');

  function loadSave(){
    try { const data=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); return data && typeof data==='object'?data:{}; }
    catch { return {}; }
  }
  const save = loadSave();
  save.best ||= {};
  save.randomSolved ||= {};
  save.race ||= {matches:0,wins:0,losses:0,draws:0};
  save.settings = Object.assign({sound:true,music:true,track:1,effects:true,haptics:true,nickname:'NodePilot'},save.settings||{});
  const levels = SOURCE.map(prepareLevel);
  let musicPlayer=null, musicTrackUrl='';
  let toastTimeout=null, press=null, rivalDrag=null;
  let hintTimer=null;
  let botTick=0;
  const state={screen:'menu',mode:'campaign',levelIndex:0,levelPage:0,level:levels[0]||null,powers:[],randomDifficulty:1,randomSeed:0,
    competitiveDifficulty:1,competitiveSeed:0,race:null,hint:-1,hintText:'',modal:null,lastRenderedCovered:0,miniExpanded:false};

  function persist(){try{localStorage.setItem(LS_KEY,JSON.stringify(save));}catch(e){/* Storage can be blocked. Gameplay still works. */}}
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function plural(n,singular,pluralForm){return `${n} ${n===1?singular:pluralForm||singular+'s'}`;}
  function labelNode(i){return i<26?String.fromCharCode(65+i):`V${i+1}`;}
  function randomSeed(){if(window.crypto?.getRandomValues){let out=new Uint32Array(1);crypto.getRandomValues(out);return out[0]||1;}return (Math.random()*0xffffffff)>>>0||1;}
  function seedLabel(seed){return Number(seed>>>0).toString(16).toUpperCase().padStart(8,'0').slice(-6);}
  function rng32(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function shuffle(arr,random){for(let i=arr.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function sum(arr){return arr.reduce((s,x)=>s+x,0);}
  function computeDistances(n,edges){
    const d=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:999));
    for(const [a,b] of edges){d[a][b]=1;d[b][a]=1;}
    for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(d[i][k]+d[k][j]<d[i][j])d[i][j]=d[i][k]+d[k][j];
    return d;
  }
  function prepareLevel(data){
    const n=data.x.length;
    const level={...data,n,dist:computeDistances(n,data.edges)};
    level.ecc=level.dist.map(row=>Math.max(...row));
    if(!Array.isArray(level.optimal)||level.optimal.length!==n||level.par==null){
      const answer=solveExact(level);level.par=answer.cost;level.optimal=answer.powers;
    }
    return level;
  }
  function coveredFor(level,powers){
    const covered=Array(level.n).fill(false);
    for(let i=0;i<level.n;i++)if(powers[i]>0)for(let j=0;j<level.n;j++)if(level.dist[i][j]<=powers[i])covered[j]=true;
    return covered;
  }
  function coverCount(level,powers){return coveredFor(level,powers).reduce((s,c)=>s+(c?1:0),0);}
  function isComplete(){return !!state.level && coverCount(state.level,state.powers)===state.level.n;}
  function isOptimal(){return isComplete()&&sum(state.powers)===state.level.par;}
  function starCount(par,cost){return !Number.isFinite(cost)||cost>=INF?0:cost<=par?3:cost<=par+1?2:1;}
  function starText(stars){return '★'.repeat(stars)+'☆'.repeat(3-stars);}
  function bestKey(mode=state.mode){
    if(mode==='campaign')return `c${state.levelIndex}`;
    if(mode==='random')return `r${state.randomDifficulty}_${state.randomSeed}`;
    return `p${state.competitiveDifficulty}_${state.competitiveSeed}`;
  }
  function bestFor(key){const x=save.best[key];return Number.isFinite(x)?x:INF;}
  function bestCurrent(){return bestFor(bestKey());}
  function isUnlocked(i){return i===0||bestFor(`c${i-1}`)<INF;}
  function unlockedCount(){let i=0;while(i<levels.length&&isUnlocked(i))i++;return i;}
  function completedCount(){return levels.reduce((s,_,i)=>s+(bestFor(`c${i}`)<INF?1:0),0);}
  function totalStars(){return levels.reduce((s,l,i)=>s+starCount(l.par,bestFor(`c${i}`)),0);}
  function recommendLevel(){const unsolved=levels.findIndex((_,i)=>isUnlocked(i)&&bestFor(`c${i}`)===INF);return unsolved===-1?Math.max(0,unlockedCount()-1):unsolved;}
  function randomSolvedCount(){return Object.keys(save.randomSolved).length;}
  function timeString(ms){let s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
  function notice(message){clearTimeout(toastTimeout);$toast.textContent=message;$toast.classList.add('visible');toastTimeout=setTimeout(()=>$toast.classList.remove('visible'),2600);}
  function vibe(duration=13){if(save.settings.haptics&&navigator.vibrate)navigator.vibrate(duration);}
  function playSound(name){
    if(!save.settings.sound)return;
    try{const sound=new Audio(`assets/audio/${name}.wav`);sound.volume=name==='optimal'?0.48:0.35;sound.play().catch(()=>{});}catch{}
  }
  function updateMusic(){
    const selected=MUSIC[clamp(save.settings.track|0,0,MUSIC.length-1)];
    const nextUrl=`assets/audio/${selected.file}`;
    if(nextUrl!==musicTrackUrl){musicPlayer?.pause();musicPlayer=new Audio(nextUrl);musicPlayer.loop=true;musicPlayer.volume=0.19;musicTrackUrl=nextUrl;}
    if(!save.settings.music||document.hidden){musicPlayer?.pause();return;}
    musicPlayer?.play().catch(()=>{/* Browsers require a playback gesture. */});
  }
  document.addEventListener('visibilitychange',updateMusic);

  /* Exact weighted set-cover solver. A radius-r broadcast costs r and covers all nodes <=r links away. */
  function solveExact(level){
    if(level.n>23)throw new Error('Exact solver supports up to 23 nodes');
    const all=(1<<level.n)-1;
    const byNode=Array.from({length:level.n},()=>[]);
    for(let v=0;v<level.n;v++){
      let prev=0;
      for(let r=1;r<=level.ecc[v];r++){
        let mask=0;
        for(let u=0;u<level.n;u++)if(level.dist[v][u]<=r)mask|=(1<<u);
        if(mask===prev)continue;
        prev=mask;
        const opt={v,r,mask,reach:bitCount(mask)};
        for(let u=0;u<level.n;u++)if(mask&(1<<u))byNode[u].push(opt);
      }
    }
    // Smaller broadcast costs first gives naturally sparse optimal solutions.
    for(const options of byNode)options.sort((a,b)=>a.r-b.r||b.reach-a.reach);
    const memo=new Map();
    function best(mask){
      if(mask===all)return {cost:0,stations:0,choice:null};
      let old=memo.get(mask);if(old)return old;
      let pivot=0;while(mask&(1<<pivot))pivot++;
      let cost=INF,stations=INF,choice=null;
      for(const op of byNode[pivot]){
        const next=mask|op.mask;
        if(next===mask)continue;
        const result=best(next);
        const total=op.r+result.cost;
        if(total<cost||(total===cost&&1+result.stations<stations)){
          cost=total;stations=1+result.stations;choice=op;
        }
      }
      const result={cost,stations,choice};memo.set(mask,result);return result;
    }
    const answer=best(0);const powers=Array(level.n).fill(0);
    let mask=0,step=0;
    while(mask!==all&&step++<level.n){let opt=best(mask).choice;if(!opt)break;powers[opt.v]=Math.max(powers[opt.v],opt.r);mask|=opt.mask;}
    return {cost:answer.cost,powers};
  }
  function bitCount(v){let c=0;while(v){v&=v-1;c++;}return c;}

  function generateGraph(difficulty,seed){
    const d=clamp(difficulty|0,0,2);
    let selected=null, stationBest=-1, edgesBest=Infinity;
    const attempts=d===0?1:d===1?9:15;
    for(let attempt=0;attempt<attempts;attempt++){
      const candidate=generateGraphCandidate(d,seed,attempt);
      const stations=candidate.optimal.filter(power=>power>0).length;
      if(stations>stationBest||(stations===stationBest&&Math.abs(candidate.edges.length-candidate.n-5)<Math.abs(edgesBest-candidate.n-5))){
        selected=candidate;stationBest=stations;edgesBest=candidate.edges.length;
      }
      if((d===1&&stations>=2)||(d===2&&stations>=4))return candidate;
    }
    return selected;
  }
  function generateGraphCandidate(difficulty,seed,attempt){
    const random=rng32((seed^(difficulty*0x4c11db7)^Math.imul(attempt,0x9e3779b9))>>>0);
    const ri=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
    const d=clamp(difficulty|0,0,2);
    const n=d===1?ri(14,18):ri(18,21);
    const x=Array(n).fill(0),y=Array(n).fill(0);
    const shape=d===2?'winding':(d===0?['scatter','ring','bands','scatter'][ri(0,3)]:['winding','winding','ring','scatter'][ri(0,3)]);
    if(shape==='winding'){
      const cols=Math.ceil(n/4);
      for(let i=0;i<n;i++){
        const row=Math.floor(i/cols),colInRow=i%cols,col=row%2?cols-1-colInRow:colInRow;
        x[i]=clamp(.1+col*.8/Math.max(1,cols-1)+(random()-.5)*.04,.05,.95);
        y[i]=clamp(.14+row*.72/3+(random()-.5)*.05,.05,.95);
      }
    }else if(shape==='ring'){
      for(let i=0;i<n;i++){
        const a=2*Math.PI*i/n-Math.PI/2+(random()-.5)*.09;
        x[i]=.5+Math.cos(a)*(.38+(random()-.5)*.06);
        y[i]=.5+Math.sin(a)*(.37+(random()-.5)*.06);
      }
    }else{
      for(let i=0;i<n;i++){
        let px=0,py=0;
        for(let t=0;t<90;t++){
          px=.07+random()*.86;
          py=(shape==='bands'?(random()>.5?.30:.69)+(random()-.5)*.33:.08+random()*.84);
          py=clamp(py,.07,.93);
          if(i===0||x.slice(0,i).every((sx,j)=>(sx-px)**2+(y[j]-py)**2>.0085)||t===89)break;
        }
        x[i]=px;y[i]=py;
      }
    }
    const edges=[],used=new Set();
    function add(a,b){if(a===b)return false;const u=Math.min(a,b),v=Math.max(a,b),key=`${u}_${v}`;if(used.has(key))return false;used.add(key);edges.push([u,v]);return true;}
    if(d===2||shape==='winding'){
      // Mostly long-route connectivity makes several small stations essential.
      for(let i=1;i<n;i++)add(i-1,i);
    }else if(shape==='ring'){
      for(let i=0;i<n;i++)add(i,(i+1)%n);
    }else{
      const order=shuffle(Array.from({length:n},(_,i)=>i),random);
      for(let i=1;i<n;i++){
        const a=order[i];
        const prior=order.slice(0,i).sort((u,v)=>((x[a]-x[u])**2+(y[a]-y[u])**2)-((x[a]-x[v])**2+(y[a]-y[v])**2));
        const b=random()<.82?prior[0]:prior[ri(0,Math.min(3,prior.length-1))];
        add(a,b);
      }
    }
    const candidates=[];
    for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)if(!used.has(`${a}_${b}`)){
      const distance=Math.hypot(x[a]-x[b],y[a]-y[b]);
      candidates.push({a,b,score:random()*1.8+1/(.1+distance)*(d===0?.42:.65)+(d===0?random()*.7:0)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const extra=d===0?ri(n+5,n*2+8):d===1?ri(6,n+5):ri(0,2);
    const eligible=d===2?candidates.filter(c=>Math.abs(c.a-c.b)>=2&&Math.abs(c.a-c.b)<=3):d===1&&shape==='winding'?candidates.filter(c=>Math.abs(c.a-c.b)>=2&&Math.abs(c.a-c.b)<=4):candidates;
    for(const c of eligible.slice(0,extra))add(c.a,c.b);
    const name=`Random ${['Easy','Medium','Hard'][d]} ${seedLabel(seed)}`;
    const style=d===2?'sparse winding route':d===0?'dense shortcut network':'mixed network';
    const raw={pack:'Random',name,description:`${n} circles • ${edges.length} links • ${style}.`,x,y,edges};
    return prepareLevel(raw);
  }

  function clearModal(){state.modal=null;$modal.innerHTML='';}
  function loadCampaign(index){
    if(!isUnlocked(index)){notice('Locked! Complete the previous level first.');return;}
    state.mode='campaign';state.levelIndex=clamp(index,0,levels.length-1);
    state.level=levels[state.levelIndex];state.powers=Array(state.level.n).fill(0);
    state.screen='game';state.hint=-1;state.hintText='';state.race=null;state.miniExpanded=false;
    save.lastLevel=state.levelIndex;persist();clearModal();render();
  }
  function loadGenerated(mode,difficulty,seed){
    if(!['random','competitive'].includes(mode))return;
    difficulty=clamp(difficulty|0,0,2);seed=(Number(seed)>>>0)||randomSeed();
    state.modal={type:'loading',text:'Building an exact-Par graph…'};renderModal();
    // Give the browser one frame to display the loading state before running the solver.
    setTimeout(()=>{
      try{
        const level=generateGraph(difficulty,seed);
        state.mode=mode;state.level=level;state.powers=Array(level.n).fill(0);
        state.screen='game';state.hint=-1;state.hintText='';state.miniExpanded=false;
        if(mode==='random'){
          state.randomDifficulty=difficulty;state.randomSeed=seed;
          save.lastRandom={difficulty,seed};
          state.race=null;
        }else{
          state.competitiveDifficulty=difficulty;state.competitiveSeed=seed;
          save.lastCompetitive={difficulty,seed};
          state.race=createRace(level,difficulty,seed);
        }
        persist();clearModal();render();
        notice(mode==='random'?`New graph ready • Par ${level.par}`:`Matched with ${state.race.botName} • first to Par wins`);
      }catch(e){console.error(e);clearModal();notice('Could not generate this graph. Try again.');}
    },35);
  }
  function createRace(level,difficulty,seed){
    const random=rng32((seed^0x51a17d0b^(difficulty*1009))>>>0);
    const name=RIVAL_NAMES[Math.floor(random()*RIVAL_NAMES.length)];
    const accuracy=[.48,.64,.78][difficulty];
    const optimal=random()<accuracy;
    const target=level.optimal.slice();
    const extra=optimal?0:1+Math.floor(random()*(difficulty>=2?2:3));
    for(let e=0;e<extra;){const i=Math.floor(random()*level.n);if(target[i]<level.ecc[i]){target[i]++;e++;}}
    const goal=sum(target);
    const base=[88000,74000,60000][difficulty]+level.n*[1650,1450,1250][difficulty];
    const solveMs=clamp(base+(random()-.5)*45000+(optimal?0:18000),36000,LIMIT_MS+22000);
    return {botName:name,start:Date.now(),duration:LIMIT_MS,botDuration:solveMs,botTarget:target,botOptimal:goal===level.par,
      botPowers:Array(level.n).fill(0),botBest:INF,botScore:0,botCovered:0,playerBest:INF,finished:false,won:false,reason:'',statsSaved:false};
  }
  function updateRace(now=Date.now()){
    const race=state.race,level=state.level;
    if(!race||state.mode!=='competitive')return;
    const elapsed=now-race.start;
    const prog=clamp(elapsed/race.botDuration,0,1);
    if(!race.finished){
      const target=race.botTarget;
      const total=sum(target);
      const wanted=Math.min(total,Math.floor(total*prog));
      const current=Array(level.n).fill(0);
      let steps=wanted;
      while(steps>0){
        let changed=false;
        for(let i=0;i<level.n&&steps>0;i++){
          let idx=(i*7+3)%level.n;
          if(current[idx]<target[idx]){current[idx]++;steps--;changed=true;}
        }
        if(!changed)break;
      }
      if(prog<1){
        const r=rng32((state.competitiveSeed^Math.floor(elapsed/2700)*1979)>>>0);
        const p=Math.floor(r()*level.n);
        if(current[p]===0&&sum(current)<level.par+6&&r()>.35)current[p]++;
        else if(current[p]>0)current[p]--;
      }
      race.botPowers=prog>=1?target.slice():current;
      race.botScore=sum(race.botPowers);
      race.botCovered=coverCount(level,race.botPowers);
      if(race.botCovered===level.n&&race.botScore<race.botBest)race.botBest=race.botScore;
      if(prog>=1){race.botBest=Math.min(race.botBest,sum(target));}
      if(prog>=1&&race.botOptimal){finishRace(false,`${race.botName} reached exact Par first`);}
      if(!race.finished&&elapsed>=LIMIT_MS){
        const my=race.playerBest,their=race.botBest;
        if(my===their)finishRace(false,'Time expired — draw',true);
        else finishRace(my<their,'Time expired — lowest valid cost wins');
      }
    }
    // The timer and mini board refresh in-place, avoiding a full render every 350 ms.
    const timer=document.getElementById('raceTimer');
    if(timer)timer.textContent=timeString(race.finished?LIMIT_MS-(race.end-race.start):LIMIT_MS-elapsed);
    const rivalStatus=document.getElementById('rival-status');
    if(rivalStatus)rivalStatus.textContent=`${race.botName} • ${race.botCovered}/${level.n} covered • best ${race.botBest>=INF?'—':race.botBest}`;
    const ownStatus=document.getElementById('your-race-best');
    if(ownStatus)ownStatus.textContent=race.playerBest>=INF?'—':String(race.playerBest);
    const mini=document.getElementById('rival-snapshot');
    if(mini){mini.innerHTML=previewSVG(level,race.botPowers);}
    const miniStat=document.getElementById('rival-mini-status');
    if(miniStat)miniStat.textContent=`Cost ${race.botScore} · ${race.botCovered}/${level.n} · Best ${race.botBest>=INF?'—':race.botBest}`;
    const overlay=document.getElementById('rival-large-svg');
    if(overlay)overlay.innerHTML=previewSVG(level,race.botPowers);
  }
  function finishRace(won,reason,draw=false){
    const race=state.race;if(!race||race.finished)return;
    race.finished=true;race.won=won;race.draw=draw;race.reason=reason;race.end=Date.now();
    save.race.matches=(save.race.matches||0)+1;
    if(draw)save.race.draws=(save.race.draws||0)+1;
    else if(won)save.race.wins=(save.race.wins||0)+1;
    else save.race.losses=(save.race.losses||0)+1;
    persist();
    state.modal={type:'race',won,draw,reason};
    playSound(won?'optimal':'complete');
    render();
  }
  function recordComplete(){
    const score=sum(state.powers),key=bestKey(),old=bestFor(key);
    let improved=score<old;
    if(improved)save.best[key]=score;
    if(state.mode==='random')save.randomSolved[bestKey()]=true;
    if(state.mode==='competitive'&&state.race){
      state.race.playerBest=Math.min(state.race.playerBest,score);
      if(score===state.level.par&&!state.race.finished)finishRace(true,'You found the minimum first!');
    }
    persist();
    return improved;
  }
  function changePower(index,delta){
    if(state.screen!=='game'||!state.level||index<0||index>=state.level.n)return;
    if(state.mode==='competitive'&&state.race?.finished){notice('This race has ended. Start another match.');return;}
    const level=state.level;
    const beforeComplete=isComplete(),beforeOptimal=isOptimal();
    const old=state.powers[index],max=level.ecc[index];
    state.powers[index]=delta>0?(old+1)%(max+1):(old===0?max:old-1);
    state.hint=-1;state.hintText='';
    const complete=isComplete(),optimal=isOptimal();
    const score=sum(state.powers);
    let improved=false;
    if(complete)improved=recordComplete();
    vibe(delta>0?12:25);
    playSound(delta>0?'signal_up':'signal_down');
    render();
    if(state.mode==='campaign'&&complete&&(!beforeComplete||(!beforeOptimal&&optimal))){
      state.modal={type:'win'};
      playSound(optimal?'optimal':'complete');renderModal();
    }else if(state.mode==='random'&&complete&&(!beforeComplete||(!beforeOptimal&&optimal))){
      playSound(optimal?'optimal':'complete');
      notice(optimal?'Optimal! Exact Par matched.':`Covered all nodes at cost ${score}. Par is ${level.par}; keep optimizing!`);
    }else if(state.mode==='competitive'&&!state.race?.finished&&complete){
      notice(optimal?'Par reached!':'Valid complete solution saved — keep improving!');
    }else notice(`${labelNode(index)} signal ${state.powers[index]}${improved?' · new best!':''}`);
  }
  function hint(){
    if(state.mode==='competitive'){notice('Hints are disabled during competitive races.');return;}
    const i=state.powers.findIndex((p,j)=>p!==state.level.optimal[j]);
    if(i===-1){notice('Your signals match an optimal solution.');return;}
    state.hint=i;state.hintText=`Hint: set node ${labelNode(i)} to signal ${state.level.optimal[i]}.`;
    playSound('hint');render();notice(state.hintText);
    clearTimeout(hintTimer);hintTimer=setTimeout(()=>{if(state.hint===i){state.hint=-1;render();}},2800);
  }
  function reset(){state.powers.fill(0);state.hint=-1;state.hintText='';clearModal();playSound('reset');render();notice('All signal strengths reset.');}

  function pageHeader(title,sub,eyebrow='SIGNAL DOMINION'){
    return `<section class="page-head panel"><div class="eyebrow">${escapeHTML(eyebrow)}</div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(sub)}</p></section>`;
  }
  function item(action,icon,title,subtitle,featured=false){
    return `<button type="button" data-action="${action}" class="menu-item${featured?' featured':''}"><span class="menu-icon" aria-hidden="true">${icon}</span><span class="menu-item-text"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(subtitle)}</small></span><span class="menu-arrow" aria-hidden="true">›</span></button>`;
  }
  function renderMenu(){
    const next=recommendLevel();const level=levels[next];
    return `<section class="home">
      <div class="hero">
        <div class="hero-graphic" aria-hidden="true"><div class="hero-orbit three"></div><div class="hero-orbit two"></div><div class="hero-orbit one"></div><div class="hero-center"></div><i class="orbit-node n1"></i><i class="orbit-node n2"></i><i class="orbit-node n3"></i></div>
        <div class="eyebrow">A DIFFERENT KIND OF PUZZLE</div>
        <h1>Signal <span>Dominion.</span></h1>
        <p class="hero-desc">Control the network. Cover every circle. Find the smallest signal strength that wins. A deceptively simple graph puzzle with a satisfying mathematical twist.</p>
        <div class="hero-tags"><span class="hero-tag"><b>43</b> HANDCRAFTED LEVELS</span><span class="hero-tag">◉ OFFLINE PLAY</span><span class="hero-tag">✦ EXACT PAR</span></div>
      </div>
      <div class="menu-card panel">
        <div class="menu-heading"><h2>Choose your signal</h2><small>Welcome, ${escapeHTML(save.settings.nickname)}</small></div>
        ${item('continue','▶','Continue Campaign',`Level ${next+1}: ${level?.name||'Path Patrol'}`,true)}
        ${item('competitive','⚔','Competitive',`${save.race.wins||0} wins • ${save.race.matches||0} local races`)}
        ${item('random-menu','◈','Random Graphs',`${randomSolvedCount()} unique graphs solved`)}
        ${item('levels','▦','Level Select',`${completedCount()}/${levels.length} campaign levels solved`)}
        ${item('how','?','How to Play','Master signals, coverage and Par')}
        ${item('settings','⚙','Settings','Audio, effects, player name and preferences')}
        ${item('credits','✧','Credits','Graph theory, NodeSmith Games and more')}
        <div class="progress-summary"><span><strong>${totalStars()}</strong> / ${levels.length*3} CAMPAIGN STARS</span><span><strong>${Math.round(100*completedCount()/Math.max(1,levels.length))}%</strong> COMPLETE</span></div>
      </div>
    </section>`;
  }
  function renderLevels(){
    const pages=Math.ceil(levels.length/12);state.levelPage=clamp(state.levelPage,0,pages-1);
    const begin=state.levelPage*12;
    const cards=levels.slice(begin,begin+12).map((level,i)=>{
      const j=begin+i,unlocked=isUnlocked(j),best=bestFor(`c${j}`),stars=starCount(level.par,best);
      return `<button class="level-card ${unlocked?'':'locked'} ${state.levelIndex===j?'current':''}" data-action="select-level" data-index="${j}" ${unlocked?'':'disabled'} aria-label="Level ${j+1}, ${escapeHTML(level.name)}, ${unlocked?'unlocked':'locked'}, ${stars} stars">
        <span class="level-number">${String(j+1).padStart(2,'0')} ${unlocked?'':'🔒'}</span><strong>${escapeHTML(level.name)}</strong>
        <span class="level-pack">${unlocked?`${escapeHTML(level.pack)} • Par ${level.par}`:`Win level ${j} first`}</span>
        <span class="level-stars ${stars===3?'perfect':''}" aria-hidden="true">${unlocked?starText(stars):'LOCKED'}</span></button>`;
    }).join('');
    return `${pageHeader('Level Select','Clear each level to unlock the next. Stars reflect your best complete solution.','THE CAMPAIGN')}
      <section class="level-grid" aria-label="Campaign levels">${cards}</section>
      <div class="pager"><button type="button" class="secondary" data-action="prev-page" ${state.levelPage===0?'disabled':''}>‹ Prev</button>
      <div class="pager-title">Page ${state.levelPage+1} of ${pages} · ${completedCount()} solved</div>
      <button type="button" class="secondary" data-action="next-page" ${state.levelPage===pages-1?'disabled':''}>Next ›</button></div>
      <div class="page-actions"><button type="button" class="ghost" data-action="home">← Back to Menu</button></div>`;
  }
  function choiceCard(emoji,title,sub,description,action,difficulty,buttonText){
    return `<article class="choice-card panel"><div class="choice-icon">${emoji}</div><h3>${title}</h3><div class="choice-sub">${sub}</div><p>${description}</p><button type="button" class="secondary" data-action="${action}" data-difficulty="${difficulty}">${buttonText}</button></article>`;
  }
  function renderRandom(){
    const savedRandom=save.lastRandom;
    const lastText=savedRandom?`${['Easy','Medium','Hard'][savedRandom.difficulty]} • seed ${seedLabel(savedRandom.seed)} • best ${bestFor('r'+savedRandom.difficulty+'_'+savedRandom.seed)>=INF?'—':bestFor('r'+savedRandom.difficulty+'_'+savedRandom.seed)}`:'No generated board saved yet';
    return `${pageHeader('Random Graphs','A new network every time. Easy is dense and shortcut-heavy; Hard favors long sparse routes where several stations matter.','INFINITE PUZZLES')}
      <div class="two-column">
      <article class="choice-card big panel"><div><div class="choice-sub">PICK UP WHERE YOU LEFT OFF</div><h3>Continue Random</h3><p>${lastText}</p></div><button type="button" class="primary" data-action="continue-random">${savedRandom?'Continue board':'Create a graph'} ↗</button></article>
      ${choiceCard('◉','Easy','DENSE / MANY SHORTCUTS','18–21 circles. Big, tangled networks with plenty of ways to reach every corner.','new-random',0,'Generate Easy')}
      ${choiceCard('◎','Medium','MIXED / BALANCED','14–18 circles. A blend of shortcuts, bridges, and multiple useful signal stations.','new-random',1,'Generate Medium')}
      ${choiceCard('◇','Hard','SPARSE / MULTI-STATION','18–21 circles. Winding routes where several separated broadcasts are often cheapest.','new-random',2,'Generate Hard')}
      <article class="choice-card panel"><div class="choice-icon">✦</div><h3>Exact minimum</h3><p>Every newly generated graph is solved by an exact algorithm to calculate Par. Hints reveal one step from its optimal solution.</p><div class="small-note">${randomSolvedCount()} unique random graph(s) completed so far</div></article>
      </div><div class="page-actions"><button type="button" class="ghost" data-action="home">← Back to Menu</button></div>`;
  }
  function renderCompetitive(){
    const last=save.lastCompetitive;
    return `${pageHeader('Competitive','Race a simulated rival to find the minimum signal solution. First to exact Par wins; a 3-minute clock decides unfinished races by lowest complete cost.','LOCAL COMPETITIVE')}
      <div class="two-column">
      ${choiceCard('⚡','Quick Practice','EASY ARENA','Dense graph • racing a relaxed local opponent • no hints.','new-race',0,'Start Easy Race')}
      ${choiceCard('⌁','Standard Race','MEDIUM ARENA','Mixed graph • an opponent that actively adjusts its signal plan.','new-race',1,'Start Medium Race')}
      ${choiceCard('◆','Hard Race','HARD ARENA','Sparse long-route graph • a more capable rival.','new-race',2,'Start Hard Race')}
      <article class="choice-card panel"><div class="choice-icon">↻</div><h3>Rematch</h3><p>${last?`Replay ${['Easy','Medium','Hard'][last.difficulty]} seed ${seedLabel(last.seed)} with a fresh rival clock.`:'Play a race to save a seed for replay.'}</p><button type="button" class="secondary" data-action="rematch" ${last?'':'disabled'}>Replay Seed</button></article>
      <article class="choice-card big panel"><div><div class="choice-sub">PLAY A SHARED SEED</div><h3>Friend Seed Practice</h3><p>Use the same numeric seed on two browsers to play the same graph separately. This is not live PvP.</p></div><div style="min-width:min(100%,240px);flex:0 1 240px"><input class="code-input" id="friend-seed" inputmode="numeric" type="text" maxlength="10" placeholder="Seed (e.g. 12345)" aria-label="Graph seed" /><button style="margin-top:9px" type="button" class="secondary" data-action="friend-race">Start Seed</button></div></article>
      </div><div class="info-strip panel"><strong>Local race record:</strong> ${save.race.matches||0} matches · ${save.race.wins||0} wins · ${save.race.losses||0} losses · ${save.race.draws||0} draws.<br />Online PvP requires deploying an additional server and is not part of this static GitHub Pages edition.</div>
      <div class="page-actions"><button type="button" class="ghost" data-action="home">← Back to Menu</button></div>`;
  }
  function renderHow(){
    return `${pageHeader('How to Play','Cover every circle while spending as few signal points as you can.','LEARN THE RULES')}
    <div class="instructions-grid">
      <article class="instruction-card panel"><span class="step-icon">👆</span><h3>1. Assign signal strength</h3><p>Tap or click a circle to raise its signal strength from 0 up to its maximum, then back to 0. Long-press a circle to lower the value instead. On desktop, right-click or Shift+click to lower.</p></article>
      <article class="instruction-card panel"><span class="step-icon">◉</span><h3>2. Cover your network</h3><p>A circle broadcasting signal <b style="color:var(--pink)">k</b> covers itself and every circle up to <b>k links away</b>, following connections rather than straight-line distance.</p></article>
      <article class="instruction-card panel"><span class="step-icon">∑</span><h3>3. Minimize your total</h3><p>Your cost is the sum of all signal strengths. Covering every node completes a puzzle. A lower cost earns more stars. You can keep adjusting the board to improve a nonoptimal solution.</p></article>
      <article class="instruction-card panel"><span class="step-icon">★</span><h3>4. Match exact Par</h3><p>Par is the proven smallest possible cost. Match it for three stars. Par + 1 awards two stars, and any other complete answer gives one star. The Hint button points to one move from an optimal answer.</p></article>
    </div>
    <section class="rule-demo"><div class="caps">EXAMPLE · A SIGNAL OF 2</div><div class="demo-nodes"><span class="demo-node">A</span><span class="demo-node">B</span><span class="demo-node active">C</span><span class="demo-node">D</span><span class="demo-node">E</span></div><small>A transmitter with signal 2 on C reaches A, B, C, D and E (two edges or fewer).</small></section>
    <div class="page-actions"><button class="primary" type="button" data-action="continue">Start Playing ↗</button><button class="ghost" type="button" data-action="home">← Menu</button></div>`;
  }
  function settingToggle(name,title,description,enabled){return `<div class="setting-row panel"><div><h3>${title}</h3><p>${description}</p></div><button type="button" class="setting-toggle ${enabled?'on':''}" data-action="toggle-setting" data-setting="${name}" aria-pressed="${!!enabled}">${enabled?'ON':'OFF'}</button></div>`;}
  function renderSettings(){
    const s=save.settings;
    return `${pageHeader('Settings','Your progress, audio choices, and preferences are saved in this browser.','MAKE IT YOURS')}
      ${settingToggle('sound','Sound Effects','Signal taps, menu controls, resets, hints and celebrations.',s.sound)}
      ${settingToggle('music','Background Music','Looped soundtrack bundled from the supplied Android project.',s.music)}
      <div class="setting-row panel"><div><h3>Music Track</h3><p>${escapeHTML(MUSIC[s.track]?.description||MUSIC[1].description)}</p></div><select class="setting-select" id="track-setting" aria-label="Choose soundtrack" data-setting="track">${MUSIC.map((t,i)=>`<option value="${i}" ${s.track===i?'selected':''}>${escapeHTML(t.name)}</option>`).join('')}</select></div>
      ${settingToggle('haptics','Vibration','A short vibration on supported phones when placing signal.',s.haptics)}
      ${settingToggle('effects','Animations','Glowing rings and moving signal pulses.',s.effects)}
      <div class="setting-row panel"><div><h3>Player Nickname</h3><p>The name shown in the menu and local competitive view.</p></div><button class="secondary" type="button" data-action="nickname">${escapeHTML(s.nickname)} ↻</button></div>
      <div class="info-strip panel"><strong>Your data stays on your device.</strong> This static version uses browser localStorage for scores and settings. It has no analytics, ads, or required accounts. Browser settings or private mode can clear saved progress. <br /><span style="color:var(--yellow)">Publishing note:</span> Confirm you own or have distribution rights for the bundled soundtrack files before putting your repository online.</div>
      <div class="page-actions"><button class="ghost" type="button" data-action="home">← Back to Menu</button><button class="ghost" type="button" data-action="reset-progress">Erase saved progress</button></div>`;
  }
  function renderCredits(){
    return `${pageHeader('Credits','Inspired by the graph-theoretic broadcast domination problem.','THE IDEA BEHIND THE GAME')}
      <section class="credits-banner panel"><div class="credits-logo">◉</div><div class="caps">A GRAPH PUZZLE FROM</div><h2>NodeSmith <span class="accent-text">Games</span></h2>
      <p>Signal Dominion takes the mathematical idea of broadcast domination and turns it into a visual optimization challenge. This web adaptation uses the campaign graphs and exact Par values from the supplied Android game source.</p><p>It includes 43 handcrafted levels, procedurally generated graph puzzles, locally saved scores, and a simulated competitive opponent.</p>
      <div class="win-stars">${totalStars()} <span class="muted" style="font-size:16px">/ ${levels.length*3} stars</span></div><div class="small-note">Campaign achievements earned on this browser</div></section>
      <div class="page-actions"><button class="ghost" type="button" data-action="home">← Back to Menu</button></div>`;
  }
  function previewSVG(level,powers){
    const covered=coveredFor(level,powers);const n=level.n;
    const cx=i=>20+260*level.x[i],cy=i=>16+128*level.y[i];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160" role="img" aria-label="Opponent's current graph">
      ${level.edges.map(([a,b])=>`<line x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}" stroke="${covered[a]&&covered[b]?'#4cc9f0':'#53617f'}" stroke-width="2" stroke-linecap="round" />`).join('')}
      ${Array.from({length:n},(_,i)=>`<circle cx="${cx(i)}" cy="${cy(i)}" r="${n>18?5:6}" fill="${covered[i]?'#4cc9f0':'#2d3954'}" stroke="${powers[i]>0?'#f72585':'#d8e8ff'}" stroke-width="${powers[i]>0?2.5:1}"/>${powers[i]>0?`<circle cx="${cx(i)+6}" cy="${cy(i)-7}" r="5" fill="#f72585"/><text x="${cx(i)+6}" y="${cy(i)-5}" font-size="6" fill="#fff" text-anchor="middle">${powers[i]}</text>`:''}`).join('')}</svg>`;
  }
  function renderBoard(level,powers){
    const covered=coveredFor(level,powers);const dense=level.n>14;
    const X=i=>5+90*level.x[i],Y=i=>6+88*level.y[i];
    const lines=level.edges.map(([a,b])=>{
      const lit=covered[a]&&covered[b];return `<g class="${lit?'edge-lit':''}"><line class="edge-glow" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/><line class="edge-line" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>${lit&&!save.settings.effects?'':lit?`<line class="edge-dash" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>`:''}</g>`;
    }).join('');
    const nodes=Array.from({length:level.n},(_,i)=>{
      const power=powers[i];const cls=`node ${covered[i]?'covered':''} ${power?'powered':''} ${state.hint===i?'hinted':''}`;
      const describe=`Node ${labelNode(i)}. Signal ${power}. ${covered[i]?'Covered':'Uncovered'}. Tap to increase; long press to decrease.`;
      return `<button type="button" class="${cls}" style="left:${X(i)}%;top:${Y(i)}%;--power:${power}" data-node="${i}" aria-label="${escapeHTML(describe)}" title="${escapeHTML(describe)}"><span class="coverage-orbit" aria-hidden="true"></span><span class="node-disc">${labelNode(i)}</span>${power?`<span class="node-badge" aria-hidden="true">${power}</span>`:''}<span class="node-target" aria-hidden="true"></span></button>`;
    }).join('');
    let mini='';
    if(state.mode==='competitive'&&state.race){
      const r=state.race;
      mini=`<button type="button" class="rival-mini" id="rival-mini" data-rival="true" aria-label="Open ${escapeHTML(r.botName)}'s live graph preview. Drag to reposition."><h4>◉ ${escapeHTML(r.botName)} <span class="pink-text">●</span></h4><p id="rival-mini-status">Cost ${r.botScore} · ${r.botCovered}/${level.n} · Best ${r.botBest>=INF?'—':r.botBest}</p><div id="rival-snapshot">${previewSVG(level,r.botPowers)}</div><small>Drag · tap to enlarge</small></button>`;
    }
    return `<section class="board-card"><div class="graph-stage ${dense?'dense':''}" id="graph-stage" aria-label="Graph game board"><svg xmlns="http://www.w3.org/2000/svg" class="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}${mini}</div>
      <div class="board-instructions"><span><strong>◉ ${covered.filter(Boolean).length}/${level.n} nodes covered.</strong> Tap to increase signal; long-press, Shift+click or right-click to lower.</span><span class="hint-text">${escapeHTML(state.hintText)}</span></div></section>`;
  }
  function renderGame(){
    const level=state.level,covered=coveredFor(level,state.powers),cost=sum(state.powers),count=covered.filter(Boolean).length;
    const best=bestCurrent(),complete=count===level.n,optimal=complete&&cost===level.par;
    const competitive=state.mode==='competitive',random=state.mode==='random';
    const pack=competitive?'COMPETITIVE RACE':random?'RANDOM GRAPHS':`${level.pack.toUpperCase()} PACK`;
    const sequence=competitive||random?`SEED ${seedLabel(competitive?state.competitiveSeed:state.randomSeed)}`:`LEVEL ${String(state.levelIndex+1).padStart(2,'0')} / ${levels.length}`;
    const time=competitive?`<div class="race-line"><span><b>YOU</b> · Best <b id="your-race-best">${state.race?.playerBest<INF?state.race.playerBest:'—'}</b></span><span id="rival-status">${escapeHTML(state.race?.botName||'Rival')} · ${state.race?.botCovered||0}/${level.n} covered</span><span>TIME LEFT <b class="timer" id="raceTimer">${timeString(LIMIT_MS)}</b></span></div>`:'';
    const bestValue=best>=INF?'—':best;
    const nextLabel=competitive?'New':random?'Random':state.levelIndex===levels.length-1?'Menu':'Next';
    const prevLabel=competitive?'Match':random?'New':'Prev';
    const prevAction=competitive?'back-competitive':random?'new-current-random':'previous-level';
    const nextAction=competitive?'new-current-race':random?'random-menu':'next-level';
    return `<section class="game">
      <div class="game-header panel"><div class="game-header-top"><div><div class="eyebrow">${escapeHTML(pack)}</div><h1>${escapeHTML(level.name)}</h1><p class="subtitle">${escapeHTML(level.description)}</p></div><span class="level-chip">${sequence}</span></div>
      <div class="stats"><div class="stat-box"><small>Signal cost</small><strong class="${optimal?'good':complete?'warn':''}">${cost}</strong></div><div class="stat-box"><small>Exact Par</small><strong class="lime-text">${level.par}</strong></div><div class="stat-box"><small>Covered</small><strong>${count}<span class="muted" style="font-size:12px"> /${level.n}</span></strong></div><div class="stat-box"><small>${competitive?'Arena best':'Your best'}</small><strong>${bestValue}${!competitive&&!random&&best<INF?` <span style="font-size:10px;color:var(--yellow)">${starText(starCount(level.par,best))}</span>`:''}</strong></div></div>
      <div class="progress-rail" role="progressbar" aria-label="Nodes covered" aria-valuemin="0" aria-valuemax="${level.n}" aria-valuenow="${count}"><div class="progress-fill ${complete?'complete':''}" style="width:${100*count/level.n}%"></div></div>${time}</div>
      ${renderBoard(level,state.powers)}
      <div class="game-controls"><button type="button" class="secondary" data-action="${prevAction}">${prevLabel==='Prev'?'‹ ':''}${prevLabel}</button><button type="button" class="secondary" data-action="reset">↺ Reset</button><button type="button" class="secondary" data-action="hint" ${competitive?'disabled title="No hints in competitive"':''}>${competitive?'No Hint':'✦ Hint'}</button><button type="button" class="${complete?'primary':'secondary'}" data-action="${nextAction}">${nextLabel}${nextLabel==='Next'?' ›':''}</button></div>
      <div class="game-meta"><span>${competitive?'First optimal solution wins. 3-minute limit.':random?'Exact Par calculated for this generated board.':'Solve to unlock the next campaign level.'}</span><span>${complete?optimal?'Optimal solution!':`Covered — aim for Par ${level.par}`:'Pink-ringed nodes are transmitters.'}</span></div>
    </section>`;
  }
  function renderModal(){
    const m=state.modal;
    if(!m){$modal.innerHTML='';return;}
    if(m.type==='loading'){
      $modal.innerHTML=`<div class="modal-scrim" role="alertdialog" aria-label="Creating graph"><div class="modal-card"><div class="caps">SIGNAL GENERATOR</div><h2 style="color:var(--cyan)">Generating Network</h2><p>${escapeHTML(m.text)}</p><p class="small-note">Computing a mathematically optimal Par.</p></div></div>`;return;
    }
    if(m.type==='opponent'){
      const r=state.race,l=state.level;
      $modal.innerHTML=`<div class="modal-scrim" data-action="modal-close"><section class="modal-card" style="width:min(620px,100%)" role="dialog" aria-modal="true" aria-label="Rival graph"><button class="modal-close" type="button" data-action="modal-close" aria-label="Close">×</button><div class="modal-kicker">LIVE LOCAL OPPONENT</div><h2 style="color:var(--cyan)">${escapeHTML(r.botName)}'s board</h2><div id="rival-large-svg" class="rival-overlay-board">${previewSVG(l,r.botPowers)}</div><div class="rival-stats"><span>Covered <b>${r.botCovered}/${l.n}</b></span><span>Cost <b>${r.botScore}</b></span><span>Best <b>${r.botBest>=INF?'—':r.botBest}</b></span></div><div class="modal-buttons"><button class="secondary" type="button" data-action="modal-close">Close Preview</button></div></section></div>`;return;
    }
    if(m.type==='win'){
      const l=state.level,cost=sum(state.powers),stars=starCount(l.par,cost),perfect=cost<=l.par;
      const next=state.levelIndex===levels.length-1?'Menu':'Next Level';
      $modal.innerHTML=`<div class="modal-scrim" role="presentation"><section class="modal-card ${perfect?'won':'not-optimal'}" role="dialog" aria-modal="true" aria-label="Level complete"><button class="modal-close" type="button" data-action="modal-close" aria-label="Keep playing">×</button>
      <div class="modal-kicker">LEVEL ${state.levelIndex+1} COMPLETE</div><h2>${perfect?'Optimal Broadcast!':'Network Covered!'}</h2><p>${escapeHTML(l.name)}</p><div class="win-stars ${perfect?'':'partial'}">${starText(stars)}</div>
      <div class="win-score">Your cost <b>${cost}</b> · Exact Par <b>${l.par}</b> · Best <b>${bestFor(`c${state.levelIndex}`)}</b></div>
      <p>${perfect?'You matched the proven minimum and earned three stars.':`Nice work! Level ${Math.min(levels.length,state.levelIndex+2)} is unlocked. You can keep optimizing this answer for more stars.`}</p>
      <div class="modal-buttons">${!perfect?'<button class="ghost" type="button" data-action="modal-close">Keep improving</button>':''}<button class="secondary" type="button" data-action="repeat">↻ Repeat</button><button class="primary" type="button" data-action="next-level">${next} ›</button></div></section></div>`;return;
    }
    if(m.type==='race'){
      const r=state.race;const good=m.won||m.draw;
      $modal.innerHTML=`<div class="modal-scrim" role="presentation"><section class="modal-card ${good?'won':'not-optimal'}" role="dialog" aria-modal="true" aria-label="Race result"><div class="modal-kicker">COMPETITIVE RESULT</div>
      <h2>${m.draw?'A Draw!':m.won?'You Won!':`${escapeHTML(r.botName)} Wins`}</h2><p>${escapeHTML(m.reason)}</p><div class="win-score">Your best <b>${r.playerBest>=INF?'—':r.playerBest}</b> · ${escapeHTML(r.botName)} best <b>${r.botBest>=INF?'—':r.botBest}</b> · Par <b>${state.level.par}</b></div>
      <div class="modal-buttons"><button class="ghost" type="button" data-action="back-competitive">Back</button><button class="secondary" type="button" data-action="rematch">Rematch</button><button class="primary" type="button" data-action="new-current-race">New Race ↗</button></div></section></div>`;
    }
  }
  function restoreMiniPosition(){
    const mini=document.getElementById('rival-mini'),stage=document.getElementById('graph-stage');
    if(!mini||!stage||!save.miniPos)return;
    const maxX=Math.max(0,stage.clientWidth-mini.offsetWidth-4);
    const maxY=Math.max(0,stage.clientHeight-mini.offsetHeight-4);
    mini.style.left=`${clamp(Number(save.miniPos.x)||0,0,1)*maxX}px`;
    mini.style.top=`${clamp(Number(save.miniPos.y)||0,0,1)*maxY}px`;
    mini.style.right='auto';
  }
  function render(){
    document.body.classList.toggle('reduced-motion',!save.settings.effects);
    const views={menu:renderMenu,levels:renderLevels,random:renderRandom,competitive:renderCompetitive,how:renderHow,settings:renderSettings,credits:renderCredits,game:renderGame};
    $main.innerHTML=(views[state.screen]||renderMenu)();
    document.getElementById('quick-sound')?.classList.toggle('is-active',save.settings.sound);
    document.getElementById('quick-music')?.classList.toggle('is-active',save.settings.music);
    document.getElementById('quick-sound')?.setAttribute('aria-pressed',String(save.settings.sound));
    document.getElementById('quick-music')?.setAttribute('aria-pressed',String(save.settings.music));
    renderModal();
    restoreMiniPosition();
    if(state.mode==='competitive'&&state.screen==='game')updateRace();
  }
  function navigate(screen){state.screen=screen;clearModal();playSound('button');render();window.scrollTo?.({top:0,behavior:'instant'});}
  function nextCampaign(){
    if(state.levelIndex===levels.length-1){navigate('menu');return;}
    if(!isUnlocked(state.levelIndex+1)){clearModal();notice('Complete this level to unlock the next one.');return;}
    loadCampaign(state.levelIndex+1);
  }
  function handleAction(action,el){
    if(!action)return;
    if(!['quick-sound','quick-music'].includes(action))updateMusic();
    switch(action){
      case 'home':navigate('menu');break;
      case 'continue':loadCampaign(recommendLevel());playSound('button');break;
      case 'levels':state.levelPage=Math.floor(recommendLevel()/12);navigate('levels');break;
      case 'random-menu':navigate('random');break;
      case 'competitive':navigate('competitive');break;
      case 'how':navigate('how');break;
      case 'credits':navigate('credits');break;
      case 'settings':navigate('settings');break;
      case 'prev-page':state.levelPage--;playSound('button');render();break;
      case 'next-page':state.levelPage++;playSound('button');render();break;
      case 'select-level':loadCampaign(Number(el.dataset.index));playSound('button');break;
      case 'new-random':loadGenerated('random',Number(el.dataset.difficulty),randomSeed());playSound('button');break;
      case 'continue-random':{
        const r=save.lastRandom;loadGenerated('random',r?.difficulty??1,r?.seed||randomSeed());playSound('button');break;
      }
      case 'new-race':loadGenerated('competitive',Number(el.dataset.difficulty),randomSeed());playSound('button');break;
      case 'rematch':{
        const r=save.lastCompetitive;loadGenerated('competitive',r?.difficulty??1,r?.seed||randomSeed());playSound('button');break;
      }
      case 'friend-race':{
        const value=document.getElementById('friend-seed')?.value.trim();
        if(!value||!/^\d{1,10}$/.test(value)||Number(value)>4294967295){notice('Enter a numeric seed between 1 and 4294967295.');break;}
        loadGenerated('competitive',1,Number(value));playSound('button');break;
      }
      case 'previous-level':if(state.levelIndex>0)loadCampaign(state.levelIndex-1);else notice('This is the first level.');break;
      case 'next-level':nextCampaign();break;
      case 'repeat':loadCampaign(state.levelIndex);break;
      case 'reset':reset();break;
      case 'hint':hint();break;
      case 'new-current-random':loadGenerated('random',state.randomDifficulty,randomSeed());break;
      case 'new-current-race':loadGenerated('competitive',state.competitiveDifficulty,randomSeed());break;
      case 'back-competitive':navigate('competitive');break;
      case 'modal-close':clearModal();render();break;
      case 'toggle-setting':{
        const key=el.dataset.setting;if(!['sound','music','haptics','effects'].includes(key))break;
        save.settings[key]=!save.settings[key];persist();
        if(key==='music')updateMusic();
        playSound('button');render();notice(`${key==='effects'?'Animations':key.charAt(0).toUpperCase()+key.slice(1)} ${save.settings[key]?'on':'off'}`);break;
      }
      case 'nickname':{
        const idx=NICKNAMES.indexOf(save.settings.nickname);
        save.settings.nickname=NICKNAMES[(idx+1)%NICKNAMES.length];persist();playSound('button');render();notice(`Nickname: ${save.settings.nickname}`);break;
      }
      case 'quick-sound':save.settings.sound=!save.settings.sound;persist();render();notice(`Sound effects ${save.settings.sound?'on':'off'}`);break;
      case 'quick-music':save.settings.music=!save.settings.music;persist();updateMusic();render();notice(`Music ${save.settings.music?'on':'off'}`);break;
      case 'reset-progress':{
        if(!window.confirm('Erase ALL saved stars, scores, random progress, race stats, and settings in this browser?'))break;
        try{localStorage.removeItem(LS_KEY);}catch{}
        save.best={};save.randomSolved={};save.race={matches:0,wins:0,losses:0,draws:0};delete save.lastRandom;delete save.lastCompetitive;
        save.settings={sound:true,music:true,track:1,effects:true,haptics:true,nickname:'NodePilot'};
        save.lastLevel=0;state.levelIndex=0;state.levelPage=0;persist();render();notice('Local save data cleared.');break;
      }
      default:break;
    }
  }

  // Click handler for the app and modal controls. Graph nodes use pointer events below.
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-action]');
    if(target){
      if(target.classList.contains('modal-scrim')&&e.target!==target)return;
      e.preventDefault();handleAction(target.dataset.action,target);
    }
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el?.id==='track-setting'){
      save.settings.track=clamp(Number(el.value)||0,0,MUSIC.length-1);persist();updateMusic();playSound('button');render();notice(`Track: ${MUSIC[save.settings.track].name}`);
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(state.modal){if(state.modal.type==='loading'||state.modal.type==='race')return;clearModal();render();}
      else if(state.screen!=='menu')navigate('menu');
      return;
    }
    if(e.target.matches('[data-node]')&&['Enter',' ','ArrowUp','ArrowDown','-','+'].includes(e.key)){
      e.preventDefault();const index=Number(e.target.dataset.node);
      changePower(index,e.key==='ArrowDown'||e.key==='-'||e.shiftKey?-1:1);return;
    }
    if(e.key==='Backspace'&&state.screen==='game'&&!e.target.matches('input,textarea')){e.preventDefault();reset();}
  });
  document.addEventListener('contextmenu',e=>{
    const node=e.target.closest?.('[data-node]');
    if(node){e.preventDefault();changePower(Number(node.dataset.node),-1);}
  });
  $main.addEventListener('pointerdown',e=>{
    const node=e.target.closest?.('[data-node]');
    if(node&&e.button===0){
      e.preventDefault();
      press={id:e.pointerId,index:Number(node.dataset.node),x:e.clientX,y:e.clientY,moved:false,long:false,timer:null};
      node.setPointerCapture?.(e.pointerId);
      const instance=press;
      instance.timer=setTimeout(()=>{
        if(press===instance&&!press.moved){instance.long=true;changePower(instance.index,-1);}
      },460);
      return;
    }
    const mini=e.target.closest?.('[data-rival]');
    if(mini&&e.button===0){
      e.preventDefault();const stage=document.getElementById('graph-stage');
      const rect=mini.getBoundingClientRect(),parent=stage?.getBoundingClientRect();
      rivalDrag={id:e.pointerId,mini,startX:e.clientX,startY:e.clientY,left:rect.left-(parent?.left||0),top:rect.top-(parent?.top||0),parent,moved:false};
      mini.setPointerCapture?.(e.pointerId);
    }
  });
  document.addEventListener('pointermove',e=>{
    if(press&&e.pointerId===press.id){
      if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>20){press.moved=true;clearTimeout(press.timer);}
    }
    if(rivalDrag&&e.pointerId===rivalDrag.id){
      let r=rivalDrag;if(Math.hypot(e.clientX-r.startX,e.clientY-r.startY)>8)r.moved=true;
      if(r.moved&&r.parent){
        const left=clamp(r.left+e.clientX-r.startX,4,r.parent.width-r.mini.offsetWidth-4);
        const top=clamp(r.top+e.clientY-r.startY,4,r.parent.height-r.mini.offsetHeight-4);
        r.mini.style.left=`${left}px`;r.mini.style.top=`${top}px`;r.mini.style.right='auto';
      }
    }
  });
  document.addEventListener('pointerup',e=>{
    if(press&&e.pointerId===press.id){
      const p=press;press=null;clearTimeout(p.timer);
      if(!p.moved&&!p.long){
        const target=e.target.closest?.('[data-node]');
        if(target&&Number(target.dataset.node)===p.index)changePower(p.index,e.shiftKey?-1:1);
      }
    }
    if(rivalDrag&&e.pointerId===rivalDrag.id){
      const drag=rivalDrag;rivalDrag=null;
      if(drag.moved&&drag.parent){
        const maxX=Math.max(1,drag.parent.width-drag.mini.offsetWidth-4);
        const maxY=Math.max(1,drag.parent.height-drag.mini.offsetHeight-4);
        save.miniPos={x:clamp((parseFloat(drag.mini.style.left)||0)/maxX,0,1),y:clamp((parseFloat(drag.mini.style.top)||0)/maxY,0,1)};
        persist();
      }
      if(!drag.moved&&state.race){state.modal={type:'opponent'};renderModal();}
    }
  });
  document.addEventListener('pointercancel',()=>{if(press){clearTimeout(press.timer);press=null;}rivalDrag=null;});
  window.addEventListener('resize',restoreMiniPosition);

  // Restore current campaign position; the last saved stage may have been unlocked later.
  const last=clamp(Number(save.lastLevel)||0,0,Math.max(0,levels.length-1));
  state.levelIndex=isUnlocked(last)?last:recommendLevel();
  state.level=levels[state.levelIndex];
  state.powers=Array(state.level?.n||0).fill(0);
  state.levelPage=Math.floor(state.levelIndex/12);
  const params=new URLSearchParams(window.location.search);
  if(params.has('seed')&&/^\d{1,10}$/.test(params.get('seed')||'')){
    const seed=Number(params.get('seed'))>>>0;
    const difficulty=clamp(Number(params.get('difficulty'))||1,0,2);
    if(seed)loadGenerated('competitive',difficulty,seed);
  }
  render();
  setInterval(()=>{if(state.screen==='game'&&state.mode==='competitive')updateRace();},350);
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
