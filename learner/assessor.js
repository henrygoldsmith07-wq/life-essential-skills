/* Local review: no identities, original answers, credentials or free-text notes. */
'use strict';
window.AssessorMode=ctx=>{
  const {E,D,U,load,renderMaterials,state,save,today,notice,download}=ctx,$=id=>document.getElementById(id);
  let token=0;
  function render(){
    const s=state();
    // Tolerate records left over from removed content: an unknown task or
    // competency must not crash the assessor screen (verify_resilience proves
    // the roadmap survives the same damage). Such records stay visible in the
    // list — never silently hidden — but are labelled and cannot be reviewed.
    $('assessor-record').innerHTML='<option value="">Choose an attempt</option>'+s.records.map(r=>{
      const item=D.bank.items.find(i=>i.id===r.item_id),comp=D.skills.competencies.find(c=>c.id===r.competency_id);
      const when=r.date||'unknown date';
      if(!item||!comp)return '<option value="'+U.esc(r.id)+'" disabled>'+U.esc((item?item.title:'A task removed by a content update')+' · '+(comp?comp.title:r.competency_id)+' · '+when)+' — kept in the record; it cannot be reviewed against the current curriculum</option>';
      let e;try{e=E.effectiveRecord(s,r,D);}catch{return '<option value="'+U.esc(r.id)+'" disabled>'+U.esc(item.title+' · '+comp.title+' · '+when)+' — unreadable record; kept in the history</option>';}
      const reviewed=e.evidence_level==='assessor-reviewed';const label=(reviewed?'Reviewed · ':'')+(e.outcome==='demonstrated'?'Independent · shown':e.outcome==='assisted'?'With help':'Not yet met');
      return '<option value="'+U.esc(r.id)+'"'+(reviewed?' data-reviewed="1"':'')+'>'+U.esc(item.title+' · '+comp.title+' · '+when)+' — '+label+'</option>';
    }).join('');
    $('observation-kind').innerHTML=D.practical.rubrics.map(r=>'<option value="'+r.id+'">'+U.esc(r.title)+'</option>').join('');
    $('assessor-history').textContent=s.reviews.length+' assessor reviews and '+s.observations.length+' structured practical observations retained.'+(s.legacy_observations.length?' Older observation flags are preserved but need a structured observed check before meeting a practical gate.':'');
  }
  async function openReview(){
    const n=++token,r=state().records.find(r=>r.id===$('assessor-record').value);$('assessor-work').replaceChildren();if(!r)return;
    try{
      const item=await load.item(r.item_id);if(n!==token)return;
      const current=E.effectiveRecord(state(),r,D),scoring=E.rubric(item,r.competency_id);
      const alreadyReviewed=current.evidence_level==='assessor-reviewed';
      $('assessor-work').innerHTML='<div class="card"><h2 id="review-title">Review '+U.esc(item.title)+'</h2>'+renderMaterials(item)+'<p>'+U.esc(item.task)+'</p>'+(alreadyReviewed?'<p class="notice">This attempt already has an assessor review. A new review will be appended; the earlier one stays in the history and cannot be changed. Review the learner’s unchanged original output or a directly observed performance before recording a new judgement.</p>':'<p class="notice">The original answer is never stored here. Review the learner’s unchanged paper/spoken/private output, or observe a performance directly. A new corrected answer needs a new attempt.</p>')+'<p>Original facts: '+U.esc(r.date)+' · '+(r.help_used?'solving help used':'no solving help recorded')+' · '+(r.solution_seen?'known materials':'fresh materials recorded')+'. These facts cannot be changed by review.</p><label><input type="checkbox" id="original-available"> I have the original performance available to review.</label><label><input type="checkbox" id="independently-observed"> I directly observed this original performance.</label>'+U.rubric(scoring,'review-judge',current.criteria_judgements)+U.errors(D.skills.competencies.find(c=>c.id===r.competency_id).error_tags,D,'review-error','',current.error_tags)+'<p>Direct observation of a written response does not establish cooking, account setup or file restore ability.</p><button id="save-review">Save assessor review</button><details><summary>Assessor calibration references</summary><button class="secondary" id="load-calibration">Open reference for this attempt</button><div id="calibration"></div></details></div>';
      $('save-review').onclick=()=>{try{
        if(!$('original-available').checked&&!$('independently-observed').checked)throw new Error('The original output or a directly observed original performance is required.');
        const next=E.reviewAttempt(state(),D,r.id,{criteria_judgements:U.judgements($('assessor-work')),error_tags:U.chosenErrors($('assessor-work')),basis:$('independently-observed').checked?'directly-observed':'original-output'},today());
        save(next);render();$('assessor-work').replaceChildren();notice('Assessor review saved. Original attempt facts remain in the history.');U.focus('assessor-title');
      }catch(e){notice(e.message);}};
      $('load-calibration').onclick=async()=>{try{const response=await fetch('../assessor/calibration/'+encodeURIComponent(item.id)+'.json');if(!response.ok){$('calibration').textContent='No calibrated benchmark for this item. Use the complete rubric; do not invent a reference.';return;}const b=await response.json();if(n!==token)return;$('calibration').innerHTML=Object.entries(b.levels).map(([level,v])=>'<h3>'+U.esc(level)+'</h3><p>'+U.esc(v.response)+'</p><p>'+U.esc(v.why)+'</p>').join('');}catch{notice('Calibration could not load.');}};
      U.focus('review-title');
    }catch(e){notice(e.message);}
  }
  function openObservation(){
    const rubric=D.practical.rubrics.find(r=>r.id===$('observation-kind').value);if(!rubric)return;
    $('observation-work').innerHTML='<div class="card"><h2 id="observation-title">'+U.esc(rubric.title)+'</h2><p class="notice">'+U.esc(rubric.safety)+'</p><p>Required for '+U.esc(rubric.gate.split('.')[0].replaceAll('-',' '))+' practical progress. Written assessment alone cannot meet this gate.</p><label><input type="checkbox" id="observed-safely"> I directly observed this permitted safe performance.</label>'+U.rubric(rubric.scoring,'observed-judge')+'<label><input type="checkbox" id="observation-help"> Solving prompts or practical help were used.</label>'+U.supports('observed-access')+U.errors(['unsafe-advice','reveals-sensitive-information','no-fallback'],D,'observed-error')+'<p id="observation-outcome" role="status" aria-live="polite">Choose a judgement for every criterion to see the result.</p><div class="actions"><button type="button" class="secondary" id="print-observation-sheet">Print blank observation sheet</button><button id="save-observation" disabled>Save practical observation</button></div></div>';
    const box=$('observation-work');
    function preview(){const allJudged=![...box.querySelectorAll('[data-criterion]')].some(c=>!c.value);$('save-observation').disabled=!allJudged;if(!allJudged)return;try{const tags=U.chosenErrors(box),help=$('observation-help').checked;const outcome=E.deriveOutcome(rubric.scoring,U.judgements(box),help,false,tags);$('observation-outcome').textContent=U.statuses[outcome];}catch(e){$('observation-outcome').textContent='';}}
    box.addEventListener('change',preview);
    // Blank paper sheet for the practical session: criteria and safety only.
    // It is built from the rubric definition, never from a learner's judgements
    // or any answer key, so it can be taken into a session without leaking data.
    $('print-observation-sheet').onclick=()=>printObservationSheet(rubric);
    $('save-observation').onclick=()=>{try{if(!$('observed-safely').checked)throw new Error('A safe direct observation is required; a written plan is insufficient.');
      const input={criteria_judgements:U.judgements(box),help_used:$('observation-help').checked,access_supports:U.chosenSupports(box),error_tags:U.chosenErrors(box)};const outcome=E.deriveOutcome(rubric.scoring,input.criteria_judgements,input.help_used,false,input.error_tags);const next=E.recordObservation(state(),D,rubric.id,input,today());save(next);$('observation-work').replaceChildren();notice(U.statuses[outcome]+'. Practical observation saved. The latest observation determines the current practical gate for '+U.esc(rubric.gate.split('.')[0].replaceAll('-',' '))+' practical progress.');U.focus('assessor-title');
    }catch(e){notice(e.message);}};preview();U.focus('observation-title');
  }
  function printObservationSheet(rubric){
    const sheet=$('observation-sheet');
    const rows=rubric.scoring.map((s,n)=>'<tr><td>'+(n+1)+'</td><td>'+U.esc(s.criterion)+(s.essential?' <strong>(essential)</strong>':'')+'<br><span>'+U.esc(s.guidance)+'</span></td><td class="tick">Met ☐</td><td class="tick">Partly ☐</td><td class="tick">Not met ☐</td></tr>').join('');
    sheet.innerHTML='<h1>'+U.esc(rubric.title)+'</h1><p><strong>Safety:</strong> '+U.esc(rubric.safety)+'</p><p>Observer: ____________________ &nbsp; Date: ____________ &nbsp; Setting: ____________________</p><p>Directly observe the permitted safe performance. Written plans do not count. Mark each criterion once you have seen it, then record the result in the assessor tool.</p><table><thead><tr><th>#</th><th>Criterion</th><th colspan="3">Judgement</th></tr></thead><tbody>'+rows+'</tbody></table><p class="muted">Solving help used: ☐ yes ☐ no. Unsafe advice or sensitive information shown: ☐ yes ☐ no.</p>';
    sheet.hidden=false;document.body.classList.add('printing-sheet');
    const done=()=>{document.body.classList.remove('printing-sheet');sheet.hidden=true;window.removeEventListener('afterprint',done);};
    window.addEventListener('afterprint',done);window.print();
  }
  $('assessor-record').onchange=openReview;$('open-observation').onclick=openObservation;
  $('assessor-export').onclick=()=>download('life-skills-reviewed-evidence.json',state());
  return {render,cancel:()=>{token++;$('assessor-work').replaceChildren();$('observation-work').replaceChildren();}};
};
