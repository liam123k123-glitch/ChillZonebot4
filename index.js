// ============================================================
// 🔵 CHILLZONE COMMUNITY BOT
// Discord.js v14 + PostgreSQL + Gemini
// Render Ready
// ============================================================

require("dotenv").config();

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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    ChannelType,
    SlashCommandBuilder,
    REST,
    Routes,
    ActivityType
} = require("discord.js");

const { Pool } = require("pg");
const http = require("http");

// ============================================================
// 🔐 ENV
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN חסר.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID חסר.");
    process.exit(1);
}

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL חסר ב-Render.");
    console.error("הוסף PostgreSQL ל-Render והוסף את DATABASE_URL.");
    process.exit(1);
}

// ============================================================
// 🗄️ POSTGRESQL
// ============================================================

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("✅ PostgreSQL מחובר ומוכן.");

    } catch (error) {

        console.error(
            "❌ PostgreSQL error:",
            error
        );

        process.exit(1);
    }
}

// ============================================================
// 💾 DEFAULT SETTINGS
// ============================================================

function defaultGuildData() {

    return {

        botImage: null,

        logsChannel: null,

        welcomeChannel: null,

        verifyChannel: null,
        verifyRole: null,

        ticketChannel: null,
        ticketCategory: null,

        staffRole: null,
        muteRole: null,

        suggestionChannel: null,
        suggestionStaffChannel: null,
        suggestionRole: null,

        aiChannel: null,
        aiEnabled: true,

        linksChannel: null,
        links: [],

        countingChannel: null,
        countingNumber: 0,
        lastCounter: null,

        tickets: {},
        suggestions: {},

        helpRequests: {}
    };
}

// ============================================================
// 💾 DATABASE FUNCTIONS
// ============================================================

const guildCache = new Map();

async function getGuildData(guildId) {

    if (guildCache.has(guildId)) {
        return guildCache.get(guildId);
    }

    try {

        const result = await pool.query(
            `
            SELECT data
            FROM guild_settings
            WHERE guild_id = $1
            `,
            [guildId]
        );

        if (result.rows.length === 0) {

            const fresh =
                defaultGuildData();

            await pool.query(
                `
                INSERT INTO guild_settings
                (guild_id, data)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (guild_id)
                DO NOTHING
                `,
                [
                    guildId,
                    JSON.stringify(fresh)
                ]
            );

            guildCache.set(
                guildId,
                fresh
            );

            return fresh;
        }

        const saved =
            result.rows[0].data || {};

        const merged = {
            ...defaultGuildData(),
            ...saved
        };

        guildCache.set(
            guildId,
            merged
        );

        return merged;

    } catch (error) {

        console.error(
            "❌ getGuildData error:",
            error
        );

        return defaultGuildData();
    }
}

