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
