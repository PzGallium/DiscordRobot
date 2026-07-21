#!/bin/bash
# 可放到桌面双击启动；始终进入项目目录，并用 caffeinate 防止休眠
PROJECT_DIR="/Users/zijiapan/PersonalProject/DiscordRobot"
cd "$PROJECT_DIR" || {
  echo "错误：找不到项目目录："
  echo "$PROJECT_DIR"
  read -r -p "按回车键关闭..."
  exit 1
}

echo "================================"
echo "  Pz Coin Bot 启动中..."
echo "  $PROJECT_DIR"
echo "  （已启用 caffeinate，运行期间尽量不休眠）"
echo "================================"
echo ""

if [ ! -f .env ]; then
  echo "错误：找不到 .env 文件"
  echo "请先在项目目录配置 .env"
  read -r -p "按回车键关闭..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖..."
  npm install
fi

echo "机器人已启动。关闭此窗口即停止机器人，并恢复正常休眠。"
echo ""

# -i 防空闲睡眠 / -m 防磁盘睡眠 / -s 插电时防系统睡眠 / -d 减少显示器相关休眠
exec caffeinate -dims npm run dev
