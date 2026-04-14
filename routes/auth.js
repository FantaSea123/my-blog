const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb, saveDatabase } = require('../database');

// 注册页面
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 处理注册
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    const db = getDb();

    // 验证
    if (password !== confirmPassword) {
      return res.render('register', { error: '两次密码不一致' });
    }

    if (password.length < 6) {
      return res.render('register', { error: '密码至少6个字符' });
    }

    // 检查用户是否已存在
    const existing = db.exec(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.render('register', { error: '用户名或邮箱已被注册' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 插入用户
    db.run(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    saveDatabase();

    // 获取新用户ID
    const result = db.exec("SELECT last_insert_rowid() as id");
    const userId = result[0].values[0][0];

    // 自动登录
    req.session.user = {
      id: userId,
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

    // 查找用户
    const result = db.exec(
      "SELECT id, username, password FROM users WHERE email = ?",
      [email]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    const user = result[0].values[0];
    const userId = user[0];
    const username = user[1];
    const hashedPassword = user[2];

    // 验证密码
    const isMatch = await bcrypt.compare(password, hashedPassword);
    if (!isMatch) {
      return res.render('login', { error: '邮箱或密码错误' });
    }

    // 设置登录状态
    req.session.user = {
      id: userId,
      username: username
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
