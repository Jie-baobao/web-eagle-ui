<?php
/**
 * Web Eagle - 配置管理
 * 配置保存在 eagle_config.php（PHP 文件，不可通过 HTTP 下载）
 * 迁移时只需复制此文件即可保留所有设置
 */

defined('WEB_EAGLE') or define('WEB_EAGLE', true);

class EagleConfig {
    private $configFile;
    private $config;

    public function __construct() {
        $this->configFile = __DIR__ . '/eagle_config.php';
        $this->load();
    }

    private function load() {
        $this->config = [];
        if (file_exists($this->configFile)) {
            $config = include $this->configFile;
            $this->config = is_array($config) ? $config : [];
        }
        $defaults = [
            'eagle_path'        => '',
            'password'          => '',
            'per_page'          => 60,
            'max_per_page'      => 500,   // 每页上限（安全）
            'infinite_scroll'   => true,  // true=无限滚动，false=传统分页
            'lightbox_preload'  => true,  // 开灯箱时预加载全部图片 ID 列表
            'cache_warning_age' => 86400, // 缓存过期提示阈值（秒），默认 1 天
        ];
        $this->config = array_merge($defaults, $this->config);
    }

    /**
     * 保存配置到 eagle_config.php
     */
    public function save($config) {
        $this->config = array_merge($this->config, $config);
        $content = "<?php\n";
        $content .= "/**\n * Web Eagle 配置文件\n * 迁移设备时复制此文件即可保留设置\n */\n";
        $content .= "defined('WEB_EAGLE') or die('No direct access');\n\n";
        $content .= "return " . var_export($this->config, true) . ";\n";

        file_put_contents($this->configFile, $content);
    }

    public function get($key = null, $default = null) {
        if ($key === null) return $this->config;
        return $this->config[$key] ?? $default;
    }

    public function getEaglePath() {
        return $this->config['eagle_path'] ?? '';
    }

    public function isConfigured() {
        $path = $this->getEaglePath();
        if (empty($path)) return false;
        // 支持旧版 (.eagle目录) 和新版 (tags.json在根目录)
        $isOldFormat = is_dir($path . '/.eagle');
        $isNewFormat = file_exists($path . '/tags.json') && file_exists($path . '/metadata.json');
        return $isOldFormat || $isNewFormat;
    }

    public function hasPassword() {
        return !empty($this->config['password']);
    }

    public function checkPassword($input) {
        $stored = $this->config['password'] ?? '';
        if (empty($stored)) return true; // 无密码则放行
        return $input === $stored;
    }

    /**
     * 验证路径是否为有效的 Eagle 资源库
     * 支持旧版 (.eagle/tags.json) 和新版 (tags.json) 格式
     */
    public function validatePath($path) {
        $path = str_replace('\\', '/', rtrim($path, '/\\'));
        if (!is_dir($path)) {
            return ['valid' => false, 'error' => '路径不存在，请检查输入'];
        }
        if (!is_readable($path)) {
            return ['valid' => false, 'error' => '路径不可读，请检查 PHP 进程权限'];
        }
        
        // 检测 Eagle 版本格式
        $isOldFormat = is_dir($path . '/.eagle');
        $isNewFormat = file_exists($path . '/tags.json') && file_exists($path . '/metadata.json');
        
        if (!$isOldFormat && !$isNewFormat) {
            return ['valid' => false, 'error' => '未找到 Eagle 资源库标识（.eagle 目录或 tags.json），请确认是否为资源库根目录'];
        }
        
        // 确定 tags.json 位置
        $tagsPath = $isOldFormat ? $path . '/.eagle/tags.json' : $path . '/tags.json';
        
        if (!file_exists($tagsPath)) {
            return ['valid' => false, 'error' => '未找到 tags.json，资源库可能不完整'];
        }
        if (!is_dir($path . '/images')) {
            return ['valid' => false, 'error' => '未找到 images 目录，资源库可能不完整'];
        }
        
        $tagsContent = @file_get_contents($tagsPath);
        if ($tagsContent === false) {
            return ['valid' => false, 'error' => '无法读取 tags.json，请检查文件权限'];
        }
        
        $tags = @json_decode($tagsContent, true);
        if (!is_array($tags)) {
            return ['valid' => false, 'error' => 'tags.json 格式异常，无法解析'];
        }
        
        // 新版格式 tags.json 结构不同
        $tagCount = isset($tags['tags']) ? count($tags['tags']) : (isset($tags['historyTags']) ? count($tags['historyTags']) : count($tags));
        
        return [
            'valid' => true,
            'info' => [
                'tags_count' => $tagCount,
                'path' => $path,
                'format' => $isOldFormat ? '旧版 (Eagle 2.x)' : '新版 (Eagle 3.x+)'
            ]
        ];
    }
}

/**
 * 简易会话认证
 */
