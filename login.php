<?php
/**
 * Web Eagle - 登录页面
 */
defined('WEB_EAGLE') or define('WEB_EAGLE', true);
require_once __DIR__ . '/config.php';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = $_POST['password'] ?? '';
    if (EagleAuth::login($password)) {
        $redirect = $_GET['redirect'] ?? 'index.php';
        header('Location: ' . $redirect);
        exit;
    } else {
        $error = '密码错误';
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Eagle - 登录</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f0f1a;
            color: #e0e0e0;
            min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
        }
        .login-card {
            background: #1a1a2e;
            border-radius: 16px;
            padding: 40px;
            max-width: 400px; width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            text-align: center;
        }
        .login-card h1 { font-size: 24px; margin-bottom: 8px; }
        .login-card .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
        .form-group { margin-bottom: 20px; text-align: left; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 13px; color: #aaa; }
        .form-group input {
            width: 100%; padding: 12px 16px; border: 1px solid #333; border-radius: 8px;
            background: #0f0f1a; color: #e0e0e0; font-size: 15px;
        }
        .form-group input:focus { outline: none; border-color: #667eea; }
        .btn {
            padding: 12px 32px; border: none; border-radius: 8px;
            font-size: 15px; cursor: pointer;
            background: linear-gradient(135deg, #667eea, #764ba2); color: white;
        }
        .error { color: #ef5350; font-size: 13px; margin-bottom: 12px; }
    </style>
</head>
<body>
    <div class="login-card">
        <h1>🦅 Web Eagle</h1>
        <p class="subtitle">请输入访问密码</p>
        <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <form method="POST">
            <div class="form-group">
                <label>访问密码</label>
                <input type="password" name="password" autofocus placeholder="请输入密码">
            </div>
            <button type="submit" class="btn">登 录</button>
        </form>
    </div>
</body>
</html>
