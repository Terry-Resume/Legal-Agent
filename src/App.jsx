import { useState, useCallback } from 'react'
import { apiFetch } from '@kato8/core/react'
import { STUDIO } from '@kato8/core'

const PROXY_URL = '/api/legal-review'

// apiFetch attaches the Clerk session token (or the demo role); the server verifies it and picks the model.
const postReview = body => apiFetch(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

// Turns a failed response into a readable message from the server's own error text.
async function failure(res) {
  let detail = ''
  try { detail = (await res.json()).error || '' } catch { /* not JSON */ }
  return new Error(detail || `Request failed (${res.status})`)
}
const HISTORY_KEY = 'k8-legal-history'

const COMPLIANCE_AREAS = [
  'CA Employment Law / AB 5',
  'IP / Copyright Assignment',
  'Privacy / CCPA',
  'Revenue Share Agreements',
  'NDA / Confidentiality',
  'Contractor Classification',
  'Game Licensing / Publishing',
]

const TABS = [
  { id: 'document', label: 'Document Review' },
  { id: 'compliance', label: 'Compliance Check' },
  { id: 'operations', label: 'Operations Review' },
  { id: 'history', label: 'History' },
]

function formatTimestamp(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let key = 0
  let listItems = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key++}`}>{listItems}</ul>)
      listItems = []
    }
  }

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushList()
      elements.push(<h3 key={key++}>{parseBold(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(<h2 key={key++}>{parseBold(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      flushList()
      elements.push(<h1 key={key++}>{parseBold(line.slice(2))}</h1>)
    } else if (/^[-*] /.test(line)) {
      listItems.push(<li key={key++}>{parseBold(line.slice(2))}</li>)
    } else if (/^\d+\. /.test(line)) {
      flushList()
      elements.push(<p key={key++} className="numbered-item">{parseBold(line)}</p>)
    } else if (line.trim() === '') {
      flushList()
      elements.push(<div key={key++} className="spacer" />)
    } else {
      flushList()
      elements.push(<p key={key++}>{parseBold(line)}</p>)
    }
  }
  flushList()
  return elements
}

function parseBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// --- Document Review Tab ---
function DocumentReviewTab({ onSaveHistory }) {
  const [document, setDocument] = useState('')
  const [docType, setDocType] = useState('Contract')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleReview = async () => {
    if (!document.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    const prompt = `Please review the following ${docType} document for Kato.8 Studios.

Analyze it for:
1. Missing or weak clauses that should be present
2. California law compliance issues (AB 5, IP assignment, NDA enforceability, etc.)
3. Red flags or one-sided terms that disadvantage the studio
4. Suggested improvements or additions

Document:
---
${document}
---`

    try {
      const res = await postReview(JSON.stringify({ prompt, type: 'document_review', document }))
      if (!res.ok) throw await failure(res)
      const data = await res.json()
      const text = data.result || data.content || data.text || JSON.stringify(data)
      setResult(text)
      onSaveHistory({
        type: 'Document Review',
        subtype: docType,
        summary: document.slice(0, 120) + (document.length > 120 ? '...' : ''),
        result: text,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>Document Review</h2>
        <p className="section-desc">
          Paste a contract, NDA, revenue share agreement, or offer letter. The AI will review it for missing clauses, CA law compliance, red flags, and suggested improvements.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="doc-type">Document Type</label>
        <select id="doc-type" value={docType} onChange={e => setDocType(e.target.value)}>
          <option>Contract</option>
          <option>NDA</option>
          <option>Revenue Share Agreement</option>
          <option>Offer Letter</option>
          <option>Contractor Agreement</option>
          <option>IP Assignment Agreement</option>
          <option>Publishing Agreement</option>
          <option>Other</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="doc-text">Document Text</label>
        <textarea
          id="doc-text"
          className="doc-textarea"
          placeholder="Paste the full document text here..."
          value={document}
          onChange={e => setDocument(e.target.value)}
          rows={16}
        />
      </div>

      <div className="form-actions">
        <button
          className="btn-primary"
          onClick={handleReview}
          disabled={loading || !document.trim()}
        >
          {loading ? 'Reviewing...' : 'Run Legal Review'}
        </button>
        {document && (
          <button className="btn-ghost" onClick={() => { setDocument(''); setResult(null); setError(null) }}>
            Clear
          </button>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorBlock message={error} />}
      {result && <ResultBlock result={result} />}
    </div>
  )
}

// --- Compliance Check Tab ---
function ComplianceCheckTab({ onSaveHistory }) {
  const [area, setArea] = useState(COMPLIANCE_AREAS[0])
  const [situation, setSituation] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleCheck = async () => {
    if (!situation.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    const prompt = `Compliance area: ${area}

Situation description:
${situation}

Please check this situation against relevant California law and Kato.8 Studios' specific context (contractor-based revenue share structure, AB 5 compliance, creative IP ownership). Identify:
1. Whether this situation is compliant with current law
2. Specific statutes or regulations that apply
3. Any risks or exposure areas
4. What the studio should do to ensure or maintain compliance`

    try {
      const res = await postReview(JSON.stringify({ prompt, type: 'compliance_check', document: situation }))
      if (!res.ok) throw await failure(res)
      const data = await res.json()
      const text = data.result || data.content || data.text || JSON.stringify(data)
      setResult(text)
      onSaveHistory({
        type: 'Compliance Check',
        subtype: area,
        summary: situation.slice(0, 120) + (situation.length > 120 ? '...' : ''),
        result: text,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>Compliance Check</h2>
        <p className="section-desc">
          Describe a situation or practice and select the compliance area. The AI will check it against relevant California law and studio context.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="compliance-area">Compliance Area</label>
        <select id="compliance-area" value={area} onChange={e => setArea(e.target.value)}>
          {COMPLIANCE_AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="situation">Situation Description</label>
        <textarea
          id="situation"
          className="doc-textarea"
          placeholder="Describe the situation, practice, or policy you want to check..."
          value={situation}
          onChange={e => setSituation(e.target.value)}
          rows={10}
        />
      </div>

      <div className="form-actions">
        <button
          className="btn-primary"
          onClick={handleCheck}
          disabled={loading || !situation.trim()}
        >
          {loading ? 'Checking...' : 'Run Compliance Check'}
        </button>
        {situation && (
          <button className="btn-ghost" onClick={() => { setSituation(''); setResult(null); setError(null) }}>
            Clear
          </button>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorBlock message={error} />}
      {result && <ResultBlock result={result} />}
    </div>
  )
}

// --- Operations Review Tab ---
function OperationsReviewTab({ onSaveHistory }) {
  const [opType, setOpType] = useState('Hiring / Onboarding')
  const [description, setDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleReview = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    const prompt = `Studio operation type: ${opType}

Description:
${description}

Please review the legal implications of this operation for Kato.8 Studios. Consider:
1. Immediate legal risks or liabilities
2. Required documentation or steps to take
3. California-specific requirements (labor law, contractor law, IP law as applicable)
4. Whether this decision could affect the studio's AB 5 contractor structure
5. Recommended protective measures`

    try {
      const res = await postReview(JSON.stringify({ prompt, type: 'operations_review', document: description }))
      if (!res.ok) throw await failure(res)
      const data = await res.json()
      const text = data.result || data.content || data.text || JSON.stringify(data)
      setResult(text)
      onSaveHistory({
        type: 'Operations Review',
        subtype: opType,
        summary: description.slice(0, 120) + (description.length > 120 ? '...' : ''),
        result: text,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>Operations Review</h2>
        <p className="section-desc">
          Describe a studio operation or decision. The AI will review the legal implications before you proceed.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="op-type">Operation Type</label>
        <select id="op-type" value={opType} onChange={e => setOpType(e.target.value)}>
          <option>Hiring / Onboarding</option>
          <option>Contractor Termination</option>
          <option>Compensation Change</option>
          <option>Role / Responsibility Change</option>
          <option>Revenue Share Restructure</option>
          <option>IP Transfer or Licensing</option>
          <option>Publishing Deal</option>
          <option>External Collaboration</option>
          <option>Policy Change</option>
          <option>Other</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="op-description">Operation Description</label>
        <textarea
          id="op-description"
          className="doc-textarea"
          placeholder="Describe the operation, decision, or action you are considering or have taken..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={10}
        />
      </div>

      <div className="form-actions">
        <button
          className="btn-primary"
          onClick={handleReview}
          disabled={loading || !description.trim()}
        >
          {loading ? 'Reviewing...' : 'Run Operations Review'}
        </button>
        {description && (
          <button className="btn-ghost" onClick={() => { setDescription(''); setResult(null); setError(null) }}>
            Clear
          </button>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorBlock message={error} />}
      {result && <ResultBlock result={result} />}
    </div>
  )
}

// --- History Tab ---
function HistoryTab({ history, onClear }) {
  const [expanded, setExpanded] = useState(null)

  if (history.length === 0) {
    return (
      <div className="tab-content">
        <div className="section-header">
          <h2>History</h2>
          <p className="section-desc">Past legal reviews and compliance checks will appear here.</p>
        </div>
        <div className="empty-state">No reviews on record yet.</div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>History</h2>
        <p className="section-desc">{history.length} review{history.length !== 1 ? 's' : ''} on record.</p>
      </div>

      <div className="history-list">
        {[...history].reverse().map((item, idx) => {
          const realIdx = history.length - 1 - idx
          const isOpen = expanded === realIdx
          return (
            <div key={realIdx} className={`history-item ${isOpen ? 'open' : ''}`}>
              <button
                className="history-item-header"
                onClick={() => setExpanded(isOpen ? null : realIdx)}
                aria-expanded={isOpen}
              >
                <div className="history-meta">
                  <span className="history-badge">{item.type}</span>
                  {item.subtype && <span className="history-subtype">{item.subtype}</span>}
                  <span className="history-ts">{formatTimestamp(item.timestamp)}</span>
                </div>
                <div className="history-summary">{item.summary}</div>
                <span className="history-toggle">{isOpen ? 'Collapse' : 'Expand'}</span>
              </button>
              {isOpen && (
                <div className="history-result">
                  <ResultBlock result={item.result} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="form-actions" style={{ marginTop: '2rem' }}>
        <button className="btn-danger" onClick={onClear}>
          Clear History
        </button>
      </div>
    </div>
  )
}

// --- Shared Components ---
function LoadingSpinner() {
  return (
    <div className="loading-block">
      <div className="spinner" />
      <span>Analyzing — this may take a few seconds...</span>
    </div>
  )
}

function ErrorBlock({ message }) {
  return (
    <div className="error-block">
      <strong>Error:</strong> {message}
    </div>
  )
}

function ResultBlock({ result, compact }) {
  return (
    <div className={`result-block ${compact ? 'compact' : ''}`}>
      <div className="disclaimer">
        This is AI-assisted legal guidance for internal review. Consult a licensed attorney for binding legal decisions.
      </div>
      <div className="result-body">
        {renderMarkdown(result)}
      </div>
    </div>
  )
}

// --- Root App ---
export default function App() {
  const [activeTab, setActiveTab] = useState('document')
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const saveHistory = useCallback((entry) => {
    setHistory(prev => {
      const next = [...prev, { ...entry, timestamp: new Date().toISOString() }]
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* storage unavailable: history is optional */ }
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    if (window.confirm('Clear all legal review history? This cannot be undone.')) {
      setHistory([])
      try { localStorage.removeItem(HISTORY_KEY) } catch { /* storage unavailable: history is optional */ }
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-mark">K8</div>
            <div className="brand-text">
              <span className="brand-title">Legal Agent</span>
              <span className="brand-sub">Kato.8 Studios — Internal Use Only</span>
            </div>
          </div>
          <div className="header-status">
            <span className="status-dot" />
            <span>AI Review System</span>
          </div>
        </div>
      </header>

      <nav className="tab-nav" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'history' && history.length > 0 && (
              <span className="tab-badge">{history.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'document' && <DocumentReviewTab onSaveHistory={saveHistory} />}
        {activeTab === 'compliance' && <ComplianceCheckTab onSaveHistory={saveHistory} />}
        {activeTab === 'operations' && <OperationsReviewTab onSaveHistory={saveHistory} />}
        {activeTab === 'history' && <HistoryTab history={history} onClear={clearHistory} />}
      </main>

      <footer className="app-footer">
        <span>Kato.8 Studios Legal Agent v1.0</span>
        <span>{STUDIO.location}</span>
        <span>Internal use only — not for distribution</span>
      </footer>
    </div>
  )
}
