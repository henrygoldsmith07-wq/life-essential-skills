/* Local educational evidence only. Responses never enter storage. */
'use strict';
(()=>{
  const E=LifeSkills,D=LEARNING_DATA,U=LearnerUI,load=Catalog.create(D);
  const $=id=>document.getElementById(id),esc=U.esc,list=U.list,key='life-essential-skills-evidence-v1';
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  let state=E.emptyState(),blocked=false,current=null,token=0,view='today';
  function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
  try{const saved=localStorage.getItem(key);if(saved)state=E.migrateState(JSON.parse(saved),D,today());}
  catch(e){blocked=true;notice('Stored evidence needs repair and will not be overwritten. Download the original from My setup. '+e.message);}
  function persist(next){state=next;try{if(!blocked)localStorage.setItem(key,JSON.stringify(next));}catch{notice('Browser storage is unavailable. Download a copy to keep this session’s evidence.');}render();}
  const skillName=cid=>D.skills.competencies.find(c=>c.id===cid).title.replace(' · independent','').replace(' · foundation',' · knowledge check').replace(' · adaptation',' · adapting to change');
  const taskButton=(id,label='Try task')=>'<button class="secondary" data-task="'+esc(id)+'">'+esc(label)+'</button>';
  function downloadText(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function download(name,value){downloadText(name,JSON.stringify(value,null,2)+'\n');}
  const assessor=AssessorMode({E,D,U,load,renderMaterials,state:()=>state,save:persist,today,notice,download});
  function teachingMarkdown(text,path){
    const base=new URL('../'+path,location.href);
    const inline=line=>line.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map(part=>{
      const match=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if(match){try{const url=new URL(match[2],base);return ['http:','https:'].includes(url.protocol)?'<a href="'+esc(url.href)+'" rel="noopener noreferrer">'+esc(match[1])+'</a>':esc(match[1]);}catch{return esc(part);}}
      if(part.startsWith('**')&&part.endsWith('**'))return '<strong>'+esc(part.slice(2,-2))+'</strong>';
      if(part.startsWith('`')&&part.endsWith('`'))return '<code>'+esc(part.slice(1,-1))+'</code>';
      return esc(part);
    }).join('');
    const lines=text.split('\n'),out=[];let n=0;
    while(n<lines.length){
      const line=lines[n].trim();if(!line){n++;continue;}
      if(line.startsWith('```')){const code=[];n++;while(n<lines.length&&!lines[n].startsWith('```'))code.push(lines[n++]);out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');n++;continue;}
      const heading=line.match(/^(#{1,6}) (.+)/);if(heading){out.push('<h3>'+inline(heading[2])+'</h3>');n++;continue;}
      if(line.startsWith('|')){const rows=[];while(n<lines.length&&lines[n].trim().startsWith('|'))rows.push(lines[n++].trim().slice(1,-1).split('|').map(s=>s.trim()));out.push('<div class="table-wrap"><table>'+rows.filter(r=>!r.every(c=>/^:?-+:?$/.test(c))).map((r,k)=>'<tr>'+r.map(c=>'<'+(k?'td':'th')+'>'+inline(c)+'</'+(k?'td':'th')+'>').join('')+'</tr>').join('')+'</table></div>');continue;}
      if(/^[-*] |^\d+\. /.test(line)){const ordered=/^\d+\. /.test(line),tag=ordered?'ol':'ul',rows=[];while(n<lines.length&&(ordered?/^\d+\. /:/^[-*] /).test(lines[n].trim()))rows.push('<li>'+inline(lines[n++].trim().replace(/^[-*] |^\d+\. /,''))+'</li>');out.push('<'+tag+'>'+rows.join('')+'</'+tag+'>');continue;}
      const paragraph=[];while(n<lines.length&&lines[n].trim()&&!/^(#|\||[-*] |\d+\. |```)/.test(lines[n].trim()))paragraph.push(lines[n++].trim());
      if(!paragraph.length){n++;continue;}out.push('<p>'+inline(paragraph.join(' '))+'</p>');
    }return out.join('');
  }

  function navigate(next,focus=true){
    view=['today','progress','practice','pathways','settings','assessor'].includes(next)?next:'today';token++;current=null;assessor.cancel();
    $('workspace').replaceChildren();$('workspace').hidden=true;
    for(const id of ['today','progress','practice','pathways','settings','assessor'])$(id).hidden=id!==view;
    document.querySelectorAll('.nav a').forEach(a=>a.setAttribute('aria-current',a.hash==='#'+view?'page':'false'));
    render();if(focus)U.focus(view+'-title');
  }
  function renderToday(rec,p){
    const path=D.index.pathways.find(p=>p.id===state.pathway),upcoming=p.skills.filter(s=>s.next_review&&s.last_demonstrated&&s.next_review>today()).sort((a,b)=>a.next_review.localeCompare(b.next_review));
    $('today-content').innerHTML='<div class="card feature"><span class="pill">'+esc(path.title)+'</span><span class="pill">'+(state.locality==='wales'?'Wales':'UK · nation unspecified')+'</span><h2>'+esc(rec.item?.title||(rec.kind==='complete'?'Choose your next focus':rec.kind==='locality-needed'?'Choose the relevant locality':'A fresh task is needed'))+'</h2>'+(rec.item?'<p class="time">About '+rec.estimated_time_minutes+' minutes</p>':'')+'<h3>Why this step?</h3>'+list(rec.reason.slice(0,2))+(rec.reason.length>2?'<details><summary>More about this recommendation</summary>'+list(rec.reason.slice(2))+'</details>':'')+(rec.item?'<div class="actions">'+taskButton(rec.item.id,rec.kind==='retention'?'Try a fresh review':'Start this task')+'<button class="secondary" data-learn="'+esc(rec.learn_path)+'">Learn the skill</button></div><p class="muted">Afterwards: compare your original response with the rubric, record help, and get a next step. Self-review is not independent verification.</p>':'<p>Choose another goal, a supported locality, or ask an assessor for different materials.</p>')+'</div><div class="grid"><div class="card"><h3>Make it useful to you</h3><p>Try → learn → practise → apply → review → return later.</p><a href="#pathways">Choose a pathway</a></div><div class="card"><h3>Return at the right time</h3><p>'+p.totals.due+' delayed checks due.</p><p>'+esc(upcoming.length?'Next: '+skillName(upcoming[0].competency_id)+' on '+upcoming[0].next_review:'A later fresh check is scheduled after you show a skill.')+'</p><a href="#progress">See your evidence</a></div></div>';
  }
  function renderProgress(p){
    const labels={self_reviewed:'Independent, self-reviewed',assessor_reviewed:'Independent, assessor-reviewed',assisted:'Completed with help',needs_work:'Needing practice',retention_passed:'Delayed checks passed',due:'Delayed checks due'};
    $('progress-content').innerHTML='<div class="metric-grid">'+Object.entries(labels).map(([k,l])=>'<div class="metric"><strong>'+p.totals[k]+'</strong><span>'+esc(l)+'</span></div>').join('')+'</div><p>'+p.totals.knowledge+' knowledge checks met. Written planning and judgement do not prove physical performance.</p><div class="card"><h2>Practical checks</h2>'+D.practical.rubrics.map(r=>{const last=state.observations.filter(o=>o.kind===r.id).at(-1),gate=E.rollup(state,r.gate,D);return '<div class="row"><div><h3>'+esc(r.title)+'</h3><p>'+esc(last?U.statuses[last.outcome]+' · observed '+last.date:'Needs an observed practical check')+'</p><p class="muted">Written answers alone are insufficient. '+gate.practical_missing.length+' practical checks still needed for this domain gate.</p></div><a href="#assessor">Arrange an observed check</a></div>';}).join('')+'</div>'+p.domains.map(d=>'<div class="card"><h2>'+esc(d.title)+'</h2><p>'+d.demonstrated+' independent · '+d.assisted+' with help · '+d.due+' checks due</p><details><summary>Skills and next steps</summary>'+p.skills.filter(s=>s.domain===d.id).map(s=>{
      const c=D.skills.competencies.find(c=>c.id===s.competency_id),item=D.bank.items.find(i=>i.competencies.includes(c.id)&&E.eligible(i,state.locality)&&!E.seen(state,i,D));
      const next=s.status==='unassessed'?'Start with the guide and a skill check.':s.status==='not-yet'?'Practise the missing step, then try fresh materials.':s.status==='assisted'?'Try fresh materials without solving prompts.':s.next_review?'Try a different situation on '+s.next_review+'.':'Your current full performance covers this knowledge check.';
      return '<div class="skill-card"><h3>'+esc(skillName(c.id))+'</h3><p>'+esc(U.statuses[s.status])+(s.evidence_level?' · '+esc(U.levels[s.evidence_level]):'')+'</p><p class="muted">'+esc(s.retention_status==='retained'?'A delayed fresh check was passed.':s.retention_status==='needs-review'?'A delayed check needs more practice.':'Retention has not been checked.')+(s.recent_improvement?' Your latest attempt improved.':'')+'</p>'+(s.error_tags.length?'<p>Work on: '+esc(s.error_tags.map(t=>D.skills.error_tags.find(e=>e.id===t).label).join('; '))+'</p>':'')+'<p>'+esc(next)+'</p><div class="actions"><button class="secondary" data-learn="'+esc(c.learn_path)+'">Learn this skill</button>'+(item?taskButton(item.id,'Try fresh materials'):'<span class="muted">Ask an assessor for fresh materials.</span>')+'</div></div>';
    }).join('')+'</details></div>').join('');
  }
  function renderPractice(){
    const groups=Catalog.discover(state,D,E,today(),{mode:$('practice-filter').value,domain:$('domain-filter').value,search:$('practice-search').value});
    $('practice-content').innerHTML=groups.length?groups.map(g=>'<div class="card"><h2>'+esc(g.title)+'</h2>'+g.items.map(i=>{
      const known=E.seen(state,i,D),missing=i.prerequisites.filter(c=>E.summary(state,c,D).status!=='demonstrated');
      return '<div class="row"><div><h3>'+esc(i.title)+'</h3><p class="meta">'+i.estimated_time_minutes+' minutes · '+(known?'Familiar material · practice with help':i.mode==='knowledge'?'Knowledge check':'Fresh situation')+'</p>'+(missing.length?'<p class="muted">Build supporting skills first, or use this as a diagnostic.</p>':'')+'</div>'+taskButton(i.id,known?'Practise again':'Try task')+'</div>';
    }).join('')+'</div>').join(''):'<p class="empty">No tasks match this view. Choose fresh tasks, another skill area, or browse all.</p>';
  }
  function render(){
    const rec=E.recommend(state,D,today()),p=E.progress(state,D,today());$('locality').value=state.locality;$('goal').value=state.goal_competencies[0]||'';
    renderToday(rec,p);renderProgress(p);renderPractice();assessor.render();
    $('pathways-content').innerHTML='<div class="grid">'+D.index.pathways.map(p=>'<div class="card"><h2>'+esc(p.title)+'</h2><p>'+esc(p.domains.map(d=>D.index.domains.find(x=>x.id===d).title).join(', '))+'</p><p>30 suggested sessions, adjusted to your evidence. Finish with '+esc(D.index.capstones.find(c=>c.id===p.capstone).title)+'.</p><button data-pathway="'+p.id+'" '+(p.id===state.pathway?'disabled':'')+'>'+(p.id===state.pathway?'Your current pathway':'Choose this pathway')+'</button></div>').join('')+'</div>';
  }
  async function showLesson(path){
    const n=++token;current=null;
    try{const chunk=await load.lesson(path);if(n!==token)return;$('workspace').hidden=false;$('workspace').innerHTML='<div class="card"><h2 id="task-title">'+esc(D.index.domains.find(d=>d.path===path).title)+'</h2><p>Use the guide freely for practice. Close it before a fresh independent attempt.</p><div class="lesson">'+teachingMarkdown(chunk.lesson,path)+'</div><button class="secondary" id="close-task">Close the guide</button></div>';$('close-task').onclick=closeTask;U.focus('task-title');}catch(e){notice(e.message);}
  }
  function closeTask(){token++;current=null;$('workspace').replaceChildren();$('workspace').hidden=true;U.focus(view+'-title');}
  function renderMaterials(item){return item.family==='capstone'?item.materials.map(text=>teachingMarkdown(text,D.index.capstones.find(c=>c.id===item.id).path)).join(''):list(item.materials);}
  async function startTask(id){
    const n=++token;current=null;
    try{const item=await load.item(id);if(n!==token||!E.eligible(item,state.locality))return;
      const known=E.seen(state,item,D),missing=item.prerequisites.filter(c=>E.summary(state,c,D).status!=='demonstrated');
      current={item,known,finished:false,attemptId:'a-'+Date.now()+'-'+state.exposures.length,phase:known?'practice':(!state.records.length||missing.length)?'diagnostic':undefined};
      $('workspace').hidden=false;$('workspace').innerHTML='<div class="card"><p class="eyebrow">'+(known?'PRACTISE A FAMILIAR TASK':'TRY A NEW SITUATION')+'</p><h2 id="task-title">'+esc(item.title)+'</h2><p class="time">About '+item.estimated_time_minutes+' minutes</p>'+(missing.length?'<p class="notice">Supporting skills still to check: '+esc(missing.map(skillName).join(', '))+'. This diagnostic will not award those supporting skills.</p>':'')+renderMaterials(item)+'<p class="task-text">'+esc(item.task)+'</p><details><summary>Safety and access</summary>'+list(item.safety_constraints)+'<p>Written performance cannot prove physical competence. Access adjustments do not reduce the outcome.</p></details><details><summary>Relevant guidance</summary>'+item.source_uses.filter(u=>u.role==='general-principle'||(u.jurisdictions||[]).some(j=>E.covers(j,state.locality))).map(u=>{const s=D.sources.find(s=>s.id===u.source_id);return '<p><a href="'+esc(s.url)+'" rel="noopener noreferrer" target="_blank">'+esc(s.title)+'</a></p><p class="muted">'+esc(u.justification||'Check the current source and its locality before using guidance.')+'</p>';}).join('')+'</details><label for="response">Your fictional response</label><textarea id="response" placeholder="Write your reasoning here, or use paper or speech. This answer is never saved."></textarea><label><input type="checkbox" id="paper-attempt"> I completed a response on paper or by speaking.</label><div class="actions"><button id="finish-attempt">Finish attempt & check feedback</button><button class="secondary" id="close-task">Close task</button></div><div id="feedback-area" hidden></div></div>';
      $('finish-attempt').onclick=finishAttempt;$('close-task').onclick=closeTask;U.focus('task-title');
    }catch(e){notice(e.message);}
  }
  async function finishAttempt(){
    if(!current||current.finished)return;
    if(!$('response').value.trim()&&!$('paper-attempt').checked){notice('Complete a response, or confirm you used paper or speech, before opening feedback.');$('response').setAttribute('aria-invalid','true');$('response').setAttribute('aria-errormessage','notice');$('response').focus();return;}
    const attempt=current,n=token,item=attempt.item;$('finish-attempt').disabled=true;
    try{
      const response=await fetch('../assessor/feedback/'+encodeURIComponent(item.id)+'.json');if(!response.ok)throw new Error('Feedback could not load. Please retry.');const answer=await response.json();if(n!==token)return;
      persist(E.recordExposure(state,D,item.id,attempt.attemptId,today()));attempt.finished=true;$('response').readOnly=true;$('response').removeAttribute('aria-invalid');$('paper-attempt').disabled=true;
      $('feedback-area').hidden=false;
      const errorControls=item.competencies.map((cid,n)=>'<h3>'+esc(skillName(cid))+'</h3>'+U.errors(D.skills.competencies.find(c=>c.id===cid).error_tags,D,'error-'+n,cid)).join('');
      $('feedback-area').innerHTML='<div class="materials feedback"><h3 id="feedback-title">Compare with your original answer</h3><p>'+esc(answer.solution)+'</p><p>'+esc(answer.explanation)+'</p></div><p>Judge your answer before feedback. A corrected answer is useful practice; it does not change that attempt. Self-reviewed evidence is not independently verified.</p>'+U.rubric(item.scoring)+'<fieldset><legend>Solving help</legend><label><input type="checkbox" id="help-used"> I used prompts, a checklist, a person or AI to solve the task.</label><label><input type="checkbox" id="solution-before" '+(attempt.known?'checked disabled':'')+'> I knew these materials or answers before this attempt.</label></fieldset>'+U.supports('attempt-access')+errorControls+'<p id="derived-result" role="status" aria-live="polite">Choose a judgement for every criterion to see the result.</p><button id="save-attempt">Save evidence & find next task</button>';
      $('feedback-area').addEventListener('change',previewOutcome);$('save-attempt').onclick=saveAttempt;U.focus('feedback-title');
    }catch(e){if(n===token){$('finish-attempt').disabled=false;notice(e.message+' Serve the repository over HTTP.');}}
  }
  function attemptInput(){
    const box=$('feedback-area'),errorsBy={};current.item.competencies.forEach(cid=>errorsBy[cid]=[...box.querySelectorAll('[data-error]:checked')].filter(c=>c.dataset.errorCid===cid).map(c=>c.dataset.error));
    return {attempt_id:current.attemptId,phase:current.phase,criteria_judgements:U.judgements(box),help_used:$('help-used').checked,solution_seen:current.known||$('solution-before').checked,access_supports:U.chosenSupports(box),errors_by_competency:errorsBy};
  }
  function previewOutcome(){
    if([...$('feedback-area').querySelectorAll('[data-criterion]')].some(c=>!c.value))return;
    try{const input=attemptInput(),rows=current.item.competencies.map(cid=>{const scoring=E.rubric(current.item,cid),judgements=input.criteria_judgements.filter(j=>scoring.some(s=>s.id===j.criterion_id)),outcome=E.deriveOutcome(scoring,judgements,input.help_used,input.solution_seen,input.errors_by_competency[cid]);return skillName(cid)+': '+U.statuses[outcome]+' · self-reviewed';});$('derived-result').textContent=rows.join('. ');}catch(e){notice(e.message);}
  }
  function saveAttempt(){try{persist(E.recordAttempt(state,D,current.item.id,attemptInput(),today()));navigate('today');location.hash='today';notice('Evidence saved as self-reviewed. Your next step reflects what still needs practice.');}catch(e){notice(e.message);}}
  async function importEvidence(input){try{const file=input.files[0];if(!file)return;if(file.size>8000000)throw new Error('Evidence file is too large');const next=E.migrateState(JSON.parse(await file.text()),D,today());closeTask();assessor.cancel();blocked=false;persist(next);notice('Valid educational evidence imported. Review labels are local claims, not authenticated certificates.');}catch(e){notice('Import refused: '+e.message);}finally{input.value='';}}
  $('domain-filter').innerHTML='<option value="all">All skill areas</option>'+D.index.domains.map(d=>'<option value="'+d.id+'">'+esc(d.title)+'</option>').join('');
  $('domain-filter').onchange=renderPractice;$('practice-filter').onchange=renderPractice;$('practice-search').oninput=renderPractice;
  $('goal').innerHTML+='<optgroup label="Skills">'+D.skills.competencies.filter(c=>c.mode==='independent').map(c=>'<option value="'+c.id+'">'+esc(skillName(c.id))+'</option>').join('')+'</optgroup>';
  $('goal').onchange=()=>persist({...state,goal_competencies:$('goal').value?[$('goal').value]:[]});
  $('locality').onchange=()=>{const next={...state,locality:$('locality').value},errors=E.validateState(next,D,today());if(errors.length){$('locality').value=state.locality;notice('Historical evidence uses nation-specific guidance. Download a copy and begin a separate profile to change locality.');}else{closeTask();persist(next);}};
  $('import-state').onchange=()=>importEvidence($('import-state'));$('assessor-import').onchange=()=>importEvidence($('assessor-import'));
  $('export-state').onclick=()=>{if(blocked){try{const original=localStorage.getItem(key);if(original){downloadText('life-skills-original-needs-repair.json',original);return;}}catch{notice('The original storage could not be downloaded.');return;}}download('life-skills-evidence.json',state);};
  $('export-evaluation').onclick=()=>download('life-skills-evaluation.json',{schema_version:2,locality:state.locality,pathway:state.pathway,results:E.evaluate(state,D),note:'Descriptive educational evidence, not a causal effectiveness study.'});
  $('reset-state').onclick=()=>{if(confirm('Clear this browser’s evidence? Download a backup first.')){blocked=false;persist(E.emptyState(state.locality,state.pathway));navigate('today');notice('Evidence cleared from this browser.');}};
  document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.task)startTask(b.dataset.task);if(b.dataset.learn)showLesson(b.dataset.learn);if(b.dataset.pathway){persist({...state,pathway:b.dataset.pathway});notice('Pathway changed. Today now uses your chosen direction.');}});
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));navigate(location.hash.slice(1),false);
})();
