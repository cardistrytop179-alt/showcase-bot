require('dotenv').config();
const { Bot, GrammyError, HttpError, session } = require('grammy');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
const axios = require('axios');

// Инициализация
const bot = new Bot(process.env.BOT_TOKEN);
const prisma = new PrismaClient();
const ADMIN_ID = BigInt(process.env.ADMIN_ID);

// ==================== MIDDLEWARE ====================

// Логирование и обновление активности
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  try {
    await prisma.user.upsert({
      where: { id: BigInt(userId) },
      update: {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
      },
      create: {
        id: BigInt(userId),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        status: 'START',
      },
    });
  } catch (error) {
    console.error('Error updating user:', error);
  }

  return next();
});

// Проверка прав администратора
const isAdmin = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (BigInt(userId) !== ADMIN_ID) {
    return ctx.reply('⛔ У вас нет доступа к этой команде.');
  }
  return next();
};

// ==================== KEYBOARDS ====================

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '👤 Кто я?' }],
      [{ text: '📋 Заполнить форму' }, { text: '💰 Курс крипты' }],
      [{ text: '📁 Мои проекты' }, { text: '✉️ Связаться' }],
    ],
    resize_keyboard: true,
  },
};

const aboutInlineKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📁 Мои проекты', callback_data: 'projects' }],
      [{ text: '✉️ Связаться напрямую', callback_data: 'contact' }],
      [{ text: '💻 Посмотреть код на GitHub', url: 'https://github.com' }],
    ],
  },
};

const contactKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '💬 Написать в Telegram', url: 'https://t.me/your_username' }],
      [{ text: '📧 Отправить email', callback_data: 'send_email' }],
    ],
  },
};

const projectsInlineKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🤖 Бот для e-commerce', callback_data: 'project_ecommerce' },
        { text: '📊 CRM-система', callback_data: 'project_crm' },
      ],
      [
        { text: '🔗 API Gateway', callback_data: 'project_api' },
        { text: '📱 Telegram Mini App', callback_data: 'project_miniapp' },
      ],
      [{ text: '◀️ Назад', callback_data: 'back_to_main' }],
    ],
  },
};

// ==================== COMMANDS ====================

// Старт
bot.command('start', async (ctx) => {
  await logEvent('bot_start', ctx.from.id);

  const welcomeText = `
👋 Привет, ${ctx.from.first_name || 'друг'}!

Добро пожаловать в моё интерактивное портфолио.

Здесь ты можешь:
• Узнать обо мне и моём опыте
• Посмотреть примеры моих проектов
• Проверить работу с внешними API
• Заполнить демо-форму с валидацией

Используй кнопки ниже для навигации 👇
  `;

  await ctx.reply(welcomeText, mainKeyboard);
});

// ==================== TEXT HANDLERS ====================

// Главное меню
bot.hears('👤 Кто я?', async (ctx) => {
  await logEvent('click_who_am_i', ctx.from.id);

  const aboutText = `
🚀 *Привет! Меня зовут Мирон*

Я разработчик Telegram-ботов и веб-сервисов на *Node.js*. 

*Специализация:*
• Создание сложных систем автоматизации
• Маркетинговые воронки и боты-воронки
• Интеграция с внешними API
• Разработка админ-панелей и CRM

*Мой стек:*
🟢 Node.js | PostgreSQL | Prisma | Docker
🟢 Grammy/Telegraf | Express | React
🟢 Railway | AWS | GitHub Actions

*Почему я:*
✅ Чистый, масштабируемый код
✅ Опыт работы с высокими нагрузками
✅ Понимание бизнес-логики и конверсий
  `;

  await ctx.reply(aboutText, {
    parse_mode: 'Markdown',
    ...aboutInlineKeyboard,
  });
});

// ==================== WIZARD FORM ====================

const formState = new Map();

bot.hears('📋 Заполнить форму', async (ctx) => {
  await logEvent('start_form', ctx.from.id);

  const userId = ctx.from.id;
  formState.set(userId, { step: 'name', data: {} });

  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: { status: 'WAITING_NAME' },
  });

  await ctx.reply(
    '📋 *Демо-форма сбора данных*\n\n' +
    'Шаг 1/3: Как к вам обращаться?',
    { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
  );
});

