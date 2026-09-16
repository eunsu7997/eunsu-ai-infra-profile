(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const UI = {
    startOverlay: $('startOverlay'), pauseOverlay: $('pauseOverlay'), resultOverlay: $('resultOverlay'),
    startBtn: $('startBtn'), restartBtn: $('restartBtn'), effectToggle: $('effectToggle'),
    timeText: $('timeText'), phaseText: $('phaseText'), bossBar: $('bossBar'), hearts: $('hearts'),
    scoreText: $('scoreText'), comboText: $('comboText'), dashText: $('dashText'), stateText: $('stateText'),
    winsText: $('winsText'), bestScoreText: $('bestScoreText'), bestTimeText: $('bestTimeText'),
    resultKicker: $('resultKicker'), resultTitle: $('resultTitle'), resultSummary: $('resultSummary'),
    gradeText: $('gradeText'), scoreResult: $('scoreResult'), dodgeResult: $('dodgeResult')
  };

  const ROUND_SECONDS = 28;
  const ATTACK_INTERVAL_MS = 740; // 최종 난이도. 변경 전에는 920ms만 사용했다.
  const STORAGE_KEY = 'raidzero:v1';
  const PLAYER_RADIUS = 11;
  const PLAYER_SPEED = 235;
  const DASH_DISTANCE = 78;
  const DASH_COOLDOWN = 1.05;

  let rafId = 0;
  let lastTs = 0;
  let accumulator = 0;
  let nextPatternAt = 0;
  let effectsReduced = false;
  let pausedByBlur = false;
  let records = loadRecords();

  const input = { up:false, down:false, left:false, right:false };
  const debug = { coreInputEvents:0, coreActions:0, lastResetSignature:'', errors:[] };

  let state = createFreshState();

  function createFreshState(){
    return {
      mode:'ready', elapsed:0, timeLeft:ROUND_SECONDS, phase:1, hp:5, score:0, combo:0, dodges:0,
      dashCooldown:0, player:{x:480,y:360}, hazards:[], particles:[], screenShake:0,
      lastPatternName:'-', roundStartedAt:0, result:null
    };
  }

  function sanitizeRecord(raw){
    const safe = { wins:0, bestScore:0, bestTime:0 };
    if (!raw || typeof raw !== 'object') return safe;
    const wins = Number(raw.wins), bestScore = Number(raw.bestScore), bestTime = Number(raw.bestTime);
    return {
      wins: Number.isFinite(wins) && wins >= 0 ? Math.floor(wins) : 0,
      bestScore: Number.isFinite(bestScore) && bestScore >= 0 ? Math.floor(bestScore) : 0,
      bestTime: Number.isFinite(bestTime) && bestTime >= 0 && bestTime <= ROUND_SECONDS ? bestTime : 0
    };
  }

  function loadRecords(){
    try{
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) return { wins:0, bestScore:0, bestTime:0 };
      return sanitizeRecord(JSON.parse(text));
    }catch(error){
      return { wins:0, bestScore:0, bestTime:0 };
    }
  }

  function saveRecords(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }catch(error){ /* 저장 실패가 게임을 중단시키지 않음 */ }
  }

  function resetRound(){
    state = createFreshState();
    Object.keys(input).forEach(k => input[k] = false);
    nextPatternAt = 0; accumulator = 0; lastTs = performance.now(); pausedByBlur = false;
    debug.lastResetSignature = `${state.mode}|${state.timeLeft}|${state.hp}|${state.score}|${state.combo}|${state.hazards.length}`;
    syncUi();
  }

  function startRound(){
    resetRound();
    state.mode = 'playing';
    state.roundStartedAt = performance.now();
    UI.startOverlay.classList.remove('show');
    UI.resultOverlay.classList.remove('show');
    UI.pauseOverlay.classList.remove('show');
    UI.resultOverlay.setAttribute('aria-hidden','true');
    UI.pauseOverlay.setAttribute('aria-hidden','true');
    spawnPattern(true);
    syncUi();
  }

  function restartRound(){ startRound(); }

  function togglePause(force){
    if (state.mode !== 'playing' && state.mode !== 'paused') return;
    const shouldPause = typeof force === 'boolean' ? force : state.mode === 'playing';
    state.mode = shouldPause ? 'paused' : 'playing';
    UI.pauseOverlay.classList.toggle('show', shouldPause);
    UI.pauseOverlay.setAttribute('aria-hidden', shouldPause ? 'false' : 'true');
    if (!shouldPause) lastTs = performance.now();
    syncUi();
  }

  function endRound(success){
    state.mode = success ? 'success' : 'fail';
    const survived = Math.min(ROUND_SECONDS, state.elapsed);
    const grade = getGrade(success);
    state.result = { success, grade, score:Math.floor(state.score), dodges:state.dodges, survived };
    if (success) records.wins += 1;
    records.bestScore = Math.max(records.bestScore, Math.floor(state.score));
    records.bestTime = Math.max(records.bestTime, survived);
    saveRecords();
    if (!effectsReduced) burst(canvas.width/2, canvas.height/2, success ? 46 : 24, success ? '#6ef0b2' : '#ff5369');
    UI.resultKicker.textContent = success ? 'ROUND COMPLETE' : 'SYSTEM DOWN';
    UI.resultTitle.textContent = success ? '생존 성공' : '레이드 실패';
    UI.resultSummary.textContent = success ? '28초 동안 보스 패턴을 버텼습니다.' : `${survived.toFixed(1)}초 생존 후 HP가 0이 되었습니다.`;
    UI.gradeText.textContent = grade;
    UI.scoreResult.textContent = Math.floor(state.score).toLocaleString();
    UI.dodgeResult.textContent = String(state.dodges);
    UI.resultOverlay.classList.add('show');
    UI.resultOverlay.setAttribute('aria-hidden','false');
    syncUi();
  }

  function getGrade(success){
    if (!success) return state.elapsed >= 20 ? 'C' : 'D';
    if (state.hp === 5) return 'S';
    if (state.hp >= 3) return 'A';
    return 'B';
  }

  function coreDashAction(){
    debug.coreInputEvents += 1;
    if (state.mode !== 'playing') return;
    debug.coreActions += 1; // 핵심 입력 이벤트 1회당 대시 시도 1회
    if (state.dashCooldown > 0) {
      // 입력 1회는 정확히 1회 처리되지만, 쿨다운 중에는 위치 변화 없이 BLOCKED 결과로 끝난다.
      state.lastPatternName = 'DASH BLOCKED';
      return;
    }
    const dir = movementVector();
    let dx = dir.x, dy = dir.y;
    if (dx === 0 && dy === 0) dy = -1;
    state.player.x = clamp(state.player.x + dx * DASH_DISTANCE, 18, canvas.width-18);
    state.player.y = clamp(state.player.y + dy * DASH_DISTANCE, 18, canvas.height-64);
    state.dashCooldown = DASH_COOLDOWN;
    state.score += 18;
    if (!effectsReduced) burst(state.player.x,state.player.y,14,'#57e7ff');
  }

  function movementVector(){
    let x = (input.right?1:0) - (input.left?1:0);
    let y = (input.down?1:0) - (input.up?1:0);
    if (!x && !y) return {x:0,y:0};
    const len = Math.hypot(x,y); return {x:x/len,y:y/len};
  }

  function spawnPattern(initial=false){
    if (state.mode !== 'playing') return;
    const phase = state.phase;
    const options = phase === 1 ? ['circle','tracker'] : phase === 2 ? ['circle','laser','donut'] : ['circle','laser','donut','tracker','cross'];
    const type = initial ? 'circle' : options[Math.floor(Math.random()*options.length)];
    const warning = phase === 1 ? 0.92 : phase === 2 ? 0.80 : 0.66;
    const damageLife = 0.18;
    if (type === 'circle'){
      state.hazards.push({type,x:rand(100,canvas.width-100),y:rand(95,canvas.height-100),r:rand(48,78),t:0,warning,active:damageLife,hit:false});
      state.lastPatternName='원형 장판';
    } else if (type === 'tracker'){
      state.hazards.push({type:'circle',x:state.player.x,y:state.player.y,r:62,t:0,warning:warning*.88,active:damageLife,hit:false});
      state.lastPatternName='추적 장판';
    } else if (type === 'laser'){
      const vertical=Math.random()<.5; const pos=vertical?rand(100,canvas.width-100):rand(90,canvas.height-110);
      state.hazards.push({type:'laser',vertical,pos,width:52,t:0,warning,active:damageLife,hit:false});
      state.lastPatternName='레이저';
    } else if (type === 'donut'){
      state.hazards.push({type:'donut',x:canvas.width/2,y:canvas.height/2,inner:110,outer:245,t:0,warning:warning*.95,active:damageLife,hit:false});
      state.lastPatternName='도넛 장판';
    } else {
      state.hazards.push({type:'laser',vertical:true,pos:canvas.width/2,width:58,t:0,warning:warning*.9,active:damageLife,hit:false});
      state.hazards.push({type:'laser',vertical:false,pos:canvas.height/2,width:58,t:0,warning:warning*.9,active:damageLife,hit:false});
      state.lastPatternName='십자 레이저';
    }
  }

  function update(dt){
    if (state.mode !== 'playing') return;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed);
    state.phase = state.elapsed < 9.5 ? 1 : state.elapsed < 19 ? 2 : 3;
    state.dashCooldown = Math.max(0,state.dashCooldown-dt);

    const mv=movementVector();
    state.player.x=clamp(state.player.x+mv.x*PLAYER_SPEED*dt,18,canvas.width-18);
    state.player.y=clamp(state.player.y+mv.y*PLAYER_SPEED*dt,18,canvas.height-64);

    accumulator += dt*1000;
    const currentInterval = ATTACK_INTERVAL_MS * (state.phase===3?.82:state.phase===2?.92:1);
    if(accumulator>=currentInterval){accumulator=0;spawnPattern();}

    for(const h of state.hazards){
      h.t += dt;
      const wasWarning = h.t < h.warning;
      const isActive = h.t >= h.warning && h.t < h.warning+h.active;
      if(isActive && !h.hit && hitsPlayer(h)){
        h.hit=true; state.hp=Math.max(0,state.hp-1); state.combo=0; state.screenShake=effectsReduced?0:10;
        if(!effectsReduced) burst(state.player.x,state.player.y,18,'#ff5369');
        if(state.hp<=0){ endRound(false); return; }
      }
      if(wasWarning && nearMiss(h)){
        // 단순 시각적 근접 회피 판정은 실제 폭발 시점에 처리
      }
      if(h.t>=h.warning+h.active && !h._scored){
        h._scored=true;
        if(!h.hit){state.dodges+=1;state.combo+=1;state.score+=25+Math.min(50,state.combo*3);}
      }
    }
    state.hazards=state.hazards.filter(h=>h.t<h.warning+h.active+.25);
    state.particles=state.particles.filter(p=>(p.life-=dt)>0);
    for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;}
    state.screenShake=Math.max(0,state.screenShake-dt*38);
    state.score += dt*10;

    if(state.timeLeft<=0){state.timeLeft=0;endRound(true);return;}
    syncUi();
  }

  function hitsPlayer(h){
    const px=state.player.x,py=state.player.y;
    if(h.type==='circle') return Math.hypot(px-h.x,py-h.y) <= h.r+PLAYER_RADIUS;
    if(h.type==='laser') return h.vertical ? Math.abs(px-h.pos)<=h.width/2+PLAYER_RADIUS : Math.abs(py-h.pos)<=h.width/2+PLAYER_RADIUS;
    if(h.type==='donut') {const d=Math.hypot(px-h.x,py-h.y);return d>=h.inner-PLAYER_RADIUS && d<=h.outer+PLAYER_RADIUS;}
    return false;
  }
  function nearMiss(){return false;}

  function burst(x,y,count,color){
    if(effectsReduced) return;
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,s=rand(55,190);
      state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.22,.55),max:.55,color});
    }
  }

  function render(){
    const shake = effectsReduced?0:state.screenShake;
    const sx=shake?rand(-shake,shake):0, sy=shake?rand(-shake,shake):0;
    ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.translate(sx,sy);
    drawArena();
    for(const h of state.hazards) drawHazard(h);
    drawBoss();drawPlayer();drawParticles();
    ctx.restore();
  }

  function drawArena(){
    const g=ctx.createRadialGradient(canvas.width/2,180,50,canvas.width/2,240,560);g.addColorStop(0,'#101a28');g.addColorStop(1,'#05080d');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(87,231,255,.055)';ctx.lineWidth=1;
    for(let x=0;x<canvas.width;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    ctx.fillStyle='rgba(18,30,45,.8)';ctx.fillRect(0,canvas.height-52,canvas.width,52);
    ctx.fillStyle='#7d90a9';ctx.font='12px monospace';ctx.fillText(`PATTERN: ${state.lastPatternName}`,18,canvas.height-21);
  }

  function drawBoss(){
    const x=canvas.width/2,y=72; const pulse=1+Math.sin(performance.now()/220)*.05;
    ctx.save();ctx.translate(x,y);ctx.scale(pulse,pulse);ctx.shadowBlur=28;ctx.shadowColor='#ff5369';ctx.fillStyle='#6d2732';ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff6578';ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function drawPlayer(){
    const {x,y}=state.player;ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#57e7ff';ctx.fillStyle='#d8fbff';ctx.beginPath();ctx.arc(x,y,PLAYER_RADIUS,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#57e7ff';ctx.lineWidth=3;ctx.stroke();ctx.restore();
  }

  function drawHazard(h){
    const warning=h.t<h.warning; const alpha=warning?0.22+0.18*Math.sin(h.t*18):0.62;
    ctx.save();ctx.lineWidth=2;ctx.strokeStyle=warning?`rgba(255,83,105,${Math.max(.38,alpha+.18)})`:'rgba(255,145,112,.95)';ctx.fillStyle=warning?`rgba(255,83,105,${alpha})`:'rgba(255,83,105,.62)';
    if(h.type==='circle'){ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else if(h.type==='laser'){if(h.vertical){ctx.fillRect(h.pos-h.width/2,0,h.width,canvas.height-52);ctx.strokeRect(h.pos-h.width/2,0,h.width,canvas.height-52);}else{ctx.fillRect(0,h.pos-h.width/2,canvas.width,h.width);ctx.strokeRect(0,h.pos-h.width/2,canvas.width,h.width);}}
    else if(h.type==='donut'){ctx.beginPath();ctx.arc(h.x,h.y,h.outer,0,Math.PI*2);ctx.arc(h.x,h.y,h.inner,0,Math.PI*2,true);ctx.fill('evenodd');ctx.stroke();}
    ctx.restore();
  }

  function drawParticles(){
    if(effectsReduced) return;
    for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}ctx.globalAlpha=1;
  }

  function syncUi(){
    UI.timeText.textContent=state.timeLeft.toFixed(1);UI.phaseText.textContent=`PHASE ${state.phase}`;UI.bossBar.style.width=`${Math.max(0,(state.timeLeft/ROUND_SECONDS)*100)}%`;
    UI.hearts.textContent=('♥ '.repeat(state.hp)+'♡ '.repeat(5-state.hp)).trim();UI.scoreText.textContent=Math.floor(state.score).toLocaleString();UI.comboText.textContent=`x${state.combo}`;
    UI.dashText.textContent=state.dashCooldown<=0?'READY':`${state.dashCooldown.toFixed(1)}s`;UI.stateText.textContent=state.mode.toUpperCase();
    UI.winsText.textContent=records.wins;UI.bestScoreText.textContent=records.bestScore.toLocaleString();UI.bestTimeText.textContent=records.bestTime.toFixed(1);
  }

  function frame(ts){
    try{
      const dt=Math.min(.033,(ts-lastTs)/1000||0);lastTs=ts;update(dt);render();rafId=requestAnimationFrame(frame);
    }catch(error){debug.errors.push(String(error));console.error(error);cancelAnimationFrame(rafId);}
  }

  function keyDirection(code,down){
    if(code==='KeyW'||code==='ArrowUp') input.up=down;
    if(code==='KeyS'||code==='ArrowDown') input.down=down;
    if(code==='KeyA'||code==='ArrowLeft') input.left=down;
    if(code==='KeyD'||code==='ArrowRight') input.right=down;
  }

  window.addEventListener('keydown',(e)=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    keyDirection(e.code,true);
    if(e.repeat) return;
    if(e.code==='Space') coreDashAction();
    else if(e.code==='KeyP') togglePause();
    else if(e.code==='KeyR' && (state.mode==='success'||state.mode==='fail')) restartRound();
  });
  window.addEventListener('keyup',(e)=>keyDirection(e.code,false));
  window.addEventListener('blur',()=>{if(state.mode==='playing'){pausedByBlur=true;togglePause(true);}});
  window.addEventListener('focus',()=>{ if(pausedByBlur){pausedByBlur=false;togglePause(false);} });
  window.addEventListener('resize',()=>syncUi());

  UI.startBtn.addEventListener('click',startRound);UI.restartBtn.addEventListener('click',restartRound);
  UI.effectToggle.addEventListener('click',()=>{
    effectsReduced=!effectsReduced;document.body.classList.toggle('reduced-effects',effectsReduced);UI.effectToggle.setAttribute('aria-pressed',String(effectsReduced));UI.effectToggle.textContent=`파티클/흔들림 줄이기: ${effectsReduced?'ON':'OFF'}`;
    if(effectsReduced){state.particles.length=0;state.screenShake=0;}
  });

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function rand(min,max){return min+Math.random()*(max-min);}

  window.__raidZeroDebug={
    getState:()=>JSON.parse(JSON.stringify(state)),
    getRecords:()=>({...records}),
    getCounters:()=>({...debug}),
    start:startRound,restart:restartRound,pause:()=>togglePause(true),resume:()=>togglePause(false),dash:coreDashAction,
    corruptSave:(text)=>localStorage.setItem(STORAGE_KEY,text),clearSave:()=>localStorage.removeItem(STORAGE_KEY),reloadRecords:()=>{records=loadRecords();syncUi();return {...records};},
    config:{ROUND_SECONDS,ATTACK_INTERVAL_MS,STORAGE_KEY}
  };

  resetRound();
  rafId=requestAnimationFrame(frame);
})();
