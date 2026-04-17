function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  return res.redirect('/auth/login');
}

function isAdminUser(user) {
  if (!user) return false;

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (adminUsername && user.username === adminUsername) {
    return true;
  }

  if (adminEmail && user.email === adminEmail) {
    return true;
  }

  // Backward compatible: ADMIN_USERNAME may be configured as an email.
  if (adminUsername && adminUsername.includes('@') && user.email === adminUsername) {
    return true;
  }

  return false;
}

function isAdmin(req, res, next) {
  if (isAdminUser(req.session.user)) {
    return next();
  }

  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  return res.status(403).send('无权限');
}

module.exports = { isAuthenticated, isAdmin, isAdminUser };
