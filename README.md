# 🦅 Web Eagle 部署指南

基于 Eagle 资源库 JSON 索引的 Web 图片浏览器 — 只需 Nginx + PHP，无需数据库

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. 运行环境](#2-运行环境)
- [3. 文件权限设置](#3-文件权限设置-)
- [4. 安全配置](#4-安全配置-)
- [5. 部署指南](#5-部署指南)
- [6. 配置 Eagle 资源库路径](#6-配置-eagle-资源库路径)
- [7. Nginx 性能优化](#7-nginx-性能优化-)
- [8. 大规模数据性能设计](#8-大规模数据性能设计-)
- [9. 安全说明](#9-安全说明)
- [10. 常见问题](#10-常见问题)
- [11. 快捷键参考](#11-快捷键参考)

---

## 1. 概述

### 1.1 架构说明

Web Eagle 是一个纯 PHP 程序，工作原理：

1. 读取 Eagle 资源库中的 `.eagle/tags.json` 获取标签列表
2. 读取 `images/{UUID}/{UUID}.info.json` 获取每张图片的标签关联
3. 在前端实现多标签 AND 筛选 + 瀑布流浏览 + 灯箱查看

> ⚠️ **重要**：程序对 Eagle 资源库的所有访问均为**只读**，不会修改、创建或删除任何 Eagle 数据。

Web Eagle v4.1 新增 CSRF 保护、Rate Limit 防刷、XSS 防护等安全机制。

### 1.2 不需要数据库

| 组件 | 用途 |
|------|------|
| Nginx 或 Apache | Web 服务器 |
| PHP 7.4+ | 后端逻辑 + 图片代理 |
| data/cache.json | 性能缓存（自动生成） |
| eagle_config.php | 配置文件 |

### 1.3 功能特性

| 功能 | 说明 |
|------|------|
| 瀑布流浏览 | 图片保留原始比例，自适应列数排列 |
| 多标签 AND 筛选 | 空格分隔多个标签，交集筛选 |
| 搜索芯片 | 已选标签显示为芯片，点击 × 移除，超过 3 个折叠显示 +N 徽章 |
| 标签管理弹窗 | 点击 +N 打开居中弹窗，可查看、添加、删除搜索词 |
| 灯箱大图 | 点击缩略图查看原图，图片独立容器不挤压信息栏 |
| 灯箱缩放 | 滚轮缩放以鼠标为中心，+/- 按钮缩放，缩放条显示百分比 |
| 快捷键提示 | 打开灯箱时显示快捷键提示，3 秒后淡出消失 |
| 多选下载 | 左上角按钮进入多选模式，顶部栏显示已选数量并批量下载 |
| 分享链接 | HMAC 签名 30 天有效，可分享给他人查看单张图片 |
| 缩略图优先 | 列表加载缩略图，点击后才加载原图，节省带宽 |
| 悬浮提示 | 所有按钮/搜索栏鼠标悬浮显示功能说明和快捷键 |
| 无限滚动 | 向下滚动自动加载下一页，适合大量图片 |
| 筛选结果计数 | 底部显示"张匹配"或"张图片"，区分筛选状态 |
| 灯箱加载动画 | 原图加载中显示 spinner，不再空白等待 |
| CSRF 保护 | 所有写操作携带 CSRF token，防跨站请求伪造 |
| Rate Limit 防刷 | 刷新接口同一 IP 最多 5 次 / 10 分钟 |
| XSS 防护 | 文字 HTML 转义，颜色值格式校验，图片 ID 严格 UUID 校验 |
| 移动端适配 | < 540px 隐藏侧边栏，灯箱按钮适配小屏 |

---

## 2. 运行环境

### 2.1 PHP 版本

| 项目 | 最低 | 推荐 |
|------|------|------|
| PHP | 7.4 | 8.0+ |
| 内存 | 128MB | 256MB（大图库建议 512MB）|

### 2.2 PHP 扩展

| 扩展 | 必需 | 用途 |
|------|------|------|
| `json` | ✅ 是 | 解析 Eagle 的 JSON 索引文件 |
| `fileinfo` | ✅ 是 | 图片 MIME 类型检测 |
| `mbstring` | ⚠️ 推荐 | 中文标签名正确处理 |
| `session` | ⚠️ 推荐 | 密码登录功能需要 |
| `gd` | ❌ 否 | 预留，当前未使用 |

### 2.3 检查扩展

```bash
php -m | grep -E "json|fileinfo|mbstring|session"
```

或在浏览器访问 `api.php?action=status` 查看扩展状态。

---

## 3. 文件权限设置 ⭐

### 3.1 目录结构与权限

```
web_eagle/                          [755 可读写执行]
├── index.php                       [644 只读] 主页面
├── api.php                         [644 只读] API接口
├── config.php                      [644 只读] 配置类
├── login.php                       [644 只读] 登录页
├── setup.php                       [644 只读] 设置页
├── share.php                       [644 只读] 分享页
├── eagle_config.php                [644 可读写] 配置文件
├── setup_library_link.sh           [755 可执行] 软链接脚本
├── assets/                         [755 只读] 静态资源
│   ├── css/style.css
│   └── js/app.js
├── data/                           [755 可读写] 缓存目录
│   └── cache.json                  [644 可读写] 性能缓存
└── README.html                     [644 只读] 部署指南
```

### 3.2 权限设置命令

```bash
# 假设 web_eagle 部署在 /var/www/web_eagle
cd /var/www/web_eagle

# 1. 设置所有者为 PHP 运行用户
chown -R www-data:www-data .

# 2. 程序文件只读
find . -type f -name "*.php" -exec chmod 644 {} \;
find . -type f -name "*.css" -exec chmod 644 {} \;
find . -type f -name "*.js" -exec chmod 644 {} \;
find . -type f -name ".htaccess" -exec chmod 644 {} \;

# 3. 目录可执行
find . -type d -exec chmod 755 {} \;

# 4. data/ 目录可写（缓存写入）
chmod 755 data/
touch data/cache.json 2>/dev/null
chmod 644 data/cache.json 2>/dev/null

# 5. 配置文件可读写
touch eagle_config.php 2>/dev/null
chmod 644 eagle_config.php 2>/dev/null
```

### 3.3 权限要点

> 🔒 **权限原则**：
> - **程序文件（.php/.css/.js）→ 只读**：防止 Web 漏洞被利用篡改程序
> - **eagle_config.php → 可读写**：setup.php 需要写入配置
> - **data/cache.json → 可读写**：API 需要写入缓存
> - **Eagle 资源库 → 只读**：程序绝不写入 Eagle 数据

---

## 4. 安全配置 ⭐

### 4.1 访问密码

外网部署时**强烈建议**设置密码，防止未授权访问。

1. 访问 `setup.php` → 在"访问密码"区域设置密码
2. 设置后，访问主页面需要先登录
3. 修改密码：再次访问 setup.php 输入新密码
4. 取消密码：清空密码字段并保存

> ⚠️ **密码安全**：当前密码以明文保存在 eagle_config.php 中。建议使用不与其他服务相同的密码，生产环境配合 HTTPS 使用。

### 4.2 Eagle 数据只读保证

| 操作 | 读取 | 写入 |
|------|------|------|
| tags.json | ✅ | ❌ |
| tagGroups.json | ✅ | ❌ |
| .info.json | ✅ | ❌ |
| 图片文件 | ✅ | ❌ |
| 缩略图 | ✅ | ❌ |

程序唯一写入的文件：`data/cache.json` 和 `eagle_config.php`。

### 4.3 Nginx 安全规则

```nginx
server {
    listen 8080;
    server_name _;
    root /var/www/web_eagle;
    index index.php;

    # 禁止访问配置文件
    location ~* eagle_config\.php$ {
        deny all;
    }

    # 禁止访问 data 目录
    location /data/ {
        deny all;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;

    # PHP 处理
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # 静态资源缓存
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|webp)$ {
        expires 7d;
    }
}
```

### 4.4 Apache 安全规则

已内置 `.htaccess`，包含：禁止访问 eagle_config.php、data/ 目录、.json 文件，以及安全响应头。

---

## 5. 部署指南

### 5.1 宝塔面板部署

1. **创建网站**：宝塔面板 → 网站 → 添加站点 → 填入域名或 IP:端口
2. **上传文件**：将 web_eagle 文件夹内所有文件上传到网站根目录
3. **设置权限**：参考 3.2 节
4. **PHP 配置**：安装 `fileinfo` 和 `mbstring` 扩展，禁用函数确保 `scandir, readfile, file_get_contents, mkdir, session_start` 未被禁用

### 5.2 1Panel 部署

1. 1Panel → 网站 → 运行环境 → 创建 → PHP 8.0+
2. 创建网站 → 选择 PHP 环境
3. 上传文件到网站根目录
4. 进入 PHP 容器设置权限

### 5.3 手动部署（Nginx + PHP-FPM）

```bash
# 1. 复制文件
sudo cp -r web_eagle /var/www/web_eagle

# 2. 设置权限（见 3.2 节）

# 3. Nginx 配置（见 4.3 节）

# 4. 重启
sudo systemctl restart nginx php8.1-fpm
```

---

## 6. 配置 Eagle 资源库路径

### 6.1 通过 Web 界面（推荐）

1. 浏览器访问 `http://你的地址/setup.php`
2. 输入 Eagle 资源库完整路径
3. （可选）设置访问密码
4. 点击"保存配置"

### 6.2 手动编辑 eagle_config.php

```php
<?php
defined('WEB_EAGLE') or die('No direct access');

return array (
  'eagle_path' => '/mnt/nas/EagleLib/我的素材库',
  'password' => 'your_password',    // 留空 = 不需要密码
  'per_page' => 60,                 // 每页图片数
);
```

| 场景 | 路径 |
|------|------|
| Linux 本地 | `/home/user/EagleLib/我的素材库` |
| SMB 挂载 | `/mnt/nas/EagleLib/我的素材库` |
| Docker 容器 | `/eagle_lib/我的素材库` |
| Windows | `D:/EagleLib/我的素材库` |

### 6.3 迁移设备

只需复制 `eagle_config.php` 和整个 `web_eagle/` 目录，重新设置权限，修改路径即可。`data/cache.json` 不需要迁移，首次访问自动重建。

### 6.4 Linux 软链接设置脚本（辅助工具）

当 Eagle 素材库不在 Web Eagle 目录内时，可以使用 `setup_library_link.sh` 脚本辅助创建软链接。

```bash
# 使用方法
chmod +x setup_library_link.sh
./setup_library_link.sh
```

> 💡 **使用场景**：素材库在 NAS 挂载目录、素材库在其他磁盘分区、不想修改 eagle_config.php 中的绝对路径

---

## 7. Nginx 性能优化 ⭐

### 7.1 关键优化点

| 优化项 | 效果 |
|--------|------|
| `access_log off` | 减少 50% 磁盘 IO |
| `gzip on` (level 4) | CSS/JS 体积减少 70% |
| `pm.max_children = 2` | 内存占用从 400MB 降至 80MB |
| 静态资源 30d + immutable | 二次访问零请求 |
| 图片直出 | CPU 占用降 80% |

### 7.2 PHP-FPM 低资源配置

```ini
; /etc/php/8.x/fpm/pool.d/www.conf

pm = static
pm.max_children = 2              ; 只有自己用，2 个进程足够
pm.max_requests = 500            ; 处理 500 请求后重启进程
```

> 💡 **为什么 2 个进程够用？** 你一个人用，同时最多 1 个请求在处理。

### 7.3 Nginx 直出图片（可选）

默认方案图片走 PHP 代理。如需启用 Nginx 直出，修改 `app.js` 中的图片 URL 路径。

> ⚠️ **注意**：当前版本默认使用 PHP 代理，开箱即用。如果你不确定，先不要改。

---

## 8. 大规模数据性能设计 ⭐

### 8.1 设计思路

| 层 | 数据 | 触发时机 |
|----|------|----------|
| 瀑布流 | 当前页缩略图 + 元数据 | 页面加载 + 滚动触发 |
| 灯箱 ID 列表 | 全部筛选结果的轻量元数据 | 首次开灯箱时（后台） |
| 图片代理 | 实际二进制文件 | 懒加载 |

### 8.2 API 设计

| API | 用途 |
|-----|------|
| `api.php?action=images` | 分页图片列表 |
| `api.php?action=image_ids` | 灯箱专用：全部筛选结果 ID |
| `api.php?action=image_proxy` | 图片二进制代理 |
| `api.php?action=tags` | 标签列表 |
| `api.php?action=refresh` | 重建全量缓存（需 CSRF token）|
| `api.php?action=csrf_token` | 获取 CSRF token |

### 8.3 缓存实时性

| 场景 | 表现 |
|------|------|
| 首次访问 | 自动构建缓存，5000 张约需 10-30 秒 |
| 后续访问 | 直接读 cache.json，无需再次扫描 |
| Eagle 新增图片 | 点右上角 🔄 重新构建缓存 |

> 💡 **缓存预计算优化**：构建缓存时一次性统计所有标签下的图片数量，后续请求 tags API 时直接读取，不再遍历图片列表。5000 张图片的标签统计：从 **O(n) 每次请求**优化为 **O(1)**。

---

## 9. 安全说明

### 9.1 CSRF 保护

所有写操作（`refresh` 接口）均需要携带 CSRF token：

```javascript
// 首次访问页面后，前端自动获取 token
GET /api.php?action=csrf_token
→ {"success":true,"data":{"token":"xxxxxxxxxxxx..."}}

// 写操作时在 HTTP 头中附带
POST /api.php?action=refresh
X-CSRF-Token: xxxxxxxxxxxx...
```

### 9.2 Rate Limit 防刷

`refresh` 接口有请求频率限制：**同一 IP 最多 5 次 / 10 分钟**。超出后返回 429 状态码。

### 9.3 XSS 防护

- 所有用户可见的文字内容均经过 HTML 转义
- 颜色值经过格式校验，只允许合法 hex/rgb/rgba/hsl 值
- 图片 ID 使用严格 UUID 格式校验

### 9.4 生产环境安全建议

| 措施 | 说明 |
|------|------|
| 启用 HTTPS | 强烈建议，外网访问时明文密码存在被截获风险 |
| 设置访问密码 | setup.php 中设置密码后，所有 API 均需认证 |
| Nginx 安全头 | 已添加 X-Content-Type-Options 和 X-Frame-Options |
| Rate Limit | 刷新接口 5 次 / 10 分钟 |
| 定期更新 | 关注 Web Eagle 更新 |

---

## 10. 常见问题

### ❓ 页面空白 / 500 错误
- 检查 PHP 版本 ≥ 7.4
- 检查 `data/` 目录是否可写
- 查看 PHP 错误日志

### ❓ "未找到 .eagle 目录"
- 确认输入的是 Eagle **资源库**根目录
- 目录下应有 `.eagle/` 和 `images/` 子目录

### ❓ 图片加载失败
- 检查 PHP 对图片目录是否有读取权限
- SMB 挂载目录：确保 PHP 运行用户有权限

### ❓ 加载很慢
- 首次加载需要扫描所有 .info.json 构建缓存
- 远程访问：减小 `per_page` 为 30

### ❓ 忘记密码
- 编辑 `eagle_config.php`，将 `'password'` 改为空字符串

### ❓ 和 Eagle 同时使用会冲突吗
- 不会。Web Eagle 只读取 JSON，不写入任何 Eagle 数据

---

## 11. 快捷键参考

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| 上一张图片 | `←` 或 `↑` | 灯箱内翻页 |
| 下一张图片 | `→` 或 `↓` | 灯箱内翻页 |
| 关闭灯箱 | `Esc` | 返回瀑布流 |
| 下载图片 | `Ctrl + S` | 保存原图到本地 |
| 复制链接 | `Ctrl + C` | 复制分享链接 |
| 缩放图片 | `Ctrl + 滚轮` | 以鼠标为中心缩放 |

---

## 📝 更新日志

- **v6.1** (2026-04-21)：缩放条移至头部、键盘 ↑↓ 支持
- **v6** (2026-04-21)：快捷键提示、灯箱布局优化、拖动方向修复
- **v5** (2026-04-20)：标签管理模态窗口、滚轮缩放优化
- **v4.1** (2026-04-20)：CSRF + RateLimit + XSS 防护

---

## 📄 许可证

本程序由 OpenClaw 基于 Eagle 4.0.0 Build28 (20260401) 数据结构开发。

> Web Eagle v6.1 | 2026-04-21 | 无限滚动 + 灯箱轻量 API + CSRF + RateLimit + XSS 防护
