import { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, CheckCircle, RefreshCw, LogIn, AlertCircle, Sparkles, Inbox } from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('hermes_token') || '');
  const [userEmail, setUserEmail] = useState(localStorage.getItem('hermes_email') || '');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analyses, setAnalyses] = useState({});
  const [error, setError] = useState('');

  // Read URL query params after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const emailParam = params.get('email');
    if (urlToken) {
      setToken(urlToken);
      setUserEmail(emailParam || '');
      localStorage.setItem('hermes_token', urlToken);
      if (emailParam) localStorage.setItem('hermes_email', emailParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogin = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/login`);
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      setError('Failed to initiate Google OAuth: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hermes_token');
    localStorage.removeItem('hermes_email');
    setToken('');
    setUserEmail('');
    setEmails([]);
    setAnalyses({});
  };

  const fetchEmails = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/emails/?max_results=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmails(res.data.emails || []);
    } catch (err) {
      setError('Error fetching emails: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const analyzeEmail = async (id) => {
    setAnalyzingId(id);
    try {
      const res = await axios.post(`${API_BASE}/emails/${id}/analyze`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalyses(prev => ({ ...prev, [id]: res.data.analysis }));
    } catch (err) {
      alert('Analysis error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAnalyzingId(null);
    }
  };

  useEffect(() => {
    if (token) {
      fetchEmails();
    }
  }, [token]);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: '#111827' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles color="#6366f1" size={28} /> Hermes
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            AI-Powered Email Organizer & Task Extractor
          </p>
        </div>

        {token ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>{userEmail}</span>
            <button onClick={fetchEmails} disabled={loading} style={buttonStyle}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Fetching...' : 'Refresh'}
            </button>
            <button onClick={handleLogout} style={{ ...buttonStyle, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>
              Log out
            </button>
          </div>
        ) : (
          <button onClick={handleLogin} style={{ ...buttonStyle, backgroundColor: '#4f46e5', color: '#fff' }}>
            <LogIn size={16} /> Sign in with Google
          </button>
        )}
      </header>

      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Main Content */}
      {!token ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
          <Inbox size={48} color="#9ca3af" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Welcome to Hermes</h2>
          <p style={{ color: '#6b7280', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Connect your Gmail inbox to automatically categorize messages, extract action items, deadlines, and smart summaries using Gemini.
          </p>
          <button onClick={handleLogin} style={{ ...buttonStyle, backgroundColor: '#4f46e5', color: '#fff', fontSize: '1rem', padding: '0.75rem 1.5rem' }}>
            <LogIn size={18} /> Connect Gmail
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Recent Inbox ({emails.length})</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {emails.map((email) => {
              const analysis = analyses[email.id];
              const isAnalyzing = analyzingId === email.id;

              return (
                <div key={email.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>
                        {email.subject}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>
                        From: <strong>{email.from}</strong> | {email.date}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0.5rem 0 0' }}>
                        {email.snippet}
                      </p>
                    </div>

                    <div>
                      {!analysis ? (
                        <button
                          onClick={() => analyzeEmail(email.id)}
                          disabled={isAnalyzing}
                          style={{ ...buttonStyle, backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontSize: '0.8rem' }}
                        >
                          <Sparkles size={14} /> {isAnalyzing ? 'Analyzing...' : 'Organize with Gemini'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                          {analysis.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AI Analysis Result */}
                  {analysis && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: '#f8fafc', borderRadius: '6px', borderLeft: '4px solid #6366f1' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        Summary: <span style={{ fontWeight: 400 }}>{analysis.summary}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.5rem' }}>
                        Priority: <strong>{analysis.priority}</strong>
                      </div>

                      {analysis.tasks && analysis.tasks.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong style={{ fontSize: '0.8rem', color: '#1e293b' }}>Extracted Action Items:</strong>
                          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#334155' }}>
                            {analysis.tasks.map((task, idx) => (
                              <li key={idx}>
                                {task.title} {task.deadline && <span style={{ color: '#dc2626', fontWeight: 500 }}> (Due: {task.deadline})</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.suggested_reply && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#475569', backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <strong>Suggested Reply:</strong> {analysis.suggested_reply}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {emails.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                No emails loaded. Click "Refresh" to load your inbox.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.5rem 0.85rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease'
};
