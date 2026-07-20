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

  // Contador persistente: "Facturas hoy" se reinicia a medianoche y recibe
  // exactamente 15–20 incrementos por día. El total histórico nunca se reinicia.
  const invoiceCounter=root.querySelector('[data-invoice-counter]');
  if(invoiceCounter){
    const baseTotal=1307;
    const minDaily=15, maxDaily=20;
    const stateVersion=2;
    const storageKey='factura-ia-invoice-counter';
    const countEl=invoiceCounter.querySelector('[data-invoice-count]');
    const todayEl=root.querySelector('[data-invoice-today]');
    const cards=[...root.querySelectorAll('.rt-card')];
    const numFmt=new Intl.NumberFormat('es-MX');
    let state=null,liveTimer=null,cardTimer=null,hasAnimated=false;

    function dayKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
    function dayStart(ts){const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();}
    function nextDayStart(ts){const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime();}

    // El objetivo es estable para cada fecha, incluso al cerrar o recargar la página.
    function dailyTarget(key){
      let hash=2166136261;
      for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
      return minDaily+((hash>>>0)%(maxDaily-minDaily+1));
    }

    function eventsThrough(ts,start,end,target){
      const progress=Math.min(1,Math.max(0,(ts-start)/(end-start)));
      return Math.min(target,Math.floor(progress*target+0.5));
    }

    // Cuenta eventos en (from, to], respetando los límites de cada día calendario.
    function eventsBetween(from,to){
      if(to<=from)return 0;
      let total=0,start=dayStart(from);
      while(start<to){
        const end=nextDayStart(start);
        const target=dailyTarget(dayKey(start));
        const rangeStart=Math.max(from,start);
        const rangeEnd=Math.min(to,end);
        total+=eventsThrough(rangeEnd,start,end,target)-eventsThrough(rangeStart,start,end,target);
        start=end;
      }
      return total;
    }

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

    // La migración conserva el total, pero limpia el contador diario que la
    // versión anterior podía contaminar con facturas de otros días.
    function load(){
      const now=Date.now();
      try{const saved=window.localStorage.getItem(storageKey);if(saved)state=JSON.parse(saved);}catch(e){}
      const savedTotal=state&&Number.isFinite(state.total)?Math.max(baseTotal,state.total):baseTotal;
      if(!state||state.version!==stateVersion){
        state={version:stateVersion,total:savedTotal,today:0,day:dayKey(now),last:now,lastEventAt:now};
        save();
        return;
      }
      sync(now);
    }

    // Suma al total lo ocurrido desde la última revisión. Si cambió la fecha,
    // "Facturas hoy" solo recibe los eventos pertenecientes al día actual.
    function sync(now){
      const currentDay=dayKey(now);
      const last=Number.isFinite(state.last)?Math.min(state.last,now):now;
      const added=eventsBetween(last,now);
      state.total=Math.max(baseTotal,Number.isFinite(state.total)?state.total:baseTotal)+added;
      if(added>0)state.lastEventAt=latestInvoiceAt(now);
      if(!Number.isFinite(state.lastEventAt))state.lastEventAt=now;
      if(state.day===currentDay){
        state.today=Math.max(0,Number.isFinite(state.today)?state.today:0)+added;
      }else{
        state.today=eventsBetween(dayStart(now),now);
      }
      state.today=Math.min(state.today,dailyTarget(currentDay));
      state.day=currentDay;
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

    function relativeTime(ts){
      const seconds=Math.max(0,Math.floor((Date.now()-ts)/1000));
      if(seconds===0)return 'Justo ahora';
      if(seconds<60)return 'Hace '+seconds+' seg';
      const minutes=Math.floor(seconds/60);
      if(minutes<60)return 'Hace '+minutes+' min';
      return 'Hace '+Math.floor(minutes/60)+' h';
    }

    function updateRelativeTimes(){
      const label=relativeTime(state.lastEventAt);
      cards.forEach(card=>{const small=card.querySelector('small');if(small)small.textContent=label;});
    }

    // Resalta una tarjeta cuando el contador registra una factura nueva.
    function flashCard(){
      if(prefersReduced||!cards.length)return;
      const card=cards[Math.floor(Math.random()*cards.length)];
      card.classList.add('rt-hit');
      window.setTimeout(()=>card.classList.remove('rt-hit'),1600);
    }

    function nextInvoiceAt(now){
      let start=dayStart(now);
      for(let tries=0;tries<2;tries++){
        const end=nextDayStart(start);
        const target=dailyTarget(dayKey(start));
        const completed=eventsThrough(now,start,end,target);
        if(completed<target)return start+((completed+0.5)/target)*(end-start);
        start=end;
      }
      return nextDayStart(now);
    }

    function latestInvoiceAt(now){
      let start=dayStart(now);
      for(let tries=0;tries<2;tries++){
        const end=nextDayStart(start);
        const target=dailyTarget(dayKey(start));
        const completed=eventsThrough(now,start,end,target);
        if(completed>0)return start+((completed-0.5)/target)*(end-start);
        now=start-1;
        start=dayStart(now);
      }
      return Date.now();
    }

    // Despierta en la próxima factura o justo a medianoche para reiniciar "hoy".
    function scheduleNextInvoice(){
      window.clearTimeout(liveTimer);
      if(document.hidden)return;
      const now=Date.now();
      const wakeAt=Math.min(nextInvoiceAt(now),nextDayStart(now));
      liveTimer=window.setTimeout(()=>{
        const previousTotal=state.total;
        sync(Date.now());
        const added=state.total>previousTotal;
        updateUI(added);
        updateRelativeTimes();
        if(added)flashCard();
        scheduleNextInvoice();
      },Math.max(50,wakeAt-now+25));
    }

    // "Hace N seg" avanza con el tiempo real desde la última factura registrada.
    function scheduleRelativeTime(){
      window.clearTimeout(cardTimer);
      if(document.hidden)return;
      cardTimer=window.setTimeout(()=>{updateRelativeTimes();scheduleRelativeTime();},1000);
    }

    function startLive(){scheduleNextInvoice();scheduleRelativeTime();}
    function stopLive(){window.clearTimeout(liveTimer);window.clearTimeout(cardTimer);}

    load();
    updateUI(false);
    updateRelativeTimes();
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
