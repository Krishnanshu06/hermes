import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Calendar as CalendarIcon,
  Mail,
  Sparkles,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Plus,
  Briefcase,
  Trophy,
  GraduationCap,
  Bell,
  Trash2,
  X,
  ExternalLink,
  AlertTriangle,
  ArrowUpRight,
  Inbox,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const CATEGORIES = [
  { id: 'all', label: 'All Categories', color: '#a1a1aa' },
  { id: 'Internship/Job', label: 'Internships & Jobs', color: '#60a5fa', icon: Briefcase },
  { id: 'Competition/Hackathon', label: 'Competitions & Hackathons', color: '#fbbf24', icon: Trophy },
  { id: 'Event/Academic', label: 'School & Academic', color: '#c084fc', icon: GraduationCap },
  { id: 'Action Required', label: 'Action Required', color: '#f87171', icon: AlertTriangle },
  { id: 'Promotion/Spam', label: 'Promotions & Trash', color: '#52525b', icon: Trash2 },
  { id: 'FYI/General', label: 'FYI & General', color: '#34d399', icon: Bell }
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('hermes_token') || '');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // UI state: Collapsible Sidebar & Full-screen calendar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data states
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Calendar & Popups
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [dayModalDate, setDayModalDate] = useState(null);
  const [emailModal, setEmailModal] = useState(null); // Full email view popup

  // Handle OAuth Token on redirect
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
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/emails/`, {
        params: {
          account_email: selectedAccount,
          category: selectedCategory,
          q: searchQuery,
          limit: 300
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setEmails(res.data.emails || []);
    } catch (err) {
      console.error('Error fetching cached emails', err);
    } finally {
      setLoading(false);
    }
  };

  const syncLatestMails = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await axios.post(`${API_BASE}/emails/sync`, {
        account_email: selectedAccount,
        max_results: 25
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setSyncMessage(res.data.message || 'Synced successfully');
      await fetchEmails();
      await fetchAccounts();
      setTimeout(() => setSyncMessage(''), 4000);
    } catch (err) {
      alert('Sync error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/login`);
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      alert('Login error: ' + (err.response?.data?.detail || err.message));
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchEmails();
  }, [selectedAccount, selectedCategory]);

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
    return found ? found.color : '#71717a';
  };

  const getGmailWebLink = (email) => {
    return `https://mail.google.com/mail/u/${encodeURIComponent(email.account_email)}/#all/${email.thread_id || email.id}`;
  };

  const selectedDayEmails = dayModalDate ? (eventsByDate[dayModalDate] || []) : [];

  return (
    <div style={styles.appShell}>
      {/* Collapsible Clean Monochrome Sidebar */}
      <aside style={{ ...styles.sidebar, width: sidebarOpen ? '320px' : '0px', minWidth: sidebarOpen ? '320px' : '0px' }}>
        <div style={styles.sidebarInner}>
          {/* Logo & Brand Header */}
          <div style={styles.sidebarHead}>
            <div style={styles.brandTitle}>
              <span style={styles.brandSymbol}>H</span>
              <span style={styles.brandName}>Hermes</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              style={styles.ghostIconBtn}
              title="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Sync Trigger */}
          <div style={styles.syncBox}>
            <button
              onClick={syncLatestMails}
              disabled={syncing}
              style={styles.syncBtn}
            >
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Fetching...' : 'Sync Latest Mails'}</span>
            </button>
            {syncMessage && <span style={styles.syncMiniMessage}>{syncMessage}</span>}
          </div>

          {/* Accounts section */}
          <div style={styles.sideSection}>
            <div style={styles.sectionTitleRow}>
              <span style={styles.sectionTitle}>Inboxes</span>
              <button onClick={handleConnectGmail} style={styles.addBtn} title="Add email">
                <Plus size={13} /> Add
              </button>
            </div>
            <div style={styles.accountsList}>
              <button
                onClick={() => setSelectedAccount('all')}
                style={{
                  ...styles.accountItem,
                  backgroundColor: selectedAccount === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: selectedAccount === 'all' ? '#fff' : '#a1a1aa'
                }}
              >
                <div style={styles.accountDot} />
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>All Connected Accounts</span>
              </button>
              {accounts.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => setSelectedAccount(acc.email)}
                  style={{
                    ...styles.accountItem,
                    backgroundColor: selectedAccount === acc.email ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: selectedAccount === acc.email ? '#fff' : '#a1a1aa'
                  }}
                >
                  <div style={styles.accountDot} />
                  <span style={styles.accountItemText} title={acc.email}>{acc.email}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Categories section */}
          <div style={styles.sideSection}>
            <div style={styles.sectionTitleRow}>
              <span style={styles.sectionTitle}>Categories</span>
            </div>
            <div style={styles.categoriesList}>
              {CATEGORIES.map(cat => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      ...styles.catItem,
                      backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: isActive ? '#fff' : '#a1a1aa'
                    }}
                  >
                    <span style={{ ...styles.catIndicator, backgroundColor: cat.color }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Indexed Feed */}
          <div style={{ ...styles.sideSection, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={styles.sectionTitleRow}>
              <span style={styles.sectionTitle}>Recent Indexed ({emails.length})</span>
            </div>
            <div style={styles.recentScrollArea}>
              {emails.slice(0, 15).map(e => (
                <div
                  key={e.id}
                  onClick={() => setEmailModal(e)}
                  style={styles.recentItem}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{e.sender ? e.sender.split('<')[0] : 'Unknown'}</span>
                    <span style={{ ...styles.miniBadge, backgroundColor: `${getCategoryColor(e.category)}18`, color: getCategoryColor(e.category) }}>
                      {e.category || 'General'}
                    </span>
                  </div>
                  <div style={styles.recentSubject} title={e.subject}>{e.subject}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Full-Screen Main Calendar Area */}
      <div style={styles.mainArea}>
        {/* Top Control Bar */}
        <header style={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={styles.ghostIconBtn}
                title="Open sidebar"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <div style={styles.searchBox}>
              <Search size={15} color="#71717a" />
              <input
                type="text"
                placeholder="Search across all emails, recruiters, topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchEmails()}
                style={styles.searchInput}
              />
            </div>
          </div>

          {/* Month Controls */}
          <div style={styles.monthControls}>
            <button onClick={prevMonth} style={styles.calNavBtn}><ChevronLeft size={16} /></button>
            <span style={styles.monthTitle}>
              {monthNames[month]} <span style={{ color: '#71717a', fontWeight: 400 }}>{year}</span>
            </span>
            <button onClick={() => setCurrentMonthDate(new Date())} style={styles.calTodayBtn}>Today</button>
            <button onClick={nextMonth} style={styles.calNavBtn}><ChevronRight size={16} /></button>
          </div>
        </header>

        {/* Full-Screen Grid Container */}
        <div style={styles.calendarFullGrid}>
          {/* Weekday Row */}
          <div style={styles.weekDaysGrid}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
              <div key={d} style={styles.weekDayHeader}>{d}</div>
            ))}
          </div>

          {/* Calendar Cells */}
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
                    <span style={isToday ? styles.dayNumToday : styles.dayNum}>{dayNum}</span>
                    {dayEmails.length > 0 && (
                      <span style={styles.dayBadgeCount}>{dayEmails.length}</span>
                    )}
                  </div>

                  {/* Clean Monochrome Tile with subtle category color bar */}
                  <div style={styles.dayEventsList}>
                    {dayEmails.slice(0, 4).map((email, idx) => {
                      const col = getCategoryColor(email.category);
                      return (
                        <div
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailModal(email);
                          }}
                          style={{
                            ...styles.dayEventPill,
                            borderLeftColor: col
                          }}
                          title={`${email.subject} (Click to read)`}
                        >
                          <span style={styles.dayEventTitle}>
                            {email.subject || 'No Subject'}
                          </span>
                        </div>
                      );
                    })}
                    {dayEmails.length > 4 && (
                      <span style={styles.moreItemsText}>+{dayEmails.length - 4} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Date Tile Event Popup Modal */}
      {dayModalDate && (
        <div style={styles.modalBackdrop} onClick={() => setDayModalDate(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon size={16} color="#fafafa" />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fafafa' }}>
                  Emails for {dayModalDate}
                </h3>
              </div>
              <button onClick={() => setDayModalDate(null)} style={styles.closeBtn}>
                <X size={16} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {selectedDayEmails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#71717a', fontSize: '0.85rem' }}>
                  No emails or deadlines scheduled on this date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedDayEmails.map((email) => {
                    const col = getCategoryColor(email.category);
                    return (
                      <div
                        key={email.id}
                        style={{ ...styles.modalEmailCard, borderLeftColor: col }}
                        onClick={() => {
                          setDayModalDate(null);
                          setEmailModal(email);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ ...styles.categoryBadge, backgroundColor: `${col}18`, color: col }}>
                            {email.category || 'General'}
                          </span>
                          <span style={styles.accountBadge}>{email.account_email}</span>
                        </div>
                        <h4 style={styles.modalEmailSubject}>
                          {email.subject}
                          <ArrowUpRight size={13} color="#71717a" />
                        </h4>
                        <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: 4 }}>
                          From: {email.sender}
                        </div>
                        {email.summary && (
                          <p style={{ fontSize: '0.8rem', color: '#d4d4d8', lineHeight: 1.4 }}>
                            {email.summary}
                          </p>
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

      {/* Full Content Email Modal Popup */}
      {emailModal && (
        <div style={styles.modalBackdrop} onClick={() => setEmailModal(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '780px', maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fafafa', lineHeight: 1.3 }}>
                  {emailModal.subject}
                </h3>
                <div style={{ color: '#71717a', fontSize: '0.78rem', marginTop: 4 }}>
                  From: <span style={{ color: '#d4d4d8' }}>{emailModal.sender}</span> &bull; {emailModal.account_email} &bull; {emailModal.date_str}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={getGmailWebLink(emailModal)}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.openGmailBtn}
                >
                  <ExternalLink size={13} /> Open in Gmail
                </a>
                <button onClick={() => setEmailModal(null)} style={styles.closeBtn}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ ...styles.modalBody, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Executive Summary Card */}
              {emailModal.summary && (
                <div style={styles.aiInsightBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#fafafa', fontSize: '0.8rem' }}>
                      <Sparkles size={13} /> Executive Summary
                    </span>
                    <span style={{ ...styles.categoryBadge, backgroundColor: `${getCategoryColor(emailModal.category)}18`, color: getCategoryColor(emailModal.category) }}>
                      {emailModal.category} &bull; {emailModal.priority || 'Medium'} Priority
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#d4d4d8', lineHeight: 1.5 }}>
                    {emailModal.summary}
                  </p>
                </div>
              )}

              {/* Entire Content Preview */}
              <div style={styles.emailBodyPreview}>
                {emailModal.body || emailModal.snippet || '(No content available)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Clean Monochrome Black/White/Grey Minimalist Design Styles
const styles = {
  appShell: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    backgroundColor: 'var(--bg-primary)',
    overflow: 'hidden'
  },
  sidebar: {
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--card-border)',
    transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20
  },
  sidebarInner: {
    width: '320px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px'
  },
  sidebarHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '14px',
    borderBottom: '1px solid var(--card-border)'
  },
  brandTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  brandSymbol: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#000',
    fontWeight: 800,
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandName: {
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#fff'
  },
  ghostIconBtn: {
    background: 'none',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s ease'
  },
  syncBox: {
    padding: '12px 0',
    borderBottom: '1px solid var(--card-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  syncBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: '#fff',
    color: '#000',
    fontSize: '0.8rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(255, 255, 255, 0.1)'
  },
  syncMiniMessage: {
    fontSize: '0.72rem',
    color: '#34d399',
    textAlign: 'center'
  },
  sideSection: {
    padding: '14px 0',
    borderBottom: '1px solid var(--card-border)'
  },
  sectionTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  sectionTitle: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.06em'
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: '#d4d4d8',
    fontSize: '0.72rem',
    fontWeight: 500,
    cursor: 'pointer'
  },
  accountsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  accountItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left'
  },
  accountDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#71717a'
  },
  accountItemText: {
    fontSize: '0.78rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  categoriesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  catItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left'
  },
  catIndicator: {
    width: '7px',
    height: '7px',
    borderRadius: '2px'
  },
  recentScrollArea: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  recentItem: {
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)',
    cursor: 'pointer'
  },
  recentSubject: {
    fontSize: '0.78rem',
    color: '#d4d4d8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  miniBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '3px'
  },

  // Main Canvas
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  },
  topBar: {
    padding: '12px 20px',
    borderBottom: '1px solid var(--card-border)',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px'
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 12px',
    width: '340px'
  },
  searchInput: {
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '0.82rem',
    width: '100%'
  },
  monthControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  monthTitle: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#fff',
    minWidth: '150px',
    textAlign: 'center'
  },
  calNavBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--card-border)',
    color: '#d4d4d8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  calTodayBtn: {
    padding: '0 10px',
    height: '30px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--card-border)',
    color: '#d4d4d8',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer'
  },

  // Full-Screen Calendar Grid
  calendarFullGrid: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100% - 55px)',
    padding: '0'
  },
  weekDaysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    textAlign: 'center',
    borderBottom: '1px solid var(--card-border)',
    backgroundColor: 'var(--bg-secondary)'
  },
  weekDayHeader: {
    padding: '8px 0',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#71717a',
    letterSpacing: '0.08em'
  },
  daysGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridAutoRows: '1fr',
    backgroundColor: 'var(--card-border)',
    gap: '1px',
    overflowY: 'auto'
  },
  emptyDayCell: {
    backgroundColor: 'var(--bg-primary)'
  },
  dayCell: {
    backgroundColor: 'var(--bg-primary)',
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    transition: 'background-color 0.1s ease',
    overflow: 'hidden'
  },
  dayCellToday: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.3)'
  },
  dayNumRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  dayNum: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#71717a'
  },
  dayNumToday: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#fff'
  },
  dayBadgeCount: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#d4d4d8'
  },
  dayEventsList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    overflow: 'hidden'
  },
  dayEventPill: {
    padding: '3px 6px',
    borderRadius: '4px',
    borderLeft: '2px solid',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease'
  },
  dayEventTitle: {
    fontSize: '0.72rem',
    color: '#e4e4e7',
    fontWeight: 500
  },
  moreItemsText: {
    fontSize: '0.68rem',
    color: '#71717a',
    paddingLeft: '2px'
  },

  // Modals
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '16px'
  },
  modalCard: {
    backgroundColor: '#121215',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    maxWidth: '560px',
    width: '100%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)'
  },
  modalHead: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--card-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer'
  },
  modalBody: {
    padding: '18px 20px',
    overflowY: 'auto'
  },
  modalEmailCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)',
    borderLeft: '3px solid',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    cursor: 'pointer'
  },
  modalEmailSubject: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#fafafa',
    margin: '6px 0 2px',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  categoryBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: '4px'
  },
  accountBadge: {
    fontSize: '0.68rem',
    color: '#71717a',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  openGmailBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--card-border)',
    color: '#fafafa',
    fontSize: '0.75rem',
    fontWeight: 500,
    textDecoration: 'none'
  },
  aiInsightBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px'
  },
  emailBodyPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    color: '#d4d4d8',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '420px',
    overflowY: 'auto'
  }
};
