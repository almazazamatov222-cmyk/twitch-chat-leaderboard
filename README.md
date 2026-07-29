# Twitch Chat Leaderboard

Мощный и красивый инструмент для стримеров на Twitch. Собирает статистику сообщений из чата в реальном времени и отображает топ зрителей в виде анимированного оверлея для OBS.

## Архитектура
Проект состоит из двух частей:
1. **Frontend (Next.js)** - Панель управления стримера и страница предпросмотра (размещается на Vercel).
2. **Backend Worker (Node.js)** - Демон, который слушает события Twitch (через EventSub) и чат (через twurple/chat). Постоянно запущен на сервере (например, Railway) и синхронизирует данные в Supabase.

## Развертывание Backend Worker (Railway)
Папка `worker/` содержит исходный код бота. Бот автоматически управляет "Сессиями" трансляций.

1. Зарегистрируйтесь на [Railway.app](https://railway.app/).
2. Создайте новый проект -> Deploy from GitHub repo (выберите этот репозиторий).
3. В настройках деплоя Railway укажите `Root Directory` как `/worker`.
4. В разделе `Variables` добавьте следующие переменные:
   - `SUPABASE_URL` = Ваш URL Supabase (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` = Ваш `service_role` ключ (ВАЖНО: не `anon` ключ, так как боту нужен полный доступ к базе)
   - `TWITCH_CLIENT_ID` = Client ID вашего приложения из консоли Twitch
   - `TWITCH_CLIENT_SECRET` = Client Secret
5. Выполните деплой.

Бот автоматически подхватит всех стримеров, зарегистрированных на сайте, и начнет слушать `stream.online`.

## Деплой Frontend (Vercel)
1. Импортируйте проект в Vercel (корень репозитория).
2. Добавьте переменные окружения:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Нажмите Deploy.

## Разработка локально

### Запуск фронтенда:
```bash
npm install
npm run dev
```

### Запуск воркера:
Создайте файл `worker/.env` со всеми переменными:
```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
```

```bash
cd worker
npm install
npm start
```
