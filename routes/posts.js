const express = require('express');
const router = express.Router();
const { marked } = require('marked');
const { getDb, saveDatabase } = require('../database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  const results = queryAll(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

function buildCommentTree(flatComments) {
  const byId = new Map();
  const roots = [];

  flatComments.forEach((comment) => {
    byId.set(comment.id, { ...comment, children: [] });
  });

  byId.forEach((comment) => {
    if (comment.parent_id) {
      const parent = byId.get(comment.parent_id);
      if (parent) {
        parent.children.push(comment);
      } else {
        roots.push(comment);
      }
    } else {
      roots.push(comment);
    }
  });

  return roots;
}

function stripHtml(raw = '') {
  return String(raw)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '');
}

function safeMarkdownToHtml(markdown = '') {
  const cleaned = stripHtml(markdown);
  const html = marked.parse(cleaned, { breaks: true, gfm: true });
  // Remove inline event handlers and javascript: links as a lightweight sanitizer.
  return String(html)
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'\s*javascript:[^']*'/gi, "href='#'");
}

router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search || '';
  const tag = req.query.tag || '';
  const pageSize = 8;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  let where = '';
  const params = [];

  if (search) {
    where = ' WHERE (posts.title LIKE ? OR posts.content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  } else if (tag) {
    where = ' WHERE posts.tags LIKE ?';
    params.push(`%${tag}%`);
  }

  const countRow = queryOne(
    db,
    `SELECT COUNT(*) as total FROM posts JOIN users ON posts.author_id = users.id${where}`,
    params
  );
  const total = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(total / pageSize);

  const sql = `
    SELECT posts.*, users.username as author_name
    FROM posts
    JOIN users ON posts.author_id = users.id
    ${where}
    ORDER BY posts.created_at DESC
    LIMIT ? OFFSET ?
  `;

  let posts = queryAll(db, sql, [...params, pageSize, (page - 1) * pageSize]);

  posts = posts.map((post) => {
    if (!post.summary) {
      post.summary = post.content.replace(/[#*`>\-\[\]()!]/g, '').substring(0, 150) + '...';
    }
    return post;
  });

  return res.render('index', { posts, search, tag, page, totalPages, total });
});

router.get('/posts/new', isAdmin, (req, res) => {
  res.render('create', { error: null });
});

router.post('/posts', isAdmin, (req, res) => {
  try {
    const { title, content, tags, summary } = req.body;
    const db = getDb();

    const safeTitle = stripHtml(title || '').trim();
    const safeContent = stripHtml(content || '').trim();
    const safeTags = stripHtml(tags || '').trim();
    const safeSummary = stripHtml(summary || '').trim();

    if (!safeTitle || !safeContent) {
      return res.render('create', { error: '标题和正文不能为空' });
    }

    db.run('INSERT INTO posts (title, content, summary, tags, author_id) VALUES (?, ?, ?, ?, ?)', [
      safeTitle,
      safeContent,
      safeSummary,
      safeTags,
      req.session.user.id,
    ]);

    const post = queryOne(db, 'SELECT id FROM posts ORDER BY id DESC LIMIT 1');
    saveDatabase();
    return res.redirect(`/posts/${post.id}`);
  } catch (err) {
    return res.render('create', { error: err.message });
  }
});

router.get('/posts/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const post = queryOne(
    db,
    `SELECT posts.*, users.username as author_name
     FROM posts
     JOIN users ON posts.author_id = users.id
     WHERE posts.id = ?`,
    [id]
  );

  if (!post) {
    return res.status(404).send('文章不存在');
  }

  db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [id]);
  saveDatabase();
  post.views += 1;

  post.htmlContent = safeMarkdownToHtml(post.content);

  const likesRow = queryOne(db, 'SELECT COUNT(*) as total FROM post_likes WHERE post_id = ?', [id]);
  const likesCount = likesRow ? likesRow.total : 0;

  let likedByCurrentUser = false;
  if (req.session.user) {
    const liked = queryOne(db, 'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?', [
      id,
      req.session.user.id,
    ]);
    likedByCurrentUser = !!liked;
  }

  const flatComments = queryAll(
    db,
    `SELECT comments.*, users.username as author_name
     FROM comments
     JOIN users ON comments.author_id = users.id
     WHERE comments.post_id = ?
     ORDER BY comments.created_at ASC`,
    [id]
  );

  const comments = buildCommentTree(flatComments);

  return res.render('post', {
    post,
    comments,
    commentsCount: flatComments.length,
    likesCount,
    likedByCurrentUser,
  });
});

router.post('/posts/:id/likes', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const post = queryOne(db, 'SELECT id FROM posts WHERE id = ?', [id]);
  if (!post) {
    return res.status(404).send('文章不存在');
  }

  try {
    db.run('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [id, req.session.user.id]);
    saveDatabase();
  } catch (err) {
    if (!String(err.message || '').includes('UNIQUE')) {
      console.error(err);
    }
  }

  return res.redirect(`/posts/${id}`);
});

router.delete('/posts/:id/likes', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  db.run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [id, req.session.user.id]);
  saveDatabase();

  return res.redirect(`/posts/${id}`);
});

router.get('/posts/:id/edit', isAdmin, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const post = queryOne(db, 'SELECT * FROM posts WHERE id = ?', [id]);

  if (!post) {
    return res.status(404).send('文章不存在');
  }

  if (post.author_id !== req.session.user.id) {
    return res.redirect('/');
  }

  return res.render('edit', { post, error: null });
});

router.put('/posts/:id', isAdmin, (req, res) => {
  try {
    const { title, content, tags, summary } = req.body;
    const db = getDb();
    const id = Number(req.params.id);

    const safeTitle = stripHtml(title || '').trim();
    const safeContent = stripHtml(content || '').trim();
    const safeTags = stripHtml(tags || '').trim();
    const safeSummary = stripHtml(summary || '').trim();

    if (!safeTitle || !safeContent) {
      return res.redirect(`/posts/${id}/edit`);
    }

    db.run(
      'UPDATE posts SET title = ?, content = ?, summary = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?',
      [safeTitle, safeContent, safeSummary, safeTags, id, req.session.user.id]
    );

    saveDatabase();
    return res.redirect(`/posts/${id}`);
  } catch (err) {
    return res.redirect(`/posts/${req.params.id}/edit`);
  }
});

router.delete('/posts/:id', isAdmin, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  db.run('DELETE FROM post_likes WHERE post_id = ?', [id]);
  db.run('DELETE FROM comments WHERE post_id = ?', [id]);
  db.run('DELETE FROM posts WHERE id = ? AND author_id = ?', [id, req.session.user.id]);

  saveDatabase();
  return res.redirect('/');
});

// Closed for non-admin users: they can only view and like posts.
router.post('/posts/:id/comments', isAuthenticated, (req, res) => {
  return res.status(403).send('评论功能已关闭');
});

router.delete('/comments/:id', isAuthenticated, (req, res) => {
  return res.status(403).send('评论功能已关闭');
});

module.exports = router;

