// ============================================================
// 🔵 CHILLZONE COMMUNITY BOT - FULL VERSION
// Discord.js v14 + Gemini 3.6 Flash + Render
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
    ActivityType,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing");
    process.exit(1);
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
        GatewayIntentBits.GuildMessageReactions,
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
// DATA
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
        console.error("❌ Data load error:", error);
    }
}

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error("❌ Data save error:", error);
    }
}

function getGuildData(guildId) {

    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            botImage: null,

            logsChannel: null,

            welcomeChannel: null,
            welcomeEnabled: false,

            verifyChannel: null,
            verifyRole: null,

            ticketChannel: null,
            ticketCategory: null,

            staffRole: null,
            muteRole: null,

            suggestionChannel: null,
            suggestionStaffChannel: null,

            linksChannel: null,

            aiEnabled: true,

            levelsEnabled: true,

            countingChannel: null,

            tickets: {},

            links: [],

            settings: {}
        };

        saveData();
    }

    return data.guilds[guildId];
}

loadData();

// ============================================================
// COLORS
// ============================================================

const BLUE = 0x3498DB;
const DARK_BLUE = 0x1769AA;

// ============================================================
// HELPERS
// ============================================================

function getBotImage(guild) {

    const config = getGuildData(guild.id);

    if (config.botImage) {
        return config.botImage;
    }

    if (client.user && client.user.displayAvatarURL) {
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

async function sendLog(guild, title, description) {

    try {

        const config = getGuildData(guild.id);

        if (!config.logsChannel) return;

        const channel =
            guild.channels.cache.get(config.logsChannel);

        if (!channel) return;

        const embed = makeEmbed(
            guild,
            title,
            description
        );

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {
        console.error("Log error:", error);
    }
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

function safeText(text) {

    return String(text)
        .replace(/@everyone/g, "@\u200beveryone")
        .replace(/@here/g, "@\u200bhere");
}

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("הגדרות ראשיות של הבוט"),

    new SlashCommandBuilder()
        .setName("הגדר-תמונה")
        .setDescription("הגדרת תמונת ChillZone")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("קישור ישיר לתמונה")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-לוגים")
        .setDescription("הגדרת חדר לוגים")
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
                .setDescription("הרול של הצוות")
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
        .setName("הגדר-הצעות")
        .setDescription("הגדרת חדר הצעות למשתמשים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("החדר שבו משתמשים שולחים הצעות")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption(option =>
            option
                .setName("staffchannel")
                .setDescription("החדר שאליו הצעות מגיעות לצוות")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    new SlashCommandBuilder()
        .setName("הגדר-טיקטים")
        .setDescription("הגדרת פאנל טיקטים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("החדר של פאנל הטיקטים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

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
        .setName("הגדר-אימות")
        .setDescription("הגדרת מערכת אימות")
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
                .setDescription("הרול שמקבלים לאחר אימות")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("פאנל-טיקטים")
        .setDescription("שליחת פאנל טיקטים"),

    new SlashCommandBuilder()
        .setName("פאנל-צוות")
        .setDescription("שליחת פאנל צוות"),

    new SlashCommandBuilder()
        .setName("פאנל-קישורים")
        .setDescription("שליחת פאנל קישורים"),

    new SlashCommandBuilder()
        .setName("הוסף-קישור")
        .setDescription("הוספת קישור לפאנל")
        .addStringOption(option =>
            option
                .setName("שם")
                .setDescription("השם שיופיע על הכפתור")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("קישור")
                .setDescription("הקישור")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("מחק-קישורים")
        .setDescription("מחיקת כל הקישורים"),

    new SlashCommandBuilder()
        .setName("הגדר-חדר-קישורים")
        .setDescription("הגדרת חדר פאנל קישורים")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("חדר הקישורים")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

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
        .setDescription("איפוס הספירה"),

    new SlashCommandBuilder()
        .setName("הצעה")
        .setDescription("הצעה לצוות"),

    new SlashCommandBuilder()
        .setName("עזרה")
        .setDescription("פתיחת בקשת עזרה"),

    new SlashCommandBuilder()
        .setName("מחק-פאנל")
        .setDescription("מחיקת פאנל מהחדר הנוכחי")

].map(command => command.toJSON());

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {

    try {

        const rest = new REST({
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
                "✅ Slash commands registered to guild:",
                GUILD_ID
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
                "✅ Global slash commands registered"
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
// READY
// ============================================================

client.once("ready", async () => {

    console.log(
        `✅ Logged in as ${client.user.tag}`
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
// WELCOME
// ============================================================

client.on("guildMemberAdd", async member => {

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

        if (!channel) return;

        const embed = makeEmbed(
            member.guild,
            "🔵 ברוכים הבאים ל־ChillZone!",
            `👋 היי ${member}!\n\n`
            + `שמחים שהצטרפת אלינו.\n`
            + `תהנה בשרת ותכיר את הקהילה! 💙`
        );

        embed.setImage(
            getBotImage(member.guild)
        );

        await channel.send({
            content: `${member}`,
            embeds: [embed]
        });

        await sendLog(
            member.guild,
            "👋 משתמש נכנס",
            `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}`
        );

    } catch (error) {
        console.error("Welcome error:", error);
    }

});

// ============================================================
// VERIFY PANEL
// ============================================================

async function sendVerifyPanel(guild, channel) {

    const embed = makeEmbed(
        guild,
        "🔐 אימות ChillZone",
        "לחץ על הכפתור למטה כדי לקבל גישה לשרת."
    );

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("verify_member")
                .setLabel("אימות")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Primary)
        );

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// TICKET PANEL
// ============================================================

async function sendTicketPanel(guild, channel) {

    const embed = makeEmbed(
        guild,
        "🎫 מערכת הטיקטים של ChillZone",
        "בחר את סוג הפנייה שלך מהרשימה למטה.\n\n"
        + "🆘 תמיכה\n"
        + "🚨 דיווח\n"
        + "👮 בחינה לצוות\n"
        + "❓ אחר"
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_type")
        .setPlaceholder("בחר סוג טיקט")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("תמיכה")
                .setDescription("קבלת עזרה מצוות השרת")
                .setValue("support")
                .setEmoji("🆘"),

            new StringSelectMenuOptionBuilder()
                .setLabel("דיווח")
                .setDescription("דיווח על משתמש או בעיה")
                .setValue("report")
                .setEmoji("🚨"),

            new StringSelectMenuOptionBuilder()
                .setLabel("בחינה לצוות")
                .setDescription("פנייה בנושא הצטרפות לצוות")
                .setValue("staff")
                .setEmoji("👮"),

            new StringSelectMenuOptionBuilder()
                .setLabel("אחר")
                .setDescription("נושא שלא נמצא ברשימה")
                .setValue("other")
                .setEmoji("❓")
        );

    const row = new ActionRowBuilder()
        .addComponents(menu);

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// CREATE TICKET
// ============================================================

async function createTicket(interaction, type) {

    const guild = interaction.guild;
    const member = interaction.member;
    const config = getGuildData(guild.id);

    const existing = Object.values(
        config.tickets || {}
    ).find(
        ticket => ticket.userId === member.id
    );

    if (existing) {

        const existingChannel =
            guild.channels.cache.get(
                existing.channelId
            );

        if (existingChannel) {

            return interaction.reply({
                content:
                    `❌ כבר יש לך טיקט פתוח: ${existingChannel}`,
                ephemeral: true
            });
        }
    }

    const typeNames = {
        support: "תמיכה",
        report: "דיווח",
        staff: "בחינה לצוות",
        other: "אחר"
    };

    const channelName =
        `ticket-${member.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 20);

    const permissionOverwrites = [

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

    if (config.staffRole) {

        permissionOverwrites.push({
            id: config.staffRole,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        });
    }

    const channel =
        await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.ticketCategory || undefined,
            permissionOverwrites
        });

    config.tickets[channel.id] = {
        userId: member.id,
        type,
        claimed: false,
        createdAt: Date.now()
    };

    saveData();

    const embed = makeEmbed(
        guild,
        `🎫 טיקט ${typeNames[type] || "אחר"}`,
        `שלום ${member} 👋\n\n`
        + `תאר כאן את הבעיה שלך.\n`
        + `צוות ChillZone יטפל בפנייה בהקדם.\n\n`
        + `🤖 ה־AI יכול לעזור עד שאיש צוות ייקח את הטיקט.`
    );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId("ticket_claim")
                    .setLabel("קח טיקט")
                    .setEmoji("🙋")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("ticket_close")
                    .setLabel("סגור טיקט")
                    .setEmoji("🔒")
                    .setStyle(ButtonStyle.Danger)
            );

    await channel.send({
        content: `${member}`,
        embeds: [embed],
        components: [row]
    });

    await interaction.reply({
        content: `✅ הטיקט שלך נפתח: ${channel}`,
        ephemeral: true
    });

    await sendLog(
        guild,
        "🎫 טיקט נפתח",
        `**משתמש:** ${member.user.tag}\n`
        + `**ID:** ${member.id}\n`
        + `**סוג:** ${typeNames[type] || type}\n`
        + `**חדר:** ${channel}`
    );
}

// ============================================================
// GEMINI AI
// ============================================================

async function askGemini(prompt) {

    if (!GEMINI_API_KEY) {
        return null;
    }

    try {

        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

        const response = await fetch(
            url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text:
                                        `You are ChillZone Discord support AI.
Answer in Hebrew.
Be friendly and concise.
Do not pretend to be a human staff member.
If the issue requires staff, tell the user that staff will handle it.

User message:
${prompt}`
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 500
                    }
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {

            console.error(
                "Gemini error:",
                result
            );

            return null;
        }

        const text =
            result?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        return text || null;

    } catch (error) {

        console.error(
            "Gemini request error:",
            error
        );

        return null;
    }
}

// ============================================================
// TICKET AI
// ============================================================

client.on("messageCreate", async message => {

    if (message.author.bot) return;

    const guild = message.guild;

    if (!guild) return;

    const config = getGuildData(guild.id);

    // --------------------------------------------------------
    // SUGGESTION
    // --------------------------------------------------------

    if (
        message.content.toLowerCase().startsWith("!הצעה")
    ) {

        const suggestion =
            message.content
                .slice("!הצעה".length)
                .trim();

        if (!suggestion) {

            return message.reply(
                "❌ שימוש נכון: `!הצעה ההצעה שלך`"
            );
        }

        if (!config.suggestionChannel) {

            return message.reply(
                "❌ חדר ההצעות עדיין לא הוגדר."
            );
        }

        if (!config.suggestionStaffChannel) {

            return message.reply(
                "❌ חדר הצוות של ההצעות עדיין לא הוגדר."
            );
        }

        const publicChannel =
            guild.channels.cache.get(
                config.suggestionChannel
            );

        const staffChannel =
            guild.channels.cache.get(
                config.suggestionStaffChannel
            );

        if (!publicChannel || !staffChannel) {

            return message.reply(
                "❌ אחד מחדרי ההצעות לא נמצא."
            );
        }

        const suggestionId =
            `${Date.now()}-${message.author.id}`;

        const embed =
            makeEmbed(
                guild,
                "💡 הצעה חדשה",
                `**הצעה מאת:** ${message.author}\n\n`
                + `> ${safeText(suggestion)}`
            );

        embed.addFields(
            {
                name: "🆔 מזהה הצעה",
                value: `\`${suggestionId}\``
            }
        );

        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `suggestion_accept_${suggestionId}`
                        )
                        .setLabel("אישור")
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId(
                            `suggestion_reject_${suggestionId}`
                        )
                        .setLabel("דחייה")
                        .setEmoji("❌")
                        .setStyle(ButtonStyle.Danger)
                );

        await staffChannel.send({
            embeds: [embed],
            components: [row]
        });

        await message.reply(
            "✅ ההצעה נשלחה לצוות לבדיקה."
        );

        await sendLog(
            guild,
            "💡 הצעה נשלחה",
            `**משתמש:** ${message.author.tag}\n`
            + `**ID:** ${message.author.id}\n`
            + `**הצעה:** ${safeText(suggestion)}`
        );

        return;
    }

    // --------------------------------------------------------
    // TICKET AI
    // --------------------------------------------------------

    const ticket =
        config.tickets &&
        config.tickets[message.channel.id];

    if (!ticket) return;

    if (ticket.claimed) return;

    if (!config.aiEnabled) return;

    const response =
        await askGemini(message.content);

    if (!response) return;

    const embed =
        makeEmbed(
            guild,
            "🤖 ChillZone AI",
            response
        );

    await message.reply({
        embeds: [embed]
    });

});

// ============================================================
// BUTTON INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {

    try {

        if (
            interaction.isButton()
        ) {

            await handleButton(interaction);
            return;
        }

        if (
            interaction.isStringSelectMenu()
        ) {

            await handleSelect(interaction);
            return;
        }

        if (
            interaction.isModalSubmit()
        ) {

            await handleModal(interaction);
            return;
        }

        if (
            interaction.isChatInputCommand()
        ) {

            await handleCommand(interaction);
            return;
        }

    } catch (error) {

        console.error(
            "Interaction error:",
            error
        );

        try {

            if (interaction.replied) {

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

});

// ============================================================
// BUTTON HANDLER
// ============================================================

async function handleButton(interaction) {

    const guild =
        interaction.guild;

    if (!guild) return;

    const config =
        getGuildData(guild.id);

    const id =
        interaction.customId;

    // --------------------------------------------------------
    // VERIFY
    // --------------------------------------------------------

    if (id === "verify_member") {

        if (!config.verifyRole) {

            return interaction.reply({
                content:
                    "❌ מערכת האימות עדיין לא הוגדרה.",
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

        await interaction.member.roles.add(role);

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

    // --------------------------------------------------------
    // TICKET CLAIM
    // --------------------------------------------------------

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

        ticket.claimed = true;
        ticket.claimedBy =
            interaction.user.id;

        saveData();

        const embed =
            makeEmbed(
                guild,
                "🙋 טיקט נלקח",
                `הטיקט נלקח על ידי ${interaction.user}.`
            );

        await interaction.reply({
            embeds: [embed]
        });

        await sendLog(
            guild,
            "🙋 טיקט נלקח",
            `**צוות:** ${interaction.user.tag}\n`
            + `**חדר:** ${interaction.channel.name}`
        );

        return;
    }

    // --------------------------------------------------------
    // TICKET CLOSE
    // --------------------------------------------------------

    if (id === "ticket_close") {

        if (
            interaction.member.id !==
            config.tickets[
                interaction.channel.id
            ]?.userId &&
            !isStaff(interaction.member)
        ) {

            return interaction.reply({
                content:
                    "❌ אין לך הרשאה לסגור את הטיקט.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content:
                "🔒 הטיקט ייסגר בעוד 5 שניות."
        });

        await sendLog(
            guild,
            "🔒 טיקט נסגר",
            `**על ידי:** ${interaction.user.tag}\n`
            + `**חדר:** ${interaction.channel.name}`
        );

        setTimeout(async () => {

            delete config.tickets[
                interaction.channel.id
            ];

            saveData();

            try {
                await interaction.channel.delete();
            } catch {}

        }, 5000);

        return;
    }

    // --------------------------------------------------------
    // TEAM BUTTONS
    // --------------------------------------------------------

    if (id === "staff_timeout") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להשתמש בפאנל הזה.",
                ephemeral: true
            });
        }

        const modal =
            new ModalBuilder()
                .setCustomId("modal_timeout")
                .setTitle("⏱️ Timeout");

        const userId =
            new TextInputBuilder()
                .setCustomId("user_id")
                .setLabel("ID של המשתמש")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("123456789012345678");

        const minutes =
            new TextInputBuilder()
                .setCustomId("minutes")
                .setLabel("לכמה דקות?")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("10");

        modal.addComponents(
            new ActionRowBuilder().addComponents(userId),
            new ActionRowBuilder().addComponents(minutes)
        );

        await interaction.showModal(modal);
        return;
    }

    if (id === "staff_ban") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להשתמש בפאנל הזה.",
                ephemeral: true
            });
        }

        const modal =
            new ModalBuilder()
                .setCustomId("modal_ban")
                .setTitle("🔨 Ban");

        const userId =
            new TextInputBuilder()
                .setCustomId("user_id")
                .setLabel("ID של המשתמש")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userId)
        );

        await interaction.showModal(modal);
        return;
    }

    if (id === "staff_kick") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להשתמש בפאנל הזה.",
                ephemeral: true
            });
        }

        const modal =
            new ModalBuilder()
                .setCustomId("modal_kick")
                .setTitle("👢 Kick");

        const userId =
            new TextInputBuilder()
                .setCustomId("user_id")
                .setLabel("ID של המשתמש")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userId)
        );

        await interaction.showModal(modal);
        return;
    }

    if (id === "staff_mute") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להשתמש בפאנל הזה.",
                ephemeral: true
            });
        }

        const modal =
            new ModalBuilder()
                .setCustomId("modal_mute")
                .setTitle("🔇 השתקה");

        const userId =
            new TextInputBuilder()
                .setCustomId("user_id")
                .setLabel("ID של המשתמש")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userId)
        );

        await interaction.showModal(modal);
        return;
    }

    // --------------------------------------------------------
    // SUGGESTION ACCEPT / REJECT
    // --------------------------------------------------------

    if (
        id.startsWith("suggestion_accept_") ||
        id.startsWith("suggestion_reject_")
    ) {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "❌ רק צוות יכול להחליט על הצעות.",
                ephemeral: true
            });
        }

        const accepted =
            id.startsWith("suggestion_accept_");

        const suggestionId =
            id
                .replace(
                    "suggestion_accept_",
                    ""
                )
                .replace(
                    "suggestion_reject_",
                    ""
                );

        const embed =
            interaction.message.embeds[0];

        if (!embed) {

            return interaction.reply({
                content:
                    "❌ לא ניתן למצוא את ההצעה.",
                ephemeral: true
            });
        }

        const userField =
            embed.description || "";

        const match =
            userField.match(
                /<@!?(\d+)>/
            );

        if (!match) {

            return interaction.reply({
                content:
                    "❌ לא הצלחתי למצוא את המשתמש.",
                ephemeral: true
            });
        }

        const userId = match[1];

        const user =
            await client.users.fetch(
                userId
            ).catch(() => null);

        if (user) {

            const dmEmbed =
                makeEmbed(
                    guild,
                    accepted
                        ? "✅ ההצעה שלך אושרה!"
                        : "❌ ההצעה שלך נדחתה",
                    accepted
                        ? "הצוות בדק את ההצעה שלך ואהב אותה! 💙"
                        : "הצוות בדק את ההצעה שלך והחליט שלא לאשר אותה הפעם."
                );

            dmEmbed.addFields({
                name: "📝 ההצעה שלך",
                value:
                    safeText(
                        embed.description
                            ?.split("> ")[1]
                            || "לא זמין"
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
                `${interaction.message.embeds[0].description || ""}\n\n`
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
                    ? "✅ ההצעה אושרה והמשתמש קיבל DM."
                    : "❌ ההצעה נדחתה והמשתמש קיבל DM.",
            ephemeral: true
        });

        await sendLog(
            guild,
            accepted
                ? "💡 הצעה אושרה"
                : "💡 הצעה נדחתה",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${userId}\n`
            + `**מזהה:** ${suggestionId}`
        );

        return;
    }

}

// ============================================================
// SELECT MENU
// ============================================================

async function handleSelect(interaction) {

    const guild =
        interaction.guild;

    if (!guild) return;

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

}

// ============================================================
// MODALS
// ============================================================

async function handleModal(interaction) {

    const guild =
        interaction.guild;

    if (!guild) return;

    const config =
        getGuildData(guild.id);

    if (!isStaff(interaction.member)) {

        return interaction.reply({
            content:
                "❌ אין לך הרשאה.",
            ephemeral: true
        });
    }

    // --------------------------------------------------------
    // TIMEOUT
    // --------------------------------------------------------

    if (
        interaction.customId ===
        "modal_timeout"
    ) {

        const userId =
            interaction.fields.getTextInputValue(
                "user_id"
            );

        const minutesText =
            interaction.fields.getTextInputValue(
                "minutes"
            );

        const minutes =
            parseInt(minutesText);

        if (
            !Number.isInteger(minutes) ||
            minutes < 1 ||
            minutes > 40320
        ) {

            return interaction.reply({
                content:
                    "❌ זמן לא תקין. הכנס בין 1 ל־40320 דקות.",
                ephemeral: true
            });
        }

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "❌ המשתמש לא נמצא בשרת.",
                ephemeral: true
            });
        }

        if (
            !member.moderatable
        ) {

            return interaction.reply({
                content:
                    "❌ אי אפשר לעשות Timeout למשתמש הזה.",
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

    // --------------------------------------------------------
    // BAN
    // --------------------------------------------------------

    if (
        interaction.customId ===
        "modal_ban"
    ) {

        const userId =
            interaction.fields.getTextInputValue(
                "user_id"
            );

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "❌ המשתמש לא נמצא בשרת.",
                ephemeral: true
            });
        }

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
            "🔨 Ban",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}`
        );

        return;
    }

    // --------------------------------------------------------
    // KICK
    // --------------------------------------------------------

    if (
        interaction.customId ===
        "modal_kick"
    ) {

        const userId =
            interaction.fields.getTextInputValue(
                "user_id"
            );

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "❌ המשתמש לא נמצא בשרת.",
                ephemeral: true
            });
        }

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
            "👢 Kick",
            `**צוות:** ${interaction.user.tag}\n`
            + `**משתמש:** ${member.user.tag}\n`
            + `**ID:** ${member.id}`
        );

        return;
    }

    // --------------------------------------------------------
    // MUTE
    // --------------------------------------------------------

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

        const userId =
            interaction.fields.getTextInputValue(
                "user_id"
            );

        const member =
            await guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "❌ המשתמש לא נמצא.",
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
                    "❌ רול ההשתקה לא נמצא.",
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
                "🔊 הסרת השתקה",
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
                "🔇 השתקה",
                `**צוות:** ${interaction.user.tag}\n`
                + `**משתמש:** ${member.user.tag}\n`
                + `**ID:** ${member.id}`
            );
        }

        return;
    }

}

