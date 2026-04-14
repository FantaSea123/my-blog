# 📝 我的博客

一个使用 Node.js 从零搭建的个人博客系统。

🔗 **在线地址**：https://my-blog-production-9cbe.up.railway.app

---

## ✨ 功能特性

- 🔐 用户注册与登录
- ✍️ 创建、编辑、删除文章
- 📖 支持 Markdown 语法写作
- 🔍 文章搜索功能
- 🏷️ 标签分类与筛选
- 👁 文章浏览量统计
- 📱 响应式设计，支持手机端访问

---

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| Node.js | 运行环境 |
| Express | Web 框架 |
| EJS | 模板引擎 |
| SQLite (sql.js) | 数据库 |
| bcryptjs | 密码加密 |
| marked | Markdown 解析 |
| express-session | 用户会话管理 |

---

## 📁 项目结构
my-blog/
├── middleware/
│ └── auth.js # 登录验证中间件
├── public/
│ └── css/
│ └── style.css # 全局样式
├── routes/
│ ├── auth.js # 注册登录路由
│ └── posts.js # 文章增删改查路由
├── views/
│ ├── partials/
│ │ ├── header.ejs # 页面头部
│ │ └── footer.ejs # 页面尾部
│ ├── index.ejs # 首页
│ ├── post.ejs # 文章详情页
│ ├── create.ejs # 写文章页
│ ├── edit.ejs # 编辑文章页
│ ├── login.ejs # 登录页
│ └── register.ejs # 注册页
├── app.js # 主应用入口
├── database.js # 数据库初始化
├── .env # 环境变量配置
├── .gitignore # Git 忽略文件
└── package.json # 项目依赖


