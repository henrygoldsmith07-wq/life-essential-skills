// The Discover page is checked in scripts/verify_research_ui.js with a DOM
// stub. This spec drives the real page so a broken script, layout or link
// cannot pass on source-text checks alone.
'use strict';
const {test,expect}=require('@playwright/test'),AxeBuilder=require('@axe-core/playwright').default;

test('Discover renders the committed digest, switches views and stays accessible',async({page})=>{
  test.setTimeout(180000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/research/');
  // The committed feed is a few MB; give the real fetch time on a busy machine.
  await expect(page.locator('#meta')).toContainText('Updated',{timeout:120000});
  expect(errors).toEqual([]);
  await expect(page.locator('#stats dd').first()).not.toHaveText('—');
  expect(await page.locator('#results .card').count()).toBeGreaterThan(0);
  await expect(page.locator('#picks')).toBeVisible();

  await page.locator('[data-view="facts"]').click();
  await expect(page.locator('#results')).toContainText('Did you know?');
  await page.locator('[data-view="headlines"]').click();
  expect(await page.locator('#results .card').count()).toBeGreaterThan(0);
  await page.locator('[data-view="quiz"]').click();
  await expect(page.locator('#results')).toContainText('Question 1 of');
  await page.locator('[data-view="papers"]').click();
  expect(await page.locator('#results > *').count()).toBeGreaterThan(0);
  await page.locator('[data-view="saved"]').click();
  await expect(page.locator('#results')).toContainText('Nothing saved');

  // Every outbound link opens safely in a new tab.
  await page.locator('[data-view="skills"]').click();
  const links=page.locator('#results a[target="_blank"]');
  expect(await links.count()).toBeGreaterThan(0);
  for(let n=0;n<await links.count();n++){
    const rel=await links.nth(n).getAttribute('rel');
    expect(rel&&rel.includes('noopener')&&rel.includes('noreferrer')).toBe(true);
  }
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('Discover reflows on a phone without overflow or accessibility regressions',async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/research/');
  await expect(page.locator('#meta')).toContainText('Updated',{timeout:120000});
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  // The stats grid used to force ~328px of content into a 320px viewport.
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
