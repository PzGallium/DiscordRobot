# Pz Coin Discord Bot

轻量级 Discord 社区经济系统 MVP：虚拟货币、每日签到、竞猜面板、转账、红包。

所有货币均为社区内部虚拟积分，不可提现、不可兑换现实货币，仅供娱乐。

## 技术栈

- Node.js 20+ / TypeScript
- discord.js v14（Slash Commands + Embed / Buttons / Modal）
- SQLite（better-sqlite3）

## 快速开始

### 1. 创建 Discord 应用

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications) 创建 Application
2. Bot → Reset Token，复制 Token
3. OAuth2 → URL Generator：勾选 `bot` + `applications.commands`
4. Bot 权限建议：`Send Messages`、`Embed Links`、`Use Slash Commands`、`Read Message History`
5. **不需要** Message Content Intent
6. 用生成的链接把机器人邀请进测试服务器

### 2. 配置环境变量

```bash
cp .env.example .env
```

填写：

- `DISCORD_TOKEN`：Bot Token
- `CLIENT_ID`：Application ID
- `GUILD_ID`：测试服务器 ID
- `BOT_OWNER_IDS`：Bot Owner 的 Discord 用户 ID；多个 ID 用英文逗号分隔。Owner 可在任意已安装 Bot 的服务器中执行管理命令

### 3. 安装与启动

```bash
npm install
npm run register-commands   # 首次或命令有变更时执行一次
npm run dev                 # 启动机器人
```

**一键启动（macOS）**：双击项目里的 `启动机器人.command`（首次若提示无法打开，右键 → 打开）。关闭该窗口即停止机器人。

生产构建：

```bash
npm run build
npm start
```

## 命令一览

| 命令 | 谁可用 | 说明 |
|------|--------|------|
| `/daily` | 全员 | 每日签到 |
| `/balance` | 全员 | 查询余额 |
| `/leaderboard` | 全员 | Top 10 |
| `/transfer` | 全员 | 转账（收款人点 Accept/Reject） |
| `/prediction create` | 管理员 | 打开表单，填写标题、开放分钟数和选项 |
| `/prediction settle` | 管理员 | 弹出表单开奖（预填最近一场，改获胜选项即可） |
| `/prediction list` | 全员 | 列出进行中竞猜 |
| `/redpacket` | 管理员 | 发红包 |
| `/admin addmoney` | 管理员 | 测试加减余额 |
| `/settings` | 管理员 / Bot Owner | 查看或修改当前服务器的经济参数 |

管理员 = 拥有 Discord `Administrator` 或 `Manage Server` 权限。`.env` 中的 `BOT_OWNER_IDS` 也可在 Bot 已安装的任意服务器中执行管理命令。

## 竞猜怎么玩

1. 管理员执行 `/prediction create` 后直接打开创建表单
2. 表单自动保留当前服务器上一次竞猜的标题、选项和开放分钟数；首次使用时提供默认选项
3. 提交后频道出现竞猜面板；成员点击选项按钮 → 输入金额下注
4. 面板自动刷新奖池；截止后按钮禁用；管理员 `/prediction settle` 下拉选竞猜、点选获胜选项开奖（也可「取消并退款」）

## 经济参数（默认）

- 新用户：1000 Pz Coin
- 每日签到：+100
- 转账手续费：2%（转出方支付 amount + fee）
- 竞猜手续费：严格 5%（取整余数按下注额从高到低分给赢家）
- 红包有效期：24 小时（未领取余额自动退回发放者）

可在 `.env` 中覆盖全局默认值，见 `.env.example`。未单独配置的服务器自动使用这些默认值。

服务器管理员或 Bot Owner 可用 `/settings` 为当前服务器单独设置：币名、新用户初始余额、daily 奖励、竞猜手续费、转账手续费和红包过期时间。各服务器互不影响：

- 修改币名只改变显示，不清空余额
- 初始余额只影响之后首次使用 Bot 的新用户
- daily 奖励从下一次签到开始生效
- 竞猜和转账手续费只影响新创建的竞猜或转账，旧记录继续使用创建时的费率
- 红包过期时间只影响新红包
- `/settings reset` 可恢复使用 `.env` 默认值

## 数据

SQLite 文件默认在 `data/pzcoin.db`（已 gitignore）。所有余额变动写入 `transactions` 表。

## MVP 验收清单

- [ ] 首次互动自动注册 +1000
- [ ] `/daily` 每日一次 +100
- [ ] `/balance` / `/leaderboard`
- [ ] 竞猜面板：点按钮 + 输入金额下注
- [ ] 截止禁用、开奖分账、手续费销毁
- [ ] 转账确认 + 2% 手续费
- [ ] 红包领取、不可重复、24 小时过期退款
- [ ] `transactions` 可查流水
