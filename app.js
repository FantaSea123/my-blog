const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const dotenv = require('dotenv');
const path = require('path');
const { initDatabase } = require('./database');

dotenv.config();

const app = express();

// ========== 中间件配置 ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'my_blog_secret_key_2024',
  resave: false,
  saveUninitialized: false
}));


// 让所有页面都能访问当前登录用户
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// ========== 路由 ==========
const postRoutes = require('./routes/posts');
const authRoutes = require('./routes/auth');

app.use('/', postRoutes);
app.use('/auth', authRoutes);

// ========== 启动服务器 ==========
async function start() {
  await initDatabase();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 博客运行在 http://localhost:${PORT}`);
  });
}

start();
