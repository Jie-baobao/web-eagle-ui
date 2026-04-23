# 🦅 Web Eagle 部署指南

**基于 Eagle 资源库 JSON 索引的 Web 图片浏览器 — 只需 Nginx + PHP，无需数据库**

---

## 目录

1. [概述](#1-概述)
   - [1.1 架构说明](#11-架构说明)
   - [1.2 不需要数据库](#12-不需要数据库)
   - [1.3 功能特性](#13-功能特性)
2. [运行环境](#2-运行环境)
   - [2.1 PHP 版本](#21-php-版本)
   - [2.2 PHP 扩展](#22-php-扩展)
   - [2.3 检查扩展](#23-检查扩展)
3. [文件权限设置 ⭐](#3-文件权限设置-)
4. [安全配置 ⭐](#4-安全配置-)
5. [宝塔面板部署](#5-宝塔面板部署)
6. [1Panel 部署](#6-1panel-部署)
7. [手动部署（Nginx + PHP-FPM）](#7-手动部署nginx--php-fpm)
8. [配置 Eagle 资源库路径](#8-配置-eagle-资源库路径)
9. [Nginx 性能优化 ⭐](#9-nginx-性能优化-)
10. [大规模数据性能设计 ⭐](#10-大规模数据性能设计-)
11. [安全说明](#11-安全说明)
12. [常见问题](#12-常见问题)
13. [快捷键参考](#13-快捷键参考)

---

## 1. 概述

### 1.1 架构说明

Web Eagle 是一个纯 PHP 程序，工作原理：

1. 读取 Eagle 资源库中的 `.eagle/tags.json` 获取标签列表
2. 读取 `images/{UUID}/{UUID}.info.json` 获取每张图片的标签关联
3. 在前端实现多标签 AND 筛选 + 瀑布流浏览 + 灯箱查看

**程序对 Eagle 资源库的所有访问均为只读，不会修改、创建或删除任何 Eagle 数据。**

Web Eagle **v4.2** 新增 CSRF 保护、Rate Limit 防刷、XSS 防护、动态响应式检测、图片预加载、DOM 内存管理等安全与性能机制。

### 1.2 不需要数据库

| 组件 | 用途 |
|------|------|
| Nginx 或 Apache | Web 服务器 |
| PHP 7.4+ | 后端逻辑 + 图片代理 |
| data/cache.json | 性能缓存（自动生成） |
| eagle_config.php | 配置文件（手动或 Web 设置） |

### 1.3 功能特性

| 功能 | 说明 |
|------|------|
| 瀑布流浏览 | 图片保留原始比例，自适应列数排列 |
| 多标签 AND 筛选 | 空格分隔多个标签，交集筛选 |
| 搜索芯片 | 已选标签显示为芯片，点击 × 移除，超出搜索框宽度时折叠显示 +N 徽章 |
| 动态响应式 | 实时检测窗口宽度变化，PC/移动端逻辑自动切换，平板横竖屏完美适配 |
| 标签管理弹窗 | 点击 +N 打开居中弹窗，可查看、添加、删除搜索词，一键清除全部 |
| 灯箱大图 | 点击缩略图查看原图，图片独立容器不挤压信息栏 |
| 灯箱缩放 | 滚轮缩放以鼠标为中心，+/- 按钮缩放，缩放条显示百分比，移动端支持双指缩放 |
| 图片预加载 | 灯箱切换时预加载相邻图片，切换更流畅，等待时间更短 |
| DOM 内存管理 | 无限滚动时自动清理旧 DOM 节点，防止页面卡顿，支持浏览数万张图片 |
| 快捷键提示 | 打开灯箱时显示快捷键提示，3 秒后淡出消失 |
| 多选下载 | 左上角按钮进入多选模式，顶部栏显示已选数量并批量下载 |
| 分享链接 | HMAC 签名 30 天有效，可分享给他人查看单张图片 |
| 缩略图优先 | 列表加载缩略图，点击后才加载原图，节省带宽 |
| 悬浮提示 | 所有按钮/搜索栏鼠标悬浮显示功能说明和快捷键 |
| 无限滚动 | 向下滚动自动加载下一页，适合大量图片，节省首屏时间 |
| 筛选结果计数 | 底部显示"张匹配"或"张图片"，区分筛选状态 |
| 灯箱加载动画 | 原图加载中显示 spinner，不再空白等待 |
| CSRF 保护 | 所有写操作携带 CSRF token，防跨站请求伪造 |
| Rate Limit 防刷 | 刷新接口同一 IP 最多 5 次 / 10 分钟，超限提示等待 |
| XSS 防护 | 文字 HTML 转义，颜色值严格格式校验（仅允许 hex/rgba/hsl），图片 ID 严格 UUID 校验 |
| 内存泄漏防护 | 事件监听器自动解绑，定时器清理，长时间运行不卡顿 |
| 移动端适配 | 实时检测设备类型，窗口调整自动切换 PC/移动端逻辑，平板横竖屏完美适配 |

---

## 2. 运行环境

### 2.1 PHP 版本

| 项目 | 最低 | 推荐 |
|------|------|------|
| PHP | 7.4 | 8.0+ |
| 内存 | 128MB | 256MB（大图库建议 512MB） |

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
├── .htaccess                       [644 只读] Apache安全规则
├── eagle_config.php                [644 可读写] 配置文件 ← 迁移时复制此文件
├── assets/                         [755 只读] 静态资源目录
│   ├── css/style.css               [644 只读] 样式表
│   └── js/app.js                   [644 只读] 主逻辑
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

# 3. 目录可执行
find . -type d -exec chmod 755 {} \;

# 4. data/ 目录可写
chmod 755 data/
touch data/cache.json
chmod 644 data/cache.json

# 5. 配置文件可读写
touch eagle_config.php
chmod 644 eagle_config.php
```

### 3.3 权限要点

🔒 **权限原则：**
- **程序文件（.php/.css/.js）→ 只读**：防止 Web 漏洞被利用篡改程序
- **eagle_config.php → 可读写**：setup.php 需要写入配置
- **data/cache.json → 可读写**：API 需要写入缓存
- **Eagle 资源库 → 只读**：程序绝不写入 Eagle 数据

---

## 4. 安全配置 ⭐

### 4.1 访问密码

外网部署时**强烈建议**设置密码，防止未授权访问。

1. 访问 `setup.php` → 在"访问密码"区域设置密码
2. 设置后，访问主页面需要先登录
3. 修改密码：再次访问 setup.php 输入新密码
4. 取消密码：清空密码字段并保存

⚠️ **密码安全**：当前密码以明文保存在 eagle_config.php 中。此文件为 .php 后缀，无法通过 HTTP 下载。建议：
- 使用不与其他服务相同的密码
- 生产环境配合 HTTPS 使用

### 4.2 Eagle 数据只读保证

| 操作 | 读取 | 写入 |
|------|------|------|
| tags.json | ✅ | ❌ |
| tagGroups.json | ✅ | ❌ |
| .info.json | ✅ | ❌ |
| 图片文件 | ✅（代理输出） | ❌ |
| 缩略图 | ✅（代理输出） | ❌ |

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
    add_header X-XSS-Protection "1; mode=block";

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

## 5. 宝塔面板部署

### 5.1 创建网站

1. 宝塔面板 → 网站 → 添加站点
2. 域名：填 IP:端口（如 `192.168.1.100:8080`）或域名
3. PHP 版本：选择 PHP 8.0 或以上
4. 记住根目录路径

### 5.2 上传文件

将 web_eagle 文件夹内**所有文件**上传到网站根目录。

### 5.3 设置权限

```bash
cd /www/wwwroot/web_eagle
chown -R www:www .
find . -type d -exec chmod 755 {} \;
find . -type f -name "*.php" -exec chmod 644 {} \;
mkdir -p data
chmod 755 data
touch data/cache.json eagle_config.php
chmod 644 data/cache.json eagle_config.php
```

### 5.4 PHP 配置

1. 宝塔 → 软件商店 → PHP → 安装扩展 → 安装 `fileinfo` 和 `mbstring`
2. 禁用函数 → 确保 `scandir, readfile, file_get_contents, mkdir, session_start` 未被禁用
3. 配置修改 → `memory_limit = 256M`

### 5.5 开放 SMB 目录访问

如果 Eagle 资源库在 SMB 挂载目录上：

```ini
; 修改 open_basedir，添加挂载目录
open_basedir = /www/wwwroot/:/tmp/:/mnt/nas/
```

⚠️ 修改 open_basedir 后需重启 PHP。

---

## 6. 1Panel 部署

### 6.1 创建运行环境

1. 1Panel → 网站 → 运行环境 → 创建 → PHP 8.0+
2. 创建网站 → 选择 PHP 环境
3. 上传文件到网站根目录
4. 进入 PHP 容器设置权限

### 6.2 挂载 Eagle 资源库

1. 容器 → PHP 容器 → 编辑 → 添加存储卷映射
2. `/mnt/nas/EagleLib` → `/eagle_lib`
3. setup.php 中输入容器内路径：`/eagle_lib/我的素材库`

---

## 7. 手动部署（Nginx + PHP-FPM）

```bash
# 1. 复制文件
sudo cp -r web_eagle /var/www/web_eagle

# 2. 设置权限
sudo chown -R www-data:www-data /var/www/web_eagle
cd /var/www/web_eagle
find . -type d -exec chmod 755 {} \;
find . -type f -name "*.php" -exec chmod 644 {} \;
mkdir -p data
chmod 755 data
touch data/cache.json eagle_config.php
chmod 644 data/cache.json eagle_config.php

# 3. Nginx 配置（见第 4.3 节）

# 4. 重启
sudo systemctl restart nginx php8.1-fpm
```

---

## 8. 配置 Eagle 资源库路径

### 8.1 通过 Web 界面（推荐）

1. 浏览器访问 `http://你的地址/setup.php`
2. 输入 Eagle 资源库完整路径
3. （可选）设置访问密码
4. 点击"保存配置"

### 8.2 手动编辑 eagle_config.php

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

### 8.3 迁移设备

只需复制 `eagle_config.php` 和整个 `web_eagle/` 目录，重新设置权限，修改路径即可。`data/cache.json` 不需要迁移，首次访问自动重建。

---

## 9. Nginx 性能优化 ⭐

目标：**最低性能，最稳定运行**。适用于飞牛 NAS、低配 VPS、树莓派等资源受限设备。

### 9.1 最低性能稳定运行配置

```nginx
server {
    listen 8080;
    server_name _;
    root /var/www/web_eagle;
    index index.php;

    # 安全：禁止访问敏感文件
    location ~* eagle_config\.php$ { deny all; }
    location /data/                { deny all; }
    location ~ /\.                 { deny all; }

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;

    # Gzip 压缩（只压缩文本，图片不需要）
    gzip on;
    gzip_types text/css application/javascript application/json;
    gzip_min_length 1024;
    gzip_comp_level 4;

    # PHP 处理
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_read_timeout 60s;
    }

    # 静态资源：强缓存 + 不可变
    location ~* \.(css|js)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}

# 全局优化（放在 http {} 块内）
keepalive_timeout 65;
keepalive_requests 100;
access_log off;
client_max_body_size 1m;
```

💡 **关键优化点：**
- `access_log off`：关闭日志 = 减少 50% 磁盘 IO
- `gzip_min_length 1024`：小于 1KB 的文件不压缩，省 CPU
- `gzip_comp_level 4`：压缩级别 4 是性能/压缩最佳平衡点
- `immutable`：告诉浏览器资源不会变，不再发条件请求

### 9.2 PHP-FPM 低资源配置

```ini
; /etc/php/8.x/fpm/pool.d/www.conf

; 进程管理：固定数量
pm = static
pm.max_children = 2              ; 只有自己用，2 个进程足够

; 内存限制
php_admin_value[memory_limit] = 256M

; 空闲进程回收
pm.max_requests = 500            ; 处理 500 请求后重启进程

; 慢日志（排查卡顿用）
request_slowlog_timeout = 5s
slowlog = /var/log/php-fpm-slow.log

; 关闭不必要的功能
php_admin_value[expose_php] = off
```

---

## 10. 大规模数据性能设计 ⭐

### 10.1 设计思路

解决方案：**分层 API + 客户端分批加载**

| 层 | 数据 | 触发时机 | 体积 |
|------|------|------|------|
| 瀑布流 | 当前页缩略图 + 元数据 | 页面加载 + 滚动触发 | 每页 N 张元数据 |
| 灯箱 ID 列表 | 全部筛选结果的轻量元数据 | 首次开灯箱时（后台） | 几千个 ID，约几百 KB |
| 图片代理 | 实际二进制文件 | 懒加载（缩略图+原图） | 按需加载 |

### 10.2 分层 API 设计

```
api.php?action=images       ← 分页图片列表（per_page 控制，默认 60）
api.php?action=image_ids    ← 灯箱专用：全部筛选结果的 ID
api.php?action=image_proxy  ← 图片二进制代理
api.php?action=tags         ← 标签列表（含预计算统计数）
api.php?action=refresh      ← 重建全量缓存（需 CSRF token）
api.php?action=csrf_token   ← 获取 CSRF token
api.php?action=status       ← 进程状态检查
```

### 10.3 缓存实时性

| 场景 | 表现 |
|------|------|
| 首次访问 | 自动构建缓存，5000 张约需 10-30 秒 |
| 后续访问 | 直接读 cache.json，无需再次扫描 |
| Eagle 新增图片 | 界面显示警告，点击右上角 🔄 重新构建缓存 |
| Eagle 删除图片 | 缓存不会自动清理，下次刷新时重建 |

---

## 11. 安全说明

### 11.1 CSRF 保护

所有写操作（`refresh` 接口）均需要携带 CSRF token：

```
GET /api.php?action=csrf_token
→ {"success":true,"data":{"token":"xxxxxxxxxxxx..."}}

POST /api.php?action=refresh
X-CSRF-Token: xxxxxxxxxxxx...
```

### 11.2 Rate Limit 防刷

`refresh` 接口有请求频率限制：**同一 IP 最多 5 次 / 10 分钟**。超出后返回 429 状态码。

### 11.3 XSS 防护

- 所有用户可见的文字内容（图片名称、标签名）均经过 HTML 转义后输出
- 颜色值经过严格格式校验，只允许合法 `#fff` / `#ffffff` / `rgb()` / `rgba()` / `hsl()` 值
- 图片 ID 使用严格 UUID 格式（8-4-4-4-12 小写十六进制）校验

### 11.4 生产环境安全建议

| 措施 | 说明 |
|------|------|
| 启用 HTTPS | 强烈建议。外网访问时明文密码存在被截获风险 |
| 设置访问密码 | setup.php 中设置密码后，所有 API 和页面均需认证 |
| Nginx 安全头 | 已添加 `X-Content-Type-Options: nosniff` 和 `X-Frame-Options: SAMEORIGIN` |
| Rate Limit | 刷新接口：同一 IP 最多 5 次 / 10 分钟，超限返回 429 |
| 定期更新 | 关注 Web Eagle 更新，及时修补潜在安全漏洞 |

---

## 12. 常见问题

### ❓ 页面空白 / 500 错误

- 检查 PHP 版本 ≥ 7.4
- 检查 `data/` 目录是否可写
- 查看 PHP 错误日志：`/var/log/php-fpm/error.log`

### ❓ "未找到 .eagle 目录"

- 确认输入的是 Eagle **资源库**根目录，不是 Eagle 软件安装目录
- 目录下应有 `.eagle/` 和 `images/` 子目录

### ❓ 图片加载失败

- 检查 PHP 对图片目录是否有读取权限
- SMB 挂载目录：确保 PHP 运行用户有权限
- 宝塔 open_basedir 限制

### ❓ 加载很慢

- 首次加载需要扫描所有 .info.json 构建缓存
- 后续使用缓存，速度正常
- 远程访问：减小 `per_page` 为 30

### ❓ 忘记密码

- 编辑 `eagle_config.php`，将 `'password'` 改为空字符串

### ❓ 和 Eagle 同时使用会冲突吗

- 不会。Web Eagle 只读取 JSON，不写入任何 Eagle 数据
- Eagle 新增图片后点 🔄 刷新缓存

---

## 13. 快捷键参考

| 操作 | 快捷键 | 说明 |
|------|------|------|
| 上一张图片 | `←` 或 `↑` | 灯箱内翻页 |
| 下一张图片 | `→` 或 `↓` | 灯箱内翻页 |
| 关闭灯箱 | `Esc` | 返回瀑布流 |
| 下载原图 | `Ctrl` + `S` | 保存原图到本地 |
| 复制链接 | `Ctrl` + `C` | 图片 URL 复制到剪贴板 |
| 拖拽下载 | 鼠标拖拽 | 拖大图到桌面/文件夹 |
| 右键保存 | 右键 → 另存为 | 浏览器原生保存 |

---

**Web Eagle v4.2 | 2026-04-24 | 动态响应式 + 图片预加载 + DOM内存管理 + XSS严格校验 + 内存泄漏防护**
