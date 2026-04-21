<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🦅 Web Eagle - 图片库</title>
<link rel="stylesheet" href="assets/css/style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body>

<!-- 顶部栏 -->
<header class="top-bar">
    <div class="top-bar-left">
        <span class="logo">🦅 Web Eagle</span>
    </div>

    <div class="top-bar-center" style="max-width:720px;">
        <!-- 搜索框：加宽，芯片 + 输入混排 -->
        <div class="search-box" id="searchBox">
            <!-- 芯片区域（折叠显示） -->
            <div class="search-chips-area" id="searchChipsArea"></div>
            <!-- 展开的芯片面板 -->
            <div class="search-chips-expanded" id="searchChipsExpanded"></div>
            <!-- 文字输入 -->
            <div class="search-input-wrapper">
                <span class="search-icon">&#128269;</span>
                <input type="text" id="searchInput"
                       placeholder="输入标签或图片名称（空格分隔多个关键词）"
                       autocomplete="off" spellcheck="false">
            </div>
            <div class="search-tips" id="searchTips">
                <div class="search-tips-header">&#128161; 使用提示</div>
                <div class="search-tips-body">
                    <p>&#8226; 输入关键词搜索标签名或图片文件名</p>
                    <p>&#8226; 空格分隔多个关键词 = 同时满足所有条件（AND）</p>
                    <p>&#8226; 点击标签栏标签快速添加筛选</p>
                    <p>&#8226; 点击芯片 &times; 可移除对应关键词</p>
                    <p>&#8226; 键盘左右箭头可在灯箱内切换图片</p>
                </div>
            </div>
        </div>
    </div>

    <div class="top-bar-right">
        <button class="topbar-multi-btn" id="multiSelectToggle" title="多选模式">✅️</button>
        <button class="topbar-multi-btn topbar-multi-download" id="topbarMultiDownload" title="下载已选" style="display:none">
            <span id="topbarDlCount"></span>
        </button>
        <span class="image-count" id="imageCount">0 张图片</span>
        <button class="icon-btn" id="btnRefresh" title="刷新缓存">&#8635;</button>
        <a href="setup.php" class="icon-btn" title="设置">&#9881;</a>
    </div>
</header>

<!-- 主布局 -->
<div class="main-layout">
    <!-- 侧边栏 -->
    <aside class="tag-sidebar" id="tagSidebar">
        <div class="sidebar-header">
            <h3>&#127800; 标签</h3>
            <input type="text" id="tagFilter" placeholder="过滤标签...">
        </div>
        <div class="tag-list" id="tagList"><div class="loading">加载中...</div></div>
    </aside>

    <button class="sidebar-toggle" id="sidebarToggle">🏷️</button>

    <main class="image-area" id="imageArea">
        <div class="image-grid" id="imageGrid"><div class="loading">加载中...</div></div>
    </main>
</div>

<!-- 灯箱 -->
<div class="lightbox" id="lightbox">
    <div class="lightbox-backdrop"></div>
    <div class="lightbox-content">
        <button class="lightbox-close" id="lightboxClose">&times;</button>
        <!-- 按钮改为 +/- 缩放 -->
        <button class="lightbox-prev" id="lightboxPrev" title="向前（键盘←或↑️切换图片）">&lt;</button>
        <button class="lightbox-next" id="lightboxNext" title="向后（键盘→或↓️切换图片）">&gt;</button>
        <div class="lightbox-spinner" id="lightboxSpinner"><div class="spinner-ring"></div><span>加载中...</span></div>
        <div class="lightbox-media-wrapper">
            <img id="lightboxImage" src="" alt="" draggable="false">
            <video id="lightboxVideo" controls preload="metadata" style="display:none"><source src="" type="">您的浏览器不支持视频</video>
        </div>
        <div class="lightbox-info" id="lightboxInfo"></div>
    </div>

    <!-- 缩放条（默认隐藏） -->
    <div class="zoom-bar" id="zoomBar">
        <button class="zoom-btn" id="zoomOut" title="缩小">-</button>
        <input type="range" class="zoom-slider" id="zoomSlider" min="30" max="800" value="100" step="5" title="缩放">
        <span class="zoom-label" id="zoomLabel">100%</span>
        <button class="zoom-btn" id="zoomIn" title="放大">+</button>
        <button class="zoom-btn" id="zoomReset" title="重置">R</button>
    </div>

    <!-- 灯箱工具栏 -->
    <div class="lightbox-toolbar">
        <span class="lightbox-counter" id="lightboxCounter">1 / 1</span>
        <div class="lb-tool-divider"></div>
        <a class="lb-tool-btn" id="lightboxDownload" download title="下载原图（Ctrl+S）">&#11015; 下载</a>
        <button class="lb-tool-btn" id="lightboxShare" title="复制链接（Ctrl+C）">&#128203; 复制链接</button>
    </div>

    <!-- 快捷键提示 -->
    <div class="lightbox-shortcuts" id="lightboxShortcuts">
        <div class="lightbox-shortcuts-title">&#128161; 快捷键</div>
        <div class="lightbox-shortcuts-list">
            <div class="shortcut-item"><span class="shortcut-key">ESC</span><span class="shortcut-desc">关闭灯箱</span></div>
            <div class="shortcut-item"><span class="shortcut-key">&#8592;</span><span class="shortcut-key">&#8593;</span><span class="shortcut-key">&#8594;</span><span class="shortcut-key">&#8595;</span><span class="shortcut-desc">切换图片</span></div>
            <div class="shortcut-item"><span class="shortcut-key">&#8997;</span><span class="shortcut-key">滚轮</span><span class="shortcut-desc">缩放图片</span></div>
            <div class="shortcut-item"><span class="shortcut-key">Ctrl</span><span class="shortcut-key">C</span><span class="shortcut-desc">复制链接</span></div>
            <div class="shortcut-item"><span class="shortcut-key">Ctrl</span><span class="shortcut-key">S</span><span class="shortcut-desc">下载图片</span></div>
        </div>
    </div>
</div>

<!-- 标签管理模态窗口 -->
<div class="tags-modal-overlay" id="tagsModalOverlay">
    <div class="tags-modal">
        <div class="tags-modal-header">
            <span class="tags-modal-title">&#127800; 搜索词管理</span>
            <button class="tags-modal-close" id="tagsModalClose">&times;</button>
        </div>
        <div class="tags-modal-content" id="tagsModalContent"></div>
        <div class="tags-modal-footer">
            <input type="text" class="tags-modal-input" id="tagsModalInput" placeholder="输入新的搜索词（标签名或文件名）">
            <button class="tags-modal-add-btn" id="tagsModalAdd">添加</button>
        </div>
    </div>
</div>

<script src="assets/js/app.js"></script>
</body>
</html>
