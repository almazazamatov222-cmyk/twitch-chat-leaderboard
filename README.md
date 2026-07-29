# Twitch Chat Leaderboard

Мощный и красивый инструмент для стримеров на Twitch. Собирает статистику сообщений из чата в реальном времени и отображает топ зрителей в виде анимированного оверлея для OBS.

## Архитектура (Полностью Serverless)
Проект является **полностью бессерверным** и разворачивается на связке Vercel + Supabase. Никакие дополнительные сервера или постоянные процессы (демоны) не требуются!

1. **Vercel (Next.js)** - Фронтенд (Dashboard и Overlay) и API-роуты.
2. **Twitch EventSub** - Twitch отправляет Webhook запросы на ваш Vercel API при запуске и завершении стрима.
3. **Supabase Realtime + Presence** - Выбор Мастера среди всех открытых вкладок оверлея (в браузере и OBS). Чтение чата происходит прямо в клиенте, но благодаря Presence только один клиент пишет статистику в базу, исключая двойной подсчет.

## Деплой

### 1. Supabase
1. Создайте проект на [Supabase](https://supabase.com/).
2. Выполните все SQL-миграции из папки `supabase/migrations/` в SQL Editor.

### 2. Vercel
1. Импортируйте этот репозиторий в Vercel.
2. Добавьте переменные окружения:
   - `NEXT_PUBLIC_SUPABASE_URL` = Ваш Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Ваш anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = Ваш service_role key (нужен для webhook'а)
   - `TWITCH_WEBHOOK_SECRET` = Придумайте любой сложный пароль (например, UUID). Он будет использоваться для проверки подписи вебхуков от Twitch.

### 3. Настройка автоматических сессий (Twitch EventSub)
Чтобы сессии (статистика) автоматически начинались и завершались при включении/выключении стрима:
1. Зайдите в [Twitch Dev Console](https://dev.twitch.tv/console).
2. Получите `App Access Token`.
3. Сделайте POST-запрос к Twitch API (например, через Postman или curl), чтобы подписаться на события `stream.online` и `stream.offline`.
4. В качестве Callback URL укажите: `https://<ваш-домен-vercel.com>/api/webhooks/twitch`.
5. В качестве Secret передайте тот же пароль, что вы указали в `TWITCH_WEBHOOK_SECRET` на Vercel.

Twitch отправит проверочный запрос (challenge) на ваш сервер. Наш API-роут написан так, чтобы автоматически подтвердить эту проверку.

## Разработка локально

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`. 
*(Примечание: для локального тестирования вебхуков EventSub потребуется прокинуть туннель, например через ngrok).*
