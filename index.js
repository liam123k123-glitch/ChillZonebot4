// ============================================================
// 🔵 CHILLZONE V2 - COMMUNITY BOT
// Discord.js v14 + Render
// One-file bot
// ============================================================

require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionsBitField,
    ChannelType,
    SlashCommandBuilder,
    AuditLogEvent
} = require("discord.js");

// ============================================================
// ⚙️ ENV
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing");
    process.exit(1);
}

// ============================================================
// 🌐 RENDER WEB SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
    res.send("🔵 ChillZone V2 is online!");
});

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        bot: "ChillZone V2",
        uptime: process.uptime()
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// ============================================================
// 🤖 DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildWebhooks
    ],

    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.User,
        Partials.Reaction
    ]
});

// ============================================================
// 💾 DATABASE
// ============================================================

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data.json");

let db = {
    guilds: {},
    users: {}
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        console.log("⚠️ data.json invalid. Creating new database.");
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error("Database save error:", err);
    }
}

function getGuild(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            welcomeChannel: null,
            goodbyeChannel: null,
            logsChannel: null,
            verifyChannel: null,
            ticketCategory: null,
            aiChannel: null,
            levelChannel: null,
            countingChannel: null,

            staffRole: null,
            verifiedRole: null,
            autoRole: null,

            muteRole: null,
            voiceMuteRole: null,
            banRole: null,

            countNumber: 0,
            ticketNumber: 0,

            aiEnabled: true,

            helpEnabled: true,
            levelsEnabled: true,
            countingEnabled: true,

            ticketAI: true
        };

        saveDB();
    }

    return db.guilds[guildId];
}

function getUser(guildId, userId) {
    if (!db.users[guildId]) {
        db.users[guildId] = {};
    }

    if (!db.users[guildId][userId]) {
        db.users[guildId][userId] = {
            xp: 0,
            level: 1,
            warnings: 0,
            messages: 0
        };
    }

    return db.users[guildId][userId];
}

// ============================================================
// 🔵 COLORS
// ============================================================

const BLUE = 0x3498DB;
const DARK_BLUE = 0x1769AA;

// ============================================================
// 🎨 EMBEDS
// ============================================================

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`🔵 ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(DARK_BLUE)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function logEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`📋 ${title}`)
        .setDescription(description)
        .setTimestamp()
        .setFooter({
            text: "ChillZone • Audit System"
        });
}

// ============================================================
// 🛡️ PERMISSIONS
// ============================================================

function isAdmin(member) {
    return member?.permissions?.has(
        PermissionsBitField.Flags.Administrator
    );
}

function isStaff(member) {
    if (!member) return false;

    if (isAdmin(member)) return true;

    const settings = getGuild(member.guild.id);

    return settings.staffRole &&
        member.roles.cache.has(settings.staffRole);
}

// ============================================================
// 🧾 AUDIT LOG HELPER
// ============================================================

async function findAuditExecutor(
    guild,
    type,
    targetId = null
) {
    try {
        const logs = await guild.fetchAuditLogs({
            type,
            limit: 10
        });

        const entry = logs.entries.find(entry => {
            if (Date.now() - entry.createdTimestamp > 10000) {
                return false;
            }

            if (!targetId) return true;

            return entry.target?.id === targetId;
        });

        if (!entry) return null;

        return entry.executor;
    } catch {
        return null;
    }
}

// ============================================================
// 📋 SEND LOG
// ============================================================

async function sendLog(
    guild,
    title,
    description,
    fields = []
) {
    try {
        const settings = getGuild(guild.id);

        if (!settings.logsChannel) return;

        const channel =
            guild.channels.cache.get(settings.logsChannel);

        if (!channel) return;

        const embed = logEmbed(title, description);

        if (fields.length) {
            embed.addFields(fields);
        }

        await channel.send({
            embeds: [embed]
        });
    } catch (err) {
        console.error("Log error:", err);
    }
}

// ============================================================
// 🧠 GEMINI AI
// ============================================================

async function askGemini(prompt) {
    if (!GEMINI_API_KEY) {
        return "❌ מערכת ה-AI לא מוגדרת. חסר GEMINI_API_KEY.";
    }

    try {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text:
                                    `אתה העוזר של שרת Discord בשם ChillZone.
ענה בעברית בצורה נחמדה, קצרה וברורה.
אל תמציא מידע על השרת.

