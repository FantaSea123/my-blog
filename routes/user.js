const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  const results = queryAll(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

router.get('/:username', (req, res) => {
  const db = getDb();
  const { username } = req.params;

  const user = queryOne(db,
    'SELECT id, username, bio, created_at FROM users WHERE username = ?',
    [username]
  );

  if (!user) return res.status(404).send('用户不存在');

  const posts = queryAll(db,
    `SELECT id, title, summary, content, tags, views, created_at
     FROM posts
     WHERE author_id = ?
     ORDER BY created_at DESC`,
    [user.id]
  );

  // 生成摘要
  const postsWithSummary = posts.map(post => {
    if (!post.summary) {
      post.summary = post.content
        .replace(/[#*`>\-\[\]()!]/g, '')
        .substring(0, 120) + '...';
    }
    return post;
  });

  res.render('profile', { profileUser: user, posts: postsWithSummary });
});

module.exports = router;
