const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// ============================================================
// CHILLZONE
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const BLUE = 0x3498DB;
const DARK_BLUE = 0x1769AA;
const DATA_FILE = path.join(__dirname, 'chillzone-data.json');

// No JavaScript template literals are used in this file.
// This avoids the backtick parsing problem that caused the Render SyntaxError.
function code(text) {
  const tick = String.fromCharCode(96);
  return tick + String(text) + tick;
}

function joinText() {
  return Array.from(arguments).join('');
}

// ============================================================
// ENV CHECK
// ============================================================

if (!TOKEN) {
  console.error('DISCORD_TOKEN חסר.');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('CLIENT_ID חסר.');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY לא מוגדר. ה-AI לא יעבוד.');
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ============================================================
// DATA
// ============================================================

let data = {
  guilds: {},
  levels: {},
  tickets: {},
  privateRooms: {},
  punishments: {},
  counting: {},
  requests: {},
};

function normalizeData() {
  if (!data || typeof data !== 'object') data = {};
  if (!data.guilds || typeof data.guilds !== 'object') data.guilds = {};
  if (!data.levels || typeof data.levels !== 'object') data.levels = {};
  if (!data.tickets || typeof data.tickets !== 'object') data.tickets = {};
  if (!data.privateRooms || typeof data.privateRooms !== 'object') data.privateRooms = {};
  if (!data.punishments || typeof data.punishments !== 'object') data.punishments = {};
  if (!data.counting || typeof data.counting !== 'object') data.counting = {};
  if (!data.requests || typeof data.requests !== 'object') data.requests = {};
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      data = JSON.parse(raw);
      normalizeData();
    }
  } catch (error) {
    console.error('Failed loading data:', error);
    data = {
      guilds: {},
      levels: {},
      tickets: {},
      privateRooms: {},
      punishments: {},
      counting: {},
      requests: {},
    };
  }
}

function saveData() {
  try {
    normalizeData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed saving data:', error);
  }
}

loadData();

// ============================================================
// CONFIG
// ============================================================

function defaultConfig() {
  return {
    autoRole: null,
    staffRole: null,
    chatMuteRole: null,
    voiceMuteRole: null,
    banRole: null,
    vipRole: null,
    adultRole: null,
    welcomeChannel: null,
    logsChannel: null,
    aiChannel: null,
    countingChannel: null,
    suggestionsChannel: null,
    levelChannel: null,
    dailyQuestionChannel: null,
    dailyRiddleChannel: null,
    dailyQuestionLastDate: null,
    dailyRiddleLastDate: null,
    requestCategory: null,
    ticketCategory: null,
    privateCategory: null,
  };
}

function getConfig(guildId) {
  if (!data.guilds[guildId] || typeof data.guilds[guildId] !== 'object') {
    data.guilds[guildId] = defaultConfig();
    saveData();
  } else {
    const defaults = defaultConfig();
    for (const key of Object.keys(defaults)) {
      if (!(key in data.guilds[guildId])) data.guilds[guildId][key] = defaults[key];
    }
  }
  return data.guilds[guildId];
}

// ============================================================
// EMBEDS
// ============================================================

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('💙 ' + title)
    .setDescription(String(description))
    .setTimestamp()
    .setFooter({ text: 'ChillZone • Community Bot' });
}

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('✅ ' + title)
    .setDescription(String(description))
    .setTimestamp()
    .setFooter({ text: 'ChillZone • Community' });
}

// ============================================================
// STAFF
// ============================================================

function isStaff(member) {
  if (!member) return false;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const config = getConfig(member.guild.id);
  return Boolean(config.staffRole && member.roles.cache.has(config.staffRole));
}

// ============================================================
// LOGS
// ============================================================

async function sendLog(guild, title, description) {
  try {
    const config = getConfig(guild.id);
    if (!config.logsChannel) return;

    const channel = guild.channels.cache.get(config.logsChannel);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed(title, description)] });
  } catch (error) {
    console.error('Log error:', error.message || error);
  }
}

// ============================================================
// DURATION
// ============================================================

function parseDuration(input) {
  if (!input) return null;

  const match = /^(\d+)(s|m|h|d|w)$/i.exec(String(input).trim());
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const units = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
  };

  if (!units[unit] || !Number.isFinite(amount) || amount <= 0) return null;
  return amount * units[unit];
}

function safeChannelName(prefix, username) {
  const clean = String(username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
  return (prefix + '-' + (clean || 'user')).slice(0, 90);
}

// ============================================================
// COMMANDS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('מרכז ההגדרות של ChillZone'),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('הגדרת הבוט')
    .addSubcommand(function (sub) {
      return sub
        .setName('role')
        .setDescription('הגדרת רול')
        .addStringOption(function (option) {
          return option
            .setName('type')
            .setDescription('סוג הרול')
            .setRequired(true)
            .addChoices(
              { name: 'Auto Role', value: 'autoRole' },
              { name: 'Staff', value: 'staffRole' },
              { name: 'Chat Mute', value: 'chatMuteRole' },
              { name: 'Voice Mute', value: 'voiceMuteRole' },
              { name: 'Ban', value: 'banRole' },
              { name: 'VIP', value: 'vipRole' },
              { name: '17+', value: 'adultRole' }
            );
        })
        .addRoleOption(function (option) {
          return option.setName('role').setDescription('הרול').setRequired(true);
        });
    })
    .addSubcommand(function (sub) {
      return sub
        .setName('channel')
        .setDescription('הגדרת חדר')
        .addStringOption(function (option) {
          return option
            .setName('type')
            .setDescription('סוג החדר')
            .setRequired(true)
            .addChoices(
              { name: 'Welcome', value: 'welcomeChannel' },
              { name: 'Logs', value: 'logsChannel' },
              { name: 'AI', value: 'aiChannel' },
              { name: 'Counting', value: 'countingChannel' },
              { name: 'Suggestions', value: 'suggestionsChannel' },
              { name: 'Levels', value: 'levelChannel' },
              { name: 'Daily Question', value: 'dailyQuestionChannel' },
              { name: 'Daily Riddle', value: 'dailyRiddleChannel' }
            );
        })
        .addChannelOption(function (option) {
          return option
            .setName('channel')
            .setDescription('החדר')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
        });
    })
    .addSubcommand(function (sub) {
      return sub
        .setName('category')
        .setDescription('הגדרת קטגוריה')
        .addStringOption(function (option) {
          return option
            .setName('type')
            .setDescription('סוג קטגוריה')
            .setRequired(true)
            .addChoices(
              { name: 'Tickets', value: 'ticketCategory' },
              { name: 'Private Rooms', value: 'privateCategory' },
              { name: 'Requests', value: 'requestCategory' }
            );
        })
        .addChannelOption(function (option) {
          return option
            .setName('channel')
            .setDescription('הקטגוריה')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory);
        });
    }),

  new SlashCommandBuilder()
    .setName('chatmute')
    .setDescription('Chat Mute זמני')
    .addUserOption(function (option) {
      return option.setName('user').setDescription('משתמש').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('time').setDescription('לדוגמה: 10m / 1h / 7d').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('reason').setDescription('סיבה');
    }),

  new SlashCommandBuilder()
    .setName('voicemute')
    .setDescription('Voice Mute זמני')
    .addUserOption(function (option) {
      return option.setName('user').setDescription('משתמש').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('time').setDescription('לדוגמה: 10m / 1h / 7d').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('reason').setDescription('סיבה');
    }),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban Role זמני')
    .addUserOption(function (option) {
      return option.setName('user').setDescription('משתמש').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('time').setDescription('לדוגמה: 10m / 1h / 7d').setRequired(true);
    })
    .addStringOption(function (option) {
      return option.setName('reason').setDescription('סיבה');
    }),

  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('שליחת פאנל טיקטים'),

  new SlashCommandBuilder()
    .setName('private-panel')
    .setDescription('שליחת פאנל חדרים פרטיים'),

  new SlashCommandBuilder()
    .setName('roles-panel')
    .setDescription('שליחת פאנל רולים'),

  new SlashCommandBuilder()
    .setName('ban-request-panel')
    .setDescription('שליחת פאנל בקשת הסרת Ban'),

  new SlashCommandBuilder()
    .setName('adult-request-panel')
    .setDescription('שליחת פאנל בקשת 17+'),

  new SlashCommandBuilder()
    .setName('vip-request-panel')
    .setDescription('שליחת פאנל בקשת VIP'),

  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('יצירת Drop')
    .addRoleOption(function (option) {
      return option.setName('role').setDescription('הרול').setRequired(true);
    }),

  new SlashCommandBuilder()
    .setName('counting')
    .setDescription('הגדרת חדר ספירה')
    .addChannelOption(function (option) {
      return option
        .setName('channel')
        .setDescription('חדר הספירה')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText);
    }),

  new SlashCommandBuilder()
    .setName('level')
    .setDescription('בדיקת רמה')
    .addUserOption(function (option) {
      return option.setName('user').setDescription('משתמש');
    }),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('מרכז העזרה'),
].map(function (command) {
  return command.toJSON();
});

