const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
require("dotenv").config();

const MAX_OPTIONS = 25; // Maksymalna liczba opcji w dropdownie
const userSelections = new Map(); // Mapa do przechowywania wyborów użytkowników
const TARGET_CHANNEL_ID = process.env.CHANNEL_ID; // Wpisz ID kanału, na którym bot ma działać
const ROLE_ID_TO_REMOVE = process.env.DELETE_ROLE_ID; // Wpisz ID roli, którą bot ma usuwać

// Tworzenie klienta bota
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Logowanie bota
client.once("ready", () => {
  console.log(`Zalogowano jako ${client.user.tag}!`);
});

// Funkcja pomocnicza: liczba dni w miesiącu
const getDaysInMonth = (month, year = new Date().getFullYear()) => {
  return new Date(year, month, 0).getDate();
};

// Generowanie opcji dla dropdownu dni
const generateDayOptions = (daysInMonth, page = 1) => {
  const start = (page - 1) * (MAX_OPTIONS - 2) + 1; // Pomijamy 2 miejsca: "Powrót" i "Strona następna"
  const end = Math.min(start + MAX_OPTIONS - 3, daysInMonth); // "Powrót" i "Strona następna"

  const options = Array.from({ length: end - start + 1 }, (_, i) => ({
    label: `${start + i}`,
    description: `Dzień ${start + i}`,
    value: `${start + i}`,
  }));

  // Dodanie opcji "Powrót" na stronach większych niż 1
  if (page > 1) {
    options.unshift({
      label: "Powrót do poprzedniej strony",
      description: "Wróć do poprzednich dni",
      value: "previous_page",
    });
  }

  // Dodanie opcji "Strona następna" na stronach z większą liczbą dni
  if (end < daysInMonth) {
    options.push({
      label: "Strona następna",
      description: "Zobacz więcej dni",
      value: "next_page",
    });
  }

  return options;
};