async function saveGuildData(
    guildId,
    guildData
) {

    try {

        guildCache.set(
            guildId,
            guildData
        );

        await pool.query(
            `
            INSERT INTO guild_settings
            (guild_id, data, updated_at)
            VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)

            ON CONFLICT (guild_id)
            DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                guildId,
                JSON.stringify(guildData)
            ]
        );

    } catch (error) {

        console.error(
            "❌ saveGuildData error:",
            error
        );
    }
}

// ============================================================
// 🔵 DISCORD CLIENT
// ============================================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMembers,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildVoiceStates

    ],

    partials: [

        Partials.Channel,

        Partials.Message,

        Partials.User,

        Partials.GuildMember

    ]
});

// ============================================================
// 🎨 COLORS
// ============================================================

const BLUE = 0x3498DB;

// ============================================================
// 🧰 HELPERS
// ============================================================

function clip(
    text,
    length = 1000
) {

    text =
        String(text || "לא ידוע");

    if (text.length <= length) {
        return text;
    }

    return (
        text.slice(
            0,
            length - 3
        ) + "..."
    );
}

function cleanMentions(text) {

    return String(text || "")
        .replace(
            /@everyone/g,
            "@\u200beveryone"
        )
        .replace(
            /@here/g,
            "@\u200bhere"
        );
}

function getBotImage(guild) {

    const config =
        guild
            ? guildCache.get(guild.id)
            : null;

    if (
        config &&
        config.botImage
    ) {
        return config.botImage;
    }

    if (client.user) {

        return client.user.displayAvatarURL({
            extension: "png",
            size: 256
        });
    }

    return null;
}

function makeEmbed(
    guild,
    title,
    description
) {

    const embed =
        new EmbedBuilder()
            .setColor(BLUE)
            .setTitle(title)
            .setDescription(
                description
            )
            .setTimestamp();

    const image =
        getBotImage(guild);

    if (image) {
        embed.setThumbnail(image);
    }

    return embed;
}

async function isStaffMember(
    member
) {

    if (!member) {
        return false;
    }

    if (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return true;
    }

    const config =
        await getGuildData(
            member.guild.id
        );

    if (
        config.staffRole &&
        member.roles.cache.has(
            config.staffRole
        )
    ) {
        return true;
    }

    return false;
}

async function sendLog(
    guild,
    title,
    description
) {

    try {

        const config =
            await getGuildData(
                guild.id
            );

        if (!config.logsChannel) {
            return;
        }

        const channel =
            guild.channels.cache.get(
                config.logsChannel
            );

        if (!channel) {
            return;
        }

        const embed =
            makeEmbed(
                guild,
                title,
                description
            );

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {

        console.error(
            "❌ Log error:",
            error
        );
    }
}

// ============================================================
// 📜 SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("מציג את כל הגדרות הבוט"),

    new SlashCommandBuilder()
        .setName("set-image")
        .setDescription("הגדרת תמונת הבוט")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("קישור ישיר לתמונה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("set-logs")
        .setDescription("הגדרת חדר לוגים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הלוגים")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("set-staff")
        .setDescription("הגדרת Staff Role")
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("רול הצוות")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("set-mute")
        .setDescription("הגדרת Mute Role")
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("רול ההשתקה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("set-ai")
        .setDescription("הגדרת חדר ה-AI")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר שבו הבוט יענה ב-AI")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("set-ticket-category")
        .setDescription("הגדרת קטגוריית הטיקטים")
        .addChannelOption(option =>
            option
                .setName("category")
                .setDescription("קטגוריית הטיקטים")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildCategory
                )
        ),

    new SlashCommandBuilder()
        .setName("set-ticket-channel")
        .setDescription("הגדרת חדר פאנל הטיקטים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הפאנל")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("ticket-panel")
        .setDescription("שליחת פאנל טיקטים"),

    new SlashCommandBuilder()
        .setName("staff-panel")
        .setDescription("שליחת פאנל צוות"),

    new SlashCommandBuilder()
        .setName("set-verify")
        .setDescription("הגדרת מערכת אימות")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר האימות")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("הרול שמקבלים")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("verify-panel")
        .setDescription("שליחת פאנל אימות"),

    new SlashCommandBuilder()
        .setName("set-welcome")
        .setDescription("הגדרת חדר ברוכים הבאים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר Welcome")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("set-suggestions")
        .setDescription("הגדרת מערכת ההצעות")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר ההצעות")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        )
        .addChannelOption(option =>
            option
                .setName("staffchannel")
                .setDescription("חדר צוות ההצעות")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("הרול שיתויג בכל הצעה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("set-links")
        .setDescription("הגדרת חדר הקישורים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הקישורים")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("add-link")
        .setDescription("הוספת קישור")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("שם הקישור")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("הקישור")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear-links")
        .setDescription("מחיקת כל הקישורים"),

    new SlashCommandBuilder()
        .setName("links-panel")
        .setDescription("שליחת פאנל קישורים"),

    new SlashCommandBuilder()
        .setName("set-counting")
        .setDescription("הגדרת חדר ספירה")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הספירה")
                .setRequired(true)
                .addChannelTypes(
                    ChannelType.GuildText
                )
        ),

    new SlashCommandBuilder()
        .setName("reset-counting")
        .setDescription("איפוס הספירה")

].map(command =>
    command.toJSON()
);

// ============================================================
// 📡 REGISTER COMMANDS
// ============================================================

async function registerCommands() {

    try {

        const rest =
            new REST({
                version: "10"
            }).setToken(TOKEN);

        if (GUILD_ID) {

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                "✅ Slash commands registered to guild."
            );

        } else {

            await rest.put(
                Routes.applicationCommands(
                    CLIENT_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                "✅ Global Slash commands registered."
            );
        }

    } catch (error) {

        console.error(
            "❌ Command registration error:",
            error
        );
    }
}

// ============================================================
// 🟢 READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            `🔵 ChillZone מחובר בתור ${client.user.tag}`
        );

        client.user.setPresence({

            activities: [
                {
                    name: "ChillZone 🔵",
                    type: ActivityType.Watching
                }
            ],

            status: "online"
        });

        await initDatabase();

        // טעינת כל השרתים לזיכרון
        for (
            const guild of client.guilds.cache.values()
        ) {

            await getGuildData(
                guild.id
            );
        }

        await registerCommands();
    }
);

// ============================================================
// 👋 WELCOME
// ============================================================

client.on(
    "guildMemberAdd",
    async member => {

        try {

            const config =
                await getGuildData(
                    member.guild.id
                );

            if (
                config.welcomeChannel
            ) {

                const channel =
                    member.guild.channels.cache.get(
                        config.welcomeChannel
                    );

                if (channel) {

                    const embed =
                        makeEmbed(
                            member.guild,
                            "👋 ברוכים הבאים ל־ChillZone!",
                            `היי ${member}! 👋\n\n`
                            + `שמחים שהצטרפת לקהילה שלנו 💙\n`
                            + `תיהנה, תכיר אנשים ותשתתף בקהילה!`
                        );

                    await channel.send({
                        content: `${member}`,
                        embeds: [embed]
                    });
                }
            }

            await sendLog(
                member.guild,
                "👋 משתמש נכנס",
                `**משתמש:** ${member.user.tag}\n`
                + `**ID:** ${member.id}`
            );

        } catch (error) {

            console.error(
                "Welcome error:",
                error
            );
        }
    }
);

// ============================================================
// 🚪 MEMBER LEAVE
// ============================================================

client.on(
    "guildMemberRemove",
    async member => {

        await sendLog(
            member.guild,
            "🚪 משתמש יצא",
            `**משתמש:** ${member.user?.tag || "לא ידוע"}\n`
            + `**ID:** ${member.id}`
        );
    }
);

// ============================================================
// 🔐 VERIFY PANEL
// ============================================================

async function sendVerifyPanel(
    guild,
    channel
) {

    const embed =
        makeEmbed(
            guild,
            "🔐 אימות ChillZone",
            "ברוכים הבאים לשרת! 💙\n\n"
            + "לחץ על הכפתור למטה כדי לאמת את עצמך.\n\n"
            + "לאחר האימות תקבל את הרול שהוגדר."
        );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "verify_member"
                    )
                    .setLabel("אימות")
                    .setEmoji("✅")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// 🎫 TICKET PANEL
// ============================================================

async function sendTicketPanel(
    guild,
    channel
) {

    const embed =
        makeEmbed(
            guild,
            "🎫 מערכת הטיקטים",
            "צריך עזרה? אנחנו כאן בשבילך 💙\n\n"
            + "בחר את סוג הפנייה:\n\n"
            + "🆘 **תמיכה**\n"
            + "🚨 **דיווח**\n"
            + "👮 **בחינה לצוות**\n"
            + "❓ **אחר**\n\n"
            + "לאחר פתיחת הטיקט, איש צוות אחד יוכל לקחת אותו."
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "ticket_type"
            )
            .setPlaceholder(
                "🎫 בחר סוג טיקט"
            )
            .addOptions(

                new StringSelectMenuOptionBuilder()
                    .setLabel("תמיכה")
                    .setDescription(
                        "עזרה כללית"
                    )
                    .setEmoji("🆘")
                    .setValue("support"),

                new StringSelectMenuOptionBuilder()
                    .setLabel("דיווח")
                    .setDescription(
                        "דיווח על משתמש או בעיה"
                    )
                    .setEmoji("🚨")
                    .setValue("report"),

                new StringSelectMenuOptionBuilder()
                    .setLabel("בחינה לצוות")
                    .setDescription(
                        "פנייה בנושא צוות"
                    )
                    .setEmoji("👮")
                    .setValue("staff"),

                new StringSelectMenuOptionBuilder()
                    .setLabel("אחר")
                    .setDescription(
                        "נושא אחר"
                    )
                    .setEmoji("❓")
                    .setValue("other")
            );

    const row =
        new ActionRowBuilder()
            .addComponents(menu);

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// 🎛️ TICKET BUTTONS
// ============================================================

function createTicketButtons(
    claimed
) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId(
                    "ticket_claim"
                )
                .setLabel(
                    claimed
                        ? "טיקט נלקח"
                        : "קח טיקט"
                )
                .setEmoji("🙋")
                .setStyle(
                    claimed
                        ? ButtonStyle.Secondary
                        : ButtonStyle.Primary
                )
                .setDisabled(
                    claimed
                ),

            new ButtonBuilder()
                .setCustomId(
                    "ticket_add_staff"
                )
                .setLabel(
                    "הוסף צוות"
                )
                .setEmoji("👥")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "ticket_close"
                )
                .setLabel(
                    "סגור טיקט"
                )
                .setEmoji("🔒")
                .setStyle(
                    ButtonStyle.Danger
                )
        );
}

// ============================================================
// 🎫 CREATE TICKET
// ============================================================

async function createTicket(
    interaction,
    type
) {

    const guild =
        interaction.guild;

    const member =
        interaction.member;

    const config =
        await getGuildData(
            guild.id
        );

    const existing =
        Object.entries(
            config.tickets
        ).find(
            ([channelId, ticket]) =>
                ticket.userId === member.id
        );

    if (existing) {

        const oldChannel =
            guild.channels.cache.get(
                existing[0]
            );

        if (oldChannel) {

            return interaction.reply({
                content:
                    `❌ כבר יש לך טיקט פתוח: ${oldChannel}`,
                ephemeral: true
            });
        }
    }

    if (!config.ticketCategory) {

        return interaction.reply({
            content:
                "❌ עדיין לא הוגדרה קטגוריית טיקטים.\n"
                + "השתמש ב־`/set-ticket-category`.",
            ephemeral: true
        });
    }

    const category =
        guild.channels.cache.get(
            config.ticketCategory
        );

    if (
        !category ||
        category.type !== ChannelType.GuildCategory
    ) {

        return interaction.reply({
            content:
                "❌ קטגוריית הטיקטים לא נמצאה.",
            ephemeral: true
        });
    }

    const typeNames = {

        support: "תמיכה",

        report: "דיווח",

        staff: "בחינה לצוות",

        other: "אחר"
    };

    const safeUsername =
        member.user.username
            .toLowerCase()
            .replace(
                /[^a-z0-9]/g,
                ""
            )
            .slice(
                0,
                18
            ) ||
        "user";

    const channelName =
        `ticket-${safeUsername}`;

    const overwrites = [

        {
            id:
                guild.roles.everyone.id,

            deny: [
                PermissionsBitField.Flags.ViewChannel
            ]
        },

        {
            id:
                member.id,

            allow: [

                PermissionsBitField.Flags.ViewChannel,

                PermissionsBitField.Flags.SendMessages,

                PermissionsBitField.Flags.ReadMessageHistory

            ]
        }

    ];

    // רק צוות עם Staff Role יקבל גישה לפני Claim
    if (config.staffRole) {

        overwrites.push({

            id:
                config.staffRole,

            allow: [

                PermissionsBitField.Flags.ViewChannel,

                PermissionsBitField.Flags.SendMessages,

                PermissionsBitField.Flags.ReadMessageHistory

            ]
        });
    }

    const channel =
        await guild.channels.create({

            name:
                channelName,

            type:
                ChannelType.GuildText,

            parent:
                category.id,

            permissionOverwrites:
                overwrites
        });

    config.tickets[
        channel.id
    ] = {

        userId:
            member.id,

        type:
            type,

        claimed:
            false,

        claimedBy:
            null,

        addedStaff:
            [],

        aiHistory:
            [],

        createdAt:
            Date.now()
    };

    await saveGuildData(
        guild.id,
        config
    );

    const embed =
        makeEmbed(
            guild,
            `🎫 טיקט — ${typeNames[type]}`,
            `שלום ${member}! 👋\n\n`
            + `הטיקט שלך נפתח בהצלחה.\n`
            + `כתוב כאן במה אתה צריך עזרה.\n\n`
            + `🤖 **ה-AI של ChillZone פעיל כרגע.**\n`
            + `הוא יענה עד שאיש צוות ייקח את הטיקט.\n\n`
            + `👥 לאחר Claim ניתן להוסיף אנשי צוות דרך **הוסף צוות**.`
        );

    await channel.send({

        content:
            `${member}`,

        embeds: [
            embed
        ],

        components: [
            createTicketButtons(false)
        ]
    });

    await interaction.reply({

        content:
            `✅ הטיקט שלך נפתח: ${channel}`,

        ephemeral: true
    });

    await sendLog(

        guild,

        "🎫 טיקט נפתח",

        `**משתמש:** ${member.user.tag}\n`
        + `**ID:** ${member.id}\n`
        + `**סוג:** ${typeNames[type]}\n`
        + `**חדר:** ${channel}`
    );
}

// ============================================================
// 👥 STAFF MEMBERS
// ============================================================

async function getStaffMembers(
    guild
) {

    const config =
        await getGuildData(
            guild.id
        );

    if (!config.staffRole) {
        return [];
    }

    const role =
        guild.roles.cache.get(
            config.staffRole
        );

    if (!role) {
        return [];
    }

    return [
        ...role.members.values()
    ].filter(
        member =>
            !member.user.bot
    );
}

// ============================================================
// 👥 STAFF SELECT
// ============================================================

async function showStaffSelector(
    interaction
) {

    const guild =
        interaction.guild;

    const members =
        await getStaffMembers(
            guild
        );

    if (!members.length) {

        return interaction.reply({
            content:
                "❌ לא נמצאו משתמשים עם Staff Role.",
            ephemeral: true
        });
    }

    const visible =
        members.slice(
            0,
            25
        );

    const options =
        visible.map(
            member =>

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        member.user.username
                            .slice(0, 100)
                    )
                    .setDescription(
                        `ID: ${member.id}`
                    )
                    .setValue(
                        member.id
                    )
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                `ticket_add_staff_select_${interaction.channel.id}`
            )
            .setPlaceholder(
                "👥 בחר איש צוות"
            )
            .addOptions(
                options
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                menu
            );

    await interaction.reply({

        content:
            members.length > 25
                ? "👥 בחר איש צוות. כרגע מוצגים 25 הראשונים."
                : "👥 בחר איש צוות להוספה לטיקט:",

        components: [
            row
        ],

        ephemeral: true
    });
}

// ============================================================
// 🤖 GEMINI AI
// ============================================================

async function askGemini(
    message,
    history = []
) {

    if (!GEMINI_API_KEY) {

        console.error(
            "❌ GEMINI_API_KEY חסר."
        );

        return null;
    }

    try {

        const contents = [];

        for (
            const item of history.slice(-20)
        ) {

            contents.push({

                role:
                    item.role,

                parts: [
                    {
                        text:
                            item.text
                    }
                ]
            });
        }

        contents.push({

            role:
                "user",

            parts: [
                {
                    text:
                        message
                }
            ]
        });

        const response =
            await fetch(

                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            contents,

                            systemInstruction: {

                                parts: [

                                    {
                                        text:
                                            "אתה ChillZone AI. ענה בעברית בצורה ברורה, ידידותית ומפורטת. אל תקצר תשובות בכוונה. אם המשתמש מבקש משהו שדורש איש צוות, הסבר לו שאיש צוות יוכל לטפל בזה. אל תטען שאתה איש צוות."
                                    }

                                ]
                            },

                            generationConfig: {

                                temperature:
                                    0.7,

                                maxOutputTokens:
                                    4096
                            }
                        })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            console.error(
                "❌ Gemini API:",
                result
            );

            return null;
        }

        const text =
            result
                ?.candidates?.[0]
                ?.content?.parts
                ?.map(
                    part =>
                        part.text || ""
                )
                .join("")
                .trim();

        return text || null;

    } catch (error) {

        console.error(
            "❌ Gemini error:",
            error
        );

        return null;
    }
}

// ============================================================
// 🤖 SPLIT AI MESSAGE
// ============================================================

function splitMessage(
    text
) {

    const chunks = [];

    let remaining =
        String(text);

    while (
        remaining.length > 0
    ) {

        if (
            remaining.length <= 1900
        ) {

            chunks.push(
                remaining
            );

            break;
        }

        let cut =
            remaining.lastIndexOf(
                "\n",
                1900
            );

        if (
            cut < 500
        ) {

            cut =
                remaining.lastIndexOf(
                    " ",
                    1900
                );
        }

        if (
            cut <= 0
        ) {
            cut = 1900;
        }

        chunks.push(
            remaining.slice(
                0,
                cut
            )
        );

        remaining =
            remaining
                .slice(cut)
                .trimStart();
    }

    return chunks;
}

// ============================================================
// 💬 MESSAGE CREATE
// ============================================================

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        const guild =
            message.guild;

        const config =
            await getGuildData(
                guild.id
            );

        // ====================================================
        // 🧹 !cl 1-100
        // ====================================================

        const clMatch =
            message.content
                .trim()
                .match(
                    /^!cl\s+(\d+)$/i
                );

        if (clMatch) {

            if (
                !(await isStaffMember(
                    message.member
                ))
            ) {

                await message.reply(
                    "❌ רק צוות יכול להשתמש בפקודה הזאת."
                );

                return;
            }

            const amount =
                parseInt(
                    clMatch[1]
                );

            if (
                amount < 1 ||
                amount > 100
            ) {

                await message.reply(
                    "❌ אפשר למחוק רק מספר בין 1 ל־100."
                );

                return;
            }

            try {

                const deleted =
                    await message.channel.bulkDelete(
                        amount,
                        true
                    );

                const confirmation =
                    await message.channel.send(
                        `🧹 נמחקו **${deleted.size}** הודעות בהצלחה.`
                    );

                setTimeout(
                    () => {

                        confirmation
                            .delete()
                            .catch(() => {});

                    },
                    3000
                );

                await sendLog(
                    guild,
                    "🧹 ניקוי הודעות",
                    `**צוות:** ${message.author.tag}\n`
                    + `**חדר:** ${message.channel}\n`
                    + `**כמות שבוקשה:** ${amount}\n`
                    + `**כמות שנמחקה:** ${deleted.size}`
                );

            } catch (error) {

                console.error(
                    "Clear error:",
                    error
                );

                await message.reply(
                    "❌ לא הצלחתי למחוק את ההודעות. ודא שלבוט יש Manage Messages."
                );
            }

            return;
        }

        // ====================================================
        // 💡 !הצעה
        // ====================================================

        if (
            message.content
                .trim()
                .startsWith("!הצעה")
        ) {

            const suggestion =
                message.content
                    .trim()
                    .slice(
                        "!הצעה".length
                    )
                    .trim();

            if (!suggestion) {

                await message.reply(
                    "❌ שימוש נכון: `!הצעה ההצעה שלך`"
                );

                return;
            }

            if (
                !config.suggestionChannel
            ) {

                await message.reply(
                    "❌ חדר ההצעות עדיין לא הוגדר."
                );

                return;
            }

            if (
                message.channel.id !==
                config.suggestionChannel
            ) {

                await message.reply(
                    `❌ שלח את ההצעה בחדר <#${config.suggestionChannel}>.`
                );

                return;
            }

            if (
                !config.suggestionStaffChannel
            ) {

                await message.reply(
                    "❌ חדר צוות ההצעות עדיין לא הוגדר."
                );

                return;
            }

            const staffChannel =
                guild.channels.cache.get(
                    config.suggestionStaffChannel
                );

            if (!staffChannel) {

                await message.reply(
                    "❌ חדר צוות ההצעות לא נמצא."
                );

                return;
            }

            const suggestionId =
                `${Date.now()}-${message.author.id}`;

            config.suggestions[
                suggestionId
            ] = {

                userId:
                    message.author.id,

                content:
                    suggestion,

                createdAt:
                    Date.now(),

                decided:
                    false,

                accepted:
                    null,

                decidedBy:
                    null
            };

            await saveGuildData(
                guild.id,
                config
            );

            const embed =
                makeEmbed(
                    guild,
                    "💡 הצעה חדשה",
                    `**מאת:** ${message.author}\n\n`
                    + `**ההצעה:**\n${cleanMentions(suggestion)}`
                );

            embed.addFields({

                name:
                    "🆔 מזהה",

                value:
                    `\`${suggestionId}\``
            });

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `suggestion_accept_${suggestionId}`
                            )
                            .setLabel(
                                "אישור"
                            )
                            .setEmoji(
                                "✅"
                            )
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `suggestion_reject_${suggestionId}`
                            )
                            .setLabel(
                                "דחייה"
                            )
                            .setEmoji(
                                "❌"
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            // =================================================
            // 📢 תיוג Staff Role
            // =================================================

            const roleMention =
                config.suggestionRole
                    ? `<@&${config.suggestionRole}>`
                    : "";

            await staffChannel.send({

                content:
                    roleMention,

                embeds: [
                    embed
                ],

                components: [
                    row
                ]
            });

            await message.reply(
                "✅ ההצעה שלך נשלחה לצוות לבדיקה."
            );

            await sendLog(
                guild,
                "💡 הצעה נשלחה",
                `**משתמש:** ${message.author.tag}\n`
                + `**הצעה:** ${cleanMentions(suggestion)}`
            );

            return;
        }

        // ====================================================
        // 🤖 AI ROOM
        // ====================================================

        if (
            config.aiChannel &&
            message.channel.id ===
                config.aiChannel &&
            config.aiEnabled
        ) {

            const answer =
                await askGemini(
                    message.content,
                    []
                );

            if (!answer) {

                await message.reply(
                    "❌ ה-AI לא הצליח לענות כרגע."
                );

                return;
            }

            const chunks =
                splitMessage(
                    answer
                );

            for (
                const chunk of chunks
            ) {

                await message.channel.send(
                    chunk
                );
            }

            return;
        }

        // ====================================================
        // 🎫 TICKET AI
        // ====================================================

        const ticket =
            config.tickets[
                message.channel.id
            ];

        if (!ticket) {
            return;
        }

        // אחרי Claim ה-AI מפסיק
        if (
            ticket.claimed
        ) {
            return;
        }

        if (
            !config.aiEnabled
        ) {
            return;
        }

        if (
            !ticket.aiHistory
        ) {

            ticket.aiHistory =
                [];
        }

        const answer =
            await askGemini(
                message.content,
                ticket.aiHistory
            );

        if (!answer) {
            return;
        }

        ticket.aiHistory.push({

            role:
                "user",

            text:
                message.content
        });

        ticket.aiHistory.push({

            role:
                "model",

            text:
                answer
        });

        await saveGuildData(
            guild.id,
            config
        );

        const chunks =
            splitMessage(
                answer
            );

        for (
            const chunk of chunks
        ) {

            await message.channel.send(
                chunk
            );
        }
    }
);

