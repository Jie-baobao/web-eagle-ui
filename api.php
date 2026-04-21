<?php
setlocale(LC_ALL, "en_US.UTF-8", "zh_CN.UTF-8", "C.UTF-8");

/**
 * Web Eagle - API 接口 v4
 * 修复:CSRF 保护、imageId UUID 校验、rate limit、HTTP 错误处理、调试代码清理
 */
defined('WEB_EAGLE') or define('WEB_EAGLE', true);
require_once __DIR__ . '/config.php';

// ── CSRF 保护 ──────────────────────────────────
function csrfCheck() {
    // 仅 POST / DELETE / PATCH 操作需要校验
    if ($_SERVER['REQUEST_METHOD'] === 'GET') return true;

    $token = $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $_POST['csrf_token']
        ?? $_COOKIE['csrf_token']
        ?? '';

    if (empty($_SESSION['csrf_token'])) {
        httpJson(403, ['success' => false, 'error' => '会话无效,请刷新页面重试']);
        exit;
    }
    if (!hash_equals($_SESSION['csrf_token'], $token)) {
        httpJson(403, ['success' => false, 'error' => '安全校验失败,请刷新页面重试']);
        exit;
    }
    return true;
}

// ── Rate Limit(刷新接口)────────────────────────
function rateLimitCheck($action) {
    $key = 'rate_' . $action . '_' . md5($_SERVER['REMOTE_ADDR'] ?? 'cli');
    $cacheFile = __DIR__ . '/data/.rate_limit';
    $data = [];

    if (file_exists($cacheFile)) {
        $data = @json_decode(file_get_contents($cacheFile), true) ?: [];
    }

    $now = time();
    // 清理 10 分钟前的记录
    $data = array_filter($data, fn($t) => ($now - $t) < 600);

    if (isset($data[$key])) {
        $count = $data[$key]['count'] ?? 0;
        if ($count >= 5) {
            $wait = 600 - ($now - ($data[$key]['first'] ?? $now));
            httpJson(
                429,
                [
                    'success' => false,
                    'error' => "操作过于频繁,请在 {$wait} 秒后重试",
                    'retry_after' => max(1, $wait),
                ]
            );
            exit;
        }
        $data[$key]['count'] = $count + 1;
    } else {
        $data[$key] = ['count' => 1, 'first' => $now];
    }

    @file_put_contents($cacheFile, json_encode($data), LOCK_EX);
    return true;
}

// ── 统一 JSON 输出 ─────────────────────────────
function httpJson($code, $body) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 认证检查 ──────────────────────────────────
EagleAuth::start();
$config = new EagleConfig();
if ($config->hasPassword() && !EagleAuth::check()) {
    httpJson(401, ['success' => false, 'error' => '未登录']);
}

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

$action = $_GET['action'] ?? '';

// CSRF:需要写的操作必须校验
$writeActions = ['refresh'];
if (in_array($action, $writeActions, true)) {
    csrfCheck();
    rateLimitCheck($action);
}

// 请求级缓存
$GLOBALS['__cache'] = null;

switch ($action) {
    case 'tags':
        apiGetTags($config);
        break;
    case 'images':
        apiGetImages($config);
        break;
    case 'image_ids':
        apiGetImageIds($config);
        break;
    case 'image_proxy':
        apiImageProxy($config);
        break;
    case 'refresh':
        apiRefreshCache($config);
        break;
    case 'status':
        apiStatus($config);
        break;
    case 'csrf_token':
        // 前端获取 CSRF token
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        httpJson(200, ['success' => true, 'token' => $_SESSION['csrf_token']]);
        break;
    default:
        httpJson(400, ['success' => false, 'error' => '未知操作']);
}

// ── API 函数 ──────────────────────────────────

