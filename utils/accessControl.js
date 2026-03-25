// accessControl.js - Centralized Role & Permission Management
// All role logic, permissions, and access control in one place

const { getDb } = require('../database/db');

// ROLE DEFINITIONS

const ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MANAGER: 'manager',
  USER: 'user',
};

const VALID_ROLES = Object.values(ROLES);

// ROLE PERMISSIONS (what each role can do)

const PERMISSIONS = {
  // Admin permissions - FULL MANAGEMENT ACCESS
  [ROLES.ADMIN]: {
    // View permissions
    viewStats: true,
    viewUsers: true,
    viewUsersWithPasswords: true,
    viewLoginAttempts: true,
    viewSuspiciousActivity: true,
    accessAdminPanel: true,
    
    // Management permissions
    toggleUserStatus: true,        // Can activate/deactivate users
    changeUserRole: true,          // Can change user roles
    deleteUser: true,              // Can delete users
    manageOtherAdmins: true,       // Can manage other admin users
  },

  // Moderator permissions - VIEW ONLY (user names and login status only)
  [ROLES.MODERATOR]: {
    // View permissions
    viewStats: false,              // Cannot see stats
    viewUsers: true,               // Can see user names and basic info
    viewUsersWithPasswords: false, // Cannot see password hashes
    viewLoginAttempts: true,       // Can see login status/attempts
    viewSuspiciousActivity: false, // Cannot see suspicious activity
    accessAdminPanel: true,        // Can access admin panel for viewing
    
    // Management permissions - ALL FALSE (view-only)
    toggleUserStatus: false,       // Cannot change user status
    changeUserRole: false,         // Cannot change user roles
    deleteUser: false,             // Cannot delete users
    manageOtherAdmins: false,      // Cannot manage other admins
  },

  // Manager permissions - VIEW ONLY (read-only access)
  [ROLES.MANAGER]: {
    // View permissions
    viewStats: true,              // Can see dashboard stats
    viewUsers: true,              // Can see user list
    viewUsersWithPasswords: false, // Cannot see password hashes
    viewLoginAttempts: true,      // Can see login attempts
    viewSuspiciousActivity: true, // Can see suspicious activity
    accessAdminPanel: true,       // Can access admin panel
    
    // Management permissions - ALL FALSE (view-only)
    toggleUserStatus: false,      // Cannot change user status
    changeUserRole: false,        // Cannot change user roles
    deleteUser: false,            // Cannot delete users
    manageOtherAdmins: false,     // Cannot manage admins
  },

  // Regular user permissions - NO ADMIN ACCESS
  [ROLES.USER]: {
    viewStats: false,
    viewUsers: false,
    viewUsersWithPasswords: false,
    viewLoginAttempts: false,
    viewSuspiciousActivity: false,
    accessAdminPanel: false,
    toggleUserStatus: false,
    changeUserRole: false,
    deleteUser: false,
    manageOtherAdmins: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS - Check Permissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a role has a specific permission
 * @param {string} role - User role
 * @param {string} permission - Permission to check
 * @returns {boolean} - True if role has permission
 */
function hasPermission(role, permission) {
  const rolePerms = PERMISSIONS[role] || PERMISSIONS[ROLES.USER];
  return rolePerms[permission] === true;
}

/**
 * Check if user has any of multiple permissions
 * @param {string} role - User role
 * @param {array} permissions - Array of permissions
 * @returns {boolean} - True if user has ANY of the permissions
 */
function hasAnyPermission(role, permissions) {
  return permissions.some(perm => hasPermission(role, perm));
}

/**
 * Check if user has all permissions
 * @param {string} role - User role
 * @param {array} permissions - Array of permissions
 * @returns {boolean} - True if user has ALL permissions
 */
function hasAllPermissions(role, permissions) {
  return permissions.every(perm => hasPermission(role, perm));
}

/**
 * Get all permissions for a role
 * @param {string} role - User role
 * @returns {object} - Permissions object
 */
function getPermissions(role) {
  return PERMISSIONS[role] || PERMISSIONS[ROLES.USER];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - Express Route Protection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Middleware: Require authenticated user
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required. Please log in.' 
    });
  }
  next();
}

/**
 * Middleware: Require specific role or roles
 * @param {string|array} allowedRoles - Single role or array of roles
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    const userRole = req.session.role || ROLES.USER;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Required role: ${roles.join(' or ')}.` 
      });
    }

    req.userRole = userRole;
    next();
  };
}

/**
 * Middleware: Require specific permission
 * @param {string} permission - Permission to check
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    const userRole = req.session.role || ROLES.USER;
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions for this action.' 
      });
    }

    next();
  };
}

/**
 * Middleware: Require admin or moderator role (for management)
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required.' 
    });
  }

  if (req.session.role !== ROLES.ADMIN && req.session.role !== ROLES.MODERATOR) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin or moderator access required.' 
    });
  }

  next();
}

/**
 * Middleware: Require admin, moderator, or manager role (for viewing)
 */
function requireAdminOrView(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required.' 
    });
  }

  const allowedRoles = [ROLES.ADMIN, ROLES.MODERATOR, ROLES.MANAGER];
  if (!allowedRoles.includes(req.session.role)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin, moderator, or manager access required.' 
    });
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN OPERATIONS - User Management Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {object} - User object
 */
function getUserById(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id=?').get(userId);
}

