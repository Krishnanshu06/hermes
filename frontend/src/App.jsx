import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Calendar as CalendarIcon,
  Mail,
  Sparkles,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Search,
  KeyRound,
  Plus,
  Briefcase,
  Trophy,
  GraduationCap,
  Bell,
  Trash2,
  X,
  ExternalLink,
  Check,
  Filter,
  UserCheck
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Categorization Definitions & Color Codes
export const CATEGORIES = [
  { id: 'all', label: 'All Categories', color: '#94a3b8' },
  { id: 'Internship/Job', label: 'Internships & Jobs', color: '#38bdf8', icon: Briefcase },
  { id: 'Competition/Hackathon', label: 'Competitions & Hackathons', color: '#f59e0b', icon: Trophy },
  { id: 'Event/Academic', label: 'School & Academic', color: '#a855f7', icon: GraduationCap },
  { id: 'Action Required', label: 'Action Required', color: '#f43f5e', icon: AlertTriangle },
  { id: 'Promotion/Spam', label: 'Promotions & Trash', color: '#64748b', icon: Trash2 },
  { id: 'FYI/General', label: 'FYI & General', color: '#10b981', icon: Bell }
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('hermes_token') || '');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [accessCode, setAccessCode] = useState(localStorage.getItem('hermes_access_code') || 'kekuCode');
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false);

  // Data states
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  
  // Modals & Panels
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'inbox'
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [dayModalDate, setDayModalDate] = useState(null);

  // Save access code to local storage
  const saveCode = (code) => {
    setAccessCode(code);
    localStorage.setItem('hermes_access_code', code);
  };

  // Handle OAuth Token from redirect query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const emailParam = params.get('email');
    if (urlToken) {
      setToken(urlToken);
      localStorage.setItem('hermes_token', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/accounts`);
      setAccounts(res.data.accounts || []);
    } catch (e) {
      console.error('Failed to load accounts', e);
    }
  };

  const fetchEmails = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/emails/`, {
        params: {
          account_email: selectedAccount,
          category: selectedCategory,
          q: searchQuery,
          limit: 150
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmails(res.data.emails || []);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const syncInbox = async () => {
    setSyncing(true);
    try {
      await axios.post(`${API_BASE}/emails/sync`, {
        account_email: selectedAccount,
        max_results: 30
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchEmails();
      await fetchAccounts();
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const analyzeSingleEmail = async (id) => {
    if (!accessCode) {
      setShowAccessCodeModal(true);
      return;
    }
    setAnalyzingId(id);
    try {
      const res = await axios.post(`${API_BASE}/emails/${id}/analyze`, {
        access_code: accessCode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmails(prev => prev.map(e => (e.id === id ? res.data.email : e)));
      if (selectedEmail?.id === id) {
        setSelectedEmail(res.data.email);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        alert("Access Code denied! Please provide the valid access code 'kekuCode'.");
        setShowAccessCodeModal(true);
      } else {
        alert('Analysis error: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setAnalyzingId(null);
    }
  };

  const batchOrganize = async () => {
    if (!accessCode) {
      setShowAccessCodeModal(true);
      return;
    }
    setBatchAnalyzing(true);
    try {
      const res = await axios.post(`${API_BASE}/emails/batch-organize?limit=15&account_email=${selectedAccount}`, {
        access_code: accessCode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message || 'Analyzed successfully!');
      await fetchEmails();
    } catch (err) {
      if (err.response?.status === 403) {
        alert("Access Code denied! Please provide 'kekuCode'.");
        setShowAccessCodeModal(true);
      } else {
        alert('Batch organize failed: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setBatchAnalyzing(false);
    }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/login`);
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      alert('Login error: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hermes_token');
    setToken('');
    setEmails([]);
  };

  useEffect(() => {
    if (token) {
      fetchAccounts();
      fetchEmails();
    }
  }, [token, selectedAccount, selectedCategory]);

  // Calendar calculations
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const isSameDay = (d1, d2) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Group emails by calendar event_date or received date
  const eventsByDate = useMemo(() => {
    const map = {};
    emails.forEach(email => {
      let targetDateStr = email.event_date;
      if (!targetDateStr && email.date_str) {
        const parsed = new Date(email.date_str);
        if (!isNaN(parsed.getTime())) {
          targetDateStr = parsed.toISOString().split('T')[0];
        }
      }
      if (targetDateStr) {
        if (!map[targetDateStr]) map[targetDateStr] = [];
        map[targetDateStr].push(email);
      }
    });
    return map;
  }, [emails]);

  const getCategoryColor = (cat) => {
    const found = CATEGORIES.find(c => c.id === cat);
    return found ? found.color : '#94a3b8';
  };

  // Login view
  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.loginIconWrapper}>
            <Sparkles size={36} color="#c084fc" />
          </div>
          <h1 style={styles.loginTitle}>Hermes</h1>
          <p style={styles.loginSubtitle}>
            Your cozy AI-powered multi-account email organizer. Effortlessly filter school, jobs, competitions, and actions onto an intelligent calendar.
          </p>
          <button onClick={handleLogin} style={styles.primaryBtn}>
            <Mail size={18} /> Connect Gmail Account
          </button>
          <div style={styles.loginFooterBadge}>
            <KeyRound size={14} color="#a855f7" /> Protected by gatekeeper code: <strong>kekuCode</strong>
          </div>
        </div>
      </div>
    );
  }

  const selectedDayEmails = dayModalDate ? (eventsByDate[dayModalDate] || []) : [];

  return (
    <div style={styles.appWrapper}>
      {/* Top Navbar */}
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <div style={styles.logoPill}>
            <Sparkles size={18} color="#c084fc" />
          </div>
          <span style={styles.brandName}>Hermes</span>
        </div>

        {/* Global Search Bar */}
        <div style={styles.searchBar}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search emails, companies (e.g. Google, Tesla), competitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchEmails()}
            style={styles.searchInput}
          />
        </div>

        {/* Account Selector (Multi-account integration) */}
        <div style={styles.navRight}>
          <div style={styles.accountSelectorBox}>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={styles.accountSelect}
            >
              <option value="all">All Inboxes ({accounts.length} connected)</option>
              {accounts.map(acc => (
                <option key={acc.email} value={acc.email}>{acc.email}</option>
              ))}
            </select>
            <button onClick={handleLogin} style={styles.addAccountBtn} title="Connect another account (e.g. school or personal)">
              <Plus size={14} /> Add Account
            </button>
          </div>

          <button
            onClick={() => setShowAccessCodeModal(true)}
            style={styles.codePillBtn}
            title="Set AI Access Code"
          >
            <KeyRound size={15} color="#c084fc" />
            <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>Code: {accessCode ? '••••' : 'Set'}</span>
          </button>

          <button onClick={syncInbox} disabled={syncing} style={styles.iconBtn} title="Sync new emails to local DB">
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
          </button>

          <button onClick={handleLogout} style={styles.iconBtn} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Category Filter Pills & Mode Switcher */}
      <div style={styles.filterBar}>
        <div style={styles.categoryPills}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  ...styles.catPill,
                  backgroundColor: isActive ? `${cat.color}22` : 'rgba(255, 255, 255, 0.03)',
                  borderColor: isActive ? cat.color : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#fff' : '#94a3b8'
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cat.color }} />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={batchOrganize}
            disabled={batchAnalyzing}
            style={styles.aiOrganizeBtn}
          >
            <Sparkles size={15} className={batchAnalyzing ? 'spin' : ''} />
            {batchAnalyzing ? 'Organizing with Gemini...' : 'Organize with Gemini'}
          </button>

          <div style={styles.viewToggleGroup}>
            <button
              onClick={() => setActiveTab('calendar')}
              style={activeTab === 'calendar' ? styles.viewBtnActive : styles.viewBtn}
            >
              <CalendarIcon size={15} /> Calendar
            </button>
            <button
              onClick={() => setActiveTab('inbox')}
              style={activeTab === 'inbox' ? styles.viewBtnActive : styles.viewBtn}
            >
              <Mail size={15} /> Messages ({emails.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main style={styles.mainContainer}>
        {activeTab === 'calendar' ? (
          <div style={styles.calendarCard}>
            {/* Calendar Controls */}
            <div style={styles.monthHeader}>
              <div>
                <h2 style={styles.monthTitle}>
                  {monthNames[month]} <span style={{ color: '#94a3b8', fontWeight: 400 }}>{year}</span>
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '2px' }}>
                  Showing {emails.length} cached emails organized across personal & school inboxes
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={prevMonth} style={styles.calNavBtn}><ChevronLeft size={18} /></button>
                <button onClick={() => setCurrentMonthDate(new Date())} style={styles.calTodayBtn}>Today</button>
                <button onClick={nextMonth} style={styles.calNavBtn}><ChevronRight size={18} /></button>
              </div>
            </div>

            {/* Weekdays */}
            <div style={styles.weekDaysGrid}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={styles.weekDayHeader}>{d}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div style={styles.daysGrid}>
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} style={styles.emptyDayCell} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const cellDate = new Date(year, month, dayNum);
                const isToday = isSameDay(cellDate, new Date());
                const dayEmails = eventsByDate[dateKey] || [];

                return (
                  <div
                    key={dayNum}
                    onClick={() => setDayModalDate(dateKey)}
                    style={{
                      ...styles.dayCell,
                      ...(isToday ? styles.dayCellToday : {})
                    }}
                  >
                    <div style={styles.dayNumRow}>
                      <span style={styles.dayNum}>{dayNum}</span>
                      {dayEmails.length > 0 && (
                        <span style={styles.dayBadgeCount}>{dayEmails.length}</span>
                      )}
                    </div>

                    {/* Email / Event tiles with category color codes */}
                    <div style={styles.dayEventsList}>
                      {dayEmails.slice(0, 3).map((email, idx) => {
                        const col = getCategoryColor(email.category);
                        return (
                          <div
                            key={idx}
                            style={{
                              ...styles.dayEventPill,
                              borderLeftColor: col,
                              backgroundColor: `${col}18`
                            }}
                          >
                            <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 500 }}>
                              {email.subject || 'No Subject'}
                            </span>
                          </div>
                        );
                      })}
                      {dayEmails.length > 3 && (
                        <span style={styles.moreItemsText}>+{dayEmails.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Inbox View with side-by-side reading */
          <div style={styles.inboxLayout}>
            <div style={styles.inboxListCol}>
              <div style={styles.inboxColHead}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Indexed Messages ({emails.length})</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Cached in SQLite</span>
              </div>
              <div style={styles.inboxScrollList}>
                {emails.map(email => {
                  const isSelected = selectedEmail?.id === email.id;
                  const catCol = getCategoryColor(email.category);
                  return (
                    <div
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      style={{
                        ...styles.emailListItem,
                        ...(isSelected ? styles.emailListItemActive : {})
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                          {email.sender ? email.sender.split('<')[0] : 'Unknown'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {email.date_str ? new Date(email.date_str).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#cbd5e1', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {email.subject}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {email.category && (
                          <span style={{ ...styles.categoryBadge, backgroundColor: `${catCol}20`, color: catCol }}>
                            {email.category}
                          </span>
                        )}
                        <span style={styles.accountBadge}>
                          {email.account_email.split('@')[0]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Email Detail Panel */}
            <div style={styles.inboxDetailCol}>
              {selectedEmail ? (
                <div style={styles.emailDetailCard}>
                  <div style={styles.emailDetailHead}>
                    <div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>{selectedEmail.subject}</h2>
                      <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: 4 }}>
                        From: <span style={{ color: '#e2e8f0' }}>{selectedEmail.sender}</span> &bull; {selectedEmail.account_email}
                      </div>
                    </div>
                    <div>
                      {!selectedEmail.analyzed ? (
                        <button
                          onClick={() => analyzeSingleEmail(selectedEmail.id)}
                          disabled={analyzingId === selectedEmail.id}
                          style={styles.aiOrganizeBtn}
                        >
                          <Sparkles size={14} className={analyzingId === selectedEmail.id ? 'spin' : ''} />
                          {analyzingId === selectedEmail.id ? 'Analyzing...' : 'Analyze with Gemini'}
                        </button>
                      ) : (
                        <span style={styles.analyzedPill}>
                          <CheckCircle2 size={14} /> Analyzed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gemini Summary Box */}
                  {selectedEmail.analyzed && (
                    <div style={styles.aiInsightBox}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#c084fc', fontSize: '0.85rem' }}>
                          <Sparkles size={15} /> Executive Summary
                        </span>
                        <span style={{ ...styles.categoryBadge, backgroundColor: `${getCategoryColor(selectedEmail.category)}22`, color: getCategoryColor(selectedEmail.category) }}>
                          {selectedEmail.category} &bull; {selectedEmail.priority} Priority
                        </span>
                      </div>
                      <p style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                        {selectedEmail.summary}
                      </p>
                      {selectedEmail.event_date && (
                        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#38bdf8' }}>
                          📅 Scheduled Deadline/Event: <strong>{selectedEmail.event_date}</strong>
                        </div>
                      )}
                      {selectedEmail.suggested_reply && (
                        <div style={styles.suggestedReplyBox}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Suggested Reply:</span>
                          <p style={{ fontStyle: 'italic', color: '#cbd5e1', fontSize: '0.82rem', marginTop: 2 }}>
                            {selectedEmail.suggested_reply}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={styles.emailBodyPreview}>
                    {selectedEmail.body || selectedEmail.snippet || '(No content available)'}
                  </div>
                </div>
              ) : (
                <div style={styles.emptyDetail}>
                  <Mail size={48} color="#475569" />
                  <p style={{ color: '#94a3b8', marginTop: 12 }}>Select an email from the left to read and analyze</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Date Tile Event Popup Modal */}
      {dayModalDate && (
        <div style={styles.modalBackdrop} onClick={() => setDayModalDate(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon size={18} color="#c084fc" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  Events for {dayModalDate}
                </h3>
              </div>
              <button onClick={() => setDayModalDate(null)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {selectedDayEmails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
                  No emails or deadlines scheduled on this date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedDayEmails.map((email) => {
                    const col = getCategoryColor(email.category);
                    return (
                      <div key={email.id} style={{ ...styles.modalEmailCard, borderLeftColor: col }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ ...styles.categoryBadge, backgroundColor: `${col}22`, color: col }}>
                            {email.category || 'General'}
                          </span>
                          <span style={styles.accountBadge}>{email.account_email}</span>
                        </div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', margin: '6px 0 4px' }}>
                          {email.subject}
                        </h4>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 6 }}>
                          From: {email.sender}
                        </div>
                        {email.summary && (
                          <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                            {email.summary}
                          </p>
                        )}
                        {!email.analyzed && (
                          <button
                            onClick={() => analyzeSingleEmail(email.id)}
                            style={{ ...styles.aiOrganizeBtn, marginTop: 8, alignSelf: 'flex-start' }}
                          >
                            <Sparkles size={13} /> Analyze with Gemini
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Access Code Modal */}
      {showAccessCodeModal && (
        <div style={styles.modalBackdrop} onClick={() => setShowAccessCodeModal(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={18} color="#c084fc" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  Hermes AI Access Code
                </h3>
              </div>
              <button onClick={() => setShowAccessCodeModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                AI features (categorization, task extraction, summary) require the private authorization code to prevent unauthorized LLM consumption.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Enter code (default: kekuCode)"
                  value={accessCode}
                  onChange={(e) => saveCode(e.target.value)}
                  style={styles.codeInput}
                />
                <button
                  onClick={() => setShowAccessCodeModal(false)}
                  style={styles.primaryBtn}
                >
                  Save Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Cozy, soft, modern dark styles
const styles = {
  appWrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--text-main)'
  },
  loginContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  loginCard: {
    maxWidth: '460px',
    width: '100%',
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '44px 36px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-cozy)'
  },
  loginIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '20px',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: 'var(--shadow-glow)'
  },
  loginTitle: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '8px',
    color: '#fff'
  },
  loginSubtitle: {
    color: 'var(--text-muted)',
    fontSize: '0.92rem',
    lineHeight: 1.6,
    marginBottom: '28px'
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 22px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: '#a855f7',
    color: '#fff',
    fontSize: '0.92rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 16px rgba(168, 85, 247, 0.35)'
  },
  loginFooterBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '24px',
    fontSize: '0.78rem',
    color: 'var(--text-muted)'
  },

  // Navbar
  nav: {
    padding: '14px 28px',
    borderBottom: '1px solid var(--card-border)',
    backgroundColor: 'rgba(10, 13, 20, 0.85)',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
    position: 'sticky',
    top: 0,
    zIndex: 50
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  logoPill: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandName: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#fff'
  },
  searchBar: {
    flex: 1,
    minWidth: '240px',
    maxWidth: '480px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    borderRadius: '999px',
    padding: '8px 16px'
  },
  searchInput: {
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '0.85rem',
    width: '100%'
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  accountSelectorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '4px 8px'
  },
  accountSelect: {
    background: 'transparent',
    border: 'none',
    color: '#cbd5e1',
    fontSize: '0.82rem',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '180px'
  },
  addAccountBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(168, 85, 247, 0.18)',
    border: 'none',
    borderRadius: '6px',
    color: '#c084fc',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '4px 8px',
    cursor: 'pointer'
  },
  codePillBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  iconBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },

  // Category Filter Bar
  filterBar: {
    padding: '12px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    flexWrap: 'wrap'
  },
  categoryPills: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap'
  },
  catPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '0.78rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  aiOrganizeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    borderRadius: '10px',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    border: '1px solid rgba(168, 85, 247, 0.35)',
    color: '#c084fc',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  viewToggleGroup: {
    display: 'flex',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    borderRadius: '10px',
    padding: '3px'
  },
  viewBtnActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    backgroundColor: '#a855f7',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: 'none',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer'
  },

  // Main Container
  mainContainer: {
    flex: 1,
    padding: '20px 28px',
    maxWidth: '1440px',
    margin: '0 auto',
    width: '100%'
  },
  calendarCard: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    boxShadow: 'var(--shadow-cozy)'
  },
  monthHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  monthTitle: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#fff'
  },
  calNavBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--card-border)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  calTodayBtn: {
    padding: '0 12px',
    height: '34px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--card-border)',
    color: '#fff',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  weekDaysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    textAlign: 'center',
    marginBottom: '10px'
  },
  weekDayHeader: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px'
  },
  emptyDayCell: {
    minHeight: '100px',
    borderRadius: 'var(--radius-sm)'
  },
  dayCell: {
    minHeight: '100px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    padding: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column'
  },
  dayCellToday: {
    borderColor: 'rgba(168, 85, 247, 0.6)',
    backgroundColor: 'rgba(168, 85, 247, 0.05)'
  },
  dayNumRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  dayNum: {
    fontSize: '0.82rem',
    fontWeight: 500,
    color: '#94a3b8'
  },
  dayBadgeCount: {
    fontSize: '0.68rem',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '999px',
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    color: '#d8b4fe'
  },
  dayEventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflow: 'hidden'
  },
  dayEventPill: {
    padding: '3px 6px',
    borderRadius: '4px',
    borderLeft: '2px solid',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  moreItemsText: {
    fontSize: '0.68rem',
    color: '#94a3b8',
    paddingLeft: '4px'
  },

  // Inbox Split
  inboxLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 420px) 1fr',
    gap: '20px',
    minHeight: '650px'
  },
  inboxListCol: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  inboxColHead: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--card-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  inboxScrollList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px'
  },
  emailListItem: {
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid transparent',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  emailListItemActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderColor: 'rgba(168, 85, 247, 0.4)'
  },
  categoryBadge: {
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px'
  },
  accountBadge: {
    fontSize: '0.68rem',
    color: '#94a3b8',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  inboxDetailCol: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column'
  },
  emailDetailCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  emailDetailHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--card-border)'
  },
  analyzedPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: '6px 12px',
    borderRadius: '999px'
  },
  aiInsightBox: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: 'var(--radius-md)',
    padding: '16px'
  },
  suggestedReplyBox: {
    marginTop: '12px',
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  emailBodyPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    fontSize: '0.88rem',
    lineHeight: 1.6,
    color: '#cbd5e1',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  emptyDetail: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Modal
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '16px'
  },
  modalCard: {
    backgroundColor: '#121620',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    maxWidth: '550px',
    width: '100%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-cozy)'
  },
  modalHead: {
    padding: '18px 24px',
    borderBottom: '1px solid var(--card-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer'
  },
  modalBody: {
    padding: '20px 24px',
    overflowY: 'auto'
  },
  modalEmailCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--card-border)',
    borderLeft: '4px solid',
    borderRadius: 'var(--radius-md)',
    padding: '14px'
  },
  codeInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    color: '#fff',
    outline: 'none',
    fontSize: '0.9rem'
  }
};
