const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDatabase } = require('../database');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now > record.expiresAt) {
    loginAttempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return true;
  }

  record.count += 1;
  return false;
}

function clearRateLimit(req) {
  loginAttempts.delete(getClientKey(req));
}

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    const db = getDb();

    const normalizedUsername = (username || '').trim();
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedUsername || !normalizedEmail) {
      return res.render('register', { error: '用户名和邮箱不能为空' });
    }

    if (password !== confirmPassword) {
      return res.render('register', { error: '两次密码不一致' });
    }

    if (!password || password.length < 6) {
      return res.render('register', { error: '密码至少6个字符' });
    }

    const existing = queryOne(
      db,
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [normalizedEmail, normalizedUsername]
    );

    if (existing) {
      return res.render('register', { error: '用户名或邮箱已被注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [
      normalizedUsername,
      normalizedEmail,
      hashedPassword,
    ]);

    const user = queryOne(db, 'SELECT id, username, email FROM users ORDER BY id DESC LIMIT 1');
    saveDatabase();

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    return res.redirect('/');
  } catch (err) {
    return res.render('register', { error: `注册失败：${err.message}` });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  if (checkRateLimit(req)) {
    return res.render('login', { error: '登录尝试过于频繁，请15分钟后再试' });
  }

  try {
    const { email, password } = req.body;
    const db = getDb();

    const normalizedEmail = (email || '').trim().toLowerCase();

    const user = queryOne(db, 'SELECT id, username, email, password FROM users WHERE email = ?', [
      normalizedEmail,
    ]);

    if (!user) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    const isMatch = await bcrypt.compare(password || '', user.password);
    if (!isMatch) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    clearRateLimit(req);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    return res.redirect('/');
  } catch (err) {
    return res.render('login', { error: `登录失败：${err.message}` });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;

