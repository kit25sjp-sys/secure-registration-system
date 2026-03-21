/* ════════════════════════════════════════════════════════════
   session-manager.js – Multi-session support
   Allows multiple user accounts to be logged in simultaneously
   in the same browser by storing multiple session tokens
════════════════════════════════════════════════════════════ */

const SessionManager = {
  // Get all active sessions
  getSessions() {
    const sessions = localStorage.getItem('activeSessions');
    return sessions ? JSON.parse(sessions) : {};
  },

  // Get current active session ID
  getActiveSessionId() {
    return localStorage.getItem('activeSessionId') || null;
  },

  // Get current active session data
  getActiveSession() {
    const sessionId = this.getActiveSessionId();
    if (!sessionId) return null;
    const sessions = this.getSessions();
    return sessions[sessionId];
  },

  // Add a new session (login)
  addSession(sessionId, userData) {
    const sessions = this.getSessions();
    sessions[sessionId] = {
      ...userData,
      sessionId,
      loginTime: new Date().toISOString(),
    };
    localStorage.setItem('activeSessions', JSON.stringify(sessions));
    // Set as active session
    this.setActiveSession(sessionId);
  },

  // Set active session
  setActiveSession(sessionId) {
    const sessions = this.getSessions();
    if (sessions[sessionId]) {
      localStorage.setItem('activeSessionId', sessionId);
      return true;
    }
    return false;
  },

  // Remove a session (logout)
  removeSession(sessionId) {
    const sessions = this.getSessions();
    delete sessions[sessionId];
    localStorage.setItem('activeSessions', JSON.stringify(sessions));
    
    // If this was the active session, switch to another
    if (this.getActiveSessionId() === sessionId) {
      const remainingSessions = Object.keys(sessions);
      if (remainingSessions.length > 0) {
        this.setActiveSession(remainingSessions[0]);
      } else {
        localStorage.removeItem('activeSessionId');
      }
    }
  },

  // Remove all sessions (logout all)
  removeAllSessions() {
    localStorage.removeItem('activeSessions');
    localStorage.removeItem('activeSessionId');
  },

  // Check if user is logged in
  isLoggedIn() {
    return this.getActiveSession() !== null;
  },

  // Get user info from active session
  getUser() {
    const session = this.getActiveSession();
    return session ? {
      id: session.id,
      username: session.username,
      email: session.email,
      role: session.role,
    } : null;
  },

  // Get list of all logged-in accounts
  getLoggedInAccounts() {
    const sessions = this.getSessions();
    return Object.values(sessions).map(s => ({
      sessionId: s.sessionId,
      username: s.username,
      email: s.email,
      role: s.role,
      isActive: s.sessionId === this.getActiveSessionId(),
    }));
  },
};