השאלה:
${prompt}`
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini:", data);
            return "❌ ה-AI לא הצליח לענות כרגע.";
        }

        return (
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "❌ לא התקבלה תשובה."
        );
    } catch (err) {
        console.error("AI error:", err);
        return "❌ אירעה שגיאה במערכת ה-AI.";
    }
}

// ============================================================
// 🎫 TICKET TYPES
// ============================================================

const ticketTypes = {
    support: {
        label: "תמיכה",
        emoji: "🛠️",
        description: "צריך עזרה? פתח Ticket"
    },

    report: {
        label: "דיווח",
        emoji: "🚨",
        description: "דיווח על משתמש או בעיה"
    },

    purchase: {
        label: "רכישה",
        emoji: "🛒",
        description: "שאלות בנוגע לרכישה"
    },

    staff: {
        label: "בחינה לצוות",
        emoji: "👮",
        description: "רוצה להצטרף לצוות?"
    },

    other: {
        label: "אחר",
        emoji: "📩",
        description: "נושא אחר"
    }
};

// ============================================================
// 🎫 TICKET PANEL
// ============================================================

function ticketPanelEmbed() {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("🎫 מרכז התמיכה של ChillZone")
        .setDescription(
            [
                "ברוכים הבאים למערכת הטיקטים שלנו! 🔵",
                "",
                "בחרו את סוג הפנייה שלכם מהרשימה למטה.",
                "",
                "🛠️ **תמיכה**",
                "🚨 **דיווח**",
                "🛒 **רכישה**",
                "👮 **בחינה לצוות**",
                "📩 **אחר**",
                "",
                "⚡ צוות התמיכה יטפל בפנייה בהקדם."
            ].join("\n")
        )
        .setFooter({
            text: "ChillZone Support System"
        })
        .setTimestamp();
}

function ticketPanelComponents() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_create")
        .setPlaceholder("🎫 בחרו סוג Ticket")
        .addOptions(
            Object.entries(ticketTypes).map(([value, data]) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(data.label)
                    .setValue(value)
                    .setEmoji(data.emoji)
                    .setDescription(data.description)
            )
        );

    return [
        new ActionRowBuilder().addComponents(menu)
    ];
}

// ============================================================
// 🎫 CREATE TICKET
// ============================================================

async function createTicket(interaction, type) {
    const guild = interaction.guild;
    const user = interaction.user;

    const settings = getGuild(guild.id);

    if (!settings.ticketCategory) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "מערכת הטיקטים לא מוגדרת",
                    "אדמין צריך להגדיר Ticket Category."
                )
            ],
            ephemeral: true
        });
    }

    const existing = guild.channels.cache.find(
        c =>
            c.parentId === settings.ticketCategory &&
            c.topic?.includes(`OWNER:${user.id}`)
    );

    if (existing) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "כבר יש לך Ticket",
                    `יש לך כבר Ticket פתוח: ${existing}`
                )
            ],
            ephemeral: true
        });
    }

    settings.ticketNumber++;
    saveDB();

    const typeData = ticketTypes[type];

    const channel = await guild.channels.create({
        name: `ticket-${settings.ticketNumber}`,
        type: ChannelType.GuildText,
        parent: settings.ticketCategory,
        topic:
            `OWNER:${user.id} | TYPE:${type} | AI:${settings.ticketAI ? "enabled" : "disabled"} | CLAIMED:false`,

        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [
                    PermissionsBitField.Flags.ViewChannel
                ]
            },
            {
                id: user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ]
    });

    if (settings.staffRole) {
        await channel.permissionOverwrites.edit(
            settings.staffRole,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        );
    }

    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(
            `${typeData.emoji} Ticket #${settings.ticketNumber}`
        )
        .setDescription(
            [
                `שלום ${user}! 👋`,
                "",
                `סוג הפנייה: **${typeData.label}**`,
                "",
                "🧠 מערכת ה-AI יכולה לעזור לך עד שאיש צוות ייקח את ה-Ticket.",
                "",
                "👮 לאחר שאיש צוות ייקח את ה-Ticket, ה-AI יפסיק לענות.",
                "",
                "🔒 בסיום ניתן לסגור את ה-Ticket באמצעות הכפתור למטה."
            ].join("\n")
        )
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_claim")
            .setLabel("לקחת Ticket")
            .setEmoji("👮")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("סגור Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
        content: `${user}${settings.staffRole ? ` <@&${settings.staffRole}>` : ""}`,
        embeds: [embed],
        components: [buttons]
    });

    await interaction.reply({
        embeds: [
            successEmbed(
                "Ticket נפתח!",
                `ה-Ticket שלך נפתח בהצלחה: ${channel}`
            )
        ],
        ephemeral: true
    });

    await sendLog(
        guild,
        "🎫 Ticket נפתח",
        `נפתח Ticket חדש.`,
        [
            {
                name: "👤 משתמש",
                value: `${user} (${user.id})`
            },
            {
                name: "📂 סוג",
                value: typeData.label
            },
            {
                name: "📌 ערוץ",
                value: `${channel}`
            }
        ]
    );
}

// ============================================================
// 🎫 CLAIM TICKET
// ============================================================

async function claimTicket(interaction) {
    const channel = interaction.channel;
    const member = interaction.member;

    if (!channel?.topic?.includes("OWNER:")) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "לא Ticket",
                    "הערוץ הזה אינו Ticket."
                )
            ],
            ephemeral: true
        });
    }

    if (!isStaff(member)) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "אין הרשאה",
                    "רק צוות יכול לקחת Ticket."
                )
            ],
            ephemeral: true
        });
    }

    if (channel.topic.includes("CLAIMED:true")) {
        return interaction.reply({
            embeds: [
                infoEmbed(
                    "כבר נלקח",
                    "ה-Ticket הזה כבר נלקח על ידי איש צוות."
                )
            ],
            ephemeral: true
        });
    }

    channel.setTopic(
        `${channel.topic} | CLAIMED:true | BY:${interaction.user.id}`
    );

    await interaction.reply({
        embeds: [
            successEmbed(
                "Ticket נלקח",
                `👮 ${interaction.user} לקח את ה-Ticket.\n\n🧠 מערכת ה-AI הופסקה.`
            )
        ]
    });

    await sendLog(
        interaction.guild,
        "👮 Ticket נלקח",
        `${interaction.user} לקח Ticket.`,
        [
            {
                name: "📌 ערוץ",
                value: `${channel}`
            }
        ]
    );
}

// ============================================================
// 🎫 CLOSE TICKET
// ============================================================

async function closeTicket(interaction) {
    const channel = interaction.channel;

    if (!channel?.topic?.includes("OWNER:")) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "לא Ticket",
                    "הערוץ הזה אינו Ticket."
                )
            ],
            ephemeral: true
        });
    }

    await interaction.reply({
        embeds: [
            infoEmbed(
                "🔒 Ticket נסגר",
                "הערוץ יימחק בעוד 5 שניות..."
            )
        ]
    });

    await sendLog(
        interaction.guild,
        "🔒 Ticket נסגר",
        `${interaction.user} סגר Ticket.`,
        [
            {
                name: "📌 ערוץ",
                value: channel.name
            }
        ]
    );

    setTimeout(() => {
        channel.delete().catch(() => {});
    }, 5000);
}

// ============================================================
// 🛡️ VERIFY PANEL
// ============================================================

