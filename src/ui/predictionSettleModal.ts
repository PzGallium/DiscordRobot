import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { PredictionRow } from '../services/prediction.js';
import { parseOptions } from '../services/prediction.js';

export const PREDICTION_SETTLE_MODAL_ID = 'predsettle';

/** Prefills the latest unsettled prediction id; winner stays editable. */
export function buildSettlePredictionModal(prediction: PredictionRow): ModalBuilder {
  const options = parseOptions(prediction.options_json);
  const optionHint = options.join(' / ');

  return new ModalBuilder()
    .setCustomId(PREDICTION_SETTLE_MODAL_ID)
    .setTitle('开奖结算')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('id')
          .setLabel('竞猜 ID')
          .setStyle(TextInputStyle.Short)
          .setValue(String(prediction.id))
          .setPlaceholder(`当前：#${prediction.id} ${prediction.title}`.slice(0, 100))
          .setRequired(true)
          .setMaxLength(10),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title_hint')
          .setLabel('竞猜标题（仅供确认，无需改）')
          .setStyle(TextInputStyle.Short)
          .setValue(prediction.title.slice(0, 100))
          .setRequired(false)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('winner')
          .setLabel('获胜选项，或填「退款」取消'.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`${optionHint} / 退款`)
          .setValue(options[0] ?? '')
          .setRequired(true)
          .setMaxLength(40),
      ),
    );
}