// ============================================================
// 🔘 INTERACTION CREATE
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        try {

            if (
                interaction.isChatInputCommand()
            ) {

                await handleCommand(
                    interaction
                );

                return;
            }

            if (
                interaction.isButton()
            ) {

                await handleButton(
                    interaction
                );

                return;
            }

            if (
                interaction.isStringSelectMenu()
            ) {

                await handleSelect(
                    interaction
                );

                return;
            }

            if (
                interaction.isModalSubmit()
            ) {

                await handleModal(
                    interaction
                );

                return;
            }

        } catch (error) {

            console.error(
                "❌ Interaction error:",
                error
            );

            try {

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

                    await interaction.followUp({

                        content:
                            "❌ אירעה שגיאה.",

                        ephemeral:
                            true
                    });

                } else {

                    await interaction.reply({

                        content:
                            "❌ אירעה שגיאה.",

                        ephemeral:
                            true
                    });
                }

            } catch {}
        }
    }
);

// ============================================================
// 📋 SELECT MENUS
// ============================================================

async function handleSelect(
    interaction
) {

    // ========================================================
    // 🎫 TICKET TYPE
    // ========================================================

    if (
        interaction.customId ===
        "ticket_type"
    ) {

        await createTicket(
            interaction,
            interaction.values[0]
        );

        return;
    }

    // ========================================================
    // 👥 ADD STAFF
    // ========================================================

    if (
        interaction.customId
            .startsWith(
                "ticket_add_staff_select_"
            )
    ) {

        const channelId =
            interaction.customId.replace(
                "ticket_add_staff_select_",
                ""
            );

        const guild =
            interaction.guild;

        const config =
            await getGuildData(
                guild.id
            );

        const ticket =
            config.tickets[
                channelId
            ];

        if (!ticket) {

            return interaction.reply({

                content:
                    "❌ הטיקט לא נמצא.",

                ephemeral:
                    true
            });
        }

        if (
            !(await isStaffMember(
                interaction.member
            ))
        ) {

            return interaction.reply({

                content:
                    "❌ רק צוות יכול להוסיף צוות.",

                ephemeral:
                    true
            });
        }

        const userId =
            interaction.values[0];

        const member =
            await guild.members.fetch(
                userId
            ).catch(
                () => null
            );

        if (!member) {

            return interaction.reply({

                content:
                    "❌ המשתמש לא נמצא.",

                ephemeral:
                    true
            });
        }

        if (
            !ticket.addedStaff
        ) {

            ticket.addedStaff =
                [];
        }

        if (
            !ticket.addedStaff.includes(
                member.id
            )
        ) {

            ticket.addedStaff.push(
                member.id
            );
        }

        const channel =
            guild.channels.cache.get(
                channelId
            );

        if (!channel) {

            return interaction.reply({

                content:
                    "❌ חדר הטיקט לא נמצא.",

                ephemeral:
                    true
            });
        }

        await channel.permissionOverwrites.edit(
            member.id,
            {

                ViewChannel:
                    true,

                SendMessages:
                    true,

                ReadMessageHistory:
                    true
            }
        );

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ ${member} נוסף לטיקט.`,

            ephemeral:
                true
        });

        await channel.send(
            `👥 ${interaction.user} הוסיף את ${member} לטיקט.`
        );

        await sendLog(
            guild,
            "👥 צוות נוסף לטיקט",
            `**הוסיף:** ${interaction.user.tag}\n`
            + `**נוסף:** ${member.user.tag}\n`
            + `**טיקט:** ${channel}`
        );

        return;
    }
}

// ============================================================
// 🔘 BUTTONS
// ============================================================

async function handleButton(
    interaction
) {

    const guild =
        interaction.guild;

    if (!guild) {
        return;
    }

    const config =
        await getGuildData(
            guild.id
        );

    const id =
        interaction.customId;

    // ========================================================
    // 🔐 VERIFY
    // ========================================================

    if (
        id ===
        "verify_member"
    ) {

        if (!config.verifyRole) {

            return interaction.reply({

                content:
                    "❌ רול האימות לא הוגדר.",

                ephemeral:
                    true
            });
        }

        const role =
            guild.roles.cache.get(
                config.verifyRole
            );

        if (!role) {

            return interaction.reply({

                content:
                    "❌ רול האימות לא נמצא.",

                ephemeral:
                    true
            });
        }

        if (
            interaction.member.roles.cache.has(
                role.id
            )
        ) {

            return interaction.reply({

                content:
                    "ℹ️ אתה כבר מאומת.",

                ephemeral:
                    true
            });
        }

        try {

            await interaction.member.roles.add(
                role
            );

            await interaction.reply({

                content:
                    "✅ אומתת בהצלחה! ברוך הבא ל־ChillZone 💙",

                ephemeral:
                    true
            });

            await sendLog(
                guild,
                "🔐 משתמש אומת",
                `**משתמש:** ${interaction.user.tag}\n`
                + `**ID:** ${interaction.user.id}\n`
                + `**רול:** ${role.name}`
            );

        } catch {

            await interaction.reply({

                content:
                    "❌ לא הצלחתי לתת לך את רול האימות. ודא שרול הבוט נמצא מעל רול האימות.",

                ephemeral:
                    true
            });
        }

        return;
    }

    // ========================================================
    // 🎫 CLAIM
    // ========================================================

    if (
        id ===
        "ticket_claim"
    ) {

        if (
            !(await isStaffMember(
                interaction.member
            ))
        ) {

            return interaction.reply({

                content:
                    "❌ רק צוות יכול לקחת טיקט.",

                ephemeral:
                    true
            });
        }

        const ticket =
            config.tickets[
                interaction.channel.id
            ];

        if (!ticket) {

            return interaction.reply({

                content:
                    "❌ הטיקט לא נמצא.",

                ephemeral:
                    true
            });
        }

        if (
            ticket.claimed
        ) {

            return interaction.reply({

                content:
                    `❌ הטיקט כבר נלקח על ידי <@${ticket.claimedBy}>.`,

                ephemeral:
                    true
            });
        }

        ticket.claimed =
            true;

        ticket.claimedBy =
            interaction.user.id;

        await saveGuildData(
            guild.id,
            config
        );

        // ================================================
        // 🚫 Staff Role no longer sees ticket
        // ================================================

        if (
            config.staffRole
        ) {

            await interaction.channel
                .permissionOverwrites.edit(
                    config.staffRole,
                    {

                        ViewChannel:
                            false,

                        SendMessages:
                            false,

                        ReadMessageHistory:
                            false
                    }
                );
        }

        // ================================================
        // 🙋 Claimant gets access
        // ================================================

        await interaction.channel
            .permissionOverwrites.edit(
                interaction.user.id,
                {

                    ViewChannel:
                        true,

                    SendMessages:
                        true,

                    ReadMessageHistory:
                        true
                }
            );

        // ================================================
        // 👥 Previously added staff
        // ================================================

        for (
            const staffId of
                ticket.addedStaff || []
        ) {

            await interaction.channel
                .permissionOverwrites.edit(
                    staffId,
                    {

                        ViewChannel:
                            true,

                        SendMessages:
                            true,

                        ReadMessageHistory:
                            true
                    }
                )
                .catch(
                    () => {}
                );
        }

        // ================================================
        // 🔘 Disable claim button
        // ================================================

        await interaction.message.edit({

            components: [
                createTicketButtons(true)
            ]
        });

        await interaction.reply({

            content:
                "🙋 לקחת את הטיקט בהצלחה.",

            ephemeral:
                true
        });

        await interaction.channel.send(
            `🙋 **${interaction.user} לקח את הטיקט.**\n`
            + `🤖 ה-AI הפסיק לענות בטיקט הזה.\n`
            + `👥 כדי להוסיף איש צוות נוסף, השתמש בכפתור **הוסף צוות**.`
        );

        await sendLog(
            guild,
            "🙋 טיקט נלקח",
            `**צוות:** ${interaction.user.tag}\n`
            + `**טיקט:** ${interaction.channel.name}`
        );

        return;
    }

    // ========================================================
    // 👥 ADD STAFF
    // ========================================================

    if (
        id ===
        "ticket_add_staff"
    ) {

        if (
            !(await isStaffMember(
                interaction.member
            ))
        ) {

            return interaction.reply({

                content:
                    "❌ רק צוות יכול להוסיף צוות.",

                ephemeral:
                    true
            });
        }

        const ticket =
            config.tickets[
                interaction.channel.id
            ];

        if (!ticket) {

            return interaction.reply({

                content:
                    "❌ הטיקט לא נמצא.",

                ephemeral:
                    true
            });
        }

        await showStaffSelector(
            interaction
        );

        return;
    }

    // ========================================================
    // 🔒 CLOSE
    // ========================================================

    if (
        id ===
        "ticket_close"
    ) {

        const ticket =
            config.tickets[
                interaction.channel.id
            ];

        if (!ticket) {

            return interaction.reply({

                content:
                    "❌ הטיקט לא נמצא.",

                ephemeral:
                    true
            });
        }

        const allowed =
            ticket.userId ===
                interaction.user.id ||
            await isStaffMember(
                interaction.member
            );

        if (!allowed) {

            return interaction.reply({

                content:
                    "❌ אין לך הרשאה לסגור את הטיקט.",

                ephemeral:
                    true
            });
        }

        await interaction.reply(
            "🔒 הטיקט ייסגר בעוד 5 שניות..."
        );

        await sendLog(
            guild,
            "🔒 טיקט נסגר",
            `**על ידי:** ${interaction.user.tag}\n`
            + `**טיקט:** ${interaction.channel.name}`
        );

        setTimeout(
            async () => {

                const latest =
                    await getGuildData(
                        guild.id
                    );

                delete latest.tickets[
                    interaction.channel.id
                ];

                await saveGuildData(
                    guild.id,
                    latest
                );

                await interaction.channel
                    .delete()
                    .catch(
                        () => {}
                    );

            },
            5000
        );

        return;
    }

    // ========================================================
    // 🛡️ STAFF MODERATION
    // ========================================================

    if (
        [
            "staff_timeout",
            "staff_ban",
            "staff_kick",
            "staff_mute"
        ].includes(id)
    ) {

        if (
            !(await isStaffMember(
                interaction.member
            ))
        ) {

            return interaction.reply({

                content:
                    "❌ רק צוות יכול להשתמש בפאנל.",

                ephemeral:
                    true
            });
        }

        let modalId;
        let title;

        if (
            id ===
            "staff_timeout"
        ) {

            modalId =
                "modal_timeout";

            title =
                "⏱️ Timeout";
        }

        if (
            id ===
            "staff_ban"
        ) {

            modalId =
                "modal_ban";

            title =
                "🔨 Ban";
        }

        if (
            id ===
            "staff_kick"
        ) {

            modalId =
                "modal_kick";

            title =
                "👢 Kick";
        }

        if (
            id ===
            "staff_mute"
        ) {

            modalId =
                "modal_mute";

            title =
                "🔇 Mute";
        }

        const modal =
            new ModalBuilder()
                .setCustomId(
                    modalId
                )
                .setTitle(
                    title
                );

        const userInput =
            new TextInputBuilder()
                .setCustomId(
                    "user_id"
                )
                .setLabel(
                    "Discord User ID"
                )
                .setPlaceholder(
                    "לדוגמה: 123456789012345678"
                )
                .setStyle(
                    TextInputStyle.Short
                )
                .setRequired(
                    true
                );

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(
                    userInput
                )
        );

        if (
            id ===
            "staff_timeout"
        ) {

            const timeInput =
                new TextInputBuilder()
                    .setCustomId(
                        "minutes"
                    )
                    .setLabel(
                        "כמה דקות?"
                    )
                    .setPlaceholder(
                        "לדוגמה: 10"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setRequired(
                        true
                    );

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        timeInput
                    )
            );
        }

        await interaction.showModal(
            modal
        );

        return;
    }

    // ========================================================
    // 💡 SUGGESTION DECISION
    // ========================================================

    if (
        id.startsWith(
            "suggestion_accept_"
        ) ||
        id.startsWith(
            "suggestion_reject_"
        )
    ) {

        if (
            !(await isStaffMember(
                interaction.member
            ))
        ) {

            return interaction.reply({

                content:
                    "❌ רק צוות יכול להחליט על הצעה.",

                ephemeral:
                    true
            });
        }

        const accepted =
            id.startsWith(
                "suggestion_accept_"
            );

        const suggestionId =
            id
                .replace(
                    "suggestion_accept_",
                    ""
                )
                .replace(
                    "suggestion_reject_",
                    "");

        const suggestion =
            config.suggestions[
                suggestionId
            ];

        if (!suggestion) {

            return interaction.reply({

                content:
                    "❌ ההצעה לא נמצאה.",

                ephemeral:
                    true
            });
        }

        if (
            suggestion.decided
        ) {

            return interaction.reply({

                content:
                    "❌ ההצעה כבר קיבלה החלטה.",

                ephemeral:
                    true
            });
        }

        suggestion.decided =
            true;

        suggestion.accepted =
            accepted;

        suggestion.decidedBy =
            interaction.user.id;

        await saveGuildData(
            guild.id,
            config
        );

        // ================================================
        // 📩 DM
        // ================================================

        const user =
            await client.users.fetch(
                suggestion.userId
            ).catch(
                () => null
            );

        if (user) {

            const dmEmbed =
                makeEmbed(

                    guild,

                    accepted
                        ? "✅ ההצעה שלך אושרה!"
                        : "❌ ההצעה שלך נדחתה",

                    accepted

                        ? "צוות ChillZone בדק את ההצעה שלך ואישר אותה 💙"

                        : "צוות ChillZone בדק את ההצעה שלך והחליט שלא לאשר אותה הפעם."
                );

            dmEmbed.addFields({

                name:
                    "💡 ההצעה שלך",

                value:
                    clip(
                        cleanMentions(
                            suggestion.content
                        ),
                        1000
                    )
            });

            await user.send({

                embeds: [
                    dmEmbed
                ]

            }).catch(
                () => {}
            );
        }

        // ================================================
        // UPDATE STAFF MESSAGE
        // ================================================

        const resultEmbed =
            makeEmbed(

                guild,

                accepted
                    ? "✅ הצעה אושרה"
                    : "❌ הצעה נדחתה",

                `**מאת:** <@${suggestion.userId}>\n\n`
                + `**הצעה:**\n${cleanMentions(suggestion.content)}\n\n`
                + `**החלטה:** ${accepted ? "אושרה ✅" : "נדחתה ❌"}\n`
                + `**על ידי:** ${interaction.user}`
            );

        await interaction.message.edit({

            embeds: [
                resultEmbed
            ],

            components: []
        });

        await interaction.reply({

            content:
                accepted
                    ? "✅ ההצעה אושרה והמשתמש קיבל DM."
                    : "❌ ההצעה נדחתה והמשתמש קיבל DM.",

            ephemeral:
                true
        });

        await sendLog(
            guild,
            accepted
                ? "💡 הצעה אושרה"
                : "💡 הצעה נדחתה",
            `**משתמש:** <@${suggestion.userId}>\n`
            + `**צוות:** ${interaction.user.tag}\n`
            + `**הצעה:** ${cleanMentions(suggestion.content)}`
        );

        return;
    }
}

// ============================================================
// 🛡️ STAFF PANEL
// ============================================================

async function sendStaffPanel(
    guild,
    channel
) {

    const embed =
        makeEmbed(

            guild,

            "🛡️ פאנל צוות",

            "פאנל ניהול ChillZone 💙\n\n"
            + "⏱️ **Timeout** — השתקה זמנית\n"
            + "🔨 **Ban** — הרחקת משתמש\n"
            + "👢 **Kick** — הוצאת משתמש\n"
            + "🔇 **Mute** — הוספה/הסרה של Mute Role\n\n"
            + "כל פעולה תבקש Discord User ID."
        );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "staff_timeout"
                    )
                    .setLabel(
                        "Timeout"
                    )
                    .setEmoji(
                        "⏱️"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_ban"
                    )
                    .setLabel(
                        "Ban"
                    )
                    .setEmoji(
                        "🔨"
                    )
                    .setStyle(
                        ButtonStyle.Danger
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_kick"
                    )
                    .setLabel(
                        "Kick"
                    )
                    .setEmoji(
                        "👢"
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_mute"
                    )
                    .setLabel(
                        "Mute"
                    )
                    .setEmoji(
                        "🔇"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    await channel.send({

        embeds: [
            embed
        ],

        components: [
            row
        ]
    });
}

// ============================================================
// 🔗 LINKS PANEL
// ============================================================

async function sendLinksPanel(
    guild,
    channel
) {

    const config =
        await getGuildData(
            guild.id
        );

    const embed =
        makeEmbed(

            guild,

            "🔗 הקישורים של ChillZone",

            "כל הקישורים החשובים במקום אחד 💙"
        );

    if (
        !config.links.length
    ) {

        embed.setDescription(
            "❌ עדיין לא הוגדרו קישורים."
        );

        await channel.send({
            embeds: [
                embed
            ]
        });

        return;
    }

    const rows = [];

    let row =
        new ActionRowBuilder();

    for (
        let i = 0;
        i < config.links.length;
        i++
    ) {

        const link =
            config.links[i];

        const button =
            new ButtonBuilder()
                .setLabel(
                    clip(
                        link.name,
                        80
                    )
                )
                .setURL(
                    link.url
                )
                .setStyle(
                    ButtonStyle.Link
                );

        row.addComponents(
            button
        );

        if (
            row.components.length === 5 ||
            i ===
                config.links.length - 1
        ) {

            rows.push(
                row
            );

            row =
                new ActionRowBuilder();
        }
    }

    await channel.send({

        embeds: [
            embed
        ],

        components:
            rows
    });
}

// ============================================================
// 💻 COMMAND HANDLER
// ============================================================

async function handleCommand(
    interaction
) {

    const guild =
        interaction.guild;

    if (!guild) {
        return;
    }

    const config =
        await getGuildData(
            guild.id
        );

    const adminCommands = [

        "setup",

        "set-image",

        "set-logs",

        "set-staff",

        "set-mute",

        "set-ai",

        "set-ticket-category",

        "set-ticket-channel",

        "ticket-panel",

        "staff-panel",

        "set-verify",

        "verify-panel",

        "set-welcome",

        "set-suggestions",

        "set-links",

        "add-link",

        "clear-links",

        "links-panel",

        "set-counting",

        "reset-counting"

    ];

    if (
        adminCommands.includes(
            interaction.commandName
        )
    ) {

        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.Administrator
            )
        ) {

            return interaction.reply({

                content:
                    "❌ רק Administrator יכול להשתמש בפקודה הזאת.",

                ephemeral:
                    true
            });
        }
    }

    // ========================================================
    // SETUP
    // ========================================================

    if (
        interaction.commandName ===
        "setup"
    ) {

        const embed =
            makeEmbed(

                guild,

                "⚙️ ChillZone Setup",

                "**🔵 בסיס:**\n"
                + "`/set-image` — תמונת הבוט\n"
                + "`/set-logs` — לוגים\n"
                + "`/set-staff` — Staff Role\n"
                + "`/set-mute` — Mute Role\n"
                + "`/set-ai` — חדר AI\n\n"

                + "**🎫 טיקטים:**\n"
                + "`/set-ticket-category`\n"
                + "`/set-ticket-channel`\n"
                + "`/ticket-panel`\n\n"

                + "**🔐 אימות:**\n"
                + "`/set-verify`\n"
                + "`/verify-panel`\n\n"

                + "**👋 Welcome:**\n"
                + "`/set-welcome`\n\n"

                + "**💡 הצעות:**\n"
                + "`/set-suggestions`\n"
                + "`!הצעה הטקסט שלך`\n\n"

                + "**🔗 קישורים:**\n"
                + "`/set-links`\n"
                + "`/add-link`\n"
                + "`/links-panel`\n\n"

                + "**🛡️ צוות:**\n"
                + "`/staff-panel`\n"
                + "`!cl 1-100`\n\n"

                + "**🔢 ספירה:**\n"
                + "`/set-counting`\n"
                + "`/reset-counting`"
            );

        await interaction.reply({

            embeds: [
                embed
            ],

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // IMAGE
    // ========================================================

    if (
        interaction.commandName ===
        "set-image"
    ) {

        const url =
            interaction.options.getString(
                "url"
            );

        if (
            !url.startsWith(
                "http://"
            ) &&
            !url.startsWith(
                "https://"
            )
        ) {

            return interaction.reply({

                content:
                    "❌ זה לא URL תקין.",

                ephemeral:
                    true
            });
        }

        config.botImage =
            url;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                "✅ תמונת הבוט נשמרה ב־PostgreSQL.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // LOGS
    // ========================================================

    if (
        interaction.commandName ===
        "set-logs"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.logsChannel =
            channel.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ חדר הלוגים: ${channel}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // STAFF
    // ========================================================

    if (
        interaction.commandName ===
        "set-staff"
    ) {

        const role =
            interaction.options.getRole(
                "role"
            );

        config.staffRole =
            role.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ Staff Role הוגדר ל־${role}.`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // MUTE
    // ========================================================

    if (
        interaction.commandName ===
        "set-mute"
    ) {

        const role =
            interaction.options.getRole(
                "role"
            );

        config.muteRole =
            role.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ Mute Role הוגדר ל־${role}.`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // AI ROOM
    // ========================================================

    if (
        interaction.commandName ===
        "set-ai"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.aiChannel =
            channel.id;

        config.aiEnabled =
            true;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `🤖 חדר ה-AI הוגדר ל־${channel}.\n\n`
                + "מעכשיו הבוט יענה שם בהודעות רגילות.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // TICKET CATEGORY
    // ========================================================

    if (
        interaction.commandName ===
        "set-ticket-category"
    ) {

        const category =
            interaction.options.getChannel(
                "category"
            );

        config.ticketCategory =
            category.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ קטגוריית הטיקטים: ${category}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // TICKET CHANNEL
    // ========================================================

    if (
        interaction.commandName ===
        "set-ticket-channel"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.ticketChannel =
            channel.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ חדר הטיקטים: ${channel}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // TICKET PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "ticket-panel"
    ) {

        let channel =
            interaction.channel;

        if (
            config.ticketChannel
        ) {

            channel =
                guild.channels.cache.get(
                    config.ticketChannel
                ) || channel;
        }

        await sendTicketPanel(
            guild,
            channel
        );

        await interaction.reply({

            content:
                "✅ פאנל הטיקטים נשלח.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // VERIFY
    // ========================================================

    if (
        interaction.commandName ===
        "set-verify"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        const role =
            interaction.options.getRole(
                "role"
            );

        config.verifyChannel =
            channel.id;

        config.verifyRole =
            role.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ מערכת האימות הוגדרה.\n`
                + `חדר: ${channel}\n`
                + `רול: ${role}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // VERIFY PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "verify-panel"
    ) {

        let channel =
            interaction.channel;

        if (
            config.verifyChannel
        ) {

            channel =
                guild.channels.cache.get(
                    config.verifyChannel
                ) || channel;
        }

        await sendVerifyPanel(
            guild,
            channel
        );

        await interaction.reply({

            content:
                "✅ פאנל האימות נשלח.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // WELCOME
    // ========================================================

    if (
        interaction.commandName ===
        "set-welcome"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.welcomeChannel =
            channel.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ חדר Welcome: ${channel}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // SUGGESTIONS
    // ========================================================

    if (
        interaction.commandName ===
        "set-suggestions"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        const staffChannel =
            interaction.options.getChannel(
                "staffchannel"
            );

        const role =
            interaction.options.getRole(
                "role"
            );

        config.suggestionChannel =
            channel.id;

        config.suggestionStaffChannel =
            staffChannel.id;

        config.suggestionRole =
            role.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ מערכת ההצעות הוגדרה!\n\n`
                + `💡 חדר הצעות: ${channel}\n`
                + `🛡️ חדר צוות: ${staffChannel}\n`
                + `🔔 רול שיתויג: ${role}`,

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // LINKS
    // ========================================================

    if (
        interaction.commandName ===
        "set-links"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.linksChannel =
            channel.id;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ חדר הקישורים: ${channel}`,

            ephemeral:
                true
        });

        return;
    }

    if (
        interaction.commandName ===
        "add-link"
    ) {

        const name =
            interaction.options.getString(
                "name"
            );

        const url =
            interaction.options.getString(
                "url"
            );

        if (
            !url.startsWith(
                "https://"
            ) &&
            !url.startsWith(
                "http://"
            )
        ) {

            return interaction.reply({

                content:
                    "❌ הקישור חייב להתחיל ב־https:// או http://",

                ephemeral:
                    true
            });
        }

        config.links.push({

            name:
                name,

            url:
                url
        });

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `✅ הקישור **${name}** נוסף.`,

            ephemeral:
                true
        });

        return;
    }

    if (
        interaction.commandName ===
        "clear-links"
    ) {

        config.links =
            [];

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                "✅ כל הקישורים נמחקו.",

            ephemeral:
                true
        });

        return;
    }

    if (
        interaction.commandName ===
        "links-panel"
    ) {

        let channel =
            interaction.channel;

        if (
            config.linksChannel
        ) {

            channel =
                guild.channels.cache.get(
                    config.linksChannel
                ) || channel;
        }

        await sendLinksPanel(
            guild,
            channel
        );

        await interaction.reply({

            content:
                "✅ פאנל הקישורים נשלח.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // STAFF PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "staff-panel"
    ) {

        await sendStaffPanel(
            guild,
            interaction.channel
        );

        await interaction.reply({

            content:
                "✅ פאנל הצוות נשלח.",

            ephemeral:
                true
        });

        return;
    }

    // ========================================================
    // COUNTING
    // ========================================================

    if (
        interaction.commandName ===
        "set-counting"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.countingChannel =
            channel.id;

        config.countingNumber =
            0;

        config.lastCounter =
            null;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                `🔢 חדר הספירה הוגדר ל־${channel}.`,

            ephemeral:
                true
        });

        return;
    }

    if (
        interaction.commandName ===
        "reset-counting"
    ) {

        config.countingNumber =
            0;

        config.lastCounter =
            null;

        await saveGuildData(
            guild.id,
            config
        );

        await interaction.reply({

            content:
                "✅ הספירה אופסה ל־0.",

            ephemeral:
                true
        });

        return;
    }
}

// ============================================================
// 🛡️ MODALS
// ============================================================

async function handleModal(
    interaction
) {

    const guild =
        interaction.guild;

    if (
        !(await isStaffMember(
            interaction.member
        ))
    ) {

        return interaction.reply({

            content:
                "❌ אין לך הרשאה.",

            ephemeral:
                true
        });
    }

    const config =
        await getGuildData(
            guild.id
        );

    const userId =
        interaction.fields.getTextInputValue(
            "user_id"
        );

    const member =
        await guild.members.fetch(
            userId
        ).catch(
            () => null
        );

    if (!member) {

        return interaction.reply({

            content:
                "❌ המשתמש לא נמצא בשרת.",

            ephemeral:
                true
        });
    }

    // ========================================================
    // TIMEOUT
    // ========================================================

    if (
        interaction.customId ===
        "modal_timeout"
    ) {

        const minutes =
            parseInt(
                interaction.fields.getTextInputValue(
                    "minutes"
                )
            );

        if (
            !Number.isInteger(
                minutes
            ) ||
            minutes < 1 ||
            minutes > 40320
        ) {

            return interaction.reply({

                content:
                    "❌ הכנס זמן בין 1 ל־40320 דקות.",

                ephemeral:
                    true
            });
        }

        if (
            !member.moderatable
        ) {

            return interaction.reply({

                content:
                    "❌ אני לא יכול לעשות Timeout למשתמש הזה.",

                ephemeral:
                    true
            });
        }

        await member.timeout(

            minutes * 60 * 1000,

            `Timeout by ${interaction.user.tag}`
        );

        await interaction.reply({

            content:
                `✅ ${member.user.tag} קיבל Timeout ל־${minutes} דקות.`,

            ephemeral:
                true
        });

        await sendLog(
            guild,
            "⏱️ Timeout",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**זמן:** ${minutes} דקות`
        );

        return;
    }

    // ========================================================
    // BAN
    // ========================================================

    if (
        interaction.customId ===
        "modal_ban"
    ) {

        if (
            !member.bannable
        ) {

            return interaction.reply({

                content:
                    "❌ אי אפשר לתת Ban למשתמש הזה.",

                ephemeral:
                    true
            });
        }

        await member.ban({

            reason:
                `Ban by ${interaction.user.tag}`
        });

        await interaction.reply({

            content:
                `🔨 ${member.user.tag} קיבל Ban.`,

            ephemeral:
                true
        });

        await sendLog(
            guild,
            "🔨 Ban",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}`
        );

        return;
    }

    // ========================================================
    // KICK
    // ========================================================

    if (
        interaction.customId ===
        "modal_kick"
    ) {

        if (
            !member.kickable
        ) {

            return interaction.reply({

                content:
                    "❌ אי אפשר לתת Kick למשתמש הזה.",

                ephemeral:
                    true
            });
        }

        await member.kick(
            `Kick by ${interaction.user.tag}`
        );

        await interaction.reply({

            content:
                `👢 ${member.user.tag} קיבל Kick.`,

            ephemeral:
                true
        });

        await sendLog(
            guild,
            "👢 Kick",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}`
        );

        return;
    }

    // ========================================================
    // MUTE
    // ========================================================

    if (
        interaction.customId ===
        "modal_mute"
    ) {

        if (
            !config.muteRole
        ) {

            return interaction.reply({

                content:
                    "❌ Mute Role לא הוגדר.",

                ephemeral:
                    true
            });
        }

        const role =
            guild.roles.cache.get(
                config.muteRole
            );

        if (!role) {

            return interaction.reply({

                content:
                    "❌ Mute Role לא נמצא.",

                ephemeral:
                    true
            });
        }

        if (
            member.roles.cache.has(
                role.id
            )
        ) {

            await member.roles.remove(
                role
            );

            await interaction.reply({

                content:
                    `🔊 ההשתקה של ${member.user.tag} הוסרה.`,

                ephemeral:
                    true
            });

            await sendLog(
                guild,
                "🔊 Mute הוסר",
                `**צוות:** ${interaction.user.tag}\n`
                + `**משתמש:** ${member.user.tag}`
            );

        } else {

            await member.roles.add(
                role
            );

            await interaction.reply({

                content:
                    `🔇 ${member.user.tag} הושתק.`,

                ephemeral:
                    true
            });

            await sendLog(
                guild,
                "🔇 משתמש הושתק",
                `**צוות:** ${interaction.user.tag}\n`
                + `**משתמש:** ${member.user.tag}`
            );
        }

        return;
    }
}

