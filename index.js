// ============================================================
// 🔵 CHILLZONE COMMUNITY BOT
// Discord.js v14 | Render | Gemini 3.6 Flash
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

const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// 🔐 ENV
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN חסר ב-Render.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID חסר ב-Render.");
    process.exit(1);
}

// ============================================================
// 🔵 CLIENT
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
// 💾 DATA
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
    guilds: {}
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(data, null, 2)
            );
            return;
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8");

        if (raw.trim()) {
            data = JSON.parse(raw);
        }

        if (!data.guilds) {
            data.guilds = {};
        }

    } catch (error) {
        console.error("❌ שגיאה בטעינת data.json:", error);
    }
}

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error("❌ שגיאה בשמירת data.json:", error);
    }
}

function getGuildData(guildId) {

    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
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

            linksChannel: null,
            links: [],

            aiEnabled: true,

            tickets: {},

            suggestions: {},

            countingChannel: null,
            countingNumber: 0,
            lastCounter: null
        };

        saveData();
    }

    return data.guilds[guildId];
}

loadData();

// ============================================================
// 🎨 COLORS
// ============================================================

const BLUE = 0x3498DB;

// ============================================================
// 🧰 HELPERS
// ============================================================

function getBotImage(guild) {

    const config = getGuildData(guild.id);

    if (config.botImage) {
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

function makeEmbed(guild, title, description) {

    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    const image = getBotImage(guild);

    if (image) {
        embed.setThumbnail(image);
    }

    return embed;
}

function isStaff(member) {

    if (!member || !member.guild) {
        return false;
    }

    const config = getGuildData(member.guild.id);

    if (
        config.staffRole &&
        member.roles.cache.has(config.staffRole)
    ) {
        return true;
    }

    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function cleanMentions(text) {

    return String(text)
        .replace(/@everyone/g, "@\u200beveryone")
        .replace(/@here/g, "@\u200bhere");
}

async function sendLog(guild, title, description) {

    try {

        const config = getGuildData(guild.id);

        if (!config.logsChannel) {
            return;
        }

        const channel =
            guild.channels.cache.get(config.logsChannel);

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
        console.error("❌ Log error:", error);
    }
}

// ============================================================
// 📜 SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("מציג את כל הגדרות ChillZone"),

    new SlashCommandBuilder()
        .setName("הגדר-תמונה")
        .setDescription("הגדרת תמונת הבוט")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("URL ישיר לתמונה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-לוגים")
        .setDescription("הגדרת חדר הלוגים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הלוגים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-צוות")
        .setDescription("הגדרת Staff Role")
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("רול הצוות")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-השתקה")
        .setDescription("הגדרת Mute Role")
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("רול ההשתקה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-קטגוריה-טיקטים")
        .setDescription("הגדרת הקטגוריה שבה ייפתחו הטיקטים")
        .addChannelOption(option =>
            option
                .setName("category")
                .setDescription("קטגוריית הטיקטים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-טיקטים")
        .setDescription("הגדרת חדר פאנל הטיקטים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("החדר שבו יישלח הפאנל")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("פאנל-טיקטים")
        .setDescription("שליחת פאנל טיקטים"),

    new SlashCommandBuilder()
        .setName("פאנל-צוות")
        .setDescription("שליחת פאנל צוות"),

    new SlashCommandBuilder()
        .setName("הגדר-אימות")
        .setDescription("הגדרת מערכת האימות")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר האימות")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("הרול שמקבלים באימות")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("פאנל-אימות")
        .setDescription("שליחת פאנל האימות"),

    new SlashCommandBuilder()
        .setName("הגדר-ברוכים-הבאים")
        .setDescription("הגדרת חדר Welcome")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר ברוכים הבאים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-הצעות")
        .setDescription("הגדרת מערכת ההצעות")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר שאליו חברים שולחים הצעות")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption(option =>
            option
                .setName("staffchannel")
                .setDescription("חדר שאליו הצעות מגיעות לצוות")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-חדר-קישורים")
        .setDescription("הגדרת חדר הקישורים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הקישורים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("הוסף-קישור")
        .setDescription("הוספת קישור")
        .addStringOption(option =>
            option
                .setName("שם")
                .setDescription("שם הקישור")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("קישור")
                .setDescription("הקישור עצמו")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("מחק-קישורים")
        .setDescription("מחיקת כל הקישורים"),

    new SlashCommandBuilder()
        .setName("פאנל-קישורים")
        .setDescription("שליחת פאנל הקישורים"),

    new SlashCommandBuilder()
        .setName("הגדר-ספירה")
        .setDescription("הגדרת חדר ספירה")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הספירה")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("איפוס-ספירה")
        .setDescription("איפוס מערכת הספירה")

].map(command => command.toJSON());

// ============================================================
// 📡 REGISTER COMMANDS
// ============================================================

async function registerCommands() {

    try {

        const rest =
            new REST({ version: "10" })
                .setToken(TOKEN);

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
                "✅ Slash commands registered."
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

client.once("ready", async () => {

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

    await registerCommands();
});

// ============================================================
// 👋 WELCOME
// ============================================================

client.on(
    "guildMemberAdd",
    async member => {

        try {

            const config =
                getGuildData(member.guild.id);

            if (!config.welcomeChannel) {
                return;
            }

            const channel =
                member.guild.channels.cache.get(
                    config.welcomeChannel
                );

            if (!channel) {
                return;
            }

            const embed =
                makeEmbed(
                    member.guild,
                    "👋 ברוכים הבאים ל־ChillZone!",
                    `היי ${member}! 👋\n\n`
                    + `שמחים שהצטרפת לקהילה שלנו 💙\n`
                    + `תעבור על החדרים ותהנה!`
                );

            await channel.send({
                content: `${member}`,
                embeds: [embed]
            });

            await sendLog(
                member.guild,
                "👋 משתמש נכנס לשרת",
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
            "ברוכים הבאים לשרת!\n\n"
            + "כדי לקבל גישה לשרת ולאמת את עצמך, "
            + "לחץ על הכפתור **אימות** למטה.\n\n"
            + "✅ לאחר האימות תקבל את הרול שהוגדר."
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
            "🎫 מערכת הטיקטים של ChillZone",
            "צריך עזרה? אנחנו כאן בשבילך! 💙\n\n"
            + "בחר את סוג הפנייה המתאים לך:\n\n"
            + "🆘 **תמיכה** — עזרה כללית\n"
            + "🚨 **דיווח** — דיווח על משתמש/בעיה\n"
            + "👮 **בחינה לצוות** — פנייה בנושא צוות\n"
            + "❓ **אחר** — כל דבר שלא נמצא ברשימה\n\n"
            + "לאחר פתיחת הטיקט, איש צוות אחד יוכל לקחת "
            + "אותו ולהתחיל לטפל בפנייה."
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "ticket_type"
            )
            .setPlaceholder(
                "🎫 בחר את סוג הטיקט"
            )
            .addOptions(

                new StringSelectMenuOptionBuilder()
                    .setLabel("תמיכה")
                    .setDescription(
                        "קבלת עזרה מצוות ChillZone"
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
                        "פנייה בנושא הצטרפות לצוות"
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
        getGuildData(guild.id);

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
                "❌ הקטגוריה של הטיקטים עדיין לא הוגדרה.\n"
                + "אדמין צריך להשתמש ב־`/הגדר-קטגוריה-טיקטים`.",
            ephemeral: true
        });
    }

    const category =
        guild.channels.cache.get(
            config.ticketCategory
        );

    if (!category) {

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
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 18) ||
        "user";

    const channelName =
        `ticket-${safeUsername}`;

    const overwrites = [

        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionsBitField.Flags.ViewChannel
            ]
        },

        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        }

    ];

    // חשוב:
    // לא נותנים לכל צוות גישה אוטומטית.
    // רק מנהלים/בוט יוכלו לראות לפי ההרשאות שלהם,
    // ואיש הצוות שלוקח את הטיקט יקבל גישה.

    const channel =
        await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: overwrites
        });

    config.tickets[channel.id] = {
        userId: member.id,
        type: type,
        claimed: false,
        claimedBy: null,
        addedStaff: [],
        createdAt: Date.now()
    };

    saveData();

    const embed =
        makeEmbed(
            guild,
            `🎫 טיקט — ${typeNames[type]}`,
            `שלום ${member}! 👋\n\n`
            + `הטיקט שלך נפתח בהצלחה.\n`
            + `תאר כאן בצורה ברורה במה אתה צריך עזרה.\n\n`
            + `🤖 **ChillZone AI** יכול לעזור לך כל עוד איש צוות עדיין לא לקח את הטיקט.\n\n`
            + `🙋 ברגע שאיש צוות ייקח את הטיקט, ה־AI יפסיק לענות.\n`
            + `👥 ניתן להוסיף אנשי צוות נוספים באמצעות הכפתור **הוסף צוות**.`
        );

    const row =
        createTicketButtons(false);

    await channel.send({
        content: `${member}`,
        embeds: [embed],
        components: [row]
    });

    await interaction.reply({
        content:
            `✅ הטיקט שלך נפתח בהצלחה: ${channel}`,
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
// 🎛️ TICKET BUTTONS
// ============================================================

function createTicketButtons(claimed) {

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
                .setDisabled(claimed),

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
// 👥 GET STAFF MEMBERS
// ============================================================

async function getStaffMembers(guild) {

    const config =
        getGuildData(guild.id);

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

    const members =
        [...role.members.values()]
            .filter(member =>
                !member.user.bot
            )
            .slice(0, 25);

    return members;
}

// ============================================================
// 🤖 GEMINI
// ============================================================

async function askGemini(
    userMessage,
    conversation = []
) {

    if (!GEMINI_API_KEY) {
        return null;
    }

    try {

        const contents = [];

        for (const item of conversation) {

            contents.push({
                role: item.role,
                parts: [
                    {
                        text: item.text
                    }
                ]
            });
        }

        contents.push({
            role: "user",
            parts: [
                {
                    text: userMessage
                }
            ]
        });

        const response =
            await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            console.error(
                "❌ Gemini API error:",
                result
            );

            return null;
        }

        const text =
            result
                ?.candidates?.[0]
                ?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        return text || null;

    } catch (error) {

        console.error(
            "❌ Gemini request error:",
            error
        );

        return null;
    }
}

// ============================================================
// 🤖 TICKET AI + !הצעה
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
            getGuildData(guild.id);

        // ====================================================
        // 💡 SUGGESTION
        // ====================================================

        if (
            message.content
                .trim()
                .startsWith("!הצעה")
        ) {

            const suggestion =
                message.content
                    .trim()
                    .slice("!הצעה".length)
                    .trim();

            if (!suggestion) {

                await message.reply(
                    "❌ שימוש נכון: `!הצעה ההצעה שלך`"
                );

                return;
            }

            if (!config.suggestionChannel) {

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
                    `❌ את ההצעה צריך לשלוח בחדר <#${config.suggestionChannel}>.`
                );

                return;
            }

            if (!config.suggestionStaffChannel) {

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

            config.suggestions[suggestionId] = {
                userId: message.author.id,
                content: suggestion,
                createdAt: Date.now(),
                decided: false
            };

            saveData();

            const embed =
                makeEmbed(
                    guild,
                    "💡 הצעה חדשה",
                    `**מאת:** ${message.author}\n\n`
                    + `**ההצעה:**\n${cleanMentions(suggestion)}`
                );

            embed.addFields({
                name: "🆔 מזהה הצעה",
                value: `\`${suggestionId}\``
            });

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `suggestion_accept_${suggestionId}`
                            )
                            .setLabel("אישור")
                            .setEmoji("✅")
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `suggestion_reject_${suggestionId}`
                            )
                            .setLabel("דחייה")
                            .setEmoji("❌")
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            await staffChannel.send({
                embeds: [embed],
                components: [row]
            });

            await message.reply(
                "✅ ההצעה שלך נשלחה לצוות לבדיקה."
            );

            await sendLog(
                guild,
                "💡 הצעה חדשה",
                `**משתמש:** ${message.author.tag}\n`
                + `**ID:** ${message.author.id}\n`
                + `**הצעה:** ${cleanMentions(suggestion)}`
            );

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

        // אם צוות לקח - AI מפסיק
        if (ticket.claimed) {
            return;
        }

        if (!config.aiEnabled) {
            return;
        }

        // שומרים היסטוריה בתוך הטיקט
        if (!ticket.aiHistory) {
            ticket.aiHistory = [];
        }

        const answer =
            await askGemini(
                message.content,
                ticket.aiHistory.slice(-20)
            );

        if (!answer) {
            return;
        }

        // שמירת שיחה
        ticket.aiHistory.push({
            role: "user",
            text: message.content
        });

        ticket.aiHistory.push({
            role: "model",
            text: answer
        });

        saveData();

        // ====================================================
        // 🤖 הודעה רגילה - בלי Embed
        // ====================================================

        // Discord מגביל הודעה ל-2000 תווים.
        // לכן אם Gemini מחזיר תשובה ארוכה,
        // אנחנו מחלקים אותה לחלקים בלי לקצר.
        const chunks = [];

        let remaining = answer;

        while (remaining.length > 0) {

            if (remaining.length <= 1900) {

                chunks.push(remaining);
                break;
            }

            let cut =
                remaining.lastIndexOf(
                    "\n",
                    1900
                );

            if (cut < 500) {

                cut =
                    remaining.lastIndexOf(
                        " ",
                        1900
                    );
            }

            if (cut < 1) {
                cut = 1900;
            }

            chunks.push(
                remaining.slice(
                    0,
                    cut
                )
            );

            remaining =
                remaining.slice(cut)
                    .trimStart();
        }

        for (const chunk of chunks) {

            await message.channel.send(
                chunk
            );
        }
    }
);

// ============================================================
// 🔘 INTERACTIONS
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

                await handleSelectMenu(
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
                        ephemeral: true
                    });

                } else {

                    await interaction.reply({
                        content:
                            "❌ אירעה שגיאה.",
                        ephemeral: true
                    });
                }

            } catch {}
        }
    }
);

