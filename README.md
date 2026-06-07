# 🤖 BotHost — منصة استضافة بوتات ديسكورد

واجهة ويب احترافية لتشغيل بوتات ديسكورد 24/7 مع محرر أكواد حقيقي.

---

## 🚀 تشغيل محلي (دقيقتان)

```bash
# 1. ثبّت المتطلبات
npm install

# 2. شغّل السيرفر
npm start

# 3. افتح المتصفح
http://localhost:3000
```

---

## ☁️ رفع على Railway (مجاني — تشغيل دائم)

### الطريقة الأسهل:

1. ادفع المشروع على GitHub:
```bash
git init
git add .
git commit -m "Initial BotHost"
git remote add origin https://github.com/USERNAME/bothost.git
git push -u origin main
```

2. افتح [railway.app](https://railway.app) وسجّل دخول
3. اضغط **New Project → Deploy from GitHub**
4. اختر الـ repo → Railway يشغّله تلقائياً

---

## ☁️ رفع على Render (مجاني)

1. افتح [render.com](https://render.com)
2. New → **Web Service**
3. اربطه بـ GitHub repo
4. Build Command: `npm install`
5. Start Command: `npm start`
6. اختر **Free plan** → Deploy

---

## ☁️ على VPS (DigitalOcean / Contabo)

```bash
# على السيرفر:
git clone https://github.com/USERNAME/bothost.git
cd bothost
npm install
npm install -g pm2

# شغّله دائماً:
pm2 start server.js --name bothost
pm2 save
pm2 startup
```

---

## 📁 هيكل المشروع

```
bothost/
├── server.js        ← الخادم الرئيسي (Express + Socket.IO)
├── package.json
├── bots.json        ← بيانات البوتات (يُنشأ تلقائياً)
├── bots/            ← ملفات كل بوت في مجلد منفصل
│   └── bot_xxx/
│       └── index.js
└── public/
    └── index.html   ← الواجهة الكاملة
```

---

## ✨ الميزات

- **تشغيل 24/7** — البوت يشتغل على سيرفر حقيقي
- **محرر أكواد** — تعديل الكود مباشرة من المتصفح
- **رفع ملفات** — سحب وإفلات، ترتيب تلقائي
- **سجل مباشر** — Socket.IO في الوقت الفعلي
- **إدارة متعددة** — بوتات لا نهاية لها في نفس السيرفر
- **توكن مشفر** — يُخزّن في `.env` داخل السيرفر

---

## 🔧 متطلبات البوت الداخلي

كل بوت يحتاج `index.js` في مجلده. المنصة تشغّله بـ:
```
node index.js
```

التوكن يُمرَّر كـ `process.env.DISCORD_TOKEN` تلقائياً.

---

## 🛡️ الأمان

- لا تشارك `bots.json` أبداً
- استخدم HTTPS على الإنتاج
- أضف كلمة مرور للوحة التحكم إذا أردت (راجع `server.js`)