// ============================================================
// 🔢 COUNTING
// ============================================================

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        const config =
            await getGuildData(
                message.guild.id
            );

        if (
            !config.countingChannel ||
            message.channel.id !==
                config.countingChannel
        ) {
            return;
        }

        const number =
            parseInt(
                message.content.trim()
            );

        if (
            Number.isNaN(
                number
            )
        ) {
            return;
        }

        const expected =
            config.countingNumber + 1;

        if (
            number !== expected ||
            config.lastCounter ===
                message.author.id
        ) {

            await message.react(
                "❌"
            ).catch(
                () => {}
            );

            config.countingNumber =
                0;

            config.lastCounter =
                null;

            await saveGuildData(
                message.guild.id,
                config
            );

            await message.channel.send(
                "❌ הספירה נשברה! מתחילים מחדש מ־**1**."
            );

            return;
        }

        config.countingNumber =
            number;

        config.lastCounter =
            message.author.id;

        await saveGuildData(
            message.guild.id,
            config
        );

        await message.react(
            "✅"
        ).catch(
            () => {}
        );
    }
);

// ============================================================
// 🗑️ MESSAGE DELETE LOG
// ============================================================

client.on(
    "messageDelete",
    async message => {

        if (
            !message.guild ||
            message.author?.bot
        ) {
            return;
        }

        await sendLog(

            message.guild,

            "🗑️ הודעה נמחקה",

            `**משתמש:** ${message.author?.tag || "לא ידוע"}\n`
            + `**ID:** ${message.author?.id || "לא ידוע"}\n`
            + `**חדר:** ${message.channel}\n`
            + `**תוכן:** ${clip(cleanMentions(message.content || "אין תוכן"), 1000)}`
        );
    }
);

