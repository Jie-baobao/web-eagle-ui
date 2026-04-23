(function () {
    'use strict';

    var state = {
        tags: [], tagMap: {},
        searchTerms: [],
        images: [], page: 1, perPage: 60, total: 0,
        hasMore: true, loadingMore: false,
        cacheValid: true, csrfToken: '',
        lightboxIds: [], lightboxIndex: -1,
        multiMode: false, selectedIds: {}, selectAllVisible: false,
        chipsExpanded: false, // 芯片是否展开
        MAX_VISIBLE_CHIPS: 3, // 搜索栏最多显示的芯片数
    };

    var $ = document.querySelector.bind(document);
    var dom = {};

    function initDom() {
        dom.searchInput          = $('#searchInput');
        dom.searchTips           = $('#searchTips');
        dom.searchChipsArea      = $('#searchChipsArea');
        dom.searchClearBtn       = $('#searchClearBtn');
        dom.searchBox            = $('#searchBox');
        dom.searchChipsExpanded  = $('#searchChipsExpanded');
        dom.imageCount           = $('#imageCount');
        dom.tagList              = $('#tagList');
        dom.tagFilter            = $('#tagFilter');
        dom.imageGrid            = $('#imageGrid');
        dom.tagSidebar           = $('#tagSidebar');
        dom.sidebarToggle        = $('#sidebarToggle');
        dom.imageArea            = $('#imageArea');
        dom.multiSelectToggle    = $('#multiSelectToggle');
        dom.topbarMultiDownload  = $('#topbarMultiDownload');
        dom.lightbox             = $('#lightbox');
        dom.lightboxImage        = $('#lightboxImage');
        dom.lightboxVideo        = $('#lightboxVideo');
        dom.mediaWrapper         = dom.lightbox ? dom.lightbox.querySelector('.lightbox-media-wrapper') : null;
        dom.lightboxInfo         = $('#lightboxInfo');
        dom.lightboxClose        = $('#lightboxClose');
        dom.lightboxPrev         = $('#lightboxPrev');
        dom.lightboxNext         = $('#lightboxNext');
        dom.lightboxDownload     = $('#lightboxDownload');
        dom.lightboxShare        = $('#lightboxShare');
        // dom.lightboxCounter   已移除（灯箱工具栏不再显示计数器）
        dom.lightboxSpinner      = $('#lightboxSpinner');
        dom.lightboxBackdrop     = dom.lightbox ? dom.lightbox.querySelector('.lightbox-backdrop') : null;
        dom.zoomBar              = $('#zoomBar');
        dom.zoomSlider           = $('#zoomSlider');
        dom.zoomLabel            = $('#zoomLabel');
        dom.zoomIn               = $('#zoomIn');
        dom.zoomOut              = $('#zoomOut');
        dom.zoomReset            = $('#zoomReset');
        dom.btnRefresh           = $('#btnRefresh');
        // 标签管理模态窗口
        dom.tagsModalOverlay     = $('#tagsModalOverlay');
        dom.tagsModalContent     = $('#tagsModalContent');
        dom.tagsModalInput       = $('#tagsModalInput');
        dom.tagsModalClose       = $('#tagsModalClose');
        dom.tagsModalAdd         = $('#tagsModalAdd');
        dom.tagsModalClear       = $('#tagsModalClear');
        // 快捷键提示
        dom.lightboxShortcuts    = $('#lightboxShortcuts');
    }

    // ── API ────────────────────────────────────────────────
    function api(action, params) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var url = 'api.php?action=' + action;
            if (params) Object.keys(params).forEach(function (k) {
                url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            });
            xhr.open('GET', url, true);
            if (state.csrfToken) xhr.setRequestHeader('X-CSRF-Token', state.csrfToken);
            xhr.onload = function () {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch (e) { reject(new Error('JSON parse error')); }
            };
            xhr.onerror = function () { reject(new Error('network')); };
            xhr.send();
        });
    }

    // ── 移动端检测（动态）────────────────────────────────────────
    function checkIsMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth <= 768;
    }
    var isMobile = checkIsMobile();
    
    // 监听窗口调整，更新移动端状态
    var _resizeTimer = null;
    window.addEventListener('resize', function() {
        if (_resizeTimer) clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(function() {
            var wasMobile = isMobile;
            isMobile = checkIsMobile();
            // 如果状态改变，重新渲染搜索芯片
            if (wasMobile !== isMobile) {
                renderSearchChips();
            }
        }, 150);
    });

    // ── 图片预加载（提升灯箱切换体验）────────────────────────────────────────
    var _preloadQueue = [];
    var _preloading = false;
    
    function preloadImage(id) {
        if (!id || _preloadQueue.indexOf(id) !== -1) return;
        _preloadQueue.push(id);
        if (!_preloading) {
            _preloading = true;
            setTimeout(function() {
                var img = new Image();
                img.src = 'api.php?action=image_proxy&id=' + encodeURIComponent(_preloadQueue.shift()) + '&type=thumbnail';
                img.onload = img.onerror = function() {
                    _preloading = false;
                    if (_preloadQueue.length > 0) preloadImage(_preloadQueue[0]);
                };
            }, 100);
        }
    }
    
    function preloadAdjacentImages(idx) {
        // 预加载前后各2张图片的缩略图
        var preloadRange = isMobile ? 1 : 2;
        for (var i = idx - preloadRange; i <= idx + preloadRange; i++) {
            if (i >= 0 && i < state.images.length && i !== idx) {
                preloadImage(state.images[i].id);
            }
        }
    }

    // ── INIT ────────────────────────────────────────────────
    async function init() {
        initDom();
        setupSidebarToggle();
        bindEvents();
        setupInfiniteScroll();
        setupTouchGestures(); // 触摸手势支持

        try { var r = await api('csrf_token'); if (r.success && r.token) state.csrfToken = r.token; } catch (e) {}

        try {
            var st = await api('status');
            if (!st.success || !st.data || !st.data.configured) {
                dom.imageGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9881;</div><p>请先访问 <a href="setup.php" style="color:#667eea">设置页面</a> 配置 Eagle 资源库路径</p></div>';
                dom.tagList.innerHTML = '<div class="empty-state"><p>未配置资源库</p></div>';
                return;
            }
            if (st.data.cache_total === 0) {
                dom.imageGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>缓存为空，请点击右上角刷新按钮生成缓存</p></div>';
            }
        } catch (e) {
            dom.imageGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9881;</div><p>无法连接服务器，请检查 PHP 环境</p></div>';
            return;
        }

        await loadTags();
        loadImages(true);
    }

    // ── TAGS ────────────────────────────────────────────────
    async function loadTags() {
        try {
            var res = await api('tags');
            if (!res.success) { renderTagError(res.error || '加载失败'); return; }
            state.tags = res.data.tags || [];
            state.tagMap = {};
            state.tags.forEach(function (t) { state.tagMap[t.id] = t; });
            state.cacheValid = res.data.cache_valid !== false;
            if (!res.data.cache_valid && state.images.length > 0)
                showToast('缓存已过期，请点击右上角刷新按钮', 5000);
            renderTagList();
            updateImageCount();
        } catch (e) { renderTagError('网络错误'); }
    }

    function renderTagError(msg) {
        dom.tagList.innerHTML = '<div class="empty-state"><p>' + esc(msg) + '</p></div>';
    }

    function renderTagList(filter) {
        filter = (filter || '').toLowerCase();
        var html = '', count = 0;
        state.tags.forEach(function (tag) {
            if (filter && tag.name.toLowerCase().indexOf(filter) === -1) return;
            count++;
            var isActive = state.searchTerms.some(function (term) {
                return term.toLowerCase() === tag.name.toLowerCase() ||
                       tag.name.toLowerCase().indexOf(term.toLowerCase()) !== -1;
            });
            html += '<div class="tag-item' + (isActive ? ' active' : '') + '" data-tag-id="' + escAttr(tag.id) + '" data-tag-name="' + escAttr(tag.name) + '" role="button" tabindex="0">' +
                '<span class="tag-dot" style="background:' + safeColor(tag.color) + '"></span>' +
                '<span class="tag-name">' + esc(tag.name) + '</span>' +
                '<span class="tag-count">' + (tag.count || 0) + '</span></div>';
        });
        if (count === 0) html = '<div class="empty-state"><p>无匹配标签</p></div>';
        dom.tagList.innerHTML = html;
    }

    // ── IMAGES ──────────────────────────────────────────────
    async function loadImages(reset) {
        if (!reset && state.loadingMore) return;
        if (reset) { state.page = 1; state.images = []; state.hasMore = true; }
        if (!state.hasMore) return;

        state.loadingMore = true;
        var params = { action: 'images', page: state.page, per_page: state.perPage };
        if (state.searchTerms.length > 0) {
            params.terms = state.searchTerms.join(',');
        }

        if (reset) dom.imageGrid.innerHTML = '<div class="loading">加载中...</div>';
        else showLoadMoreLoader();

        try {
            var res = await api('images', params);
            if (!res.success) { renderImageError(res.error || '加载失败'); return; }

            var ni = res.data.images || [];
            state.total = res.data.total || 0;
            state.hasMore = res.data.hasMore === true;

            if (reset) {
                state.images = ni;
                dom.imageGrid.innerHTML = '';
            } else {
                var exist = {};
                state.images.forEach(function (i) { exist[i.id] = true; });
                ni.forEach(function (i) { if (!exist[i.id]) state.images.push(i); });
            }

            renderNewImages(ni);
            if (state.hasMore) state.page++;
            else hideLoadMoreLoader();
            updateImageCount();
        } catch (e) {
            renderImageError('网络错误: ' + e.message);
        } finally {
            state.loadingMore = false;
        }
    }

    function renderImageError(msg) {
        state.loadingMore = false;
        hideLoadMoreLoader();
        dom.imageGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9881;</div><p>' + esc(msg) + '</p></div>';
    }

    // DOM节点数限制（防止内存过大）
    var MAX_DOM_NODES = 500; // 最大保留DOM节点数
    var _domCleanupTimer = null;
    
    function cleanupOldDomNodes() {
        if (_domCleanupTimer) clearTimeout(_domCleanupTimer);
        _domCleanupTimer = setTimeout(function() {
            var cards = dom.imageGrid.querySelectorAll('.image-card');
            if (cards.length > MAX_DOM_NODES) {
                // 移除最旧的节点（保留最新加载的）
                var removeCount = cards.length - MAX_DOM_NODES;
                for (var i = 0; i < removeCount; i++) {
                    var card = cards[i];
                    if (card && card.parentNode) {
                        card.parentNode.removeChild(card);
                    }
                }
                // 更新state.images，移除已清理的图片
                if (removeCount > 0 && state.images.length > MAX_DOM_NODES) {
                    state.images = state.images.slice(removeCount);
                    state.page = Math.ceil(state.images.length / state.perPage);
                }
            }
        }, 2000); // 延迟2秒执行，避免阻塞交互
    }

    function renderNewImages(images) {
        state.loadingMore = false;
        hideLoadMoreLoader();

        if (images.length === 0 && state.images.length === 0) {
            var tip = state.searchTerms.length > 0
                ? '没有找到匹配的图片，请尝试调整搜索条件'
                : '资源库为空，请先在 Eagle 中添加图片';
            dom.imageGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>' + tip + '</p></div>';
            return;
        }
        
        // DOM节点数检查
        var currentCount = dom.imageGrid.querySelectorAll('.image-card').length;
        if (currentCount > MAX_DOM_NODES) {
            cleanupOldDomNodes();
        }

        var html = '';
        images.forEach(function (img) {
            var palettes = (img.palettes || []).map(function (c) {
                return '<span style="background:' + safeColor(c) + '"></span>';
            }).join('');
            var tagDots = (img.tags || []).slice(0, 5).map(function (tid) {
                var t = state.tagMap[tid];
                return t ? '<span class="card-tag-dot" style="background:' + safeColor(t.color) + '"></span>' : '';
            }).join('');
            var isVid = !!(img.isVideo);
            var vidIcon = isVid ? '<div class="video-indicator">&#9654;</div>' : '';
            var sel = state.selectedIds[img.id] ? ' checked' : '';

            html += '<div class="image-card' + (isVid ? ' is-video' : '') + '" data-id="' + escAttr(img.id) + '" data-video="' + (isVid ? '1' : '0') + '" title="' + escAttr(img.name || 'Untitled') + '">' +
                (palettes ? '<div class="palette-bar">' + palettes + '</div>' : '') +
                vidIcon +
                '<div class="card-checkbox' + sel + '" data-card-check="' + escAttr(img.id) + '">&#10003;</div>' +
                '<img class="loading" src="api.php?action=image_proxy&id=' + escAttr(img.id) + '&type=thumbnail" alt="" loading="lazy" onload="this.classList.remove(\'loading\')" onerror="this.style.opacity=\'0.2\';this.classList.remove(\'loading\')">' +
                '<div class="card-actions">' +
                '<button class="card-action-btn card-share-btn" data-action="share" data-id="' + escAttr(img.id) + '" title="复制链接">&#128203;</button>' +
                '<button class="card-action-btn card-download-btn" data-action="download" data-id="' + escAttr(img.id) + '" title="下载">&#11015;</button>' +
                '</div>' +
                '<div class="card-overlay"><div class="card-name">' + esc(img.name || 'Untitled') + '</div><div class="card-tags">' + tagDots + '</div></div></div>';
        });
        dom.imageGrid.insertAdjacentHTML('beforeend', html);
    }

    function showLoadMoreLoader() {
        if ($('#loadMoreLoader')) return;
        dom.imageArea.insertAdjacentHTML('beforeend', '<div id="loadMoreLoader" class="load-more"><span>加载更多...</span></div>');
    }
    function hideLoadMoreLoader() { var el = $('#loadMoreLoader'); if (el) el.remove(); }

    var scrollObserver = null;
    function setupInfiniteScroll() {
        destroyScrollObserver();
        var s = document.createElement('div');
        s.id = 'scrollSentinel';
        s.style.cssText = 'height:1px;margin-top:-200px;';
        dom.imageArea.appendChild(s);
        scrollObserver = new IntersectionObserver(function (e) {
            if (e[0].isIntersecting && state.hasMore && !state.loadingMore) loadImages(false);
        }, { rootMargin: '0px', threshold: 0 });
        scrollObserver.observe(s);
    }
    function destroyScrollObserver() {
        if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
        var old = $('#scrollSentinel'); if (old) old.remove();
    }

    function updateImageCount() {
        var n = Object.keys(state.selectedIds).length;
        var filterInfo = state.searchTerms.length > 0;
        var txt = filterInfo ? state.total + ' 个结果' : state.total + ' 张图片';
        if (n > 0) txt += '  |  已选 ' + n + ' 张';
        dom.imageCount.textContent = txt;
    }

    // ── 搜索芯片（折叠显示）────────────────────────────────
    var searchDebounce = null;

    // 计算可见芯片数量（移动端动态，PC 端最多 3 个）
    // 采用先渲染后测量的方式：渲染全部芯片，然后根据搜索框实际宽度逐个隐藏溢出的
    function calcVisibleChipCount() {
        if (state.chipsExpanded) return state.searchTerms.length;
        var count = Math.min(state.MAX_VISIBLE_CHIPS, state.searchTerms.length);
        if (!isMobile) return count;
        
        var box = dom.searchBox;
        if (!box || state.searchTerms.length === 0) return count;
        
        var chipsArea = dom.searchChipsArea;
        var inputWrapper = dom.searchInput ? dom.searchInput.parentElement : null;
        var clearBtn = dom.searchClearBtn;
        
        // 预估：每个芯片约 80-120px，+N 徽章约 40px，输入框 60px，清除按钮 22px
        var chipGap = 4;
        var badgeWidth = 40;
        var inputMinW = 60;
        var clearBtnW = clearBtn && state.searchTerms.length > 0 ? 22 : 0;
        var paddingTotal = 16; // box padding
        
        var availForChips = box.clientWidth - paddingTotal - inputMinW - clearBtnW;
        if (availForChips <= 40) return 0; // 空间不够，全部折叠
        
        // 逐个测量芯片宽度
        var totalChipW = 0;
        var visible = 0;
        for (var i = 0; i < state.searchTerms.length; i++) {
            var term = state.searchTerms[i];
            // 估算每个芯片宽度：dots(8+5) + name(每字~13px, max 60px) + remove(16+5) + padding(5+6) + gap
            var nameW = Math.min(term.length * 13, 60);
            var chipW = 8 + 5 + nameW + 16 + 5 + 5 + 6 + chipGap; // ~105px typical
            if (i < state.searchTerms.length - 1 || totalChipW + chipW > availForChips - badgeWidth) {
                // 还不是最后一个或空间快满了
            }
            if (totalChipW + chipW + (i > 0 && i < state.searchTerms.length - 1 ? badgeWidth : 0) > availForChips) {
                break;
            }
            totalChipW += chipW;
            visible++;
        }
        
        // 如果最后一个芯片之后还有剩余的，需要为 +N badge 留空间
        var hiddenCount = state.searchTerms.length - visible;
        if (hiddenCount > 0 && totalChipW + badgeWidth > availForChips && visible > 0) {
            visible--;
        }
        
        return Math.max(0, visible);
    }

    // 渲染搜索词芯片（折叠模式）
    // 移动端：先渲染全部芯片到 DOM，测量实际宽度后，只隐藏溢出的
    function renderSearchChips() {
        var container = dom.searchChipsArea;
        var terms = state.searchTerms;

        if (terms.length === 0) {
            container.innerHTML = '';
            dom.searchInput.value = '';
            dom.searchInput.placeholder = '输入标签或图片名称（空格分隔多个关键词）';
            hideExpandedChips();
            updateClearButtonVisibility();
            return;
        }
        updateClearButtonVisibility();

        // 展开模式：直接显示全部
        if (state.chipsExpanded) {
            var chipsHtml = '';
            terms.forEach(function (term) {
                var matchedTag = null;
                state.tags.forEach(function (t) {
                    if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
                });
                var colorDot = matchedTag ? '<span class="search-tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '';
                chipsHtml += '<span class="search-tag-chip" data-term="' + escAttr(term) + '">' +
                    colorDot +
                    '<span class="search-tag-name">' + esc(term) + '</span>' +
                    '<span class="search-tag-remove" title="移除">&#215;</span></span>';
            });
            container.innerHTML = chipsHtml;
            dom.searchInput.value = '';
            dom.searchInput.placeholder = '';
            renderExpandedChips();
            return;
        }

        // PC端：动态测量实际宽度，折叠溢出芯片（与移动端逻辑一致）
        if (!isMobile) {
            var allChipsHtml = '';
            terms.forEach(function (term, idx) {
                var matchedTag = null;
                state.tags.forEach(function (t) {
                    if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
                });
                var colorDot = matchedTag ? '<span class="search-tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '';
                allChipsHtml += '<span class="search-tag-chip" data-idx="' + idx + '" data-term="' + escAttr(term) + '">' +
                    colorDot +
                    '<span class="search-tag-name">' + esc(term) + '</span>' +
                    '<span class="search-tag-remove" title="移除">&#215;</span></span>';
            });
            container.innerHTML = allChipsHtml;
            
            // 等待渲染完成后测量
            requestAnimationFrame(function () {
                var chips = container.querySelectorAll('.search-tag-chip');
                if (!chips.length) return;
                var clearBtn = dom.searchClearBtn;
                var box = dom.searchBox;
                if (!box) return;
                var badgeWidth = 40;
                var inputMinW = 80; // PC端输入框最小宽度稍大
                var clearBtnW = (clearBtn && state.searchTerms.length > 0) ? clearBtn.offsetWidth : 0;
                var boxPadding = 20;
                var availForChips = box.clientWidth - boxPadding - inputMinW - clearBtnW;
                var totalW = 0;
                var visibleCount = 0;
                for (var i = 0; i < chips.length; i++) {
                    var chipW = chips[i].offsetWidth + 6; // PC端gap稍大
                    var needBadge = (i < chips.length - 1) ? badgeWidth : 0;
                    if (totalW + chipW + needBadge > availForChips) {
                        break;
                    }
                    totalW += chipW;
                    visibleCount++;
                }
                var hiddenCount = chips.length - visibleCount;
                if (hiddenCount <= 0) {
                    dom.searchInput.value = '';
                    dom.searchInput.placeholder = '添加更多关键词...';
                    return;
                }
                // 隐藏溢出的芯片
                for (var j = visibleCount; j < chips.length; j++) {
                    chips[j].style.display = 'none';
                }
                // 插入 +N 徽章
                var badge = document.createElement('span');
                badge.className = 'search-more-badge';
                badge.id = 'searchMoreBadge';
                badge.textContent = '+' + hiddenCount;
                container.appendChild(badge);
                dom.searchInput.value = '';
                dom.searchInput.placeholder = '添加更多关键词...';
            });
            return;
        }

        // 移动端：先渲染全部芯片，再测量实际宽度，隐藏溢出的
        var allChipsHtml = '';
        terms.forEach(function (term, idx) {
            var matchedTag = null;
            state.tags.forEach(function (t) {
                if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
            });
            var colorDot = matchedTag ? '<span class="search-tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '';
            allChipsHtml += '<span class="search-tag-chip" data-idx="' + idx + '" data-term="' + escAttr(term) + '">' +
                colorDot +
                '<span class="search-tag-name">' + esc(term) + '</span>' +
                '<span class="search-tag-remove" title="移除">&#215;</span></span>';
        });
        container.innerHTML = allChipsHtml;

        // 等待渲染完成后测量
        requestAnimationFrame(function () {
            var chips = container.querySelectorAll('.search-tag-chip');
            if (!chips.length) return;

            var clearBtn = dom.searchClearBtn;
            var inputEl = dom.searchInput;
            var box = dom.searchBox;
            if (!box) return;

            var badgeWidth = 40;  // +N 徽章预估宽度
            var inputMinW = 50;   // 输入框最小宽度
            var clearBtnW = (clearBtn && state.searchTerms.length > 0) ? clearBtn.offsetWidth : 0;
            var boxPadding = 16;

            // 可用于芯片的总宽度
            var availForChips = box.clientWidth - boxPadding - inputMinW - clearBtnW;

            var totalW = 0;
            var visibleCount = 0;

            for (var i = 0; i < chips.length; i++) {
                var chipW = chips[i].offsetWidth + 4; // 4px gap
                var needBadge = (i < chips.length - 1) ? badgeWidth : 0;
                if (totalW + chipW + needBadge > availForChips) {
                    break;
                }
                totalW += chipW;
                visibleCount++;
            }

            var hiddenCount = chips.length - visibleCount;
            if (hiddenCount <= 0) {
                // 全部能显示，无需折叠
                dom.searchInput.value = '';
                dom.searchInput.placeholder = '添加更多关键词...';
                return;
            }

            // 隐藏溢出的芯片
            for (var j = visibleCount; j < chips.length; j++) {
                chips[j].style.display = 'none';
            }

            // 插入 +N 徽章
            var badge = document.createElement('span');
            badge.className = 'search-more-badge';
            badge.id = 'searchMoreBadge';
            badge.textContent = '+' + hiddenCount;
            container.appendChild(badge);

            dom.searchInput.value = '';
            dom.searchInput.placeholder = '添加更多关键词...';
        });
    }

    // 渲染展开的芯片面板
    function renderExpandedChips() {
        var panel = dom.searchChipsExpanded;
        if (!panel) return;
        
        // 先移除旧的监听器，防止内存泄漏
        panel.onmouseleave = null;
        
        var html = '';
        state.searchTerms.forEach(function (term) {
            var matchedTag = null;
            state.tags.forEach(function (t) {
                if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
            });
            var colorDot = matchedTag ? '<span class="search-tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '';
            html += '<span class="search-tag-chip" data-term="' + escAttr(term) + '">' +
                colorDot +
                '<span class="search-tag-name">' + esc(term) + '</span>' +
                '<span class="search-tag-remove" title="移除">&#215;</span></span>';
        });
        panel.innerHTML = html;
        panel.classList.add('visible');
        
        // 重新绑定鼠标离开事件：鼠标移走自动关闭
        panel.onmouseleave = function () {
            state.chipsExpanded = false;
            hideExpandedChips();
            renderSearchChips();
        };
    }

    function hideExpandedChips() {
        var panel = dom.searchChipsExpanded;
        if (panel) panel.classList.remove('visible');
    }

    // 更新清除按钮显示状态
    function updateClearButtonVisibility() {
        if (!dom.searchClearBtn) return;
        var hasTerms = state.searchTerms.length > 0 || (dom.searchInput && dom.searchInput.value.trim().length > 0);
        if (hasTerms) {
            dom.searchClearBtn.classList.add('visible');
        } else {
            dom.searchClearBtn.classList.remove('visible');
        }
    }

    // 清除所有搜索条件
    function clearAllSearchTerms() {
        state.searchTerms = [];
        state.chipsExpanded = false;
        if (dom.searchInput) dom.searchInput.value = '';
        renderSearchChips();
        renderTagList(dom.tagFilter ? dom.tagFilter.value : '');
        loadImages(true);
    }

    // 点击 +X more 打开模态窗口
    function onMoreBadgeClick(e) {
        var badge = e.target.closest('#searchMoreBadge');
        if (!badge) return;
        e.stopPropagation();
        openTagsModal();
    }

    // 打开标签管理模态窗口
    function openTagsModal() {
        if (!dom.tagsModalOverlay) return;
        renderTagsModalContent();
        dom.tagsModalOverlay.classList.add('visible');
        // 聚焦到输入框
        if (dom.tagsModalInput) {
            dom.tagsModalInput.value = '';
            dom.tagsModalInput.focus();
        }
    }

    // 关闭标签管理模态窗口
    function closeTagsModal() {
        if (!dom.tagsModalOverlay) return;
        dom.tagsModalOverlay.classList.remove('visible');
    }

    // 渲染模态窗口内容
    function renderTagsModalContent() {
        if (!dom.tagsModalContent) return;
        
        if (state.searchTerms.length === 0) {
            dom.tagsModalContent.innerHTML = '<div class="tags-modal-empty">暂无搜索词，请在下方输入添加</div>';
            return;
        }
        
        var html = '';
        state.searchTerms.forEach(function (term) {
            var matchedTag = null;
            state.tags.forEach(function (t) {
                if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
            });
            var colorDot = matchedTag ? '<span class="tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '<span class="tag-dot" style="background:#666"></span>';
            html += '<span class="tags-modal-chip" data-term="' + escAttr(term) + '">' +
                colorDot +
                '<span>' + esc(term) + '</span>' +
                '<span class="tag-remove" data-term="' + escAttr(term) + '">&#215;</span></span>';
        });
        dom.tagsModalContent.innerHTML = html;
    }

    // 模态窗口内移除标签
    function onTagsModalRemove(e) {
        var removeBtn = e.target.closest('.tag-remove');
        if (!removeBtn) return;
        var term = removeBtn.dataset.term;
        var idx = -1;
        state.searchTerms.forEach(function (t, i) {
            if (t.toLowerCase() === term.toLowerCase()) idx = i;
        });
        if (idx !== -1) state.searchTerms.splice(idx, 1);
        renderTagsModalContent();
        renderSearchChips();
        renderTagList(dom.tagFilter.value);
        loadImages(true);
    }

    // 模态窗口内添加标签
    function onTagsModalAdd() {
        if (!dom.tagsModalInput) return;
        var val = dom.tagsModalInput.value.trim();
        if (!val) return;
        
        // 支持空格分隔多个
        var terms = val.split(/\s+/).filter(function (t) { return t; });
        terms.forEach(function (term) {
            var exists = state.searchTerms.some(function (t) { return t.toLowerCase() === term.toLowerCase(); });
            if (!exists) state.searchTerms.push(term);
        });
        
        dom.tagsModalInput.value = '';
        renderTagsModalContent();
        renderSearchChips();
        renderTagList(dom.tagFilter.value);
        loadImages(true);
    }

    // 点击芯片 X 移除
    function onRemoveSearchChip(e) {
        var removeBtn = e.target.closest('.search-tag-remove');
        if (!removeBtn) return;
        var chip = removeBtn.closest('.search-tag-chip');
        if (!chip) return;
        var term = chip.dataset.term;
        var idx = -1;
        state.searchTerms.forEach(function (t, i) {
            if (t.toLowerCase() === term.toLowerCase()) idx = i;
        });
        if (idx !== -1) state.searchTerms.splice(idx, 1);
        
        // 如果全部移除，关闭展开状态
        if (state.searchTerms.length <= state.MAX_VISIBLE_CHIPS) {
            state.chipsExpanded = false;
            hideExpandedChips();
        }
        
        renderSearchChips();
        renderTagList(dom.tagFilter.value);
        loadImages(true);
    }

    // 点击搜索框外部关闭展开面板
    function onDocumentClick(e) {
        if (!state.chipsExpanded) return;
        var box = dom.searchBox;
        var expanded = dom.searchChipsExpanded;
        if (!box || !expanded) return;
        if (!box.contains(e.target) && !expanded.contains(e.target)) {
            state.chipsExpanded = false;
            hideExpandedChips();
            renderSearchChips();
        }
    }

    // 搜索框输入处理
    function onSearchInput(e) {
        // 实时更新清除按钮显示
        updateClearButtonVisibility();
        if (e.type === 'keydown' && e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchDebounce);
            var val = (dom.searchInput.value || '').trim();
            if (val) {
                var newTerms = val.split(/\s+/).filter(function (t) { return t.length > 0; });
                newTerms.forEach(function (term) {
                    if (!state.searchTerms.some(function (t) { return t.toLowerCase() === term.toLowerCase(); })) {
                        state.searchTerms.push(term);
                    }
                });
            }
            renderSearchChips();
            renderTagList(dom.tagFilter.value);
            loadImages(true);
            return;
        }
    }

    // 点击标签栏标签 → 添加到搜索词
    function onTagClick(e) {
        e.stopPropagation(); // 防止冒泡到 document 关闭侧边栏（移动端）
        var el = e.target.closest('.tag-item');
        if (!el) return;
        var tagName = el.dataset.tagName;
        if (!tagName) return;
        
        var idx = -1;
        state.searchTerms.forEach(function (t, i) {
            if (t.toLowerCase() === tagName.toLowerCase()) idx = i;
        });
        if (idx !== -1) {
            state.searchTerms.splice(idx, 1);
        } else {
            state.searchTerms.push(tagName);
        }
        renderSearchChips();
        renderTagList(dom.tagFilter.value);
        loadImages(true);
    }

    function onTagFilter(e) { renderTagList(e.target.value); }
    function onTagKeydown(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTagClick(e); } }

    // ── 侧边栏 ───────────────────────────────────────────────
    function setupSidebarToggle() {
        var sb = dom.tagSidebar, tb = dom.sidebarToggle;
        if (!sb || !tb) return;
        var SB_W = 260;
        function collapse() {
            sb.classList.add('collapsed');
            if (!isMobile) tb.style.left = '20px';
        }
        function expand() {
            sb.classList.remove('collapsed');
            if (!isMobile) tb.style.left = (SB_W + 20) + 'px';
        }
        tb.addEventListener('click', function (e) {
            e.stopPropagation();
            if (sb.classList.contains('collapsed')) expand();
            else collapse();
        });
        // 移动端点击侧边栏外部关闭
        if (isMobile) {
            document.addEventListener('click', function (e) {
                if (!sb.classList.contains('collapsed') && 
                    !sb.contains(e.target) && 
                    !tb.contains(e.target)) {
                    collapse();
                }
            });
            collapse();
        } else {
            expand();
        }
    }

    // ── 多选模式 ─────────────────────────────────────────────
    function toggleMultiMode() {
        state.multiMode = !state.multiMode;
        if (!state.multiMode) {
            state.selectedIds = {};
            state.selectAllVisible = false;
            // 清除所有卡片的勾选状态（修复：退出多选模式后勾选框残留问题）
            var checkboxes = document.querySelectorAll('.card-checkbox.checked');
            checkboxes.forEach(function (cb) {
                cb.classList.remove('checked');
            });
        }
        dom.multiSelectToggle.classList.toggle('active', state.multiMode);
        dom.imageGrid.classList.toggle('multi-mode', state.multiMode);
        updateSelectionUI();
    }

    function toggleSelectImage(id) {
        if (state.selectedIds[id]) delete state.selectedIds[id];
        else state.selectedIds[id] = true;
        updateCardCheckbox(id);
        updateSelectionUI();
    }

    function updateCardCheckbox(id) {
        var el = $('[data-card-check="' + id.replace(/"/g, '\\"') + '"]');
        if (el) el.classList.toggle('checked', !!state.selectedIds[id]);
    }

    function updateSelectionUI() {
        var n = Object.keys(state.selectedIds).length;
        dom.topbarMultiDownload.style.display = n > 0 ? 'inline-flex' : 'none';
        dom.topbarMultiDownload.disabled = n === 0;
        updateImageCount();
    }

    function onTopbarMultiDownload() {
        var ids = Object.keys(state.selectedIds);
        if (ids.length === 0) { showToast('请先选择图片'); return; }

        var count = 0, failed = 0, total = ids.length, done = false;

        ids.forEach(function (id, idx) {
            setTimeout(function () {
                var img = state.images.find(function (i) { return i.id === id; });
                if (!img) { failed++; checkDone(); return; }

                var a = document.createElement('a');
                a.href = 'api.php?action=image_proxy&id=' + encodeURIComponent(id) + '&type=download';
                a.download = (img.name || 'image') + '.' + (img.ext || 'jpg');
                a.target = '_blank';

                try {
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    count++;
                } catch (err) { failed++; }
                checkDone();
            }, idx * 400);
        });

        function checkDone() {
            if (done) return;
            if (count + failed >= total) {
                done = true;
                toggleMultiMode();
                if (count === total) showToast('成功下载 ' + total + ' 张图片', 4000);
                else if (count > 0) showToast('下载完成 ' + count + ' 张，' + failed + ' 张失败', 5000);
                else showToast('下载失败：浏览器可能阻止了自动下载', 6000);
            }
        }

        showToast('开始下载 ' + total + ' 张图片...', 3000);
    }

    function triggerDownload(img) {
        var a = document.createElement('a');
        a.href = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=download';
        a.download = (img.name || 'image') + '.' + (img.ext || 'jpg');
        a.target = '_blank';
        try { document.body.appendChild(a); a.click(); document.body.removeChild(a); }
        catch (e) { showToast('下载失败，请检查浏览器设置', 4000); }
    }

    // ── LIGHTBOX ZOOM ─────────────────────────────────────────
    var _z = {
        scale: 1, ox: 0, oy: 0,
        dragging: false, dragSX: 0, dragSY: 0, dragOX: 0, dragOY: 0,
        hideTimer: null, HIDE_DELAY: 2500,
        initialScale: 1,
        isPinching: false, pinchStartDist: 0, pinchStartScale: 1,
    };

    // 计算初始缩放比例（让图片自适应屏幕尺寸）
    function _calcInitialScale(img) {
        // 可用区域：考虑绝对定位的容器边界
        // top: 40px, bottom: 100px, left/right: 80px
        var maxW = window.innerWidth - 160; // 80px * 2
        var maxH = window.innerHeight - 140; // 40px + 100px
        var w = img.naturalWidth || 100;
        var h = img.naturalHeight || 100;
        
        // 计算让图片完全适配可用区域的缩放比例
        var scaleW = maxW / w;
        var scaleH = maxH / h;
        var fitScale = Math.min(scaleW, scaleH);
        
        // 如果图片比可用区域小，不放大超过 100%（保持原始清晰度）
        // 如果图片比可用区域大，缩小到适配
        return Math.min(fitScale, 1);
    }

    function _resetZoom() {
        _z.scale = _z.initialScale;
        _z.ox = 0;
        _z.oy = 0;
        _z.isPinching = false;
        if (!dom.lightboxImage) return;
        // 重置到初始缩放状态（适配屏幕）
        dom.lightboxImage.style.transform = 'scale(' + _z.initialScale + ')';
        dom.lightboxImage.classList.remove('zoomed');
        dom.lightboxImage.style.cursor = 'default';
        _updateZoomBar();
    }

    function _applyZoom() {
        if (!dom.lightboxImage) return;
        // 应用变换：先平移，再缩放
        // transform-origin: center center 确保缩放以图片中心为基准
        dom.lightboxImage.style.transform = 'translate(' + _z.ox + 'px, ' + _z.oy + 'px) scale(' + _z.scale + ')';
        
        // 当缩放比例大于初始缩放时，认为是放大状态
        var isZoomed = _z.scale > _z.initialScale * 1.01; // 1% 容差
        dom.lightboxImage.classList.toggle('zoomed', isZoomed);
        dom.lightboxImage.style.cursor = isZoomed ? (_z.dragging ? 'grabbing' : 'grab') : 'default';
        _updateZoomBar();
    }

    function _updateZoomBar() {
        // 显示相对于初始缩放的百分比
        // 比如 initialScale=0.5, scale=1.0 时，显示 200%
        var relativeScale = _z.scale / _z.initialScale;
        var pct = Math.round(relativeScale * 100);
        if (dom.zoomSlider) dom.zoomSlider.value = pct;
        if (dom.zoomLabel) dom.zoomLabel.textContent = pct + '%';
    }

    function _showZoomBar() {
        var bar = dom.zoomBar;
        if (!bar) return;
        bar.classList.add('visible');
        _updateZoomBar();
        if (_z.hideTimer) clearTimeout(_z.hideTimer);
        _z.hideTimer = setTimeout(function () { bar.classList.remove('visible'); }, _z.HIDE_DELAY);
    }

    function _onWheel(e) {
        e.preventDefault();
        var img = dom.lightboxImage;
        if (!img || !img.naturalWidth) return;
        
        // 获取图片当前的显示位置和尺寸
        var rect = img.getBoundingClientRect();
        
        // 鼠标相对于图片中心的位置（图片中心为缩放基准点）
        var imgCenterX = rect.left + rect.width / 2;
        var imgCenterY = rect.top + rect.height / 2;
        var mouseX = e.clientX - imgCenterX;
        var mouseY = e.clientY - imgCenterY;
        
        // 计算新缩放比例
        var factor = e.deltaY > 0 ? 0.9 : 1.1; // 缩小 90%，放大 110%
        var newScale = Math.max(_z.initialScale * 0.3, Math.min(_z.initialScale * 10, _z.scale * factor));
        
        // 缩放比例变化
        var ratio = newScale / _z.scale;
        
        // 调整偏移量，保持鼠标指向的图片位置不变
        // 原理：鼠标在图片上的相对位置不变
        // 当前鼠标指向位置 = (mouseX - ox) / scale
        // 缩放后该位置应该不变：(mouseX - ox_new) / newScale = (mouseX - ox) / scale
        // 解得：ox_new = mouseX - (mouseX - ox) * ratio
        _z.ox = mouseX - (mouseX - _z.ox) * ratio;
        _z.oy = mouseY - (mouseY - _z.oy) * ratio;
        _z.scale = newScale;
        
        _applyZoom();
        _showZoomBar();
    }

    function _onMouseDown(e) {
        // 只有放大状态才能拖动
        if (_z.scale <= _z.initialScale * 1.01) return;
        e.preventDefault();
        _z.dragging = true;
        _z.dragSX = e.clientX; _z.dragSY = e.clientY;
        _z.dragOX = _z.ox; _z.dragOY = _z.oy;
        dom.lightboxImage.classList.add('zooming');
    }

    function _onMouseMove(e) {
        if (!_z.dragging) return;
        // 拖动时，偏移量随鼠标移动（方向一致）
        _z.ox = _z.dragOX + (e.clientX - _z.dragSX);
        _z.oy = _z.dragOY + (e.clientY - _z.dragSY);
        _applyZoom();
    }

    function _onMouseUp() { 
        _z.dragging = false; 
        if (dom.lightboxImage) dom.lightboxImage.classList.remove('zooming');
    }

    function _onDblClick(e) {
        e.preventDefault();
        // 双击切换：放大到 200% 或重置
        if (_z.scale > _z.initialScale * 1.01) { 
            _resetZoom(); 
            return; 
        }
        
        var img = dom.lightboxImage;
        if (!img) return;
        
        // 放大到 200%（相对于初始缩放）
        _z.scale = _z.initialScale * 2;
        _z.ox = 0;
        _z.oy = 0;
        _applyZoom();
        _showZoomBar();
    }

    // ── 触摸缩放/平移（移动端灯箱） ─────────────────────────
    function _getPinchDistance(touches) {
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _onImgTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            e.stopPropagation();
            _z.isPinching = true;
            _z.pinchStartDist = _getPinchDistance(e.touches);
            _z.pinchStartScale = _z.scale;
        } else if (e.touches.length === 1 && _z.scale > _z.initialScale * 1.01) {
            e.stopPropagation();
            _z.dragging = true;
            _z.dragSX = e.touches[0].clientX;
            _z.dragSY = e.touches[0].clientY;
            _z.dragOX = _z.ox;
            _z.dragOY = _z.oy;
            if (dom.lightboxImage) dom.lightboxImage.classList.add('zooming');
        }
    }

    function _onImgTouchMove(e) {
        if (_z.isPinching && e.touches.length === 2) {
            e.preventDefault();
            e.stopPropagation();
            var dist = _getPinchDistance(e.touches);
            var ratio = dist / _z.pinchStartDist;
            var newScale = Math.max(_z.initialScale * 0.3, Math.min(_z.initialScale * 10, _z.pinchStartScale * ratio));
            var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            var img = dom.lightboxImage;
            if (img) {
                var rect = img.getBoundingClientRect();
                var imgCenterX = rect.left + rect.width / 2;
                var imgCenterY = rect.top + rect.height / 2;
                var mouseX = midX - imgCenterX;
                var mouseY = midY - imgCenterY;
                var scaleRatio = newScale / _z.scale;
                _z.ox = mouseX - (mouseX - _z.ox) * scaleRatio;
                _z.oy = mouseY - (mouseY - _z.oy) * scaleRatio;
            }
            _z.scale = newScale;
            _applyZoom();
            _showZoomBar();
        } else if (_z.dragging && e.touches.length === 1) {
            e.stopPropagation();
            _z.ox = _z.dragOX + (e.touches[0].clientX - _z.dragSX);
            _z.oy = _z.dragOY + (e.touches[0].clientY - _z.dragSY);
            _applyZoom();
        }
    }

    function _onImgTouchEnd(e) {
        if (e.touches.length < 2) {
            _z.isPinching = false;
        }
        if (e.touches.length === 0) {
            _z.dragging = false;
            if (dom.lightboxImage) dom.lightboxImage.classList.remove('zooming');
        }
    }

    function _bindZoom() {
        var img = dom.lightboxImage;
        if (!img) return;
        img.addEventListener('wheel', _onWheel, { passive: false });
        img.addEventListener('mousedown', _onMouseDown);
        img.addEventListener('dblclick', _onDblClick);
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup', _onMouseUp);
        document.addEventListener('mouseleave', _onMouseUp);
        // 移动端触摸手势：双指缩放 + 放大后单指平移
        if (isMobile) {
            img.addEventListener('touchstart', _onImgTouchStart, { passive: false });
            img.addEventListener('touchmove', _onImgTouchMove, { passive: false });
            img.addEventListener('touchend', _onImgTouchEnd, { passive: true });
        }
    }

    function _unbindZoom() {
        var img = dom.lightboxImage;
        if (img) {
            img.removeEventListener('wheel', _onWheel);
            img.removeEventListener('mousedown', _onMouseDown);
            img.removeEventListener('dblclick', _onDblClick);
            if (isMobile) {
                img.removeEventListener('touchstart', _onImgTouchStart);
                img.removeEventListener('touchmove', _onImgTouchMove);
                img.removeEventListener('touchend', _onImgTouchEnd);
            }
        }
        document.removeEventListener('mousemove', _onMouseMove);
        document.removeEventListener('mouseup', _onMouseUp);
        document.removeEventListener('mouseleave', _onMouseUp);
        _z.isPinching = false;
        _z.dragging = false;
        if (dom.zoomBar) dom.zoomBar.classList.remove('visible');
    }

    // ── LIGHTBOX ─────────────────────────────────────────────
    function onImageClick(e) {
        var cb = e.target.closest('.card-checkbox');
        if (cb) { e.stopPropagation(); toggleSelectImage(cb.dataset.cardCheck); return; }

        var actionBtn = e.target.closest('.card-action-btn');
        if (actionBtn) {
            e.stopPropagation();
            var action = actionBtn.dataset.action;
            var id = actionBtn.dataset.id;
            if (action === 'share') copyShareLink(id);
            else if (action === 'download') {
                var img = state.images.find(function (i) { return i.id === id; });
                if (img) triggerDownload(img);
            }
            return;
        }

        var card = e.target.closest('.image-card');
        if (!card) return;
        var id = card.dataset.id;

        if (state.multiMode) {
            e.stopPropagation();
            toggleSelectImage(id);
            return;
        }

        var idx = state.images.findIndex(function (img) { return img.id === id; });
        openLightbox(idx === -1 ? 0 : idx);
    }

    function openLightbox(idx) {
        state.lightboxIndex = idx;
        state.lightboxIds = state.images.map(function (img) { return img.id; });
        _resetZoom();
        _unbindZoom();
        dom.lightbox.classList.add('active');
        dom.lightboxSpinner.style.display = 'flex';
        dom.lightboxImage.style.display = 'none';
        dom.lightboxVideo.style.display = 'none';
        dom.lightboxImage.style.transform = '';
        dom.lightboxImage.className = '';
        dom.lightboxImage.style.cursor = 'default';
        document.body.style.overflow = 'hidden';
        _bindZoom();
        updateLightboxNav();
        renderLightbox(idx);
        if (dom.zoomBar) dom.zoomBar.classList.remove('visible');
        
        // 预加载相邻图片
        preloadAdjacentImages(idx);
        
        // 显示快捷键提示，3秒后淡出
        showShortcutsTip();
    }

    // 快捷键提示显示和淡出
    var _shortcutsTimer = null;
    function showShortcutsTip() {
        if (!dom.lightboxShortcuts) return;
        // 显示提示
        dom.lightboxShortcuts.classList.remove('fading');
        dom.lightboxShortcuts.style.opacity = '1';
        
        // 清除之前的定时器
        if (_shortcutsTimer) clearTimeout(_shortcutsTimer);
        
        // 3秒后淡出
        _shortcutsTimer = setTimeout(function () {
            dom.lightboxShortcuts.classList.add('fading');
        }, 3000);
    }

    function renderLightbox(idx) {
        var images = state.images;
        if (idx < 0 || idx >= images.length) return;
        var img = images[idx];
        dom.lightboxSpinner.style.display = 'flex';
        dom.lightboxImage.style.display = 'none';
        dom.lightboxVideo.style.display = 'none';
        // 暂停并清空视频（防止切换时继续播放）
        dom.lightboxVideo.pause();
        dom.lightboxVideo.removeAttribute('src');
        dom.lightboxVideo.load();
        _resetZoom();

        var isVid = !!(img.isVideo);
        if (isVid) {
            // 视频灯箱：暂停图片缩放功能，展开媒体容器以容纳视频控件
            _unbindZoom();
            if (dom.mediaWrapper) {
                dom.mediaWrapper.style.pointerEvents = 'auto';
                dom.mediaWrapper.style.bottom = isMobile ? '70px' : '80px';
            }
            dom.lightboxImage.style.display = 'none';
            var videoSrc = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=image&_t=' + Date.now();
            dom.lightboxVideo.src = videoSrc;
            dom.lightboxVideo.style.display = 'block';
            dom.lightboxVideo.load();
            dom.lightboxVideo.play().catch(function(){});
            dom.lightboxSpinner.style.display = 'none';
            if (dom.zoomBar) dom.zoomBar.classList.remove('visible');
        } else {
            // 图片灯箱：恢复媒体容器样式
            if (dom.mediaWrapper) {
                dom.mediaWrapper.style.pointerEvents = '';
                dom.mediaWrapper.style.bottom = '';
            }
            // 图片灯箱：重新绑定缩放功能
            _bindZoom();
            // 加载原图（带时间戳防止缓存）
            dom.lightboxImage.onload = function () {
                dom.lightboxSpinner.style.display = 'none';
                dom.lightboxImage.style.display = 'block';
                
                // 计算初始缩放比例（让大图适配屏幕）
                _z.initialScale = _calcInitialScale(dom.lightboxImage);
                _z.scale = _z.initialScale;
                _z.ox = 0; _z.oy = 0;
                
                // 应用初始缩放
                dom.lightboxImage.style.transform = 'scale(' + _z.initialScale + ')';
                _updateZoomBar();
            };
            dom.lightboxImage.onerror = function () {
                dom.lightboxSpinner.style.display = 'none';
                dom.lightboxImage.style.display = 'none';
                var dlUrl = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=download';
                dom.lightboxInfo.innerHTML =
                    '<div class="lb-name">' + esc(img.name || 'Untitled') + '</div>' +
                    '<div style="color:#ff6b6b;font-size:13px;margin-top:8px;">原图加载失败，请下载查看</div>' +
                    '<div style="margin-top:10px;"><a href="' + dlUrl + '" download style="display:inline-block;padding:8px 16px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;">下载原图</a></div>';
            };
            // 使用 type=image 确保输出原图，加时间戳
            dom.lightboxImage.src = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=image&_t=' + Date.now();
        }

        dom.lightboxImage.dataset.id = img.id;
        dom.lightboxImage.dataset.name = img.name || '';
        dom.lightboxImage.dataset.ext = img.ext || '';

        var tags = (img.tags || []).map(function (tid) {
            var t = state.tagMap[tid];
            return t ? '<span class="lb-tag" style="background:' + safeColor(t.color) + '">' + esc(t.name) + '</span>' : '';
        }).join('');
        dom.lightboxInfo.innerHTML =
            '<div class="lb-name">' + esc(img.name || 'Untitled') + '</div>' +
            (tags ? '<div class="lb-tags">' + tags + '</div>' : '');
        updateLightboxNav();

        var dlUrl = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=download';
        dom.lightboxDownload.href = dlUrl;
        dom.lightboxDownload.download = (img.name || 'image') + '.' + (img.ext || 'jpg');
        // 下载按钮显示文件大小
        var sizeText = img.size ? formatSize(img.size) : '';
        dom.lightboxDownload.innerHTML = '&#11015; 下载' + (sizeText ? ' <span class="lb-download-size">' + sizeText + '</span>' : '');
    }

    function closeLightbox() {
        _resetZoom(); _unbindZoom();
        dom.lightbox.classList.remove('active');
        if (dom.lightboxVideo) { dom.lightboxVideo.pause(); dom.lightboxVideo.src = ''; }
        if (dom.mediaWrapper) {
            dom.mediaWrapper.style.pointerEvents = '';
            dom.mediaWrapper.style.bottom = '';
        }
        document.body.style.overflow = '';
        state.lightboxIndex = -1;
        state.chipsExpanded = false;
        hideExpandedChips();
    }

    function lightboxNav(dir) {
        var ni = state.lightboxIndex + dir;
        if (ni < 0 || ni >= state.images.length) return;
        state.lightboxIndex = ni;
        updateLightboxNav();
        renderLightbox(ni);
        if (dom.zoomBar) dom.zoomBar.classList.remove('visible');
        // 预加载相邻图片
        preloadAdjacentImages(ni);
    }

    function updateLightboxNav() {
        var t = state.images.length, i = state.lightboxIndex;
        dom.lightboxPrev.style.visibility = i > 0 ? 'visible' : 'hidden';
        dom.lightboxNext.style.visibility = i < t - 1 ? 'visible' : 'hidden';
    }

    // ── 缩放按钮 ─────────────────────────────────────────────
    function bindZoomBar() {
        function zoomAtCenter(factor) {
            var img = dom.lightboxImage;
            if (!img || !img.naturalWidth) return;
            
            // 计算新缩放比例
            var newScale = Math.max(_z.initialScale * 0.3, Math.min(_z.initialScale * 10, _z.scale * factor));
            
            // 以图片中心为缩放中心（偏移量按比例缩放）
            var ratio = newScale / _z.scale;
            _z.ox = _z.ox * ratio;
            _z.oy = _z.oy * ratio;
            _z.scale = newScale;
            
            _applyZoom();
            _showZoomBar();
        }
        if (dom.zoomIn) dom.zoomIn.onclick = function () { zoomAtCenter(1.1); };
        if (dom.zoomOut) dom.zoomOut.onclick = function () { zoomAtCenter(0.9); };
        if (dom.zoomReset) dom.zoomReset.onclick = function () { _resetZoom(); _showZoomBar(); };
        if (dom.zoomSlider) {
            dom.zoomSlider.oninput = function (e) {
                var targetPct = parseFloat(e.target.value) / 100; // 比如 200 表示 200%
                var img = dom.lightboxImage;
                if (!img || !img.naturalWidth) return;
                
                // 目标缩放比例 = 初始缩放 * 目标百分比
                var newScale = _z.initialScale * targetPct;
                
                // 以图片中心为缩放中心
                var ratio = newScale / _z.scale;
                _z.ox = _z.ox * ratio;
                _z.oy = _z.oy * ratio;
                _z.scale = newScale;
                
                _applyZoom();
                _showZoomBar();
            };
            dom.zoomSlider.onmousedown = function () { if (_z.hideTimer) clearTimeout(_z.hideTimer); };
        }
        var bar = dom.zoomBar;
        if (bar) {
            bar.onmouseenter = function () { if (_z.hideTimer) clearTimeout(_z.hideTimer); bar.classList.add('visible'); };
            bar.onmouseleave = function () {
                if (_z.hideTimer) clearTimeout(_z.hideTimer);
                _z.hideTimer = setTimeout(function () { bar.classList.remove('visible'); }, 800);
            };
        }
    }

    // ── 分享链接 ─────────────────────────────────────────────
    function getBaseUrl() { return window.location.href.replace(/\/[^\/]*$/, ''); }

    function copyShareLink(imgId) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'api.php?action=share_link&id=' + encodeURIComponent(imgId), true);
        xhr.onload = function () {
            try {
                var r = JSON.parse(xhr.responseText);
                if (r.success && r.data && r.data.url) {
                    navigator.clipboard.writeText(r.data.url).then(function () {
                        showToast('链接已复制，可粘贴到浏览器直接查看', 4000);
                    }).catch(function () { fallbackCopy(r.data.url); });
                } else {
                    fallbackCopy(getBaseUrl() + '/api.php?action=image_proxy&id=' + encodeURIComponent(imgId) + '&type=image');
                }
            } catch (e) {
                fallbackCopy(getBaseUrl() + '/api.php?action=image_proxy&id=' + encodeURIComponent(imgId) + '&type=image');
            }
        };
        xhr.onerror = function () {
            fallbackCopy(getBaseUrl() + '/api.php?action=image_proxy&id=' + encodeURIComponent(imgId) + '&type=image');
        };
        xhr.send();
    }

    function fallbackCopy(url) {
        var inp = document.createElement('input');
        inp.value = url;
        inp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(inp);
        inp.select();
        try {
            document.execCommand('copy');
            showToast('链接已复制，可粘贴到浏览器直接查看', 3000);
        } catch (e) {
            showToast('复制失败，请手动复制地址栏链接', 4000);
        }
        document.body.removeChild(inp);
    }

    function onLightboxShare() {
        var i = state.lightboxIndex;
        if (i < 0 || i >= state.images.length) return;
        copyShareLink(state.images[i].id);
    }

    // ── Toast ────────────────────────────────────────────────
    function showToast(msg, dur) {
        dur = dur || 3000;
        var old = $('#toast'); if (old) old.remove();
        var t = document.createElement('div');
        t.id = 'toast';
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;z-index:9999;white-space:nowrap;animation:fadeIn 0.2s;pointer-events:none;max-width:90vw;';
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.remove(); }, dur);
    }

    // ── 事件绑定 ─────────────────────────────────────────────
    function bindEvents() {
        // 搜索框
        dom.searchInput.addEventListener('keydown', onSearchInput);
        dom.searchInput.addEventListener('input', onSearchInput);
        dom.searchInput.addEventListener('focus', function () { dom.searchTips.classList.add('visible'); });
        dom.searchInput.addEventListener('blur', function () { setTimeout(function () { dom.searchTips.classList.remove('visible'); }, 200); });
        // 搜索框清除按钮
        if (dom.searchClearBtn) {
            dom.searchClearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                clearAllSearchTerms();
            });
        }

        // 搜索芯片区域
        dom.searchChipsArea.addEventListener('click', onRemoveSearchChip);
        dom.searchBox.addEventListener('click', onMoreBadgeClick);
        document.addEventListener('click', onDocumentClick);

        // 标签栏
        dom.tagFilter.addEventListener('input', onTagFilter);
        dom.tagList.addEventListener('click', onTagClick);
        dom.tagList.addEventListener('keydown', onTagKeydown);

        // 图片网格
        dom.imageGrid.addEventListener('click', onImageClick);

        // 多选
        dom.multiSelectToggle.addEventListener('click', toggleMultiMode);
        dom.topbarMultiDownload.addEventListener('click', onTopbarMultiDownload);

        // 灯箱
        dom.lightboxClose.addEventListener('click', closeLightbox);
        if (dom.lightboxBackdrop) dom.lightboxBackdrop.addEventListener('click', function (e) {
            if (e.target === dom.lightboxBackdrop) closeLightbox();
        });
        dom.lightbox.addEventListener('click', function (e) {
            if (e.target === dom.lightbox) closeLightbox();
        });
        dom.lightboxPrev.addEventListener('click', function (e) { e.stopPropagation(); lightboxNav(-1); });
        dom.lightboxNext.addEventListener('click', function (e) { e.stopPropagation(); lightboxNav(1); });
        dom.lightboxDownload.addEventListener('click', function (e) { e.stopPropagation(); });
        dom.lightboxShare.addEventListener('click', function (e) { e.stopPropagation(); onLightboxShare(); });

        bindZoomBar();

        // 键盘快捷键
        document.addEventListener('keydown', function (e) {
            // 标签管理模态窗口：ESC 关闭
            if (dom.tagsModalOverlay && dom.tagsModalOverlay.classList.contains('visible')) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeTagsModal();
                    return;
                }
            }
            
            if (dom.lightbox.classList.contains('active')) {
                if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); lightboxNav(-1); }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); lightboxNav(1); }
                if (e.ctrlKey && e.key === 'c') {
                    var i = state.lightboxIndex;
                    if (i >= 0 && i < state.images.length) {
                        e.preventDefault();
                        copyShareLink(state.images[i].id);
                    }
                }
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    var i = state.lightboxIndex;
                    if (i >= 0 && i < state.images.length) {
                        var img = state.images[i];
                        var a = document.createElement('a');
                        a.href = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=download';
                        a.download = (img.name || 'image') + '.' + (img.ext || 'jpg');
                        a.target = '_blank';
                        try { document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast('正在下载...', 2000); }
                        catch (err) { showToast('下载失败', 3000); }
                    }
                }
                return;
            }
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                dom.searchInput.focus();
                dom.searchInput.select();
            }
        });

        dom.btnRefresh.addEventListener('click', function () {
            loadImages(true);
            loadTags();
            showToast('刷新中...', 1500);
        });

        // 标签管理模态窗口事件
        if (dom.tagsModalClose) {
            dom.tagsModalClose.addEventListener('click', closeTagsModal);
        }
        if (dom.tagsModalOverlay) {
            dom.tagsModalOverlay.addEventListener('click', function (e) {
                if (e.target === dom.tagsModalOverlay) closeTagsModal();
            });
        }
        if (dom.tagsModalAdd) {
            dom.tagsModalAdd.addEventListener('click', onTagsModalAdd);
        }
        // 标签管理弹窗清除全部按钮
        if (dom.tagsModalClear) {
            dom.tagsModalClear.addEventListener('click', function () {
                clearAllSearchTerms();
                renderTagsModalContent();
            });
        }
        if (dom.tagsModalInput) {
            dom.tagsModalInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onTagsModalAdd();
                }
            });
        }
        if (dom.tagsModalContent) {
            dom.tagsModalContent.addEventListener('click', onTagsModalRemove);
        }
    }

    // ── 触摸手势支持 ─────────────────────────────────────────────
    var _touch = {
        startX: 0, startY: 0,
        startTime: 0,
        isSwiping: false
    };

    function setupTouchGestures() {
        if (!isMobile) return;
        
        // 灯箱触摸滑动
        var lightboxContent = dom.lightbox ? dom.lightbox.querySelector('.lightbox-content') : null;
        if (lightboxContent) {
            lightboxContent.addEventListener('touchstart', onTouchStart, { passive: true });
            lightboxContent.addEventListener('touchmove', onTouchMove, { passive: true });
            lightboxContent.addEventListener('touchend', onTouchEnd, { passive: true });
        }
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            _touch.startX = e.touches[0].clientX;
            _touch.startY = e.touches[0].clientY;
            _touch.startTime = Date.now();
            _touch.isSwiping = true;
        }
    }

    function onTouchMove(e) {
        if (!_touch.isSwiping || e.touches.length !== 1) return;
        // 可以在这里添加实时反馈
    }

    function onTouchEnd(e) {
        if (!_touch.isSwiping) return;
        _touch.isSwiping = false;
        
        // 图片已放大时不触发滑动切换（由触摸手势处理平移）
        if (_z.scale > _z.initialScale * 1.01) return;
        
        var endX = e.changedTouches[0].clientX;
        var endY = e.changedTouches[0].clientY;
        var deltaX = endX - _touch.startX;
        var deltaY = endY - _touch.startY;
        var deltaTime = Date.now() - _touch.startTime;
        
        // 水平滑动距离 > 50px，垂直滑动距离 < 50px，时间 < 500ms
        if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50 && deltaTime < 500) {
            if (deltaX > 0) {
                // 向右滑动 = 上一张
                lightboxNav(-1);
            } else {
                // 向左滑动 = 下一张
                lightboxNav(1);
            }
        }
    }

    // ── 工具函数 ─────────────────────────────────────────────
    function esc(s) { s = (s == null ? '' : String(s)); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function escAttr(s) { s = (s == null ? '' : String(s)); return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function safeColor(c) {
        if (!c || typeof c !== 'string') return '#888';
        // 合法的hex格式：#fff 或 #ffffff
        if (/^#[0-9a-f]{3,6}$/i.test(c)) return c;
        // 合法的rgba格式：rgba(r,g,b) 或 rgba(r,g,b,a)
        if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(c)) return c;
        // 合法的hsl格式
        if (/^hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*(,\s*[\d.]+\s*)?\)$/i.test(c)) return c;
        // 数字格式："255,100,50" 转换为 hex
        if (/^[0-9,.-]+$/.test(c)) {
            var parts = c.split(',');
            if (parts.length >= 3) return '#' + parts.slice(0, 3).map(function (p) {
                return Math.max(0, Math.min(255, Math.round(parseFloat(p)))).toString(16).padStart(2, '0');
            }).join('');
        }
        // 非法格式返回默认颜色
        return '#888';
    }
    function formatSize(b) {
        if (!b) return '';
        if (b >= 1048576) return (b/1048576).toFixed(1) + ' MB';
        if (b >= 1024) return (b/1024).toFixed(0) + ' KB';
        return b + ' B';
    }

    document.addEventListener('DOMContentLoaded', init);
})();