/**
 * Toggle user active status (activate/deactivate)
 * @param {number} userId - User ID to toggle
 * @param {string} adminRole - Admin's role (for permission checking)
 * @returns {object} - Result {success, is_active, message}
 */
function toggleUserStatus(userId, adminRole) {
  if (!hasPermission(adminRole, 'toggleUserStatus')) {
    return { 
      success: false, 
      message: 'Insufficient permissions to toggle user status.' 
    };
  }

  const db = getDb();
  const user = db.prepare('SELECT id, is_active, username, is_master_admin FROM users WHERE id=?').get(userId);
  
  if (!user) {
    return { 
      success: false, 
      message: 'User not found.' 
    };
  }

  if (user.is_master_admin) {
    return {
      success: false,
      message: '🔒 Master admin account cannot be deactivated for security reasons.'
    };
  }

  const newStatus = user.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active=? WHERE id=?').run(newStatus, user.id);

  return { 
    success: true, 
    is_active: newStatus,
    username: user.username,
    message: `User ${user.username} ${newStatus ? 'activated' : 'deactivated'}.` 
  };
}

/**
 * Change user role
 * @param {number} userId - User ID to update
 * @param {string} newRole - New role (user, moderator, admin)
 * @param {string} adminRole - Admin's role (for permission checking)
 * @returns {object} - Result {success, role, message}
 */
function changeUserRole(userId, newRole, adminRole) {
  if (!hasPermission(adminRole, 'changeUserRole')) {
    return { 
      success: false, 
      message: 'Insufficient permissions to change user role.' 
    };
  }

  const db = getDb();
  const user = db.prepare('SELECT id, username, is_master_admin FROM users WHERE id=?').get(userId);
  
  if (!user) {
    return { 
      success: false, 
      message: 'User not found.' 
    };
  }

  if (user.is_master_admin) {
    return {
      success: false,
      message: '🔒 Master admin role cannot be changed for security reasons.'
    };
  }

  // Normalize role (backward compatibility)
  let role = String(newRole || '').trim().toLowerCase();
  if (role === 'editor') role = ROLES.MODERATOR;
  if (role === 'manager') role = ROLES.MODERATOR;

  if (!VALID_ROLES.includes(role)) {
    return { 
      success: false, 
      message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` 
    };
  }

  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);

  return { 
    success: true, 
    role,
    username: user.username,
    message: `Role updated to "${role}" for ${user.username}.` 
  };
}

/**
 * Delete user permanently
 * @param {number} userId - User ID to delete
 * @param {string} adminRole - Admin's role (for permission checking)
 * @returns {object} - Result {success, message}
 */
function deleteUser(userId, adminRole) {
  if (!hasPermission(adminRole, 'deleteUser')) {
    return { 
      success: false, 
      message: 'Insufficient permissions to delete user.' 
    };
  }

  const db = getDb();
  const user = db.prepare('SELECT id, username, is_master_admin FROM users WHERE id=?').get(userId);
  
  if (!user) {
    return { 
      success: false, 
      message: 'User not found.' 
    };
  }

  if (user.is_master_admin) {
    return {
      success: false,
      message: '🔒 Master admin account cannot be deleted for security reasons.'
    };
  }

  db.prepare('DELETE FROM users WHERE id=?').run(user.id);

  return { 
    success: true, 
    username: user.username,
    message: `User ${user.username} deleted successfully.` 
  };
}

/**
 * Get users (with or without password hashes based on permission)
 * @param {string} adminRole - Admin's role
 * @returns {array|object} - Users array or error object
 */
function getUsers(adminRole) {
  const db = getDb();
  
  const canViewPasswords = hasPermission(adminRole, 'viewUsersWithPasswords');
  
  if (canViewPasswords) {
    // Admin - show everything including password hashes
    return {
      success: true,
      users: db.prepare(`
        SELECT id, username, email, password_hash, role, is_verified, is_active, 
               created_at, last_login, ip_address, failed_attempts, locked_until
        FROM users ORDER BY created_at DESC
      `).all(),
      includesPasswords: true
    };
  } else if (hasPermission(adminRole, 'viewUsers')) {
    // Moderator/Editor - show users without password hashes
    return {
      success: true,
      users: db.prepare(`
        SELECT id, username, email, role, is_verified, is_active, created_at, last_login
        FROM users ORDER BY created_at DESC
      `).all(),
      includesPasswords: false
    };
  } else {
    return {
      success: false,
      message: 'Insufficient permissions to view users.'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate if a role is valid
 * @param {string} role - Role to validate
 * @returns {boolean} - True if valid role
 */
function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

/**
 * Validate user can perform action on another user
 * @param {string} actorRole - Role of person performing action
 * @param {string} targetRole - Role of person being acted upon
 * @returns {boolean} - True if allowed
 */
function canManageUser(actorRole, targetRole) {
  // Admin can manage anyone
  if (actorRole === ROLES.ADMIN) return true;
  
  // Moderator/Editor cannot manage anyone
  if (actorRole === ROLES.MODERATOR || actorRole === ROLES.EDITOR) return false;
  
  // Regular users cannot manage anyone
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Role constants
  ROLES,
  VALID_ROLES,
  PERMISSIONS,

  // Permission checking
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissions,

  // Middleware
  requireAuth,
  requireRole,
  requirePermission,
  requireAdmin,
  requireAdminOrView,

  // Admin operations
  getUserById,
  toggleUserStatus,
  changeUserRole,
  deleteUser,
  getUsers,

  // Validation
  isValidRole,
  canManageUser,
};
