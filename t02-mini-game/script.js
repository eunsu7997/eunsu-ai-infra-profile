(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const UI = {
    startOverlay: $('startOverlay'),
    pauseOverlay: $('pauseOverlay'),
    resultOverlay: $('resultOverlay'),
    startBtn: $('startBtn'),
    restartBtn: $('restartBtn'),
    effectToggle: $('effectToggle'),
    timeText: $('timeText'),
    phaseText: $('phaseText'),
    bossBar: $('bossBar'),
    hearts: $('hearts'),
    scoreText: $('scoreText'),
    comboText: $('comboText'),
    dashText: $('dashText'),
    stateText: $('stateText'),
    winsText: $('winsText'),
    bestScoreText: $('bestScoreText'),
    bestTimeText: $('bestTimeText'),
    resultKicker: $('resultKicker'),
    resultTitle: $('resultTitle'),
    resultSummary: $('resultSummary'),
    gradeText: $('gradeText'),
    scoreResult: $('scoreResult'),
    dodgeResult: $('dodgeResult')
  };

  const ROUND_SECONDS = 28;
  const ATTACK_INTERVAL_MS = 700;
  const STORAGE_KEY = 'raidzero:v1';
  const PLAYER_RADIUS = 12;
  const PLAYER_SPEED = 220;
  const DASH_DISTANCE = 105;
  const DASH_COOLDOWN = 3.0;
  const DAMAGE_INVULN = 0.82;
  const S_MIN_DODGES = 50;
  const S_MIN_SCORE = 3600;

  let rafId = 0;
  let lastTs = 0;
  let accumulator = 0;
  let effectsReduced = false;
  let pausedByBlur = false;
  let records = loadRecords();

  const input = { up:false, down:false, left:false, right:false };
  const debug = { coreInputEvents:0, coreActions:0, lastResetSignature:'', errors:[] };
  let state = createFreshState();

  function createFreshState(){
    return {
      mode:'ready', elapsed:0, timeLeft:ROUND_SECONDS, phase:1,
      hp:5, score:0, combo:0, dodges:0, dashCooldown:0, invuln:0,
      player:{x:480,y:385}, hazards:[], particles:[], screenShake:0,
      dashFx:null, clearFx:null, lastPatternName:'-', roundStartedAt:0, result:null
    };
  }

  function sanitizeRecord(raw){
    const safe = { wins:0, bestScore:0, bestTime:0 };
    if (!raw || typeof raw !== 'object') return safe;
    const wins = Number(raw.wins);
    const bestScore = Number(raw.bestScore);
    const bestTime = Number(raw.bestTime);
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
    }catch(_){
      return { wins:0, bestScore:0, bestTime:0 };
    }
  }

  function saveRecords(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }catch(_){}
  }

  function resetRound(){
    state = createFreshState();
    Object.keys(input).forEach(k => input[k] = false);
    accumulator = 0;
    lastTs = performance.now();
    pausedByBlur = false;
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
    showPhaseBanner('PHASE 1');
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
    if (state.mode !== 'playing') return;

    state.mode = success ? 'success' : 'fail';
    const survived = Math.min(ROUND_SECONDS, state.elapsed);

    // 성공 순간 기존 위험 장판을 지워 결과 화면 뒤가 지저분하지 않게 한다.
    if (success){
      state.hazards.length = 0;
      state.dashFx = null;
      if (!effectsReduced){
        state.clearFx = { startedAt:performance.now(), duration:1.0 };
        burst(canvas.width/2,68,64,'#75eaff');
        burst(canvas.width/2,canvas.height/2,42,'#a7f5ff');
      }
    } else if (!effectsReduced){
      burst(canvas.width/2, canvas.height/2, 28, '#ff5369');
    }

    const grade = getGrade(success);
    state.result = { success, grade, score:Math.floor(state.score), dodges:state.dodges, survived };

    if (success) records.wins += 1;
    records.bestScore = Math.max(records.bestScore, Math.floor(state.score));
    records.bestTime = Math.max(records.bestTime, survived);
    saveRecords();

    UI.resultKicker.textContent = success ? 'RAID CLEAR' : 'TRAINING FAILED';
    UI.resultTitle.textContent = success ? 'NULL CORE 생존 성공' : '레이드 실패';
    UI.resultSummary.textContent = success
      ? `3개 페이즈를 모두 버텼습니다. S 조건: 무피격 + 회피 ${S_MIN_DODGES}+ + ${S_MIN_SCORE.toLocaleString()}점+`
      : `${survived.toFixed(1)}초 생존 후 HP가 0이 되었습니다.`;
    UI.gradeText.textContent = grade;
    UI.scoreResult.textContent = Math.floor(state.score).toLocaleString();
    UI.dodgeResult.textContent = String(state.dodges);
    UI.resultOverlay.classList.add('show');
    UI.resultOverlay.setAttribute('aria-hidden','false');
    syncUi();
  }

  function getGrade(success){
    if (!success) return state.elapsed >= 20 ? 'C' : 'D';
    if (state.hp === 5 && state.dodges >= S_MIN_DODGES && state.score >= S_MIN_SCORE) return 'S';
    if (state.hp >= 4) return 'A';
    if (state.hp >= 2) return 'B';
    return 'C';
  }

  function coreDashAction(){
    debug.coreInputEvents += 1;
    if (state.mode !== 'playing') return;
    debug.coreActions += 1;

    if (state.dashCooldown > 0){
      state.lastPatternName = 'DASH BLOCKED';
      return;
    }

    const dir = movementVector();
    let dx = dir.x, dy = dir.y;
    if (dx === 0 && dy === 0) dy = -1;

    const fromX = state.player.x;
    const fromY = state.player.y;
    const toX = clamp(fromX + dx * DASH_DISTANCE, 22, canvas.width-22);
    const toY = clamp(fromY + dy * DASH_DISTANCE, 18, canvas.height-72);

    state.player.x = toX;
    state.player.y = toY;
    state.dashCooldown = DASH_COOLDOWN;
    state.invuln = Math.max(state.invuln, .24);
    state.score += 18;

    if (!effectsReduced){
      state.dashFx = { fromX, fromY, toX, toY, age:0, duration:.28 };
      burst(fromX,fromY,10,'#57e7ff');
      burst(toX,toY,20,'#c7fbff');
    }
  }

  function movementVector(){
    let x = (input.right?1:0) - (input.left?1:0);
    let y = (input.down?1:0) - (input.up?1:0);
    if (!x && !y) return {x:0,y:0};
    const len = Math.hypot(x,y);
    return {x:x/len,y:y/len};
  }

  function addCircle(x,y,r,warning=.74){
    state.hazards.push({type:'circle',x,y,r,t:0,warning,active:.22,hit:false});
  }

  function addDonut(x,y,inner,outer,warning=.78){
    state.hazards.push({type:'donut',x,y,inner,outer,t:0,warning,active:.23,hit:false});
  }

  function addBeam(angle,width=60,warning=.70){
    state.hazards.push({type:'beam',angle,width,t:0,warning,active:.20,hit:false});
  }

  function addCross(x,y,width=54,warning=.70){
    state.hazards.push({type:'cross',x,y,width,t:0,warning,active:.21,hit:false});
  }

  function aimedCircle(scale=1, warning=.67){
    addCircle(state.player.x,state.player.y,64*scale,warning);
  }

  function ringBurst(count=5){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2;
      const d=95+Math.random()*130;
      addCircle(
        canvas.width/2+Math.cos(a)*d,
        canvas.height/2+Math.sin(a)*d,
        46+Math.random()*18,
        .68+Math.random()*.14
      );
    }
  }

  function spawnPattern(initial=false){
    if (state.mode !== 'playing') return;

    if (initial){
      aimedCircle(.92,.72);
      state.lastPatternName='추적 장판';
      return;
    }

    const p = state.phase;
    const choice = Math.random();

    if (p === 1){
      if (choice < .50){
        aimedCircle(1,.64);
        state.lastPatternName='추적 원형 장판';
      } else {
        ringBurst(5);
        state.lastPatternName='5연속 원형 장판';
      }
      return;
    }

    if (p === 2){
      if (choice < .32){
        addBeam(Math.random()*Math.PI,66,.66);
        state.lastPatternName='회전 레이저';
      } else if (choice < .64){
        addDonut(canvas.width/2,canvas.height/2,92,198,.72);
        state.lastPatternName='도넛 장판';
      } else {
        aimedCircle(1,.60);
        addCircle(
          clamp(state.player.x + rand(-95,95),70,canvas.width-70),
          clamp(state.player.y + rand(-95,95),70,canvas.height-95),
          54,.66
        );
        state.lastPatternName='2연속 추적 장판';
      }
      return;
    }

    // PHASE 3: 기존보다 패턴을 더 자주 겹쳐 광폭화 체감을 키운다.
    if (choice < .25){
      addBeam(Math.random()*Math.PI,60,.50);
      addBeam(Math.random()*Math.PI,60,.70);
      addCircle(state.player.x,state.player.y,56,.62);
      state.lastPatternName='2연속 레이저 + 추적 장판';
    } else if (choice < .50){
      addCross(state.player.x,state.player.y,58,.54);
      addCircle(canvas.width/2,canvas.height/2,82,.72);
      addCircle(clamp(state.player.x+rand(-70,70),70,canvas.width-70),clamp(state.player.y+rand(-70,70),70,canvas.height-95),50,.64);
      state.lastPatternName='십자 + 중앙폭발 + 추적';
    } else if (choice < .75){
      addDonut(state.player.x,state.player.y,70,170,.54);
      aimedCircle(.96,.58);
      addBeam(Math.random()*Math.PI,52,.72);
      state.lastPatternName='추적 도넛 + 원형 + 레이저';
    } else {
      ringBurst(6);
      addBeam(Math.random()*Math.PI,56,.58);
      addBeam(Math.random()*Math.PI,48,.78);
      state.lastPatternName='6연속 장판 + 2연속 레이저';
    }
  }

  function showPhaseBanner(text){
    state.lastPatternName = text;
    if (!effectsReduced) burst(canvas.width/2,110,22,state.phase===3?'#ff7f66':'#57e7ff');
  }

  function update(dt){
    if (state.mode !== 'playing') return;

    const beforePhase = state.phase;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, ROUND_SECONDS - state.elapsed);
    state.phase = state.elapsed < 9 ? 1 : state.elapsed < 18 ? 2 : 3;

    if (state.phase !== beforePhase){
      showPhaseBanner(state.phase===3 ? 'PHASE 3 — ENRAGE' : `PHASE ${state.phase}`);
      accumulator = 0;
    }

    state.dashCooldown = Math.max(0,state.dashCooldown-dt);
    state.invuln = Math.max(0,state.invuln-dt);

    if (state.dashFx){
      state.dashFx.age += dt;
      if (state.dashFx.age >= state.dashFx.duration) state.dashFx = null;
    }

    const mv=movementVector();
    state.player.x=clamp(state.player.x+mv.x*PLAYER_SPEED*dt,22,canvas.width-22);
    state.player.y=clamp(state.player.y+mv.y*PLAYER_SPEED*dt,18,canvas.height-72);

    accumulator += dt*1000;
    const currentInterval = ATTACK_INTERVAL_MS * (state.phase===3 ? .62 : state.phase===2 ? .86 : 1.06);
    if(accumulator>=currentInterval){
      accumulator=0;
      spawnPattern();
    }

    for(const h of state.hazards){
      h.t += dt;
      const isActive = h.t >= h.warning && h.t < h.warning+h.active;

      if(isActive && !h.hit && state.invuln<=0 && hitsPlayer(h)){
        h.hit=true;
        state.hp=Math.max(0,state.hp-1);
        state.combo=0;
        state.invuln=DAMAGE_INVULN;
        state.screenShake=effectsReduced?0:10;
        if(!effectsReduced) burst(state.player.x,state.player.y,20,'#ff5369');
        if(state.hp<=0){
          endRound(false);
          return;
        }
      }

      if(h.t>=h.warning+h.active && !h._scored){
        h._scored=true;
        if(!h.hit){
          state.dodges+=1;
          state.combo+=1;
          state.score+=24+Math.min(56,state.combo*3);
        }
      }
    }

    state.hazards=state.hazards.filter(h=>h.t<h.warning+h.active+.28);
    state.particles=state.particles.filter(p=>(p.life-=dt)>0);
    for(const p of state.particles){
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;
      p.vx*=.96;
      p.vy*=.96;
    }
    state.screenShake=Math.max(0,state.screenShake-dt*38);
    state.score += dt*10;

    if(state.timeLeft<=0){
      state.timeLeft=0;
      endRound(true);
      return;
    }
    syncUi();
  }

  function hitsPlayer(h){
    const px=state.player.x,py=state.player.y;

    if(h.type==='circle'){
      return Math.hypot(px-h.x,py-h.y) <= h.r+PLAYER_RADIUS*.65;
    }

    if(h.type==='donut'){
      const d=Math.hypot(px-h.x,py-h.y);
      return d>=h.inner-PLAYER_RADIUS*.65 && d<=h.outer+PLAYER_RADIUS*.65;
    }

    if(h.type==='beam'){
      const cx=canvas.width/2,cy=canvas.height/2;
      const dx=px-cx,dy=py-cy;
      const perpendicular=Math.abs(-Math.sin(h.angle)*dx+Math.cos(h.angle)*dy);
      return perpendicular <= h.width/2+PLAYER_RADIUS*.55;
    }

    if(h.type==='cross'){
      return Math.abs(px-h.x)<=h.width/2+PLAYER_RADIUS*.55 ||
             Math.abs(py-h.y)<=h.width/2+PLAYER_RADIUS*.55;
    }
    return false;
  }

  function burst(x,y,count,color){
    if(effectsReduced) return;
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2;
      const s=rand(55,190);
      state.particles.push({
        x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
        life:rand(.22,.55),max:.55,color
      });
    }
  }

  function render(){
    const shake = effectsReduced?0:state.screenShake;
    const sx=shake?rand(-shake,shake):0;
    const sy=shake?rand(-shake,shake):0;

    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.translate(sx,sy);
    drawArena();
    for(const h of state.hazards) drawHazard(h);
    drawBoss();
    drawDashFx();
    drawPlayer();
    drawParticles();
    drawClearFx();
    ctx.restore();
  }

  function drawArena(){
    const g=ctx.createRadialGradient(canvas.width/2,180,50,canvas.width/2,240,560);
    g.addColorStop(0,'#101a28');
    g.addColorStop(1,'#05080d');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle='rgba(87,231,255,.055)';
    ctx.lineWidth=1;
    for(let x=0;x<canvas.width;x+=48){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();
    }
    for(let y=0;y<canvas.height;y+=48){
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();
    }

    ctx.fillStyle='rgba(18,30,45,.8)';
    ctx.fillRect(0,canvas.height-52,canvas.width,52);
    ctx.fillStyle='#7d90a9';
    ctx.font='12px monospace';
    ctx.fillText(`PATTERN: ${state.lastPatternName}`,18,canvas.height-21);
  }

  function drawBoss(){
    const x=canvas.width/2,y=68;
    let alpha=1;
    let scale=1;

    if (state.mode==='success' && state.clearFx && !effectsReduced){
      const t=clamp((performance.now()-state.clearFx.startedAt)/(state.clearFx.duration*1000),0,1);
      alpha=1-t;
      scale=1+t*.9;
    }

    const pulse=effectsReduced?1:1+Math.sin(performance.now()/220)*.05;
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(x,y);
    ctx.scale(pulse*scale,pulse*scale);
    ctx.shadowBlur=28;
    ctx.shadowColor=state.phase===3?'#ff8b55':'#ff5369';
    ctx.fillStyle=state.phase===3?'#8b3529':'#6d2732';
    ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=state.phase===3?'#ff9b69':'#ff6578';
    ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawPlayer(){
    if(!effectsReduced && state.invuln>0 && Math.floor(performance.now()/70)%2===0) return;
    const {x,y}=state.player;
    ctx.save();
    ctx.shadowBlur=20;
    ctx.shadowColor='#57e7ff';
    ctx.fillStyle='#d8fbff';
    ctx.beginPath();ctx.arc(x,y,PLAYER_RADIUS,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#57e7ff';ctx.lineWidth=3;ctx.stroke();
    ctx.restore();
  }

  function drawDashFx(){
    if (effectsReduced || !state.dashFx) return;
    const fx=state.dashFx;
    const p=clamp(fx.age/fx.duration,0,1);
    const fade=1-p;

    ctx.save();
    ctx.lineCap='round';
    ctx.shadowBlur=24;
    ctx.shadowColor='#57e7ff';
    ctx.strokeStyle=`rgba(87,231,255,${.85*fade})`;
    ctx.lineWidth=10*fade+2;
    ctx.beginPath();
    ctx.moveTo(fx.fromX,fx.fromY);
    ctx.lineTo(fx.toX,fx.toY);
    ctx.stroke();

    // 진행 방향을 따라 잔상 5개
    for(let i=0;i<5;i++){
      const q=(i+1)/6;
      const x=fx.fromX+(fx.toX-fx.fromX)*q;
      const y=fx.fromY+(fx.toY-fx.fromY)*q;
      ctx.globalAlpha=fade*(.55-q*.25);
      ctx.fillStyle='#bff8ff';
      ctx.beginPath();
      ctx.arc(x,y,PLAYER_RADIUS*(.95-q*.45),0,Math.PI*2);
      ctx.fill();
    }

    // 도착점 충격파
    ctx.globalAlpha=fade;
    ctx.strokeStyle='#d8fbff';
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.arc(fx.toX,fx.toY,18+p*34,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  function drawClearFx(){
    if (effectsReduced || !state.clearFx) return;
    const t=clamp((performance.now()-state.clearFx.startedAt)/(state.clearFx.duration*1000),0,1);
    if (t>=1){ state.clearFx=null; return; }

    ctx.save();
    ctx.globalAlpha=1-t;
    ctx.strokeStyle='#75eaff';
    ctx.shadowBlur=28;
    ctx.shadowColor='#57e7ff';
    ctx.lineWidth=6*(1-t)+1;

    for(let i=0;i<3;i++){
      const delayed=clamp((t-i*.12)/(1-i*.12),0,1);
      const r=40+delayed*360;
      ctx.globalAlpha=(1-delayed)*.8;
      ctx.beginPath();
      ctx.arc(canvas.width/2,canvas.height/2,r,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHazard(h){
    const warning=h.t<h.warning;
    const active=h.t>=h.warning && h.t<h.warning+h.active;
    const warningProgress=clamp(h.t/h.warning,0,1);
    const alpha=warning ? .15+.22*warningProgress : active ? .66 : .16;

    ctx.save();
    ctx.globalAlpha=1;
    ctx.lineWidth=2;
    ctx.strokeStyle=warning?'rgba(255,101,120,.90)':'rgba(255,169,112,.98)';
    ctx.fillStyle=warning?`rgba(255,83,105,${alpha})`:'rgba(255,67,78,.66)';

    if(h.type==='circle'){
      ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(warning){
        ctx.globalAlpha=.9;
        ctx.beginPath();ctx.arc(h.x,h.y,h.r*warningProgress,0,Math.PI*2);ctx.stroke();
      }
    } else if(h.type==='donut'){
      ctx.beginPath();
      ctx.arc(h.x,h.y,h.outer,0,Math.PI*2);
      ctx.arc(h.x,h.y,h.inner,0,Math.PI*2,true);
      ctx.fill('evenodd');
      ctx.stroke();
    } else if(h.type==='beam'){
      ctx.translate(canvas.width/2,canvas.height/2);
      ctx.rotate(h.angle);
      ctx.fillRect(-canvas.width,-h.width/2,canvas.width*2,h.width);
      ctx.strokeRect(-canvas.width,-h.width/2,canvas.width*2,h.width);
    } else if(h.type==='cross'){
      ctx.fillRect(h.x-h.width/2,18,h.width,canvas.height-90);
      ctx.fillRect(18,h.y-h.width/2,canvas.width-36,h.width);
      ctx.strokeRect(h.x-h.width/2,18,h.width,canvas.height-90);
      ctx.strokeRect(18,h.y-h.width/2,canvas.width-36,h.width);
    }
    ctx.restore();
  }

  function drawParticles(){
    if(effectsReduced) return;
    for(const p of state.particles){
      ctx.globalAlpha=Math.max(0,p.life/p.max);
      ctx.fillStyle=p.color;
      ctx.fillRect(p.x-2,p.y-2,4,4);
    }
    ctx.globalAlpha=1;
  }

  function syncUi(){
    UI.timeText.textContent=state.timeLeft.toFixed(1);
    UI.phaseText.textContent=`PHASE ${state.phase}`;
    UI.bossBar.style.width=`${Math.max(0,(state.timeLeft/ROUND_SECONDS)*100)}%`;
    UI.hearts.textContent=('♥ '.repeat(state.hp)+'♡ '.repeat(5-state.hp)).trim();
    UI.scoreText.textContent=Math.floor(state.score).toLocaleString();
    UI.comboText.textContent=`x${state.combo}`;
    UI.dashText.textContent=state.dashCooldown<=0?'READY':`${state.dashCooldown.toFixed(1)}s`;
    UI.stateText.textContent=state.mode.toUpperCase();
    UI.winsText.textContent=records.wins;
    UI.bestScoreText.textContent=records.bestScore.toLocaleString();
    UI.bestTimeText.textContent=records.bestTime.toFixed(1);
  }

  function frame(ts){
    try{
      const dt=Math.min(.033,(ts-lastTs)/1000||0);
      lastTs=ts;
      update(dt);
      render();
      rafId=requestAnimationFrame(frame);
    }catch(error){
      debug.errors.push(String(error));
      console.error(error);
      cancelAnimationFrame(rafId);
    }
  }

  function keyDirection(code,down){
    if(code==='KeyW'||code==='ArrowUp') input.up=down;
    if(code==='KeyS'||code==='ArrowDown') input.down=down;
    if(code==='KeyA'||code==='ArrowLeft') input.left=down;
    if(code==='KeyD'||code==='ArrowRight') input.right=down;
  }

  window.addEventListener('keydown',(e)=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    keyDirection(e.code,true);
    if(e.repeat) return;
    if(e.code==='Space') coreDashAction();
    else if(e.code==='KeyP') togglePause();
    else if(e.code==='KeyR' && (state.mode==='success'||state.mode==='fail')) restartRound();
  });

  window.addEventListener('keyup',(e)=>keyDirection(e.code,false));
  window.addEventListener('blur',()=>{
    if(state.mode==='playing'){
      pausedByBlur=true;
      togglePause(true);
    }
  });
  window.addEventListener('focus',()=>{
    if(pausedByBlur){
      pausedByBlur=false;
      togglePause(false);
    }
  });
  window.addEventListener('resize',()=>syncUi());

  UI.startBtn.addEventListener('click',startRound);
  UI.restartBtn.addEventListener('click',restartRound);
  UI.effectToggle.addEventListener('click',()=>{
    effectsReduced=!effectsReduced;
    document.body.classList.toggle('reduced-effects',effectsReduced);
    UI.effectToggle.setAttribute('aria-pressed',String(effectsReduced));
    UI.effectToggle.textContent=`파티클/흔들림 줄이기: ${effectsReduced?'ON':'OFF'}`;
    if(effectsReduced){
      state.particles.length=0;
      state.screenShake=0;
      state.dashFx=null;
      state.clearFx=null;
    }
  });

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function rand(min,max){ return min+Math.random()*(max-min); }

  window.__raidZeroDebug={
    getState:()=>JSON.parse(JSON.stringify(state)),
    getRecords:()=>({...records}),
    getCounters:()=>({...debug}),
    start:startRound,
    restart:restartRound,
    pause:()=>togglePause(true),
    resume:()=>togglePause(false),
    dash:coreDashAction,
    corruptSave:(text)=>localStorage.setItem(STORAGE_KEY,text),
    clearSave:()=>localStorage.removeItem(STORAGE_KEY),
    reloadRecords:()=>{records=loadRecords();syncUi();return {...records};},
    config:{ROUND_SECONDS,ATTACK_INTERVAL_MS,STORAGE_KEY,S_MIN_DODGES,S_MIN_SCORE}
  };

  resetRound();
  rafId=requestAnimationFrame(frame);
})();