function verifyPanel() {
    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("🔐 אימות משתמש")
        .setDescription(
            [
                "ברוכים הבאים ל־ChillZone! 🔵",
                "",
                "כדי לקבל גישה לשרת, לחצו על הכפתור למטה.",
                "",
                "✅ האימות יעניק לכם את תפקיד ה־Verified.",
                "",
                "⚠️ אין ללחוץ אם אינכם מורשים להיות בשרת."
            ].join("\n")
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify")
            .setLabel("אימות")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Primary)
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

// ============================================================
// 📊 LEVEL SYSTEM
// ============================================================

function calculateXP(level) {
    return level * 100;
}

async function addXP(message) {
    const settings = getGuild(message.guild.id);

    if (!settings.levelsEnabled) return;

    const user = getUser(
        message.guild.id,
        message.author.id
    );

    user.messages++;
    user.xp += Math.floor(Math.random() * 11) + 10;

    const required = calculateXP(user.level);

    if (user.xp >= required) {
        user.xp -= required;
        user.level++;

        saveDB();

        await sendLog(
            message.guild,
            "⬆️ עליית Level",
            `${message.author} עלה Level!`,
            [
                {
                    name: "👤 משתמש",
                    value: `${message.author}`
                },
                {
                    name: "🏆 Level חדש",
                    value: `${user.level}`
                }
            ]
        );

        if (settings.levelChannel) {
            const channel =
                message.guild.channels.cache.get(
                    settings.levelChannel
                );

            if (channel) {
                channel.send({
                    embeds: [
                        successEmbed(
                            "🎉 Level Up!",
                            `${message.author} עלה ל־**Level ${user.level}**!`
                        )
                    ]
                }).catch(() => {});
            }
        }
    }

    saveDB();
}

// ============================================================
// 🔢 COUNTING
// ============================================================

async function handleCounting(message) {
    const settings = getGuild(message.guild.id);

    if (!settings.countingEnabled) return false;

    if (!settings.countingChannel) return false;

    if (
        message.channel.id !==
        settings.countingChannel
    ) {
        return false;
    }

    const number = parseInt(message.content);

    if (isNaN(number)) return true;

    const expected = settings.countNumber + 1;

    if (number === expected) {
        settings.countNumber = number;
        saveDB();

        await sendLog(
            message.guild,
            "🔢 Counting",
            `${message.author} המשיך את הספירה.`,
            [
                {
                    name: "🔢 מספר",
                    value: `${number}`
                }
            ]
        );
    } else {
        settings.countNumber = 0;
        saveDB();

        await sendLog(
            message.guild,
            "❌ Counting נכשל",
            `${message.author} טעה בספירה.`,
            [
                {
                    name: "❌ נכתב",
                    value: `${number}`
                },
                {
                    name: "✅ היה צריך",
                    value: `${expected}`
                }
            ]
        );

        await message.react("❌").catch(() => {});
    }

    return true;
}

// ============================================================
// 🆘 HELP
// ============================================================

async function handleHelp(message) {
    const settings = getGuild(message.guild.id);

    if (!settings.helpEnabled) return;

    if (message.content.trim() !== "!h") return;

    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("🆘 בקשת עזרה")
        .setDescription(
            [
                `👤 **${message.author} צריך עזרה!**`,
                "",
                "צוות יקר, מישהו ביקש עזרה.",
                "",
                "👮 איש צוות יכול לקחת את הבקשה."
            ].join("\n")
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_claim_${message.author.id}`)
            .setLabel("אני מטפל")
            .setEmoji("👮")
            .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
        content: settings.staffRole
            ? `<@&${settings.staffRole}>`
            : undefined,
        embeds: [embed],
        components: [row]
    });

    await sendLog(
        message.guild,
        "🆘 Help",
        `${message.author} ביקש עזרה.`,
        [
            {
                name: "📍 ערוץ",
                value: `${message.channel}`
            }
        ]
    );
}

// ============================================================
// 💡 SUGGESTION
// ============================================================

async function handleSuggestion(message) {
    if (!message.content.startsWith("!הצעה")) return;

    const suggestion =
        message.content
            .slice("!הצעה".length)
            .trim();

    if (!suggestion) {
        return message.reply({
            embeds: [
                errorEmbed(
                    "חסרה הצעה",
                    "דוגמה: `!הצעה להוסיף מערכת דירוגים`"
                )
            ]
        });
    }

    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("💡 הצעה חדשה")
        .setDescription(suggestion)
        .addFields({
            name: "👤 הוצע על ידי",
            value: `${message.author}`
        })
        .setTimestamp();

    const sent = await message.channel.send({
        embeds: [embed]
    });

    await sent.react("👍").catch(() => {});
    await sent.react("👎").catch(() => {});

    await message.delete().catch(() => {});

    await sendLog(
        message.guild,
        "💡 הצעה נשלחה",
        `${message.author} שלח הצעה חדשה.`,
        [
            {
                name: "💬 הצעה",
                value: suggestion.slice(0, 1000)
            }
        ]
    );
}

// ============================================================
// 📜 SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("מציג את כל הפקודות"),

    new SlashCommandBuilder()
        .setName("ticket-panel")
        .setDescription("שולח פאנל Tickets"),

    new SlashCommandBuilder()
        .setName("verify-panel")
        .setDescription("שולח פאנל Verify"),

    new SlashCommandBuilder()
        .setName("links")
        .setDescription("שולח פאנל קישורים"),

    new SlashCommandBuilder()
        .setName("staff-panel")
        .setDescription("שולח פאנל צוות"),

    new SlashCommandBuilder()
        .setName("send")
        .setDescription("שליחת הודעה דרך הבוט")
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("הודעה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("מחיקת הודעות")
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("כמות")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("אזהרת משתמש")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("משתמש")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("סיבה")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("בדיקת אזהרות")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("משתמש")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("level")
        .setDescription("בדיקת Level")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("משתמש")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("h")
        .setDescription("בקשת עזרה"),

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("הגדרת ChillZone")

        .addSubcommand(sub =>
            sub
                .setName("welcome")
                .setDescription("ערוץ Welcome")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("goodbye")
                .setDescription("ערוץ Goodbye")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("logs")
                .setDescription("ערוץ Logs")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("ticket-category")
                .setDescription("קטגוריית Tickets")
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("קטגוריה")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("ai")
                .setDescription("ערוץ AI")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("levels")
                .setDescription("ערוץ Level")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("counting")
                .setDescription("ערוץ Counting")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("ערוץ")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("staff-role")
                .setDescription("תפקיד Staff")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("תפקיד")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("verified-role")
                .setDescription("תפקיד Verified")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("תפקיד")
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName("auto-role")
                .setDescription("תפקיד אוטומטי")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("תפקיד")
                        .setRequired(true)
                )
        )
];

// ============================================================
// 📚 HELP COMMAND
// ============================================================

function helpEmbed() {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("📚 ChillZone — מערכת הפקודות")
        .setDescription(
            [
                "🔵 **פקודות מערכת**",
                "",
                "`/help` — הצגת עזרה",
                "`/ticket-panel` — פאנל Tickets",
                "`/verify-panel` — פאנל Verify",
                "`/links` — פאנל קישורים",
                "`/staff-panel` — פאנל צוות",
                "",
                "🛡️ **ניהול**",
                "",
                "`/warn` — אזהרה",
                "`/warnings` — בדיקת אזהרות",
                "`/clear` — מחיקת הודעות",
                "`/send` — שליחת הודעה",
                "",
                "🏆 **קהילה**",
                "",
                "`/level` — בדיקת Level",
                "`/h` — בקשת עזרה",
                "`!h` — בקשת עזרה מהירה",
                "`!הצעה` — שליחת הצעה",
                "",
                "⚙️ **Setup**",
                "",
                "`/setup welcome`",
                "`/setup goodbye`",
                "`/setup logs`",
                "`/setup ticket-category`",
                "`/setup ai`",
                "`/setup levels`",
                "`/setup counting`",
                "`/setup staff-role`",
                "`/setup verified-role`",
                "`/setup auto-role`"
            ].join("\n")
        )
        .setTimestamp();
}

// ============================================================
// 🔗 LINKS PANEL
// ============================================================

function linksPanel() {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("🔗 הקישורים של ChillZone")
        .setDescription(
            [
                "🌐 **Website**",
                "הכנס כאן את הקישור שלכם",
                "",
                "🎮 **Roblox**",
                "הכנס כאן את הקישור שלכם",
                "",
                "📱 **TikTok**",
                "הכנס כאן את הקישור שלכם",
                "",
                "💬 **Discord**",
                "אתם כבר כאן 😎"
            ].join("\n")
        )
        .setTimestamp();
}

// ============================================================
// 👮 STAFF PANEL
// ============================================================

function staffPanel() {
    return new EmbedBuilder()
        .setColor(BLUE)
        .setTitle("👮 ChillZone Staff Panel")
        .setDescription(
            [
                "ברוכים הבאים לפאנל הצוות 🔵",
                "",
                "🛡️ שמרו על הסדר.",
                "📋 כל הפעולות נרשמות במערכת הלוגים.",
                "🎫 טפלו ב-Tickets.",
                "🆘 עזרו לחברי הקהילה.",
                "",
                "⚠️ שימוש לרעה בהרשאות עלול להירשם ב-Audit Logs."
            ].join("\n")
        )
        .setTimestamp();
}

// ============================================================
// 🟢 READY
// ============================================================

client.once("ready", async () => {
    console.log("======================================");
    console.log(`🔵 Logged in as ${client.user.tag}`);
    console.log(`🏠 Servers: ${client.guilds.cache.size}`);
    console.log("======================================");

    client.user.setPresence({
        activities: [
            {
                name: "ChillZone 🔵",
                type: 0
            }
        ],
        status: "online"
    });

    try {
        const rest =
            require("@discordjs/rest").REST;

        const {
            Routes
        } = require("discord-api-types/v10");

        const api = new rest({
            version: "10"
        }).setToken(TOKEN);

        if (GUILD_ID) {
            await api.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body: commands.map(c =>
                        c.toJSON()
                    )
                }
            );

            console.log(
                `✅ Slash commands registered in ${GUILD_ID}`
            );
        } else {
            await api.put(
                Routes.applicationCommands(
                    CLIENT_ID
                ),
                {
                    body: commands.map(c =>
                        c.toJSON()
                    )
                }
            );

            console.log(
                "✅ Global slash commands registered"
            );
        }
    } catch (err) {
        console.error(
            "❌ Command registration error:",
            err
        );
    }
});

// ============================================================
// 👋 MEMBER JOIN
// ============================================================

client.on("guildMemberAdd", async member => {
    const settings = getGuild(
        member.guild.id
    );

    if (settings.autoRole) {
        const role =
            member.guild.roles.cache.get(
                settings.autoRole
            );

        if (role) {
            await member.roles.add(role).catch(() => {});
        }
    }

    if (settings.welcomeChannel) {
        const channel =
            member.guild.channels.cache.get(
                settings.welcomeChannel
            );

        if (channel) {
            channel.send({
                embeds: [
                    successEmbed(
                        "👋 חבר חדש הצטרף!",
                        [
                            `ברוכים הבאים ${member}! 🔵`,
                            "",
                            `👤 משתמש: **${member.user.username}**`,
                            `🆔 ID: \`${member.id}\``,
                            "",
                            "תהנו בשרת! 🎉"
                        ].join("\n")
                    )
                ]
            }).catch(() => {});
        }
    }

    await sendLog(
        member.guild,
        "📥 משתמש נכנס",
        `${member} הצטרף לשרת.`,
        [
            {
                name: "👤 משתמש",
                value: `${member.user.tag}`
            },
            {
                name: "🆔 ID",
                value: member.id
            }
        ]
    );
});