// ============================================================
// REGISTER
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('Slash commands registered to guild.');
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log('Global slash commands registered.');
  }
}

// ============================================================
// DAILY QUESTION + RIDDLE
// ============================================================

const DAILY_QUESTIONS = [
  'אם היית יכול להוסיף מערכת אחת ל-ChillZone, איזו מערכת היית מוסיף?',
  'מה המשחק שאתם הכי אוהבים לשחק לאחרונה?',
  'מה הדבר שהכי חשוב לכם בשרת קהילה טוב?',
  'איזה אירוע הייתם רוצים לראות ב-ChillZone?',
  'אם הייתם יכולים לבחור כוח-על אחד, מה הייתם בוחרים?',
  'איזה ערוץ חדש הייתם מוסיפים לשרת?',
  'מה השיר שאתם הכי אוהבים כרגע?',
  'מה המשחק הראשון ששיחקתם בו?',
  'איזה פיצ׳ר בבוט הכי שימושי לדעתכם?',
  'מה הייתם משנים בשרת כדי להפוך אותו לעוד יותר כיף?'
];

const DAILY_RIDDLES = [
  { q: 'מה עולה אבל אף פעם לא יורד?', a: 'הגיל' },
  { q: 'יש לי שיניים אבל אני לא אוכל. מה אני?', a: 'מסרק' },
  { q: 'מה יש לו ידיים אבל הוא לא יכול למחוא כפיים?', a: 'שעון' },
  { q: 'מה נשבר בלי שנוגעים בו?', a: 'הבטחה' },
  { q: 'מה מלא חורים ועדיין מחזיק מים?', a: 'ספוג' },
  { q: 'מה הולך מסביב לעולם אבל נשאר בפינה?', a: 'בול' },
  { q: 'מה תמיד לפניך אבל אי אפשר לראות אותו?', a: 'העתיד' },
  { q: 'מה יש לו צוואר אבל אין לו ראש?', a: 'בקבוק' },
  { q: 'מה אפשר לתפוס אבל אי אפשר לזרוק?', a: 'הצטננות' },
  { q: 'מה נהיה רטוב ככל שהוא מייבש?', a: 'מגבת' }
];

function israelDateParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const out = {};
  for (const part of parts) out[part.type] = part.value;
  return out;
}

function israelToday() {
  const p = israelDateParts();
  return p.year + '-' + p.month + '-' + p.day;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

async function checkDailyPosts() {
  const now = israelDateParts();

  if (
    String(now.hour).padStart(2, '0') !== '07' ||
    String(now.minute).padStart(2, '0') !== '00'
  ) {
    return;
  }

  const today = israelToday();

  for (const guild of client.guilds.cache.values()) {
    const config = getConfig(guild.id);

    if (
      config.dailyQuestionChannel &&
      config.dailyQuestionLastDate !== today
    ) {
      const channel = guild.channels.cache.get(config.dailyQuestionChannel);

      if (channel && channel.isTextBased()) {
        const index =
          Math.abs(
            hashString(guild.id + ':' + today + ':question')
          ) % DAILY_QUESTIONS.length;

        await channel.send({
          embeds: [
            embed(
              '❓ השאלה היומית',
              '# שאלה להיום 💙\n\n' +
                DAILY_QUESTIONS[index] +
                '\n\n💬 כתבו את התשובה שלכם בתגובות!'
            ),
          ],
        }).catch(function () {});

        config.dailyQuestionLastDate = today;
        saveData();

        await sendLog(
          guild,
          '❓ Daily Question',
          'השאלה היומית נשלחה לחדר ' + channel + '.'
        );
      }
    }

    if (
      config.dailyRiddleChannel &&
      config.dailyRiddleLastDate !== today
    ) {
      const channel = guild.channels.cache.get(config.dailyRiddleChannel);

      if (channel && channel.isTextBased()) {
        const index =
          Math.abs(
            hashString(guild.id + ':' + today + ':riddle')
          ) % DAILY_RIDDLES.length;

        await channel.send({
          embeds: [
            embed(
              '🧩 החידה היומית',
              '# חידה להיום 💙\n\n' +
                '**' +
                DAILY_RIDDLES[index].q +
                '**\n\n💡 נראה מי ימצא את התשובה ראשון!'
            ),
          ],
        }).catch(function () {});

        config.dailyRiddleLastDate = today;
        saveData();

        await sendLog(
          guild,
          '🧩 Daily Riddle',
          'החידה היומית נשלחה לחדר ' + channel + '.'
        );
      }
    }
  }
}

// ============================================================
// REQUEST PANELS
// ============================================================

function requestInfo(type) {
  if (type === 'ban') {
    return {
      label: 'הסרת Ban',
      emoji: '🔓',
      prefix: 'ban-request',
    };
  }

  if (type === 'adult') {
    return {
      label: '17+',
      emoji: '🔞',
      prefix: '17-request',
    };
  }

  return {
    label: 'VIP',
    emoji: '💎',
    prefix: 'vip-request',
  };
}

function requestButtons(type, channelId, decided) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('request_approve:' + type + ':' + channelId)
      .setLabel('✅ אשר')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(Boolean(decided)),

    new ButtonBuilder()
      .setCustomId('request_reject:' + type + ':' + channelId)
      .setLabel('❌ דחה')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(Boolean(decided)),

    new ButtonBuilder()
      .setCustomId('request_close:' + type + ':' + channelId)
      .setLabel('🔒 סגור')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function createRequestPanel(interaction, type) {
  const info = requestInfo(type);

  await interaction.channel.send({
    embeds: [
      embed(
        info.emoji + ' בקשת ' + info.label,
        '# רוצה להגיש בקשה? 💙\n\n' +
          'לחץ על הכפתור למטה כדי לפתוח חדר פרטי עם הצוות.\n\n' +
          '👮 הצוות יקבל התראה ויטפל בבקשה.\n' +
          '🤖 אין AI בחדרי הבקשות.'
      ),
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('request_open_' + type)
          .setLabel(info.emoji + ' פתח בקשה')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });

  return interaction.reply({
    embeds: [
      successEmbed(
        'הפאנל נשלח!',
        'פאנל בקשת ' + info.label + ' פעיל עכשיו.'
      ),
    ],
    ephemeral: true,
  });
}

async function openRequest(interaction, type) {
  const guild = interaction.guild;
  const config = getConfig(guild.id);
  const info = requestInfo(type);

  if (!config.requestCategory) {
    return interaction.reply({
      content: '❌ צריך להגדיר Request Category עם /config category.',
      ephemeral: true,
    });
  }

  if (!config.staffRole) {
    return interaction.reply({
      content: '❌ צריך להגדיר Staff Role עם /config role.',
      ephemeral: true,
    });
  }

  const existing = Object.values(data.requests || {}).find(function (request) {
    return (
      request.guildId === guild.id &&
      request.userId === interaction.user.id &&
      request.type === type &&
      request.status === 'open'
    );
  });

  if (existing) {
    return interaction.reply({
      embeds: [
        embed(
          '📨 כבר קיימת בקשה',
          'יש לך כבר בקשה פתוחה כאן:\n<#' +
            existing.channelId +
            '>'
        ),
      ],
      ephemeral: true,
    });
  }

  const channel = await guild.channels.create({
    name: safeChannelName(info.prefix, interaction.user.username),
    type: ChannelType.GuildText,
    parent: config.requestCategory,

    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: config.staffRole,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  if (!data.requests) data.requests = {};

  data.requests[channel.id] = {
    channelId: channel.id,
    guildId: guild.id,
    userId: interaction.user.id,
    type: type,
    status: 'open',
    decision: null,
    decisionBy: null,
    createdAt: Date.now(),
  };

  saveData();

  await channel.send({
    content:
      '<@' +
      interaction.user.id +
      '> <@&' +
      config.staffRole +
      '>',

    embeds: [
      embed(
        info.emoji + ' בקשת ' + info.label,
        '# בקשה חדשה 💙\n\n' +
          '👤 **משתמש:** ' +
          interaction.user +
          '\n' +
          '🆔 **ID:** ' +
          interaction.user.id +
          '\n' +
          '📌 **סוג:** ' +
          info.label +
          '\n\n' +
          '👮 הצוות יכול לאשר, לדחות או לסגור את הבקשה.\n' +
          '🤖 אין AI בחדר הזה.'
      ),
    ],

    components: [requestButtons(type, channel.id, false)],
  });

  await sendLog(
    guild,
    '📨 Request Opened',
    interaction.user +
      ' פתח בקשת **' +
      info.label +
      '**.\nחדר: ' +
      channel
  );

  return interaction.reply({
    embeds: [
      successEmbed(
        'הבקשה נפתחה!',
        'הבקשה שלך כאן: ' + channel
      ),
    ],
    ephemeral: true,
  });
}

// ============================================================
// READY
// ============================================================

client.once('ready', async function () {
  console.log('💙 ChillZone מחובר בתור ' + client.user.tag);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'ChillZone 💙', type: 3 }],
  });

  checkDailyPosts().catch(function (error) {
    console.error('Daily posts error:', error);
  });

  setInterval(function () {
    checkDailyPosts().catch(function (error) {
      console.error('Daily posts error:', error);
    });
  }, 30000);

  try {
    await registerCommands();
  } catch (error) {
    console.error('Command registration error:', error);
  }
});

