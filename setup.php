<?php
/**
 * Web Eagle - 设置页面
 * 配置 Eagle 资源库路径 + 访问密码
 * 配置保存到 eagle_config.php（PHP文件，迁移时直接复制即可）
 */
defined('WEB_EAGLE') or define('WEB_EAGLE', true);
require_once __DIR__ . '/config.php';

EagleAuth::start();

$message = '';
$messageType = '';

// AJAX 路径验证
if (isset($_GET['ajax_check'])) {
    $path = $_GET['path'] ?? '';
    $config = new EagleConfig();
    $result = $config->validatePath($path);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;
}

// 处理表单提交
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $config = new EagleConfig();
    $path = $_POST['eagle_path'] ?? '';
    $password = $_POST['password'] ?? '';
    $passwordConfirm = $_POST['password_confirm'] ?? '';

    $saveData = [];

    // 验证路径
    if (!empty($path)) {
        $validation = $config->validatePath($path);
        if ($validation['valid']) {
            $saveData['eagle_path'] = str_replace('\\', '/', rtrim($path, '/\\'));
        } else {
            $message = '❌ ' . $validation['error'];
            $messageType = 'error';
        }
    }

    // 处理密码
    if (empty($message)) {
        if ($password === '' && $passwordConfirm === '') {
            // 两个都留空 = 不修改密码
        } elseif ($password !== '' && $password === $passwordConfirm) {
            $saveData['password'] = $password;
        } elseif ($password !== $passwordConfirm) {
            $message = '❌ 两次密码输入不一致';
            $messageType = 'error';
        } elseif ($password !== '' && $passwordConfirm === '') {
            $message = '❌ 请确认密码';
            $messageType = 'error';
        }
    }

    // 性能设置（只更新本次提交的值，不动的字段不覆盖）
    $saveData['per_page'] = max(10, min(500, intval($_POST['per_page'] ?? 60)));

    // 滚动方式：radio，提交的是 "1" 或 "0"，默认 true
    $infiniteVal = $_POST['infinite_scroll'] ?? '1';
    $saveData['infinite_scroll'] = ($infiniteVal === '1');
    $saveData['lightbox_preload'] = ($infiniteVal === '1'); // 和无限滚动绑定，一起开关

    $cacheAge = intval($_POST['cache_warning_age'] ?? 86400);
    if ($cacheAge >= 3600) $saveData['cache_warning_age'] = min(604800, $cacheAge);

    if (empty($message) && !empty($saveData)) {
        $config->save($saveData);

        // 如果修改了路径，重建缓存（buildCache 现在在 config.php 中，无需引入 api.php）
        if (isset($saveData['eagle_path'])) {
            $result = buildCache($config, $saveData['eagle_path']);
            $message = '✅ 配置保存成功！已扫描到 ' . ($result['count'] ?? 0) . ' 张图片。';
        } else {
            $message = '✅ 配置保存成功！';
        }
        $messageType = 'success';
    } elseif (empty($message) && empty($saveData)) {
        $message = '❌ 没有修改任何配置';
        $messageType = 'error';
    }
}

