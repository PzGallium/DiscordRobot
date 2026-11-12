import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { PredictionCreateDefaults } from '../services/prediction.js';

export const PREDICTION_CREATE_MODAL_ID = 'predcreate:custom';

/** Build the prediction form, prefilling values from the latest guild prediction. */
export function buildCreatePredictionModal(defaults?: PredictionCreateDefaults): ModalBuilder {
  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('标题')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例如：今晚谁拿 MVP？')
    .setRequired(true)
    .setMaxLength(100);
  if (defaults) titleInput.setValue(defaults.title);

  const minutesInput = new TextInputBuilder()
    .setCustomId('minutes')
    .setLabel('开放时间（分钟）')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('10')
    .setRequired(true)
    .setMaxLength(5);
  if (defaults) minutesInput.setValue(String(defaults.durationMinutes));

  const optionsInput = new TextInputBuilder()
    .setCustomId('options')
    .setLabel('选项（逗号分隔）')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(defaults?.options.join(',') ?? '上单,打野,中单,ADC,辅助')
    .setPlaceholder('上单,打野,中单,ADC,辅助')
    .setRequired(true)
    .setMaxLength(200);

  return new ModalBuilder()
    .setCustomId(PREDICTION_CREATE_MODAL_ID)
    .setTitle('创建竞猜')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        titleInput,
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        minutesInput,
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        optionsInput,
      ),
    );
}
