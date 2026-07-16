(function(){
  'use strict';
  const root=document.querySelector('[data-fia-root]');
  if(!root||root.dataset.ready==='true') return;
  root.dataset.ready='true';

  const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav=root.querySelector('[data-nav]');
  const progress=root.querySelector('.scroll-progress');
  const toTop=root.querySelector('[data-to-top]');

  function onScroll(){
    const y=window.scrollY||document.documentElement.scrollTop;
    nav&&nav.classList.toggle('is-scrolled',y>12);
    toTop&&toTop.classList.toggle('show',y>520);
    if(progress){
      const doc=document.documentElement;
      const max=Math.max(1,doc.scrollHeight-doc.clientHeight);
      progress.style.width=Math.min(100,(y/max)*100)+'%';
    }
  }
  onScroll();
  window.addEventListener('scroll',onScroll,{passive:true});
  toTop&&toTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:prefersReduced?'auto':'smooth'}));

  // Reveal animations with graceful fallback.
  const reveals=[...root.querySelectorAll('[data-reveal]')];
  if('IntersectionObserver' in window&&!prefersReduced){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('in');observer.unobserve(entry.target)}
    }),{threshold:.12,rootMargin:'0px 0px -35px'});
    reveals.forEach(el=>observer.observe(el));
  }else reveals.forEach(el=>el.classList.add('in'));

  // Persistent invoice counter. Se hacen 15–20 facturas/día (aleatorio); repartidas en 24 h,
  // eso da un incremento cada ~72–96 min. Mismo ritmo con la página abierta o cerrada.
  // El total siempre se guarda y nunca se reinicia.
  const invoiceCounter=root.querySelector('[data-invoice-counter]');
  if(invoiceCounter){
    const baseTotal=1307;                 // punto de partida actual
    const minDaily=15, maxDaily=20;       // facturas por día (aleatorio)
    const dayMs=86400000;
    const storageKey='factura-ia-invoice-counter';
    const countEl=invoiceCounter.querySelector('[data-invoice-count]');
    const todayEl=root.querySelector('[data-invoice-today]');
    const cards=[...root.querySelectorAll('.rt-card')];
    const numFmt=new Intl.NumberFormat('es-MX');
    const phrases=['Hace unos segundos','Justo ahora','Hace 2 seg','Hace 4 seg','Hace 7 seg','Hace 11 seg'];
    let state=null,liveTimer=null,cardTimer=null,hasAnimated=false;

    // Tiempo hasta la próxima factura = 24 h / (15–20 al día), con una variación aleatoria de ±15%.
    function invoiceInterval(){
      const perDay=minDaily+Math.floor(Math.random()*(maxDaily-minDaily+1));
      return (dayMs/perDay)*(0.85+Math.random()*0.3);
    }

    function dayKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
    function save(){try{window.localStorage.setItem(storageKey,JSON.stringify(state))}catch(e){}}
    function setDisplay(v){countEl.textContent=numFmt.format(v)}

    function countUp(to){
      const from=Math.max(0,to-Math.min(to,48));
      const duration=1100,startTime=performance.now();
      (function step(t){
        const p=Math.min(1,(t-startTime)/duration);
        setDisplay(Math.round(from+(to-from)*(1-Math.pow(1-p,3))));
        if(p<1) requestAnimationFrame(step); else setDisplay(to);
      })(startTime);
    }

    // Carga el estado guardado y suma las facturas "hechas" mientras la página estuvo cerrada.
    function load(){
      const now=Date.now();
      if(!state){
        try{const saved=window.localStorage.getItem(storageKey);if(saved)state=JSON.parse(saved);}catch(e){}
      }
      if(!state||typeof state.total!=='number'){state={total:baseTotal,today:0,day:dayKey(now),last:now};}
      if(state.total<baseTotal)state.total=baseTotal;      // nunca por debajo del punto actual
      if(typeof state.today!=='number')state.today=0;
      if(!state.day)state.day=dayKey(now);
      if(typeof state.last!=='number')state.last=now;
      if(state.day!==dayKey(now)){state.day=dayKey(now);state.today=0;} // "hoy" reinicia; el total no
      let elapsed=Math.min(Math.max(0,now-state.last),30*dayMs);
      const perInvoice=dayMs/(minDaily+Math.floor(Math.random()*(maxDaily-minDaily+1)));
      const away=Math.floor(elapsed/perInvoice);
      if(away>0){state.total+=away;state.today+=away;}
      state.last=now;
      save();
    }

    function updateUI(pop){
      if(!hasAnimated&&!prefersReduced){hasAnimated=true;countUp(state.total);}
      else{
        setDisplay(state.total);
        if(pop&&!prefersReduced){countEl.classList.remove('rt-num-pop');void countEl.offsetWidth;countEl.classList.add('rt-num-pop');}
      }
      if(todayEl)todayEl.textContent=numFmt.format(state.today);
    }

    // Resalta al azar una de las tarjetas flotantes con un texto reciente.
    function flashCard(){
      if(prefersReduced||!cards.length)return;
      const card=cards[Math.floor(Math.random()*cards.length)];
      const small=card.querySelector('small');
      if(small)small.textContent=phrases[Math.floor(Math.random()*phrases.length)];
      card.classList.add('rt-hit');
      window.setTimeout(()=>card.classList.remove('rt-hit'),1600);
    }

    // Una factura en vivo: sube el número, lo guarda y anima una tarjeta.
    function makeInvoice(){
      state.total+=1;
      state.today+=1;
      state.last=Date.now();
      save();
      updateUI(true);
      flashCard();
    }

    // Próxima factura al ritmo real (~72–96 min). El total sube y se guarda.
    function scheduleNextInvoice(){
      window.clearTimeout(liveTimer);
      if(document.hidden)return;
      liveTimer=window.setTimeout(()=>{makeInvoice();scheduleNextInvoice();},invoiceInterval());
    }

    // Solo decorativo: una tarjeta se ilumina al azar cada 5–9 s (no cambia el número).
    function scheduleCardFlash(){
      window.clearTimeout(cardTimer);
      if(document.hidden)return;
      cardTimer=window.setTimeout(()=>{flashCard();scheduleCardFlash();},5000+Math.random()*4000);
    }

    function startLive(){scheduleNextInvoice();scheduleCardFlash();}
    function stopLive(){window.clearTimeout(liveTimer);window.clearTimeout(cardTimer);}

    load();
    updateUI(false);
    startLive();
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){stopLive();}
      else{load();updateUI(false);startLive();}
    });
  }

  // Mobile menu.
  const menuBtn=root.querySelector('.menu-toggle');
  const menu=root.querySelector('.mobile-menu');
  function closeMenu(){
    if(!menuBtn||!menu) return;
    menuBtn.setAttribute('aria-expanded','false');
    menuBtn.setAttribute('aria-label','Abrir menú');
    menu.setAttribute('aria-hidden','true');
    menu.classList.remove('open');
  }
  menuBtn&&menuBtn.addEventListener('click',()=>{
    const open=menuBtn.getAttribute('aria-expanded')==='true';
    menuBtn.setAttribute('aria-expanded',String(!open));
    menuBtn.setAttribute('aria-label',open?'Abrir menú':'Cerrar menú');
    menu.setAttribute('aria-hidden',String(open));
    menu.classList.toggle('open',!open);
  });
  menu&&menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  window.addEventListener('resize',()=>{if(window.innerWidth>860)closeMenu()},{passive:true});

  // Accessible tabs with keyboard navigation.
  root.querySelectorAll('[data-tabs]').forEach(group=>{
    const buttons=[...group.querySelectorAll('[role="tab"]')];
    const panels=[...group.querySelectorAll('[role="tabpanel"]')];
    function activate(btn,focus=false){
      const key=btn.dataset.tab;
      buttons.forEach(b=>{const active=b===btn;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});
      panels.forEach(p=>{const active=p.dataset.panel===key;p.hidden=!active;p.classList.toggle('active',active)});
      if(focus)btn.focus();
    }
    buttons.forEach((btn,index)=>{
      btn.tabIndex=index===0?0:-1;
      btn.addEventListener('click',()=>activate(btn));
      btn.addEventListener('keydown',event=>{
        if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
        event.preventDefault();
        let next=index;
        if(event.key==='ArrowRight')next=(index+1)%buttons.length;
        if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;
        if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
        activate(buttons[next],true);
      });
    });
  });

  // FAQ: only one item open at a time.
  root.querySelectorAll('[data-faq]').forEach(faq=>{
    const questions=[...faq.querySelectorAll('.faq-question')];
    questions.forEach(question=>question.addEventListener('click',()=>{
      const wasOpen=question.getAttribute('aria-expanded')==='true';
      questions.forEach(q=>{
        const panel=root.querySelector('#'+q.getAttribute('aria-controls'));
        q.setAttribute('aria-expanded','false');
        panel&&panel.classList.remove('open');
      });
      if(!wasOpen){
        const panel=root.querySelector('#'+question.getAttribute('aria-controls'));
        question.setAttribute('aria-expanded','true');
        panel&&panel.classList.add('open');
      }
    }));
  });

  // Testimonial carousel. Desktop/tablet transforms; small mobile uses native scroll-snap.
  const viewport=root.querySelector('[data-carousel]');
  const track=viewport&&viewport.querySelector('.quotes-track');
  const cards=track?[...track.children]:[];
  const prev=root.querySelector('[data-carousel-prev]');
  const next=root.querySelector('[data-carousel-next]');
  const dotsWrap=root.querySelector('.carousel-dots');
  let slide=0;
  function visibleSlides(){return window.innerWidth<=680?1:window.innerWidth<=1024?2:3}
  function maxSlide(){return Math.max(0,cards.length-visibleSlides())}
  function renderCarousel(){
    if(!track||window.innerWidth<=470){if(track)track.style.transform='';return}
    slide=Math.min(slide,maxSlide());
    const gap=20;
    const cardWidth=(viewport.clientWidth-gap*(visibleSlides()-1))/visibleSlides();
    track.style.transform='translateX('+(-(cardWidth+gap)*slide)+'px)';
    [...dotsWrap.children].forEach((dot,i)=>dot.classList.toggle('active',i===slide));
  }
  if(dotsWrap&&cards.length){
    for(let i=0;i<=maxSlide();i++){
      const dot=document.createElement('button');
      dot.type='button';dot.className='carousel-dot'+(i===0?' active':'');dot.setAttribute('aria-label','Ir al testimonio '+(i+1));
      dot.addEventListener('click',()=>{slide=i;renderCarousel()});dotsWrap.appendChild(dot);
    }
  }
  prev&&prev.addEventListener('click',()=>{slide=slide<=0?maxSlide():slide-1;renderCarousel()});
  next&&next.addEventListener('click',()=>{slide=slide>=maxSlide()?0:slide+1;renderCarousel()});
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
    if(dotsWrap){dotsWrap.innerHTML='';for(let i=0;i<=maxSlide();i++){const dot=document.createElement('button');dot.type='button';dot.className='carousel-dot'+(i===slide?' active':'');dot.setAttribute('aria-label','Ir al testimonio '+(i+1));dot.addEventListener('click',()=>{slide=i;renderCarousel()});dotsWrap.appendChild(dot)}}
    renderCarousel();
  },120)},{passive:true});
  renderCarousel();

  // Modal with focus return and Escape support.
  const modal=root.querySelector('[data-modal]');
  const openers=[...root.querySelectorAll('[data-open-modal]')];
  const closer=root.querySelector('[data-close-modal]');
  let previousFocus=null;
  function openModal(){
    if(!modal)return;previousFocus=document.activeElement;modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';setTimeout(()=>closer&&closer.focus(),40)
  }
  function closeModal(){
    if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.documentElement.style.overflow='';previousFocus&&previousFocus.focus()
  }
  openers.forEach(btn=>btn.addEventListener('click',openModal));
  closer&&closer.addEventListener('click',closeModal);
  modal&&modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal&&modal.classList.contains('open'))closeModal()});

  // Subtle mouse parallax only on capable desktop pointers.
  const phone=root.querySelector('.phone');
  if(phone&&!prefersReduced&&window.matchMedia('(pointer:fine)').matches){
    const stage=root.querySelector('.phone-stage');
    stage&&stage.addEventListener('pointermove',event=>{
      const r=stage.getBoundingClientRect();
      const x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;
      phone.style.transform='rotateY('+(x*7-3)+'deg) rotateX('+(-y*5)+'deg) translateY(-4px)';
    });
    stage&&stage.addEventListener('pointerleave',()=>phone.style.transform='');
  }
})();
