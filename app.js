(() => {
  const $=id=>document.getElementById(id);
  const initialData=()=>({
    entries:{},
    settings:{defaultCycleLength:28,defaultPeriodLength:5,lutealLength:14},
    createdAt:new Date().toISOString()
  });
  let data=null, editingDate=null, calendarYear=new Date().getFullYear(), lockTimer=null, failedAttempts=0, lockUntil=0;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const localISO=(d=new Date())=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
  const parseDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const diffDays=(a,b)=>Math.floor((parseDate(a)-parseDate(b))/86400000);
  const fmtDate=s=>parseDate(s).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});
  const fmtShort=s=>parseDate(s).toLocaleDateString('es-CO',{day:'numeric',month:'short'});
  const median=arr=>{if(!arr.length)return null;const a=[...arr].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};

  async function persist(){await Security.saveData(data);}

  function showAuth(){ $('appShell').classList.add('hidden');$('authScreen').classList.remove('hidden');$('settingsModal').classList.add('hidden'); }
  function showApp(){ $('authScreen').classList.add('hidden');$('appShell').classList.remove('hidden'); resetInactivity(); renderAll(); }
  function setAuthMode(){
    const setup=!Security.hasSetup(); $('setupBox').classList.toggle('hidden',!setup); $('unlockBox').classList.toggle('hidden',setup); $('recoveryUnlockBox').classList.add('hidden');
    $('authSubtitle').textContent=setup?'Configura un PIN para proteger tus registros.':'Tus datos están cifrados en este dispositivo.';
  }
  function authError(msg=''){$('authError').textContent=msg}

  $('createPinBtn').addEventListener('click',async()=>{
    try{authError();const a=$('setupPin').value,b=$('setupPin2').value;if(a!==b)throw new Error('Los PIN no coinciden.');const key=await Security.setup(a,initialData());data=await Security.loadData();$('recoveryKeyDisplay').textContent=key;$('recoveryModal').classList.remove('hidden');}
    catch(e){authError(e.message)}
  });
  $('copyRecoveryBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('recoveryKeyDisplay').textContent);$('copyRecoveryBtn').textContent='Copiada';}catch{}});
  $('confirmRecoveryBtn').addEventListener('click',()=>{$('recoveryModal').classList.add('hidden');showApp();});
  $('unlockBtn').addEventListener('click',unlockPin);
  $('unlockPin').addEventListener('keydown',e=>{if(e.key==='Enter')unlockPin()});
  async function unlockPin(){
    if(Date.now()<lockUntil){authError('Demasiados intentos. Intenta de nuevo en unos segundos.');return;}
    try{await Security.unlockWithPin($('unlockPin').value);data=await Security.loadData()||initialData();failedAttempts=0;$('unlockPin').value='';authError();showApp();}
    catch(e){failedAttempts++;if(failedAttempts>=5){lockUntil=Date.now()+30000;failedAttempts=0;}authError(e.message)}
  }
  $('showRecoveryBtn').addEventListener('click',()=>{$('unlockBox').classList.add('hidden');$('recoveryUnlockBox').classList.remove('hidden');authError();});
  $('backToPinBtn').addEventListener('click',()=>{$('recoveryUnlockBox').classList.add('hidden');$('unlockBox').classList.remove('hidden');authError();});
  $('recoveryUnlockBtn').addEventListener('click',async()=>{try{await Security.unlockWithRecovery($('recoveryInput').value);data=await Security.loadData();$('recoveryInput').value='';showApp();}catch(e){authError(e.message)}});

  function hardLock(){if(!Security.isUnlocked())return;Security.lock();data=null;showAuth();setAuthMode();}
  function resetInactivity(){clearTimeout(lockTimer);if(Security.isUnlocked())lockTimer=setTimeout(hardLock,5*60*1000);}
  ['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,resetInactivity,{passive:true}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden && Security.isUnlocked()) hardLock();});

  document.querySelectorAll('.bottom-nav button').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page'+btn.dataset.page).classList.add('active');if(btn.dataset.page==='Ciclo')renderCycle();if(btn.dataset.page==='Calendario')renderCalendar();
  }));

  function setSegment(target,val){document.querySelectorAll(`.segmented[data-target="${target}"] button`).forEach(b=>b.classList.toggle('selected',b.dataset.value===val));}
  function getSegment(target){return document.querySelector(`.segmented[data-target="${target}"] button.selected`)?.dataset.value||'';}
  document.querySelectorAll('.segmented button').forEach(b=>b.addEventListener('click',()=>{const p=b.parentElement;p.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');if(p.dataset.target==='sex')syncSexFields();}));
  function syncPeriodFields(){$('periodFields').classList.toggle('disabled-block',!$('hasPeriod').checked)}
  function syncSexFields(){$('contraceptiveWrap').classList.toggle('disabled-block',getSegment('sex')==='ninguno')}
  $('hasPeriod').addEventListener('change',syncPeriodFields);
  $('todayBtn').addEventListener('click',()=>{$('entryDate').value=localISO();});

  function resetForm(date=localISO()){
    editingDate=null;$('entryDate').disabled=false;$('entryDate').value=date;$('hasPeriod').checked=false;setSegment('flow','');setSegment('cramps','');document.querySelectorAll('input[name="products"]').forEach(x=>x.checked=false);setSegment('sex','ninguno');setSegment('contraceptive','');$('notes').value='';syncPeriodFields();syncSexFields();$('saveMessage').textContent='';
  }
  $('entryForm').addEventListener('submit',async e=>{
    e.preventDefault();const date=$('entryDate').value;if(!date)return;
    const hasPeriod=$('hasPeriod').checked,sex=getSegment('sex');
    const entry={date,menstruation:hasPeriod,flow:hasPeriod?getSegment('flow'):'',cramps:hasPeriod?getSegment('cramps'):'',products:hasPeriod?[...document.querySelectorAll('input[name="products"]:checked')].map(x=>x.value):[],sex:sex==='ninguno'?'':sex,contraceptive:sex==='ninguno'?'':getSegment('contraceptive'),notes:$('notes').value.trim(),updatedAt:new Date().toISOString()};
    if(hasPeriod&&!entry.flow){$('saveMessage').textContent='Selecciona el nivel de flujo.';return;}
    data.entries[date]=entry;await persist();$('saveMessage').textContent=editingDate?'Registro actualizado.':'Registro guardado.';const keep=date;resetForm(keep);renderAll();
  });

  function summarizeEntry(e){const parts=[];if(e.menstruation)parts.push(`Menstruación · ${e.flow}${e.cramps?` · cólicos ${e.cramps}`:''}`);if(e.sex)parts.push(`Sexo ${e.sex}`);if(e.notes)parts.push('Nota');return parts.join(' · ')||'Registro sin detalles';}
  function renderRecent(){
    const dates=Object.keys(data.entries).sort().reverse();$('recordCount').textContent=`${dates.length} registro${dates.length===1?'':'s'}`;$('recentEntries').innerHTML='';
    dates.slice(0,8).forEach(date=>{const e=data.entries[date],node=$('entryTemplate').content.cloneNode(true);node.querySelector('.entry-date').textContent=fmtDate(date);node.querySelector('.entry-summary').textContent=summarizeEntry(e);node.querySelector('.edit-entry').addEventListener('click',()=>editEntry(date));node.querySelector('.delete-entry').addEventListener('click',()=>deleteEntry(date));$('recentEntries').appendChild(node)});
    if(!dates.length)$('recentEntries').innerHTML='<p class="muted">Todavía no hay registros.</p>';
  }
  function editEntry(date){const e=data.entries[date];editingDate=date;$('entryDate').value=date;$('entryDate').disabled=true;$('hasPeriod').checked=e.menstruation;setSegment('flow',e.flow);setSegment('cramps',e.cramps);document.querySelectorAll('input[name="products"]').forEach(x=>x.checked=e.products?.includes(x.value));setSegment('sex',e.sex||'ninguno');setSegment('contraceptive',e.contraceptive||'');$('notes').value=e.notes||'';syncPeriodFields();syncSexFields();document.querySelector('[data-page="Registro"]').click();window.scrollTo({top:0,behavior:'smooth'});}
  async function deleteEntry(date){if(!confirm(`¿Eliminar el registro del ${fmtDate(date)}?`))return;delete data.entries[date];await persist();renderAll();}

  function periodStarts(){
    const dates=Object.keys(data.entries).filter(d=>data.entries[d].menstruation).sort();const starts=[];let prev=null;for(const d of dates){if(!prev||diffDays(d,prev)>1)starts.push(d);prev=d;}return starts;
  }
  function periodLengths(){
    const dates=Object.keys(data.entries).filter(d=>data.entries[d].menstruation).sort();if(!dates.length)return[];const lens=[];let len=1;for(let i=1;i<dates.length;i++){if(diffDays(dates[i],dates[i-1])===1)len++;else{lens.push(len);len=1}}lens.push(len);return lens;
  }
  function cycleStats(){
    const starts=periodStarts();const intervals=[];for(let i=1;i<starts.length;i++){const n=diffDays(starts[i],starts[i-1]);if(n>=20&&n<=45)intervals.push(n)}
    const cycleLen=Math.round(median(intervals)||data.settings.defaultCycleLength||28);const periodLen=Math.round(median(periodLengths())||data.settings.defaultPeriodLength||5);const luteal=Math.min(data.settings.lutealLength||14,cycleLen-7);return{starts,cycleLen,periodLen,luteal};
  }
  function phaseForDay(day,stats){
    const ovulation=Math.max(stats.periodLen+2,stats.cycleLen-stats.luteal);const fertileStart=Math.max(stats.periodLen+1,ovulation-5),fertileEnd=Math.min(stats.cycleLen,ovulation+1);
    if(day<=stats.periodLen)return'menstrual';if(day>=fertileStart&&day<=fertileEnd)return'fertile';if(day>fertileEnd)return'luteal';return'follicular';
  }
  function polar(cx,cy,r,a){const rad=(a-90)*Math.PI/180;return{x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)}}
  function arcPath(cx,cy,r1,r2,a0,a1){const p1=polar(cx,cy,r2,a0),p2=polar(cx,cy,r2,a1),p3=polar(cx,cy,r1,a1),p4=polar(cx,cy,r1,a0),large=a1-a0>180?1:0;return`M ${p1.x} ${p1.y} A ${r2} ${r2} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r1} ${r1} 0 ${large} 0 ${p4.x} ${p4.y} Z`;}
  function renderCycle(){
    const svg=$('cycleWheel');svg.innerHTML='';const stats=cycleStats(),starts=stats.starts,today=localISO();
    if(!starts.length){$('cycleSummary').textContent='Registra el primer día de tu menstruación para comenzar las estimaciones.';$('wheelCenter').innerHTML='<strong>—</strong><span>Sin ciclo</span>';$('estimateCards').innerHTML='<div class="mini-card"><span>Primer paso</span><strong>Registra tu menstruación</strong></div>';return;}
    const start=starts[starts.length-1],day=diffDays(today,start)+1,next=localISO(addDays(parseDate(start),stats.cycleLen));const ovDay=stats.cycleLen-stats.luteal,ovDate=localISO(addDays(parseDate(start),ovDay-1));const fStart=localISO(addDays(parseDate(start),Math.max(stats.periodLen,ovDay-6)));const fEnd=localISO(addDays(parseDate(start),Math.min(stats.cycleLen-1,ovDay)));
    $('cycleSummary').textContent=`Ciclo iniciado el ${fmtDate(start)} · promedio ${stats.cycleLen} días`;
    $('wheelCenter').innerHTML=`<strong>${day>0?day:'—'}</strong><span>${day>0?'día del ciclo':'antes del último registro'}</span>`;
    const colors={menstrual:'#ef5d64',fertile:'#66b7f2',luteal:'#79c98b',follicular:'#a98be8'};const n=stats.cycleLen,gap=.7;
    for(let i=1;i<=n;i++){
      const d=localISO(addDays(parseDate(start),i-1));const actual=data.entries[d]?.menstruation;const ph=actual?'menstrual':phaseForDay(i,stats);const a0=(i-1)*360/n+gap/2,a1=i*360/n-gap/2;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',arcPath(180,180,98,148,a0,a1));path.setAttribute('fill',colors[ph]);path.setAttribute('opacity',actual?'1':'.86');svg.appendChild(path);
      if(data.entries[d]?.sex){const mid=(a0+a1)/2,p=polar(180,180,160,mid);const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r','5');c.setAttribute('fill','#e53693');svg.appendChild(c)}
      if(d===today){const mid=(a0+a1)/2,p=polar(180,180,168,mid);const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r','3');c.setAttribute('fill','#2f2530');svg.appendChild(c)}
    }
    $('estimateCards').innerHTML=`
      <div class="mini-card"><span>Próxima menstruación estimada</span><strong>${fmtShort(next)}</strong></div>
      <div class="mini-card"><span>Ovulación estimada</span><strong>${fmtShort(ovDate)}</strong></div>
      <div class="mini-card"><span>Ventana fértil estimada</span><strong>${fmtShort(fStart)} – ${fmtShort(fEnd)}</strong></div>
      <div class="mini-card"><span>Duración menstrual observada</span><strong>${stats.periodLen} días</strong></div>`;
  }

  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  function renderCalendar(){
    $('calendarYear').textContent=calendarYear;const wrap=$('yearCalendar');wrap.innerHTML='';const today=localISO();
    for(let m=0;m<12;m++){
      const card=document.createElement('div');card.className='month-card';card.innerHTML=`<h3>${monthNames[m]}</h3><div class="weekday-row"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="days-grid"></div>`;const grid=card.querySelector('.days-grid');let first=new Date(calendarYear,m,1).getDay();first=(first+6)%7;for(let i=0;i<first;i++)grid.appendChild(document.createElement('span'));const days=new Date(calendarYear,m+1,0).getDate();
      for(let d=1;d<=days;d++){
        const date=localISO(new Date(calendarYear,m,d)),e=data.entries[date];const b=document.createElement('button');b.className='day-cell'+(date===today?' today':'')+(e?' has-data':'');b.innerHTML=`<span>${d}</span><span class="calendar-dots"></span>`;const dots=b.querySelector('.calendar-dots');if(e?.menstruation)dots.innerHTML+='<i style="background:#ef5d64"></i>';if(e?.sex)dots.innerHTML+='<i style="background:#e53693"></i>';if(e?.notes)dots.innerHTML+='<i style="background:#5d5360"></i>';b.title=e?summarizeEntry(e):date;b.addEventListener('click',()=>{resetForm(date);if(e)editEntry(date);else document.querySelector('[data-page="Registro"]').click();});grid.appendChild(b);
      }
      wrap.appendChild(card);
    }
  }
  $('prevYearBtn').addEventListener('click',()=>{calendarYear--;renderCalendar()});$('nextYearBtn').addEventListener('click',()=>{calendarYear++;renderCalendar()});

  $('settingsBtn').addEventListener('click',()=>{loadSettingsInputs();$('settingsModal').classList.remove('hidden')});$('closeSettingsBtn').addEventListener('click',()=>$('settingsModal').classList.add('hidden'));
  function loadSettingsInputs(){$('defaultCycleLength').value=data.settings.defaultCycleLength;$('defaultPeriodLength').value=data.settings.defaultPeriodLength;$('lutealLength').value=data.settings.lutealLength;}
  $('saveSettingsBtn').addEventListener('click',async()=>{data.settings.defaultCycleLength=+ $('defaultCycleLength').value||28;data.settings.defaultPeriodLength=+ $('defaultPeriodLength').value||5;data.settings.lutealLength=+ $('lutealLength').value||14;await persist();renderCycle();alert('Configuración guardada.');});
  $('lockBtn').addEventListener('click',hardLock);

  function csvEscape(v){v=String(v??'');return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
  $('exportCsvBtn').addEventListener('click',()=>{
    const headers=['fecha','menstruacion','flujo','colicos','objetos','sexo','anticonceptivos','notas'];const rows=[headers.join(',')];Object.keys(data.entries).sort().forEach(d=>{const e=data.entries[d];rows.push([d,e.menstruation?'si':'no',e.flow,e.cramps,(e.products||[]).join('|'),e.sex,e.contraceptive,e.notes].map(csvEscape).join(','))});shareOrDownload(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),`mi-ciclo-registros-${localISO()}.csv`,'Exportación CSV');
  });
  $('downloadBackupBtn').addEventListener('click',async()=>{const backup=await Security.exportBackup();shareOrDownload(new Blob([JSON.stringify(backup)],{type:'application/json'}),`mi-ciclo-respaldo-${localISO()}.json`,'Respaldo cifrado');});
  $('restoreBackupInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!confirm('Esto reemplazará los datos locales de esta instalación. ¿Continuar?'))return;try{const obj=JSON.parse(await file.text());await Security.importBackup(obj);alert('Respaldo restaurado. La app se bloqueará; usa el PIN original del respaldo.');data=null;showAuth();setAuthMode();}catch(err){alert(err.message)}finally{e.target.value=''}});
  async function shareOrDownload(blob,filename,title){const file=new File([blob],filename,{type:blob.type});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title});return}catch(e){if(e.name==='AbortError')return}}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  function renderAll(){if(!data)return;renderRecent();renderCycle();renderCalendar();}

  async function boot(){
    $('entryDate').value=localISO();setAuthMode();if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
  }
  resetForm();boot();
})();