class EagleAuth {
    public static function start() {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    public static function check() {
        self::start();
        return !empty($_SESSION['web_eagle_auth']);
    }

    public static function login($password) {
        self::start();
        $config = new EagleConfig();
        if ($config->checkPassword($password)) {
            $_SESSION['web_eagle_auth'] = true;
            return true;
        }
        return false;
    }

    public static function logout() {
        self::start();
        unset($_SESSION['web_eagle_auth']);
    }

    /**
     * 需要认证时拦截，未登录则返回 false
     */
    public static function requireAuth() {
        $config = new EagleConfig();
        if (!$config->hasPassword()) return true; // 无密码不拦截
        return self::check();
    }
}

/**
 * 构建 Eagle 资源库缓存
 * 从 api.php 移到这里，供 setup.php 直接调用（无需认证）
 */
function buildCache($config, $eaglePath) {
    $imagesDir = $eaglePath . '/images';

    // 自动检测 Eagle 版本格式
    $isOldFormat = is_dir($eaglePath . '/.eagle');
    $eagleDir = $isOldFormat ? $eaglePath . '/.eagle' : $eaglePath;

    $tags = [];
    $tagCounts = [];
    $tagGroups = [];

    $tagsFile = $eagleDir . '/tags.json';
    if (is_file($tagsFile)) {
        $tagsData = @json_decode(file_get_contents($tagsFile), true) ?: [];
        // 新版格式: { "tags": [...], "historyTags": [...] }
        // 旧版格式: [ { "id": ..., "name": ... }, ... ]
        if (isset($tagsData['tags']) && is_array($tagsData['tags'])) {
            $tags = $tagsData['tags'];
        } elseif (isset($tagsData['historyTags']) && is_array($tagsData['historyTags'])) {
            // 新版只有 historyTags，图片引用的是标签名本身
            // 转换为统一格式：id = name（因为图片直接用名字引用）
            $tags = [];
            foreach ($tagsData['historyTags'] as $name) {
                $tags[] = ['id' => $name, 'name' => $name];
            }
        } else {
            $tags = $tagsData; // 旧版直接是数组
        }
        foreach ($tags as $tag) {
            $tagId = $tag['id'] ?? ($tag['name'] ?? '');
            if ($tagId) {
                $tagCounts[$tagId] = 0;
            }
        }
    }

    $tagGroupsFile = $eagleDir . '/tagGroups.json';
    if (is_file($tagGroupsFile)) {
        $tagGroups = @json_decode(file_get_contents($tagGroupsFile), true) ?: [];
    }

    $images = [];
    $count = 0;
    $maxImages = 200000;

    $entries = @scandir($imagesDir);
    if ($entries === false) {
        return ['images' => [], 'tags' => $tags, 'tagGroups' => $tagGroups,
                'tag_counts' => $tagCounts, 'built_at' => time(), 'count' => 0, 'cache_size' => 0];
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        if ($count >= $maxImages) break;
        $entryPath = $imagesDir . '/' . $entry;
        if (!is_dir($entryPath)) continue;

        // 检测 Eagle 格式：新版是 {id}.info/ 目录，旧版是 {id}/ 目录
        $isNewImageFormat = substr($entry, -5) === '.info';
        
        if ($isNewImageFormat) {
            // 新版格式: MO7F8PB5V388U.info/metadata.json
            $infoFile = $entryPath . '/metadata.json';
            $imageId = substr($entry, 0, -5); // 去掉 .info
        } else {
            // 旧版格式: MO7F8PB5V388U/MO7F8PB5V388U.info.json
            $infoFile = $entryPath . '/' . $entry . '.info.json';
            $imageId = $entry;
        }
        
        if (!is_file($infoFile)) continue;

        $info = @json_decode(file_get_contents($infoFile), true);
        if (!$info || !empty($info['isDeleted'])) continue;

        $imgTags = $info['tags'] ?? [];
        foreach ($imgTags as $tid) {
            if (isset($tagCounts[$tid])) {
                $tagCounts[$tid]++;
            }
        }

        $ext = strtolower($info['ext'] ?? 'jpg');
        $videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp'];
        $isVideo = in_array($ext, $videoExts);
        
        $images[] = [
            'id'       => $info['id'] ?? $imageId,
            'name'     => $info['name'] ?? '',
            'ext'      => $ext,
            'isVideo'  => $isVideo,
            'tags'     => $imgTags,
            'palettes' => array_slice($info['palettes'] ?? [], 0, 6),
            'rating'   => $info['rating'] ?? 0,
            'size'     => $info['size'] ?? 0,
            'mtime'    => $info['mtime'] ?? 0,
            'btime'    => $info['btime'] ?? 0,
            '_format'  => $isNewImageFormat ? 'new' : 'old', // 标记格式用于图片代理
        ];
        $count++;
    }

    $builtAt = time();
    $cacheData = [
        'images' => $images,
        'tags' => $tags,
        'tagGroups' => $tagGroups,
        'tag_counts_precomputed' => $tagCounts,
        'built_at' => $builtAt,
        'eagle_path' => $eaglePath,
        'count' => $count,
    ];

    $cacheFile = __DIR__ . '/data/cache.json';
    $dir = dirname($cacheFile);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($cacheFile, json_encode($cacheData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);

    return [
        'images' => $images,
        'tags' => $tags,
        'tagGroups' => $tagGroups,
        'tag_counts' => $tagCounts,
        'built_at' => $builtAt,
        'count' => $count,
        'cache_size' => filesize($cacheFile),
    ];
}
