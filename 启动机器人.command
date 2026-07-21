#!/bin/bash
# 可放到桌面双击启动；始终进入项目目录
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

echo "机器人已启动。关闭此窗口即停止机器人。"
echo ""
npm run dev