// ============================================================
// WELCOME
// ============================================================

client.on('guildMemberAdd', async function (member) {
  const config = getConfig(member.guild.id);

  if (config.autoRole) {
    const role = member.guild.roles.cache.get(config.autoRole);

    if (role) {
      await member.roles.add(role).catch(function (error) {
        console.error('Auto role error:', error.message || error);
      });
    }
  }

  if (config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      config.welcomeChannel
    );

    if (channel && channel.isTextBased()) {
      const welcome = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('💙 CHILLZONE')
        .setDescription(
          '# ' +
            member.user.username +
            '\n\n' +
            '## שמחים לראות אותך איתנו! 💙\n\n' +
            'אתה חבר מספר **' +
            member.guild.memberCount +
            '** בשרת.\n\n' +
            '✨ תיהנה, תכיר אנשים ותעשה חיים!'
        )
        .setThumbnail(
          member.user.displayAvatarURL({ size: 512 })
        )
        .setTimestamp()
        .setFooter({
          text: 'ChillZone • Welcome',
        });

      await channel
        .send({
          content: '<@' + member.id + '>',
          embeds: [welcome],
        })
        .catch(function () {});
    }
  }

  await sendLog(
    member.guild,
    '📥 Member Joined',
    member.toString() +
      ' נכנס לשרת.\n\n' +
      '**User ID:** ' +
      member.id
  );
});

// ============================================================
// BOOST
// ============================================================

client.on('guildMemberUpdate', async function (oldMember, newMember) {
  if (!oldMember.premiumSince && newMember.premiumSince) {
    const config = getConfig(newMember.guild.id);

    if (config.welcomeChannel) {
      const channel = newMember.guild.channels.cache.get(
        config.welcomeChannel
      );

      if (channel && channel.isTextBased()) {
        await channel
          .send({
            embeds: [
              embed(
                '🚀 תודה על ה-Boost!',
                '# תודה ענקית ' +
                  newMember +
                  '! 💙\n\n' +
                  'ה-Boost שלך עוזר ל-**ChillZone** לגדול ולהשתפר.\n\n' +
                  'אתה מלך 👑'
              ),
            ],
          })
          .catch(function () {});
      }
    }

    await sendLog(
      newMember.guild,
      '🚀 Server Boost',
      newMember + ' עשה Boost לשרת!'
    );
  }
});

// ============================================================
// AI
// ============================================================

let gemini = null;

if (GEMINI_API_KEY) {
  gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
}

async function askGemini(channelId, userMessage, extraContext) {
  if (!gemini) {
    throw new Error('Gemini API key missing');
  }

  const historyRoot = data.guilds.__ai_history__ || {};

  if (!historyRoot[channelId]) {
    historyRoot[channelId] = [];
  }

  const channelHistory = historyRoot[channelId];

  channelHistory.push({
    role: 'user',
    content: String(userMessage),
  });

  const recent = channelHistory.slice(-20);

  const conversation = recent
    .map(function (message) {
      return (
        (message.role === 'user'
          ? 'User'
          : 'ChillZone AI') +
        ': ' +
        message.content
      );
    })
    .join('\n\n');

  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL,

    systemInstruction:
      'אתה ChillZone AI, עוזר הקהילה הרשמי של שרת ChillZone.\n\n' +
      'אתה צריך להיות חכם, ברור, נחמד, טבעי וקצר כשאפשר.\n' +
      'ענה בעברית כשמדברים איתך בעברית.\n\n' +
      'אל תמציא מידע. אם אינך יודע משהו תגיד שאינך יודע.\n' +
      'אל תטען שאתה צוות. אל תיתן הרשאות ואל תשנה חוקים.\n' +
      'אם משתמש צריך צוות, המלץ לו לפתוח טיקט.\n\n' +
      String(extraContext || '') +
      '\n\n' +
      'השרת נקרא ChillZone. הצבע המרכזי הוא כחול.',
  });

  const result = await model.generateContent(conversation);
  const answer = result.response.text();

  channelHistory.push({
    role: 'assistant',
    content: answer,
  });

  historyRoot[channelId] = channelHistory.slice(-30);
  data.guilds.__ai_history__ = historyRoot;

  saveData();

  return answer;
}

async function handleAI(message) {
  if (!GEMINI_API_KEY) return;

  const ticket = data.tickets[message.channel.id];

  if (ticket) {
    if (ticket.claimedBy) return;

    try {
      const answer = await askGemini(
        message.channel.id,
        message.content,
        'זהו טיקט תמיכה של משתמש. המשתמש עדיין מחכה לצוות. עזור לו בצורה הטובה ביותר. אל תגיד שהטיקט נלקח, אל תסגור את הטיקט ואל תמציא פעולות שביצעת.'
      );

      await message.reply({
        embeds: [embed('🤖 ChillZone AI', answer)],
      });
    } catch (error) {
      console.error('Ticket AI:', error);

      await message
        .reply({
          embeds: [
            embed(
              '⚠️ AI',
              'ה-AI נתקל בבעיה רגעית. נסה שוב בעוד כמה שניות.'
            ),
          ],
        })
        .catch(function () {});
    }

    return;
  }

  const config = getConfig(message.guild.id);

  if (
    config.aiChannel &&
    message.channel.id === config.aiChannel
  ) {
    try {
      const answer = await askGemini(
        message.channel.id,
        message.content,
        ''
      );

      await message.reply({
        embeds: [embed('🤖 ChillZone AI', answer)],
      });
    } catch (error) {
      console.error('AI Channel:', error);

      await message
        .reply({
          embeds: [
            embed(
              '⚠️ AI',
              'ה-AI לא הצליח לענות כרגע. נסה שוב.'
            ),
          ],
        })
        .catch(function () {});
    }
  }
}

// ============================================================
// LEVELS
// ============================================================

const xpCooldown = new Map();

async function handleXP(message) {
  if (message.author.bot || !message.guild) return;

  const key =
    message.guild.id +
    ':' +
    message.author.id;

  const now = Date.now();
  const last = xpCooldown.get(key) || 0;

  if (now - last < 60000) return;

  xpCooldown.set(key, now);

  if (!data.levels[key]) {
    data.levels[key] = {
      xp: 0,
      level: 0,
    };
  }

  const user = data.levels[key];

  user.xp += Math.floor(Math.random() * 16) + 10;

  const needed =
    (user.level + 1) * 100;

  if (user.xp >= needed) {
    user.xp -= needed;
    user.level += 1;

    const config = getConfig(message.guild.id);

    if (config.levelChannel) {
      const channel =
        message.guild.channels.cache.get(
          config.levelChannel
        );

      if (channel && channel.isTextBased()) {
        await channel
          .send({
            embeds: [
              embed(
                '⬆️ LEVEL UP!',
                '# ' +
                  message.author +
                  '\n\n' +
                  'הגעת ל-**Level ' +
                  user.level +
                  '**! 🎉\n\n' +
                  'המשך לדבר ולהיות פעיל כדי לעלות עוד. 💙'
              ),
            ],
          })
          .catch(function () {});
      }
    }

    await sendLog(
      message.guild,
      '⬆️ Level Up',
      message.author +
        ' עלה ל-Level ' +
        user.level +
        '.'
    );
  }

  saveData();
}

// ============================================================
// SUGGESTIONS
// ============================================================

