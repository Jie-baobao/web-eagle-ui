#!/bin/bash
#
# Web Eagle 素材库软链接设置脚本
# 用于在 Linux 系统下创建素材库软链接到 Web Eagle 根目录
#
# 兼容性：
#   - Eagle 4.x 结构：根目录有 tags.json + metadata.json
#   - Eagle 3.x 结构：.eagle/ 目录下有 tags.json
#
# 使用方法：
#   chmod +x setup_library_link.sh
#   ./setup_library_link.sh
#
# 作者：OpenClaw
# 日期：2026-04-21
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 获取脚本所在目录（Web Eagle 根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_EAGLE_ROOT="$(dirname "$SCRIPT_DIR")"
LINK_NAME="$WEB_EAGLE_ROOT/eagle_library"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     🦅 Web Eagle 素材库软链接设置工具                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Web Eagle 根目录：${NC}$WEB_EAGLE_ROOT"
echo -e "${BLUE}软链接目标位置：${NC}$LINK_NAME"
echo ""

# 函数：检查路径是否在 Web Eagle 根目录或子目录下
is_inside_web_eagle() {
    local target_path="$1"
    local normalized_target="$(cd "$target_path" 2>/dev/null && pwd)"

    # 检查是否是 Web Eagle 根目录或其子目录
    if [[ "$normalized_target" == "$WEB_EAGLE_ROOT"* ]]; then
        return 0  # 在内部
    else
        return 1  # 不在内部
    fi
}

# 函数：验证 Eagle 资源库路径
# 兼容 Eagle 3.x (.eagle/) 和 Eagle 4.x (根目录 tags.json)
validate_eagle_library() {
    local lib_path="$1"

    # 检查目录是否存在
    if [[ ! -d "$lib_path" ]]; then
        echo -e "${RED}❌ 目录不存在：$lib_path${NC}"
        return 1
    fi

    # 检测 Eagle 版本结构
    local eagle_version=""
    local tags_file=""

    # Eagle 4.x 结构：根目录有 tags.json 和 metadata.json
    if [[ -f "$lib_path/tags.json" ]] && [[ -f "$lib_path/metadata.json" ]]; then
        eagle_version="4.x"
        tags_file="$lib_path/tags.json"
        echo -e "${GREEN}✅ 检测到 Eagle 4.x 结构${NC}"
    # Eagle 3.x 结构：.eagle 目录下有 tags.json
    elif [[ -d "$lib_path/.eagle" ]] && [[ -f "$lib_path/.eagle/tags.json" ]]; then
        eagle_version="3.x"
        tags_file="$lib_path/.eagle/tags.json"
        echo -e "${GREEN}✅ 检测到 Eagle 3.x 结构${NC}"
    else
        echo -e "${RED}❌ 未找到有效的 Eagle 资源库结构${NC}"
        echo -e "${YELLOW}   Eagle 4.x 需要：tags.json + metadata.json${NC}"
        echo -e "${YELLOW}   Eagle 3.x 需要：.eagle/tags.json${NC}"
        return 1
    fi

    # 检查 images 目录
    if [[ ! -d "$lib_path/images" ]]; then
        echo -e "${YELLOW}⚠️  未找到 images 目录（可能是空资源库）${NC}"
    fi

    echo -e "${GREEN}✅ 有效的 Eagle 资源库 (v$eagle_version)${NC}"
    return 0
}

# 函数：获取标签数量
# 兼容 Eagle 3.x 和 4.x
get_tags_count() {
    local lib_path="$1"
    local tags_file=""

    # 检测 tags.json 位置
    if [[ -f "$lib_path/tags.json" ]]; then
        tags_file="$lib_path/tags.json"
    elif [[ -f "$lib_path/.eagle/tags.json" ]]; then
        tags_file="$lib_path/.eagle/tags.json"
    else
        echo "0"
        return
    fi

    # 尝试解析 JSON 获取标签数量
    # Eagle 4.x 格式：{"historyTags": [...], "starredTags": [...]}
    # Eagle 3.x 格式：[{"id": "...", "name": "..."}, ...]
    if command -v python3 &> /dev/null; then
        python3 -c "
import json
with open('$tags_file', 'r', encoding='utf-8') as f:
    data = json.load(f)
    # Eagle 4.x 格式
    if isinstance(data, dict) and 'historyTags' in data:
        print(len(data.get('historyTags', [])))
    # Eagle 3.x 格式（数组）
    elif isinstance(data, list):
        print(len(data))
    else:
        print('?')
" 2>/dev/null || echo "?"
    elif command -v python &> /dev/null; then
        python -c "
import json
with open('$tags_file', 'r', encoding='utf-8') as f:
    data = json.load(f)
    if isinstance(data, dict) and 'historyTags' in data:
        print(len(data.get('historyTags', [])))
    elif isinstance(data, list):
        print(len(data))
    else:
        print('?')
" 2>/dev/null || echo "?"
    else
        # 简单统计（不精确）
        grep -o '"id"' "$tags_file" 2>/dev/null | wc -l || echo "?"
    fi
}