// ============================================================
// 👋 MEMBER LEAVE
// ============================================================

client.on("guildMemberRemove", async member => {
    const settings = getGuild(
        member.guild.id
    );

    if (settings.goodbyeChannel) {
        const channel =
            member.guild.channels.cache.get(
                settings.goodbyeChannel
            );

        if (channel) {
            channel.send({
                embeds: [
                    infoEmbed(
                        "📤 משתמש עזב",
                        `${member.user.tag} עזב את השרת.`
                    )
                ]
            }).catch(() => {});
        }
    }

    await sendLog(
        member.guild,
        "📤 משתמש עזב",
        `${member.user.tag} עזב את השרת.`,
        [
            {
                name: "🆔 ID",
                value: member.id
            }
        ]
    );
});

// ============================================================
// 👤 MEMBER UPDATE
// ============================================================

client.on(
    "guildMemberUpdate",
    async (oldMember, newMember) => {

        if (oldMember.nickname !== newMember.nickname) {
            const executor =
                await findAuditExecutor(
                    newMember.guild,
                    AuditLogEvent.MemberUpdate,
                    newMember.id
                );

            await sendLog(
                newMember.guild,
                "✏️ Nickname השתנה",
                `${newMember} שינה Nickname.`,
                [
                    {
                        name: "⬅️ קודם",
                        value:
                            oldMember.nickname ||
                            oldMember.user.username
                    },
                    {
                        name: "➡️ עכשיו",
                        value:
                            newMember.nickname ||
                            newMember.user.username
                    },
                    {
                        name: "👮 מבצע",
                        value:
                            executor
                                ? `${executor}`
                                : "לא ידוע"
                    }
                ]
            );
        }

        const oldRoles =
            new Set(oldMember.roles.cache.keys());

        const newRoles =
            new Set(newMember.roles.cache.keys());

        const addedRoles =
            [...newRoles].filter(
                id => !oldRoles.has(id)
            );

        const removedRoles =
            [...oldRoles].filter(
                id => !newRoles.has(id)
            );

        if (addedRoles.length) {
            await sendLog(
                newMember.guild,
                "➕ תפקיד נוסף",
                `${newMember} קיבל תפקיד.`,
                [
                    {
                        name: "🎭 תפקידים",
                        value: addedRoles
                            .map(id => `<@&${id}>`)
                            .join(", ")
                    }
                ]
            );
        }

        if (removedRoles.length) {
            await sendLog(
                newMember.guild,
                "➖ תפקיד הוסר",
                `${newMember} איבד תפקיד.`,
                [
                    {
                        name: "🎭 תפקידים",
                        value: removedRoles
                            .map(id => `<@&${id}>`)
                            .join(", ")
                    }
                ]
            );
        }
    }
);

