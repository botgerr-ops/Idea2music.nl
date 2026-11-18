import test from 'node:test';
import assert from 'node:assert/strict';
import {composeStory,storyPromptKeys} from '../lib/story-intake.js';
import {validateOrder} from '../lib/order-rules.js';

test('keeps the ordinary story unchanged for existing customers',()=>{
 assert.equal(composeStory({story:'  Wij kennen elkaar al tien jaar.  '}),'Wij kennen elkaar al tien jaar.');
});

test('collects the optional prompts into the existing production brief',()=>{
 const story=composeStory({
  story:'Ik wil mijn zus graag bedanken.',
  memory:'Elke woensdag samen naar het strand.',
  qualities:'Ze lacht altijd om haar eigen grappen.',
  perspective:'Van haar jongere broer.',
  avoidTopics:'Geen leeftijd noemen.',
  voicePreference:'Warme vrouwenstem.'
 });
 assert.match(story,/Een herinnering die terug mag komen: Elke woensdag samen naar het strand/);
 assert.match(story,/Vanuit wie het lied wordt verteld: Van haar jongere broer/);
 assert.match(story,/Onderwerpen die niet genoemd mogen worden: Geen leeftijd noemen/);
 assert.match(story,/Stemvoorkeur: Warme vrouwenstem/);
 assert.equal(storyPromptKeys.length,5);
});

test('the regular order validator still enforces the established story limit',()=>{
 const original={story:'Een herinnering die veel voor me betekent.',recipient:'Mijn zus',occasion:'Bedankt',style:'Pop',mood:'Warm',language:'Nederlands'};
 const composed=composeStory({...original,memory:'A'.repeat(4000)});
 const {errors}=validateOrder({...original,story:composed});
 assert.ok(errors.story);
});