# 输入素材库路径
echo -e "${YELLOW}请输入 Eagle 素材库路径：${NC}"
echo -e "${CYAN}（示例：/mnt/nas/EagleLib/我的灵感库）${NC}"
echo ""
read -p "路径: " LIBRARY_PATH

# 去除末尾斜杠
LIBRARY_PATH="${LIBRARY_PATH%/}"

# 检查路径是否为空
if [[ -z "$LIBRARY_PATH" ]]; then
    echo -e "${RED}❌ 路径不能为空${NC}"
    exit 1
fi

# 展开波浪号为家目录
LIBRARY_PATH="${LIBRARY_PATH/#\~/$HOME}"

# 转换为绝对路径
if [[ "$LIBRARY_PATH" != /* ]]; then
    LIBRARY_PATH="$(pwd)/$LIBRARY_PATH"
fi

echo ""
echo -e "${BLUE}检测路径：${NC}$LIBRARY_PATH"
echo ""

# 验证是否为有效的 Eagle 资源库
if ! validate_eagle_library "$LIBRARY_PATH"; then
    echo ""
    echo -e "${YELLOW}提示：请确保输入的是 Eagle 资源库的根目录${NC}"
    echo -e "${YELLOW}      Eagle 4.x：包含 tags.json + metadata.json + images/${NC}"
    echo -e "${YELLOW}      Eagle 3.x：包含 .eagle/tags.json + images/${NC}"
    exit 1
fi

# 获取标签数量
TAGS_COUNT=$(get_tags_count "$LIBRARY_PATH")
echo -e "${GREEN}   检测到 $TAGS_COUNT 个标签${NC}"
echo ""

# 检查是否在 Web Eagle 根目录或子目录下
if is_inside_web_eagle "$LIBRARY_PATH"; then
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ 素材库位于 Web Eagle 目录内部${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}无需创建软链接，直接使用 setup.php 设置目录即可。${NC}"
    echo ""
    echo -e "${YELLOW}请在浏览器中访问 setup.php，设置以下路径：${NC}"
    echo ""
    echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│  素材库路径：${NC}$LIBRARY_PATH"
    echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"
    echo ""
    exit 0
fi

# 素材库不在 Web Eagle 目录内，提示创建软链接
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}素材库不在 Web Eagle 目录内${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}建议创建软链接，让 Web Eagle 可以访问素材库。${NC}"
echo ""

# 检查软链接是否已存在
if [[ -L "$LINK_NAME" ]]; then
    CURRENT_TARGET="$(readlink "$LINK_NAME")"
    echo -e "${YELLOW}⚠️  软链接已存在：$LINK_NAME${NC}"
    echo -e "${YELLOW}   当前指向：$CURRENT_TARGET${NC}"
    echo ""
    echo -e "${CYAN}请选择操作：${NC}"
    echo -e "  ${GREEN}1.${NC} 替换现有软链接（删除旧的，创建新的）"
    echo -e "  ${GREEN}2.${NC} 保留现有软链接（使用现有路径）"
    echo -e "  ${GREEN}3.${NC} 退出（不做任何操作）"
    echo ""
    read -p "选择 [1-3]: " CHOICE

    case $CHOICE in
        1)
            echo ""
            echo -e "${YELLOW}删除现有软链接...${NC}"
            rm "$LINK_NAME"
            ;;
        2)
            echo ""
            echo -e "${GREEN}使用现有软链接路径：${NC}"
            echo ""
            echo -e "${YELLOW}请在 setup.php 中设置以下路径：${NC}"
            echo ""
            echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
            echo -e "${GREEN}│  素材库路径：${NC}$CURRENT_TARGET"
            echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"
            echo ""
            exit 0
            ;;
        3)
            echo -e "${YELLOW}已取消操作${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选择${NC}"
            exit 1
            ;;
    esac
elif [[ -e "$LINK_NAME" ]]; then
    # 存在同名的文件或目录（不是软链接）
    echo -e "${RED}❌ 存在同名的文件或目录：$LINK_NAME${NC}"
    echo -e "${YELLOW}   请手动处理后再运行此脚本${NC}"
    exit 1
fi

# 提供软链接创建选项
echo -e "${CYAN}请选择创建软链接的方式：${NC}"
echo ""
echo -e "  ${GREEN}1.${NC} 创建软链接（推荐）"
echo -e "      ${BLUE}→ 创建软链接 eagle_library -> 素材库路径${NC}"
echo -e "      ${BLUE}→ setup.php 中设置路径为：eagle_library${NC}"
echo ""
echo -e "  ${GREEN}2.${NC} 使用绝对路径（不创建软链接）"
echo -e "      ${BLUE}→ setup.php 中直接使用素材库的绝对路径${NC}"
echo -e "      ${BLUE}→ 适合素材库路径固定不变的场景${NC}"
echo ""
echo -e "  ${GREEN}3.${NC} 创建软链接并使用自定义名称"
echo -e "      ${BLUE}→ 可以自定义软链接名称${NC}"
echo ""
echo -e "  ${GREEN}4.${NC} 退出（不做任何操作）"
echo ""
read -p "选择 [1-4]: " CHOICE

case $CHOICE in
    1)
        echo ""
        echo -e "${YELLOW}创建软链接...${NC}"
        ln -s "$LIBRARY_PATH" "$LINK_NAME"
        echo -e "${GREEN}✅ 软链接创建成功${NC}"
        echo ""
        echo -e "${BLUE}软链接：${NC}$LINK_NAME"
        echo -e "${BLUE}指向：${NC}$LIBRARY_PATH"
        echo ""
        echo -e "${YELLOW}请在 setup.php 中设置以下路径：${NC}"
        echo ""
        echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
        echo -e "${GREEN}│  素材库路径：eagle_library${NC}"
        echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"
        ;;
    2)
        echo ""
        echo -e "${YELLOW}使用绝对路径（不创建软链接）${NC}"
        echo ""
        echo -e "${YELLOW}请在 setup.php 中设置以下路径：${NC}"
        echo ""
        echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
        echo -e "${GREEN}│  素材库路径：${NC}$LIBRARY_PATH"
        echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"
        ;;
    3)
        echo ""
        read -p "请输入软链接名称（默认：eagle_library）: " CUSTOM_NAME
        CUSTOM_NAME="${CUSTOM_NAME:-eagle_library}"

        # 检查名称是否包含路径分隔符
        if [[ "$CUSTOM_NAME" == */* ]]; then
            echo -e "${RED}❌ 名称不能包含路径分隔符${NC}"
            exit 1
        fi

        CUSTOM_LINK="$WEB_EAGLE_ROOT/$CUSTOM_NAME"

        # 检查是否已存在
        if [[ -e "$CUSTOM_LINK" ]]; then
            echo -e "${RED}❌ 已存在同名文件：$CUSTOM_LINK${NC}"
            exit 1
        fi

        echo ""
        echo -e "${YELLOW}创建软链接...${NC}"
        ln -s "$LIBRARY_PATH" "$CUSTOM_LINK"
        echo -e "${GREEN}✅ 软链接创建成功${NC}"
        echo ""
        echo -e "${BLUE}软链接：${NC}$CUSTOM_LINK"
        echo -e "${BLUE}指向：${NC}$LIBRARY_PATH"
        echo ""
        echo -e "${YELLOW}请在 setup.php 中设置以下路径：${NC}"
        echo ""
        echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
        echo -e "${GREEN}│  素材库路径：${NC}$CUSTOM_NAME"
        echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"
        ;;
    4)
        echo -e "${YELLOW}已取消操作${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 设置完成！${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}下一步：${NC}"
echo -e "  1. 在浏览器中访问 ${CYAN}setup.php${NC}"
echo -e "  2. 将上方路径填入「Eagle 资源库路径」输入框"
echo -e "  3. 点击「保存配置」"
echo ""
