// Dezente Bewegung (Gegenstück: motion.css). Reine Zierde: Fehler hier dürfen die App nie stören,
// und wer „Bewegung reduzieren“ eingestellt hat, sieht davon nichts.
//   Motion.show(key)   nach jedem Neuzeichnen von #app aufrufen (render(), wiz()). key benennt die Ansicht,
//                      z. B. 'a:ov', 'un:plan', 'w:1'. Neuer key: die Kästen zoomen auf. Gleicher key (nur Daten
//                      geändert, z. B. nach dem Speichern einer Note): keine Bewegung. Zieht außerdem die
//                      Umrandung der Tab-Umschalter (.tabs, .seg, .un-tg) auf den aktiven Knopf nach.
//   Motion.glide(el)   dasselbe für einen Umschalter außerhalb von #app (im Dialog), nach dem Umschalten
//   Motion.replay()    die Kästen noch einmal aufzoomen lassen (index.html, wenn das Lade-Logo weicht)
// Ein Element mit data-swap=name und data-key=wert blendet beim Wechsel des Werts kurz neu ein (Wochenplan).
const Motion = (() => {
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)', // wie beim Lade-Logo: zügig los, weich aus
    SWITCH = '.tabs, .seg, .un-tg', // Umschalter: die Knöpfe sitzen direkt darin, der aktive hat .on
    still = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    box = (b) => ({ l: b.offsetLeft, t: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }),
    safe =
      (f) =>
      (...a) => {
        try {
          f(...a);
        } catch (e) {}
      };
  let view, timer, raf;
  const last = new Map(), // Umschalter → { g, i }: welcher Knopf zuletzt aktiv war
    slots = new Map(); // data-swap → zuletzt gezeigter data-key

  // Die Beschriftungen gehen mit: der neue Knopf hellt auf, der bisherige dimmt ab
  function tint(now, was) {
    const on = getComputedStyle(now).color,
      off = getComputedStyle(was).color,
      o = { duration: 260, easing: EASE };
    now.animate([{ color: off }, { color: on }], o);
    was.animate([{ color: on }, { color: off }], o);
  }

  // Umrandung (<i class=glide>) hinter den aktiven Knopf legen; go: von der alten Stelle dorthin gleiten
  function place(g, go) {
    const btns = [...g.children].filter((b) => b.tagName == 'BUTTON'),
      i = btns.findIndex((b) => b.classList.contains('on')),
      key = g.dataset.glide || g.getAttribute('aria-label') || g.classList[0];
    let ind = g.querySelector(':scope > .glide');
    if (i < 0) {
      // nichts gewählt: zurück zur gewöhnlichen Darstellung
      if (ind) ind.remove();
      g.classList.remove('has-glide');
      last.delete(key);
      return;
    }
    if (!ind) {
      ind = document.createElement('i');
      ind.className = 'glide';
      ind.setAttribute('aria-hidden', 'true');
      g.prepend(ind);
    }
    g.classList.add('has-glide'); // vor dem ersten Messen, sonst blendet die Fläche des aktiven Knopfs erst noch aus
    if (!btns[i].offsetWidth) return; // gerade nicht sichtbar, nichts zu messen
    const to = box(btns[i]),
      was = last.get(key);
    ind.style.cssText = `left:${to.l}px;top:${to.t}px;width:${to.w}px;height:${to.h}px`;
    // gleiten nur, wenn derselbe Umschalter schon da war: in #app wird er bei jedem Zeichnen neu gebaut,
    // ein Dialog-Umschalter ist nur dann derselbe, wenn es dasselbe Element ist
    if (go && !still() && was && was.i != i && btns[was.i] && (was.g == g || $('#app').contains(g))) {
      const a = box(btns[was.i]);
      ind.animate(
        a.t == to.t
          ? [
              { transform: `translate(${a.l - to.l}px, ${a.t - to.t}px)`, width: a.w + 'px', height: a.h + 'px' },
              { transform: 'none', width: to.w + 'px', height: to.h + 'px' },
            ]
          : [{ opacity: 0 }, { opacity: 1 }], // brechen die Tabs auf sehr schmalen Handys um: nicht quer durchs Bild, sondern einblenden
        { duration: 260, easing: EASE },
      );
      tint(btns[i], btns[was.i]);
    }
    last.set(key, { g, i });
  }

  // Kästen aufzoomen lassen: motion.css animiert alles unter #app.enter, --i staffelt (höchstens 5 Stufen)
  function enter(app) {
    if (still()) return;
    let n = 0;
    for (const c of app.children) if (!c.matches('.top, .tabs')) c.style.setProperty('--i', Math.min(n++, 5));
    app.classList.add('enter');
    timer = setTimeout(() => app.classList.remove('enter'), 800);
  }

  // Inhalt, der innerhalb einer Ansicht wechselt (Woche im Stundenplan): kurz neu einblenden
  function swap(app, quiet) {
    app.querySelectorAll('[data-swap]').forEach((el) => {
      const n = el.dataset.swap,
        k = el.dataset.key;
      if (!quiet && !still() && slots.has(n) && slots.get(n) != k)
        el.animate([{ opacity: 0, transform: 'scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
      slots.set(n, k);
    });
  }

  function show(key) {
    const app = $('#app'),
      first = view === undefined, // erste Ansicht liegt noch unter dem Lade-Logo: replay() übernimmt
      fresh = key !== view;
    view = key;
    clearTimeout(timer);
    app.classList.remove('enter'); // die neuen Kinder dürfen nur bei einem echten Ansichtswechsel animieren
    // erst alle Umschalter umstellen, dann messen: Das erste Messen berechnet die Stile aller, und ein Umschalter,
    // der danach erst .has-glide bekommt, würde die Fläche seines aktiven Knopfs per CSS-Übergang ausblenden
    const groups = [...app.querySelectorAll(SWITCH)];
    groups.forEach((g) => g.classList.toggle('has-glide', !!g.querySelector(':scope > button.on')));
    groups.forEach((g) => place(g, !first));
    swap(app, first || fresh);
    if (fresh && !first) enter(app);
  }

  function replay() {
    const app = $('#app');
    clearTimeout(timer);
    app.classList.remove('enter');
    void app.offsetWidth; // damit die Animation von vorn beginnt
    enter(app);
  }

  // Bei geändertem Layout (Drehen, Fenstergröße) steht die Umrandung sonst kurz an der falschen Stelle
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(safe(() => document.querySelectorAll(SWITCH).forEach((g) => place(g, false))));
  });

  return { show: safe(show), glide: safe((g) => g && place(g, true)), replay: safe(replay) };
})();
