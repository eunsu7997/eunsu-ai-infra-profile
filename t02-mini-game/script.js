(() => {
  'use strict';

  const CONFIG = Object.freeze({
    roundMs: 20_000,
    startLoad: 42,
    coolAmount: 9,
    loadPerSecond: 7.0,
    spikeSchedule: [
      { atMs: 4_300, amount: 9 },
      { atMs: 8_600, amount: 11 },
      { atMs: 12_900, amount: 8 },
      { atMs: 16_800, amount: 12 },
    ],
  });

  const STORAGE_KEY = 'serverShield.v1';
  const defaultSaved = Object.freeze({ wins: 0, bestSurvivalMs: 0 });

  const el = {
    status: document.querySelector('#status-text'),
    time: document.querySelector('#time-text'),
    actions: document.querySelector('#action-count'),
    load: document.querySelector('#load-text'),
    loadBar: document.querySelector('#load-bar'),
    meter: document.querySelector('.meter'),
    reactor: document.querySelector('#reactor'),
    event: document.querySelector('#event-text'),
    cool: document.querySelector('#cool-btn'),
    start: document.querySelector('#start-btn'),
    restart: document.querySelector('#restart-btn'),
    pause: document.querySelector('#pause-btn'),
    motion: document.querySelector('#motion-toggle'),
    result: document.querySelector('#result-card'),
    resultKicker: document.querySelector('#result-kicker'),
    resultTitle: document.querySelector('#result-title'),
    resultDesc: document.querySelector('#result-desc'),
    particles: document.querySelector('#particle-layer'),
    wins: document.querySelector('#wins-text'),
    bestTime: document.querySelector('#best-time-text'),
  };

  const state = {
    phase: 'idle',
    load: CONFIG.startLoad,
    remainingMs: CONFIG.roundMs,
    actions: 0,
    startedAt: 0,
    lastFrameAt: 0,
    pausedAt: 0,
    firedSpikes: new Set(),
    rafId: 0,
    reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    saved: loadSaved(),
  };

  function isFiniteNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultSaved };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...defaultSaved };
      const wins = Number.isInteger(parsed.wins) && parsed.wins >= 0 ? parsed.wins : defaultSaved.wins;
      const bestSurvivalMs = isFiniteNonNegativeNumber(parsed.bestSurvivalMs) ? parsed.bestSurvivalMs : defaultSaved.bestSurvivalMs;
      return { wins, bestSurvivalMs };
    } catch {
      return { ...defaultSaved };
    }
  }

  function persistSaved() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
    } catch {
      // 저장이 막혀도 현재 게임은 계속 동작한다.
    }
  }

  function renderSaved() {
    el.wins.textContent = String(state.saved.wins);
    el.bestTime.textContent = (state.saved.bestSurvivalMs / 1000).toFixed(1);
  }

  function clampLoad(value) { return Math.max(0, Math.min(100, value)); }
  function elapsedMs() { return CONFIG.roundMs - state.remainingMs; }

  function render() {
    const rounded = Math.round(state.load);
    el.load.textContent = `${rounded}%`;
    el.loadBar.style.width = `${state.load}%`;
    el.meter.setAttribute('aria-valuenow', String(rounded));
    el.time.textContent = Math.max(0, state.remainingMs / 1000).toFixed(1);
    el.actions.textContent = String(state.actions);

    el.loadBar.classList.toggle('warning', state.load >= 70 && state.load < 88);
    el.loadBar.classList.toggle('danger', state.load >= 88);
    el.reactor.classList.toggle('danger', state.load >= 88);

    const label = {
      idle: '대기', running: '방어 중', paused: '일시정지', success: '성공', failure: '실패',
    }[state.phase];
    el.status.textContent = label;
  }

  function resetRoundState() {
    cancelAnimationFrame(state.rafId);
    state.phase = 'idle';
    state.load = CONFIG.startLoad;
    state.remainingMs = CONFIG.roundMs;
    state.actions = 0;
    state.startedAt = 0;
    state.lastFrameAt = 0;
    state.pausedAt = 0;
    state.firedSpikes = new Set();
    el.result.hidden = true;
    el.cool.disabled = true;
    el.pause.disabled = true;
    el.pause.textContent = '일시정지 (P)';
    el.start.hidden = false;
    el.event.textContent = '시작하면 서버 부하가 계속 올라갑니다.';
    clearEffects();
    render();
  }

  function startGame() {
    cancelAnimationFrame(state.rafId);
    state.phase = 'running';
    state.load = CONFIG.startLoad;
    state.remainingMs = CONFIG.roundMs;
    state.actions = 0;
    state.startedAt = performance.now();
    state.lastFrameAt = state.startedAt;
    state.pausedAt = 0;
    state.firedSpikes = new Set();
    el.result.hidden = true;
    el.cool.disabled = false;
    el.pause.disabled = false;
    el.start.hidden = true;
    el.event.textContent = '냉각 입력으로 CPU 부하를 관리하세요.';
    clearEffects();
    render();
    state.rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (state.phase !== 'running') return;
    const delta = Math.min(100, Math.max(0, now - state.lastFrameAt));
    state.lastFrameAt = now;
    state.remainingMs = Math.max(0, state.remainingMs - delta);
    state.load = clampLoad(state.load + CONFIG.loadPerSecond * (delta / 1000));

    const elapsed = elapsedMs();
    CONFIG.spikeSchedule.forEach((spike, index) => {
      if (elapsed >= spike.atMs && !state.firedSpikes.has(index)) {
        state.firedSpikes.add(index);
        state.load = clampLoad(state.load + spike.amount);
        el.event.textContent = `장애 스파이크 +${spike.amount}% 발생!`;
      }
    });

    render();
    updateBestSurvival();

    if (state.load >= 100) {
      finish(false);
      return;
    }
    if (state.remainingMs <= 0) {
      finish(true);
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function updateBestSurvival() {
    const survived = elapsedMs();
    if (survived > state.saved.bestSurvivalMs) {
      state.saved.bestSurvivalMs = survived;
    }
  }

  function coolOnce() {
    if (state.phase !== 'running') return;
    state.actions += 1;
    state.load = clampLoad(state.load - CONFIG.coolAmount);
    el.event.textContent = `냉각 -${CONFIG.coolAmount}% · 입력 ${state.actions}회`;
    el.reactor.classList.remove('cool-pulse');
    void el.reactor.offsetWidth;
    if (!state.reduceMotion) el.reactor.classList.add('cool-pulse');
    render();
  }

  function togglePause() {
    if (state.phase === 'running') {
      state.phase = 'paused';
      state.pausedAt = performance.now();
      cancelAnimationFrame(state.rafId);
      el.cool.disabled = true;
      el.pause.textContent = '재개 (P)';
      el.event.textContent = '일시정지: 시간과 부하가 멈췄습니다.';
      render();
      return;
    }
    if (state.phase === 'paused') {
      state.phase = 'running';
      state.lastFrameAt = performance.now();
      el.cool.disabled = false;
      el.pause.textContent = '일시정지 (P)';
      el.event.textContent = '재개됨: 중단 지점부터 이어집니다.';
      render();
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function finish(success) {
    cancelAnimationFrame(state.rafId);
    updateBestSurvival();
    state.phase = success ? 'success' : 'failure';
    if (success) state.saved.wins += 1;
    persistSaved();
    renderSaved();

    el.cool.disabled = true;
    el.pause.disabled = true;
    el.pause.textContent = '일시정지 (P)';
    el.result.hidden = false;
    el.resultKicker.textContent = success ? 'ROUND COMPLETE' : 'SYSTEM OVERLOAD';
    el.resultTitle.textContent = success ? '서버 안정화 성공' : '서버 과부하 실패';
    el.resultDesc.textContent = success
      ? `20초 생존 · 냉각 ${state.actions}회 · 최고 기록이 저장되었습니다.`
      : `${(elapsedMs() / 1000).toFixed(1)}초 생존 · 부하가 100%에 도달했습니다.`;
    el.event.textContent = success ? '성공! 다시 시작하면 현재 판은 초기화됩니다.' : '실패! 다시 시작하면 현재 판은 초기화됩니다.';
    spawnResultEffect(success);
    render();
  }

  function spawnResultEffect(success) {
    clearEffects();
    if (state.reduceMotion) return;
    for (let i = 0; i < 24; i += 1) {
      const dot = document.createElement('i');
      dot.className = `particle${success ? '' : ' fail'}`;
      const angle = (Math.PI * 2 * i) / 24;
      const distance = 85 + (i % 5) * 18;
      dot.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      dot.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      dot.style.animationDelay = `${(i % 4) * 18}ms`;
      el.particles.appendChild(dot);
    }
  }

  function clearEffects() {
    el.particles.replaceChildren();
    el.reactor.classList.remove('cool-pulse');
  }

  function toggleMotion() {
    state.reduceMotion = !state.reduceMotion;
    document.body.classList.toggle('reduce-motion', state.reduceMotion);
    el.motion.setAttribute('aria-pressed', String(state.reduceMotion));
    el.motion.textContent = `효과 줄이기: ${state.reduceMotion ? 'ON' : 'OFF'}`;
    if (state.reduceMotion) clearEffects();
  }

  el.start.addEventListener('click', startGame);
  el.restart.addEventListener('click', startGame);
  el.cool.addEventListener('click', coolOnce);
  el.pause.addEventListener('click', togglePause);
  el.motion.addEventListener('click', toggleMotion);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      coolOnce();
      return;
    }
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      startGame();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase === 'running') togglePause();
  });

  document.body.classList.toggle('reduce-motion', state.reduceMotion);
  el.motion.setAttribute('aria-pressed', String(state.reduceMotion));
  el.motion.textContent = `효과 줄이기: ${state.reduceMotion ? 'ON' : 'OFF'}`;
  renderSaved();
  resetRoundState();

  Object.defineProperty(window, '__SERVER_SHIELD_STATE__', {
    get() {
      return Object.freeze({
        phase: state.phase,
        load: state.load,
        remainingMs: state.remainingMs,
        actions: state.actions,
        reduceMotion: state.reduceMotion,
        saved: { ...state.saved },
        config: { ...CONFIG },
      });
    },
  });
})();