// ============================================================
// 🎫 SELECT MENU
// ============================================================

async function handleSelectMenu(
    interaction
) {

    if (
        interaction.customId ===
        "ticket_type"
    ) {

        const type =
            interaction.values[0];

        await createTicket(
            interaction,
            type
        );

        return;
    }

    if (
        interaction.customId
            .startsWith(
                "ticket_add_staff_select_"
            )
    ) {

        const ticketChannelId =
            interaction.customId.replace(
                "ticket_add_staff_select_",
                ""
            );

        const guild =
            interaction.guild;

        const config =
            getGuildData(guild.id);

        const ticket =
            config.tickets[
                ticketChannelId
            ];

        if (!ticket) {

            return interaction.reply({
                content:
                    "❌ הטיקט לא נמצא.",
                ephemeral: true
            });
        }

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להוסיף צוות לטיקט.",
                ephemeral: true
            });
        }

        const selectedId =
            interaction.values[0];

        const selectedMember =
            await guild.members.fetch(
                selectedId
            ).catch(() => null);

        if (!selectedMember) {

            return interaction.reply({
                content:
                    "❌ איש הצוות לא נמצא.",
                ephemeral: true
            });
        }

        if (
            !ticket.addedStaff
        ) {
            ticket.addedStaff = [];
        }

        if (
            !ticket.addedStaff.includes(
                selectedId
            )
        ) {

            ticket.addedStaff.push(
                selectedId
            );
        }

        const channel =
            guild.channels.cache.get(
                ticketChannelId
            );

        if (!channel) {

            return interaction.reply({
                content:
                    "❌ חדר הטיקט לא נמצא.",
                ephemeral: true
            });
        }

        await channel.permissionOverwrites.edit(
            selectedMember.id,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        );

        saveData();

        await interaction.reply({
            content:
                `✅ ${selectedMember} נוסף לטיקט בהצלחה.`,
            ephemeral: true
        });

        await channel.send(
            `👥 ${interaction.user} הוסיף את ${selectedMember} לצוות הטיקט.`
        );

        await sendLog(
            guild,
            "👥 איש צוות נוסף לטיקט",
            `**צוות שהוסיף:** ${interaction.user.tag}\n`
            + `**צוות שנוסף:** ${selectedMember.user.tag}\n`
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
        getGuildData(guild.id);

    const id =
        interaction.customId;

    // ========================================================
    // VERIFY
    // ========================================================

    if (id === "verify_member") {

        if (!config.verifyRole) {

            return interaction.reply({
                content:
                    "❌ רול האימות עדיין לא הוגדר.",
                ephemeral: true
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
                ephemeral: true
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
                ephemeral: true
            });
        }

        await interaction.member.roles.add(
            role
        );

        await interaction.reply({
            content:
                "✅ אומתת בהצלחה! ברוך הבא ל־ChillZone 💙",
            ephemeral: true
        });

        await sendLog(
            guild,
            "🔐 משתמש אומת",
            `**משתמש:** ${interaction.user.tag}\n`
            + `**ID:** ${interaction.user.id}`
        );

        return;
    }

    // ========================================================
    // CLAIM TICKET
    // ========================================================

    if (id === "ticket_claim") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול לקחת טיקט.",
                ephemeral: true
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
                ephemeral: true
            });
        }

        // אם כבר נלקח
        if (ticket.claimed) {

            return interaction.reply({
                content:
                    `❌ הטיקט כבר נלקח על ידי <@${ticket.claimedBy}>.`,
                ephemeral: true
            });
        }

        ticket.claimed = true;
        ticket.claimedBy =
            interaction.user.id;

        saveData();

        // נותנים גישה לצוות שלקח
        await interaction.channel.permissionOverwrites.edit(
            interaction.user.id,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        );

        const row =
            createTicketButtons(true);

        await interaction.message.edit({
            components: [row]
        });

        await interaction.reply({
            content:
                "🙋 לקחת את הטיקט בהצלחה.",
            ephemeral: true
        });

        await interaction.channel.send(
            `🙋 **${interaction.user} לקח את הטיקט.**\n`
            + `מעכשיו רק פותח הטיקט, הצוות שלקח אותו ואנשי צוות שנוספו דרך **הוסף צוות** יכולים לדבר כאן.`
        );

        await sendLog(
            guild,
            "🙋 טיקט נלקח",
            `**צוות:** ${interaction.user.tag}\n`
            + `**ID:** ${interaction.user.id}\n`
            + `**טיקט:** ${interaction.channel.name}`
        );

        return;
    }

    // ========================================================
    // ADD STAFF
    // ========================================================

    if (id === "ticket_add_staff") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להוסיף אנשי צוות.",
                ephemeral: true
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
                ephemeral: true
            });
        }

        const staffMembers =
            await getStaffMembers(
                guild
            );

        if (!staffMembers.length) {

            return interaction.reply({
                content:
                    "❌ לא נמצאו אנשי צוות עם הרול שהוגדר.",
                ephemeral: true
            });
        }

        const options =
            staffMembers.map(member =>
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
                    "👥 בחר איש צוות להוספה"
                )
                .addOptions(options);

        const row =
            new ActionRowBuilder()
                .addComponents(menu);

        await interaction.reply({
            content:
                "👥 **הוסף צוות לטיקט**\n\n"
                + "בחר למטה את איש הצוות שיקבל גישה לטיקט:",
            components: [row],
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // CLOSE TICKET
    // ========================================================

    if (id === "ticket_close") {

        const ticket =
            config.tickets[
                interaction.channel.id
            ];

        if (!ticket) {

            return interaction.reply({
                content:
                    "❌ הטיקט לא נמצא.",
                ephemeral: true
            });
        }

        const canClose =
            ticket.userId === interaction.user.id ||
            isStaff(interaction.member);

        if (!canClose) {

            return interaction.reply({
                content:
                    "❌ אין לך הרשאה לסגור את הטיקט.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content:
                "🔒 הטיקט ייסגר בעוד 5 שניות..."
        });

        await sendLog(
            guild,
            "🔒 טיקט נסגר",
            `**על ידי:** ${interaction.user.tag}\n`
            + `**ID:** ${interaction.user.id}\n`
            + `**חדר:** ${interaction.channel.name}`
        );

        setTimeout(
            async () => {

                delete config.tickets[
                    interaction.channel.id
                ];

                saveData();

                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error(
                        "Ticket delete error:",
                        error
                    );
                }
            },
            5000
        );

        return;
    }

    // ========================================================
    // STAFF PANEL
    // ========================================================

    if (
        id === "staff_timeout" ||
        id === "staff_ban" ||
        id === "staff_kick" ||
        id === "staff_mute"
    ) {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להשתמש בפאנל הזה.",
                ephemeral: true
            });
        }

        let modalId;
        let title;

        if (id === "staff_timeout") {
            modalId = "modal_timeout";
            title = "⏱️ Timeout";
        }

        if (id === "staff_ban") {
            modalId = "modal_ban";
            title = "🔨 Ban";
        }

        if (id === "staff_kick") {
            modalId = "modal_kick";
            title = "👢 Kick";
        }

        if (id === "staff_mute") {
            modalId = "modal_mute";
            title = "🔇 השתקה";
        }

        const modal =
            new ModalBuilder()
                .setCustomId(modalId)
                .setTitle(title);

        const userIdInput =
            new TextInputBuilder()
                .setCustomId("user_id")
                .setLabel("ID של המשתמש")
                .setPlaceholder(
                    "הכנס Discord User ID"
                )
                .setStyle(
                    TextInputStyle.Short
                )
                .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(
                    userIdInput
                )
        );

        if (id === "staff_timeout") {

            const timeInput =
                new TextInputBuilder()
                    .setCustomId(
                        "minutes"
                    )
                    .setLabel(
                        "לכמה דקות?"
                    )
                    .setPlaceholder(
                        "לדוגמה: 10"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setRequired(true);

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
    // SUGGESTION ACCEPT / REJECT
    // ========================================================

    if (
        id.startsWith(
            "suggestion_accept_"
        ) ||
        id.startsWith(
            "suggestion_reject_"
        )
    ) {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול לאשר או לדחות הצעה.",
                ephemeral: true
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
                ephemeral: true
            });
        }

        if (suggestion.decided) {

            return interaction.reply({
                content:
                    "❌ ההצעה כבר קיבלה החלטה.",
                ephemeral: true
            });
        }

        suggestion.decided = true;
        suggestion.accepted = accepted;
        suggestion.decidedBy =
            interaction.user.id;

        saveData();

        const user =
            await client.users.fetch(
                suggestion.userId
            ).catch(() => null);

        if (user) {

            const dmEmbed =
                makeEmbed(
                    guild,
                    accepted
                        ? "✅ ההצעה שלך אושרה!"
                        : "❌ ההצעה שלך נדחתה",
                    accepted
                        ? "צוות ChillZone בדק את ההצעה שלך ואישר אותה! 💙"
                        : "צוות ChillZone בדק את ההצעה שלך והחליט שלא לאשר אותה הפעם."
                );

            dmEmbed.addFields({
                name: "💡 ההצעה שלך",
                value:
                    cleanMentions(
                        suggestion.content
                    ).slice(0, 1000)
            });

            await user.send({
                embeds: [dmEmbed]
            }).catch(() => {});
        }

        const resultEmbed =
            makeEmbed(
                guild,
                accepted
                    ? "✅ הצעה אושרה"
                    : "❌ הצעה נדחתה",
                `**מאת:** <@${suggestion.userId}>\n\n`
                + `**ההצעה:**\n${cleanMentions(suggestion.content)}\n\n`
                + `**החלטה:** ${accepted ? "אושרה ✅" : "נדחתה ❌"}\n`
                + `**על ידי:** ${interaction.user}`
            );

        await interaction.message.edit({
            embeds: [resultEmbed],
            components: []
        });

        await interaction.reply({
            content:
                accepted
                    ? "✅ ההצעה אושרה והמשתמש קיבל הודעה פרטית."
                    : "❌ ההצעה נדחתה והמשתמש קיבל הודעה פרטית.",
            ephemeral: true
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
            "🛡️ פאנל צוות — ChillZone",
            "ברוכים הבאים לפאנל הצוות.\n\n"
            + "כאן ניתן לבצע פעולות ניהול על משתמשים.\n\n"
            + "⏱️ **Timeout** — הכנסת משתמש להשתקה זמנית.\n"
            + "🔨 **Ban** — הרחקת משתמש מהשרת.\n"
            + "👢 **Kick** — הוצאת משתמש מהשרת.\n"
            + "🔇 **השתקה** — הוספה/הסרה של Mute Role.\n\n"
            + "לאחר לחיצה על פעולה, הבוט יבקש ממך את **ID של המשתמש**."
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
                    .setEmoji("⏱️")
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
                    .setEmoji("🔨")
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
                    .setEmoji("👢")
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_mute"
                    )
                    .setLabel(
                        "השתקה"
                    )
                    .setEmoji("🔇")
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
        getGuildData(guild.id);

    const embed =
        makeEmbed(
            guild,
            "🔗 הקישורים של ChillZone",
            "כל הקישורים החשובים נמצאים כאן.\n"
            + "לחץ על הכפתור הרצוי כדי לפתוח אותו."
        );

    if (!config.links.length) {

        embed.setDescription(
            "❌ עדיין לא הוגדרו קישורים.\n\n"
            + "אדמין יכול להוסיף קישור עם:\n"
            + "`/הוסף-קישור`"
        );

        await channel.send({
            embeds: [embed]
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
                    link.name.slice(0, 80)
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
            i === config.links.length - 1
        ) {

            rows.push(row);
            row =
                new ActionRowBuilder();
        }
    }

    await channel.send({
        embeds: [embed],
        components: rows
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
        getGuildData(guild.id);

    const adminCommands = [

        "setup",
        "הגדר-תמונה",
        "הגדר-לוגים",
        "הגדר-צוות",
        "הגדר-השתקה",
        "הגדר-קטגוריה-טיקטים",
        "הגדר-טיקטים",
        "פאנל-טיקטים",
        "פאנל-צוות",
        "הגדר-אימות",
        "פאנל-אימות",
        "הגדר-ברוכים-הבאים",
        "הגדר-הצעות",
        "הגדר-חדר-קישורים",
        "הוסף-קישור",
        "מחק-קישורים",
        "פאנל-קישורים",
        "הגדר-ספירה",
        "איפוס-ספירה"
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
                ephemeral: true
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
                "**📝 הגדרות בסיס:**\n"
                + "`/הגדר-תמונה` — תמונת הבוט\n"
                + "`/הגדר-לוגים` — חדר לוגים\n"
                + "`/הגדר-צוות` — Staff Role\n"
                + "`/הגדר-השתקה` — Mute Role\n\n"

                + "**🎫 טיקטים:**\n"
                + "`/הגדר-קטגוריה-טיקטים` — קטגוריית טיקטים\n"
                + "`/הגדר-טיקטים` — חדר פאנל\n"
                + "`/פאנל-טיקטים` — שליחת הפאנל\n\n"

                + "**🔐 אימות:**\n"
                + "`/הגדר-אימות` — חדר + רול\n"
                + "`/פאנל-אימות` — שליחת פאנל\n\n"

                + "**👋 Welcome:**\n"
                + "`/הגדר-ברוכים-הבאים`\n\n"

                + "**💡 הצעות:**\n"
                + "`/הגדר-הצעות`\n"
                + "משתמשים: `!הצעה הטקסט שלך`\n\n"

                + "**🔗 קישורים:**\n"
                + "`/הגדר-חדר-קישורים`\n"
                + "`/הוסף-קישור`\n"
                + "`/פאנל-קישורים`\n\n"

                + "**🛡️ צוות:**\n"
                + "`/פאנל-צוות`"
            );

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // BOT IMAGE
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-תמונה"
    ) {

        const url =
            interaction.options.getString(
                "url"
            );

        if (
            !url.startsWith("http://") &&
            !url.startsWith("https://")
        ) {

            return interaction.reply({
                content:
                    "❌ הקישור חייב להיות URL תקין.",
                ephemeral: true
            });
        }

        config.botImage =
            url;

        saveData();

        await interaction.reply({
            embeds: [
                makeEmbed(
                    guild,
                    "🖼️ תמונת הבוט עודכנה",
                    "התמונה נשמרה ותופיע בפאנלים של ChillZone."
                )
            ],
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // LOGS
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-לוגים"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.logsChannel =
            channel.id;

        saveData();

        await interaction.reply({
            content:
                `✅ חדר הלוגים הוגדר ל־${channel}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // STAFF ROLE
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-צוות"
    ) {

        const role =
            interaction.options.getRole(
                "role"
            );

        config.staffRole =
            role.id;

        saveData();

        await interaction.reply({
            content:
                `✅ Staff Role הוגדר ל־${role}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // MUTE ROLE
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-השתקה"
    ) {

        const role =
            interaction.options.getRole(
                "role"
            );

        config.muteRole =
            role.id;

        saveData();

        await interaction.reply({
            content:
                `✅ Mute Role הוגדר ל־${role}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // TICKET CATEGORY
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-קטגוריה-טיקטים"
    ) {

        const category =
            interaction.options.getChannel(
                "category"
            );

        config.ticketCategory =
            category.id;

        saveData();

        await interaction.reply({
            content:
                `✅ קטגוריית הטיקטים הוגדרה ל־${category}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // TICKET CHANNEL
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-טיקטים"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.ticketChannel =
            channel.id;

        saveData();

        await interaction.reply({
            content:
                `✅ חדר פאנל הטיקטים הוגדר ל־${channel}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // SEND TICKET PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "פאנל-טיקטים"
    ) {

        await sendTicketPanel(
            guild,
            interaction.channel
        );

        await interaction.reply({
            content:
                "✅ פאנל הטיקטים נשלח.",
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // VERIFY CONFIG
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-אימות"
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

        saveData();

        await interaction.reply({
            content:
                `✅ מערכת האימות הוגדרה.\n`
                + `חדר: ${channel}\n`
                + `רול: ${role}`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // VERIFY PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "פאנל-אימות"
    ) {

        await sendVerifyPanel(
            guild,
            interaction.channel
        );

        await interaction.reply({
            content:
                "✅ פאנל האימות נשלח.",
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // WELCOME CONFIG
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-ברוכים-הבאים"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.welcomeChannel =
            channel.id;

        saveData();

        await interaction.reply({
            content:
                `✅ חדר ה־Welcome הוגדר ל־${channel}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // SUGGESTIONS CONFIG
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-הצעות"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        const staffChannel =
            interaction.options.getChannel(
                "staffchannel"
            );

        config.suggestionChannel =
            channel.id;

        config.suggestionStaffChannel =
            staffChannel.id;

        saveData();

        await interaction.reply({
            content:
                `✅ חדר הצעות: ${channel}\n`
                + `✅ חדר צוות: ${staffChannel}`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // LINKS CHANNEL
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-חדר-קישורים"
    ) {

        const channel =
            interaction.options.getChannel(
                "channel"
            );

        config.linksChannel =
            channel.id;

        saveData();

        await interaction.reply({
            content:
                `✅ חדר הקישורים הוגדר ל־${channel}.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // ADD LINK
    // ========================================================

    if (
        interaction.commandName ===
        "הוסף-קישור"
    ) {

        const name =
            interaction.options.getString(
                "שם"
            );

        const url =
            interaction.options.getString(
                "קישור"
            );

        if (
            !url.startsWith("https://") &&
            !url.startsWith("http://")
        ) {

            return interaction.reply({
                content:
                    "❌ הקישור חייב להתחיל ב־https:// או http://.",
                ephemeral: true
            });
        }

        config.links.push({
            name,
            url
        });

        saveData();

        await interaction.reply({
            content:
                `✅ הקישור **${name}** נוסף בהצלחה.`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // DELETE LINKS
    // ========================================================

    if (
        interaction.commandName ===
        "מחק-קישורים"
    ) {

        config.links = [];

        saveData();

        await interaction.reply({
            content:
                "✅ כל הקישורים נמחקו.",
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // LINKS PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "פאנל-קישורים"
    ) {

        await sendLinksPanel(
            guild,
            interaction.channel
        );

        await interaction.reply({
            content:
                "✅ פאנל הקישורים נשלח.",
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // STAFF PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "פאנל-צוות"
    ) {

        await sendStaffPanel(
            guild,
            interaction.channel
        );

        await interaction.reply({
            content:
                "✅ פאנל הצוות נשלח.",
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // COUNTING
    // ========================================================

    if (
        interaction.commandName ===
        "הגדר-ספירה"
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

        saveData();

        await interaction.reply({
            content:
                `🔢 חדר הספירה הוגדר ל־${channel}.`,
            ephemeral: true
        });

        return;
    }

    if (
        interaction.commandName ===
        "איפוס-ספירה"
    ) {

        config.countingNumber =
            0;

        config.lastCounter =
            null;

        saveData();

        await interaction.reply({
            content:
                "✅ הספירה אופסה ל־0.",
            ephemeral: true
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

    const config =
        getGuildData(guild.id);

    if (!isStaff(interaction.member)) {

        return interaction.reply({
            content:
                "❌ אין לך הרשאה.",
            ephemeral: true
        });
    }

    const userId =
        interaction.fields.getTextInputValue(
            "user_id"
        );

    const member =
        await guild.members.fetch(
            userId
        ).catch(() => null);

    if (!member) {

        return interaction.reply({
            content:
                "❌ המשתמש לא נמצא בשרת.",
            ephemeral: true
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
            !Number.isInteger(minutes) ||
            minutes < 1 ||
            minutes > 40320
        ) {

            return interaction.reply({
                content:
                    "❌ זמן לא תקין. הכנס מספר בין 1 ל־40320 דקות.",
                ephemeral: true
            });
        }

        if (!member.moderatable) {

            return interaction.reply({
                content:
                    "❌ אין לי הרשאה לעשות Timeout למשתמש הזה.",
                ephemeral: true
            });
        }

        await member.timeout(
            minutes * 60 * 1000,
            `Timeout by ${interaction.user.tag}`
        );

        await interaction.reply({
            content:
                `✅ ${member.user.tag} קיבל Timeout ל־${minutes} דקות.`,
            ephemeral: true
        });

        await sendLog(
            guild,
            "⏱️ Timeout",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}\n`
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

        if (!member.bannable) {

            return interaction.reply({
                content:
                    "❌ אי אפשר לתת Ban למשתמש הזה.",
                ephemeral: true
            });
        }

        await member.ban({
            reason:
                `Ban by ${interaction.user.tag}`
        });

        await interaction.reply({
            content:
                `🔨 ${member.user.tag} קיבל Ban.`,
            ephemeral: true
        });

        await sendLog(
            guild,
            "🔨 משתמש קיבל Ban",
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

        if (!member.kickable) {

            return interaction.reply({
                content:
                    "❌ אי אפשר לתת Kick למשתמש הזה.",
                ephemeral: true
            });
        }

        await member.kick(
            `Kick by ${interaction.user.tag}`
        );

        await interaction.reply({
            content:
                `👢 ${member.user.tag} קיבל Kick.`,
            ephemeral: true
        });

        await sendLog(
            guild,
            "👢 משתמש קיבל Kick",
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

        if (!config.muteRole) {

            return interaction.reply({
                content:
                    "❌ Mute Role עדיין לא הוגדר.",
                ephemeral: true
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
                ephemeral: true
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
                ephemeral: true
            });

            await sendLog(
                guild,
                "🔊 השתקה הוסרה",
                `**צוות:** ${interaction.user.tag}\n`
                + `**משתמש:** ${member.user.tag}\n`
                + `**ID:** ${member.id}`
            );

        } else {

            await member.roles.add(
                role
            );

            await interaction.reply({
                content:
                    `🔇 ${member.user.tag} הושתק.`,
                ephemeral: true
            });

            await sendLog(
                guild,
                "🔇 משתמש הושתק",
                `**צוות:** ${interaction.user.tag}\n`
                + `**משתמש:** ${member.user.tag}\n`
                + `**ID:** ${member.id}`
            );
        }

        return;
    }
}

// ============================================================
// 🔢 COUNTING SYSTEM
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
            getGuildData(
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
            Number.isNaN(number)
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

            await message.react("❌")
                .catch(() => {});

            config.countingNumber = 0;
            config.lastCounter = null;

            saveData();

            await message.channel.send(
                "❌ הספירה נשברה! מתחילים מחדש מ־**1**."
            );

            return;
        }

        config.countingNumber =
            number;

        config.lastCounter =
            message.author.id;

        saveData();

        await message.react("✅")
            .catch(() => {});
    }
);

// ============================================================
// 🗑️ MESSAGE DELETE LOG
// ============================================================

client.on(
    "messageDelete",
    async message => {

        if (!message.guild) {
            return;
        }

        if (message.author?.bot) {
            return;
        }

        await sendLog(
            message.guild,
            "🗑️ הודעה נמחקה",
            `**משתמש:** ${message.author?.tag || "לא ידוע"}\n`
            + `**ID:** ${message.author?.id || "לא ידוע"}\n`
            + `**חדר:** ${message.channel}\n`
            + `**תוכן:** ${cleanMentions(message.content || "אין תוכן")}`
        );
    }
);

// ============================================================
// ✏️ MESSAGE EDIT LOG
// ============================================================

client.on(
    "messageUpdate",
    async (oldMessage, newMessage) => {

        if (!newMessage.guild) {
            return;
        }

        if (newMessage.author?.bot) {
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
            + `**ID:** ${newMessage.author?.id || "לא ידוע"}\n`
            + `**חדר:** ${newMessage.channel}\n\n`
            + `**לפני:** ${cleanMentions(oldMessage.content || "לא ידוע")}\n`
            + `**אחרי:** ${cleanMentions(newMessage.content || "לא ידוע")}`
        );
    }
);

// ============================================================
// 👥 ROLE LOG
// ============================================================

client.on(
    "guildMemberUpdate",
    async (oldMember, newMember) => {

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
    }
);

// ============================================================
// 🔊 VOICE LOG
// ============================================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        if (!newState.guild) {
            return;
        }

        if (
            !oldState.channel &&
            newState.channel
        ) {

            await sendLog(
                newState.guild,
                "🔊 כניסה לחדר קולי",
                `**משתמש:** ${newState.member.user.tag}\n`
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
                `**משתמש:** ${newState.member.user.tag}\n`
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

        if (!channel.guild) {
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

        if (!channel.guild) {
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
// ❌ ERROR HANDLING
// ============================================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord Client Error:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

// ============================================================
// 🌐 RENDER WEB SERVER
// ============================================================

const PORT =
    process.env.PORT || 10000;

const server =
    http.createServer(
        (req, res) => {

            if (
                req.url === "/health"
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
                        status: "ok",
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
            `🌐 Render server listening on ${PORT}`
        );
    }
);

// ============================================================
// 🔑 LOGIN
// ============================================================

client.login(TOKEN);
