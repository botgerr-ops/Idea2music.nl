// The additional storytelling prompts are presentation-only fields. They are
// folded into the existing `story` field so that checkout, D1 and order emails
// keep their established contract while production remains fully manual.
export const storyPromptKeys = ['memory', 'qualities', 'perspective', 'avoidTopics', 'voicePreference'];

export function composeStory(input = {}) {
  const story = typeof input.story === 'string' ? input.story.trim() : '';
  const prompts = [
    ['Een herinnering die terug mag komen', input.memory],
    ['Wat deze persoon bijzonder maakt', input.qualities],
    ['Vanuit wie het lied wordt verteld', input.perspective],
    ['Onderwerpen die niet genoemd mogen worden', input.avoidTopics],
    ['Stemvoorkeur', input.voicePreference]
  ];
  const additions = prompts
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`);
  return [story, ...additions].filter(Boolean).join('\n\n');
}
