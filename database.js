const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'blog.db');

let db;

function tableExists(tableName) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
  stmt.bind([tableName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function indexExists(indexName) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = ?");
  stmt.bind([indexName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function columnExists(tableName, columnName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const columns = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    columns.push(row.name);
  }
  stmt.free();
  return columns.includes(columnName);
}

function ensureTable(tableName, createSql) {
  if (!tableExists(tableName)) {
    db.run(createSql);
  }
}

function ensureColumn(tableName, columnName, alterSql) {
  if (!columnExists(tableName, columnName)) {
    db.run(alterSql);
  }
}

function ensureIndex(indexName, createSql) {
  if (!indexExists(indexName)) {
    db.run(createSql);
  }
}

function runMigrations() {
  db.run('BEGIN TRANSACTION');
  try {
    // 点赞表
    ensureTable('post_likes', `
      CREATE TABLE post_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 评论嵌套/软删除字段
    ensureColumn('comments', 'parent_id', 'ALTER TABLE comments ADD COLUMN parent_id INTEGER NULL');
    ensureColumn('comments', 'is_deleted', 'ALTER TABLE comments ADD COLUMN is_deleted INTEGER DEFAULT 0');
    ensureColumn('comments', 'deleted_at', 'ALTER TABLE comments ADD COLUMN deleted_at DATETIME NULL');

    // 索引
    ensureIndex('idx_post_likes_post_id', 'CREATE INDEX idx_post_likes_post_id ON post_likes(post_id)');
    ensureIndex('idx_post_likes_user_id', 'CREATE INDEX idx_post_likes_user_id ON post_likes(user_id)');
    ensureIndex('idx_comments_post_parent_created', 'CREATE INDEX idx_comments_post_parent_created ON comments(post_id, parent_id, created_at)');
    ensureIndex('idx_comments_parent_id', 'CREATE INDEX idx_comments_parent_id ON comments(parent_id)');

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  // 如果数据库文件已存在，读取它；否则创建新的
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '这个人很懒，什么都没写...',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建文章表
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT DEFAULT '',
      author_id INTEGER NOT NULL,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `);

  // 创建评论表
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `);

  runMigrations();

  console.log('✅ 数据库初始化成功');
  saveDatabase();
  return db;
}

// 把数据库保存到文件
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 获取数据库实例
function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, saveDatabase };
