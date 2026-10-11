(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ZOOM = 22; // how far the hero target zooms in
  const EMAIL = $('#copyMail').dataset.email;

  // boot screen (skipped after the first visit in a session)
  const boot = $('#boot');
  const bootLines = $$('.bl', boot);
  let seenBoot = false;
  try { seenBoot = sessionStorage.getItem('bt-boot') === '1'; } catch (e) {}

  function endBoot() {
    if (boot.classList.contains('done')) return;
    boot.classList.add('done');
    try { sessionStorage.setItem('bt-boot', '1'); } catch (e) {}
  }

  if (reduceMotion || seenBoot) {
    endBoot();
  } else {
    bootLines.forEach((line, i) => setTimeout(() => line.classList.add('show'), 180 + i * 260));
    setTimeout(endBoot, 180 + bootLines.length * 260 + 380);
    boot.addEventListener('pointerdown', endBoot);
    addEventListener('keydown', endBoot, { once: true });
  }

  // split headings into words for the reveal animation
  $$('[data-split]').forEach(heading => {
    let index = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) return walk(child);
        if (child.nodeType !== Node.TEXT_NODE) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const word = document.createElement('span');
          word.className = 'word';
          const inner = document.createElement('span');
          inner.textContent = part;
          inner.style.setProperty('--i', index++);
          word.appendChild(inner);
          frag.appendChild(word);
        });
        child.replaceWith(frag);
      });
    };
    walk(heading);
  });

  // reveal on scroll, count-up numbers
  function countUp(el) {
    const end = parseFloat(el.dataset.count);
    const decimals = +(el.dataset.dec || 0);
    const suffix = el.dataset.suffix || '';
    if (reduceMotion) { el.textContent = end.toFixed(decimals) + suffix; return; }
    const start = performance.now();
    const duration = 1400;
    (function tick(now) {
      const t = clamp((now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (end * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    el.classList.add('in');
    $$('[data-count]', el).concat(el.matches('[data-count]') ? [el] : []).forEach(countUp);
    revealObserver.unobserve(el);
  }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, [data-split], .doodle').forEach(el => revealObserver.observe(el));

  // scorecard totals come from the chips, so adding a skill updates every count
  let totalPoints = 0;
  $$('.series').forEach(series => {
    const count = $$('.chips li', series).length;
    const out = $('[data-sum]', series);
    if (out) { out.textContent = count; totalPoints += count; }
  });
  if (totalPoints) {
    const stat = $('#statStack');
    $('#grand').textContent = totalPoints;
    stat.dataset.count = totalPoints;
    stat.textContent = totalPoints;
  }

  // chapter rail (one dot per section)
  const sections = $$('main > section');
  const rail = $('.rail');
  sections.forEach(section => {
    const dot = document.createElement('a');
    dot.href = '#' + section.id;
    dot.innerHTML = '<span>' + section.dataset.title + '</span>';
    dot.setAttribute('aria-label', section.dataset.title);
    rail.appendChild(dot);
  });
  const railDots = $$('a', rail);
  const navLinks = $$('#nav a');

  // sliding highlight behind the active nav link
  const navPill = $('#navPill');
  let pillLink = null;
  let pillMovingTimer = 0;
  let navLocked = false; // while a nav click is scrolling, ignore scroll-driven updates
  let navLockTimer = 0;

  function placePill(link, animate = true) {
    if (!link) { navPill.classList.remove('show'); pillLink = null; return; }
    const firstPlacement = !navPill.classList.contains('show');
    const instant = firstPlacement || !animate;
    if (instant) navPill.style.transition = 'none';
    navPill.style.setProperty('--px', link.offsetLeft + 'px');
    navPill.style.width = link.offsetWidth + 'px';
    navPill.classList.add('show');
    if (instant) {
      navPill.offsetWidth; // force reflow so the jump is not animated
      navPill.style.transition = '';
    } else if (link !== pillLink) {
      navPill.classList.add('moving');
      clearTimeout(pillMovingTimer);
      pillMovingTimer = setTimeout(() => navPill.classList.remove('moving'), 260);
    }
    pillLink = link;
  }

  function setActiveNav(link) {
    navLinks.forEach(a => a.classList.toggle('on', a === link));
    placePill(link);
  }

  function unlockNav() {
    clearTimeout(navLockTimer);
    navLocked = false;
    lastActive = -1;
    queueUpdate();
  }

  navLinks.forEach(link => link.addEventListener('click', () => {
    navLocked = true;
    setActiveNav(link);
    clearTimeout(navLockTimer);
    navLockTimer = setTimeout(unlockNav, 1600);
  }));
  addEventListener('scrollend', () => { if (navLocked) unlockNav(); });
  addEventListener('resize', () => placePill(pillLink, false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placePill(pillLink, false));

  // hero zoom and scroll-driven state
  // The zoom animates the SVG viewBox instead of scaling a raster, so the target stays sharp.
  const hero = $('#top');
  const targetSvg = $('#targetSvg');
  const breathe = $('#breathe');
  const heroCopy = $('#heroCopy');
  const reticle = $('#reticle');
  const veil = $('#veil');
  const hint = $('#heroHint');
  const captions = $$('.cap');
  const header = $('.hud');

  let viewW = innerWidth;
  let viewH = innerHeight;
  let unit = 1; // px per SVG unit at zoom 1
  let offset = { x: 0, y: 0 }; // where the target sits before it centres itself
  let heroTop = 0;
  let heroHeight = 1;
  let sectionTops = [];
  let sectionBottoms = [];
  let lastActive = -1;
  let ticking = false;

  // layout values are cached here so the scroll handler never forces a reflow
  function measure() {
    viewW = innerWidth;
    viewH = innerHeight;
    const wide = viewW > 980;
    let size;
    if (wide) {
      size = Math.min(viewH * .8, viewW * .46);
      offset = { x: viewW * .22, y: 0 };
    } else {
      // stacked layout: fit the target in the space below the hero copy
      const copyBottom = heroCopy.offsetTop + heroCopy.offsetHeight;
      size = clamp(viewH - copyBottom - 70, 180, Math.min(viewW * .92, viewH * .6));
      const centerY = Math.min(copyBottom + 30 + size / 2, viewH - size / 2 - 40);
      offset = { x: 0, y: centerY - viewH / 2 };
    }
    unit = size / 200;
    const y = scrollY;
    heroTop = hero.getBoundingClientRect().top + y;
    heroHeight = hero.offsetHeight;
    sectionTops = sections.map(s => s.getBoundingClientRect().top + y);
    sectionBottoms = sections.map((s, i) => sectionTops[i] + s.offsetHeight);
  }

  function queueUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function update() {
    ticking = false;
    const y = scrollY;
    const p = clamp((y - heroTop) / (heroHeight - viewH)); // hero progress, 0 to 1

    if (y < heroTop + heroHeight + 60) {
      const z = clamp((p - .08) / .82);
      const scale = reduceMotion ? 1 : Math.pow(ZOOM, z);
      const settle = 1 - Math.pow(1 - clamp(p / .22), 3);
      const tx = (1 - settle) * offset.x;
      const ty = (1 - settle) * offset.y;
      const vbW = viewW / unit / scale;
      const vbH = viewH / unit / scale;
      const cx = 100 - tx / (unit * scale);
      const cy = 100 - ty / (unit * scale);
      targetSvg.setAttribute('viewBox', `${(cx - vbW / 2).toFixed(3)} ${(cy - vbH / 2).toFixed(3)} ${vbW.toFixed(3)} ${vbH.toFixed(3)}`);
      breathe.classList.toggle('still', p > .02);

      const copyOpacity = 1 - clamp(p / .13);
      heroCopy.style.opacity = copyOpacity;
      heroCopy.style.pointerEvents = copyOpacity < .15 ? 'none' : '';
      heroCopy.style.transform = (viewW > 980 ? 'translateY(-50%) ' : '') + `translate3d(0,${-p * 160}px,0)`;
      hint.style.opacity = 1 - clamp(p / .06);
      reticle.style.opacity = clamp((p - .3) / .18) * (1 - clamp((p - .92) / .06));
      reticle.style.transform = `translate(-50%,-50%) scale(${1.25 - clamp((p - .3) / .5) * .25})`;
      veil.style.opacity = clamp((p - .9) / .08);

      captions.forEach(cap => {
        const from = +cap.dataset.a;
        const to = +cap.dataset.b;
        const mid = (from + to) / 2;
        const half = (to - from) / 2;
        const o = clamp((1 - Math.abs(p - mid) / half) * 2.2);
        cap.style.opacity = o;
        cap.style.transform = `translateY(${(1 - o) * 14}px) scale(${.96 + o * .04})`;
      });
    }

    // header theme follows the section under it
    const probe = y + 44;
    let current = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sectionTops[i] <= probe && sectionBottoms[i] > probe) current = i;
    }
    const dark = sections[current].dataset.theme === 'dark' || (current === 0 && p > .6);
    const theme = dark ? 'dark' : 'light';
    if (header.dataset.theme !== theme) {
      header.dataset.theme = theme;
      rail.classList.toggle('light', !dark);
    }
    header.classList.toggle('solid', current !== 0);

    // active chapter in the rail and the nav
    let active = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sectionTops[i] <= y + viewH * .45) active = i;
    }
    if (active !== lastActive) {
      lastActive = active;
      railDots.forEach((dot, i) => dot.classList.toggle('on', i === active));
      if (!navLocked) {
        setActiveNav(navLinks.find(a => a.getAttribute('href') === '#' + sections[active].id) || null);
      }
    }
  }

  addEventListener('scroll', queueUpdate, { passive: true });
  addEventListener('resize', () => { measure(); queueUpdate(); });
  addEventListener('load', () => { measure(); queueUpdate(); });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { measure(); queueUpdate(); }).observe(document.body);
  }
  measure();
  update();

  // mobile menu
  const menuBtn = $('#menuBtn');
  menuBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  $$('#nav a, .hud-right .btn').forEach(link => link.addEventListener('click', () => {
    document.body.classList.remove('menu-open');
    menuBtn.setAttribute('aria-expanded', false);
  }));

  // shooting range: click anywhere to leave a bullet hole
  const holes = $('#holes');
  const scoreboard = $('#scoreboard');
  const shotCount = $('#shotN');
  const shotAverage = $('#shotAvg');
  let shots = 0;
  let totalScore = 0;
  let soundOn = false;
  let audioCtx;
  let scoreboardTimer = 0;

  function playShot() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const noise = audioCtx.createBuffer(1, audioCtx.sampleRate * .12, audioCtx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const source = audioCtx.createBufferSource();
      source.buffer = noise;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.value = .3;
      source.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      source.start(t);

      const osc = audioCtx.createOscillator();
      const oscGain = audioCtx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + .15);
      oscGain.gain.setValueAtTime(.35, t);
      oscGain.gain.exponentialRampToValueAtTime(.001, t + .18);
      osc.connect(oscGain);
      oscGain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + .2);
    } catch (e) {}
  }

  function fire(x, y, forcedScore) {
    const score = forcedScore || Math.min(10.9, 10.9 - Math.abs(Math.random() + Math.random() - 1) * 2.6);
    const hole = document.createElement('div');
    hole.className = 'hole' + (forcedScore ? ' bull' : '');
    hole.style.left = x + 'px';
    hole.style.top = y + 'px';
    hole.innerHTML = '<span>' + score.toFixed(1) + (forcedScore ? ' · bullseye' : '') + '</span>';
    holes.appendChild(hole);
    setTimeout(() => hole.classList.add('fade'), 3200);
    setTimeout(() => hole.remove(), 4600);

    shots++;
    totalScore += score;
    shotCount.textContent = shots;
    shotAverage.textContent = (totalScore / shots).toFixed(1);
    scoreboard.classList.add('show');
    if (matchMedia('(max-width:700px)').matches) {
      clearTimeout(scoreboardTimer);
      scoreboardTimer = setTimeout(() => scoreboard.classList.remove('show'), 2200);
    }
    playShot();
  }

  addEventListener('pointerdown', e => {
    if (e.button > 0 || !boot.classList.contains('done')) return;
    if (e.target.closest('a,button,.hud,.nav')) return;
    fire(e.clientX, e.clientY);
  });

  // one automatic bullseye when the first section arrives
  let bullseyeFired = false;
  new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting || bullseyeFired) return;
    bullseyeFired = true;
    setTimeout(() => fire(innerWidth / 2, innerHeight / 2, 10.9), 250);
    observer.disconnect();
  }, { threshold: .1 }).observe($('#stance'));

  const soundButtons = [$('#snd'), $('#sndM')];
  soundButtons.forEach(btn => btn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundButtons.forEach(b => {
      b.setAttribute('aria-pressed', soundOn);
      $('b', b).textContent = soundOn ? 'ON' : 'OFF';
    });
    playShot();
  }));

  // the redacted line reveals on tap (touch screens have no hover)
  const redacted = $('.redact');
  if (redacted) redacted.addEventListener('click', () => redacted.classList.toggle('open'));

  // glass highlight and portrait tilt follow the pointer (one throttled handler)
  if (matchMedia('(hover:hover)').matches && !reduceMotion) {
    let lastMove = null;
    let moveFrame = 0;
    document.addEventListener('pointermove', e => {
      lastMove = e;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        const target = lastMove.target;
        if (!target.closest) return;
        const glass = target.closest('.glass');
        if (glass) {
          const r = glass.getBoundingClientRect();
          glass.style.setProperty('--mx', (lastMove.clientX - r.left) + 'px');
          glass.style.setProperty('--my', (lastMove.clientY - r.top) + 'px');
        }
        const tilt = target.closest('.tilt');
        if (tilt) {
          const r = tilt.getBoundingClientRect();
          const px = (lastMove.clientX - r.left) / r.width - .5;
          const py = (lastMove.clientY - r.top) / r.height - .5;
          tilt.style.setProperty('--ry', (px * 9).toFixed(2) + 'deg');
          tilt.style.setProperty('--rx', (-py * 9).toFixed(2) + 'deg');
        }
      });
    }, { passive: true });
    $$('.tilt').forEach(el => el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    }));
  }

  // project card tabs (Preview / API / Architecture)
  $$('.shot-visual').forEach(visual => {
    const tabs = $$('.vtabs button', visual);
    const panes = $$('.vpane', visual);
    const pill = $('.vt-pill', visual);
    let selected = 0;

    function movePill(i, instant) {
      const tab = tabs[i];
      if (instant) pill.style.transition = 'none';
      pill.style.setProperty('--px', tab.offsetLeft + 'px');
      pill.style.width = tab.offsetWidth + 'px';
      if (instant) {
        pill.offsetWidth;
        pill.style.transition = '';
      }
    }

    function select(i) {
      selected = i;
      tabs.forEach((tab, k) => tab.setAttribute('aria-selected', k === i));
      panes.forEach((pane, k) => pane.classList.toggle('on', k === i));
      movePill(i);
    }

    tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i)));
    movePill(0, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(selected, true));
    addEventListener('resize', () => movePill(selected, true));
  });

  // note for anyone who opens DevTools
  try {
    const title = 'font:700 22px/1.4 "Courier New",monospace;color:#ff6a2b';
    const body = 'font:14px/1.7 "Courier New",monospace;color:#ffb23e';
    const dim = 'font:12px/1.7 "Courier New",monospace;color:#8a7a5a';
    console.log('%c> hello, fellow engineer.', title);
    console.log('%cHand-built with plain HTML, CSS and JavaScript. No framework, no build step.', body);
    console.log('%cHiring? I am open to remote, onsite and relocation.\nemail: ' + EMAIL + '   github: github.com/badaltomar', body);
    console.log('%c// tip: click anywhere on the page. It is a shooting range.', dim);
  } catch (e) {}

  // copy email
  const toast = $('#toast');
  $('#copyMail').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
    } catch (e) {
      const field = document.createElement('textarea');
      field.value = EMAIL;
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); } catch (_) {}
      field.remove();
    }
    toast.textContent = 'Email copied. Bullseye.';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  });
})();