// ============================================================
// ✏️ MESSAGE EDIT LOG
// ============================================================

client.on(
    "messageUpdate",
    async (
        oldMessage,
        newMessage
    ) => {

        if (
            !newMessage.guild ||
            newMessage.author?.bot
        ) {
            return;
        }

        if (
            oldMessage.content ===
            newMessage.content
        ) {
            return;
        }

        await sendLog(

            newMessage.guild,

            "✏️ הודעה נערכה",

            `**משתמש:** ${newMessage.author?.tag || "לא ידוע"}\n`
            + `**חדר:** ${newMessage.channel}\n\n`
            + `**לפני:** ${clip(cleanMentions(oldMessage.content || "לא ידוע"), 800)}\n`
            + `**אחרי:** ${clip(cleanMentions(newMessage.content || "לא ידוע"), 800)}`
        );
    }
);

// ============================================================
// 👥 ROLE LOG
// ============================================================

client.on(
    "guildMemberUpdate",
    async (
        oldMember,
        newMember
    ) => {

        const added =
            newMember.roles.cache.filter(
                role =>
                    !oldMember.roles.cache.has(
                        role.id
                    )
            );

        const removed =
            oldMember.roles.cache.filter(
                role =>
                    !newMember.roles.cache.has(
                        role.id
                    )
            );

        for (
            const role of added.values()
        ) {

            await sendLog(

                newMember.guild,

                "➕ רול נוסף",

                `**משתמש:** ${newMember.user.tag}\n`
                + `**רול:** ${role}\n`
                + `**ID:** ${newMember.id}`
            );
        }

        for (
            const role of removed.values()
        ) {

            await sendLog(

                newMember.guild,

                "➖ רול הוסר",

                `**משתמש:** ${newMember.user.tag}\n`
                + `**רול:** ${role}\n`
                + `**ID:** ${newMember.id}`
            );
        }

        if (
            oldMember.nickname !==
            newMember.nickname
        ) {

            await sendLog(

                newMember.guild,

                "✏️ Nickname השתנה",

                `**משתמש:** ${newMember.user.tag}\n`
                + `**לפני:** ${oldMember.nickname || "אין"}\n`
                + `**אחרי:** ${newMember.nickname || "אין"}`
            );
        }
    }
);