// ============================================================
// 🔊 VOICE LOGS
// ============================================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        if (
            !oldState.channel &&
            newState.channel
        ) {
            await sendLog(
                newState.guild,
                "🔊 Voice Join",
                `${newState.member} נכנס לחדר קול.`,
                [
                    {
                        name: "📢 חדר",
                        value: newState.channel.name
                    }
                ]
            );
        }

        if (
            oldState.channel &&
            !newState.channel
        ) {
            await sendLog(
                newState.guild,
                "🔇 Voice Leave",
                `${oldState.member} יצא מחדר קול.`,
                [
                    {
                        name: "📢 חדר",
                        value: oldState.channel.name
                    }
                ]
            );
        }

        if (
            oldState.channel &&
            newState.channel &&
            oldState.channel.id !==
                newState.channel.id
        ) {
            await sendLog(
                newState.guild,
                "🔄 Voice Move",
                `${newState.member} עבר חדר.`,
                [
                    {
                        name: "⬅️ קודם",
                        value: oldState.channel.name
                    },
                    {
                        name: "➡️ עכשיו",
                        value: newState.channel.name
                    }
                ]
            );
        }

        if (
            oldState.serverMute !==
            newState.serverMute
        ) {
            await sendLog(
                newState.guild,
                "🎙️ Server Mute",
                `${newState.member} ${newState.serverMute ? "קיבל" : "הוסר ממנו"} Server Mute.`
            );
        }

        if (
            oldState.serverDeaf !==
            newState.serverDeaf
        ) {
            await sendLog(
                newState.guild,
                "🎧 Server Deaf",
                `${newState.member} ${newState.serverDeaf ? "קיבל" : "הוסר ממנו"} Server Deaf.`
            );
        }
    }
);

// ============================================================
// 💬 MESSAGE UPDATE
// ============================================================

client.on(
    "messageUpdate",
    async (oldMessage, newMessage) => {

        if (!newMessage.guild) return;
        if (newMessage.author?.bot) return;

        if (
            oldMessage.content ===
            newMessage.content
        ) return;

        await sendLog(
            newMessage.guild,
            "✏️ הודעה נערכה",
            `${newMessage.author} ערך הודעה.`,
            [
                {
                    name: "📍 ערוץ",
                    value: `${newMessage.channel}`
                },
                {
                    name: "⬅️ לפני",
                    value:
                        (oldMessage.content ||
                            "לא זמין").slice(0, 1000)
                },
                {
                    name: "➡️ אחרי",
                    value:
                        (newMessage.content ||
                            "לא זמין").slice(0, 1000)
                },
                {
                    name: "🔗 הודעה",
                    value: `[פתיחת הודעה](${newMessage.url})`
                }
            ]
        );
    }
);

// ============================================================
// 🗑️ MESSAGE DELETE
// ============================================================

client.on(
    "messageDelete",
    async message => {

        if (!message.guild) return;
        if (message.author?.bot) return;

        let executor = null;

        try {
            executor =
                await findAuditExecutor(
                    message.guild,
                    AuditLogEvent.MessageDelete
                );
        } catch {}

        await sendLog(
            message.guild,
            "🗑️ הודעה נמחקה",
            "הודעה נמחקה מהשרת.",
            [
                {
                    name: "👤 מחבר",
                    value:
                        message.author
                            ? `${message.author}`
                            : "לא ידוע"
                },
                {
                    name: "📍 ערוץ",
                    value: `${message.channel}`
                },
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ניתן לזהות"
                },
                {
                    name: "💬 תוכן",
                    value:
                        (message.content ||
                            "לא ניתן לשחזר תוכן")
                            .slice(0, 1000)
                }
            ]
        );
    }
);

// ============================================================
// 🧹 BULK DELETE
// ============================================================

client.on(
    "messageDeleteBulk",
    async messages => {

        const first =
            messages.first();

        if (!first?.guild) return;

        await sendLog(
            first.guild,
            "🧹 Bulk Delete",
            `${messages.size} הודעות נמחקו בבת אחת.`,
            [
                {
                    name: "📍 ערוץ",
                    value: `${first.channel}`
                },
                {
                    name: "🔢 כמות",
                    value: `${messages.size}`
                }
            ]
        );
    }
);

// ============================================================
// 📢 CHANNEL CREATE
// ============================================================

