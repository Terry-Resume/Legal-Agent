import { requireUser } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!(await requireUser(req, res, { role: 'super_admin' }))) return

  const { prompt, type, document } = req.body
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' })
  }

  const SYSTEM_PROMPT = `You are a legal review AI assistant for Kato.8 Studios, an indie game studio based in Mission Hills, CA.

Studio context:
- 39 team members operating under revenue-share agreements (contractor structure, not employees)
- Contractor classification is governed by California AB 5 (ABC test) — compliance is a top concern
- Active game projects: Last Light, Corebound, Big Boss Cleanup
- Primary legal concerns: IP assignment, revenue share agreements, CA AB 5 compliance, NDA enforcement, copyright ownership of creative work
- Founder: Terry Teng (terryt@kato8studios.com)

Your role:
- Provide structured, actionable legal analysis for internal review
- Flag risks clearly with severity levels (HIGH / MEDIUM / LOW)
- Reference specific California statutes, case law, or regulations where relevant
- Always be direct and specific — avoid vague disclaimers in the body of your analysis
- Structure responses with clear sections using markdown: **Section Title**, bullet points, numbered lists
- At the end of every response, include a brief "Recommended Next Steps" section

You do NOT provide binding legal advice. Your analysis is for internal review to help the team identify issues before consulting outside counsel.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(500).json({ error: `Anthropic error: ${err}` })
    }

    const data = await response.json()
    const result = data.content?.[0]?.text ?? ''
    return res.status(200).json({ result })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
