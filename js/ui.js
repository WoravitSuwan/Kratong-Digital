// Glassmorphism HUD: intro, clean view, bottom pill bar, wish bottom-sheet, toasts.

export function initUI(app, actions) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const params = new URLSearchParams(location.search);
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ---- toast
  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---- names in the intro card
  $('introHer').textContent = '@' + app.names.her;
  $('introHim').textContent = '@' + app.names.him;

  // ---- music button state
  const btnMusic = $('btnMusic');
  function setMusicUI(on) {
    btnMusic.classList.toggle('on', on);
    btnMusic.setAttribute('aria-pressed', String(on));
    btnMusic.querySelector('.lbl').textContent = on ? 'เพลง ♪' : 'เพลง';
  }

  // ---- intro
  const intro = $('intro');
  function start() {
    if (app.started) return;
    app.started = true;
    if (app.audio.unlock()) {
      app.audio.startMusic();
      setMusicUI(true);
    }
    intro.classList.add('hide');
    body.classList.add('started');
    setTimeout(() => intro.remove(), 1400);
    actions.welcome();
    if (params.get('clean') === '1') setClean(true, true);
  }
  intro.addEventListener('click', start);
  intro.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      start();
    }
  });
  $('introStart').focus({ preventScroll: true });

  // ---- clean view
  let hinted = false;
  function setClean(on, silent = false) {
    body.classList.toggle('clean', on);
    $('btnClean').setAttribute('aria-pressed', String(on));
    if (on && !hinted && !silent) {
      hinted = true;
      toast('แตะมุมขวาบนเพื่อแสดงปุ่มอีกครั้ง ✨', 2400);
    }
  }
  $('btnClean').addEventListener('click', () => setClean(true));
  $('btnRestore').addEventListener('click', () => setClean(false));

  // ---- bottom bar
  const btnTogether = $('btnTogether');
  btnTogether.addEventListener('click', () => {
    app.audio.unlock();
    const first = actions.together();
    btnTogether.classList.add('on');
    btnTogether.querySelector('.ico').textContent = '💞';
    toast(first ? 'ลอยไปด้วยกันนะ 💞' : 'อีกครั้งนะ ✨💖', 2200);
  });

  btnMusic.addEventListener('click', () => {
    if (!app.audio.unlock()) {
      toast('เบราว์เซอร์นี้ยังไม่รองรับเสียง 🥲');
      return;
    }
    const on = app.audio.toggle();
    setMusicUI(on);
    toast(on ? 'เปิดเพลงแล้ว 🎵' : 'ปิดเพลงแล้ว 🤫', 1500);
  });

  // ---- wish bottom sheet
  const sheet = $('wishSheet');
  const backdrop = $('sheetBackdrop');
  const ta = $('wishText');
  const count = $('wishCount');
  const max = Number(ta.getAttribute('maxlength')) || 80;
  let sheetOpen = false;

  function openWish() {
    app.audio.unlock();
    sheetOpen = true;
    sheet.classList.add('open');
    backdrop.classList.add('show');
    sheet.removeAttribute('aria-hidden');
    sheet.inert = false;
    // focus inside the tap handler so mobile keyboards actually open
    ta.focus({ preventScroll: true });
  }
  function closeWish() {
    sheetOpen = false;
    sheet.classList.remove('open');
    backdrop.classList.remove('show');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    ta.blur();
    window.scrollTo(0, 0);
  }
  function send() {
    const text = (ta.value.trim() || ta.getAttribute('placeholder')).slice(0, max);
    closeWish();
    actions.wish(text);
    ta.value = '';
    updateCount();
    toast('โคมของเธอกำลังลอยไปหาดวงจันทร์ 🏮✨', 2600);
  }
  function updateCount() {
    count.textContent = `${ta.value.length}/${max}`;
  }
  sheet.inert = true;
  $('btnWish').addEventListener('click', openWish);
  $('wishCancel').addEventListener('click', closeWish);
  $('wishSend').addEventListener('click', send);
  backdrop.addEventListener('click', closeWish);
  ta.addEventListener('input', updateCount);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) {
      e.preventDefault();
      send();
    }
  });
  document.querySelectorAll('.chip-wish').forEach((chip) =>
    chip.addEventListener('click', () => {
      ta.value = chip.dataset.wish;
      updateCount();
      ta.focus({ preventScroll: true });
    }),
  );

  // keep the sheet above the on-screen keyboard
  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheet.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    vv.addEventListener('resize', onVV);
    vv.addEventListener('scroll', onVV);
  }

  // ---- keyboard shortcuts (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen) closeWish();
    if (sheetOpen || !app.started || e.metaKey || e.ctrlKey) return;
    if (e.key === 'h' || e.key === 'H') setClean(!body.classList.contains('clean'));
    if (e.key === 'm' || e.key === 'M') btnMusic.click();
    if (e.key === 't' || e.key === 'T') btnTogether.click();
    if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      openWish();
    }
  });

  return { toast, setClean };
}