// ============================================================
// 🔊 VOICE LOG
// ============================================================

client.on(
    "voiceStateUpdate",
    async (
        oldState,
        newState
    ) => {

        if (
            !newState.guild
        ) {
            return;
        }

        if (
            !oldState.channel &&
            newState.channel
        ) {

            await sendLog(

                newState.guild,

                "🔊 כניסה לחדר קולי",

                `**משתמש:** ${newState.member?.user.tag || "לא ידוע"}\n`
                + `**חדר:** ${newState.channel.name}`
            );
        }

        if (
            oldState.channel &&
            !newState.channel
        ) {

            await sendLog(

                newState.guild,

                "🔇 יציאה מחדר קולי",

                `**משתמש:** ${oldState.member?.user.tag || "לא ידוע"}\n`
                + `**חדר:** ${oldState.channel.name}`
            );
        }
    }
);

// ============================================================
// 📁 CHANNEL LOG
// ============================================================

client.on(
    "channelCreate",
    async channel => {

        if (
            !channel.guild
        ) {
            return;
        }

        await sendLog(

            channel.guild,

            "📁 חדר נוצר",

            `**חדר:** ${channel.name}\n`
            + `**ID:** ${channel.id}`
        );
    }
);

client.on(
    "channelDelete",
    async channel => {

        if (
            !channel.guild
        ) {
            return;
        }

        await sendLog(

            channel.guild,

            "🗑️ חדר נמחק",

            `**חדר:** ${channel.name}\n`
            + `**ID:** ${channel.id}`
        );
    }
);