// Обработка шагов формы
bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from.id;
  const state = formState.get(userId);

  if (!state) return next();

  const text = ctx.message.text;

  // Шаг 1: Имя
  if (state.step === 'name') {
    state.data.name = text;
    state.step = 'sphere';
    formState.set(userId, state);

    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { status: 'WAITING_SPHERE' },
    });

    return ctx.reply(
      '✅ Отлично!\n\n' +
      'Шаг 2/3: В какой сфере вы работаете?\n' +
      '(например: E-commerce, Образование, IT, Маркетинг)'
    );
  }

  // Шаг 2: Сфера
  if (state.step === 'sphere') {
    state.data.sphere = text;
    state.step = 'email';
    formState.set(userId, state);

    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { status: 'WAITING_EMAIL' },
    });

    return ctx.reply(
      '✅ Понял!\n\n' +
      'Шаг 3/3: Введите ваш email для связи:\n' +
      '(например: example@mail.ru)'
    );
  }

  // Шаг 3: Email с валидацией
  if (state.step === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(text)) {
      return ctx.reply(
        '⚠️ *Некорректный email!*\n\n' +
        'Пожалуйста, введите email в правильном формате:\n' +
        '• Должен содержать @\n' +
        '• Должен содержать точку после @\n\n' +
        'Попробуйте ещё раз:',
        { parse_mode: 'Markdown' }
      );
    }

    state.data.email = text;
    formState.delete(userId);

    // Сохраняем в БД
    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        status: 'COMPLETED',
        isConverted: true,
        email: text,
        sphere: state.data.sphere,
      },
    });

    await logEvent('form_completed', userId);

    return ctx.reply(
      '🎉 *Форма успешно заполнена!*\n\n' +
      `📌 Имя: ${state.data.name}\n` +
      `💼 Сфера: ${state.data.sphere}\n` +
      `📧 Email: ${state.data.email}\n\n` +
      'Спасибо за интерес! Я свяжусь с вами в ближайшее время.',
      { parse_mode: 'Markdown', ...mainKeyboard }
    );
  }

  return next();
});

// ==================== CRYPTO API ====================

