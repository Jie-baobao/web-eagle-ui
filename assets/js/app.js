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
        dom.topbarDlCount        = $('#topbarDlCount');
        dom.lightbox             = $('#lightbox');
        dom.lightboxImage        = $('#lightboxImage');
        dom.lightboxVideo        = $('#lightboxVideo');
        dom.lightboxInfo         = $('#lightboxInfo');
        dom.lightboxClose        = $('#lightboxClose');
        dom.lightboxPrev         = $('#lightboxPrev');
        dom.lightboxNext         = $('#lightboxNext');
        dom.lightboxDownload     = $('#lightboxDownload');
        dom.lightboxShare        = $('#lightboxShare');
        dom.lightboxCounter      = $('#lightboxCounter');
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

    // ── INIT ────────────────────────────────────────────────
    async function init() {
        initDom();
        setupSidebarToggle();
        bindEvents();
        setupInfiniteScroll();

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

    // 渲染搜索词芯片（折叠模式）
    function renderSearchChips() {
        var container = dom.searchChipsArea;
        var terms = state.searchTerms;
        
        if (terms.length === 0) {
            container.innerHTML = '';
            dom.searchInput.value = '';
            dom.searchInput.placeholder = '输入标签或图片名称（空格分隔多个关键词）';
            hideExpandedChips();
            return;
        }

        var visibleCount = state.chipsExpanded ? terms.length : Math.min(state.MAX_VISIBLE_CHIPS, terms.length);
        var hiddenCount = terms.length - visibleCount;
        if (state.chipsExpanded) hiddenCount = 0;

        // 显示的芯片
        var chipsHtml = '';
        for (var i = 0; i < visibleCount; i++) {
            var term = terms[i];
            var matchedTag = null;
            state.tags.forEach(function (t) {
                if (t.name.toLowerCase() === term.toLowerCase()) matchedTag = t;
            });
            var colorDot = matchedTag ? '<span class="search-tag-dot" style="background:' + safeColor(matchedTag.color) + '"></span>' : '';
            chipsHtml += '<span class="search-tag-chip" data-term="' + escAttr(term) + '">' +
                colorDot +
                '<span class="search-tag-name">' + esc(term) + '</span>' +
                '<span class="search-tag-remove" title="移除">&#215;</span></span>';
        }

        // 折叠徽章
        if (hiddenCount > 0) {
            chipsHtml += '<span class="search-more-badge" id="searchMoreBadge">+' + hiddenCount + '</span>';
        }

        container.innerHTML = chipsHtml;
        dom.searchInput.value = '';
        dom.searchInput.placeholder = state.chipsExpanded ? '' : '添加更多关键词...';
        
        // 如果展开状态，显示展开面板
        if (state.chipsExpanded) {
            renderExpandedChips();
        }
    }

    // 渲染展开的芯片面板
    function renderExpandedChips() {
        var panel = dom.searchChipsExpanded;
        if (!panel) return;
        
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
        
        // 绑定鼠标离开事件：鼠标移走自动关闭
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
        state.chipsExpanded = state.searchTerms.length > state.MAX_VISIBLE_CHIPS;
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
            tb.style.left = '20px';
        }
        function expand() {
            sb.classList.remove('collapsed');
            tb.style.left = (SB_W + 20) + 'px';
        }
        tb.addEventListener('click', function (e) {
            e.stopPropagation();
            if (sb.classList.contains('collapsed')) expand();
            else collapse();
        });
        expand();
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
        dom.topbarDlCount.textContent = n > 0 ? n : '';
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
        initialScale: 1, // 初始缩放比例（让图片适配屏幕）
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

    function _bindZoom() {
        var img = dom.lightboxImage;
        if (!img) return;
        img.addEventListener('wheel', _onWheel, { passive: false });
        img.addEventListener('mousedown', _onMouseDown);
        img.addEventListener('dblclick', _onDblClick);
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup', _onMouseUp);
        document.addEventListener('mouseleave', _onMouseUp);
    }

    function _unbindZoom() {
        var img = dom.lightboxImage;
        if (img) {
            img.removeEventListener('wheel', _onWheel);
            img.removeEventListener('mousedown', _onMouseDown);
            img.removeEventListener('dblclick', _onDblClick);
        }
        document.removeEventListener('mousemove', _onMouseMove);
        document.removeEventListener('mouseup', _onMouseUp);
        document.removeEventListener('mouseleave', _onMouseUp);
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
        _resetZoom();

        var isVid = !!(img.isVideo);
        if (isVid) {
            dom.lightboxVideo.src = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=image&_t=' + Date.now();
            dom.lightboxVideo.style.display = 'block';
            dom.lightboxSpinner.style.display = 'none';
        } else {
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
                
                // 调试信息
                console.log('Image loaded:', dom.lightboxImage.naturalWidth + 'x' + dom.lightboxImage.naturalHeight, 
                           'Initial scale:', _z.initialScale, 
                           'Display size:', Math.round(dom.lightboxImage.naturalWidth * _z.initialScale) + 'x' + Math.round(dom.lightboxImage.naturalHeight * _z.initialScale));
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
        var sz = img.width && img.height ? img.width + ' x ' + img.height : (img.size ? formatSize(img.size) : '');
        dom.lightboxInfo.innerHTML =
            '<div class="lb-name">' + esc(img.name || 'Untitled') + '</div>' +
            (tags ? '<div class="lb-tags">' + tags + '</div>' : '') +
            (sz ? '<div class="lb-size">' + esc(sz) + '</div>' : '');
        updateLightboxNav();

        var dlUrl = 'api.php?action=image_proxy&id=' + encodeURIComponent(img.id) + '&type=download';
        dom.lightboxDownload.href = dlUrl;
        dom.lightboxDownload.download = (img.name || 'image') + '.' + (img.ext || 'jpg');
    }

    function closeLightbox() {
        _resetZoom(); _unbindZoom();
        dom.lightbox.classList.remove('active');
        if (dom.lightboxVideo) { dom.lightboxVideo.pause(); dom.lightboxVideo.src = ''; }
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
    }

    function updateLightboxNav() {
        var t = state.images.length, i = state.lightboxIndex;
        dom.lightboxCounter.textContent = (i + 1) + ' / ' + t;
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

    // ── 工具函数 ─────────────────────────────────────────────
    function esc(s) { s = (s == null ? '' : String(s)); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function escAttr(s) { s = (s == null ? '' : String(s)); return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function safeColor(c) {
        if (!c || typeof c !== 'string') return '#888';
        if (/^#[0-9a-f]{3,6}$/i.test(c)) return c;
        if (/^[0-9,.-]+$/.test(c)) {
            var parts = c.split(',');
            if (parts.length >= 3) return '#' + parts.slice(0, 3).map(function (p) {
                return Math.max(0, Math.min(255, Math.round(parseFloat(p)))).toString(16).padStart(2, '0');
            }).join('');
        }
        return c;
    }
    function formatSize(b) {
        if (!b) return '';
        if (b >= 1048576) return (b/1048576).toFixed(1) + ' MB';
        if (b >= 1024) return (b/1024).toFixed(0) + ' KB';
        return b + ' B';
    }

    document.addEventListener('DOMContentLoaded', init);
})();