// ============================================================
// 🛡️ ROLE CREATE / DELETE
// ============================================================

client.on(
    "roleCreate",
    async role => {

        await sendLog(

            role.guild,

            "🛡️ רול נוצר",

            `**רול:** ${role.name}\n`
            + `**ID:** ${role.id}`
        );
    }
);

client.on(
    "roleDelete",
    async role => {

        await sendLog(

            role.guild,

            "🗑️ רול נמחק",

            `**רול:** ${role.name}\n`
            + `**ID:** ${role.id}`
        );
    }
);

// ============================================================
// 🔨 BAN LOG
// ============================================================

client.on(
    "guildBanAdd",
    async ban => {

        await sendLog(

            ban.guild,

            "🔨 משתמש קיבל Ban",

            `**משתמש:** ${ban.user.tag}\n`
            + `**ID:** ${ban.user.id}`
        );
    }
);

client.on(
    "guildBanRemove",
    async ban => {

        await sendLog(

            ban.guild,

            "🔓 Ban הוסר",

            `**משתמש:** ${ban.user.tag}\n`
            + `**ID:** ${ban.user.id}`
        );
    }
);

// ============================================================
// ❌ ERRORS
// ============================================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord error:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled rejection:",
            error
        );
    }
);

// ============================================================
// 🌐 RENDER SERVER
// ============================================================

const PORT =
    process.env.PORT || 10000;

const server =
    http.createServer(
        async (
            req,
            res
        ) => {

            if (
                req.url ===
                "/health"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json"
                    }
                );

                res.end(
                    JSON.stringify({

                        status:
                            "ok",

                        bot:
                            client.user
                                ? client.user.tag
                                : "starting"
                    })
                );

                return;
            }

            res.writeHead(
                200,
                {
                    "Content-Type":
                        "text/plain; charset=utf-8"
                }
            );

            res.end(
                "🔵 ChillZone Bot is online!"
            );
        }
    );

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🌐 Render server running on port ${PORT}`
        );
    }
);

// ============================================================
// 🔑 LOGIN
// ============================================================

client.login(
    TOKEN
);
