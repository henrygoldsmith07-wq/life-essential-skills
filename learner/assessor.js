/* Local review: no identities, original answers, credentials or free-text notes. */
'use strict';
window.AssessorMode=ctx=>{
  const {E,D,U,load,renderMaterials,state,save,today,notice,download}=ctx,$=id=>document.getElementById(id);
  let token=0;
  function render(){
    const s=state();
    const eff=s.records.map(r=>E.effectiveRecord(state(),r,D));
    $('assessor-record').innerHTML='<option value="">Choose an attempt</option>'+s.records.map((r,i)=>{const e=eff[i];const label=e.outcome==='demonstrated'?'Independent · shown':e.outcome==='assisted'?'With help':'Not yet met';return '<option value="'+U.esc(r.id)+'">'+U.esc(D.bank.items.find(i=>i.id===r.item_id).title+' · '+D.skills.competencies.find(c=>c.id===r.competency_id).title+' · '+r.date)+' — '+label+'</option>';}).join('');
    $('observation-kind').innerHTML=D.practical.rubrics.map(r=>'<option value="'+r.id+'">'+U.esc(r.title)+'</option>').join('');
    $('assessor-history').textContent=s.reviews.length+' assessor reviews and '+s.observations.length+' structured practical observations retained.'+(s.legacy_observations.length?' Older observation flags are preserved but need a structured observed check before meeting a practical gate.':'');
  }
  async function openReview(){
    const n=++token,r=state().records.find(r=>r.id===$('assessor-record').value);$('assessor-work').replaceChildren();if(!r)return;
    try{
      const item=await load.item(r.item_id);if(n!==token)return;
      const current=E.effectiveRecord(state(),r,D),scoring=E.rubric(item,r.competency_id);
      $('assessor-work').innerHTML='<div class="card"><h2 id="review-title">Review '+U.esc(item.title)+'</h2>'+renderMaterials(item)+'<p>'+U.esc(item.task)+'</p><p class="notice">The original answer is never stored here. Review the learner’s unchanged paper/spoken/private output, or observe a performance directly. A new corrected answer needs a new attempt.</p><p>Original facts: '+U.esc(r.date)+' · '+(r.help_used?'solving help used':'no solving help recorded')+' · '+(r.solution_seen?'known materials':'fresh materials recorded')+'. These facts cannot be changed by review.</p><label><input type="checkbox" id="original-available"> I have the original performance available to review.</label><label><input type="checkbox" id="independently-observed"> I directly observed this original performance.</label>'+U.rubric(scoring,'review-judge',current.criteria_judgements)+U.errors(D.skills.competencies.find(c=>c.id===r.competency_id).error_tags,D,'review-error','',current.error_tags)+'<p>Direct observation of a written response does not establish cooking, account setup or file restore ability.</p><button id="save-review">Save assessor review</button><details><summary>Assessor calibration references</summary><button class="secondary" id="load-calibration">Open reference for this attempt</button><div id="calibration"></div></details></div>';
      $('save-review').onclick=()=>{try{
        if(!$('original-available').checked&&!$('independently-observed').checked)throw new Error('The original output or a directly observed original performance is required.');
        const next=E.reviewAttempt(state(),D,r.id,{criteria_judgements:U.judgements($('assessor-work')),error_tags:U.chosenErrors($('assessor-work')),basis:$('independently-observed').checked?'directly-observed':'original-output'},today());
        save(next);$('assessor-work').replaceChildren();notice('Assessor review saved. Original attempt facts remain in the history.');U.focus('assessor-title');
      }catch(e){notice(e.message);}};
      $('load-calibration').onclick=async()=>{try{const response=await fetch('../assessor/calibration/'+encodeURIComponent(item.id)+'.json');if(!response.ok){$('calibration').textContent='No calibrated benchmark for this item. Use the complete rubric; do not invent a reference.';return;}const b=await response.json();if(n!==token)return;$('calibration').innerHTML=Object.entries(b.levels).map(([level,v])=>'<h3>'+U.esc(level)+'</h3><p>'+U.esc(v.response)+'</p><p>'+U.esc(v.why)+'</p>').join('');}catch{notice('Calibration could not load.');}};
      U.focus('review-title');
    }catch(e){notice(e.message);}
  }
  function openObservation(){
    const rubric=D.practical.rubrics.find(r=>r.id===$('observation-kind').value);if(!rubric)return;
    $('observation-work').innerHTML='<div class="card"><h2 id="observation-title">'+U.esc(rubric.title)+'</h2><p class="notice">'+U.esc(rubric.safety)+'</p><p>Required for '+U.esc(rubric.gate.split('.')[0].replaceAll('-',' '))+' practical progress. Written assessment alone cannot meet this gate.</p><label><input type="checkbox" id="observed-safely"> I directly observed this permitted safe performance.</label>'+U.rubric(rubric.scoring,'observed-judge')+'<label><input type="checkbox" id="observation-help"> Solving prompts or practical help were used.</label>'+U.supports('observed-access')+U.errors(['unsafe-advice','reveals-sensitive-information','no-fallback'],D,'observed-error')+'<button id="save-observation">Save practical observation</button></div>';
    $('save-observation').onclick=()=>{try{if(!$('observed-safely').checked)throw new Error('A safe direct observation is required; a written plan is insufficient.');
      const next=E.recordObservation(state(),D,rubric.id,{criteria_judgements:U.judgements($('observation-work')),help_used:$('observation-help').checked,access_supports:U.chosenSupports($('observation-work')),error_tags:U.chosenErrors($('observation-work'))},today());save(next);$('observation-work').replaceChildren();notice('Practical observation saved. The latest observation determines the current practical gate.');U.focus('assessor-title');
    }catch(e){notice(e.message);}};U.focus('observation-title');
  }
  $('assessor-record').onchange=openReview;$('open-observation').onclick=openObservation;
  $('assessor-export').onclick=()=>download('life-skills-reviewed-evidence.json',state());
  return {render,cancel:()=>{token++;$('assessor-work').replaceChildren();$('observation-work').replaceChildren();}};
};