async function handleSuggestion(message) {
  const lower = message.content.toLowerCase();

  if (!lower.startsWith('!הצעה')) return false;

  const suggestion = message.content
    .slice('!הצעה'.length)
    .trim();

  if (!suggestion) {
    await message.reply({
      embeds: [
        embed(
          '💡 הצעה',
          'שימוש נכון:\n\n' +
            code('!הצעה להוסיף חדר מוזיקה')
        ),
      ],
    });

    return true;
  }

  const config = getConfig(message.guild.id);

  const targetChannel = config.suggestionsChannel
    ? message.guild.channels.cache.get(
        config.suggestionsChannel
      )
    : message.channel;

  if (!targetChannel || !targetChannel.isTextBased()) {
    await message
      .reply({
        embeds: [
          embed(
            '⚠️ הצעה',
            'חדר ההצעות לא נמצא או אינו חדר טקסט.'
          ),
        ],
      })
      .catch(function () {});

    return true;
  }

  const suggestionEmbed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('💡 הצעה חדשה לשיפור ChillZone')
    .setDescription(
      '# ' +
        suggestion +
        '\n\n' +
        '👤 **הוצע על ידי:** ' +
        message.author +
        '\n' +
        '🆔 **User ID:** ' +
        message.author.id
    )
    .setThumbnail(
      message.author.displayAvatarURL({
        size: 256,
      })
    )
    .setTimestamp()
    .setFooter({
      text: 'ChillZone • Member Suggestion',
    });

  const sent = await targetChannel.send({
    embeds: [suggestionEmbed],
  });

  await sent.react('👍').catch(function () {});
  await sent.react('👎').catch(function () {});

  await sendLog(
    message.guild,
    '💡 הצעה חדשה',
    '**ממבר:** ' +
      message.author +
      '\n\n' +
      '**הצעה:**\n' +
      suggestion +
      '\n\n' +
      '**חדר:** ' +
      targetChannel
  );

  await message.reply({
    embeds: [
      successEmbed(
        'ההצעה נשלחה!',
        'תודה שעזרת לנו לשפר את ChillZone 💙\n\nהצוות יוכל לראות את ההצעה ולשקול אותה.'
      ),
    ],
  });

  return true;
}

// ============================================================
// COUNTING
// ============================================================

async function handleCounting(message) {
  const config = getConfig(message.guild.id);

  if (!config.countingChannel) return false;
  if (message.channel.id !== config.countingChannel) return false;
  if (!/^\d+$/.test(message.content.trim())) return true;

  if (!data.counting[message.guild.id]) {
    data.counting[message.guild.id] = {
      current: 0,
      lastUser: null,
    };
  }

  const state = data.counting[message.guild.id];
  const number = Number(message.content.trim());
  const expected = state.current + 1;

  if (
    number !== expected ||
    state.lastUser === message.author.id
  ) {
    const brokenAt = state.current;

    await message.delete().catch(function () {});

    state.current = 0;
    state.lastUser = null;

    await message.channel
      .send({
        embeds: [
          embed(
            '💥 הספירה נשברה!',
            'הספירה הגיעה ל-**' +
              brokenAt +
              '**.\n\nמתחילים מחדש מ-**0**.'
          ),
        ],
      })
      .catch(function () {});

    saveData();
    return true;
  }

  state.current = number;
  state.lastUser = message.author.id;

  saveData();

  return true;
}

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on('messageCreate', async function (message) {
  if (message.author.bot || !message.guild) return;

  if (message.content.toLowerCase().startsWith('!h')) {
    const config = getConfig(message.guild.id);

    if (!config.staffRole) {
      await message.reply({
        embeds: [
          embed(
            '⚠️ Staff Role לא הוגדר',
            'אדמין צריך להגדיר אותו עם:\n\n' +
              code('/config role')
          ),
        ],
      });

      return;
    }

    const reason =
      message.content.slice(2).trim() ||
      'המשתמש ביקש עזרה.';

    await message.channel.send({
      content: '<@&' + config.staffRole + '>',

      embeds: [
        embed(
          '🆘 בקשת עזרה',
          '# משתמש צריך עזרה\n\n' +
            '👤 **משתמש:** ' +
            message.author +
            '\n\n' +
            '💬 **בקשה:**\n' +
            reason +
            '\n\n' +
            '👮 **צוות:** טפלו בפנייה בהקדם.'
        ),
      ],
    });

    await sendLog(
      message.guild,
      '🆘 Help Request',
      message.author +
        ' השתמש ב-!h\n\n' +
        reason
    );

    return;
  }

  if (await handleSuggestion(message)) return;
  if (await handleCounting(message)) return;

  if (
    data.requests &&
    data.requests[message.channel.id]
  ) {
    return;
  }

  await handleAI(message);
  await handleXP(message);
});

// ============================================================
// INTERACTIONS
// ============================================================