function apiGetTags($config) {
    if (!$config->isConfigured()) {
        httpJson(503, ['success' => false, 'error' => '未配置 Eagle 资源库路径,请先访问设置页面']);
    }

    $cache = loadCache($config);

    if (!empty($cache['tag_counts_precomputed'])) {
        $tags = $cache['tags'] ?? [];
        foreach ($tags as &$tag) {
            $tag['count'] = $cache['tag_counts_precomputed'][$tag['id']] ?? 0;
        }
        unset($tag);
    } else {
        $tags = $cache['tags'] ?? [];
        $tagCounts = [];
        foreach ($cache['images'] ?? [] as $img) {
            foreach ($img['tags'] ?? [] as $tid) {
                $tagCounts[$tid] = ($tagCounts[$tid] ?? 0) + 1;
            }
        }
        foreach ($tags as &$tag) {
            $tag['count'] = $tagCounts[$tag['id']] ?? 0;
        }
        unset($tag);
    }

    $tagGroups = $cache['tagGroups'] ?? [];
    $totalImages = $cache['count'] ?? count($cache['images'] ?? []);

    httpJson(200, [
        'success' => true,
        'data' => [
            'tags' => $tags,
            'tagGroups' => $tagGroups,
            'total_images' => $totalImages,
            'cache_built_at' => $cache['built_at'] ?? null,
            'cache_valid' => isCacheValid($config, $cache),
        ],
    ]);
}

function apiGetImages($config) {
    if (!$config->isConfigured()) {
        httpJson(503, ['success' => false, 'error' => '未配置 Eagle 资源库路径']);
    }

    $tagFilter = $_GET['tags'] ?? '';
    $keyword = trim($_GET['keyword'] ?? '');
    $terms = $_GET['terms'] ?? ''; // 新增：逗号分隔的搜索词，同时匹配标签名和图片名
    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(500, max(1, intval($_GET['per_page'] ?? $config->get('per_page', 60))));

    $cache = loadCache($config);

    $etag = cacheEtag($cache, $tagFilter . $terms, $keyword, $page, $perPage);
    header('ETag: "' . $etag . '"');
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) &&
        trim($_SERVER['HTTP_IF_NONE_MATCH'], '"') === $etag) {
        header('HTTP/1.1 304 Not Modified');
        exit;
    }

    $images = $cache['images'] ?? [];
    $tags = $cache['tags'] ?? [];
    $tagMap = [];
    foreach ($tags as $t) { $tagMap[$t['id']] = $t; }

    // === 方案1：terms 参数（推荐）===
    // 每个词匹配：标签名 OR 图片名，多个词之间是 AND
    if (!empty($terms)) {
        $termList = array_filter(array_map('trim', explode(',', $terms)));
        if (!empty($termList)) {
            $images = array_filter($images, function ($img) use ($termList, $tagMap) {
                $imgName = strtolower($img['name'] ?? '');
                $imgTags = $img['tags'] ?? [];
                // 图片的标签名列表
                $imgTagNames = [];
                foreach ($imgTags as $tid) {
                    if (isset($tagMap[$tid])) {
                        $imgTagNames[] = strtolower($tagMap[$tid]['name']);
                    }
                }
                // 每个搜索词都必须匹配（标签名或图片名）
                foreach ($termList as $term) {
                    $termLower = strtolower($term);
                    $matched = false;
                    // 标签名匹配（精确或部分）
                    foreach ($imgTagNames as $tn) {
                        if ($tn === $termLower || strpos($tn, $termLower) !== false) {
                            $matched = true;
                            break;
                        }
                    }
                    // 图片名匹配
                    if (!$matched && strpos($imgName, $termLower) !== false) {
                        $matched = true;
                    }
                    if (!$matched) return false; // 只要有一个词不匹配就排除
                }
                return true;
            });
        }
    }
    // === 方案2：旧版 tags + keyword ===
    else {
        // AND 标签筛选（tag ID）
        if (!empty($tagFilter)) {
            $tagIds = array_filter(explode(',', $tagFilter));
            if (!empty($tagIds)) {
                $images = array_filter($images, function ($img) use ($tagIds) {
                    foreach ($tagIds as $tid) {
                        if (!in_array($tid, $img['tags'] ?? [])) return false;
                    }
                    return true;
                });
            }
        }

        // 名称搜索
        if (!empty($keyword)) {
            $kw = strtolower($keyword);
            $images = array_filter($images, function ($img) use ($kw) {
                return strpos(strtolower($img['name'] ?? ''), $kw) !== false;
            });
        }
    }

    $total = count($images);
    $images = array_values($images);

    usort($images, fn($a, $b) => ($b['mtime'] ?? 0) - ($a['mtime'] ?? 0));

    $offset = ($page - 1) * $perPage;
    $pageImages = array_slice($images, $offset, $perPage);

    foreach ($pageImages as &$img) {
        unset($img['folders']);
    }
    unset($img);

    httpJson(200, [
        'success' => true,
        'data' => [
            'images' => $pageImages,
            'total' => $total,
            'page' => $page,
            'perPage' => $perPage,
            'totalPages' => $total > 0 ? ceil($total / $perPage) : 1,
            'hasMore' => ($page * $perPage) < $total,
        ],
    ]);
}