// ============================================================
// STAFF PANEL
// ============================================================

async function sendStaffPanel(
    guild,
    channel
) {

    const embed =
        makeEmbed(
            guild,
            "🛡️ פאנל צוות — ChillZone",
            "פאנל ניהול צוות.\n\n"
            + "בחר פעולה ולאחר מכן הכנס את ה־ID של המשתמש.\n\n"
            + "⏱️ Timeout\n"
            + "🔨 Ban\n"
            + "👢 Kick\n"
            + "🔇 השתקה / הסרת השתקה"
        );

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "staff_timeout"
                    )
                    .setLabel("Timeout")
                    .setEmoji("⏱️")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_ban"
                    )
                    .setLabel("Ban")
                    .setEmoji("🔨")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_kick"
                    )
                    .setLabel("Kick")
                    .setEmoji("👢")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_mute"
                    )
                    .setLabel("השתקה")
                    .setEmoji("🔇")
                    .setStyle(ButtonStyle.Primary)
            );

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// LINKS PANEL
// ============================================================

async function sendLinksPanel(
    guild,
    channel
) {

    const config =
        getGuildData(guild.id);

    if (!config.links.length) {

        const embed =
            makeEmbed(
                guild,
                "🔗 קישורי ChillZone",
                "אין כרגע קישורים מוגדרים."
            );

        await channel.send({
            embeds: [embed]
        });

        return;
    }

    const embed =
        makeEmbed(
            guild,
            "🔗 קישורים",
            "כל הקישורים החשובים של ChillZone נמצאים כאן:"
        );

    const rows = [];

    let currentRow =
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
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    link.url
                );

        currentRow.addComponents(
            button
        );

        if (
            currentRow.components.length === 5 ||
            i === config.links.length - 1
        ) {

            rows.push(
                currentRow
            );

            currentRow =
                new ActionRowBuilder();
        }
    }

    await channel.send({
        embeds: [embed],
        components: rows
    });
}