client.on('interactionCreate', async function (interaction) {
  try {
    // ========================================================
    // SLASH COMMANDS
    // ========================================================

    if (interaction.isChatInputCommand()) {
      const guild = interaction.guild;

      if (!guild) {
        return interaction.reply({
          content: '❌ הפקודה זמינה רק בשרת.',
          ephemeral: true,
        });
      }

      const member =
        await guild.members.fetch(
          interaction.user.id
        ).catch(function () {
          return null;
        });

      const staffCommands = [
        'setup',
        'config',
        'chatmute',
        'voicemute',
        'ban',
        'ticket-panel',
        'private-panel',
        'roles-panel',
        'ban-request-panel',
        'adult-request-panel',
        'vip-request-panel',
        'drop',
        'counting',
      ];

      if (
        staffCommands.includes(interaction.commandName) &&
        !isStaff(member)
      ) {
        return interaction.reply({
          embeds: [
            embed(
              '🔒 אין הרשאה',
              'הפקודה הזו זמינה לצוות בלבד.'
            ),
          ],
          ephemeral: true,
        });
      }

      // ======================================================
      // SETUP
      // ======================================================

      if (interaction.commandName === 'setup') {
        return interaction.reply({
          embeds: [
            embed(
              '⚙️ ChillZone Setup',
              '# מערכת ההגדרות\n\n' +
                '🎭 **רולים**\n' +
                code('/config role') +
                '\n\n' +
                '📁 **חדרים**\n' +
                code('/config channel') +
                '\n\n' +
                '📂 **קטגוריות**\n' +
                code('/config category') +
                '\n\n' +
                '🎫 **Tickets**\n' +
                code('/ticket-panel') +
                '\n\n' +
                '🏠 **Private Rooms**\n' +
                code('/private-panel') +
                '\n\n' +
                '🎭 **Roles**\n' +
                code('/roles-panel') +
                '\n\n' +
                '📨 **בקשות Ban / 17+ / VIP**\n' +
                code('/ban-request-panel') +
                '  ' +
                code('/adult-request-panel') +
                '  ' +
                code('/vip-request-panel') +
                '\n\n' +
                '🎁 **Drops**\n' +
                code('/drop') +
                '\n\n' +
                '💡 **Suggestions**\n' +
                code('!הצעה הטקסט') +
                '\n\n' +
                '🆘 **Help**\n' +
                code('!h')
            ),
          ],
          ephemeral: true,
        });
      }

      // ======================================================
      // CONFIG
      // ======================================================

      if (interaction.commandName === 'config') {
        const sub = interaction.options.getSubcommand();
        const config = getConfig(guild.id);

        if (sub === 'role') {
          const type =
            interaction.options.getString('type');

          const role =
            interaction.options.getRole('role');

          config[type] = role.id;
          saveData();

          return interaction.reply({
            embeds: [
              successEmbed(
                'הרול הוגדר!',
                '**' +
                  type +
                  '** → ' +
                  role
              ),
            ],
            ephemeral: true,
          });
        }

        if (sub === 'channel') {
          const type =
            interaction.options.getString('type');

          const channel =
            interaction.options.getChannel('channel');

          config[type] = channel.id;
          saveData();

          return interaction.reply({
            embeds: [
              successEmbed(
                'החדר הוגדר!',
                '**' +
                  type +
                  '** → ' +
                  channel
              ),
            ],
            ephemeral: true,
          });
        }

        if (sub === 'category') {
          const type =
            interaction.options.getString('type');

          const channel =
            interaction.options.getChannel('channel');

          config[type] = channel.id;
          saveData();

          return interaction.reply({
            embeds: [
              successEmbed(
                'הקטגוריה הוגדרה!',
                '**' +
                  type +
                  '** → ' +
                  channel
              ),
            ],
            ephemeral: true,
          });
        }
      }

      // ======================================================
      // PUNISHMENT HELPER
      // ======================================================

      if (
        ['chatmute', 'voicemute', 'ban'].includes(
          interaction.commandName
        )
      ) {
        const config = getConfig(guild.id);

        const type = interaction.commandName;

        const roleKey =
          type === 'chatmute'
            ? 'chatMuteRole'
            : type === 'voicemute'
              ? 'voiceMuteRole'
              : 'banRole';

        const label =
          type === 'chatmute'
            ? 'Chat Mute'
            : type === 'voicemute'
              ? 'Voice Mute'
              : 'Ban Role';

        if (!config[roleKey]) {
          return interaction.reply({
            content:
              '❌ ' +
              label +
              ' Role לא הוגדר.',
            ephemeral: true,
          });
        }

        const user =
          interaction.options.getUser('user');

        const target =
          await guild.members.fetch(user.id)
            .catch(function () {
              return null;
            });

        if (!target) {
          return interaction.reply({
            content:
              '❌ המשתמש לא נמצא בשרת.',
            ephemeral: true,
          });
        }

        if (target.id === interaction.user.id) {
          return interaction.reply({
            content:
              '❌ אי אפשר להעניש את עצמך.',
            ephemeral: true,
          });
        }

        const time =
          interaction.options.getString('time');

        const reason =
          interaction.options.getString('reason') ||
          'לא צוינה סיבה.';

        const duration =
          parseDuration(time);

        if (!duration) {
          return interaction.reply({
            content:
              '❌ זמן לא תקין. השתמש לדוגמה ב-10m, 1h או 7d.',
            ephemeral: true,
          });
        }

        const role =
          guild.roles.cache.get(config[roleKey]);

        if (!role) {
          return interaction.reply({
            content: '❌ הרול לא נמצא.',
            ephemeral: true,
          });
        }

        if (
          role.position >=
          guild.members.me.roles.highest.position
        ) {
          return interaction.reply({
            content:
              '❌ הרול חייב להיות מתחת לרול הגבוה ביותר של הבוט.',
            ephemeral: true,
          });
        }

        await target.roles.add(role);

        if (
          type === 'voicemute' &&
          target.voice &&
          target.voice.channel
        ) {
          await target.voice
            .setMute(true, reason)
            .catch(function () {});
        }

        const id =
          guild.id +
          ':' +
          target.id +
          ':' +
          type;

        data.punishments[id] = {
          guildId: guild.id,
          userId: target.id,
          roleId: role.id,
          type: type,
          expires: Date.now() + duration,
        };

        saveData();

        await interaction.reply({
          embeds: [
            embed(
              '🔇 ' + label,
              '# ' +
                target.user.username +
                '\n\n' +
                '🔇 **משך:** ' +
                time +
                '\n' +
                '📝 **סיבה:** ' +
                reason +
                '\n\n' +
                'העונש יוסר אוטומטית.'
            ),
          ],
        });

        await sendLog(
          guild,
          '⚖️ ' + label,
          target +
            ' קיבל ' +
            label +
            ' ל-' +
            time +
            '.\nסיבה: ' +
            reason
        );

        return;
      }

      // ======================================================
      // REQUEST PANELS
      // ======================================================

      if (
        interaction.commandName ===
        'ban-request-panel'
      ) {
        return createRequestPanel(
          interaction,
          'ban'
        );
      }

      if (
        interaction.commandName ===
        'adult-request-panel'
      ) {
        return createRequestPanel(
          interaction,
          'adult'
        );
      }

      if (
        interaction.commandName ===
        'vip-request-panel'
      ) {
        return createRequestPanel(
          interaction,
          'vip'
        );
      }

      // ======================================================
      // TICKET PANEL
      // ======================================================

      if (
        interaction.commandName ===
        'ticket-panel'
      ) {
        const menu =
          new StringSelectMenuBuilder()
            .setCustomId('ticket_create')
            .setPlaceholder(
              '🎫 בחר את סוג הפנייה שלך'
            )
            .addOptions(
              {
                label: 'תמיכה',
                description: 'אני צריך עזרה',
                value: 'support',
                emoji: '🛠️',
              },
              {
                label: 'דיווח',
                description: 'דיווח על משתמש',
                value: 'report',
                emoji: '🚨',
              },
              {
                label: 'ערעור',
                description: 'ערעור על עונש',
                value: 'appeal',
                emoji: '🔨',
              },
              {
                label: 'VIP',
                description: 'שאלות בנושא VIP',
                value: 'vip',
                emoji: '💎',
              },
              {
                label: 'שאלה',
                description: 'שאלה כללית',
                value: 'question',
                emoji: '❓',
              }
            );

        await interaction.channel.send({
          embeds: [
            embed(
              '🎫 CHILLZONE SUPPORT',
              '# צריכים עזרה? אנחנו כאן 💙\n\n' +
                'בחרו את סוג הפנייה מהתפריט למטה.\n\n' +
                '🤖 **AI SUPPORT**\nמיד לאחר פתיחת הטיקט ה-AI יעזור לכם.\n\n' +
                '👮 **צוות**\nברגע שאיש צוות לוקח את הטיקט, ה-AI מפסיק אוטומטית.\n\n' +
                '🔒 הפרטיות של הטיקט נשמרת.'
            ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              menu
            ),
          ],
        });

        return interaction.reply({
          embeds: [
            successEmbed(
              'פאנל הטיקטים נשלח!',
              'הפאנל פעיל עכשיו.'
            ),
          ],
          ephemeral: true,
        });
      }

      // ======================================================
      // PRIVATE PANEL
      // ======================================================

      if (
        interaction.commandName ===
        'private-panel'
      ) {
        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                'private_create'
              )
              .setLabel(
                '🏠 צור חדר חדש'
              )
              .setStyle(
                ButtonStyle.Primary
              )
          );

        await interaction.channel.send({
          embeds: [
            embed(
              '🏠 PRIVATE ROOMS',
              '# החדר הפרטי שלך 💙\n\n' +
                'רוצה לפתוח שיחה פרטית?\n\n' +
                'לחץ על **צור חדר חדש**.\n\n' +
                'אחרי היצירה תקבל:\n' +
                '💬 חדר שיחה פרטי\n' +
                '⚙️ חדר הגדרות\n\n' +
                'בחדר ההגדרות אפשר:\n' +
                '👥 להוסיף אנשים\n' +
                '🔒 לפתוח / לסגור את החדר\n' +
                '🗑️ למחוק את החדר'
            ),
          ],
          components: [row],
        });

        return interaction.reply({
          embeds: [
            successEmbed(
              'הפאנל נשלח!',
              'הממברים יכולים עכשיו ליצור חדרים פרטיים.'
            ),
          ],
          ephemeral: true,
        });
      }

      // ======================================================
      // ROLES PANEL
      // ======================================================

      if (
        interaction.commandName ===
        'roles-panel'
      ) {
        const menu =
          new StringSelectMenuBuilder()
            .setCustomId('roles_select')
            .setPlaceholder(
              '🎭 בחר את הרול שלך'
            )
            .addOptions(
              {
                label: 'VIP',
                description: 'קבלת רול VIP',
                value: 'vip',
                emoji: '💎',
              },
              {
                label: '17+',
                description: 'קבלת רול 17+',
                value: 'adult',
                emoji: '🔞',
              },
              {
                label: 'הסר VIP',
                description: 'הסרת VIP',
                value: 'remove_vip',
                emoji: '❌',
              },
              {
                label: 'הסר Ban',
                description: 'הסרת Ban Role',
                value: 'remove_ban',
                emoji: '🔓',
              }
            );

        await interaction.channel.send({
          embeds: [
            embed(
              '🎭 CHILLZONE ROLES',
              '# בחר את הרול שלך 💙\n\n' +
                'בחר אפשרות מהתפריט למטה.'
            ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              menu
            ),
          ],
        });

        return interaction.reply({
          content:
            '✅ פאנל הרולים נשלח.',
          ephemeral: true,
        });
      }

      // ======================================================
      // DROP
      // ======================================================

      if (
        interaction.commandName ===
        'drop'
      ) {
        const role =
          interaction.options.getRole(
            'role'
          );

        if (
          role.position >=
          guild.members.me.roles.highest.position
        ) {
          return interaction.reply({
            content:
              '❌ הרול חייב להיות מתחת לרול של הבוט.',
            ephemeral: true,
          });
        }

        const button =
          new ButtonBuilder()
            .setCustomId(
              'drop:' + role.id
            )
            .setLabel(
              '🎁 קח את הרול'
            )
            .setStyle(
              ButtonStyle.Primary
            );

        await interaction.channel.send({
          embeds: [
            embed(
              '🎁 DROP!',
              '# מי הראשון?\n\n' +
                'הרול **' +
                role.name +
                '** מחכה למישהו אחד.\n\n' +
                '🏆 הראשון שלוחץ על הכפתור מקבל אותו!'
            ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              button
            ),
          ],
        });

        return interaction.reply({
          content:
            '✅ ה-Drop נשלח.',
          ephemeral: true,
        });
      }

      // ======================================================
      // COUNTING SETUP
      // ======================================================

      if (
        interaction.commandName ===
        'counting'
      ) {
        const channel =
          interaction.options.getChannel(
            'channel'
          );

        const config =
          getConfig(guild.id);

        config.countingChannel =
          channel.id;

        data.counting[guild.id] = {
          current: 0,
          lastUser: null,
        };

        saveData();

        return interaction.reply({
          embeds: [
            successEmbed(
              'חדר הספירה הוגדר!',
              '🔢 ' + channel
            ),
          ],
        });
      }

      // ======================================================
      // LEVEL
      // ======================================================

      if (
        interaction.commandName ===
        'level'
      ) {
        const user =
          interaction.options.getUser(
            'user'
          ) ||
          interaction.user;

        const key =
          guild.id +
          ':' +
          user.id;

        const level =
          data.levels[key] || {
            xp: 0,
            level: 0,
          };

        return interaction.reply({
          embeds: [
            embed(
              '📊 CHILLZONE LEVELS',
              '# ' +
                user.username +
                '\n\n' +
                '🏆 **Level:** ' +
                level.level +
                '\n' +
                '✨ **XP:** ' +
                level.xp +
                '\n\n' +
                'תמשיכו להיות פעילים כדי לעלות רמות! 💙'
            ),
          ],
        });
      }

      // ======================================================
      // HELP
      // ======================================================

      if (
        interaction.commandName ===
        'help'
      ) {
        return interaction.reply({
          embeds: [
            embed(
              'CHILLZONE',
              '# 💙 מרכז ChillZone\n\n' +
                '🤖 **AI**\nשאלות ותשובות חכמות.\n\n' +
                '🎫 **Tickets**\nפתיחת טיקט עם AI עד לקיחת צוות.\n\n' +
                '🏠 **Private Rooms**\nחדרי שיחה פרטיים עם מערכת שליטה.\n\n' +
                '💡 **Suggestions**\nשלחו הצעות עם:\n' +
                code('!הצעה הטקסט') +
                '\n\n' +
                '🆘 **Help**\n' +
                code('!h') +
                '\n\n' +
                '📊 **Levels**\nמערכת XP ורמות.\n\n' +
                '🎭 **Roles**\nמערכת רולים.\n\n' +
                '🎁 **Drops**\nDrops עם כפתורים.'
            ),
          ],
        });
      }
    }    // ========================================================
    // REQUEST OPEN
    // ========================================================

    if (
      interaction.isButton() &&
      ['ban', 'adult', 'vip'].some(function (type) {
        return (
          interaction.customId ===
          'request_open_' + type
        );
      })
    ) {
      const type =
        interaction.customId.replace(
          'request_open_',
          ''
        );

      return openRequest(
        interaction,
        type
      );
    }

    // ========================================================
    // REQUEST ACTIONS
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        'request_'
      )
    ) {
      const parts =
        interaction.customId.split(':');

      const action =
        parts[0].replace(
          'request_',
          ''
        );

      const type = parts[1];
      const channelId = parts[2];

      const request =
        data.requests &&
        data.requests[channelId];

      if (!request) {
        return interaction.reply({
          content:
            '❌ הבקשה לא נמצאה.',
          ephemeral: true,
        });
      }

      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            '❌ רק הצוות יכול לטפל בבקשות.',
          ephemeral: true,
        });
      }

      const info =
        requestInfo(type);

      // ======================================================
      // REQUEST CLOSE
      // ======================================================

      if (action === 'close') {
        delete data.requests[channelId];
        saveData();

        await sendLog(
          interaction.guild,
          '🔒 Request Closed',
          interaction.user +
            ' סגר בקשת ' +
            info.label +
            ' של <@' +
            request.userId +
            '>.'
        );

        await interaction.reply({
          embeds: [
            embed(
              '🔒 הבקשה נסגרת',
              'החדר יימחק בעוד 5 שניות.'
            ),
          ],
        });

        setTimeout(function () {
          interaction.channel
            .delete()
            .catch(function () {});
        }, 5000);

        return;
      }

      // ======================================================
      // ALREADY DECIDED
      // ======================================================

      if (
        request.status !==
        'open'
      ) {
        return interaction.reply({
          content:
            '❌ הבקשה כבר קיבלה החלטה.',
          ephemeral: true,
        });
      }

      const approved =
        action === 'approve';

      request.status =
        approved
          ? 'approved'
          : 'rejected';

      request.decision =
        approved
          ? 'approve'
          : 'reject';

      request.decisionBy =
        interaction.user.id;

      request.decidedAt =
        Date.now();

      saveData();

      const decisionText =
        approved
          ? 'אושרה ✅'
          : 'נדחתה ❌';

      await interaction.message
        .edit({
          embeds: [
            embed(
              info.emoji +
                ' בקשת ' +
                info.label,
              '# הבקשה ' +
                decisionText +
                '\n\n' +
                '👤 **משתמש:** <@' +
                request.userId +
                '>\n' +
                '👮 **טופל על ידי:** ' +
                interaction.user +
                '\n\n' +
                'החלטת הצוות נשמרה.'
            ),
          ],
          components: [
            requestButtons(
              type,
              channelId,
              true
            ),
          ],
        })
        .catch(function () {});

      const user =
        await client.users
          .fetch(request.userId)
          .catch(function () {
            return null;
          });

      if (user) {
        await user
          .send({
            embeds: [
              embed(
                approved
                  ? '✅ הבקשה אושרה'
                  : '❌ הבקשה נדחתה',
                'בקשת **' +
                  info.label +
                  '** שלך בשרת **' +
                  interaction.guild.name +
                  '** ' +
                  decisionText +
                  '.\n\n' +
                  '👮 טופל על ידי: ' +
                  interaction.user.username
              ),
            ],
          })
          .catch(function () {});
      }

      await sendLog(
        interaction.guild,
        approved
          ? '✅ Request Approved'
          : '❌ Request Rejected',
        interaction.user +
          ' ' +
          (approved
            ? 'אישר'
            : 'דחה') +
          ' בקשת ' +
          info.label +
          ' של <@' +
          request.userId +
          '>.'
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            approved
              ? 'הבקשה אושרה!'
              : 'הבקשה נדחתה!',
            'המשתמש עודכן בהודעה פרטית.'
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // TICKET CREATE
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        'ticket_create'
    ) {
      const guild =
        interaction.guild;

      const config =
        getConfig(guild.id);

      if (!config.ticketCategory) {
        return interaction.reply({
          embeds: [
            embed(
              '⚠️ חסרה הגדרה',
              'אדמין צריך להגדיר Ticket Category.'
            ),
          ],
          ephemeral: true,
        });
      }

      const existing =
        Object.values(
          data.tickets
        ).find(function (ticket) {
          return (
            ticket.guildId ===
              guild.id &&
            ticket.userId ===
              interaction.user.id
          );
        });

      if (existing) {
        return interaction.reply({
          embeds: [
            embed(
              '🎫 כבר יש לך טיקט',
              'הטיקט שלך נמצא כאן:\n<#' +
                existing.channelId +
                '>'
            ),
          ],
          ephemeral: true,
        });
      }

      const type =
        interaction.values[0];

      const channel =
        await guild.channels.create({
          name: safeChannelName(
            'ticket',
            interaction.user.username
          ),
          type: ChannelType.GuildText,
          parent:
            config.ticketCategory,

          permissionOverwrites: [
            {
              id:
                guild.roles.everyone.id,
              deny: [
                PermissionFlagsBits.ViewChannel,
              ],
            },

            {
              id:
                interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });

      if (config.staffRole) {
        await channel.permissionOverwrites.create(
          config.staffRole,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          }
        );
      }

      data.tickets[channel.id] = {
        channelId: channel.id,
        guildId: guild.id,
        userId:
          interaction.user.id,
        claimedBy: null,
        type: type,
        createdAt: Date.now(),
      };

      saveData();

      const controls =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              'ticket_claim'
            )
            .setLabel(
              '👤 קח טיקט'
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              'ticket_close'
            )
            .setLabel(
              '🔒 סגור טיקט'
            )
            .setStyle(
              ButtonStyle.Danger
            )
        );

      await channel.send({
        content:
          '<@' +
          interaction.user.id +
          '>',

        embeds: [
          embed(
            '🎫 CHILLZONE TICKET',
            '# הטיקט שלך נפתח 💙\n\n' +
              '📁 **סוג:** ' +
              type +
              '\n\n' +
              '## 🤖 AI SUPPORT\n' +
              'ה-AI פעיל עכשיו ויעזור לך.\n\n' +
              '## 👮 STAFF\n' +
              'ברגע שאיש צוות ילחץ על **קח טיקט** — ה-AI יפסיק לענות.\n\n' +
              '🔒 הטיקט פרטי.'
          ),
        ],

        components: [controls],
      });

      await sendLog(
        guild,
        '🎫 Ticket Created',
        interaction.user +
          ' פתח טיקט מסוג **' +
          type +
          '**.\n\nחדר: ' +
          channel
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'הטיקט נפתח!',
            'הטיקט שלך כאן:\n' +
              channel
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // PRIVATE CREATE
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'private_create'
    ) {
      const guild =
        interaction.guild;

      const config =
        getConfig(guild.id);

      if (!config.privateCategory) {
        return interaction.reply({
          embeds: [
            embed(
              '⚠️ חסרה הגדרה',
              'אדמין צריך להגדיר Private Rooms Category.'
            ),
          ],
          ephemeral: true,
        });
      }

      const already =
        Object.values(
          data.privateRooms
        ).find(function (room) {
          return (
            room.guildId ===
              guild.id &&
            room.ownerId ===
              interaction.user.id
          );
        });

      if (already) {
        return interaction.reply({
          embeds: [
            embed(
              '🏠 כבר יש לך חדר',
              'החדר שלך נמצא כאן:\n<#' +
                already.chatChannelId +
                '>'
            ),
          ],
          ephemeral: true,
        });
      }

      const owner =
        interaction.user;

      const overwrites = [
        {
          id:
            guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel,
          ],
        },

        {
          id: owner.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      const chat =
        await guild.channels.create({
          name: safeChannelName(
            'chat',
            owner.username
          ),
          type:
            ChannelType.GuildText,
          parent:
            config.privateCategory,
          permissionOverwrites:
            overwrites,
        });

      const settings =
        await guild.channels.create({
          name: safeChannelName(
            'settings',
            owner.username
          ),
          type:
            ChannelType.GuildText,
          parent:
            config.privateCategory,
          permissionOverwrites:
            overwrites,
        });

      data.privateRooms[
        settings.id
      ] = {
        guildId:
          guild.id,
        ownerId:
          owner.id,
        chatChannelId:
          chat.id,
        settingsChannelId:
          settings.id,
        members: [owner.id],
        locked: true,
      };

      saveData();

      await chat.send({
        embeds: [
          embed(
            '🏠 PRIVATE ROOM',
            '# החדר הפרטי שלך מוכן! 💙\n\n' +
              '👑 **בעל החדר:** ' +
              owner +
              '\n\n' +
              'זהו חדר שיחה פרטי.\n\n' +
              '⚙️ לניהול החדר עבור ל:\n' +
              settings +
              '\n\n' +
              'שם אפשר להוסיף אנשים, לפתוח את החדר או למחוק אותו.'
          ),
        ],
      });

      const settingsButtons =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              'private_add'
            )
            .setLabel(
              '👥 הוסף משתמש'
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              'private_toggle'
            )
            .setLabel(
              '🔓 פתח / נעל'
            )
            .setStyle(
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              'private_delete'
            )
            .setLabel(
              '🗑️ מחק חדר'
            )
            .setStyle(
              ButtonStyle.Danger
            )
        );

      await settings.send({
        embeds: [
          embed(
            '⚙️ PRIVATE ROOM SETTINGS',
            '# ניהול החדר שלך 💙\n\n' +
              '👑 **בעלים:** ' +
              owner +
              '\n\n' +
              '👥 **חברי החדר:**\n<@' +
              owner.id +
              '>\n\n' +
              '🔒 **מצב:** נעול\n\n' +
              'השתמש בכפתורים למטה כדי לנהל את החדר.'
          ),
        ],
        components: [
          settingsButtons,
        ],
      });

      await sendLog(
        guild,
        '🏠 Private Room Created',
        owner +
          ' יצר חדר פרטי.\n\n💬 ' +
          chat +
          '\n⚙️ ' +
          settings
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'החדר נוצר!',
            '💬 **שיחה:** ' +
              chat +
              '\n\n⚙️ **הגדרות:** ' +
              settings
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // PRIVATE ADD
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'private_add'
    ) {
      const room =
        data.privateRooms[
          interaction.channel.id
        ];

      if (!room) {
        return interaction.reply({
          content:
            '❌ זה לא חדר הגדרות של Private Room.',
          ephemeral: true,
        });
      }

      if (
        room.ownerId !==
        interaction.user.id
      ) {
        return interaction.reply({
          content:
            '❌ רק בעל החדר יכול לנהל אותו.',
          ephemeral: true,
        });
      }

      await interaction.reply({
        content:
          '👤 כתוב עכשיו את ה-ID של המשתמש שאתה רוצה להוסיף.',
        ephemeral: true,
      });

      const collector =
        interaction.channel.createMessageCollector({
          filter: function (message) {
            return (
              message.author.id ===
              interaction.user.id
            );
          },
          time: 30000,
          max: 1,
        });

      collector.on(
        'collect',
        async function (message) {
          const userId =
            message.content
              .replace(/[<@!>]/g, '')
              .trim();

          const user =
            await guildMember(
              interaction.guild,
              userId
            );

          if (!user) {
            await message
              .reply(
                '❌ משתמש לא נמצא.'
              )
              .catch(function () {});

            return;
          }

          if (
            room.members.includes(
              user.id
            )
          ) {
            await message
              .reply(
                '❌ המשתמש כבר בחדר.'
              )
              .catch(function () {});

            return;
          }

          room.members.push(
            user.id
          );

          const chat =
            interaction.guild.channels.cache.get(
              room.chatChannelId
            );

          if (chat) {
            await chat.permissionOverwrites.create(
              user.id,
              {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
              }
            );
          }

          saveData();

          await message
            .reply({
              embeds: [
                successEmbed(
                  'המשתמש נוסף!',
                  user +
                    ' קיבל גישה לחדר.'
                ),
              ],
            })
            .catch(function () {});

          await sendLog(
            interaction.guild,
            '👥 Private Room Member Added',
            user +
              ' נוסף לחדר של <@' +
              room.ownerId +
              '>.'
          );
        }
      );

      return;
    }

    // ========================================================
    // PRIVATE TOGGLE
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'private_toggle'
    ) {
      const room =
        data.privateRooms[
          interaction.channel.id
        ];

      if (!room) {
        return interaction.reply({
          content:
            '❌ החדר לא נמצא.',
          ephemeral: true,
        });
      }

      if (
        room.ownerId !==
        interaction.user.id
      ) {
        return interaction.reply({
          content:
            '❌ רק בעל החדר יכול לעשות את זה.',
          ephemeral: true,
        });
      }

      const chat =
        interaction.guild.channels.cache.get(
          room.chatChannelId
        );

      if (!chat) {
        return interaction.reply({
          content:
            '❌ חדר השיחה לא נמצא.',
          ephemeral: true,
        });
      }

      room.locked =
        !room.locked;

      await chat.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          ViewChannel: false,
        }
      );

      for (
        const memberId of room.members
      ) {
        await chat.permissionOverwrites.edit(
          memberId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          }
        ).catch(function () {});
      }

      saveData();

      return interaction.reply({
        embeds: [
          successEmbed(
            room.locked
              ? 'החדר ננעל'
              : 'החדר נפתח',
            room.locked
              ? 'רק המשתמשים שהוגדרו בחדר יכולים לראות אותו.'
              : 'החדר עדיין פרטי, אבל כל חברי הרשימה יכולים להיכנס.'
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // PRIVATE DELETE
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'private_delete'
    ) {
      const room =
        data.privateRooms[
          interaction.channel.id
        ];

      if (!room) {
        return interaction.reply({
          content:
            '❌ החדר לא נמצא.',
          ephemeral: true,
        });
      }

      if (
        room.ownerId !==
        interaction.user.id
      ) {
        return interaction.reply({
          content:
            '❌ רק בעל החדר יכול למחוק אותו.',
          ephemeral: true,
        });
      }

      const chat =
        interaction.guild.channels.cache.get(
          room.chatChannelId
        );

      const settings =
        interaction.channel;

      delete data.privateRooms[
        interaction.channel.id
      ];

      saveData();

      await interaction.reply({
        embeds: [
          embed(
            '🗑️ מוחק חדר',
            'החדר הפרטי יימחק בעוד 3 שניות.'
          ),
        ],
      });

      await sendLog(
        interaction.guild,
        '🗑️ Private Room Deleted',
        interaction.user +
          ' מחק את החדר הפרטי.'
      );

      setTimeout(
        async function () {
          await chat
            ?.delete()
            .catch(function () {});

          await settings
            ?.delete()
            .catch(function () {});
        },
        3000
      );

      return;
    }

    // ========================================================
    // ROLE SELECT
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        'roles_select'
    ) {
      const config =
        getConfig(
          interaction.guild.id
        );

      const choice =
        interaction.values[0];

      if (choice === 'vip') {
        if (!config.vipRole) {
          return interaction.reply({
            content:
              '❌ VIP Role לא הוגדר.',
            ephemeral: true,
          });
        }

        const role =
          interaction.guild.roles.cache.get(
            config.vipRole
          );

        if (!role) {
          return interaction.reply({
            content:
              '❌ VIP Role לא נמצא.',
            ephemeral: true,
          });
        }

        if (
          role.position >=
          interaction.guild.members.me
            .roles.highest.position
        ) {
          return interaction.reply({
            content:
              '❌ הבוט לא יכול לתת את הרול הזה.',
            ephemeral: true,
          });
        }

        await interaction.member.roles
          .add(role)
          .catch(function () {});

        return interaction.reply({
          embeds: [
            successEmbed(
              'VIP נוסף!',
              'קיבלת את רול ה-VIP 💎'
            ),
          ],
          ephemeral: true,
        });
      }

      if (choice === 'adult') {
        if (!config.adultRole) {
          return interaction.reply({
            content:
              '❌ 17+ Role לא הוגדר.',
            ephemeral: true,
          });
        }

        const role =
          interaction.guild.roles.cache.get(
            config.adultRole
          );

        if (!role) {
          return interaction.reply({
            content:
              '❌ 17+ Role לא נמצא.',
            ephemeral: true,
          });
        }

        if (
          role.position >=
          interaction.guild.members.me
            .roles.highest.position
        ) {
          return interaction.reply({
            content:
              '❌ הבוט לא יכול לתת את הרול הזה.',
            ephemeral: true,
          });
        }

        await interaction.member.roles
          .add(role)
          .catch(function () {});

        return interaction.reply({
          embeds: [
            successEmbed(
              '17+ נוסף!',
              'קיבלת את רול ה-17+ 🔞'
            ),
          ],
          ephemeral: true,
        });
      }

      if (
        choice ===
        'remove_vip'
      ) {
        if (config.vipRole) {
          await interaction.member.roles
            .remove(
              config.vipRole
            )
            .catch(function () {});
        }

        return interaction.reply({
          embeds: [
            successEmbed(
              'VIP הוסר',
              'רול ה-VIP הוסר ממך.'
            ),
          ],
          ephemeral: true,
        });
      }

      if (
        choice ===
        'remove_ban'
      ) {
        if (config.banRole) {
          await interaction.member.roles
            .remove(
              config.banRole
            )
            .catch(function () {});
        }

        return interaction.reply({
          embeds: [
            successEmbed(
              'Ban הוסר',
              'רול ה-Ban הוסר.'
            ),
          ],
          ephemeral: true,
        });
      }
    }

    // ========================================================
    // DROP BUTTON
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        'drop:'
      )
    ) {
      const roleId =
        interaction.customId
          .split(':')[1];

      const role =
        interaction.guild.roles.cache.get(
          roleId
        );

      if (!role) {
        return interaction.reply({
          content:
            '❌ הרול לא נמצא.',
          ephemeral: true,
        });
      }

      if (
        role.position >=
        interaction.guild.members.me
          .roles.highest.position
      ) {
        return interaction.reply({
          content:
            '❌ הרול חייב להיות מתחת לרול של הבוט.',
          ephemeral: true,
        });
      }

      if (
        interaction.member.roles.cache.has(
          role.id
        )
      ) {
        return interaction.reply({
          content:
            '❌ כבר יש לך את הרול הזה.',
          ephemeral: true,
        });
      }

      const added =
        await interaction.member.roles
          .add(role)
          .then(function () {
            return true;
          })
          .catch(function () {
            return false;
          });

      if (!added) {
        return interaction.reply({
          content:
            '❌ הבוט לא הצליח לתת את הרול. בדוק הרשאות ומיקום רולים.',
          ephemeral: true,
        });
      }

      await interaction.message
        .edit({
          embeds: [
            embed(
              '🎁 DROP הסתיים!',
              '# יש לנו זוכה! 🏆\n\n' +
                interaction.user +
                ' היה הראשון ולקח את ' +
                role +
                '!'
            ),
          ],
          components: [],
        })
        .catch(function () {});

      return interaction.reply({
        embeds: [
          successEmbed(
            'זכית!',
            'קיבלת את ' +
              role +
              ' 🎉'
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // TICKET CLAIM
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'ticket_claim'
    ) {
      const ticket =
        data.tickets[
          interaction.channel.id
        ];

      if (!ticket) {
        return interaction.reply({
          content:
            '❌ טיקט לא נמצא.',
          ephemeral: true,
        });
      }

      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            '❌ רק צוות יכול לקחת טיקט.',
          ephemeral: true,
        });
      }

      if (ticket.claimedBy) {
        return interaction.reply({
          content:
            '❌ הטיקט כבר נלקח על ידי <@' +
            ticket.claimedBy +
            '>.',
          ephemeral: true,
        });
      }

      ticket.claimedBy =
        interaction.user.id;

      saveData();

      await interaction.channel.send({
        embeds: [
          embed(
            '👤 TICKET CLAIMED',
            '# הצוות הגיע! 💙\n\n' +
              interaction.user +
              ' לקח את הטיקט.\n\n' +
              '🔕 **ה-AI הופסק אוטומטית.**\n\n' +
              'מכאן הצוות מטפל בפנייה.'
          ),
        ],
      });

      await sendLog(
        interaction.guild,
        '👤 Ticket Claimed',
        interaction.user +
          ' לקח את הטיקט של <@' +
          ticket.userId +
          '>.'
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'הטיקט נלקח!',
            'ה-AI הופסק. עכשיו הצוות מטפל בטיקט.'
          ),
        ],
        ephemeral: true,
      });
    }

    // ========================================================
    // TICKET CLOSE
    // ========================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        'ticket_close'
    ) {
      const ticket =
        data.tickets[
          interaction.channel.id
        ];

      if (!ticket) {
        return interaction.reply({
          content:
            '❌ טיקט לא נמצא.',
          ephemeral: true,
        });
      }

      const owner =
        ticket.userId ===
        interaction.user.id;

      const staff =
        isStaff(
          interaction.member
        );

      if (!owner && !staff) {
        return interaction.reply({
          content:
            '❌ אין לך הרשאה לסגור את הטיקט.',
          ephemeral: true,
        });
      }

      delete data.tickets[
        interaction.channel.id
      ];

      saveData();

      await interaction.reply({
        embeds: [
          embed(
            '🔒 TICKET CLOSED',
            'הטיקט יימחק בעוד 5 שניות.'
          ),
        ],
      });

      await sendLog(
        interaction.guild,
        '🔒 Ticket Closed',
        interaction.user +
          ' סגר את הטיקט.'
      );

      setTimeout(
        async function () {
          await interaction.channel
            .delete()
            .catch(function () {});
        },
        5000
      );
    }
  } catch (error) {
    console.error(
      'Interaction error:',
      error
    );

    try {
      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction.followUp({
          content:
            '❌ אירעה שגיאה. בדוק את הלוגים של Render.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content:
            '❌ אירעה שגיאה. בדוק את הלוגים של Render.',
          ephemeral: true,
        });
      }
    } catch (replyError) {
      console.error(
        'Interaction error reply failed:',
        replyError
      );
    }
  }
});