bot.hears('💰 Курс крипты', async (ctx) => {
  await logEvent('click_crypto_button', ctx.from.id);

  const loadingMsg = await ctx.reply('🔄 Загружаю актуальные данные...');

  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin&vs_currencies=usd,rub&include_24hr_change=true',
      { timeout: 10000 }
    );

    const data = response.data;

    const formatPrice = (price) => price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A';
    const formatChange = (change) => {
      if (!change) return 'N/A';
      const emoji = change >= 0 ? '🟢' : '🔴';
      return `${emoji} ${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    };

    const cryptoText = `
📊 *Актуальные курсы криптовалют*

*Bitcoin (BTC)*
💵 $${formatPrice(data.bitcoin?.usd)}
🇷🇺 ₽${formatPrice(data.bitcoin?.rub)}
📈 ${formatChange(data.bitcoin?.usd_24h_change)}

*Ethereum (ETH)*
💵 $${formatPrice(data.ethereum?.usd)}
🇷🇺 ₽${formatPrice(data.ethereum?.rub)}
📈 ${formatChange(data.ethereum?.usd_24h_change)}

*BNB*
💵 $${formatPrice(data.binancecoin?.usd)}
🇷🇺 ₽${formatPrice(data.binancecoin?.rub)}
📈 ${formatChange(data.binancecoin?.usd_24h_change)}

_Данные предоставлены CoinGecko API_
    `;

    await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    await ctx.reply(cryptoText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: 'refresh_crypto' }],
        ],
      },
    });
  } catch (error) {
    console.error('Crypto API error:', error.message);
    await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    await ctx.reply(
      '⚠️ Не удалось получить данные. API временно недоступен.\n\n' +
      'Попробуйте позже или посмотрите на [CoinGecko](https://coingecko.com)',
      { parse_mode: 'Markdown' }
    );
  }
});

// ==================== PROJECTS ====================

bot.hears('📁 Мои проекты', async (ctx) => {
  await logEvent('click_projects', ctx.from.id);

  await ctx.reply(
    '📁 *Мои проекты*\n\n' +
    'Выберите проект для подробной информации:',
    { parse_mode: 'Markdown', ...projectsInlineKeyboard }
  );
});

// ==================== CONTACT ====================

bot.hears('✉️ Связаться', async (ctx) => {
  await logEvent('click_contact', ctx.from.id);

  await ctx.reply(
    '✉️ *Связаться со мной*\n\n' +
    'Готов обсудить ваш проект!\n\n' +
    '💬 Telegram: @your_username\n' +
    '📧 Email: your@email.com\n\n' +
    'Обычно отвечаю в течение 2-4 часов.',
    { parse_mode: 'Markdown', ...contactKeyboard }
  );
});

// ==================== CALLBACK QUERIES ====================

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  // Проекты
  if (data === 'projects') {
    await logEvent('view_projects', userId);
    await ctx.editMessageText(
      '📁 *Мои проекты*\n\n' +
      'Выберите проект для подробной информации:',
      { parse_mode: 'Markdown', ...projectsInlineKeyboard }
    );
  }

  if (data === 'project_ecommerce') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '🛒 *Бот для E-commerce*\n\n' +
      '*Описание:* Полноценный магазин в Telegram с каталогом, корзиной, оплатой и доставкой.\n\n' +
      '*Функции:*\n' +
      '• Каталог товаров с категориями\n' +
      '• Корзина и оформление заказа\n' +
      '• Интеграция с ЮKassa\n' +
      '• Уведомления администратору\n' +
      '• Статистика продаж\n\n' +
      '*Стек:* Node.js, PostgreSQL, Prisma, Grammy',
      { parse_mode: 'Markdown' }
    );
  }

  if (data === 'project_crm') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📊 *CRM-система на Telegram*\n\n' +
      '*Описание:* Внутренняя CRM для управления клиентами и задачами.\n\n' +
      '*Функции:*\n' +
      '• Управление лидами и сделками\n' +
      '• Автоматические напоминания\n' +
      '• Отчёты и аналитика\n' +
      '• Ролевая модель доступа\n\n' +
      '*Стек:* Node.js, React, PostgreSQL, Express',
      { parse_mode: 'Markdown' }
    );
  }

  if (data === 'project_api') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '🔗 *API Gateway*\n\n' +
      '*Описание:* Централизованный шлюз для микросервисной архитектуры.\n\n' +
      '*Функции:*\n' +
      '• Аутентификация и авторизация JWT\n' +
      '• Rate limiting\n' +
      '• Логирование запросов\n' +
      '• Балансировка нагрузки\n\n' +
      '*Стек:* Node.js, Express, Redis, Docker',
      { parse_mode: 'Markdown' }
    );
  }

  if (data === 'project_miniapp') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📱 *Telegram Mini App*\n\n' +
      '*Описание:* Веб-приложение внутри Telegram для бронирования услуг.\n\n' +
      '*Функции:*\n' +
      '• Интерактивный календарь\n' +
      '• Онлайн-оплата через Telegram Payments\n' +
      '• Push-уведомления\n' +
      '• Адаптивный дизайн\n\n' +
      '*Стек:* React, Node.js, Telegram Web App API',
      { parse_mode: 'Markdown' }
    );
  }

  // Контакты
  if (data === 'contact') {
    await logEvent('click_contact_inline', userId);
    await ctx.editMessageText(
      '✉️ *Связаться со мной*\n\n' +
      'Готов обсудить ваш проект!\n\n' +
      '💬 Telegram: @your_username\n' +
      '📧 Email: your@email.com\n\n' +
      'Обычно отвечаю в течение 2-4 часов.',
      { parse_mode: 'Markdown', ...contactKeyboard }
    );
  }

  if (data === 'send_email') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📧 Мой email: your@email.com\n\n' +
      'Или напишите прямо здесь — я получу сообщение!'
    );
  }

  // Обновление крипты
  if (data === 'refresh_crypto') {
    await ctx.answerCallbackQuery('🔄 Обновляю...');
    await ctx.deleteMessage();

    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin&vs_currencies=usd,rub&include_24hr_change=true',
        { timeout: 10000 }
      );

      const cryptoData = response.data;

      const formatPrice = (price) => price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A';
      const formatChange = (change) => {
        if (!change) return 'N/A';
        const emoji = change >= 0 ? '🟢' : '🔴';
        return `${emoji} ${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
      };

      const cryptoText = `
📊 *Актуальные курсы криптовалют*

*Bitcoin (BTC)*
💵 $${formatPrice(cryptoData.bitcoin?.usd)}
🇷🇺 ₽${formatPrice(cryptoData.bitcoin?.rub)}
📈 ${formatChange(cryptoData.bitcoin?.usd_24h_change)}

*Ethereum (ETH)*
💵 $${formatPrice(cryptoData.ethereum?.usd)}
🇷🇺 ₽${formatPrice(cryptoData.ethereum?.rub)}
📈 ${formatChange(cryptoData.ethereum?.usd_24h_change)}

*BNB*
💵 $${formatPrice(cryptoData.binancecoin?.usd)}
🇷🇺 ₽${formatPrice(cryptoData.binancecoin?.rub)}
📈 ${formatChange(cryptoData.binancecoin?.usd_24h_change)}

_Обновлено: ${new Date().toLocaleTimeString()}_
      `;

      await ctx.reply(cryptoText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: 'refresh_crypto' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply('⚠️ Ошибка обновления данных. Попробуйте позже.');
    }
  }

  // Назад
  if (data === 'back_to_main') {
    await ctx.deleteMessage();
    await ctx.reply('Главное меню:', mainKeyboard);
  }
});

