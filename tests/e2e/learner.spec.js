'use strict';
const {test,expect}=require('@playwright/test'),AxeBuilder=require('@axe-core/playwright').default;
const path=require('node:path');
const key='life-essential-skills-evidence-v1';
const evidence=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
async function start(page){await page.goto('/learner/');await page.getByRole('button',{name:'Start this task',exact:true}).click();await expect(page.getByLabel('Your fictional response')).toBeVisible();}
async function finish(page){await page.getByLabel('Your fictional response').fill('FICTIONAL ORIGINAL RESPONSE — evidence and uncertainty explained.');await page.getByRole('button',{name:'Finish attempt & check feedback'}).click();await expect(page.getByRole('heading',{name:'Compare with your original answer'})).toBeVisible();}
async function judge(page,scope='#feedback-area',value='met'){const controls=page.locator(scope+' [data-criterion]');for(let n=0;n<await controls.count();n++)await controls.nth(n).selectOption(value);}
test('Today, lazy learning, attempt gating, structured derived review and private persistence',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/learner/');await expect(page.getByRole('heading',{name:'Why this step?'})).toBeVisible();await expect(page.locator('#today-content')).toContainText('Afterwards');
  expect(requests.filter(u=>u.includes('/assessor/')||u.includes('/chunks/'))).toEqual([]);
  await page.getByRole('button',{name:'Learn the skill',exact:true}).click();await expect(page.locator('.lesson h3').first()).toBeVisible();expect(requests.filter(u=>u.includes('/chunks/')).length).toBe(1);
  await page.getByRole('button',{name:'Close the guide'}).click();await page.getByRole('button',{name:'Start this task',exact:true}).click();
  await page.getByRole('button',{name:'Finish attempt & check feedback'}).click();await expect(page.getByLabel('Your fictional response')).toBeFocused();await expect(page.locator('#notice')).toContainText('Complete a response');expect(requests.filter(u=>u.includes('/feedback/'))).toEqual([]);
  await finish(page);await expect(page.getByLabel('Your fictional response')).toHaveAttribute('readonly','');expect(requests.filter(u=>u.includes('/feedback/')).length).toBe(1);
  await expect(page.locator('#outcome')).toHaveCount(0);await page.getByRole('button',{name:'Save evidence & find next task'}).click();await expect(page.locator('#notice')).toContainText('every criterion');expect((await evidence(page)).records).toEqual([]);
  await judge(page);await page.locator('[data-criterion]').first().selectOption('partly-met');await expect(page.locator('#derived-result')).toContainText('Needs more practice');
  await judge(page);await page.locator('#help-used').check();await expect(page.locator('#derived-result')).toContainText('Completed with help');await page.locator('#help-used').uncheck();await page.getByLabel('extra time',{exact:true}).check();await expect(page.locator('#derived-result')).toContainText('self-reviewed');
  await page.getByRole('button',{name:'Save evidence & find next task'}).click();const s=await evidence(page);expect(s.records[0].outcome).toBe('demonstrated');expect(s.records[0].evidence_level).toBe('self-reviewed');expect(s.records[0].access_supports).toEqual(['extra-time']);expect(JSON.stringify(s)).not.toContain('FICTIONAL ORIGINAL');expect(Object.keys(s.records[0])).not.toContain('response');
  await page.reload();await page.getByRole('link',{name:'Progress',exact:true}).click();await expect(page.locator('#progress-content')).toContainText('Independent, self-reviewed');expect(errors).toEqual([]);
});
test('help prevents independent outcomes, and cancelled feedback is never fresh again',async({page})=>{
  await start(page);const id=await page.locator('#today-content [data-task]').getAttribute('data-task');await finish(page);await page.getByRole('button',{name:'Close task',exact:true}).click();
  await page.getByRole('link',{name:'Practice',exact:true}).click();await page.getByLabel('Find tasks').selectOption('guided');await page.locator('[data-task="'+id+'"]').click();await finish(page);await judge(page);await expect(page.locator('#solution-before')).toBeChecked();await expect(page.locator('#derived-result')).toContainText('Completed with help');
  await page.getByRole('button',{name:'Save evidence & find next task'}).click();expect((await evidence(page)).records[0].outcome).toBe('assisted');
  await page.getByRole('link',{name:'Practice',exact:true}).click();await page.getByLabel('Find tasks').selectOption('unseen');await expect(page.locator('#practice-content [data-task="'+id+'"]')).toHaveCount(0);
});
test('locality, grouped practice, search, pathways and refused import preserve the profile',async({page})=>{
  await page.goto('/learner/#settings');await page.getByLabel('Guidance locality').selectOption('wales');expect((await evidence(page)).locality).toBe('wales');
  await page.getByRole('link',{name:'Practice',exact:true}).click();await page.getByLabel('Find tasks').selectOption('capstones');await expect(page.locator('#practice-content')).toContainText('Moving out');
  await page.getByLabel('Skill area').selectOption('money');await page.getByLabel('Search tasks and skills').fill('unexpected');await expect(page.locator('#practice-content [data-task]')).toHaveCount(1);
  await page.getByRole('link',{name:'Pathways',exact:true}).click();await page.locator('[data-pathway="digital-safety"]').click();expect((await evidence(page)).pathway).toBe('digital-safety');
  await page.getByRole('link',{name:'My setup',exact:true}).click();const old=await evidence(page);
  await page.locator('#import-state').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...old,password:'forbidden'}))});await expect(page.locator('#notice')).toContainText('Import refused');expect(await evidence(page)).toEqual(old);
  await page.locator('#import-state').setInputFiles(path.resolve('examples/learners/wales-housing.json'));await expect(page.locator('#notice')).toContainText('Valid educational');expect((await evidence(page)).records.length).toBeGreaterThan(0);
  await page.getByLabel('Guidance locality').selectOption('uk');await expect(page.locator('#notice')).toContainText('nation-specific');expect((await evidence(page)).locality).toBe('wales');
});
test('assessor review is separate, requires original output and exports bounded updated evidence',async({page})=>{
  await start(page);await finish(page);await judge(page);await page.getByRole('button',{name:'Save evidence & find next task'}).click();const old=await evidence(page);
  await page.getByRole('link',{name:'Assessor',exact:true}).click();await page.getByLabel('Attempt to review').selectOption(old.records[0].id);await expect(page.getByRole('heading',{name:/Review /})).toBeVisible();
  await page.getByRole('button',{name:'Save assessor review',exact:true}).click();await expect(page.locator('#notice')).toContainText('original output');
  await page.getByLabel('I have the original performance available to review.').check();await page.getByLabel('I directly observed this original performance.').check();await page.locator('#assessor-work [data-criterion]').first().selectOption('not-met');await page.getByRole('button',{name:'Save assessor review',exact:true}).click();const next=await evidence(page);expect(next.records).toEqual(old.records);expect(next.reviews[0].evidence_level).toBe('assessor-reviewed');expect(next.reviews[0].basis).toBe('directly-observed');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download reviewed evidence'}).click();expect((await download).suggestedFilename()).toBe('life-skills-reviewed-evidence.json');
  await page.getByRole('link',{name:'Progress',exact:true}).click();await page.getByText('Skills and next steps',{exact:true}).first().click();await expect(page.locator('#progress-content')).toContainText('Reviewed by an assessor');
});
test('safe structured practical observations support access and retain later failures',async({page})=>{
  await page.goto('/learner/#assessor');await page.getByLabel('Safe practical check').selectOption('observed-sample-restore');await page.getByRole('button',{name:'Open observation rubric'}).click();
  await judge(page,'#observation-work');await page.getByRole('button',{name:'Save practical observation'}).click();await expect(page.locator('#notice')).toContainText('direct observation');
  await page.getByLabel('I directly observed this permitted safe performance.').check();await page.getByLabel('scribe',{exact:true}).check();await page.getByRole('button',{name:'Save practical observation'}).click();expect((await evidence(page)).observations[0].outcome).toBe('demonstrated');
  await page.getByRole('button',{name:'Open observation rubric'}).click();await judge(page,'#observation-work');await page.locator('#observation-work [data-criterion]').first().selectOption('not-met');await page.getByLabel('I directly observed this permitted safe performance.').check();await page.getByRole('button',{name:'Save practical observation'}).click();const s=await evidence(page);expect(s.observations.map(o=>o.outcome)).toEqual(['demonstrated','not-yet']);expect(s.observations.every(o=>o.evidence_level==='practical-observed')).toBe(true);
});
test('capstone saves granular mixed results with competency-specific errors and a next recommendation',async({page})=>{
  await page.goto('/learner/#practice');await page.getByLabel('Find tasks').selectOption('capstones');await page.locator('#practice-content [data-task="C03"]').click();await finish(page);await judge(page);await page.locator('#feedback-area [data-criterion]').first().selectOption('not-met');await page.locator('[data-error-cid="money.credit.independent"][data-error="missed-payment-timing"]').check();
  await page.getByRole('button',{name:'Save evidence & find next task'}).click();const s=await evidence(page);expect(s.records).toHaveLength(4);expect(s.records[0].outcome).toBe('not-yet');expect(s.records.slice(1).every(r=>r.outcome==='demonstrated'&&r.error_tags.length===0)).toBe(true);expect(new Set(s.records.map(r=>r.attempt_id)).size).toBe(1);await expect(page.locator('#today-content [data-task]')).toHaveCount(1);expect(JSON.stringify(s)).not.toContain('FICTIONAL ORIGINAL');
});
for(const view of ['today','progress','practice','pathways','settings','assessor']){
  test('mobile accessibility and reflow: '+view,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/learner/#'+view);await expect(page.locator('#'+view)).toBeVisible();
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations,view).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('visible keyboard focus, task activation and accessible structured feedback on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/learner/');await page.keyboard.press('Tab');expect(await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=3;})).toBe(true);
  await page.keyboard.press('Enter');await page.keyboard.press('Tab');
  await page.getByRole('button',{name:'Start this task',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Your fictional response')).toBeVisible();await finish(page);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
