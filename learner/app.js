/* Educational evidence only. No written responses enter persistent storage. */
'use strict';
(() => {
  const E=window.LifeSkills,D=window.LEARNING_DATA, key='life-essential-skills-evidence-v1';
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=values=>'<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
  const safePath=p=>'../'+p;
  let state=E.emptyState(), current=null, finished=false, startingPhase=null, requestToken=0, storageBlocked=false;
  function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
  try {const saved=localStorage.getItem(key);if(saved){const parsed=JSON.parse(saved),errors=E.validateState(parsed,D,today());if(errors.length){storageBlocked=true;notice('Stored evidence needs repair. It will not be overwritten. Download the original from My setup before clearing it. '+errors[0]);}else state=parsed;}}
  catch{storageBlocked=true;notice('Browser storage is unavailable or unreadable. Evidence will work in this session; download a copy to keep it.');}
  function persist(next){state=next;try{if(!storageBlocked)localStorage.setItem(key,JSON.stringify(state));}catch{notice('Could not save in this browser. Download your evidence to keep it.');}render();}
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
  function navigate(view){if(!['today','progress','practice','pathways','settings'].includes(view))view='today';current=null;finished=false;requestToken++;$('workspace').replaceChildren();$('workspace').hidden=true;for(const id of ['today','progress','practice','pathways','settings'])$(id).hidden=id!==view;document.querySelectorAll('.nav a').forEach(a=>a.setAttribute('aria-current',a.hash==='#'+view?'page':'false'));render();}
  function render(){
    const rec=E.recommend(state,D,today()),p=E.progress(state,D,today()),path=D.index.pathways.find(p=>p.id===state.pathway);
    $('locality').value=state.locality;$('goal').value=state.goal_competencies[0]||'';
    const upcoming=p.skills.filter(s=>s.last_demonstrated && s.next_review>today()).sort((a,b)=>a.next_review.localeCompare(b.next_review));
    $('today-content').innerHTML='<div class="card feature"><span class="pill">'+esc(path.title)+'</span><span class="pill">'+esc(state.locality==='wales'?'Wales':'UK · nation unspecified')+'</span><h2>'+esc(rec.item?rec.item.title:rec.kind==='complete'?'Your current eligible goals have evidence':rec.kind==='locality-needed'?'Choose the relevant locality':'Fresh materials needed')+'</h2>'+(rec.item?'<p class="meta">'+esc(rec.competency.title)+' · '+rec.estimated_time_minutes+' minutes · '+esc(rec.item.id)+'</p>':'')+list(rec.reason)+(rec.item?'<div class="actions"><button data-task="'+esc(rec.item.id)+'">'+(rec.kind==='retention'?'Try a fresh review':state.records.length?'Try this task':'Start with a diagnostic')+'</button><button class="secondary" data-learn="'+esc(rec.learn_path)+'">Learn the skill</button></div>':'<p>Choose another focus, or ask an assessor for an unseen task. A familiar answer can be useful practice but cannot prove fresh transfer.</p>')+'</div><div class="grid"><div class="card"><h3>A clear learning journey</h3><p>Try a diagnostic → learn the missing step → practise → solve an unseen situation → check feedback → choose your next task → return later.</p><a href="#pathways">Choose a pathway</a></div><div class="card"><h3>Return when it is useful</h3><p>'+p.totals.due+' skills have a delayed check due.</p><p>'+esc(upcoming.length?'Next check: '+D.skills.competencies.find(c=>c.id===upcoming[0].competency_id).title+' on '+upcoming[0].next_review:'After your first demonstration, a later check will be scheduled.')+'</p><a href="#progress">See your evidence</a></div></div>';
    const labels={demonstrated:'Independent subskill judgements',knowledge:'Knowledge checks met',assisted:'Skills completed with help',needs_work:'Skills needing work',retention_passed:'Delayed checks passed',due:'Delayed checks due'};
    $('progress-content').innerHTML='<div class="metric-grid">'+Object.entries(labels).map(([k,v])=>'<div class="metric"><strong>'+p.totals[k]+'</strong><span>'+v+'</span></div>').join('')+'</div><div class="card"><h2>'+esc(path.title)+'</h2><p>'+p.pathway.demonstrated+' of '+p.pathway.total+' independent or adaptive criterion records currently demonstrated. '+p.pathway.knowledge+' knowledge checks recorded separately.</p><progress value="'+p.pathway.demonstrated+'" max="'+p.pathway.total+'" aria-label="Pathway independent criterion progress"></progress><p class="muted">Self-reviewed evidence is provisional. There is no overall life score; practical skills need observed assessment.</p></div><div class="grid">'+p.domains.map(d=>'<div class="card"><h3>'+esc(d.title)+'</h3><p>'+d.demonstrated+' independent/adaptive · '+d.assisted+' assisted · '+d.needs_work+' needing work · '+d.due+' reviews due</p><details><summary>See subskills and dates</summary>'+p.skills.filter(s=>s.domain===d.id).map(s=>'<div class="row"><div><strong>'+esc(D.skills.competencies.find(c=>c.id===s.competency_id).title)+'</strong><p class="meta">'+esc(s.status)+' · '+esc(s.retention_status)+(s.next_review?' · next check '+s.next_review:'')+'</p></div></div>').join('')+'</details></div>').join('')+'</div>';
    $('pathways-content').innerHTML='<div class="grid">'+D.index.pathways.map(p=>'<div class="card"><h2>'+esc(p.title)+'</h2><p>'+esc(p.domains.map(d=>D.index.domains.find(x=>x.id===d).title).join(', '))+'</p><p class="muted">30 suggested sessions, adapted to your evidence. Capstone: '+esc(D.index.capstones.find(c=>c.id===p.capstone).title)+'.</p><button data-pathway="'+esc(p.id)+'" '+(p.id===state.pathway?'disabled':'')+'>'+(p.id===state.pathway?'Your current pathway':'Choose this pathway')+'</button></div>').join('')+'</div>';
    renderPractice();
  }
  function renderPractice(){
    const filter=$('domain-filter').value||'all';
    const seen=new Set(state.records.map(r=>D.bank.items.find(i=>i.id===r.item_id).exposure_group));
    const rows=D.bank.items.filter(i=>E.eligible(i,state.locality)&&(filter==='all'||i.competencies[0].split('.')[0]===filter));
    $('practice-content').innerHTML='<div class="card"><h2>Scenarios and skill checks</h2><p class="muted">Unmet prerequisites guide learning. You can try a diagnostic without them; this does not award missing prerequisites. Previously seen material is practice only.</p>'+rows.map(i=>'<div class="row"><div><strong>'+esc(i.title)+'</strong><p class="meta">'+esc(i.id)+' · '+i.estimated_time_minutes+' minutes · '+esc(i.mode)+(seen.has(i.exposure_group)?' · seen: guided practice':' · unseen')+'</p></div><button class="secondary" data-task="'+esc(i.id)+'">'+(seen.has(i.exposure_group)?'Practise again':'Try task')+'</button></div>').join('')+'</div><div class="card"><h2>Capstone challenges</h2><p>Apply several skills together. Record only the criteria actually demonstrated; a capstone never awards a whole domain automatically.</p>'+D.index.capstones.filter(c=>E.eligible(c,state.locality)).map(c=>'<p><a href="'+safePath(c.path)+'">'+esc(c.title)+'</a> · '+c.estimated_time_minutes+' minutes</p>').join('')+'<p><a href="../curriculum/reassessment.md">Text-only fresh reassessment cards</a></p></div>';
  }
  function showLesson(path){
    const text=D.lessons[path];if(!text)return;
    $('workspace').hidden=false;$('workspace').innerHTML='<div class="card"><p class="eyebrow">LEARN & PRACTISE</p><h2 id="task-title">'+esc(D.index.domains.find(d=>d.path===path).title)+'</h2><p>Use the guide freely during practice. When ready for an independent attempt, close the guide and try new materials.</p><div class="lesson">'+teachingMarkdown(text,path)+'</div><button id="close-lesson" class="secondary">Close the guide</button></div>';
    $('close-lesson').onclick=()=>{$('workspace').hidden=true;};$('workspace').scrollIntoView({block:'start'});$('task-title').tabIndex=-1;$('task-title').focus();
  }
  function startTask(id){
    const item=D.bank.items.find(i=>i.id===id);if(!item||!E.eligible(item,state.locality))return;
    current=item;finished=false;requestToken++;startingPhase=state.records.length===0?'diagnostic':null;
    const seen=state.records.some(r=>D.bank.items.find(i=>i.id===r.item_id).exposure_group===item.exposure_group);
    const prereqs=item.prerequisites.filter(c=>E.summary(state,c,D).status!=='demonstrated');
    $('workspace').hidden=false;
    $('workspace').innerHTML='<div class="card"><p class="eyebrow">'+(seen?'GUIDED PRACTICE':'YOUR INDEPENDENT ATTEMPT')+'</p><h2 id="task-title">'+esc(item.title)+'</h2><p class="meta">'+esc(item.id)+' · '+item.estimated_time_minutes+' minutes</p>'+(prereqs.length?'<p class="notice">Supporting skills have no independent evidence yet: '+esc(prereqs.join(', '))+'. You may try a diagnostic or return to learning first.</p>':'')+'<div class="materials">'+list(item.materials)+'</div><p>'+esc(item.task)+'</p><details><summary>Safety and access</summary>'+list(item.safety_constraints)+'<p>Access support such as a screen reader, scribe, translation or extra time does not reduce your rating. Solving prompts do.</p></details><details><summary>Relevant source routes</summary>'+item.source_uses.filter(u=>u.role==='general-principle'||(u.jurisdictions||[]).some(j=>E.covers(j,state.locality))).map(u=>{const s=D.sources.find(s=>s.id===u.source_id);return '<p><a target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(s.title)+'</a> · '+esc(s.jurisdictions.join(', '))+'</p><p class="muted">'+esc(u.justification||'Check the current original guidance and its scope.')+'</p>';}).join('')+'</details><label for="response">Your fictional response</label><textarea id="response" placeholder="Write or dictate your reasoning here, or use paper. This response is not saved."></textarea><label><input type="checkbox" id="paper-attempt"> I completed a response on paper or by speaking.</label><div class="actions"><button id="finish-attempt">Finish attempt & check feedback</button><button class="secondary" id="cancel-attempt">Close task</button></div><div id="feedback-area" hidden></div></div>';
    $('finish-attempt').onclick=finishAttempt;$('cancel-attempt').onclick=()=>{current=null;requestToken++;$('workspace').replaceChildren();$('workspace').hidden=true;};$('workspace').scrollIntoView({block:'start'});$('task-title').tabIndex=-1;$('task-title').focus();
  }
  async function finishAttempt(){
    if(!current||finished)return;
    if(!$('response').value.trim()&&!$('paper-attempt').checked){notice('Complete a fictional response, or confirm you used paper or speech, before opening feedback.');return;}
    const token=++requestToken,item=current;
    $('finish-attempt').disabled=true;
    try{
      const response=await fetch('../assessor/feedback/'+encodeURIComponent(item.id)+'.json');if(!response.ok)throw new Error('Feedback unavailable');const answer=await response.json();
      if(token!==requestToken)return;
      finished=true;$('response').readOnly=true;$('paper-attempt').disabled=true;
      $('feedback-area').hidden=false;
      $('feedback-area').innerHTML='<div class="materials feedback"><h3>Feedback after your attempt</h3><p>'+esc(answer.solution)+'</p><p>'+esc(answer.explanation)+'</p></div><p>Compare this with the response you produced before opening feedback. Self-review records educational evidence; it is not independent assessor verification.</p><fieldset><legend>Criteria shown in your original response</legend>'+item.scoring.map(s=>'<label><input type="checkbox" name="criterion" value="'+esc(s.id)+'">'+esc(s.criterion)+'</label>').join('')+'</fieldset><fieldset><legend>Help and access</legend><label><input type="checkbox" id="help-used"> I used solving prompts, a checklist, another person or AI to help answer.</label><label><input type="checkbox" id="solution-before"> I had seen this solution before producing my response.</label><label><input type="checkbox" id="access-used"> I used extra time as an access adjustment.</label><label><input type="checkbox" name="access" value="screen-reader"> Screen reader</label><label><input type="checkbox" name="access" value="scribe"> Scribe</label><label><input type="checkbox" name="access" value="spoken-response"> Spoken response</label><label><input type="checkbox" name="access" value="large-print"> Large print</label><label><input type="checkbox" name="access" value="translation"> Translation</label><label><input type="checkbox" name="access" value="alternative-context"> Alternative fictional context</label></fieldset><fieldset><legend>What needs more practice?</legend>'+item.error_tags.map(t=>'<label><input type="checkbox" name="error" value="'+esc(t)+'">'+esc(D.skills.error_tags.find(e=>e.id===t).label)+'</label>').join('')+'</fieldset><label for="outcome">Outcome for the original response</label><select id="outcome"><option value="not-yet">Not yet · an essential criterion was missing</option><option value="assisted">Assisted · criteria met with solving help</option><option value="demonstrated">Demonstrated · all essential criteria without solving help</option></select><button id="save-attempt">Save evidence & find next task</button>';
      $('save-attempt').onclick=saveAttempt;$('feedback-area').scrollIntoView({block:'start'});
    }catch{if(token===requestToken){$('finish-attempt').disabled=false;notice('Feedback could not load. Keep your response temporarily and retry. Serve the repository over HTTP to use the dashboard.');}}
  }
  function saveAttempt(){
    const seen=state.records.some(r=>D.bank.items.find(i=>i.id===r.item_id).exposure_group===current.exposure_group);
    try{const next=E.recordAttempt(state,D,current.id,{outcome:$('outcome').value,help_used:$('help-used').checked,solution_seen:seen||$('solution-before').checked,
      criteria_met:[...document.querySelectorAll('[name=criterion]:checked')].map(e=>e.value),error_tags:[...document.querySelectorAll('[name=error]:checked')].map(e=>e.value),
      access_supports:[...($('access-used').checked?['extra-time']:[]),...[...document.querySelectorAll('[name=access]:checked')].map(e=>e.value)],phase:seen?'practice':startingPhase||undefined},today());
      persist(next);navigate('today');location.hash='today';notice('Evidence saved. Your next task now reflects this attempt.');
    }catch(error){notice(error.message);}
  }
  function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('domain-filter').innerHTML='<option value="all">All domains</option>'+D.index.domains.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.title)+'</option>').join('');
  $('domain-filter').onchange=renderPractice;
  $('domain-filter').value=E.recommend(state,D,today()).competency?.domain || 'all';
  $('goal').innerHTML+='<optgroup label="Independent subskills">'+D.skills.competencies.filter(c=>c.mode==='independent').map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+'</option>').join('')+'</optgroup>';
  $('goal').onchange=()=>persist({...state,goal_competencies:$('goal').value?[$('goal').value]:[]});
  $('locality').onchange=()=>{const next={...state,locality:$('locality').value},errors=E.validateState(next,D,today());if(errors.length){$('locality').value=state.locality;notice('Your saved records include nation-specific evidence. Download a backup and begin a separate profile to change locality; historical evidence must keep its original scope.');}else persist(next);};
  $('export-state').onclick=()=>{if(storageBlocked){try{const original=localStorage.getItem(key);if(original){const blob=new Blob([original],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='life-skills-original-needs-repair.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}}catch{}}download('life-skills-evidence.json',state);};
  $('export-evaluation').onclick=()=>download('life-skills-evaluation.json',{schema_version:1,locality:state.locality,pathway:state.pathway,results:E.evaluate(state,D),note:'Descriptive criterion evidence; no causal claim or personal data.'});
  $('import-state').onchange=async()=>{try{const file=$('import-state').files[0];if(!file)return;if(file.size>2000000)throw new Error('Evidence file is too large');const next=JSON.parse(await file.text()),errors=E.validateState(next,D,today());if(errors.length)throw new Error(errors[0]);storageBlocked=false;persist(next);notice('Valid educational evidence imported.');}catch(error){notice('Import refused: '+error.message);}finally{$('import-state').value='';}};
  $('reset-state').onclick=()=>{if(window.confirm('Clear this browser’s educational evidence? Download a backup first if you want to keep it.')){storageBlocked=false;persist(E.emptyState(state.locality,state.pathway));navigate('today');notice('This browser’s evidence was cleared.');}};
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.task)startTask(button.dataset.task);if(button.dataset.learn)showLesson(button.dataset.learn);if(button.dataset.pathway){persist({...state,pathway:button.dataset.pathway});location.hash='today';navigate('today');}});
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1));
})();
