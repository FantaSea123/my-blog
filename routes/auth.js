const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDatabase } = require('../database');

// 封装查询方法
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

// 注册页面
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 处理注册
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    const db = getDb();

    if (password !== confirmPassword) {
      return res.render('register', { error: '两次密码不一致' });
    }

    if (password.length < 6) {
      return res.render('register', { error: '密码至少6个字符' });
    }

    const existing = queryOne(db,
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existing) {
      return res.render('register', { error: '用户名或邮箱已被注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    db.run(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    const user = queryOne(db, "SELECT MAX(id) as id FROM users");

    saveDatabase();

    req.session.user = {
      id: user.id,
      username: username
    };

    res.redirect('/');
  } catch (err) {
    res.render('register', { error: '注册失败：' + err.message });
  }
});

// 登录页面
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 处理登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    const user = queryOne(db,
      "SELECT id, username, password FROM users WHERE email = ?",
      [email]
    );

    if (!user) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    req.session.user = {
      id: user.id,
      username: user.username
    };

    res.redirect('/');
  } catch (err) {
    res.render('login', { error: '登录失败：' + err.message });
  }
});

// 退出登录
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;