// ============================================================
// MEMBER FETCH
// ============================================================

async function guildMember(
  guild,
  id
) {
  try {
    return await guild.members.fetch(
      id
    );
  } catch (error) {
    return null;
  }
}

// ============================================================
// TEMP PUNISHMENTS
// ============================================================

setInterval(
  async function () {
    const now = Date.now();
    let changed = false;

    for (
      const [id, punishment] of Object.entries(
        data.punishments
      )
    ) {
      if (
        now <
        punishment.expires
      ) {
        continue;
      }

      const guild =
        client.guilds.cache.get(
          punishment.guildId
        );

      if (guild) {
        const member =
          await guild.members
            .fetch(
              punishment.userId
            )
            .catch(function () {
              return null;
            });

        if (member) {
          await member.roles
            .remove(
              punishment.roleId
            )
            .catch(function () {});

          if (
            punishment.type ===
              'voicemute' &&
            member.voice &&
            member.voice.channel
          ) {
            await member.voice
              .setMute(false)
              .catch(function () {});
          }

          await sendLog(
            guild,
            '⏰ Punishment Expired',
            '<@' +
              punishment.userId +
              '> הוסר ממנו העונש באופן אוטומטי.'
          );
        }
      }

      delete data.punishments[id];
      changed = true;
    }

    if (changed) {
      saveData();
    }
  },
  30000
);

// ============================================================
// ERRORS
// ============================================================

client.on(
  'error',
  function (error) {
    console.error(
      'Discord Error:',
      error
    );
  }
);

process.on(
  'unhandledRejection',
  function (error) {
    console.error(
      'Unhandled Rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',
  function (error) {
    console.error(
      'Uncaught Exception:',
      error
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN).catch(
  function (error) {
    console.error(
      'Discord login failed:',
      error
    );

    process.exit(1);
  }
);
