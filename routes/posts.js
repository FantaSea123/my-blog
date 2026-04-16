const express = require('express');
const router = express.Router();
const { marked } = require('marked');
const { getDb, saveDatabase } = require('../database');
const { isAuthenticated } = require('../middleware/auth');

// 封装查询方法，解决参数绑定问题
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

// ========== 首页 - 文章列表 ==========
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search || '';
  const tag = req.query.tag || '';
  const PAGE_SIZE = 8;
  const page = Math.max(1, parseInt(req.query.page) || 1);

  let where = '';
  const params = [];

  if (search) {
    where = ' WHERE (posts.title LIKE ? OR posts.content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  } else if (tag) {
    where = ' WHERE posts.tags LIKE ?';
    params.push(`%${tag}%`);
  }

  // 查总数
  const countRow = queryOne(db,
    `SELECT COUNT(*) as total FROM posts JOIN users ON posts.author_id = users.id${where}`,
    params
  );
  const total = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 分页查询
  const sql = `
    SELECT posts.*, users.username as author_name
    FROM posts
    JOIN users ON posts.author_id = users.id
    ${where}
    ORDER BY posts.created_at DESC
    LIMIT ? OFFSET ?
  `;
  let posts = queryAll(db, sql, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

  // 生成摘要
  posts = posts.map((post) => {
    if (!post.summary) {
      post.summary = post.content
        .replace(/[#*`>\-\[\]()!]/g, '')
        .substring(0, 150) + '...';
    }
    return post;
  });

  res.render('index', { posts, search, tag, page, totalPages, total });
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
      'INSERT INTO posts (title, content, summary, tags, author_id) VALUES (?, ?, ?, ?, ?)',
      [title, content, summary || '', tags || '', req.session.user.id]
    );

    const post = queryOne(db, 'SELECT MAX(id) as id FROM posts');
    const postId = post.id;

    saveDatabase();
    res.redirect(`/posts/${postId}`);
  } catch (err) {
    res.render('create', { error: err.message });
  }
});

// ========== 文章详情 ==========
router.get('/posts/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const post = queryOne(db,
    `SELECT posts.*, users.username as author_name
     FROM posts
     JOIN users ON posts.author_id = users.id
     WHERE posts.id = ?`,
    [id]
  );

  if (!post) {
    return res.status(404).send('文章不存在');
  }

  // 增加浏览量
  db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [id]);
  saveDatabase();
  post.views += 1;

  // Markdown 转 HTML
  post.htmlContent = marked(post.content);

  // 点赞数据
  const likesRow = queryOne(db, 'SELECT COUNT(*) as total FROM post_likes WHERE post_id = ?', [id]);
  const likesCount = likesRow ? likesRow.total : 0;

  let likedByCurrentUser = false;
  if (req.session.user) {
    const liked = queryOne(
      db,
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [id, req.session.user.id]
    );
    likedByCurrentUser = !!liked;
  }

  // 查询评论（平铺）
  const flatComments = queryAll(db,
    `SELECT comments.*, users.username as author_name
     FROM comments
     JOIN users ON comments.author_id = users.id
     WHERE comments.post_id = ?
     ORDER BY comments.created_at ASC`,
    [id]
  );

  // 组装评论树
  const comments = buildCommentTree(flatComments);

  res.render('post', {
    post,
    comments,
    commentsCount: flatComments.length,
    likesCount,
    likedByCurrentUser,
  });
});

// ========== 点赞文章 ==========
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
    // UNIQUE 约束冲突：说明已经点赞，视为幂等成功
    if (!String(err.message || '').includes('UNIQUE')) {
      console.error(err);
    }
  }

  res.redirect(`/posts/${id}`);
});

// ========== 取消点赞 ==========
router.delete('/posts/:id/likes', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  db.run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [id, req.session.user.id]);
  saveDatabase();

  res.redirect(`/posts/${id}`);
});

// ========== 编辑文章页面 ==========
router.get('/posts/:id/edit', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const post = queryOne(db, 'SELECT * FROM posts WHERE id = ?', [id]);

  if (!post) {
    return res.status(404).send('文章不存在');
  }

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
    const id = Number(req.params.id);

    db.run(
      'UPDATE posts SET title = ?, content = ?, summary = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?',
      [title, content, summary || '', tags || '', id, req.session.user.id]
    );

    saveDatabase();
    res.redirect(`/posts/${id}`);
  } catch (err) {
    res.redirect(`/posts/${req.params.id}/edit`);
  }
});

// ========== 删除文章 ==========
router.delete('/posts/:id', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  // 先删除文章的点赞和所有评论
  db.run('DELETE FROM post_likes WHERE post_id = ?', [id]);
  db.run('DELETE FROM comments WHERE post_id = ?', [id]);
  db.run('DELETE FROM posts WHERE id = ? AND author_id = ?', [id, req.session.user.id]);

  saveDatabase();
  res.redirect('/');
});

// ========== 发表评论 / 回复评论 ==========
router.post('/posts/:id/comments', isAuthenticated, (req, res) => {
  try {
    const { content, parent_id } = req.body;
    const db = getDb();
    const id = Number(req.params.id);

    if (!content || content.trim() === '') {
      return res.redirect(`/posts/${id}`);
    }

    const post = queryOne(db, 'SELECT id FROM posts WHERE id = ?', [id]);
    if (!post) {
      return res.status(404).send('文章不存在');
    }

    let parentId = null;
    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      parentId = Number(parent_id);
      const parent = queryOne(db, 'SELECT id, post_id FROM comments WHERE id = ?', [parentId]);

      if (!parent || Number(parent.post_id) !== id) {
        return res.redirect(`/posts/${id}`);
      }
    }

    db.run(
      'INSERT INTO comments (content, post_id, author_id, parent_id) VALUES (?, ?, ?, ?)',
      [content.trim(), id, req.session.user.id, parentId]
    );

    saveDatabase();
    res.redirect(`/posts/${id}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/posts/${req.params.id}`);
  }
});

// ========== 删除评论 ==========
router.delete('/comments/:id', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);

  const comment = queryOne(db,
    'SELECT id, post_id, author_id FROM comments WHERE id = ?',
    [id]
  );

  if (!comment) {
    return res.redirect('/');
  }

  if (comment.author_id === req.session.user.id) {
    const child = queryOne(db, 'SELECT id FROM comments WHERE parent_id = ? LIMIT 1', [id]);

    if (child) {
      db.run(
        'UPDATE comments SET content = ?, is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['', id]
      );
    } else {
      db.run('DELETE FROM comments WHERE id = ?', [id]);
    }

    saveDatabase();
  }

  res.redirect(`/posts/${comment.post_id}`);
});

module.exports = router;
