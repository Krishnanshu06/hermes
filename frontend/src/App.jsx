import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import DOMPurify from 'dompurify';
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
  Trash2,
  X,
  ExternalLink,
  AlertTriangle,
  ArrowUpRight,
  Inbox,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Star,
  Bookmark,
  Check,
  Link,
  CalendarDays,
  ListChecks,
  Code
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('hermes_token') || '');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Categories & Settings
  const [categories, setCategories] = useState([]);
  const [retentionDays, setRetentionDays] = useState(30);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewHtmlMode, setViewHtmlMode] = useState(true); // Toggle HTML vs Plain Text in Email Viewer

  // Data states
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Calendar & Popups
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [dayModalDate, setDayModalDate] = useState(null);
  const [emailModal, setEmailModal] = useState(null);

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

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API_BASE}/emails/categories`);
      setCategories(res.data.categories || []);
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/emails/settings`);
      setRetentionDays(res.data.retention_days || 30);
    } catch (e) {
      console.error('Failed to load settings', e);
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

  const toggleStar = async (email, e) => {
    if (e) e.stopPropagation();
    const newStar = !email.is_starred;
    try {
      await axios.patch(`${API_BASE}/emails/${email.id}/flags`, { is_starred: newStar });
      setEmails(prev => prev.map(m => m.id === email.id ? { ...m, is_starred: newStar } : m));
      if (emailModal?.id === email.id) {
        setEmailModal(prev => ({ ...prev, is_starred: newStar }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleInterested = async (email, e) => {
    if (e) e.stopPropagation();
    const newInterested = !email.is_interested;
    try {
      await axios.patch(`${API_BASE}/emails/${email.id}/flags`, { is_interested: newInterested });
      setEmails(prev => prev.map(m => m.id === email.id ? { ...m, is_interested: newInterested } : m));
      if (emailModal?.id === email.id) {
        setEmailModal(prev => ({ ...prev, is_interested: newInterested }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const reassignCategory = async (emailId, newCategory) => {
    try {
      await axios.patch(`${API_BASE}/emails/${emailId}/flags`, { category: newCategory });
      setEmails(prev => prev.map(m => m.id === emailId ? { ...m, category: newCategory } : m));
      if (emailModal?.id === emailId) {
        setEmailModal(prev => ({ ...prev, category: newCategory }));
      }
    } catch (err) {
      alert('Failed to reassign category');
    }
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'single') {
        await axios.delete(`${API_BASE}/emails/${confirmDelete.id}`);
        setEmails(prev => prev.filter(m => m.id !== confirmDelete.id));
        if (emailModal?.id === confirmDelete.id) setEmailModal(null);
      } else if (confirmDelete.type === 'category') {
        await axios.delete(`${API_BASE}/emails/category/${encodeURIComponent(confirmDelete.name)}`);
        setEmails(prev => prev.filter(m => m.category !== confirmDelete.name));
      }
      setConfirmDelete(null);
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  const saveCategory = async () => {
    if (!categoryModal || !categoryModal.label.trim()) return;
    try {
      const id = categoryModal.id || categoryModal.label.trim();
      await axios.post(`${API_BASE}/emails/categories`, {
        id,
        label: categoryModal.label,
        description: categoryModal.description || '',
        color: categoryModal.color || '#a1a1aa'
      });
      await fetchCategories();
      setCategoryModal(null);
    } catch (err) {
      alert('Failed to save category');
    }
  };

  const saveRetentionSettings = async (days) => {
    try {
      const res = await axios.post(`${API_BASE}/emails/settings`, { retention_days: parseInt(days) });
      setRetentionDays(res.data.retention_days);
      if (res.data.purged_emails > 0) {
        alert(`Purged ${res.data.purged_emails} emails older than ${days} days.`);
        await fetchEmails();
      }
    } catch (err) {
      alert('Failed to update settings');
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchCategories();
    fetchSettings();
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

  // Group emails on the calendar:
  // IF email has an event_date (deadline / competition / event date), place tile on THAT day!
  // Otherwise fall back to received date
  const eventsByDate = useMemo(() => {
    const map = {};
    emails.forEach(email => {
      let targetDateStr = null;
      if (email.event_date && /^\d{4}-\d{2}-\d{2}$/.test(email.event_date.trim())) {
        targetDateStr = email.event_date.trim();
      } else if (email.date_str) {
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

  const getCategoryColor = (catId) => {
    const found = categories.find(c => c.id === catId);
    return found?.color || '#a1a1aa';
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
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowSettingsModal(true)} style={styles.ghostIconBtn} title="Settings">
                <Settings size={16} />
              </button>
              <button onClick={() => setSidebarOpen(false)} style={styles.ghostIconBtn} title="Collapse sidebar">
                <PanelLeftClose size={16} />
              </button>
            </div>
          </div>

          {/* Sync Trigger */}
          <div style={styles.syncBox}>
            <button onClick={syncLatestMails} disabled={syncing} style={styles.syncBtn}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Syncing & Analyzing...' : 'Sync Latest Mails'}</span>
            </button>
            {syncMessage && <span style={styles.syncMiniMessage}>{syncMessage}</span>}
          </div>

          {/* Starred & Interested Filters */}
          <div style={{ ...styles.sideSection, paddingBottom: 8 }}>
            <div style={styles.categoriesList}>
              <button
                onClick={() => setSelectedCategory('all')}
                style={{
                  ...styles.catItem,
                  backgroundColor: selectedCategory === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: selectedCategory === 'all' ? '#fff' : '#a1a1aa'
                }}
              >
                <div style={{ ...styles.catIndicator, backgroundColor: '#fff' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>All Messages</span>
              </button>

              <button
                onClick={() => setSelectedCategory('Starred')}
                style={{
                  ...styles.catItem,
                  backgroundColor: selectedCategory === 'Starred' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: selectedCategory === 'Starred' ? '#fff' : '#a1a1aa'
                }}
              >
                <Star size={13} color="#facc15" fill={selectedCategory === 'Starred' ? '#facc15' : 'transparent'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Starred (Saved Forever)</span>
              </button>

              <button
                onClick={() => setSelectedCategory('Interested')}
                style={{
                  ...styles.catItem,
                  backgroundColor: selectedCategory === 'Interested' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: selectedCategory === 'Interested' ? '#fff' : '#a1a1aa'
                }}
              >
                <Bookmark size={13} color="#38bdf8" fill={selectedCategory === 'Interested' ? '#38bdf8' : 'transparent'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Interested</span>
              </button>
            </div>
          </div>

          {/* Categories Section */}
          <div style={styles.sideSection}>
            <div style={styles.sectionTitleRow}>
              <span style={styles.sectionTitle}>Categories</span>
              <button onClick={() => setCategoryModal({ id: '', label: '', description: '', color: '#a1a1aa' })} style={styles.addBtn} title="Add new category">
                <Plus size={13} /> Add
              </button>
            </div>
            <div style={styles.categoriesList}>
              {categories.map(cat => {
                const isActive = selectedCategory === cat.id;
                return (
                  <div key={cat.id} style={styles.catRowHover}>
                    <button
                      onClick={() => setSelectedCategory(cat.id)}
                      style={{
                        ...styles.catItem,
                        flex: 1,
                        backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isActive ? '#fff' : '#a1a1aa'
                      }}
                    >
                      <span style={{ ...styles.catIndicator, backgroundColor: cat.color }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{cat.label}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ type: 'category', name: cat.id, label: cat.label });
                      }}
                      style={styles.catDeleteBtn}
                      title={`Delete all emails in ${cat.label}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inboxes */}
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
                <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>All Accounts</span>
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
        </div>
      </aside>

      {/* Main Full-Screen Calendar Canvas */}
      <div style={styles.mainArea}>
        {/* Top Control Bar */}
        <header style={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} style={styles.ghostIconBtn} title="Open sidebar">
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
          <div style={styles.weekDaysGrid}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
              <div key={d} style={styles.weekDayHeader}>{d}</div>
            ))}
          </div>

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

                  <div style={styles.dayEventsList}>
                    {dayEmails.slice(0, 4).map((email) => {
                      const col = getCategoryColor(email.category);
                      const isDeadlineTile = email.event_date === dateKey;
                      return (
                        <div
                          key={email.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailModal(email);
                          }}
                          style={{
                            ...styles.dayEventPill,
                            borderLeftColor: col,
                            backgroundColor: isDeadlineTile ? `${col}15` : 'rgba(255, 255, 255, 0.03)'
                          }}
                          title={`${email.subject}${isDeadlineTile ? ' (Deadline/Event Day)' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            {isDeadlineTile && <Clock size={10} color={col} />}
                            {email.is_starred && <Star size={10} color="#facc15" fill="#facc15" />}
                            {email.is_interested && <Bookmark size={10} color="#38bdf8" fill="#38bdf8" />}
                            <span style={styles.dayEventTitle}>{email.subject || 'No Subject'}</span>
                          </div>
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
                    const isDeadline = email.event_date === dayModalDate;
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
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ ...styles.categoryBadge, backgroundColor: `${col}18`, color: col }}>
                              {email.category || 'General'}
                            </span>
                            {isDeadline && (
                              <span style={{ ...styles.categoryBadge, backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171' }}>
                                Due / Event Day
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              onClick={(e) => toggleStar(email, e)}
                              style={styles.iconMiniBtn}
                              title={email.is_starred ? 'Starred' : 'Star (keep forever)'}
                            >
                              <Star size={13} color={email.is_starred ? '#facc15' : '#71717a'} fill={email.is_starred ? '#facc15' : 'transparent'} />
                            </button>
                            <button
                              onClick={(e) => toggleInterested(email, e)}
                              style={styles.iconMiniBtn}
                              title={email.is_interested ? 'Interested' : 'Mark as Interested'}
                            >
                              <Bookmark size={13} color={email.is_interested ? '#38bdf8' : '#71717a'} fill={email.is_interested ? '#38bdf8' : 'transparent'} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete({ type: 'single', id: email.id, name: email.subject });
                              }}
                              style={styles.iconMiniBtn}
                              title="Delete email"
                            >
                              <Trash2 size={13} color="#71717a" />
                            </button>
                          </div>
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

      {/* Full Content Email Modal Popup with Rich HTML Rendering & Extracted Details */}
      {emailModal && (
        <div style={styles.modalBackdrop} onClick={() => setEmailModal(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '840px', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
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
                <button
                  onClick={(e) => toggleStar(emailModal, e)}
                  style={{ ...styles.iconBtnAction, color: emailModal.is_starred ? '#facc15' : '#71717a' }}
                  title="Star (prevents 30-day auto deletion)"
                >
                  <Star size={15} fill={emailModal.is_starred ? '#facc15' : 'transparent'} />
                </button>
                <button
                  onClick={(e) => toggleInterested(emailModal, e)}
                  style={{ ...styles.iconBtnAction, color: emailModal.is_interested ? '#38bdf8' : '#71717a' }}
                  title="Mark as Interested"
                >
                  <Bookmark size={15} fill={emailModal.is_interested ? '#38bdf8' : 'transparent'} />
                </button>
                <button
                  onClick={() => setConfirmDelete({ type: 'single', id: emailModal.id, name: emailModal.subject })}
                  style={styles.iconBtnAction}
                  title="Delete this email"
                >
                  <Trash2 size={15} color="#f87171" />
                </button>
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
              {/* Category Reassignment Bar */}
              <div style={styles.reassignBar}>
                <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 500 }}>Category:</span>
                <select
                  value={emailModal.category || ''}
                  onChange={(e) => reassignCategory(emailModal.id, e.target.value)}
                  style={styles.categorySelect}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                {emailModal.event_date && (
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                    <CalendarDays size={13} /> Deadline / Event: <strong>{emailModal.event_date}</strong>
                  </span>
                )}
              </div>

              {/* Intelligence Summary & Highlights */}
              <div style={styles.aiInsightBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#fafafa', fontSize: '0.82rem' }}>
                    <Sparkles size={13} /> Executive Summary
                  </span>
                  <span style={{ ...styles.categoryBadge, backgroundColor: `${getCategoryColor(emailModal.category)}18`, color: getCategoryColor(emailModal.category) }}>
                    {emailModal.category} &bull; {emailModal.priority || 'Medium'} Priority
                  </span>
                </div>
                <p style={{ fontSize: '0.86rem', color: '#e4e4e7', lineHeight: 1.5, margin: 0 }}>
                  {emailModal.summary || emailModal.snippet}
                </p>

                {/* Key Dates & Deadlines in Clean Date: Format */}
                {((emailModal.important_dates && emailModal.important_dates.length > 0) || emailModal.event_date) && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={styles.subBlockLabel}>Dates & Deadlines</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                      {emailModal.event_date && (
                        <div style={styles.dateRowItem}>
                          <span style={styles.dateRowLabel}>Calendar Date:</span>
                          <span style={styles.dateRowVal}>{emailModal.event_date}</span>
                        </div>
                      )}
                      {(emailModal.important_dates || []).map((dt, idx) => (
                        <div key={idx} style={styles.dateRowItem}>
                          <span style={styles.dateRowLabel}>Date:</span>
                          <span style={styles.dateRowVal}>{dt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Important Links */}
                {emailModal.important_links && emailModal.important_links.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={styles.subBlockLabel}>Important Action Links</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {emailModal.important_links.map((linkObj, idx) => (
                        <a
                          key={idx}
                          href={linkObj.url}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.actionPillLink}
                        >
                          <Link size={12} /> {linkObj.label || linkObj.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Details */}
                {emailModal.key_details && emailModal.key_details.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={styles.subBlockLabel}>Key Details</span>
                    <ul style={styles.detailBullets}>
                      {emailModal.key_details.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Email Content Header with Render Mode Switcher */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.78rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase' }}>
                  Full Message Content
                </span>
                <button
                  onClick={() => setViewHtmlMode(!viewHtmlMode)}
                  style={styles.toggleRenderBtn}
                >
                  <Code size={13} /> {viewHtmlMode ? 'View Plain Text' : 'View Formatted HTML'}
                </button>
              </div>

              {/* Email Body Rendering */}
              <div style={styles.emailContentContainer}>
                {viewHtmlMode ? (
                  <div
                    style={styles.sanitizedHtmlWrapper}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(emailModal.body || emailModal.snippet || '(No content)')
                    }}
                  />
                ) : (
                  <pre style={styles.plainTextPre}>
                    {emailModal.plain_text || emailModal.body || emailModal.snippet || '(No content)'}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Delete Dialog */}
      {confirmDelete && (
        <div style={styles.modalBackdrop} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '420px', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={20} color="#f87171" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fafafa' }}>
                Confirm Deletion
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', lineHeight: 1.5, marginBottom: 20 }}>
              {confirmDelete.type === 'single'
                ? `Are you sure you want to delete "${confirmDelete.name}" from Hermes?`
                : `Are you sure you want to delete all emails under the "${confirmDelete.label || confirmDelete.name}" category?`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={executeDelete} style={styles.deleteConfirmBtn}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={styles.modalBackdrop} onClick={() => setShowSettingsModal(false)}>
          <div style={{ ...styles.modalCard, maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="#fafafa" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fafafa' }}>
                  Hermes Settings
                </h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} style={styles.closeBtn}>
                <X size={16} />
              </button>
            </div>

            <div style={{ ...styles.modalBody, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fafafa', marginBottom: 4 }}>
                  Auto-Delete Retention
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', marginBottom: 10 }}>
                  Automatically remove emails older than the specified days unless they are starred (0 to disable).
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                    style={styles.settingInput}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#d4d4d8' }}>days</span>
                  <button onClick={() => saveRetentionSettings(retentionDays)} style={styles.actionSaveBtn}>
                    Save Retention
                  </button>
                </div>
              </div>

              {/* Reset Database Section */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f87171', marginBottom: 4 }}>
                  Reset Stored Emails Database
                </h4>
                <p style={{ fontSize: '0.78rem', color: '#71717a', marginBottom: 10 }}>
                  Clears all indexed emails from the database so you can sync fresh and re-run updated AI intelligence.
                </p>
                <button
                  onClick={async () => {
                    if (!window.confirm("Are you sure you want to clear all stored emails from the database? Connected accounts will remain.")) return;
                    try {
                      await axios.post(`${API_BASE}/emails/reset-database`, {}, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                      });
                      setEmails([]);
                      setEmailModal(null);
                      setDayModalDate(null);
                      alert("Database cleared! Click 'Sync Latest Mails' to perform a fresh AI sync.");
                    } catch (err) {
                      alert("Failed to reset database: " + (err.response?.data?.detail || err.message));
                    }
                  }}
                  style={{ ...styles.cancelBtn, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  <Trash2 size={13} style={{ display: 'inline', marginRight: 6 }} /> Reset Emails Database
                </button>
              </div>
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      setCategoryModal({ id: '', label: '', description: '', color: '#a1a1aa' });
                    }}
                    style={styles.addBtn}
                  >
                    <Plus size={13} /> New Category
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Manage Categories Section */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fafafa' }}>
                    Categories & AI Filter Guidance
                  </h4>
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      setCategoryModal({ id: '', label: '', description: '', color: '#a1a1aa' });
                    }}
                    style={styles.addBtn}
                  >
                    <Plus size={13} /> New Category
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {categories.map(c => (
                    <div key={c.id} style={styles.settingCatItem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...styles.catIndicator, backgroundColor: c.color }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fafafa' }}>{c.label}</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#71717a', margin: '4px 0 0' }}>
                        {c.description || 'No custom prompt guidance (AI infers from name)'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {categoryModal && (
        <div style={styles.modalBackdrop} onClick={() => setCategoryModal(null)}>
          <div style={{ ...styles.modalCard, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fafafa' }}>
                {categoryModal.id ? 'Edit Category' : 'New Category'}
              </h3>
              <button onClick={() => setCategoryModal(null)} style={styles.closeBtn}>
                <X size={16} />
              </button>
            </div>
            <div style={{ ...styles.modalBody, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={styles.inputLabel}>Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fellowships & Grants"
                  value={categoryModal.label}
                  onChange={(e) => setCategoryModal({ ...categoryModal, label: e.target.value })}
                  style={styles.modalInput}
                />
              </div>

              <div>
                <label style={styles.inputLabel}>AI Filtering Description (Prompt Guidance)</label>
                <textarea
                  rows={3}
                  placeholder="Tell Gemini what belongs here (e.g. scholarship awards, research funding, research lab calls...)"
                  value={categoryModal.description}
                  onChange={(e) => setCategoryModal({ ...categoryModal, description: e.target.value })}
                  style={styles.modalTextarea}
                />
              </div>

              <div>
                <label style={styles.inputLabel}>Accent Color</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {['#60a5fa', '#fbbf24', '#c084fc', '#f87171', '#34d399', '#38bdf8', '#a1a1aa'].map(col => (
                    <div
                      key={col}
                      onClick={() => setCategoryModal({ ...categoryModal, color: col })}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        backgroundColor: col,
                        cursor: 'pointer',
                        boxShadow: categoryModal.color === col ? '0 0 0 2px #fff' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button onClick={() => setCategoryModal(null)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button onClick={saveCategory} style={styles.actionSaveBtn}>
                  Save Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    justifyContent: 'center'
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
  catRowHover: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: '6px'
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
  catDeleteBtn: {
    background: 'none',
    border: 'none',
    color: '#52525b',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  catIndicator: {
    width: '7px',
    height: '7px',
    borderRadius: '2px'
  },
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
  calendarFullGrid: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100% - 55px)'
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
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer'
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
  iconMiniBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '3px'
  },
  iconBtnAction: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    borderRadius: '6px',
    padding: '5px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
  reassignBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid var(--card-border)'
  },
  categorySelect: {
    background: '#18181b',
    border: '1px solid var(--card-border)',
    color: '#fafafa',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.8rem',
    outline: 'none',
    cursor: 'pointer'
  },
  aiInsightBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px'
  },
  subBlockLabel: {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px'
  },
  detailBullets: {
    margin: '4px 0 0',
    paddingLeft: '16px',
    fontSize: '0.82rem',
    color: '#d4d4d8',
    lineHeight: 1.5
  },
  actionPillLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#fff',
    fontSize: '0.75rem',
    textDecoration: 'none',
    fontWeight: 500
  },
  dateRowItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    fontSize: '0.8rem',
    color: '#e4e4e7'
  },
  dateRowLabel: {
    fontSize: '0.74rem',
    fontWeight: 600,
    color: '#a1a1aa',
    minWidth: '90px'
  },
  dateRowVal: {
    color: '#38bdf8',
    fontWeight: 500
  },
  datePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    fontSize: '0.74rem',
    fontWeight: 500
  },
  toggleRenderBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: '#a1a1aa',
    fontSize: '0.74rem',
    cursor: 'pointer'
  },
  emailContentContainer: {
    backgroundColor: '#fff',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    color: '#18181b',
    maxHeight: '450px',
    overflowY: 'auto'
  },
  sanitizedHtmlWrapper: {
    fontSize: '0.88rem',
    lineHeight: 1.6,
    wordBreak: 'break-word',
    overflowX: 'auto'
  },
  plainTextPre: {
    fontFamily: 'inherit',
    fontSize: '0.84rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0
  },
  cancelBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--card-border)',
    color: '#d4d4d8',
    fontSize: '0.8rem',
    cursor: 'pointer'
  },
  deleteConfirmBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    border: 'none',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  actionSaveBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    backgroundColor: '#fff',
    border: 'none',
    color: '#000',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  settingInput: {
    width: '80px',
    padding: '6px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    color: '#fff',
    outline: 'none',
    fontSize: '0.85rem'
  },
  settingCatItem: {
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)'
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 500,
    color: '#a1a1aa',
    marginBottom: '6px'
  },
  modalInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    color: '#fff',
    outline: 'none',
    fontSize: '0.85rem'
  },
  modalTextarea: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    color: '#fff',
    outline: 'none',
    fontSize: '0.85rem',
    resize: 'vertical'
  }
};