// ============================================================
// COMMAND HANDLER
// ============================================================

async function handleCommand(interaction) {

    const guild =
        interaction.guild;

    if (!guild) return;

    const config =
        getGuildData(guild.id);

    // ========================================================
    // ADMIN CHECK
    // ========================================================

    const adminCommands = [

        "setup",
        "הגדר-תמונה",
        "הגדר-לוגים",
        "הגדר-צוות",
        "הגדר-השתקה",
        "הגדר-הצעות",
        "הגדר-טיקטים",
        "הגדר-ברוכים-הבאים",
        "הגדר-אימות",
        "פאנל-טיקטים",
        "פאנל-צוות",
        "פאנל-קישורים",
        "הוסף-קישור",
        "מחק-קישורים",
        "הגדר-חדר-קישורים",
        "הגדר-ספירה",
        "איפוס-ספירה",
        "מחק-פאנל"
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
    // IMAGE
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
                    "❌ זה לא קישור תקין.",
                ephemeral: true
            });
        }

        config.botImage = url;

        saveData();

        await interaction.reply({
            embeds: [
                makeEmbed(
                    guild,
                    "🖼️ תמונת ChillZone עודכנה",
                    "מעכשיו התמונה הזאת תופיע בפאנלים והודעות המערכת."
                )
            ],
            ephemeral: true
        });

        await sendLog(
            guild,
            "🖼️ תמונת בוט שונתה",
            `**על ידי:** ${interaction.user.tag}`
        );

        return;
    }

    // ========================================================
    // LOG CHANNEL
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
                `✅ חדר הלוגים הוגדר ל־${channel}`,
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
                `✅ Staff Role הוגדר ל־${role}`,
            ephemeral: true
        });

        await sendLog(
            guild,
            "🛡️ Staff Role עודכן",
            `**רול:** ${role}\n`
            + `**על ידי:** ${interaction.user.tag}`
        );

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
                `✅ Mute Role הוגדר ל־${role}`,
            ephemeral: true
        });

        await sendLog(
            guild,
            "🔇 Mute Role עודכן",
            `**רול:** ${role}\n`
            + `**על ידי:** ${interaction.user.tag}`
        );

        return;
    }

    // ========================================================
    // SUGGESTIONS
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
                + `✅ חדר צוות להצעות: ${staffChannel}`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // TICKETS CHANNEL
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
                `✅ חדר הטיקטים הוגדר ל־${channel}`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // WELCOME
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

        config.welcomeEnabled =
            true;

        saveData();

        await interaction.reply({
            content:
                `✅ Welcome הוגדר ל־${channel}`,
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // VERIFY
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
                `✅ אימות הוגדר.\n`
                + `חדר: ${channel}\n`
                + `רול: ${role}`,
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
                `✅ חדר הקישורים הוגדר ל־${channel}`,
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
                    "❌ הקישור חייב להתחיל ב־http:// או https://",
                ephemeral: true
            });
        }

        config.links.push({
            name,
            url
        });

        saveData();

        await interaction.reply({
            embeds: [
                makeEmbed(
                    guild,
                    "🔗 קישור נוסף",
                    `**שם:** ${name}\n**קישור:** ${url}`
                )
            ],
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
    // TICKET PANEL
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

        config.settings.count =
            0;

        config.settings.lastCounter =
            null;

        saveData();

        await interaction.reply({
            content:
                `🔢 חדר הספירה הוגדר ל־${channel}`,
            ephemeral: true
        });

        return;
    }

    if (
        interaction.commandName ===
        "איפוס-ספירה"
    ) {

        config.settings.count =
            0;

        config.settings.lastCounter =
            null;

        saveData();

        await interaction.reply({
            content:
                "✅ הספירה אופסה ל־0.",
            ephemeral: true
        });

        return;
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
                "המערכות הזמינות להגדרה:\n\n"
                + "🖼️ `/הגדר-תמונה`\n"
                + "📝 `/הגדר-לוגים`\n"
                + "🛡️ `/הגדר-צוות`\n"
                + "🔇 `/הגדר-השתקה`\n"
                + "💡 `/הגדר-הצעות`\n"
                + "🎫 `/הגדר-טיקטים`\n"
                + "👋 `/הגדר-ברוכים-הבאים`\n"
                + "🔐 `/הגדר-אימות`\n"
                + "🔗 `/הגדר-חדר-קישורים`\n"
                + "🔢 `/הגדר-ספירה`\n\n"
                + "📌 פאנלים:\n"
                + "`/פאנל-טיקטים`\n"
                + "`/פאנל-צוות`\n"
                + "`/פאנל-קישורים`"
            );

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        return;
    }

    // ========================================================
    // HELP
    // ========================================================

    if (
        interaction.commandName ===
        "עזרה"
    ) {

        const config =
            getGuildData(guild.id);

        const embed =
            makeEmbed(
                guild,
                "🆘 בקשת עזרה",
                `${interaction.user} מבקש עזרה.\n\n`
                + `צוות ${config.staffRole ? `<@&${config.staffRole}>` : "הצוות"} מוזמן לטפל בבקשה.`
            );

        const row =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_claim"
                        )
                        .setLabel("טפל בבקשה")
                        .setEmoji("🙋")
                        .setStyle(
                            ButtonStyle.Primary
                        )
                );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        await sendLog(
            guild,
            "🆘 בקשת עזרה",
            `**משתמש:** ${interaction.user.tag}\n`
            + `**ID:** ${interaction.user.id}`
        );

        return;
    }

    // ========================================================
    // DELETE PANEL
    // ========================================================

    if (
        interaction.commandName ===
        "מחק-פאנל"
    ) {

        await interaction.reply({
            content:
                "🗑️ מוחק את ההודעה האחרונה בעוד 2 שניות...",
            ephemeral: true
        });

        setTimeout(async () => {

            try {
                await interaction.deleteReply();
            } catch {}

        }, 2000);

        return;
    }

}