function apiGetImageIds($config) {
    if (!$config->isConfigured()) {
        httpJson(503, ['success' => false, 'error' => '未配置 Eagle 资源库路径']);
    }

    $tagFilter = $_GET['tags'] ?? '';
    $keyword = trim($_GET['keyword'] ?? '');

    $cache = loadCache($config);

    $etag = cacheEtag($cache, $tagFilter, $keyword, 1, 99999);
    header('ETag: "' . $etag . '"');
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) &&
        trim($_SERVER['HTTP_IF_NONE_MATCH'], '"') === $etag) {
        header('HTTP/1.1 304 Not Modified');
        exit;
    }

    $images = $cache['images'] ?? [];

    if (!empty($tagFilter)) {
        $tagIds = array_filter(explode(',', $tagFilter));
        if (!empty($tagIds)) {
            $images = array_filter($images, function ($img) use ($tagIds) {
                foreach ($tagIds as $tid) {
                    if (!in_array($tid, $img['tags'] ?? [])) return false;
                }
                return true;
            });
        }
    }

    if (!empty($keyword)) {
        $kw = strtolower($keyword);
        $images = array_filter($images, function ($img) use ($kw) {
            return strpos(strtolower($img['name'] ?? ''), $kw) !== false;
        });
    }

    usort($images, fn($a, $b) => ($b['mtime'] ?? 0) - ($a['mtime'] ?? 0));

    $ids = array_map(fn($img) => [
        'id' => $img['id'],
        'name' => $img['name'] ?? '',
        'ext' => $img['ext'] ?? 'jpg',
        'isVideo' => $img['isVideo'] ?? false,
        'size' => $img['size'] ?? 0,
        'tags' => $img['tags'] ?? [],
        'palettes' => array_slice($img['palettes'] ?? [], 0, 6),
        'mtime' => $img['mtime'] ?? 0,
    ], $images);

    httpJson(200, [
        'success' => true,
        'data' => [
            'ids' => $ids,
            'total' => count($ids),
        ],
    ]);
}

