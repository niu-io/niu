export const promptCategories = [
  { id: 'all', label: 'All tasks' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'build', label: 'Build' },
  { id: 'writing', label: 'Writing' },
] as const;

export const promptExamples = [
  { id: 'cost-estimate', category: 'reasoning', title: 'Cost estimate', summary: 'Estimate monthly API spend from daily traffic.', text: 'Our service handles 20,000 chat requests per day with an average of 1,500 input tokens and 400 output tokens. Walk through how to estimate monthly spend and compare two candidate pricing tiers.' },
  { id: 'context-window', category: 'reasoning', title: 'Context budget', summary: 'How many 8K-token turns fit in 128K?', text: 'A model has a 128K-token context window. If each turn in a conversation uses 8,000 tokens, about how many turns fit? Explain the calculation and what could reduce the usable number.' },
  { id: 'snake-game', category: 'build', title: 'Snake game', summary: 'Build an arrow-key controlled game.', text: 'Build a small snake game controlled with the arrow keys. Include food, collision detection, and a restart option.' },
  { id: 'file-tree', category: 'build', title: 'Collapsible file tree', summary: 'Use plain HTML and CSS.', text: 'Use plain HTML and CSS to build a collapsible file tree. Make the folder and file hierarchy clear and keep the controls accessible.' },
  { id: 'support-reply', category: 'writing', title: 'Support reply', summary: 'Respond to a frustrated customer with empathy.', text: 'Rewrite this complaint as an empathetic customer-support reply: “Your API has been down for three days, hurting our business. We’ll switch providers if this continues.” Acknowledge the impact, explain the next step, and avoid making promises you cannot verify.' },
  { id: 'job-post', category: 'writing', title: 'Backend engineer job post', summary: 'A Java and MySQL role with clear expectations.', text: 'Write a concise job post for a backend engineer role. The person should be skilled in Java and MySQL, take ownership of their work, and be comfortable with occasional overtime when releases require it.' },
] as const;
