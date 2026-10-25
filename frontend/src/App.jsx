import React, { useState, useEffect } from 'react';
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
  Send,
  Tag,
  ArrowRight,
  Filter,
  Flame,
  Check,
  Layers,
  Inbox
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('hermes_token') || '');
  const [userEmail, setUserEmail] = useState(localStorage.getItem('hermes_email') || '');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchOrganizing, setBatchOrganizing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analyses, setAnalyses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hermes_analyses') || '{}');
    } catch {
      return {};
    }
  });

  // Calendar State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'inbox' | 'actions'
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [completedTasks, setCompletedTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hermes_completed_tasks') || '[]');
    } catch {
      return [];
    }
  });

  // Sync analyses and completed tasks to local cache
  useEffect(() => {
    localStorage.setItem('hermes_analyses', JSON.stringify(analyses));
  }, [analyses]);

  useEffect(() => {
    localStorage.setItem('hermes_completed_tasks', JSON.stringify(completedTasks));
  }, [completedTasks]);

  // Handle OAuth Token from redirect query params
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
      alert('Login error: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hermes_token');
    localStorage.removeItem('hermes_email');
    setToken('');
    setUserEmail('');
    setEmails([]);
    setSelectedEmail(null);
  };

  const fetchEmails = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/emails/?max_results=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmails(res.data.emails || []);
      if (res.data.emails?.length > 0 && !selectedEmail) {
        setSelectedEmail(res.data.emails[0]);
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) {
        handleLogout();
      }
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

  const organizeAll = async () => {
    setBatchOrganizing(true);
    try {
      const res = await axios.post(`${API_BASE}/emails/batch-organize?max_results=10`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const newAnalyses = { ...analyses };
      (res.data.items || []).forEach(item => {
        newAnalyses[item.email.id] = item.analysis;
      });
      setAnalyses(newAnalyses);
      fetchEmails();
    } catch (err) {
      alert('Batch organize failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBatchOrganizing(false);
    }
  };

  const toggleTask = (taskKey) => {
    setCompletedTasks(prev => 
      prev.includes(taskKey) ? prev.filter(k => k !== taskKey) : [...prev, taskKey]
    );
  };

  useEffect(() => {
    if (token) {
      fetchEmails();
    }
  }, [token]);

  // Aggregate extracted schedule events and deadlines from analyzed emails
  const allScheduledItems = [];
  emails.forEach(email => {
    const analysis = analyses[email.id];
    if (analysis && analysis.tasks) {
      analysis.tasks.forEach((task, idx) => {
        // Attempt parsing deadline date or fall back to email date
        let itemDate = null;
        if (task.deadline) {
          const parsed = new Date(task.deadline);
          if (!isNaN(parsed.getTime())) {
            itemDate = parsed;
          }
        }
        if (!itemDate && email.date) {
          const parsedEmailDate = new Date(email.date);
          if (!isNaN(parsedEmailDate.getTime())) {
            itemDate = parsedEmailDate;
          }
        }
        if (!itemDate) itemDate = new Date();

        allScheduledItems.push({
          taskKey: `${email.id}_${idx}`,
          title: task.title,
          deadline: task.deadline,
          urgency: task.urgency || analysis.priority || 'Medium',
          category: analysis.category,
          date: itemDate,
          emailId: email.id,
          emailSubject: email.subject,
          emailSender: email.from
        });
      });
    }
  });

  // Calendar Helpers
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

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

  const selectedDayItems = allScheduledItems.filter(item => isSameDay(item.date, selectedDate));

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.loginIconWrapper}>
            <Sparkles size={36} color="#8b5cf6" />
          </div>
          <h1 style={styles.loginTitle}>Hermes</h1>
          <p style={styles.loginSubtitle}>
            Your cozy AI-organized calendar & inbox sanctuary.
            Transform chaotic emails into scheduled tasks, clear priorities, and smart insights with Gemini.
          </p>
          <button onClick={handleLogin} style={styles.primaryBtn}>
            <Mail size={18} />
            Connect Gmail Account
          </button>
          <div style={styles.loginFooterBadge}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
            Ready for local test & production deployment
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appWrapper}>
      {/* Top Navbar */}
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <div style={styles.logoPill}>
            <Sparkles size={20} color="#c084fc" />
          </div>
          <span style={styles.brandName}>Hermes</span>
          <span style={styles.brandSub}>Calendar & Mail</span>
        </div>

        {/* View Switcher Tabs */}
        <div style={styles.tabsWrapper}>
          <button
            onClick={() => setActiveTab('calendar')}
            style={activeTab === 'calendar' ? styles.tabActive : styles.tabInactive}
          >
            <CalendarIcon size={16} /> Calendar
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            style={activeTab === 'inbox' ? styles.tabActive : styles.tabInactive}
          >
            <Mail size={16} /> Inbox ({emails.length})
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            style={activeTab === 'actions' ? styles.tabActive : styles.tabInactive}
          >
            <CheckCircle2 size={16} /> Action Items ({allScheduledItems.length})
          </button>
        </div>

        {/* Actions & User Profile */}
        <div style={styles.navRight}>
          <button
            onClick={organizeAll}
            disabled={batchOrganizing}
            style={styles.organizeAllBtn}
            title="Auto-analyze top 10 emails with Gemini"
          >
            <Sparkles size={16} className={batchOrganizing ? 'spin' : ''} />
            {batchOrganizing ? 'Gemini Organizing...' : 'Auto-Organize'}
          </button>
          <button onClick={fetchEmails} disabled={loading} style={styles.iconBtn} title="Sync inbox">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
          <div style={styles.userBadge}>
            <span style={styles.userDot} />
            <span style={styles.userEmail}>{userEmail}</span>
          </div>
          <button onClick={handleLogout} style={styles.iconBtn} title="Sign Out">
            <LogOut size={17} />
          </button>
        </div>
      </nav>

      {/* Main View Area */}
      <main style={styles.mainGrid}>
        {activeTab === 'calendar' && (
          <div style={styles.calendarLayout}>
            {/* Left Calendar Grid Card */}
            <div style={styles.calendarCard}>
              <div style={styles.monthHeader}>
                <div>
                  <h2 style={styles.monthTitle}>
                    {monthNames[month]} <span style={{ color: '#8b949e', fontWeight: 400 }}>{year}</span>
                  </h2>
                  <p style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '2px' }}>
                    {allScheduledItems.length} AI-extracted action items detected
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={prevMonth} style={styles.calNavBtn}>
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => { setSelectedDate(new Date()); setCurrentMonthDate(new Date()); }} style={styles.calTodayBtn}>
                    Today
                  </button>
                  <button onClick={nextMonth} style={styles.calNavBtn}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              {/* Day headers */}
              <div style={styles.weekDaysGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} style={styles.weekDayHeader}>{d}</div>
                ))}
              </div>

              {/* Day Cells */}
              <div style={styles.daysGrid}>
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} style={styles.emptyDayCell} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const cellDate = new Date(year, month, dayNum);
                  const isSelected = isSameDay(cellDate, selectedDate);
                  const isToday = isSameDay(cellDate, new Date());
                  
                  const dayItems = allScheduledItems.filter(item => isSameDay(item.date, cellDate));

                  return (
                    <div
                      key={dayNum}
                      onClick={() => setSelectedDate(cellDate)}
                      style={{
                        ...styles.dayCell,
                        ...(isSelected ? styles.dayCellSelected : {}),
                        ...(isToday ? styles.dayCellToday : {})
                      }}
                    >
                      <div style={styles.dayNumRow}>
                        <span style={isSelected ? styles.dayNumSelected : styles.dayNum}>
                          {dayNum}
                        </span>
                        {dayItems.length > 0 && (
                          <span style={styles.dayBadgeCount}>
                            {dayItems.length}
                          </span>
                        )}
                      </div>

                      <div style={styles.dayEventsList}>
                        {dayItems.slice(0, 2).map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              ...styles.dayEventPill,
                              borderLeftColor: item.urgency === 'High' ? '#f43f5e' : '#8b5cf6'
                            }}
                          >
                            <span style={styles.dayEventTitle}>{item.title}</span>
                          </div>
                        ))}
                        {dayItems.length > 2 && (
                          <span style={styles.moreItemsText}>+{dayItems.length - 2} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Side: Day Details & Cozy Focus Panel */}
            <div style={styles.schedulePanel}>
              <div style={styles.scheduleHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} color="#c084fc" />
                  <h3 style={styles.scheduleTitle}>
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </h3>
                </div>
                <span style={styles.countBadge}>{selectedDayItems.length} Actions</span>
              </div>

              {selectedDayItems.length === 0 ? (
                <div style={styles.emptySchedule}>
                  <div style={styles.emptyGlowIcon}>
                    <CheckCircle2 size={32} color="#10b981" />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#f0f3f6' }}>All Clear for this Day</h4>
                  <p style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '6px', maxWidth: '240px', lineHeight: 1.4 }}>
                    No pending email action items or deadlines scheduled for this date.
                  </p>
                </div>
              ) : (
                <div style={styles.scheduleList}>
                  {selectedDayItems.map((item) => {
                    const isDone = completedTasks.includes(item.taskKey);
                    return (
                      <div
                        key={item.taskKey}
                        style={{
                          ...styles.taskCard,
                          ...(isDone ? styles.taskCardDone : {})
                        }}
                      >
                        <div style={styles.taskCardTop}>
                          <button
                            onClick={() => toggleTask(item.taskKey)}
                            style={{
                              ...styles.checkBtn,
                              backgroundColor: isDone ? '#10b981' : 'transparent',
                              borderColor: isDone ? '#10b981' : 'rgba(255,255,255,0.2)'
                            }}
                          >
                            {isDone && <Check size={14} color="#fff" />}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              ...styles.taskTitle,
                              textDecoration: isDone ? 'line-through' : 'none',
                              color: isDone ? '#8b949e' : '#f0f3f6'
                            }}>
                              {item.title}
                            </div>
                            <div style={styles.taskMetaRow}>
                              <span style={{
                                ...styles.urgencyTag,
                                backgroundColor: item.urgency === 'High' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                                color: item.urgency === 'High' ? '#fb7185' : '#c084fc'
                              }}>
                                {item.urgency} Priority
                              </span>
                              {item.deadline && (
                                <span style={styles.deadlineTag}>
                                  <Clock size={12} /> {item.deadline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={styles.emailContextFoot}>
                          <Mail size={12} color="#8b949e" />
                          <span style={styles.emailContextSubject} title={item.emailSubject}>
                            {item.emailSubject}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'inbox' && (
          <div style={styles.inboxSplitLayout}>
            {/* Email List Left Column */}
            <div style={styles.inboxListColumn}>
              <div style={styles.inboxColHeader}>
                <h3 style={styles.inboxColTitle}>Recent Communications</h3>
                <span style={styles.countBadge}>{emails.length} Messages</span>
              </div>
              <div style={styles.inboxScrollArea}>
                {emails.map(email => {
                  const analysis = analyses[email.id];
                  const isSelected = selectedEmail?.id === email.id;
                  return (
                    <div
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      style={{
                        ...styles.inboxEmailItem,
                        ...(isSelected ? styles.inboxEmailItemSelected : {})
                      }}
                    >
                      <div style={styles.emailItemTop}>
                        <span style={styles.emailSenderName}>{email.from.split('<')[0]}</span>
                        <span style={styles.emailDate}>{new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div style={styles.emailSubjectLine}>{email.subject}</div>
                      <div style={styles.emailSnippetText}>{email.snippet}</div>
                      {analysis && (
                        <div style={styles.badgeRow}>
                          <span style={{
                            ...styles.categoryBadge,
                            backgroundColor: analysis.category === 'Action Required' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                            color: analysis.category === 'Action Required' ? '#fda4af' : '#d8b4fe'
                          }}>
                            {analysis.category}
                          </span>
                          {analysis.tasks?.length > 0 && (
                            <span style={styles.taskCountBadge}>
                              {analysis.tasks.length} task{analysis.tasks.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Email Detail Right Column */}
            <div style={styles.emailDetailColumn}>
              {selectedEmail ? (
                <div style={styles.detailWrapper}>
                  {/* Top Bar of Email */}
                  <div style={styles.detailHeader}>
                    <div>
                      <h2 style={styles.detailSubject}>{selectedEmail.subject}</h2>
                      <div style={styles.detailSenderMeta}>
                        From: <span style={{ color: '#f0f3f6', fontWeight: 500 }}>{selectedEmail.from}</span> &bull; {selectedEmail.date}
                      </div>
                    </div>
                    <div>
                      {!analyses[selectedEmail.id] ? (
                        <button
                          onClick={() => analyzeEmail(selectedEmail.id)}
                          disabled={analyzingId === selectedEmail.id}
                          style={styles.geminiAnalyzeBtn}
                        >
                          <Sparkles size={16} className={analyzingId === selectedEmail.id ? 'spin' : ''} />
                          {analyzingId === selectedEmail.id ? 'Organizing...' : 'Organize with Gemini'}
                        </button>
                      ) : (
                        <span style={styles.analyzedSuccessBadge}>
                          <CheckCircle2 size={15} /> Organized
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gemini Intelligence Card */}
                  {analyses[selectedEmail.id] && (
                    <div style={styles.geminiDetailCard}>
                      <div style={styles.geminiCardHead}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Sparkles size={18} color="#c084fc" />
                          <h4 style={styles.geminiSectionTitle}>Hermes Intelligence</h4>
                        </div>
                        <span style={{
                          ...styles.categoryBadge,
                          backgroundColor: 'rgba(139, 92, 246, 0.25)',
                          color: '#e9d5ff',
                          padding: '4px 10px'
                        }}>
                          {analyses[selectedEmail.id].category} &bull; {analyses[selectedEmail.id].priority} Priority
                        </span>
                      </div>

                      <div style={styles.summaryBlock}>
                        <strong>Executive Summary:</strong> {analyses[selectedEmail.id].summary}
                      </div>

                      {/* Action items extracted */}
                      {analyses[selectedEmail.id].tasks?.length > 0 && (
                        <div style={styles.tasksBlock}>
                          <div style={styles.subBlockHeader}>Extracted Action Items</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {analyses[selectedEmail.id].tasks.map((task, idx) => (
                              <div key={idx} style={styles.taskDetailRow}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#c084fc', marginTop: 7 }} />
                                <div>
                                  <div style={{ fontSize: '0.9rem', color: '#f0f3f6' }}>{task.title}</div>
                                  {task.deadline && (
                                    <div style={{ fontSize: '0.75rem', color: '#fb7185', marginTop: 2 }}>
                                      Deadline: {task.deadline} ({task.urgency || 'Normal'} urgency)
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested Reply Draft */}
                      {analyses[selectedEmail.id].suggested_reply && (
                        <div style={styles.replyDraftBlock}>
                          <div style={styles.subBlockHeader}>Suggested Quick Reply</div>
                          <div style={styles.replyText}>{analyses[selectedEmail.id].suggested_reply}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Body Content */}
                  <div style={styles.emailBodyCard}>
                    <div style={styles.bodyScrollText}>
                      {selectedEmail.body || selectedEmail.snippet || '(No content)'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.noEmailSelected}>
                  <Mail size={40} color="#4b5563" />
                  <p>Select an email from the left to read and analyze</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div style={styles.allActionsContainer}>
            <div style={styles.allActionsHeader}>
              <div>
                <h2 style={styles.monthTitle}>Extracted Action Items</h2>
                <p style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '4px' }}>
                  All action items and scheduled commitments derived by Gemini from your communications.
                </p>
              </div>
              <span style={styles.countBadge}>{allScheduledItems.length} Total</span>
            </div>

            {allScheduledItems.length === 0 ? (
              <div style={styles.emptyActionsCard}>
                <Sparkles size={40} color="#8b5cf6" style={{ marginBottom: 16 }} />
                <h3 style={{ fontSize: '1.2rem', color: '#f0f3f6' }}>No Action Items Extracted Yet</h3>
                <p style={{ color: '#8b949e', maxWidth: '400px', margin: '8px auto 20px', lineHeight: 1.5 }}>
                  Click "Auto-Organize" in the top bar to let Gemini review your emails and build your schedule automatically.
                </p>
                <button onClick={organizeAll} disabled={batchOrganizing} style={styles.primaryBtn}>
                  <Sparkles size={16} /> Auto-Organize Inbox
                </button>
              </div>
            ) : (
              <div style={styles.actionsListGrid}>
                {allScheduledItems.map((item) => {
                  const isDone = completedTasks.includes(item.taskKey);
                  return (
                    <div
                      key={item.taskKey}
                      style={{
                        ...styles.actionFullCard,
                        ...(isDone ? styles.taskCardDone : {})
                      }}
                    >
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        <button
                          onClick={() => toggleTask(item.taskKey)}
                          style={{
                            ...styles.checkBtn,
                            backgroundColor: isDone ? '#10b981' : 'transparent',
                            borderColor: isDone ? '#10b981' : 'rgba(255,255,255,0.2)'
                          }}
                        >
                          {isDone && <Check size={14} color="#fff" />}
                        </button>
                        <div style={{ flex: 1 }}>
                          <h4 style={{
                            ...styles.actionCardTitle,
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? '#8b949e' : '#f0f3f6'
                          }}>
                            {item.title}
                          </h4>
                          <div style={styles.actionTagsRow}>
                            <span style={{
                              ...styles.urgencyTag,
                              backgroundColor: item.urgency === 'High' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                              color: item.urgency === 'High' ? '#fb7185' : '#c084fc'
                            }}>
                              {item.urgency} Priority
                            </span>
                            <span style={styles.deadlineTag}>
                              <CalendarIcon size={12} /> {item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {item.deadline && (
                              <span style={{ ...styles.deadlineTag, color: '#fb7185' }}>
                                <Clock size={12} /> Due: {item.deadline}
                              </span>
                            )}
                          </div>

                          <div style={styles.actionFromEmail}>
                            <Mail size={12} color="#8b949e" />
                            <span>From: <strong>{item.emailSender}</strong> &bull; {item.emailSubject}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Cozy, Soft Dark-Themed UI Styles
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
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '48px 36px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-cozy)'
  },
  loginIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '20px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: 'var(--shadow-glow)'
  },
  loginTitle: {
    fontSize: '2rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: '10px',
    color: '#fff'
  },
  loginSubtitle: {
    color: 'var(--text-muted)',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    marginBottom: '32px'
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px 24px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: '#8b5cf6',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
  },
  loginFooterBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '28px',
    fontSize: '0.8rem',
    color: 'var(--text-muted)'
  },

  // Navbar
  nav: {
    height: '70px',
    padding: '0 32px',
    borderBottom: '1px solid var(--card-border)',
    backgroundColor: 'rgba(14, 17, 23, 0.85)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 50
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoPill: {
    width: '36px',
    height: '36px',
    borderRadius: '12px',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)'
  },
  brandName: {
    fontSize: '1.25rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#fff'
  },
  brandSub: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    paddingLeft: '6px',
    borderLeft: '1px solid rgba(255,255,255,0.1)'
  },
  tabsWrapper: {
    display: 'flex',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '4px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--card-border)',
    gap: '4px'
  },
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '10px',
    backgroundColor: '#8b5cf6',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  tabInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '10px',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '0.875rem',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  organizeAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.35)',
    color: '#c084fc',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  iconBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--card-border)',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid var(--card-border)',
    fontSize: '0.8rem',
    color: '#d1d5db'
  },
  userDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#10b981'
  },
  userEmail: {
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  // Main Container
  mainGrid: {
    flex: 1,
    padding: '28px 32px',
    maxWidth: '1440px',
    margin: '0 auto',
    width: '100%'
  },

  // Calendar View
  calendarLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '24px',
    alignItems: 'start'
  },
  calendarCard: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '28px',
    boxShadow: 'var(--shadow-cozy)'
  },
  monthHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  monthTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#fff'
  },
  calNavBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--card-border)',
    color: 'var(--text-main)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  calTodayBtn: {
    padding: '0 14px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--card-border)',
    color: 'var(--text-main)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  weekDaysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    textAlign: 'center',
    marginBottom: '12px'
  },
  weekDayHeader: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px'
  },
  emptyDayCell: {
    minHeight: '96px',
    borderRadius: 'var(--radius-sm)'
  },
  dayCell: {
    minHeight: '96px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    padding: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    flexDirection: 'column'
  },
  dayCellSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
    boxShadow: '0 0 16px rgba(139, 92, 246, 0.15)'
  },
  dayCellToday: {
    border: '1px solid rgba(139, 92, 246, 0.6)'
  },
  dayNumRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  dayNum: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#9ca3af'
  },
  dayNumSelected: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#c084fc'
  },
  dayBadgeCount: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '999px',
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    color: '#d8b4fe'
  },
  dayEventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflow: 'hidden'
  },
  dayEventPill: {
    fontSize: '0.72rem',
    padding: '3px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderLeft: '2px solid #8b5cf6',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  dayEventTitle: {
    color: '#f0f3f6'
  },
  moreItemsText: {
    fontSize: '0.68rem',
    color: '#8b949e',
    paddingLeft: '4px'
  },

  // Right Side Schedule Panel
  schedulePanel: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    boxShadow: 'var(--shadow-cozy)'
  },
  scheduleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--card-border)',
    marginBottom: '20px'
  },
  scheduleTitle: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#fff'
  },
  countBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#9ca3af'
  },
  emptySchedule: {
    padding: '48px 16px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  emptyGlowIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '18px',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px'
  },
  scheduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '600px',
    overflowY: 'auto'
  },
  taskCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px',
    transition: 'all 0.2s ease'
  },
  taskCardDone: {
    opacity: 0.5,
    backgroundColor: 'rgba(0, 0, 0, 0.2)'
  },
  taskCardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  },
  checkBtn: {
    width: '20px',
    height: '20px',
    borderRadius: '6px',
    border: '1.5px solid rgba(255, 255, 255, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    marginTop: '2px',
    flexShrink: 0
  },
  taskTitle: {
    fontSize: '0.88rem',
    fontWeight: 500,
    lineHeight: 1.4,
    color: '#f0f3f6'
  },
  taskMetaRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
    alignItems: 'center'
  },
  urgencyTag: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px'
  },
  deadlineTag: {
    fontSize: '0.72rem',
    color: '#9ca3af',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  emailContextFoot: {
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.75rem',
    color: '#8b949e'
  },
  emailContextSubject: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },

  // Split Inbox View
  inboxSplitLayout: {
    display: 'grid',
    gridTemplateColumns: '420px 1fr',
    gap: '24px',
    minHeight: '700px'
  },
  inboxListColumn: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-cozy)'
  },
  inboxColHeader: {
    padding: '20px',
    borderBottom: '1px solid var(--card-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  inboxColTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fff'
  },
  inboxScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px'
  },
  inboxEmailItem: {
    padding: '14px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid transparent',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  inboxEmailItemSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.4)'
  },
  emailItemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  emailSenderName: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#f0f3f6'
  },
  emailDate: {
    fontSize: '0.72rem',
    color: '#6b7280'
  },
  emailSubjectLine: {
    fontSize: '0.86rem',
    fontWeight: 500,
    color: '#d1d5db',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  emailSnippetText: {
    fontSize: '0.76rem',
    color: '#8b949e',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  badgeRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
    alignItems: 'center'
  },
  categoryBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px'
  },
  taskCountBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '999px',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#6ee7b7'
  },

  // Email Detail Column
  emailDetailColumn: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-cozy)'
  },
  detailWrapper: {
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    overflowY: 'auto'
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    paddingBottom: '20px',
    borderBottom: '1px solid var(--card-border)'
  },
  detailSubject: {
    fontSize: '1.35rem',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.3
  },
  detailSenderMeta: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    marginTop: '6px'
  },
  geminiAnalyzeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    color: '#c084fc',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  analyzedSuccessBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: '6px 12px',
    borderRadius: '999px'
  },

  // Gemini Detail Card
  geminiDetailCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  geminiCardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  geminiSectionTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#c084fc'
  },
  summaryBlock: {
    fontSize: '0.9rem',
    lineHeight: 1.5,
    color: '#e2e8f0',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '12px 16px',
    borderRadius: '8px'
  },
  tasksBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  subBlockHeader: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  taskDetailRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: '10px 14px',
    borderRadius: '8px'
  },
  replyDraftBlock: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  replyText: {
    fontSize: '0.85rem',
    color: '#cbd5e1',
    fontStyle: 'italic',
    marginTop: '6px',
    lineHeight: 1.5
  },
  emailBodyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '20px'
  },
  bodyScrollText: {
    fontSize: '0.9rem',
    lineHeight: 1.7,
    color: '#cbd5e1',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  noEmailSelected: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: '#6b7280'
  },

  // All Actions View
  allActionsContainer: {
    backgroundColor: 'var(--card-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px',
    boxShadow: 'var(--shadow-cozy)'
  },
  allActionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
    paddingBottom: '20px',
    borderBottom: '1px solid var(--card-border)'
  },
  emptyActionsCard: {
    padding: '60px 20px',
    textAlign: 'center'
  },
  actionsListGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '16px'
  },
  actionFullCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--card-border)',
    borderRadius: 'var(--radius-md)',
    padding: '18px',
    transition: 'all 0.15s ease'
  },
  actionCardTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    lineHeight: 1.4,
    marginBottom: '10px'
  },
  actionTagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px'
  },
  actionFromEmail: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.78rem',
    color: '#8b949e',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
  }
};