// Obsługa wiadomości "!start"
client.on("messageCreate", async (message) => {
  // Obsługa komendy "!start"
  if (message.content === "!start" && !message.author.bot) {
    const monthMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select_month")
        .setPlaceholder("Wybierz miesiąc")
        .addOptions([
          {
            label: "Wybierz miesiąc", // Opcja neutralna
            description: "Nie wybiera żadnego miesiąca",
            value: "none", // Wartość, która nic nie robi
            default: true, // Ustaw jako domyślną
          },
          ...[
            "Styczeń",
            "Luty",
            "Marzec",
            "Kwiecień",
            "Maj",
            "Czerwiec",
            "Lipiec",
            "Sierpień",
            "Wrzesień",
            "Październik",
            "Listopad",
            "Grudzień",
          ].map((name, index) => ({
            label: name,
            description: `Wybierz ${name}`,
            value: `${index + 1}`,
          })),
        ])
    );

    await message.channel.send({
      content: "Wybierz miesiąc, a potem dzień:",
      components: [monthMenu],
    });
  }

  // Obsługa wiadomości na określonym kanale
  if (message.channel.id === TARGET_CHANNEL_ID && !message.author.bot) {
    // Usuwamy wiadomość
    await message
      .delete()
      .catch((err) => console.error("Nie udało się usunąć wiadomości:", err));

    // Usuwamy rolę niezależnie od treści wiadomości
    const role = message.guild.roles.cache.get(ROLE_ID_TO_REMOVE);
    if (role && message.member.roles.cache.has(ROLE_ID_TO_REMOVE)) {
      await message.member.roles
        .remove(role)
        .then(() =>
          console.log(
            `Usunięto rolę ${role.name} użytkownikowi ${message.author.tag}`
          )
        )
        .catch((err) => console.error("Nie udało się usunąć roli:", err));
    }

    // Obsługa komendy "/set"
    if (message.content.startsWith("/set")) {
      const args = message.content.split(" "); // Podział komendy na argumenty
      const dateArg = args.find((arg) => arg.startsWith("date:"));
      const timeZoneArg = args.find((arg) => arg.startsWith("time_zone:"));

      if (dateArg && timeZoneArg) {
        const date = dateArg.split(":")[1];
        const timeZone = timeZoneArg.split(":")[1];

        console.log(`Data: ${date}, Strefa czasowa: ${timeZone}`);

        // Informujemy użytkownika o sukcesie
        await message.channel.send({
          content: `✅ Ustawiono datę na **${date}** i strefę czasową na **${timeZone}**.`,
        });
      } else {
        // Informacja o błędnym formacie
        await message.channel.send({
          content:
            "❌ Niepoprawny format! Użyj `/set date:MM/DD time_zone:Europe/Warsaw`.",
        });
      }
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      const userId = interaction.user.id;

      if (interaction.customId === "select_month") {
        if (interaction.values[0] === "none") {
          // Jeśli wybrano opcję "Wybierz miesiąc", nic nie robimy
          await interaction.reply({
            content: "Proszę wybrać miesiąc z listy, aby kontynuować.",
            ephemeral: true,
          });
          return;
        }

        const selectedMonth = parseInt(interaction.values[0]);
        const daysInMonth = getDaysInMonth(selectedMonth);

        const options = generateDayOptions(daysInMonth, 1);

        const dayMenu = new StringSelectMenuBuilder()
          .setCustomId("select_day_page1")
          .setPlaceholder("Wybierz dzień")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(dayMenu);

        await interaction.reply({
          content: `Wybrałeś miesiąc: ${selectedMonth}. Teraz wybierz dzień:`,
          components: [row],
          ephemeral: true,
        });

        userSelections.set(userId, { month: selectedMonth });
      }

      if (interaction.customId.startsWith("select_day")) {
        const userData = userSelections.get(interaction.user.id);
        if (!userData || !userData.month) {
          await interaction.reply({
            content:
              "Błąd: Nie znaleziono zapisanego miesiąca. Spróbuj ponownie.",
            components: [],
            ephemeral: true,
          });
          return;
        }

        const daysInMonth = getDaysInMonth(userData.month);
        let page = parseInt(interaction.customId.split("_page")[1]);

        if (interaction.values[0] === "next_page") {
          page += 1;
        } else if (interaction.values[0] === "previous_page") {
          page -= 1;
        } else {
          const selectedDay = parseInt(interaction.values[0]);
          const formattedDate = `${userData.month
            .toString()
            .padStart(2, "0")}/${selectedDay.toString().padStart(2, "0")}`;

          await interaction.reply({
            content: `\`\`\`/set date:${formattedDate} time_zone:Europe/Warsaw\`\`\`\n **Wklej ją poniżej i wyślij!**`,
            ephemeral: true,
          });

          // Po 10 sekundach zapytaj o zakończenie konfiguracji
          setTimeout(async () => {
            const configRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("config_done")
                .setLabel("Tak")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId("config_not_done")
                .setLabel("Nie")
                .setStyle(ButtonStyle.Danger)
            );

            await interaction.followUp({
              content: `Hej, <@${interaction.user.id}>! Czy zakończyłeś konfigurację?`,
              components: [configRow],
              ephemeral: true,
            });
          }, 40000); // 40 sekund

          return;
        }

        const options = generateDayOptions(daysInMonth, page);

        const dayMenu = new StringSelectMenuBuilder()
          .setCustomId(`select_day_page${page}`)
          .setPlaceholder("Wybierz dzień")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(dayMenu);

        await interaction.update({
          content: `Strona ${page}: Wybierz dzień:`,
          components: [row],
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "config_done") {
        const role = interaction.guild.roles.cache.get(ROLE_ID_TO_REMOVE);

        if (role && interaction.member.roles.cache.has(ROLE_ID_TO_REMOVE)) {
          await interaction.member.roles.remove(role).catch((err) => {
            console.error("Nie udało się usunąć roli:", err);
          });
        }

        await interaction.reply({
          content: `Konfiguracja zakończona! Rola została usunięta.`,
          ephemeral: true,
        });
      } else if (interaction.customId === "config_not_done") {
        await interaction.reply({
          content: "Poczekam kolejne 30 sekund. Daj znać, gdy zakończysz.",
          ephemeral: true,
        });

        setTimeout(async () => {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("config_done")
              .setLabel("Tak")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("config_not_done")
              .setLabel("Nie")
              .setStyle(ButtonStyle.Danger)
          );

          await interaction.followUp({
            content: `Hej, <@${interaction.user.id}>! Czy zakończyłeś konfigurację?`,
            components: [row],
            ephemeral: true,
          });
        }, 40000); // 40 sekund
      }
    }
  } catch (error) {
    console.error("Błąd podczas obsługi interakcji:", error);
    await interaction.reply({
      content:
        "Wystąpił błąd podczas obsługi Twojej interakcji. Spróbuj ponownie.",
      components: [],
      ephemeral: true,
    });
  }
});

// Logowanie bota
client.login(process.env.DISCORD_TOKEN);
