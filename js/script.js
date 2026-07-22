(function(){
  'use strict';

  const root=document.querySelector('[data-fia-root]');

  if(!root||root.dataset.ready==='true') return;

  root.dataset.ready='true';

  const prefersReduced=window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

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

      progress.style.width=
        Math.min(100,(y/max)*100)+'%';
    }
  }

  onScroll();

  window.addEventListener(
    'scroll',
    onScroll,
    {passive:true}
  );

  toTop&&toTop.addEventListener('click',()=>{
    window.scrollTo({
      top:0,
      behavior:prefersReduced?'auto':'smooth'
    });
  });

  // Reveal animations with graceful fallback.
  const reveals=[
    ...root.querySelectorAll('[data-reveal]')
  ];

  if(
    'IntersectionObserver' in window &&
    !prefersReduced
  ){
    const observer=new IntersectionObserver(
      entries=>entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      }),
      {
        threshold:.12,
        rootMargin:'0px 0px -35px'
      }
    );

    reveals.forEach(el=>observer.observe(el));
  }else{
    reveals.forEach(el=>el.classList.add('in'));
  }

  // Contador persistente: "Facturas hoy" se reinicia a medianoche
  // y recibe exactamente 15–20 incrementos por día.
  // El total histórico nunca se reinicia.
  const invoiceCounter=
    root.querySelector('[data-invoice-counter]');

  if(invoiceCounter){
    const baseTotal=1307;
    const minDaily=15;
    const maxDaily=20;
    const stateVersion=2;

    const storageKey=
      'factura-ia-invoice-counter';

    const countEl=
      invoiceCounter.querySelector(
        '[data-invoice-count]'
      );

    const todayEl=
      root.querySelector('[data-invoice-today]');

    const cards=[
      ...root.querySelectorAll('.rt-card')
    ];

    const numFmt=
      new Intl.NumberFormat('es-MX');

    let state=null;
    let liveTimer=null;
    let cardTimer=null;
    let hasAnimated=false;

    function dayKey(ts){
      const d=new Date(ts);

      return (
        d.getFullYear()+
        '-'+
        (d.getMonth()+1)+
        '-'+
        d.getDate()
      );
    }

    function dayStart(ts){
      const d=new Date(ts);

      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      ).getTime();
    }

    function nextDayStart(ts){
      const d=new Date(ts);

      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()+1
      ).getTime();
    }

    // El objetivo es estable para cada fecha,
    // incluso al cerrar o recargar la página.
    function dailyTarget(key){
      let hash=2166136261;

      for(let i=0;i<key.length;i++){
        hash^=key.charCodeAt(i);
        hash=Math.imul(hash,16777619);
      }

      return (
        minDaily+
        (
          (hash>>>0)%
          (maxDaily-minDaily+1)
        )
      );
    }

    function eventsThrough(
      ts,
      start,
      end,
      target
    ){
      const progress=Math.min(
        1,
        Math.max(
          0,
          (ts-start)/(end-start)
        )
      );

      return Math.min(
        target,
        Math.floor(progress*target+0.5)
      );
    }

    // Cuenta eventos en (from, to], respetando
    // los límites de cada día calendario.
    function eventsBetween(from,to){
      if(to<=from) return 0;

      let total=0;
      let start=dayStart(from);

      while(start<to){
        const end=nextDayStart(start);
        const target=dailyTarget(dayKey(start));

        const rangeStart=
          Math.max(from,start);

        const rangeEnd=
          Math.min(to,end);

        total+=
          eventsThrough(
            rangeEnd,
            start,
            end,
            target
          )-
          eventsThrough(
            rangeStart,
            start,
            end,
            target
          );

        start=end;
      }

      return total;
    }

    function save(){
      try{
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(state)
        );
      }catch(e){
        // LocalStorage no disponible.
      }
    }

    function setDisplay(value){
      countEl.textContent=
        numFmt.format(value);
    }

    function countUp(to){
      const from=Math.max(
        0,
        to-Math.min(to,48)
      );

      const duration=1100;
      const startTime=performance.now();

      (function step(time){
        const progress=Math.min(
          1,
          (time-startTime)/duration
        );

        const value=Math.round(
          from+
          (to-from)*
          (
            1-
            Math.pow(1-progress,3)
          )
        );

        setDisplay(value);

        if(progress<1){
          requestAnimationFrame(step);
        }else{
          setDisplay(to);
        }
      })(startTime);
    }

    // La migración conserva el total, pero limpia
    // el contador diario que la versión anterior podía
    // contaminar con facturas de otros días.
    function load(){
      const now=Date.now();

      try{
        const saved=
          window.localStorage.getItem(
            storageKey
          );

        if(saved){
          state=JSON.parse(saved);
        }
      }catch(e){
        state=null;
      }

      const savedTotal=
        state&&Number.isFinite(state.total)
          ?Math.max(baseTotal,state.total)
          :baseTotal;

      if(
        !state ||
        state.version!==stateVersion
      ){
        state={
          version:stateVersion,
          total:savedTotal,
          today:0,
          day:dayKey(now),
          last:now,
          lastEventAt:now
        };

        save();
        return;
      }

      sync(now);
    }

    // Suma al total lo ocurrido desde la última revisión.
    // Si cambió la fecha, "Facturas hoy" solo recibe
    // los eventos pertenecientes al día actual.
    function sync(now){
      const currentDay=dayKey(now);

      const last=
        Number.isFinite(state.last)
          ?Math.min(state.last,now)
          :now;

      const added=
        eventsBetween(last,now);

      state.total=
        Math.max(
          baseTotal,
          Number.isFinite(state.total)
            ?state.total
            :baseTotal
        )+
        added;

      if(added>0){
        state.lastEventAt=
          latestInvoiceAt(now);
      }

      if(
        !Number.isFinite(
          state.lastEventAt
        )
      ){
        state.lastEventAt=now;
      }

      if(state.day===currentDay){
        state.today=
          Math.max(
            0,
            Number.isFinite(state.today)
              ?state.today
              :0
          )+
          added;
      }else{
        state.today=
          eventsBetween(
            dayStart(now),
            now
          );
      }

      state.today=Math.min(
        state.today,
        dailyTarget(currentDay)
      );

      state.day=currentDay;
      state.last=now;

      save();
    }

    function updateUI(pop){
      if(
        !hasAnimated &&
        !prefersReduced
      ){
        hasAnimated=true;
        countUp(state.total);
      }else{
        setDisplay(state.total);

        if(pop&&!prefersReduced){
          countEl.classList.remove(
            'rt-num-pop'
          );

          void countEl.offsetWidth;

          countEl.classList.add(
            'rt-num-pop'
          );
        }
      }

      if(todayEl){
        todayEl.textContent=
          numFmt.format(state.today);
      }
    }

    function relativeTime(timestamp){
      const seconds=Math.max(
        0,
        Math.floor(
          (Date.now()-timestamp)/1000
        )
      );

      if(seconds===0){
        return 'Justo ahora';
      }

      if(seconds<60){
        return 'Hace '+seconds+' seg';
      }

      const minutes=
        Math.floor(seconds/60);

      if(minutes<60){
        return 'Hace '+minutes+' min';
      }

      return (
        'Hace '+
        Math.floor(minutes/60)+
        ' h'
      );
    }

    function updateRelativeTimes(){
      const label=
        relativeTime(state.lastEventAt);

      cards.forEach(card=>{
        const small=
          card.querySelector('small');

        if(small){
          small.textContent=label;
        }
      });
    }

    // Resalta una tarjeta cuando el contador
    // registra una factura nueva.
    function flashCard(){
      if(
        prefersReduced ||
        !cards.length
      ){
        return;
      }

      const card=
        cards[
          Math.floor(
            Math.random()*cards.length
          )
        ];

      card.classList.add('rt-hit');

      window.setTimeout(()=>{
        card.classList.remove('rt-hit');
      },1600);
    }

    function nextInvoiceAt(now){
      let start=dayStart(now);

      for(let tries=0;tries<2;tries++){
        const end=
          nextDayStart(start);

        const target=
          dailyTarget(dayKey(start));

        const completed=
          eventsThrough(
            now,
            start,
            end,
            target
          );

        if(completed<target){
          return (
            start+
            (
              (completed+0.5)/
              target
            )*
            (end-start)
          );
        }

        start=end;
      }

      return nextDayStart(now);
    }

    function latestInvoiceAt(now){
      let start=dayStart(now);

      for(let tries=0;tries<2;tries++){
        const end=
          nextDayStart(start);

        const target=
          dailyTarget(dayKey(start));

        const completed=
          eventsThrough(
            now,
            start,
            end,
            target
          );

        if(completed>0){
          return (
            start+
            (
              (completed-0.5)/
              target
            )*
            (end-start)
          );
        }

        now=start-1;
        start=dayStart(now);
      }

      return Date.now();
    }

    // Despierta en la próxima factura o justo
    // a medianoche para reiniciar "hoy".
    function scheduleNextInvoice(){
      window.clearTimeout(liveTimer);

      if(document.hidden){
        return;
      }

      const now=Date.now();

      const wakeAt=Math.min(
        nextInvoiceAt(now),
        nextDayStart(now)
      );

      liveTimer=window.setTimeout(()=>{
        const previousTotal=
          state.total;

        sync(Date.now());

        const added=
          state.total>previousTotal;

        updateUI(added);
        updateRelativeTimes();

        if(added){
          flashCard();
        }

        scheduleNextInvoice();
      },Math.max(50,wakeAt-now+25));
    }

    // "Hace N seg" avanza con el tiempo real
    // desde la última factura registrada.
    function scheduleRelativeTime(){
      window.clearTimeout(cardTimer);

      if(document.hidden){
        return;
      }

      cardTimer=window.setTimeout(()=>{
        updateRelativeTimes();
        scheduleRelativeTime();
      },1000);
    }

    function startLive(){
      scheduleNextInvoice();
      scheduleRelativeTime();
    }

    function stopLive(){
      window.clearTimeout(liveTimer);
      window.clearTimeout(cardTimer);
    }

    load();
    updateUI(false);
    updateRelativeTimes();
    startLive();

    document.addEventListener(
      'visibilitychange',
      ()=>{
        if(document.hidden){
          stopLive();
        }else{
          load();
          updateUI(false);
          updateRelativeTimes();
          startLive();
        }
      }
    );
  }

  // Mobile menu.
  const menuBtn=
    root.querySelector('.menu-toggle');

  const menu=
    root.querySelector('.mobile-menu');

  function closeMenu(){
    if(!menuBtn||!menu){
      return;
    }

    menuBtn.setAttribute(
      'aria-expanded',
      'false'
    );

    menuBtn.setAttribute(
      'aria-label',
      'Abrir menú'
    );

    menu.setAttribute(
      'aria-hidden',
      'true'
    );

    menu.classList.remove('open');
  }

  menuBtn&&menuBtn.addEventListener(
    'click',
    ()=>{
      const open=
        menuBtn.getAttribute(
          'aria-expanded'
        )==='true';

      menuBtn.setAttribute(
        'aria-expanded',
        String(!open)
      );

      menuBtn.setAttribute(
        'aria-label',
        open
          ?'Abrir menú'
          :'Cerrar menú'
      );

      menu.setAttribute(
        'aria-hidden',
        String(open)
      );

      menu.classList.toggle(
        'open',
        !open
      );
    }
  );

  menu&&menu
    .querySelectorAll('a')
    .forEach(anchor=>{
      anchor.addEventListener(
        'click',
        closeMenu
      );
    });

  window.addEventListener(
    'resize',
    ()=>{
      if(window.innerWidth>860){
        closeMenu();
      }
    },
    {passive:true}
  );

  // Accessible tabs with keyboard navigation.
  root
    .querySelectorAll('[data-tabs]')
    .forEach(group=>{
      const buttons=[
        ...group.querySelectorAll(
          '[role="tab"]'
        )
      ];

      const panels=[
        ...group.querySelectorAll(
          '[role="tabpanel"]'
        )
      ];

      function activate(
        button,
        focus=false
      ){
        const key=button.dataset.tab;

        buttons.forEach(item=>{
          const active=
            item===button;

          item.setAttribute(
            'aria-selected',
            String(active)
          );

          item.tabIndex=
            active?0:-1;
        });

        panels.forEach(panel=>{
          const active=
            panel.dataset.panel===key;

          panel.hidden=!active;

          panel.classList.toggle(
            'active',
            active
          );
        });

        if(focus){
          button.focus();
        }
      }

      buttons.forEach(
        (button,index)=>{
          button.tabIndex=
            index===0?0:-1;

          button.addEventListener(
            'click',
            ()=>activate(button)
          );

          button.addEventListener(
            'keydown',
            event=>{
              if(
                ![
                  'ArrowRight',
                  'ArrowLeft',
                  'Home',
                  'End'
                ].includes(event.key)
              ){
                return;
              }

              event.preventDefault();

              let next=index;

              if(event.key==='ArrowRight'){
                next=
                  (index+1)%
                  buttons.length;
              }

              if(event.key==='ArrowLeft'){
                next=
                  (
                    index-1+
                    buttons.length
                  )%
                  buttons.length;
              }

              if(event.key==='Home'){
                next=0;
              }

              if(event.key==='End'){
                next=
                  buttons.length-1;
              }

              activate(
                buttons[next],
                true
              );
            }
          );
        }
      );
    });

  // Reproductores de conversaciones fiscales
  // con datos anonimizados o de prueba.
  const caseDemoSteps={
    revision:[
      [
        {
          side:'bot',
          text:'⚠️ ¡Atención! El concepto \'Asesoría financiera\' podría llevar retenciones.\n\n¿Qué deseas hacer?\n1️⃣ Aplicar SÓLO Retención ISR ($875.00)\n2️⃣ Aplicar SÓLO Retención IVA ($933.33)\n3️⃣ Aplicar AMBAS Retenciones\n4️⃣ No, continuar sin retenciones',
          time:'9:22 p. m.'
        }
      ],
      [
        {
          side:'user',
          text:'4',
          time:'9:22 p. m.'
        },
        {
          side:'bot',
          text:'✅ Entendido, este concepto no tendrá retenciones.\n\nTe recomendamos consultar esta operación con tu contador.',
          time:'9:22 p. m.'
        }
      ]
    ],

    factura:[
      [
        {
          side:'user',
          text:'Facturar Ingreso',
          time:'12:00'
        },
        {
          side:'bot',
          text:'👋 Bienvenido. Vamos a iniciar el proceso de facturación.\n\n¿Desde qué RFC quieres emitir la factura?\n1️⃣ CACX7605101P8 · XOCHILT CASAS CHAVEZ\n2️⃣ ➕ Agregar nuevo RFC\n\n#️⃣ Volver al menú principal\n*️⃣ Información sobre esta función',
          time:'12:00'
        }
      ],
      [
        {
          side:'user',
          text:'1',
          time:'12:01'
        },
        {
          side:'bot',
          text:'✅ Emisor seleccionado.\n\n👤 ¿A qué RFC receptor quieres facturar?\n1️⃣ EKU9003173C9 · ESCUELA KEMPER URGATE\n2️⃣ ➕ Agregar nuevo receptor',
          time:'12:01'
        }
      ],
      [
        {
          side:'user',
          text:'1',
          time:'12:02'
        },
        {
          side:'bot',
          text:'✅ Datos fiscales del receptor\n\nRFC: EKU9003173C9\nNombre: ESCUELA KEMPER URGATE\nSCNF: No\nValidez de obligaciones: 1\nCódigo postal: 42501\nRetención: 0\n📧 Correo: hola@facturaia.com.mx\n\n¿Son correctos?\n1️⃣ Sí, continuar\n2️⃣ Agregar otro correo\n3️⃣ Gestionar',
          time:'12:02'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Sí, continuar',
          time:'12:03'
        },
        {
          side:'bot',
          text:'✅ Correos confirmados.\n✅ Régimen fiscal validado.\n\n📄 Selecciona el Uso del CFDI:\n1️⃣ G03 · Gastos en general\n2️⃣ G01 · Adquisición de mercancías\n3️⃣ Ver más opciones',
          time:'12:03'
        },
        {
          side:'user',
          text:'1️⃣ G03 · Gastos en general',
          time:'12:03'
        }
      ],
      [
        {
          side:'bot',
          text:'✍️ Describe el producto o servicio que deseas facturar.',
          time:'12:03'
        },
        {
          side:'user',
          text:'Servicio de marketing',
          time:'12:04'
        },
        {
          side:'bot',
          text:'🤖 Analizando coherencia fiscal...\n✅ Actividad validada.\n✅ Código seleccionado: 80141505\n\n1️⃣ E48 · Unidad de servicio\n2️⃣ E51 · Trabajo\n3️⃣ H87 · Pieza',
          time:'12:04'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ E48 · Unidad de servicio',
          time:'12:05'
        },
        {
          side:'bot',
          text:'✅ Concepto agregado.\n\n🧾 Selecciona el método de pago:\n1️⃣ PUE · Pago en una sola exhibición\n2️⃣ PPD · Pago en parcialidades o diferido',
          time:'12:05'
        },
        {
          side:'user',
          text:'2️⃣ PPD',
          time:'12:05'
        }
      ],
      [
        {
          side:'bot',
          text:'✅ Por favor, confirma los datos de tu factura:\n\n🗓️ Fecha: [FECHA_HOY]\n👤 Emisor: CACX7605101P8\n🏢 Receptor: EKU9003173C9\n📍 Código postal: 42501\n📧 Correo: hola@facturaia.com.mx\n📄 Uso CFDI: G03\n📦 Concepto: Servicio de marketing\n💰 Total: $10,150.00\n💳 Método: PPD\n\n1️⃣ Sí, facturar ahora\n2️⃣ No, quiero editar algo',
          time:'12:06'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Sí, facturar ahora',
          time:'12:07'
        },
        {
          side:'bot',
          text:'👍 ¡Entendido! Generando tu factura, por favor espera un momento...',
          time:'12:07'
        },
        {
          side:'bot',
          text:'✅ ¡Factura YTF 20001 timbrada exitosamente!\n⏳ Procesando archivos...\n📧 ¡Correo enviado con éxito!\n\nGracias 🙌 ¿Deseas realizar otra operación? Escribe menú.',
          time:'12:08'
        }
      ]
    ],

    complemento:[
      [
        {
          side:'user',
          text:'Complemento Pago',
          time:'18:40'
        },
        {
          side:'bot',
          text:'Has elegido Complemento de Pago.\n\nPor favor, selecciona una opción:\n1️⃣ Enviar comprobante\n2️⃣ Indicar datos del pago\n#️⃣ Volver al menú principal',
          time:'18:40'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Enviar comprobante',
          time:'18:40'
        },
        {
          side:'bot',
          text:'📎 Adjunta el comprobante bancario en formato PDF para leer los datos del pago.\n\n🧪 Usa un archivo de prueba; no compartas información bancaria real en esta demostración.',
          time:'18:40'
        }
      ],
      [
        {
          side:'user',
          text:'📄 comprobante_transferencia_prueba.pdf\nPDF · 184 KB',
          time:'18:41'
        },
        {
          side:'bot',
          text:'🔍 Recibí el PDF. Estoy leyendo monto, fecha, referencia y participantes del pago…',
          time:'18:41'
        }
      ],
      [
        {
          side:'bot',
          text:'✅ Datos extraídos del PDF\n\n💵 Monto: $10,150.00\n🗓️ Fecha: [FECHA_HOY]\n💳 Forma de pago: 03 · Transferencia\n🔢 Referencia: SPEI-DEMO-0715\n🏫 Ordenante: EKU9003173C9\n👤 Beneficiario: CACX7605101P8\n\n¿Los datos son correctos?\n1️⃣ Sí, buscar factura\n2️⃣ Corregir datos',
          time:'18:41'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Sí, buscar factura',
          time:'18:42'
        },
        {
          side:'bot',
          text:'¡Encontré una factura pendiente! 🎯\n\n📄 Folio de prueba: F-1042\n💰 Total: $10,150.00\n🏫 Receptor: EKU9003173C9\n👤 Emisor: CACX7605101P8\n📊 Saldo pendiente: $10,150.00',
          time:'18:42'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Seleccionar factura',
          time:'18:42'
        },
        {
          side:'bot',
          text:'🔔 Confirmar creación del complemento\n\n📄 Factura: F-1042\n💰 Monto aplicado: $10,150.00\n📊 Nuevo saldo insoluto: $0.00\n📈 Parcialidad: 1\n\n1️⃣ Sí, crear complemento\n2️⃣ No, cancelar',
          time:'18:42'
        }
      ],
      [
        {
          side:'user',
          text:'1️⃣ Sí, crear complemento',
          time:'18:43'
        },
        {
          side:'bot',
          text:'✅ ¡Complemento de prueba timbrado exitosamente!\n⏳ Procesando archivos…\n📧 ¡Correo enviado con éxito!\n\n🧾 Nuevo folio: CP-DEMO-1042\n📈 Parcialidad 1 registrada.\n🔒 El PDF de esta demostración contiene únicamente datos inventados.',
          time:'18:43'
        }
      ]
    ],

    reporte:[
      [
        {
          side:'user',
          text:'Administrador',
          time:'10:15'
        },
        {
          side:'bot',
          text:'⚙️ Menú de Administrador\n\n1️⃣ Descargar Facturas\n2️⃣ Añadir receptor\n3️⃣ 📊 Reporte de Facturas\n4️⃣ Hablar con un Asesor\n#️⃣ Volver al menú principal',
          time:'10:15'
        }
      ],
      [
        {
          side:'user',
          text:'3️⃣ 📊 Reporte de Facturas',
          time:'10:16'
        },
        {
          side:'bot',
          text:'📊 Generando reporte (PDF y Excel), esto puede tomar unos segundos...',
          time:'10:16'
        }
      ],
      [
        {
          side:'bot',
          text:'📧 Enviando copia con el Excel de datos a hola@facturaia.com.mx...',
          time:'10:16'
        },
        {
          side:'bot',
          text:'📎 Reporte_Facturas_[FECHA_HOY].pdf',
          time:'10:17'
        }
      ],
      [
        {
          side:'bot',
          text:'✅ Correo enviado con éxito.\n\nEl PDF fue compartido en este chat y la copia del Excel llegó al correo registrado. 🙌',
          time:'10:17'
        }
      ]
    ]
  };

  /**
   * Devuelve la fecha actual en formato mexicano:
   * DD/MM/AAAA.
   *
   * Ejemplo:
   * 22/07/2026
   */
  function obtenerFechaHoy(){
    return new Intl.DateTimeFormat(
      'es-MX',
      {
        day:'2-digit',
        month:'2-digit',
        year:'numeric'
      }
    ).format(new Date());
  }

  /**
   * Reemplaza los valores dinámicos dentro
   * de los mensajes de demostración.
   */
  function procesarTextoDinamico(texto){
    return texto.replaceAll(
      '[FECHA_HOY]',
      obtenerFechaHoy()
    );
  }

  function renderCaseDemo(demo,step){
    const key=
      demo.dataset.caseChat;

    const steps=
      caseDemoSteps[key];

    const body=
      demo.querySelector(
        '[data-case-chat-body]'
      );

    const progress=
      demo.querySelector(
        '[data-case-progress]'
      );

    const previous=
      demo.querySelector(
        '[data-case-prev]'
      );

    const nextButton=
      demo.querySelector(
        '[data-case-next]'
      );

    const nextLabel=
      demo.querySelector(
        '[data-case-next-label]'
      );

    if(
      !steps ||
      !body ||
      !progress ||
      !previous ||
      !nextButton ||
      !nextLabel
    ){
      return;
    }

    demo.dataset.caseStep=
      String(step);

    body.replaceChildren();

    const encryption=
      document.createElement('div');

    encryption.className=
      'case-chat-encryption';

    encryption.textContent=
      '🔒 Conversación protegida y anonimizada';

    body.appendChild(encryption);

    steps
      .slice(0,step+1)
      .flat()
      .forEach(message=>{
        const bubble=
          document.createElement(
            'article'
          );

        bubble.className=
          'case-message case-message-'+
          message.side;

        bubble.setAttribute(
          'aria-label',
          message.side==='user'
            ?'Mensaje del usuario'
            :'Mensaje de Rosario'
        );

        const text=
          document.createElement('p');

        text.textContent=
          procesarTextoDinamico(
            message.text
          );

        const time=
          document.createElement('time');

        time.textContent=
          message.time+
          (
            message.side==='user'
              ?'  ✓✓'
              :''
          );

        bubble.append(text,time);
        body.appendChild(bubble);
      });

    progress.textContent=
      'Paso '+
      (step+1)+
      ' de '+
      steps.length;

    previous.disabled=
      step===0;

    nextLabel.textContent=
      step===steps.length-1
        ?'Reiniciar'
        :'Siguiente';

    window.requestAnimationFrame(()=>{
      body.scrollTop=
        body.scrollHeight;
    });
  }

  root
    .querySelectorAll(
      '[data-case-chat]'
    )
    .forEach(demo=>{
      const steps=
        caseDemoSteps[
          demo.dataset.caseChat
        ];

      if(!steps){
        return;
      }

      const previous=
        demo.querySelector(
          '[data-case-prev]'
        );

      const nextButton=
        demo.querySelector(
          '[data-case-next]'
        );

      let step=0;

      previous&&previous.addEventListener(
        'click',
        ()=>{
          step=Math.max(0,step-1);
          renderCaseDemo(demo,step);
        }
      );

      nextButton&&nextButton.addEventListener(
        'click',
        ()=>{
          step=
            step===steps.length-1
              ?0
              :step+1;

          renderCaseDemo(demo,step);
        }
      );

      renderCaseDemo(demo,step);
    });

  // FAQ: only one item open at a time.
  root
    .querySelectorAll('[data-faq]')
    .forEach(faq=>{
      const questions=[
        ...faq.querySelectorAll(
          '.faq-question'
        )
      ];

      questions.forEach(question=>{
        question.addEventListener(
          'click',
          ()=>{
            const wasOpen=
              question.getAttribute(
                'aria-expanded'
              )==='true';

            questions.forEach(item=>{
              const panel=
                root.querySelector(
                  '#'+
                  item.getAttribute(
                    'aria-controls'
                  )
                );

              item.setAttribute(
                'aria-expanded',
                'false'
              );

              panel&&panel.classList.remove(
                'open'
              );
            });

            if(!wasOpen){
              const panel=
                root.querySelector(
                  '#'+
                  question.getAttribute(
                    'aria-controls'
                  )
                );

              question.setAttribute(
                'aria-expanded',
                'true'
              );

              panel&&panel.classList.add(
                'open'
              );
            }
          }
        );
      });
    });

  // Testimonial carousel.
  // Desktop/tablet transforms;
  // small mobile uses native scroll-snap.
  const viewport=
    root.querySelector('[data-carousel]');

  const track=
    viewport&&
    viewport.querySelector(
      '.quotes-track'
    );

  const cards=
    track?[...track.children]:[];

  const prev=
    root.querySelector(
      '[data-carousel-prev]'
    );

  const next=
    root.querySelector(
      '[data-carousel-next]'
    );

  const dotsWrap=
    root.querySelector(
      '.carousel-dots'
    );

  let slide=0;

  function visibleSlides(){
    return window.innerWidth<=680
      ?1
      :window.innerWidth<=1024
        ?2
        :3;
  }

  function maxSlide(){
    return Math.max(
      0,
      cards.length-visibleSlides()
    );
  }

  function renderCarousel(){
    if(
      !track ||
      window.innerWidth<=470
    ){
      if(track){
        track.style.transform='';
      }

      return;
    }

    slide=Math.min(
      slide,
      maxSlide()
    );

    const gap=20;

    const cardWidth=
      (
        viewport.clientWidth-
        gap*(visibleSlides()-1)
      )/
      visibleSlides();

    track.style.transform=
      'translateX('+
      (
        -(cardWidth+gap)*slide
      )+
      'px)';

    if(dotsWrap){
      [...dotsWrap.children]
        .forEach((dot,index)=>{
          dot.classList.toggle(
            'active',
            index===slide
          );
        });
    }
  }

  function createCarouselDots(){
    if(
      !dotsWrap ||
      !cards.length
    ){
      return;
    }

    dotsWrap.innerHTML='';

    for(
      let index=0;
      index<=maxSlide();
      index++
    ){
      const dot=
        document.createElement(
          'button'
        );

      dot.type='button';

      dot.className=
        'carousel-dot'+
        (
          index===slide
            ?' active'
            :''
        );

      dot.setAttribute(
        'aria-label',
        'Ir al testimonio '+
        (index+1)
      );

      dot.addEventListener(
        'click',
        ()=>{
          slide=index;
          renderCarousel();
        }
      );

      dotsWrap.appendChild(dot);
    }
  }

  createCarouselDots();

  prev&&prev.addEventListener(
    'click',
    ()=>{
      slide=
        slide<=0
          ?maxSlide()
          :slide-1;

      renderCarousel();
    }
  );

  next&&next.addEventListener(
    'click',
    ()=>{
      slide=
        slide>=maxSlide()
          ?0
          :slide+1;

      renderCarousel();
    }
  );

  let resizeTimer;

  window.addEventListener(
    'resize',
    ()=>{
      clearTimeout(resizeTimer);

      resizeTimer=setTimeout(()=>{
        slide=Math.min(
          slide,
          maxSlide()
        );

        createCarouselDots();
        renderCarousel();
      },120);
    },
    {passive:true}
  );

  renderCarousel();

  // Modal with focus return and Escape support.
  const modal=
    root.querySelector('[data-modal]');

  const openers=[
    ...root.querySelectorAll(
      '[data-open-modal]'
    )
  ];

  const closer=
    root.querySelector(
      '[data-close-modal]'
    );

  let previousFocus=null;

  function openModal(){
    if(!modal){
      return;
    }

    previousFocus=
      document.activeElement;

    modal.classList.add('open');

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.documentElement.style.overflow=
      'hidden';

    setTimeout(()=>{
      closer&&closer.focus();
    },40);
  }

  function closeModal(){
    if(!modal){
      return;
    }

    modal.classList.remove('open');

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.documentElement.style.overflow=
      '';

    previousFocus&&previousFocus.focus();
  }

  openers.forEach(button=>{
    button.addEventListener(
      'click',
      openModal
    );
  });

  closer&&closer.addEventListener(
    'click',
    closeModal
  );

  modal&&modal.addEventListener(
    'click',
    event=>{
      if(event.target===modal){
        closeModal();
      }
    }
  );

  document.addEventListener(
    'keydown',
    event=>{
      if(
        event.key==='Escape' &&
        modal &&
        modal.classList.contains('open')
      ){
        closeModal();
      }
    }
  );

  // Demostración interactiva del menú
  // de Factura IA dentro de WhatsApp.
  const phoneDemo=
    root.querySelector(
      '[data-phone-demo]'
    );

  if(phoneDemo){
    const phoneMenu=
      phoneDemo.querySelector(
        '[data-phone-menu]'
      );

    const phoneBackdrop=
      phoneDemo.querySelector(
        '[data-phone-menu-backdrop]'
      );

    const phoneMenuOpen=
      phoneDemo.querySelector(
        '[data-phone-menu-open]'
      );

    const phoneMenuClose=
      phoneDemo.querySelector(
        '[data-phone-menu-close]'
      );

    const phoneResult=
      phoneDemo.querySelector(
        '[data-phone-result]'
      );

    const phoneChat=
      phoneDemo.querySelector(
        '[data-phone-conversation]'
      );

    const phoneActions=[
      ...phoneDemo.querySelectorAll(
        '[data-phone-action]'
      )
    ];

    const phoneResponses={
      ingreso:{
        label:'Facturar Ingreso',
        title:'👋 Bienvenido. Vamos a iniciar el proceso de facturación.',
        body:'Primero selecciona el RFC emisor para preparar tu factura.',
        lines:[
          '¿Desde qué RFC quieres emitir la factura?',
          '1️⃣  XAXX010101000 · EMPRESA DEMO',
          '2️⃣  ➕ Agregar nuevo RFC',
          '#️⃣  Volver al menú principal'
        ]
      },

      complemento:{
        label:'Complemento Pago',
        title:'💳 Vamos a registrar un complemento de pago.',
        body:'Puedes enviar el comprobante o indicar los datos del pago.',
        lines:[
          '1️⃣  📎 Enviar comprobante',
          '2️⃣  Indicar monto, fecha y forma de pago',
          '#️⃣  Volver al menú principal'
        ]
      },

      credito:{
        label:'Nota de Crédito',
        title:'🧾 Vamos a generar una nota de crédito.',
        body:'Primero localizaremos la factura que deseas relacionar.',
        lines:[
          '1️⃣  🔎 Buscar entre mis facturas',
          '2️⃣  📄 Enviar PDF o XML original',
          '#️⃣  Volver al menú principal'
        ]
      },

      gastos:{
        label:'Facturar Gastos',
        title:'🧾 Registremos una factura de gasto.',
        body:'Comparte el comprobante y Rosario organizará la información fiscal.',
        lines:[
          '1️⃣  📷 Tomar foto del ticket',
          '2️⃣  📎 Adjuntar comprobante',
          '#️⃣  Volver al menú principal'
        ]
      },

      cancelar:{
        label:'Cancelar Documento',
        title:'❌ Te ayudo a cancelar un CFDI.',
        body:'Selecciona cómo deseas localizar el documento.',
        lines:[
          '1️⃣  🔎 Buscar por folio',
          '2️⃣  Buscar por RFC y fecha',
          '#️⃣  Volver al menú principal'
        ]
      },

      administrador:{
        label:'Administrador',
        title:'⚙️ Menú de Administrador.',
        body:'Consulta y administra la información de tu cuenta.',
        lines:[
          '1️⃣  📥 Descargar facturas',
          '2️⃣  ➕ Añadir receptor',
          '3️⃣  📊 Reporte de facturas',
          '#️⃣  Volver al menú principal'
        ]
      }
    };

    let phoneMenuTimer=null;

    function phoneTime(){
      return new Intl.DateTimeFormat(
        'es-MX',
        {
          hour:'2-digit',
          minute:'2-digit',
          hour12:false
        }
      ).format(new Date());
    }

    function openPhoneMenu(){
      if(
        !phoneMenu ||
        !phoneBackdrop
      ){
        return;
      }

      window.clearTimeout(
        phoneMenuTimer
      );

      phoneMenu.hidden=false;
      phoneBackdrop.hidden=false;

      phoneMenu.setAttribute(
        'aria-hidden',
        'false'
      );

      phoneMenuOpen&&
        phoneMenuOpen.setAttribute(
          'aria-expanded',
          'true'
        );

      window.requestAnimationFrame(()=>{
        phoneMenu.classList.add(
          'is-open'
        );

        phoneBackdrop.classList.add(
          'is-open'
        );

        phoneMenuClose&&
          phoneMenuClose.focus({
            preventScroll:true
          });
      });
    }

    function closePhoneMenu(
      restoreFocus=true
    ){
      if(
        !phoneMenu ||
        !phoneBackdrop
      ){
        return;
      }

      phoneMenu.classList.remove(
        'is-open'
      );

      phoneBackdrop.classList.remove(
        'is-open'
      );

      phoneMenu.setAttribute(
        'aria-hidden',
        'true'
      );

      phoneMenuOpen&&
        phoneMenuOpen.setAttribute(
          'aria-expanded',
          'false'
        );

      phoneMenuTimer=
        window.setTimeout(()=>{
          phoneMenu.hidden=true;
          phoneBackdrop.hidden=true;
        },prefersReduced?0:240);

      if(
        restoreFocus &&
        phoneMenuOpen
      ){
        phoneMenuOpen.focus({
          preventScroll:true
        });
      }
    }

    function makePhoneMessage(
      className,
      text,
      time
    ){
      const message=
        document.createElement('div');

      message.className=
        'wa-msg '+className;

      const copy=
        document.createElement('p');

      copy.textContent=text;

      const stamp=
        document.createElement('span');

      stamp.className='wa-time';
      stamp.textContent=time;

      message.append(copy,stamp);

      return message;
    }

    function showPhoneResponse(action){
      const response=
        phoneResponses[action];

      if(
        !response ||
        !phoneResult
      ){
        return;
      }

      closePhoneMenu();

      const delay=
        prefersReduced?0:250;

      window.setTimeout(()=>{
        phoneResult.replaceChildren();

        const now=phoneTime();

        const userMessage=
          makePhoneMessage(
            'wa-msg-user',
            response.label,
            now+' ✓✓'
          );

        const botMessage=
          document.createElement('div');

        botMessage.className=
          'wa-msg wa-msg-bot';

        const title=
          document.createElement('span');

        title.className=
          'wa-response-title';

        title.textContent=
          response.title;

        const body=
          document.createElement('p');

        body.textContent=
          response.body;

        const lines=
          document.createElement('div');

        lines.className=
          'wa-response-lines';

        response.lines.forEach(line=>{
          const item=
            document.createElement('span');

          item.textContent=line;
          lines.appendChild(item);
        });

        const stamp=
          document.createElement('span');

        stamp.className='wa-time';
        stamp.textContent=now;

        botMessage.append(
          title,
          body,
          lines,
          stamp
        );

        phoneResult.append(
          userMessage,
          botMessage
        );

        if(phoneChat){
          phoneChat.scrollTo({
            top:phoneChat.scrollHeight,
            behavior:prefersReduced
              ?'auto'
              :'smooth'
          });
        }

        phoneMenuOpen&&
          phoneMenuOpen.focus({
            preventScroll:true
          });
      },delay);
    }

    phoneMenuOpen&&
      phoneMenuOpen.addEventListener(
        'click',
        openPhoneMenu
      );

    phoneMenuClose&&
      phoneMenuClose.addEventListener(
        'click',
        ()=>closePhoneMenu()
      );

    phoneBackdrop&&
      phoneBackdrop.addEventListener(
        'click',
        ()=>closePhoneMenu()
      );

    phoneActions.forEach(button=>{
      button.addEventListener(
        'click',
        ()=>{
          showPhoneResponse(
            button.dataset.phoneAction
          );
        }
      );
    });

    phoneDemo.addEventListener(
      'keydown',
      event=>{
        if(
          event.key==='Escape' &&
          phoneMenu &&
          !phoneMenu.hidden
        ){
          event.stopPropagation();
          closePhoneMenu();
        }
      }
    );
  }

  // Subtle mouse parallax only
  // on capable desktop pointers.
  const phone=
    root.querySelector(
      '.phone:not([data-phone-demo])'
    );

  if(
    phone &&
    !prefersReduced &&
    window.matchMedia(
      '(pointer:fine)'
    ).matches
  ){
    const stage=
      root.querySelector(
        '.phone-stage'
      );

    stage&&stage.addEventListener(
      'pointermove',
      event=>{
        const rect=
          stage.getBoundingClientRect();

        const x=
          (
            event.clientX-
            rect.left
          )/
          rect.width-
          .5;

        const y=
          (
            event.clientY-
            rect.top
          )/
          rect.height-
          .5;

        phone.style.transform=
          'rotateY('+
          (x*7-3)+
          'deg) rotateX('+
          (-y*5)+
          'deg) translateY(-4px)';
      }
    );

    stage&&stage.addEventListener(
      'pointerleave',
      ()=>{
        phone.style.transform='';
      }
    );
  }
})();