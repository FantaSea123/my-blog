const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const dotenv = require('dotenv');
const path = require('path');
const { initDatabase } = require('./database');
const { avatarColor, avatarInitial } = require('./helpers/avatar');
const { isAdminUser } = require('./middleware/auth');

dotenv.config();

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'my_blog_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.avatarColor = avatarColor;
  res.locals.avatarInitial = avatarInitial;
  res.locals.isAdmin = isAdminUser(req.session.user);
  res.locals.csrfToken = ensureCsrfToken(req);
  next();
});

app.use((req, res, next) => {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    return next();
  }

  const sessionToken = req.session.csrfToken;
  const requestToken = req.body && req.body._csrf;

  if (sessionToken && requestToken && sessionToken === requestToken) {
    return next();
  }

  return res.status(403).send('请求校验失败，请刷新页面后重试');
});

const postRoutes = require('./routes/posts');
const authRoutes = require('./routes/auth');
const avatarRoutes = require('./routes/avatar');
const userRoutes = require('./routes/user');

app.use('/', postRoutes);
app.use('/auth', authRoutes);
app.use('/avatar', avatarRoutes);
app.use('/user', userRoutes);

async function start() {
  await initDatabase();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Blog running at http://localhost:${port}`);
  });
}

start();