function apiImageProxy($config) {
    // 分享 Token 验证（支持无登录访问）
    $shareToken = $_GET['share_token'] ?? '';
    if ($shareToken && empty($_SESSION['eagle_auth_ok'])) {
        $secret = $config->get('share_secret', '');
        if ($secret) {
            $parts = explode('.', $shareToken);
            if (count($parts) === 2) {
                [$payload64, $sig] = $parts;
                $expectedSig = substr(hash_hmac('sha256', $payload64, $secret), 0, 16);
                if (hash_equals($expectedSig, $sig)) {
                    $decoded = base64_decode($payload64);
                    [$tokenId, $tokenExpires] = explode('|', $decoded);
                    if ((int)$tokenExpires > time()) {
                        $_SESSION['eagle_share_valid'] = true;
                        $_SESSION['eagle_share_id'] = $tokenId;
                    }
                }
            }
        }
    }
    if (!empty($_SESSION['eagle_share_valid']) && !empty($_SESSION['eagle_share_id'])) {
        if (empty($_GET['id'])) $_GET['id'] = $_SESSION['eagle_share_id'];
    }


    if (!$config->isConfigured()) {
        httpJson(403, ['success' => false, 'error' => '未配置']);
    }

    $rawId = $_GET['id'] ?? '';
    $type = $_GET['type'] ?? 'thumbnail';

    // imageId 支持两种格式：
    // 1. 旧版 Eagle: 8-4-4-4-12 UUID (如: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
    // 2. 新版 Eagle: 大写字母+数字组合 (如: MO7F8PB5V388U)
    $isValidOldFormat = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $rawId);
    $isValidNewFormat = preg_match('/^[A-Z0-9]{13}$/i', $rawId);
    
    if (!$isValidOldFormat && !$isValidNewFormat) {
        httpJson(400, ['success' => false, 'error' => '无效的图片 ID: ' . $rawId]);
    }

    $imageId = $rawId; // 已校验,直接使用
    $eaglePath = rtrim($config->getEaglePath(), '/\\');

    // 尝试新版格式: {id}.info/ (Eagle 3.x+)
    $newFormatDir = $eaglePath . '/images/' . $imageId . '.info';
    // 尝试旧版格式: {id}/ (Eagle 2.x)
    $oldFormatDir = $eaglePath . '/images/' . $imageId;

    if (is_dir($newFormatDir)) {
        // 新版 Eagle 格式 (3.x+)
        $imageDir = $newFormatDir;
        $infoFile = $imageDir . '/metadata.json';
        $isNewFormat = true;
    } elseif (is_dir($oldFormatDir)) {
        // 旧版 Eagle 格式 (2.x)
        $imageDir = $oldFormatDir;
        $infoFile = $imageDir . '/' . $imageId . '.info.json';
        $isNewFormat = false;
    } else {
        httpJson(404, ['success' => false, 'error' => '图片目录不存在: ' . $imageId . ' (尝试: ' . $newFormatDir . ' 和 ' . $oldFormatDir . ')']);
    }

    if (!file_exists($infoFile)) {
        httpJson(404, ['success' => false, 'error' => '图片信息文件不存在: ' . $infoFile]);
    }

    $info = @json_decode(file_get_contents($infoFile), true);
    if (!$info) {
        httpJson(500, ['success' => false, 'error' => '图片信息文件解析失败']);
    }

    $ext = $info['ext'] ?? 'jpg';
    $name = $info['name'] ?? $imageId;
    $isVideo = !empty($info['isVideo']);

    if ($type === 'thumbnail') {
        $thumbFound = null;
        if ($isNewFormat) {
            // 新版：扫描 .info 目录，查找含 _thumbnail. 的文件
            foreach (scandir($imageDir) as $f) {
                if ($f === '.' || $f === '..') continue;
                if (strpos($f, '_thumbnail.') !== false) {
                    $thumbFound = $imageDir . '/' . $f; break;
                }
            }
            // 备选：直接用 name_thumbnail.png
            if (!$thumbFound) {
                $alt = $imageDir . '/' . $name . '_thumbnail.png';
                if (file_exists($alt)) $thumbFound = $alt;
            }
        } else {
            $alt = $imageDir . '/' . $imageId . '_thumbnail.png';
            if (file_exists($alt)) $thumbFound = $alt;
        }

        if ($thumbFound) {
            $thumbExt = strtolower(pathinfo($thumbFound, PATHINFO_EXTENSION));
            $mime = ($thumbExt === 'jpg' || $thumbExt === 'jpeg') ? 'image/jpeg' : 'image/png';
            serveImageFile($thumbFound, $mime);
        }

        if (!empty($isVideo)) {
            serveVideoPlaceholder();
        }
        httpJson(404, ['success' => false, 'error' => '缩略图不存在']);
    }

    // 原图路径
    if ($isNewFormat) {
        $imageFile = $imageDir . '/' . $name . '.' . $ext;
    } else {
        $imageFile = $imageDir . '/' . $imageId . '.' . $ext;
    }

    if (!file_exists($imageFile)) {
        if (!empty($isVideo)) {
            serveVideoPlaceholder();
        }
        httpJson(404, ['success' => false, 'error' => '文件不存在']);
    }

    $mimeMap = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'gif' => 'image/gif',
        'webp' => 'image/webp', 'bmp' => 'image/bmp', 'svg' => 'image/svg+xml',
        'mp4' => 'video/mp4', 'mov' => 'video/quicktime',
        'avi' => 'video/x-msvideo', 'mkv' => 'video/x-matroska',
        'webm' => 'video/webm', 'flv' => 'video/x-flv',
        'wmv' => 'video/x-ms-wmv', 'm4v' => 'video/mp4',
        '3gp' => 'video/3gpp',
    ];
    $mime = $mimeMap[strtolower($ext)] ?? 'application/octet-stream';

    switch ($type) {
        case 'download':
            // 强制下载（带 attachment）
            serveImageFile($imageFile, $mime, $name . '.' . $ext);
            break;
        case 'image':
            // type=image: 浏览器直接显示原图（无 attachment，Ctrl+C 复制的链接可直接查看）
            serveImageFile($imageFile, $mime);
            break;
        default:
            // 其他类型默认显示原图
            serveImageFile($imageFile, $mime);
    }
}

