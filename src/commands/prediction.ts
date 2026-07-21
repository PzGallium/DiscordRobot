import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import {
  createPrediction,
  getPrediction,
  listOpenPredictions,
  setPredictionMessage,
  settlePrediction,
} from '../services/prediction.js';
import { buildPredictionButtons, buildPredictionEmbed } from '../ui/predictionPanel.js';
import { formatCoins } from '../utils/format.js';
import { isGuildAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('prediction')
  .setDescription('竞猜系统')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('创建竞猜并发布面板（管理员）')
      .addStringOption((opt) => opt.setName('title').setDescription('标题').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('deadline')
          .setDescription('截止时间 ISO，例如 2026-07-21T21:00:00')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('options')
          .setDescription('选项，逗号分隔（默认 YES,NO）')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('settle')
      .setDescription('开奖（管理员）')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('竞猜 ID').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('winner').setDescription('获胜选项（须完全匹配）').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('列出进行中的竞猜'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    const list = listOpenPredictions(interaction.guildId);
    if (list.length === 0) {
      await interaction.reply({ content: '当前没有进行中的竞猜。', ephemeral: true });
      return;
    }

    const lines = list.map((p) => {
      const link =
        p.channel_id && p.message_id
          ? `https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.message_id}`
          : null;
      return `#${p.id} · **${p.title}** · ${p.status}${link ? ` · [打开面板](${link})` : ''}`;
    });

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  if (!interaction.member || !isGuildAdmin(interaction.member)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return;
  }

  try {
    if (sub === 'create') {
      const title = interaction.options.getString('title', true);
      const deadlineRaw = interaction.options.getString('deadline', true);
      const optionsRaw = interaction.options.getString('options') ?? 'YES,NO';
      const options = optionsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const deadline = new Date(deadlineRaw);
      if (Number.isNaN(deadline.getTime())) {
        await interaction.reply({
          content: '截止时间格式无效，请用 ISO，例如 `2026-07-21T21:00:00`',
          ephemeral: true,
        });
        return;
      }

      if (interaction.channel.type !== ChannelType.GuildText && interaction.channel.type !== ChannelType.GuildAnnouncement) {
        await interaction.reply({ content: '请在文字频道中创建。', ephemeral: true });
        return;
      }

      const prediction = createPrediction({
        guildId: interaction.guildId,
        title,
        options,
        deadline,
        createdBy: interaction.user.id,
        channelId: interaction.channel.id,
      });

      const channel = interaction.channel as TextChannel;
      const message = await channel.send({
        embeds: [buildPredictionEmbed(prediction)],
        components: buildPredictionButtons(prediction),
      });

      setPredictionMessage(prediction.id, message.id);

      await interaction.reply({
        content: `竞猜 #${prediction.id} 已发布。成员点击按钮并输入金额即可下注。`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'settle') {
      const id = interaction.options.getInteger('id', true);
      const winner = interaction.options.getString('winner', true).trim();
      const before = getPrediction(id);
      if (!before || before.guild_id !== interaction.guildId) {
        await interaction.reply({ content: '找不到该竞猜。', ephemeral: true });
        return;
      }

      const result = settlePrediction(id, winner);
      const refreshed = getPrediction(id)!;

      if (refreshed.channel_id && refreshed.message_id) {
        try {
          const channel = await interaction.client.channels.fetch(refreshed.channel_id);
          if (channel && channel.isTextBased() && 'messages' in channel) {
            const msg = await channel.messages.fetch(refreshed.message_id);
            await msg.edit({
              embeds: [buildPredictionEmbed(refreshed)],
              components: [],
            });
          }
        } catch {
          // panel update best-effort
        }
      }

      const winnerLines =
        result.winners.length === 0
          ? '无人押中，奖池全部销毁。'
          : result.winners
              .slice(0, 15)
              .map((w) => `<@${w.discordId}> 押 ${w.bet} → 得 ${formatCoins(w.payout)}`)
              .join('\n');

      await interaction.reply({
        content: [
          `开奖完成：#${id} → **${result.winnerOption}**`,
          `奖池 ${formatCoins(result.pool)} · 销毁 ${formatCoins(result.fee)} · 派发 ${formatCoins(result.distributable)}`,
          winnerLines,
        ].join('\n'),
      });
      return;
    }
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '操作失败';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}
