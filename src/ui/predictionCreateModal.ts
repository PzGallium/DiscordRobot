import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const PREDICTION_CREATE_MODAL_PREFIX = 'predcreate:';

export type PredictionOptionTemplate = 'yesno' | 'abcd' | 'abc' | 'custom';

export type DurationPresetValue =
  | '1m'
  | '5m'
  | '10m'
  | '1h'
  | '2h'
  | '5h'
  | '12h'
  | '24h'
  | 'custom';

export const DURATION_PRESET_CHOICES: Array<{ name: string; value: DurationPresetValue }> = [
  { name: '1 分钟', value: '1m' },
  { name: '5 分钟', value: '5m' },
  { name: '10 分钟', value: '10m' },
  { name: '1 小时', value: '1h' },
  { name: '2 小时', value: '2h' },
  { name: '5 小时', value: '5h' },
  { name: '12 小时', value: '12h' },
  { name: '24 小时', value: '24h' },
  { name: '自定义', value: 'custom' },
];

const DURATION_MS: Record<Exclude<DurationPresetValue, 'custom'>, number> = {
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '1h': 1 * 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '5h': 5 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const DURATION_LABEL: Record<Exclude<DurationPresetValue, 'custom'>, string> = {
  '1m': '1 分钟',
  '5m': '5 分钟',
  '10m': '10 分钟',
  '1h': '1 小时',
  '2h': '2 小时',
  '5h': '5 小时',
  '12h': '12 小时',
  '24h': '24 小时',
};

export const OPTION_TEMPLATES: Record<
  PredictionOptionTemplate,
  { label: string; options: string }
> = {
  yesno: { label: 'YES / NO', options: 'YES,NO' },
  abcd: { label: 'A / B / C / D', options: 'A,B,C,D' },
  abc: { label: 'A / B / C', options: 'A,B,C' },
  custom: {
    label: '自定义',
    options: 'A 选项一,B 选项二,C 选项三,D 选项四',
  },
};

export function isDurationPreset(value: string): value is DurationPresetValue {
  return DURATION_PRESET_CHOICES.some((c) => c.value === value);
}

export function resolvePresetDuration(value: Exclude<DurationPresetValue, 'custom'>): {
  totalMs: number;
  label: string;
} {
  return { totalMs: DURATION_MS[value], label: DURATION_LABEL[value] };
}

/** Modal: title + options; duration encoded in customId. Custom also asks days/hours/minutes. */
export function buildCreatePredictionModal(
  template: PredictionOptionTemplate = 'yesno',
  duration: DurationPresetValue = '1h',
): ModalBuilder {
  const preset = OPTION_TEMPLATES[template];
  const isCustom = duration === 'custom';

  const modal = new ModalBuilder()
    .setCustomId(`${PREDICTION_CREATE_MODAL_PREFIX}${duration}`)
    .setTitle('创建竞猜')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('标题')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            template === 'abcd' || template === 'abc' || template === 'custom'
              ? '例如：今晚谁拿 MVP？'
              : '例如：今晚 Faker 会拿 MVP？',
          )
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('options')
          .setLabel('选项（逗号分隔，可写成 A 内容,B 内容）')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(preset.options)
          .setPlaceholder('A 红方,B 蓝方,C 平局,D 取消')
          .setRequired(true)
          .setMaxLength(200),
      ),
    );

  if (isCustom) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('提交后多少天截止')
          .setStyle(TextInputStyle.Short)
          .setValue('0')
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(3),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('hours')
          .setLabel('提交后多少小时截止')
          .setStyle(TextInputStyle.Short)
          .setValue('1')
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(3),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('提交后多少分钟截止')
          .setStyle(TextInputStyle.Short)
          .setValue('0')
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(4),
      ),
    );
  }

  return modal;
}

export function parseDurationFields(
  daysRaw: string,
  hoursRaw: string,
  minutesRaw: string,
): { days: number; hours: number; minutes: number; totalMs: number } | null {
  const parseNonNegInt = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return Number.parseInt(trimmed, 10);
  };

  const days = parseNonNegInt(daysRaw);
  const hours = parseNonNegInt(hoursRaw);
  const minutes = parseNonNegInt(minutesRaw);
  if (days === null || hours === null || minutes === null) return null;

  const totalMs =
    days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000 + minutes * 60 * 1000;
  return { days, hours, minutes, totalMs };
}

export function formatDurationLabel(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (minutes > 0) parts.push(`${minutes} 分钟`);
  return parts.length > 0 ? parts.join(' ') : '0 分钟';
}