function apiRefreshCache($config) {
    if (!$config->isConfigured()) {
        httpJson(503, ['success' => false, 'error' => '未配置 Eagle 资源库路径']);
    }

    $eaglePath = rtrim($config->getEaglePath(), '/\\');
    $result = buildCache($config, $eaglePath);

    httpJson(200, [
        'success' => true,
        'data' => [
            'total' => $result['count'],
            'built_at' => $result['built_at'],
            'cache_size' => $result['cache_size'],
        ],
    ]);
}

function apiStatus($config) {
    $configured = $config->isConfigured();
    $cache = $configured ? loadCache($config) : ['images' => [], 'built_at' => 0, 'count' => 0];
    httpJson(200, [
        'success' => true,
        'data' => [
            'configured' => $configured,
            'eagle_path' => $configured ? $config->getEaglePath() : '',
            'cache_total' => $cache['count'] ?? count($cache['images'] ?? []),
            'cache_built_at' => $cache['built_at'] ?? null,
            'cache_valid' => isCacheValid($config, $cache),
            'has_password' => $config->hasPassword(),
            'php_version' => PHP_VERSION,
            'per_page' => $config->get('per_page', 60),
            'extensions' => [
                'json' => extension_loaded('json'),
                'fileinfo' => extension_loaded('fileinfo'),
                'mbstring' => extension_loaded('mbstring'),
            ],
        ],
    ]);
}

// ── 缓存 ──────────────────────────────────────

function loadCache($config) {
    if ($GLOBALS['__cache'] !== null) {
        return $GLOBALS['__cache'];
    }

    $cacheFile = __DIR__ . '/data/cache.json';
    if (file_exists($cacheFile)) {
        $raw = @json_decode(file_get_contents($cacheFile), true);
        if (is_array($raw)) {
            $GLOBALS['__cache'] = $raw;
            return $raw;
        }
    }

    if ($config->isConfigured()) {
        $eaglePath = rtrim($config->getEaglePath(), '/\\');
        $result = buildCache($config, $eaglePath);
        $GLOBALS['__cache'] = [
            'images' => $result['images'],
            'tags' => $result['tags'],
            'tagGroups' => $result['tagGroups'],
            'tag_counts_precomputed' => $result['tag_counts'],
            'built_at' => $result['built_at'],
            'eagle_path' => $eaglePath,
            'count' => $result['count'],
        ];
        return $GLOBALS['__cache'];
    }

    $GLOBALS['__cache'] = ['images' => [], 'built_at' => 0, 'count' => 0];
    return $GLOBALS['__cache'];
}