$config = new EagleConfig();
$currentPath = $config->getEaglePath();
$isConfigured = $config->isConfigured();
$hasPassword = $config->hasPassword();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Eagle - 设置</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f0f1a;
            color: #e0e0e0;
            min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
        }
        .setup-card {
            background: #1a1a2e;
            border-radius: 16px;
            padding: 40px;
            max-width: 640px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        h1 {
            font-size: 24px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle { color: #888; margin-bottom: 28px; font-size: 13px; }
        .form-section {
            margin-bottom: 28px;
            padding-bottom: 24px;
            border-bottom: 1px solid #252540;
        }
        .form-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .form-section h2 { font-size: 16px; color: #a0a0cc; margin-bottom: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 6px; font-weight: 500; color: #bbb; font-size: 13px; }
        .form-group input {
            width: 100%; padding: 10px 14px; border: 1px solid #333; border-radius: 8px;
            background: #0f0f1a; color: #e0e0e0; font-size: 14px;
            transition: border-color 0.2s;
        }
        .form-group input:focus { outline: none; border-color: #667eea; }
        .hint { margin-top: 6px; font-size: 12px; color: #666; line-height: 1.8; }
        .hint code { background: #252540; padding: 1px 6px; border-radius: 4px; color: #a0a0cc; font-size: 12px; }
        .btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 10px 24px; border: none; border-radius: 8px;
            font-size: 14px; cursor: pointer; transition: all 0.2s;
        }
        .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-secondary { background: #252540; color: #bbb; }
        .btn-secondary:hover { background: #333; }
        .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .message.success { background: #1a3a2a; color: #4caf50; border: 1px solid #2a5a3a; }
        .message.error { background: #3a1a1a; color: #ef5350; border: 1px solid #5a2a2a; }
        .validation-result { margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: none; }
        .validation-result.valid { display: block; background: #1a3a2a; color: #4caf50; }
        .validation-result.invalid { display: block; background: #3a1a1a; color: #ef5350; }
        .status-row { display: flex; gap: 20px; margin-top: 16px; font-size: 12px; color: #888; }
        .status-row span { color: #4caf50; font-weight: 500; }
        .security-note {
            background: #1a2a3a; border-left: 3px solid #667eea;
            padding: 10px 14px; margin-top: 8px; border-radius: 0 6px 6px 0;
            font-size: 12px; color: #8ab4f8; line-height: 1.7;
        }
        .actions { display: flex; gap: 12px; align-items: center; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="setup-card">
        <h1>🦅 Web Eagle 设置</h1>
        <p class="subtitle">配置保存在 eagle_config.php，迁移设备时复制此文件即可保留设置</p>

        <?php if ($message): ?>
        <div class="message <?= $messageType ?>"><?= htmlspecialchars($message) ?></div>
        <?php endif; ?>

        <form method="POST" id="setupForm">
            <!-- 资源库路径 -->
            <div class="form-section">
                <h2>📂 Eagle 资源库路径</h2>
                <div class="form-group">
                    <label>资源库根目录（只读访问）</label>
                    <input type="text" name="eagle_path" id="eagle_path"
                           value="<?= htmlspecialchars($currentPath) ?>"
                           placeholder="请输入 Eagle 资源库的完整路径">
                    <div class="hint">
                        路径示例：<br>
                        Linux: <code>/home/user/EagleLib/我的素材库</code><br>
                        SMB 挂载: <code>/mnt/nas/EagleLib/我的素材库</code><br>
                        Docker: <code>/eagle_lib/我的素材库</code>（容器内路径）<br>
                        Windows: <code>D:/EagleLib/我的素材库</code><br><br>
                        💡 打开 Eagle → 右上角菜单 → 资源库 → 右键 → 打开所在文件夹 → 复制路径
                    </div>
                    <div class="validation-result" id="validationResult"></div>
                </div>
                <div class="security-note">
                    🔒 程序对 Eagle 资源库只做<b>只读访问</b>，不会修改或删除任何 Eagle 数据。
                </div>
            </div>

            <!-- 访问密码 -->
            <div class="form-section">
                <h2>🔑 访问密码（可选）</h2>
                <div class="form-group">
                    <label>设置密码</label>
                    <input type="password" name="password" placeholder="<?= $hasPassword ? '留空=不修改当前密码' : '留空=无需密码即可访问' ?>">
                </div>
                <div class="form-group">
                    <label>确认密码</label>
                    <input type="password" name="password_confirm" placeholder="再次输入密码">
                </div>
                <div class="security-note">
                    🔒 设置密码后，访问主页面和 API 都需要先登录。<br>
                    外网部署时<b>强烈建议</b>设置密码，防止未授权访问。<br>
                    密码以明文保存在 eagle_config.php 中（仅服务器可读），请定期更换。
                </div>
            </div>

            <!-- 性能设置 -->
            <div class="form-section">
                <h2>⚡ 性能与显示设置</h2>
                <div class="form-group">
                    <label>每页图片数量</label>
                    <input type="number" name="per_page" min="10" max="500" step="10"
                           value="<?= htmlspecialchars((string)($config->get('per_page', 60))) ?>"
                           placeholder="默认 60">
                    <div class="hint">
                        范围：10-500。数值越小初始加载越快，适合远程访问。<br>
                        <code>30</code> — 远程访问推荐（节省带宽）<br>
                        <code>60</code> — 本地网络推荐（平衡体验）<br>
                        <code>120</code> — 本地高速网络（一次看更多）
                    </div>
                </div>

                <div class="form-group">
                    <label>滚动加载方式</label>
                    <div style="display:flex;gap:12px;margin-top:6px;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="infinite_scroll" value="1"
                                   <?= $config->get('infinite_scroll', true) ? 'checked' : '' ?>>
                            <span style="font-size:13px;">♾️ 无限滚动（推荐）</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="infinite_scroll" value="0"
                                   <?= !$config->get('infinite_scroll', true) ? 'checked' : '' ?>>
                            <span style="font-size:13px;">📄 传统分页</span>
                        </label>
                    </div>
                    <div class="hint">
                        <b>无限滚动</b>：向下滚动自动加载下一页，适合大量图片。<br>
                        <b>传统分页</b>：固定每页数量，手动翻页，适合固定显示区域。
                    </div>
                </div>

                <div class="form-group">
                    <label>灯箱图片列表</label>
                    <div style="display:flex;gap:12px;margin-top:6px;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="lightbox_preload" value="1"
                                   <?= $config->get('lightbox_preload', true) ? 'checked' : '' ?>>
                            <span style="font-size:13px;">✅ 预加载全部筛选结果（推荐）</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="lightbox_preload" value="0"
                                   <?= !$config->get('lightbox_preload', true) ? 'checked' : '' ?>>
                            <span style="font-size:13px;">⚡ 仅加载当前页</span>
                        </label>
                    </div>
                    <div class="hint">
                        <b>预加载全部</b>：开灯箱时后台加载全部筛选结果，← → 可翻遍所有图片（适合几千张结果）。<br>
                        <b>仅加载当前页</b>：只加载当前瀑布流页的图片，翻到其他页需关闭灯箱重开（节省流量）。
                    </div>
                </div>

                <div class="form-group">
                    <label>缓存过期提醒阈值</label>
                    <input type="number" name="cache_warning_age" min="3600" max="604800" step="3600"
                           value="<?= htmlspecialchars((string)($config->get('cache_warning_age', 86400))) ?>"
                           style="width:200px;">
                    <div class="hint">
                        超过此时间未刷新缓存时，界面右上角会显示警告提示。单位：秒。<br>
                        <code>86400</code>（1 天）— 本地网络，随时可刷新<br>
                        <code>604800</code>（7 天）— 远程访问，缓存相对稳定
                    </div>
                </div>

                <div class="hint" style="background:#1a2a3a;border-radius:8px;padding:12px;margin-top:8px;">
                    💡 <b>远程访问（ZeroTier）优化建议：</b><br>
                    每页数量改为 <code>30</code> + 开启无限滚动 + 预加载全部<br>
                    这样首次加载仅需下载约 30 张缩略图，后续滚动逐步加载，体验最流畅。
                </div>
            </div>

            <div class="actions">
                <button type="submit" class="btn btn-primary">💾 保存配置</button>
                <?php if ($isConfigured): ?>
                <a href="index.php" class="btn btn-secondary">🏠 进入图库</a>
                <?php endif; ?>
            </div>
        </form>

        <?php if ($isConfigured): ?>
        <div class="status-row">
            <div>状态：<span>已配置</span></div>
            <div>路径：<span><?= htmlspecialchars($currentPath) ?></span></div>
            <div>密码：<span><?= $hasPassword ? '已设置' : '未设置' ?></span></div>
        </div>
        <?php endif; ?>

        <!-- 程序说明 -->
        <div class="program-credit" style="margin-top:32px;padding:16px;background:rgba(102,126,234,0.08);border:1px solid rgba(102,126,234,0.2);border-radius:8px;font-size:13px;color:#888;line-height:1.8;">
            <div style="color:#667eea;font-weight:600;margin-bottom:8px;">📝 程序说明</div>
            <p style="margin:0;">本程序由 <b>OpenClaw</b> 基于 <b>Eagle 4.0.0 Build28 (20260401)</b> 数据结构开发，是一款轻量级 Web 图片浏览器。</p>
            <p style="margin:8px 0 0 0;">适用场景：异地设备未安装 Eagle 客户端时，通过组网（如 ZeroTier）使用浏览器快速检索和浏览图片。</p>
            <p style="margin:8px 0 0 0;color:#666;">生成日期：2026/04/21 21:00 &nbsp;|&nbsp; 版本：v12</p>
        </div>
    </div>

    <script>
    let checkTimer = null;
    const pathInput = document.getElementById('eagle_path');
    const vr = document.getElementById('validationResult');
    pathInput.addEventListener('input', function() {
        clearTimeout(checkTimer);
        const path = this.value.trim();
        if (!path) { vr.className = 'validation-result'; return; }
        checkTimer = setTimeout(() => {
            fetch('setup.php?ajax_check=1&path=' + encodeURIComponent(path))
                .then(r => r.json())
                .then(data => {
                    vr.className = 'validation-result ' + (data.valid ? 'valid' : 'invalid');
                    vr.textContent = data.valid
                        ? '✅ 有效！检测到 ' + (data.info.tags_count || 0) + ' 个标签'
                        : '❌ ' + data.error;
                })
                .catch(() => { vr.className = 'validation-result'; });
        }, 500);
    });
    </script>
</body>
</html>