// ============================================================
// MESSAGE DELETE LOG
// ============================================================

client.on(
    "messageDelete",
    async message => {

        if (!message.guild) return;

        if (message.author?.bot) return;

        await sendLog(
            message.guild,
            "🗑️ הודעה נמחקה",
            `**משתמש:** ${message.author?.tag || "לא ידוע"}\n`
            + `**ID:** ${message.author?.id || "לא ידוע"}\n`
            + `**חדר:** ${message.channel}\n`
            + `**תוכן:** ${safeText(message.content || "אין תוכן")}`
        );
    }
);

// ============================================================
// MESSAGE UPDATE LOG
// ============================================================

client.on(
    "messageUpdate",
    async (oldMessage, newMessage) => {

        if (!newMessage.guild) return;

        if (newMessage.author?.bot) return;

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
            + `**לפני:** ${safeText(oldMessage.content || "לא ידוע")}\n`
            + `**אחרי:** ${safeText(newMessage.content || "לא ידוע")}`
        );
    }
);

// ============================================================
// MEMBER UPDATE LOG
// ============================================================

client.on(
    "guildMemberUpdate",
    async (oldMember, newMember) => {

        const addedRoles =
            newMember.roles.cache.filter(
                role =>
                    !oldMember.roles.cache.has(
                        role.id
                    )
            );

        const removedRoles =
            oldMember.roles.cache.filter(
                role =>
                    !newMember.roles.cache.has(
                        role.id
                    )
            );

        if (addedRoles.size > 0) {

            for (
                const role of addedRoles.values()
            ) {

                await sendLog(
                    newMember.guild,
                    "➕ רול נוסף",
                    `**משתמש:** ${newMember.user.tag}\n`
                    + `**רול:** ${role}\n`
                    + `**ID משתמש:** ${newMember.id}`
                );
            }
        }

        if (removedRoles.size > 0) {

            for (
                const role of removedRoles.values()
            ) {

                await sendLog(
                    newMember.guild,
                    "➖ רול הוסר",
                    `**משתמש:** ${newMember.user.tag}\n`
                    + `**רול:** ${role}\n`
                    + `**ID משתמש:** ${newMember.id}`
                );
            }
        }
    }
);

