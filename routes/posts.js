const express = require('express');
const router = express.Router();
const { marked } = require('marked');
const { getDb, saveDatabase } = require('../database');
const { isAuthenticated } = require('../middleware/auth');

// ========== 首页 - 文章列表 ==========
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search || '';
  const tag = req.query.tag || '';

  let sql = `
    SELECT posts.*, users.username as author_name
    FROM posts
    JOIN users ON posts.author_id = users.id
  `;
  let params = [];

  if (search) {
    sql += " WHERE (posts.title LIKE ? OR posts.content LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  } else if (tag) {
    sql += " WHERE posts.tags LIKE ?";
    params.push(`%${tag}%`);
  }

  sql += " ORDER BY posts.created_at DESC";

  const result = db.exec(sql, params);

  let posts = [];
  if (result.length > 0) {
    const columns = result[0].columns;
    posts = result[0].values.map(row => {
      let post = {};
      columns.forEach((col, i) => {
        post[col] = row[i];
      });
      // 生成摘要
      if (!post.summary) {
        post.summary = post.content
          .replace(/[#*`>\-\[\]()!]/g, '')
          .substring(0, 150) + '...';
      }
      return post;
    });
  }

  res.render('index', { posts, search, tag });
});

// ========== 写文章页面 ==========
router.get('/posts/new', isAuthenticated, (req, res) => {
  res.render('create', { error: null });
});

// ========== 发布文章 ==========
router.post('/posts', isAuthenticated, (req, res) => {
  try {
    const { title, content, tags, summary } = req.body;
    const db = getDb();

    db.run(
      `INSERT INTO posts (title, content, summary, tags, author_id)
       VALUES (?, ?, ?, ?, ?)`,
      [title, content, summary || '', tags || '', req.session.user.id]
    );

    saveDatabase();

    const result = db.exec("SELECT last_insert_rowid() as id");
    const postId = result[0].values[0][0];

    res.redirect(`/posts/${postId}`);
  } catch (err) {
    res.render('create', { error: err.message });
  }
});

// ========== 文章详情 ==========
router.get('/posts/:id', (req, res) => {
  const db = getDb();

  // 增加浏览量
  db.run("UPDATE posts SET views = views + 1 WHERE id = ?", [req.params.id]);
  saveDatabase();

  const result = db.exec(
    `SELECT posts.*, users.username as author_name
     FROM posts
     JOIN users ON posts.author_id = users.id
     WHERE posts.id = ?`,
    [req.params.id]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).send('文章不存在');
  }

  const columns = result[0].columns;
  let post = {};
  columns.forEach((col, i) => {
    post[col] = result[0].values[0][i];
  });

  // Markdown 转 HTML
  post.htmlContent = marked(post.content);

  res.render('post', { post });
});

// ========== 编辑文章页面 ==========
router.get('/posts/:id/edit', isAuthenticated, (req, res) => {
  const db = getDb();

  const result = db.exec(
    "SELECT * FROM posts WHERE id = ?",
    [req.params.id]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).send('文章不存在');
  }

  const columns = result[0].columns;
  let post = {};
  columns.forEach((col, i) => {
    post[col] = result[0].values[0][i];
  });

  // 检查是否是作者
  if (post.author_id !== req.session.user.id) {
    return res.redirect('/');
  }

  res.render('edit', { post, error: null });
});

// ========== 更新文章 ==========
router.put('/posts/:id', isAuthenticated, (req, res) => {
  try {
    const { title, content, tags, summary } = req.body;
    const db = getDb();

    db.run(
      `UPDATE posts
       SET title = ?, content = ?, summary = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND author_id = ?`,
      [title, content, summary || '', tags || '', req.params.id, req.session.user.id]
    );

    saveDatabase();
    res.redirect(`/posts/${req.params.id}`);
  } catch (err) {
    res.redirect(`/posts/${req.params.id}/edit`);
  }
});

// ========== 删除文章 ==========
router.delete('/posts/:id', isAuthenticated, (req, res) => {
  const db = getDb();

  db.run(
    "DELETE FROM posts WHERE id = ? AND author_id = ?",
    [req.params.id, req.session.user.id]
  );

  saveDatabase();
  res.redirect('/');
});

module.exports = router;
