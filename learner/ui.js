/* Shared accessible controls; escape every canonical string before rendering. */
'use strict';
window.LearnerUI=(()=>{
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=rows=>'<ul>'+rows.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>';
  const statuses={demonstrated:'Shown independently',assisted:'Completed with help','not-yet':'Needs more practice',unassessed:'Not yet checked'};
  const levels={'self-reviewed':'Self-reviewed · not independently verified','assessor-reviewed':'Reviewed by an assessor','practical-observed':'Observed in practice'};
  function rubric(scoring,prefix='judge',previous=[]){
    return '<fieldset><legend>Compare the original performance</legend><p>Judge what was shown before feedback. An essential step must be fully met.</p>'+scoring.map((s,n)=>{
      const selected=previous.find(j=>j.criterion_id===s.id)?.judgement||'';
      return '<div class="criterion"><label for="'+prefix+'-'+n+'">'+esc(s.criterion)+(s.essential?' <span class="pill">Essential</span>':'')+'</label><p id="'+prefix+'-help-'+n+'" class="muted">'+esc(s.guidance)+'</p><select id="'+prefix+'-'+n+'" data-criterion="'+esc(s.id)+'" aria-describedby="'+prefix+'-help-'+n+'" required><option value="">Choose a judgement</option>'+[['met','Met · fully shown'],['partly-met','Partly met · an important gap'],['not-met','Not met · absent or incorrect']].map(([v,l])=>'<option value="'+v+'" '+(selected===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>';
    }).join('')+'</fieldset>';
  }
  function judgements(container){
    const controls=[...container.querySelectorAll('[data-criterion]')],missing=controls.find(c=>!c.value);
    if(missing){missing.setAttribute('aria-invalid','true');missing.setAttribute('aria-errormessage','notice');missing.focus();throw new Error('Choose met, partly met or not met for every criterion.');}
    controls.forEach(c=>c.removeAttribute('aria-invalid'));
    return controls.map(c=>({criterion_id:c.dataset.criterion,judgement:c.value}));
  }
  function errors(tags,data,prefix,cid='',selected=[]){
    return '<fieldset><legend>Errors to work on</legend>'+tags.map((t,n)=>'<label><input type="checkbox" id="'+prefix+'-'+n+'" data-error="'+esc(t)+'" data-error-cid="'+esc(cid)+'" '+(selected.includes(t)?'checked':'')+'>'+esc(data.skills.error_tags.find(e=>e.id===t).label)+'</label>').join('')+'</fieldset>';
  }
  const chosenErrors=container=>[...container.querySelectorAll('[data-error]:checked')].map(c=>c.dataset.error);
  function supports(prefix){return '<fieldset><legend>Access adjustments</legend><p>These do not reduce the outcome. Solving help is recorded separately.</p>'+Evidence.access.map((v,n)=>'<label><input type="checkbox" id="'+prefix+'-'+n+'" data-access="'+v+'">'+esc(v.replaceAll('-',' '))+'</label>').join('')+'</fieldset>';}
  const chosenSupports=container=>[...container.querySelectorAll('[data-access]:checked')].map(c=>c.dataset.access);
  const focus=id=>{const el=document.getElementById(id);if(el){el.tabIndex=-1;el.focus();el.scrollIntoView({block:'start'});}};
  return {esc,list,statuses,levels,rubric,judgements,errors,chosenErrors,supports,chosenSupports,focus};
})();