function isCacheValid($config, $cache) {
    if (empty($cache['eagle_path']) || empty($cache['built_at'])) return false;
    $eaglePath = rtrim($cache['eagle_path'], '/\\');
    // 自动检测格式
    $eagleDir = is_dir($eaglePath . '/.eagle') ? $eaglePath . '/.eagle' : $eaglePath;
    $tagsMtime = @filemtime($eagleDir . '/tags.json');
    if ($tagsMtime && $tagsMtime > $cache['built_at']) return false;
    return true;
}

function cacheEtag($cache, $tagFilter, $keyword, $page, $perPage) {
    return md5(($cache['built_at'] ?? 0) . '|' . $tagFilter . '|' . $keyword . '|' . $page . '|' . $perPage);
}

// ── 辅助 ──────────────────────────────────────

function serveImageFile($filePath, $mimeType, $downloadName = null) {
    $maxAge = ($downloadName !== null) ? 0 : 86400 * 7;
    $etag = '"' . md5_file($filePath) . '"';

    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($filePath));
    header('ETag: ' . $etag);

    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        header('HTTP/1.1 304 Not Modified');
        exit;
    }

    if ($downloadName !== null) {
        header('Cache-Control: no-store, no-cache');
        $encodedName = rawurlencode($downloadName);
        header("Content-Disposition: attachment; filename=\"{$encodedName}\"; filename*=UTF-8''{$encodedName}");
    } else {
        header('Cache-Control: public, max-age=' . $maxAge);
    }

    header('X-Content-Type-Options: nosniff');
    readfile($filePath);
    exit;
}

function serveVideoPlaceholder() {
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">'
        . '<rect width="400" height="300" fill="#1a1a2e"/>'
        . '<circle cx="200" cy="150" r="50" fill="rgba(102,126,234,0.3)" stroke="rgba(102,126,234,0.8)" stroke-width="3"/>'
        . '<polygon points="185,130 185,170 225,150" fill="rgba(102,126,234,0.9)"/>'
        . '<text x="200" y="270" text-anchor="middle" fill="#667eea" font-size="14" font-family="sans-serif">Video</text>'
        . '</svg>';
    $etag = '"' . md5($svg) . '"';
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Content-Length: ' . strlen($svg));
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=' . (86400 * 7));
    echo $svg;
    exit;
}

// ── 分享链接────────
function apiShareLink($config) {
    $id = trim($_GET['id'] ?? '');
    $secret = $config->get('share_secret', '');

    if (!$secret) {
        httpJson(400, ['success' => false, 'error' => '未配置分享密钥，请在设置页面设置 share_secret']);
    }

    $isValidOld = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id);
    $isValidNew = preg_match('/^[A-Z0-9]{13}$/i', $id);
    if (!$isValidOld && !$isValidNew) {
        httpJson(400, ['success' => false, 'error' => '无效图片 ID']);
    }

    $expires_days = 30;
    $expires = time() + $expires_days * 86400;
    $payload = base64_encode($id . '|' . $expires);
    $sig = hash_hmac('sha256', $payload, $secret);
    $token = $payload . '.' . substr($sig, 0, 16);

    $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] ? 'https' : 'http')
        . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
        . str_replace($_SERVER['DOCUMENT_ROOT'] ?? '', '', dirname($_SERVER['SCRIPT_NAME']));

    $url = $baseUrl . '/api.php?action=image_proxy&share_token=' . rawurlencode($token);

    httpJson(200, [
        'success' => true,
        'data' => [
            'url' => $url,
            'expires_days' => $expires_days,
            'expires_at' => date('Y-m-d H:i:s', $expires),
        ],
    ]);
}

// ── 批量下载 ─────────────────────────────────
function apiDownloadBatch($config) {
    $ids = trim($_GET['ids'] ?? '');
    if (empty($ids)) {
        httpJson(400, ['success' => false, 'error' => '缺少 ids 参数']);
    }
    $idList = array_filter(array_map('trim', explode(',', $ids)));
    if (empty($idList)) {
        httpJson(400, ['success' => false, 'error' => '无有效图片 ID']);
    }
    $firstId = $idList[0];
    header('Location: api.php?action=image_proxy&id=' . urlencode($firstId) . '&type=download');
    exit;
}