// ==================== ADMIN PANEL ====================

// Статистика
bot.command('stats', isAdmin, async (ctx) => {
  try {
    const totalUsers = await prisma.user.count();
    const convertedUsers = await prisma.user.count({ where: { isConverted: true } });
    const waitingEmail = await prisma.user.count({ where: { status: 'WAITING_EMAIL' } });
    const todayUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const statsText = `
📊 *Статистика бота*

👥 Всего пользователей: *${totalUsers}*
✅ Завершили форму: *${convertedUsers}*
⏳ Ждут email: *${waitingEmail}*
📈 Новых за 24ч: *${todayUsers}*

*Конверсия:* ${totalUsers > 0 ? ((convertedUsers / totalUsers) * 100).toFixed(1) : 0}%
    `;

    await ctx.reply(statsText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Stats error:', error);
    await ctx.reply('⚠️ Ошибка получения статистики');
  }
});

// Рассылка
bot.command('broadcast', isAdmin, async (ctx) => {
  const message = ctx.message.text.replace('/broadcast', '').trim();

  if (!message) {
    return ctx.reply(
      'Использование: `/broadcast Ваше сообщение для рассылки`',
      { parse_mode: 'Markdown' }
    );
  }

  const users = await prisma.user.findMany();
  let sent = 0;
  let failed = 0;

  const statusMsg = await ctx.reply(`📤 Начинаю рассылку для ${users.length} пользователей...`);

  for (const user of users) {
    try {
      await bot.api.sendMessage(Number(user.id), message, { parse_mode: 'Markdown' });
      sent++;
      await new Promise(resolve => setTimeout(resolve, 50)); // Rate limit
    } catch (error) {
      failed++;
    }
  }

  await ctx.api.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    `✅ Рассылка завершена!\n\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`
  );
});

// ==================== CRON RETARGETING ====================

const startCronJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Running retargeting cron job...');

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    try {
      const inactiveUsers = await prisma.user.findMany({
        where: {
          status: 'WAITING_EMAIL',
          lastActivity: {
            lt: twoMinutesAgo,
          },
          remindersSent: {
            lt: 3,
          },
        },
      });

      for (const user of inactiveUsers) {
        try {
          await bot.api.sendMessage(
            Number(user.id),
            '👋 *Мирон на связи!*\n\n' +
            'Вы не закончили заполнение формы. Нужна помощь?\n\n' +
            'Если у вас возникли вопросы — просто ответьте на это сообщение!',
            { parse_mode: 'Markdown' }
          );

          await prisma.user.update({
            where: { id: user.id },
            data: {
              remindersSent: { increment: 1 },
            },
          });

          console.log(`📨 Retargeting sent to user ${user.id}`);
        } catch (error) {
          console.error(`Failed to send retargeting to ${user.id}:`, error.message);
        }
      }

      if (inactiveUsers.length > 0) {
        console.log(`✅ Retargeting completed: ${inactiveUsers.length} users`);
      }
    } catch (error) {
      console.error('Cron job error:', error);
    }
  });

  console.log('✅ Cron job started (every 5 minutes)');
};

// ==================== HELPERS ====================

async function logEvent(event, userId) {
  try {
    await prisma.analytics.create({
      data: {
        event,
        userId: userId ? BigInt(userId) : null,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
  }
}

// ==================== ERROR HANDLING ====================

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// ==================== START ====================

console.log('🚀 Starting bot...');

// Запускаем cron
startCronJob();

// Запускаем бота
bot.start();

console.log('✅ Bot is running!');