// ============================================================
// VOICE LOG
// ============================================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        if (!newState.guild) return;

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

        if (
            oldState.serverMute !==
            newState.serverMute
        ) {

            await sendLog(
                newState.guild,
                newState.serverMute
                    ? "🔇 משתמש הושתק קולית"
                    : "🔊 משתמש בוטל לו ההשתקה",
                `**משתמש:** ${newState.member.user.tag}\n`
                + `**ID:** ${newState.member.id}`
            );
        }
    }
);

// ============================================================
// CHANNEL LOG
// ============================================================

client.on(
    "channelCreate",
    async channel => {

        if (!channel.guild) return;

        await sendLog(
            channel.guild,
            "📁 חדר נוצר",
            `**חדר:** ${channel.name}\n`
            + `**ID:** ${channel.id}\n`
            + `**סוג:** ${channel.type}`
        );
    }
);

client.on(
    "channelDelete",
    async channel => {

        if (!channel.guild) return;

        await sendLog(
            channel.guild,
            "🗑️ חדר נמחק",
            `**חדר:** ${channel.name}\n`
            + `**ID:** ${channel.id}`
        );
    }
);

// ============================================================
// ROLE LOG
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
// COUNTING SYSTEM
// ============================================================

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) return;

        const config =
            getGuildData(
                message.guild.id
            );

        if (
            !config.countingChannel ||
            message.channel.id !==
            config.countingChannel
        ) return;

        const number =
            parseInt(
                message.content.trim()
            );

        if (
            Number.isNaN(number)
        ) return;

        const current =
            config.settings.count || 0;

        const last =
            config.settings.lastCounter;

        if (
            number !== current + 1 ||
            last === message.author.id
        ) {

            await message.react("❌")
                .catch(() => {});

            config.settings.count = 0;
            config.settings.lastCounter = null;

            saveData();

            await message.channel.send(
                `❌ הספירה נשברה! מתחילים מחדש מ־**1**.`
            );

            return;
        }

        config.settings.count =
            number;

        config.settings.lastCounter =
            message.author.id;

        saveData();

        await message.react("✅")
            .catch(() => {});
    }
);

// ============================================================
// ERROR HANDLING
// ============================================================

client.on(
    "error",
    error => {
        console.error(
            "Discord client error:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled rejection:",
            error
        );
    }
);

// ============================================================
// RENDER WEB SERVER
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
            `🌐 Web server listening on port ${PORT}`
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
