// SafeRoute – Groq AI Risk Explanation
import { GROQ_API_KEY, GROQ_MODEL } from '../config.js';
import { events } from '../utils.js';

let _lastTier = null;

events.on('risk-updated', ({ score, level, factors }) => {
  // Only call Groq when risk tier changes
  if (level.label !== _lastTier) {
    _lastTier = level.label;
    explainRisk(score, factors).then(text => {
      events.emit('ai-explanation', { text });
    });
  }
});

export async function explainRisk(score, factors) {
  if (!GROQ_API_KEY) {
    return buildFallbackExplanation(score, factors);
  }

  const factorDesc = Object.entries(factors)
    .filter(([k]) => !k.endsWith('Metres'))
    .map(([k, v]) => `${k}: ${v} pts`)
    .join(', ');

  const prompt = `You are a women's travel safety AI assistant. A traveler's current risk score is ${score}/100 (${getRiskLabel(score)}). The contributing factors are: ${factorDesc}. 
Write ONE short, calm, helpful sentence (max 20 words) explaining the main risk and what to watch for. Be empathetic and not alarming.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.6
      })
    });

    if (!response.ok) throw new Error(`Groq API ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || buildFallbackExplanation(score, factors);
  } catch (err) {
    console.warn('[Groq] Error:', err);
    return buildFallbackExplanation(score, factors);
  }
}

function buildFallbackExplanation(score, factors) {
  if (score <= 30) return 'Your journey looks safe. Keep moving and stay alert.';

  const reasons = [];
  if (factors.night)     reasons.push('night-time travel');
  if (factors.deviation) reasons.push('route deviation detected');
  if (factors.halt)      reasons.push('prolonged halt detected');
  if (factors.alerts)    reasons.push('multiple safety alerts ignored');
  if (factors.speed)     reasons.push('very low movement speed');

  if (!reasons.length)   return 'Elevated risk detected. Please stay alert.';
  return `Risk elevated due to ${reasons.slice(0, 2).join(' and ')}.`;
}

function getRiskLabel(score) {
  if (score <= 30) return 'Safe';
  if (score <= 60) return 'Medium Risk';
  return 'High Risk';
}