client.on(
    "channelCreate",
    async channel => {

        if (!channel.guild) return;

        const executor =
            await findAuditExecutor(
                channel.guild,
                AuditLogEvent.ChannelCreate,
                channel.id
            );

        await sendLog(
            channel.guild,
            "📢 ערוץ נוצר",
            `נוצר ערוץ חדש: ${channel}`,
            [
                {
                    name: "📛 שם",
                    value: channel.name
                },
                {
                    name: "📂 סוג",
                    value: `${channel.type}`
                },
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 📢 CHANNEL DELETE
// ============================================================

client.on(
    "channelDelete",
    async channel => {

        if (!channel.guild) return;

        const executor =
            await findAuditExecutor(
                channel.guild,
                AuditLogEvent.ChannelDelete,
                channel.id
            );

        await sendLog(
            channel.guild,
            "🗑️ ערוץ נמחק",
            `הערוץ **${channel.name}** נמחק.`,
            [
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 📢 CHANNEL UPDATE
// ============================================================

client.on(
    "channelUpdate",
    async (oldChannel, newChannel) => {

        if (!newChannel.guild) return;

        if (oldChannel.name !== newChannel.name) {
            await sendLog(
                newChannel.guild,
                "✏️ ערוץ שונה",
                "שם ערוץ שונה.",
                [
                    {
                        name: "⬅️ קודם",
                        value: oldChannel.name
                    },
                    {
                        name: "➡️ עכשיו",
                        value: newChannel.name
                    }
                ]
            );
        }
    }
);

// ============================================================
// 🎭 ROLE CREATE
// ============================================================

client.on(
    "roleCreate",
    async role => {

        const executor =
            await findAuditExecutor(
                role.guild,
                AuditLogEvent.RoleCreate,
                role.id
            );

        await sendLog(
            role.guild,
            "🎭 תפקיד נוצר",
            `נוצר תפקיד חדש: ${role}`,
            [
                {
                    name: "🎨 צבע",
                    value: role.hexColor
                },
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 🎭 ROLE DELETE
// ============================================================

client.on(
    "roleDelete",
    async role => {

        const executor =
            await findAuditExecutor(
                role.guild,
                AuditLogEvent.RoleDelete,
                role.id
            );

        await sendLog(
            role.guild,
            "🗑️ תפקיד נמחק",
            `התפקיד **${role.name}** נמחק.`,
            [
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 🎭 ROLE UPDATE
// ============================================================

client.on(
    "roleUpdate",
    async (oldRole, newRole) => {

        const changes = [];

        if (oldRole.name !== newRole.name) {
            changes.push(
                `**שם:** ${oldRole.name} → ${newRole.name}`
            );
        }

        if (
            oldRole.hexColor !==
            newRole.hexColor
        ) {
            changes.push(
                `**צבע:** ${oldRole.hexColor} → ${newRole.hexColor}`
            );
        }

        if (!changes.length) return;

        await sendLog(
            newRole.guild,
            "✏️ תפקיד שונה",
            changes.join("\n"),
            [
                {
                    name: "🎭 תפקיד",
                    value: `${newRole}`
                }
            ]
        );
    }
);

// ============================================================
// 🔨 BAN
// ============================================================

client.on(
    "guildBanAdd",
    async ban => {

        const executor =
            await findAuditExecutor(
                ban.guild,
                AuditLogEvent.MemberBanAdd,
                ban.user.id
            );

        await sendLog(
            ban.guild,
            "🔨 משתמש קיבל Ban",
            `${ban.user.tag} קיבל Ban.`,
            [
                {
                    name: "👤 משתמש",
                    value: `${ban.user.tag}`
                },
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 🔓 UNBAN
// ============================================================

client.on(
    "guildBanRemove",
    async ban => {

        const executor =
            await findAuditExecutor(
                ban.guild,
                AuditLogEvent.MemberBanRemove,
                ban.user.id
            );

        await sendLog(
            ban.guild,
            "🔓 משתמש קיבל Unban",
            `${ban.user.tag} קיבל Unban.`,
            [
                {
                    name: "👤 משתמש",
                    value: `${ban.user.tag}`
                },
                {
                    name: "👮 מבצע",
                    value:
                        executor
                            ? `${executor}`
                            : "לא ידוע"
                }
            ]
        );
    }
);

// ============================================================
// 😀 EMOJI UPDATE
// ============================================================

client.on(
    "emojiCreate",
    async emoji => {
        await sendLog(
            emoji.guild,
            "😀 Emoji נוסף",
            `נוסף Emoji חדש: ${emoji}`
        );
    }
);

client.on(
    "emojiDelete",
    async emoji => {
        await sendLog(
            emoji.guild,
            "🗑️ Emoji נמחק",
            `Emoji נמחק: **${emoji.name}**`
        );
    }
);

// ============================================================
// 🧵 THREAD LOGS
// ============================================================

client.on(
    "threadCreate",
    async thread => {
        await sendLog(
            thread.guild,
            "🧵 Thread נוצר",
            `נוצר Thread חדש: ${thread}`
        );
    }
);

client.on(
    "threadDelete",
    async thread => {
        await sendLog(
            thread.guild,
            "🗑️ Thread נמחק",
            `Thread נמחק: **${thread.name}**`
        );
    }
);

client.on(
    "threadUpdate",
    async (oldThread, newThread) => {
        if (oldThread.name !== newThread.name) {
            await sendLog(
                newThread.guild,
                "✏️ Thread שונה",
                `${oldThread.name} → ${newThread.name}`
            );
        }
    }
);

// ============================================================
// 📅 SCHEDULED EVENTS
// ============================================================

client.on(
    "guildScheduledEventCreate",
    async event => {
        await sendLog(
            event.guild,
            "📅 Event נוצר",
            `נוצר Event: **${event.name}**`
        );
    }
);

client.on(
    "guildScheduledEventDelete",
    async event => {
        await sendLog(
            event.guild,
            "🗑️ Event נמחק",
            `Event נמחק: **${event.name}**`
        );
    }
);

client.on(
    "guildScheduledEventUpdate",
    async (oldEvent, newEvent) => {
        if (oldEvent.name !== newEvent.name) {
            await sendLog(
                newEvent.guild,
                "✏️ Event שונה",
                `${oldEvent.name} → ${newEvent.name}`
            );
        }
    }
);

// ============================================================
// 📨 INVITES
// ============================================================

client.on(
    "inviteCreate",
    async invite => {
        if (!invite.guild) return;

        await sendLog(
            invite.guild,
            "🔗 Invite נוצר",
            `נוצר Invite חדש.`,
            [
                {
                    name: "👤 יוצר",
                    value:
                        invite.inviter
                            ? `${invite.inviter}`
                            : "לא ידוע"
                },
                {
                    name: "🔗 קוד",
                    value: invite.code
                }
            ]
        );
    }
);

client.on(
    "inviteDelete",
    async invite => {
        if (!invite.guild) return;

        await sendLog(
            invite.guild,
            "🗑️ Invite נמחק",
            `Invite נמחק.`,
            [
                {
                    name: "🔗 קוד",
                    value: invite.code
                }
            ]
        );
    }
);

// ============================================================
// 💬 MESSAGE CREATE
// ============================================================

client.on(
    "messageCreate",
    async message => {

        if (!message.guild) return;
        if (message.author.bot) return;

        // Counting
        const wasCounting =
            await handleCounting(message);

        if (wasCounting) return;

        // Help
        await handleHelp(message);

        // Suggestion
        await handleSuggestion(message);

        // XP
        await addXP(message);

        const settings =
            getGuild(message.guild.id);

        // ====================================================
        // 🤖 AI CHANNEL
        // ====================================================

        if (
            settings.aiEnabled &&
            settings.aiChannel &&
            message.channel.id ===
                settings.aiChannel
        ) {
            const thinking =
                await message.reply("🧠 חושב...");

            const answer =
                await askGemini(
                    message.content
                );

            await thinking.edit({
                content: answer.slice(0, 1900)
            });

            await sendLog(
                message.guild,
                "🤖 AI",
                `${message.author} השתמש ב-AI.`,
                [
                    {
                        name: "💬 שאלה",
                        value:
                            message.content
                                .slice(0, 1000)
                    }
                ]
            );

            return;
        }

        // ====================================================
        // 🎫 AI INSIDE TICKET
        // ====================================================

        if (
            message.channel.topic?.includes("OWNER:") &&
            message.channel.topic?.includes("CLAIMED:false") &&
            settings.ticketAI
        ) {
            const answer =
                await askGemini(
                    message.content
                );

            await message.reply({
                content: answer.slice(0, 1900)
            }).catch(() => {});
        }
    }
);

// ============================================================
// 🔘 INTERACTIONS
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        // ====================================================
        // SELECT MENU
        // ====================================================

        if (
            interaction.isStringSelectMenu()
        ) {
            if (
                interaction.customId ===
                "ticket_create"
            ) {
                await createTicket(
                    interaction,
                    interaction.values[0]
                );
            }

            return;
        }

        // ====================================================
        // BUTTONS
        // ====================================================

        if (interaction.isButton()) {

            if (
                interaction.customId ===
                "ticket_claim"
            ) {
                await claimTicket(
                    interaction
                );
                return;
            }

            if (
                interaction.customId ===
                "ticket_close"
            ) {
                await closeTicket(
                    interaction
                );
                return;
            }

            if (
                interaction.customId ===
                "verify"
            ) {
                const settings =
                    getGuild(
                        interaction.guild.id
                    );

                if (!settings.verifiedRole) {
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "Verify לא מוגדר",
                                "אדמין צריך להגדיר Verified Role."
                            )
                        ],
                        ephemeral: true
                    });
                }

                const role =
                    interaction.guild.roles.cache.get(
                        settings.verifiedRole
                    );

                if (!role) {
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "Role לא נמצא",
                                "תפקיד ה-Verified לא קיים."
                            )
                        ],
                        ephemeral: true
                    });
                }

                if (
                    interaction.member.roles.cache.has(
                        role.id
                    )
                ) {
                    return interaction.reply({
                        embeds: [
                            infoEmbed(
                                "כבר מאומת",
                                "אתה כבר Verified."
                            )
                        ],
                        ephemeral: true
                    });
                }

                await interaction.member.roles.add(
                    role
                );

                await interaction.reply({
                    embeds: [
                        successEmbed(
                            "✅ אומתת בהצלחה",
                            "קיבלת את תפקיד ה-Verified!"
                        )
                    ],
                    ephemeral: true
                });

                await sendLog(
                    interaction.guild,
                    "✅ Verify",
                    `${interaction.user} אומת בהצלחה.`,
                    [
                        {
                            name: "🎭 Role",
                            value: `${role}`
                        }
                    ]
                );

                return;
            }

            if (
                interaction.customId.startsWith(
                    "help_claim_"
                )
            ) {
                if (
                    !isStaff(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "אין הרשאה",
                                "רק צוות יכול לקחת Help."
                            )
                        ],
                        ephemeral: true
                    });
                }

                await interaction.update({
                    embeds: [
                        successEmbed(
                            "👮 Help נלקח",
                            `${interaction.user} מטפל בבקשה.`
                        )
                    ],
                    components: []
                });

                await sendLog(
                    interaction.guild,
                    "👮 Help נלקח",
                    `${interaction.user} לקח בקשת Help.`
                );

                return;
            }
        }

        // ====================================================
        // SLASH COMMANDS
        // ====================================================

        if (
            !interaction.isChatInputCommand()
        ) return;

        const command =
            interaction.commandName;

        // ====================================================
        // /help
        // ====================================================

        if (command === "help") {
            return interaction.reply({
                embeds: [helpEmbed()],
                ephemeral: true
            });
        }

        // ====================================================
        // /ticket-panel
        // ====================================================

        if (command === "ticket-panel") {

            if (
                !isAdmin(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Admin יכול להשתמש בפקודה."
                        )
                    ],
                    ephemeral: true
                });
            }

            await interaction.channel.send({
                embeds: [ticketPanelEmbed()],
                components:
                    ticketPanelComponents()
            });

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "נשלח!",
                        "פאנל Tickets נשלח."
                    )
                ],
                ephemeral: true
            });

            await sendLog(
                interaction.guild,
                "🎫 Ticket Panel",
                `${interaction.user} שלח Ticket Panel.`
            );

            return;
        }

        // ====================================================
        // /verify-panel
        // ====================================================

        if (command === "verify-panel") {

            if (
                !isAdmin(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Admin יכול להשתמש בפקודה."
                        )
                    ],
                    ephemeral: true
                });
            }

            await interaction.channel.send(
                verifyPanel()
            );

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "נשלח!",
                        "פאנל Verify נשלח."
                    )
                ],
                ephemeral: true
            });
        }

        // ====================================================
        // /links
        // ====================================================

        if (command === "links") {

            await interaction.reply({
                embeds: [linksPanel()]
            });

            return;
        }

        // ====================================================
        // /staff-panel
        // ====================================================

        if (command === "staff-panel") {

            if (
                !isStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Staff יכול להשתמש."
                        )
                    ],
                    ephemeral: true
                });
            }

            await interaction.reply({
                embeds: [staffPanel()],
                ephemeral: true
            });

            return;
        }

        // ====================================================
        // /send
        // ====================================================

        if (command === "send") {

            if (
                !isAdmin(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Admin יכול להשתמש."
                        )
                    ],
                    ephemeral: true
                });
            }

            const text =
                interaction.options.getString(
                    "message"
                );

            await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(BLUE)
                        .setDescription(text)
                        .setTimestamp()
                ]
            });

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "נשלח!",
                        "ההודעה נשלחה."
                    )
                ],
                ephemeral: true
            });

            await sendLog(
                interaction.guild,
                "📤 Send",
                `${interaction.user} שלח הודעה דרך /send.`,
                [
                    {
                        name: "💬 תוכן",
                        value: text.slice(0, 1000)
                    }
                ]
            );

            return;
        }

        // ====================================================
        // /clear
        // ====================================================

        if (command === "clear") {

            if (
                !isStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Staff יכול למחוק הודעות."
                        )
                    ],
                    ephemeral: true
                });
            }

            const amount =
                interaction.options.getInteger(
                    "amount"
                );

            const deleted =
                await interaction.channel.bulkDelete(
                    amount,
                    true
                );

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "🧹 נמחק!",
                        `נמחקו **${deleted.size}** הודעות.`
                    )
                ],
                ephemeral: true
            });

            await sendLog(
                interaction.guild,
                "🧹 Clear",
                `${interaction.user} מחק הודעות.`,
                [
                    {
                        name: "🔢 כמות",
                        value: `${deleted.size}`
                    },
                    {
                        name: "📍 ערוץ",
                        value: `${interaction.channel}`
                    }
                ]
            );

            return;
        }

        // ====================================================
        // /warn
        // ====================================================

        if (command === "warn") {

            if (
                !isStaff(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Staff יכול לתת אזהרות."
                        )
                    ],
                    ephemeral: true
                });
            }

            const user =
                interaction.options.getUser(
                    "user"
                );

            const reason =
                interaction.options.getString(
                    "reason"
                ) || "ללא סיבה";

            const data =
                getUser(
                    interaction.guild.id,
                    user.id
                );

            data.warnings++;

            saveDB();

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "⚠️ אזהרה ניתנה",
                        `${user} קיבל אזהרה.\n\n**סיבה:** ${reason}`
                    )
                ]
            });

            await sendLog(
                interaction.guild,
                "⚠️ Warn",
                `${interaction.user} נתן אזהרה.`,
                [
                    {
                        name: "👤 משתמש",
                        value: `${user}`
                    },
                    {
                        name: "🔢 אזהרות",
                        value: `${data.warnings}`
                    },
                    {
                        name: "📝 סיבה",
                        value: reason
                    }
                ]
            );

            return;
        }

        // ====================================================
        // /warnings
        // ====================================================

        if (command === "warnings") {

            const user =
                interaction.options.getUser(
                    "user"
                );

            const data =
                getUser(
                    interaction.guild.id,
                    user.id
                );

            return interaction.reply({
                embeds: [
                    infoEmbed(
                        "⚠️ אזהרות",
                        `${user} יש **${data.warnings}** אזהרות.`
                    )
                ],
                ephemeral: true
            });
        }

        // ====================================================
        // /level
        // ====================================================

        if (command === "level") {

            const user =
                interaction.options.getUser(
                    "user"
                ) ||
                interaction.user;

            const data =
                getUser(
                    interaction.guild.id,
                    user.id
                );

            const required =
                calculateXP(data.level);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(BLUE)
                        .setTitle("🏆 Level")
                        .setDescription(
                            [
                                `👤 ${user}`,
                                "",
                                `🏆 **Level:** ${data.level}`,
                                `⭐ **XP:** ${data.xp}/${required}`,
                                `💬 **Messages:** ${data.messages}`
                            ].join("\n")
                        )
                        .setTimestamp()
                ]
            });
        }

        // ====================================================
        // /h
        // ====================================================

        if (command === "h") {

            const settings =
                getGuild(
                    interaction.guild.id
                );

            const embed =
                new EmbedBuilder()
                    .setColor(BLUE)
                    .setTitle("🆘 בקשת עזרה")
                    .setDescription(
                        `${interaction.user} צריך עזרה!`
                    )
                    .setTimestamp();

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `help_claim_${interaction.user.id}`
                            )
                            .setLabel("אני מטפל")
                            .setEmoji("👮")
                            .setStyle(
                                ButtonStyle.Primary
                            )
                    );

            await interaction.channel.send({
                content:
                    settings.staffRole
                        ? `<@&${settings.staffRole}>`
                        : undefined,
                embeds: [embed],
                components: [row]
            });

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "נשלח!",
                        "בקשת העזרה נשלחה לצוות."
                    )
                ],
                ephemeral: true
            });

            await sendLog(
                interaction.guild,
                "🆘 Help",
                `${interaction.user} ביקש עזרה.`
            );

            return;
        }

        // ====================================================
        // /setup
        // ====================================================

        if (command === "setup") {

            if (
                !isAdmin(
                    interaction.member
                )
            ) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "אין הרשאה",
                            "רק Administrator יכול להשתמש ב-Setup."
                        )
                    ],
                    ephemeral: true
                });
            }

            const sub =
                interaction.options.getSubcommand();

            const settings =
                getGuild(
                    interaction.guild.id
                );

            if (
                sub === "welcome"
            ) {
                settings.welcomeChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;
            }

            if (
                sub === "goodbye"
            ) {
                settings.goodbyeChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;
            }

            if (
                sub === "logs"
            ) {
                settings.logsChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;
            }

            if (
                sub === "ticket-category"
            ) {
                settings.ticketCategory =
                    interaction.options.getChannel(
                        "category"
                    ).id;
            }

            if (
                sub === "ai"
            ) {
                settings.aiChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;

                settings.aiEnabled = true;
            }

            if (
                sub === "levels"
            ) {
                settings.levelChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;

                settings.levelsEnabled = true;
            }

            if (
                sub === "counting"
            ) {
                settings.countingChannel =
                    interaction.options.getChannel(
                        "channel"
                    ).id;

                settings.countingEnabled = true;
            }

            if (
                sub === "staff-role"
            ) {
                settings.staffRole =
                    interaction.options.getRole(
                        "role"
                    ).id;
            }

            if (
                sub === "verified-role"
            ) {
                settings.verifiedRole =
                    interaction.options.getRole(
                        "role"
                    ).id;
            }

            if (
                sub === "auto-role"
            ) {
                settings.autoRole =
                    interaction.options.getRole(
                        "role"
                    ).id;
            }

            saveDB();

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "⚙️ Setup נשמר",
                        `ההגדרה **${sub}** נשמרה בהצלחה.`
                    )
                ],
                ephemeral: true
            });

            await sendLog(
                interaction.guild,
                "⚙️ Setup השתנה",
                `${interaction.user} שינה הגדרה.`,
                [
                    {
                        name: "🔧 הגדרה",
                        value: sub
                    }
                ]
            );

            return;
        }
    }
);

// ============================================================
// ❌ CLIENT ERRORS
// ============================================================

client.on(
    "error",
    async error => {
        console.error("Discord client error:", error);

        for (const guild of client.guilds.cache.values()) {
            await sendLog(
                guild,
                "🚨 Bot Error",
                "אירעה שגיאה ב-Discord Client.",
                [
                    {
                        name: "❌ Error",
                        value:
                            String(error)
                                .slice(0, 1000)
                    }
                ]
            );
        }
    }
);

process.on(
    "unhandledRejection",
    async error => {
        console.error(
            "Unhandled rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception:",
            error
        );
    }
);

// ============================================================
// 🚀 LOGIN
// ============================================================

client.login(TOKEN);
