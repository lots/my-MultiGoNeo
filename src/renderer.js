/* MultiGo Neo renderer — tree-based SGF editor using the my-Sabaki libraries. */
(() => {
  'use strict';

  const S = window.SabakiLibs;
  if (!S) {
    document.body.textContent = 'The Go editor libraries failed to load.';
    return;
  }

  const desktop = window.figdesk ?? null;
  const isElectron = Boolean(desktop?.isElectron);
  const platform = String(desktop?.platform ?? navigator.platform ?? '').toLowerCase();
  const isMac = platform.includes('mac');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad2 = (value) => String(value).padStart(2, '0');
  const timestamp = (date = new Date()) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  const basename = (value) => String(value).split(/[\\/]/).pop() || String(value);
  const isTypingTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };
  const signName = (sign) => (sign > 0 ? 'Black' : 'White');
  const sgfPoint = (x, y) => S.sgf.stringifyVertex([x, y]);
  const DISPLAY_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  function columnLabel(index) {
    if (index < DISPLAY_LETTERS.length) return DISPLAY_LETTERS[index];
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const rest = index - DISPLAY_LETTERS.length;
    return letters[Math.floor(rest / 26)] + letters[rest % 26];
  }
  function coordLabel(x, y, width = null, height = null) {
    const dims = currentBoard
      ? { width: currentBoard.width, height: currentBoard.height }
      : gameSize();
    const w = width ?? dims.width;
    const h = height ?? dims.height;
    if (x < 0 || y < 0 || x >= w || y >= h) return '?';
    return `${columnLabel(x)}${h - y}`;
  }
  function numberToCJK(value) {
    const digits = '一二三四五六七八九';
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number < 1) return '';
    if (number >= 20) {
      return `${digits[Math.floor(number / 10) - 1]}十${number % 10 ? digits[(number - 1) % 10] : ''}`;
    }
    if (number >= 10) return `十${number % 10 ? digits[(number - 1) % 10] : ''}`;
    return digits[(number - 1) % 10];
  }
  const colorCss = { black: '#111', white: '#f5f5f5', red: '#d92b2b', yellow: '#e6b800', blue: '#2f6fed', green: '#1a7f37' };
  // Board themes live in src/themes/*.css; the canvas reads these custom properties.
  const THEMES = ['classic', 'flat', 'dark', 'paper'];
  const DEFAULT_PALETTE = Object.freeze({
    surface: '#d7a760',
    edge: 'rgba(91,56,17,.45)',
    line: 'rgba(38,22,5,.86)',
    lineWidth: 1,
    star: 'rgba(37,22,5,.8)',
    label: 'rgba(61,39,13,.8)',
    blackHi: '#6f6f6f', blackMid: '#292929', blackLow: '#000',
    whiteHi: '#fff', whiteMid: '#f2f2f2', whiteLow: '#c9c9c9', whiteEdge: 'rgba(0,0,0,.28)',
    variant: '#be0119',
    last: '#0165fc', both: '#9a0eea', backer: 'rgba(255,248,235,.82)',
    halo: 'rgba(255,255,255,.88)',
  });
  let palette = { ...DEFAULT_PALETTE };

  function refreshPalette() {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) => {
      const value = style.getPropertyValue(name).trim();
      return value || fallback;
    };
    palette = {
      surface: read('--board-surface', DEFAULT_PALETTE.surface),
      edge: read('--board-edge', DEFAULT_PALETTE.edge),
      line: read('--board-line', DEFAULT_PALETTE.line),
      lineWidth: Number.parseFloat(read('--board-line-width', '1')) || 1,
      star: read('--board-star', DEFAULT_PALETTE.star),
      label: read('--board-label', DEFAULT_PALETTE.label),
      blackHi: read('--stone-black-hi', DEFAULT_PALETTE.blackHi),
      blackMid: read('--stone-black-mid', DEFAULT_PALETTE.blackMid),
      blackLow: read('--stone-black-low', DEFAULT_PALETTE.blackLow),
      whiteHi: read('--stone-white-hi', DEFAULT_PALETTE.whiteHi),
      whiteMid: read('--stone-white-mid', DEFAULT_PALETTE.whiteMid),
      whiteLow: read('--stone-white-low', DEFAULT_PALETTE.whiteLow),
      whiteEdge: read('--stone-white-edge', DEFAULT_PALETTE.whiteEdge),
      variant: read('--overlay-variant', DEFAULT_PALETTE.variant),
      last: read('--overlay-last', DEFAULT_PALETTE.last),
      both: read('--overlay-both', DEFAULT_PALETTE.both),
      backer: read('--overlay-backer', DEFAULT_PALETTE.backer),
      halo: read('--overlay-halo', DEFAULT_PALETTE.halo),
    };
  }

  // AR is double the original 1.8 px stroke; LN is triple.
  const GAME_MARK_ARROW_WIDTH = 1.8 * 2;
  const GAME_MARK_LINE_WIDTH = 1.8 * 3;

  // DOM -----------------------------------------------------------------
  const statuslog = $('#statuslog');
  const workspace = $('#workspace');
  const paneBoard = $('#pane-board');
  const paneInfo = $('#pane-info');
  const paneMoves = $('#pane-moves');
  const paneMessage = $('#pane-message');
  const rightColumn = $('#right-column');
  const verticalSplitter = $('#splitter-v');
  const horizontalSplitter = $('#splitter-h');
  const messageSplitter = $('#splitter-m');
  const clearMessageButton = $('#clear-message-button');
  const boardCanvas = $('#board');
  const boardContext = boardCanvas.getContext('2d');
  const statusNext = $('#status-next');
  const statusCaptures = $('#status-captures');
  const statusStones = $('#status-stones');
  const statusCursor = $('#status-cursor');
  const statusMove = $('#status-move');
  const statusReadonly = $('#status-readonly');
  const fileLabel = $('#file-label');
  const infoDone = $('#info-done');
  const treeMeta = $('#tree-meta');
  const gameTree = $('#game-tree');
  const infoFields = {
    black: $('#info-black'), blackRank: $('#info-black-rank'), blackTeam: $('#info-black-team'),
    white: $('#info-white'), whiteRank: $('#info-white-rank'), whiteTeam: $('#info-white-team'),
    result: $('#info-result'), komi: $('#info-komi'),
    handicap: $('#info-handicap'), rules: $('#info-rules'),
    date: $('#info-date'), time: $('#info-time'), event: $('#info-event'),
    place: $('#info-place'), round: $('#info-round'), gameName: $('#info-game-name'),
    user: $('#info-user'), source: $('#info-source'), copyright: $('#info-copyright'),
    comment: $('#info-comment'), annotation: $('#info-annotation'),
  };
  const toolUndo = $('#tool-undo');
  const toolRedo = $('#tool-redo');
  const toolFirst = $('#tool-first');
  const toolPrev = $('#tool-prev');
  const toolNext = $('#tool-next');
  const toolLast = $('#tool-last');
  const toolAutoPlay = $('#tool-autoplay');
  const toolPass = $('#tool-pass');
  const toolEdit = $('#tool-edit');
  const toolTurn = $('#turn-button');
  const boardSizeSelect = $('#board-size');
  const toggleCoords = $('#toggle-coords');
  const toggleNumbers = $('#toggle-numbers');
  const editbar = $('#editbar');
  const editTools = $$('#edit-tools [data-tool]');
  const colorStrip = $('#line-colors');
  const colorButtons = $$('#line-colors [data-color]');
  const editbarHint = $('#editbar-hint');
  const tabInfo = $('#tab-info');
  const tabComment = $('#tab-comment');
  const panelInfo = $('#panel-info');
  const panelComment = $('#panel-comment');
  const commentTitle = $('#comment-title');
  const commentInput = $('#comment-input');
  const commentPreview = $('#comment-preview');
  const sgfFileInput = $('#sgf-file');
  const confirmDialog = $('#confirm-dialog');
  const confirmMessage = $('#confirm-message');
  const confirmOk = $('#confirm-ok');
  const confirmCancel = $('#confirm-cancel');
  const confirmCancelIcon = $('#confirm-cancel-icon');
  const labelDialog = $('#label-dialog');
  const labelInput = $('#label-input');
  const labelOk = $('#label-ok');
  const labelCancel = $('#label-cancel');
  const labelCancelIcon = $('#label-cancel-icon');
  const customSizeDialog = $('#custom-size-dialog');
  const customSizeInput = $('#custom-size-input');
  const customSizeError = $('#custom-size-error');
  const customSizeApply = $('#custom-size-apply');
  const setupDialog = $('#setup-dialog');
  const setupTheme = $('#setup-theme');
  const setupBrightness = $('#setup-brightness');
  const setupBrightnessValue = $('#setup-brightness-value');
  const setupCoords = $('#setup-coords');
  const setupCoordStyle = $('#setup-coord-style');
  const setupDefaultSize = $('#setup-default-size');
  const setupStoneTexture = $('#setup-stone-texture');
  const setupFocusMarker = $('#setup-focus-marker');
  const setupFocusColor = $('#setup-focus-color');
  const setupHideMarkers = $('#setup-hide-markers');
  const setupNextMoves = $('#setup-next-moves');
  const setupSiblings = $('#setup-siblings');
  const setupNumbers = $('#setup-numbers');
  const setupNumbering = $('#setup-numbering');
  const setupLabelChar = $('#setup-label-char');
  const setupResultTitle = $('#setup-result-title');
  const setupSound = $('#setup-sound');
  const setupDelay = $('#setup-delay');
  const setupPreferVariation = $('#setup-prefer-variation');
  const setupKomi = $('#setup-komi');
  const setupWhiteFirst = $('#setup-white-first');
  const setupRightClickUndo = $('#setup-right-click-undo');
  const setupOpenReadOnly = $('#setup-open-readonly');
  const setupTabs = $$('.setup-tab');
  const setupPanels = $$('.setup-panel');
  const aboutDialog = $('#about-dialog');
  const shortcutsDialog = $('#shortcuts-dialog');
  const aboutRuntime = $('#about-runtime');
  const aboutBoard = $('#about-board');
  const aboutGame = $('#about-game');
  const autoplayLabel = $('#autoplay-label');

  // Settings and messages ------------------------------------------------
  const SETTINGS_KEY = 'figdesk.settings.v2';
  const validBoardSide = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 2 && number <= 52 ? number : null;
  };
  const DEFAULT_SETTINGS = {
    coords: true,
    moveNumberLimit: -1,
    coordinatesStyle: 'A1',
    moveNumbersMode: 'start',
    showNextMoves: false,
    showSiblings: false,
    zoom: 1,
    showTree: true,
    language: 'en',
    theme: 'classic',
    autoLayout: true,
    rememberBoardSize: true,
    boardWidth: null,
    boardHeight: null,
    autoPlayDelay: 1000,
    defaultSize: 13,
    boardBrightness: 1,
    stoneTexture: true,
    focusMarker: 'triangle',
    focusColor: 'red',
    hideMarkers: false,
    labelStartChar: 'A',
    showResultInTitle: true,
    soundEnabled: false,
    preferVariationChild: false,
    defaultKomi: 6.5,
    whiteFirst: false,
    rightClickUndo: false,
    openReadOnly: false,
  };
  let settings = (() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        coords: parsed.coords !== false,
        moveNumberLimit: Number.isInteger(Number(parsed.moveNumberLimit))
          && Number(parsed.moveNumberLimit) >= -1
          && Number(parsed.moveNumberLimit) <= 999
          ? Number(parsed.moveNumberLimit)
          : (parsed.numbers === true ? 0 : -1),
        coordinatesStyle: ['A1', '1-1', 'CJK'].includes(parsed.coordinatesStyle)
          ? parsed.coordinatesStyle
          : 'A1',
        moveNumbersMode: parsed.moveNumbersMode === 'variation' ? 'variation' : 'start',
        showNextMoves: parsed.showNextMoves === true,
        showSiblings: parsed.showSiblings === true,
        zoom: clamp(Number(parsed.zoom) || 1, 0.5, 2),
        showTree: parsed.showTree !== false,
        language: parsed.language === 'zh' ? 'zh' : 'en',
        theme: THEMES.includes(parsed.theme) ? parsed.theme : 'classic',
        autoLayout: parsed.autoLayout !== false,
        rememberBoardSize: parsed.rememberBoardSize !== false,
        boardWidth: validBoardSide(parsed.boardWidth),
        boardHeight: validBoardSide(parsed.boardHeight),
        autoPlayDelay: clamp(Number(parsed.autoPlayDelay) || 1000, 200, 5000),
        defaultSize: [9, 13, 19].includes(Number(parsed.defaultSize)) ? Number(parsed.defaultSize) : 13,
        boardBrightness: clamp(Number(parsed.boardBrightness) || 1, 0.5, 1.5),
        stoneTexture: parsed.stoneTexture !== false,
        focusMarker: ['triangle', 'dot', 'none'].includes(parsed.focusMarker) ? parsed.focusMarker : 'triangle',
        focusColor: ['red', 'blue', 'green', 'yellow', 'white', 'black'].includes(parsed.focusColor) ? parsed.focusColor : 'red',
        hideMarkers: parsed.hideMarkers === true,
        labelStartChar: String(parsed.labelStartChar || 'A').slice(0, 1).toUpperCase() || 'A',
        showResultInTitle: parsed.showResultInTitle !== false,
        soundEnabled: parsed.soundEnabled === true,
        preferVariationChild: parsed.preferVariationChild === true,
        defaultKomi: Number.isFinite(Number(parsed.defaultKomi)) ? Number(parsed.defaultKomi) : 6.5,
        whiteFirst: parsed.whiteFirst === true,
        rightClickUndo: parsed.rightClickUndo === true,
        openReadOnly: parsed.openReadOnly === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  })();

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* session only */ }
  }

  // Recent files ---------------------------------------------------------
  const RECENT_KEY = 'figdesk.recent.v1';
  const RECENT_LIMIT = 7;
  let recentFiles = loadRecentFiles();

  function loadRecentFiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => entry && typeof entry.name === 'string' && entry.name)
        .slice(0, RECENT_LIMIT)
        .map((entry) => ({
          name: entry.name,
          path: typeof entry.path === 'string' ? entry.path : null,
          content: typeof entry.content === 'string' ? entry.content : null,
        }));
    } catch {
      return [];
    }
  }

  function persistRecentFiles() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentFiles));
    } catch {
      // If the cache is full, keep the file names but drop cached SGF text.
      recentFiles = recentFiles.map((entry) => ({ ...entry, content: null }));
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentFiles)); } catch { /* session only */ }
    }
  }

  function rememberRecent(source, content) {
    if (!source || ['the clipboard', 'the link', 'test case'].includes(source)) return;
    const name = isElectron ? basename(source) : source;
    const key = isElectron ? source : name;
    const entry = { name, path: isElectron ? source : null, content: null };
    if (!isElectron && typeof content === 'string' && content.length <= 400000) entry.content = content;
    recentFiles = [entry, ...recentFiles.filter((item) => (isElectron ? item.path : item.name) !== key)]
      .slice(0, RECENT_LIMIT);
    persistRecentFiles();
    renderRecentFiles();
  }

  function clearRecentFiles() {
    if (!recentFiles.length) { log('There are no recent files to clear.', 'warn'); return; }
    recentFiles = [];
    persistRecentFiles();
    renderRecentFiles();
    log('Recent files cleared.');
  }

  function renderRecentFiles() {
    const container = $('#recent-files');
    if (!container) return;
    container.replaceChildren();
    if (!recentFiles.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'menu-item';
      empty.disabled = true;
      empty.setAttribute('role', 'menuitem');
      const check = document.createElement('span');
      check.className = 'menu-check';
      check.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'menu-label';
      label.__enText = 'No recent files';
      label.textContent = t('No recent files');
      empty.append(check, label);
      container.append(empty);
    } else {
      recentFiles.forEach((entry, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-item';
        button.dataset.recentIndex = String(index);
        button.title = entry.path || entry.name;
        button.setAttribute('role', 'menuitem');
        const check = document.createElement('span');
        check.className = 'menu-check';
        check.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'menu-label';
        label.textContent = `${index + 1}. ${entry.name}`;
        button.append(check, label);
        container.append(button);
      });
    }
    const clear = $('#clear-recents');
    if (clear) clear.disabled = recentFiles.length === 0;
  }


  const ZH = {
    File: '文件', Edit: '编辑', Advanced: '高级', Play: '对局', View: '视图', Tools: '工具', Options: '选项', Help: '帮助',
    'New Game': '新建对局', 'Open SGF…': '打开 SGF…', 'Save SGF': '保存 SGF', 'Save SGF As…': '另存为 SGF…', Quit: '退出',
    'Recent Files': '最近文件', 'Clear Recent Files': '清除最近文件', 'No recent files': '暂无最近文件',
    Undo: '撤销', Redo: '重做', 'Edit Mode': '编辑模式', 'Read Only': '只读', 'READ ONLY': '只读', 'Delete Node': '删除节点',
    'Make Main Variation': '设为主变化', 'Shift Variation Left': '左移变化', 'Shift Variation Right': '右移变化',
    'Remove Other Variations': '删除其他变化', 'Clear Node Markup': '清除节点标记', 'Edit Game Info': '编辑对局信息',
    'Edit Node Comment': '编辑节点注释', 'Cut Current Node': '剪切当前节点',
    'Copy Current Variation': '复制当前变化', 'Paste Variation as Child': '粘贴为子变化',
    'Duplicate Current Node': '复制当前节点', 'Insert Empty Node': '插入空节点',
    'Flatten Current Variation': '展平当前变化', 'Copy SGF': '复制 SGF', 'Paste SGF': '粘贴 SGF',
    'Copy SGF to Clipboard': '复制 SGF 到剪贴板', 'Load SGF from Clipboard': '从剪贴板载入 SGF',
    'Clear Messages': '清除消息', Pass: '停一手', 'Auto Play': '自动播放', 'Pause Auto Play': '暂停自动播放',
    'First Move': '第一手', 'Parent Node': '父节点', 'First Child': '第一个子节点', 'Last Move': '最后一手',
    '9 × 9 Board': '9×9 棋盘', '13 × 13 Board': '13×13 棋盘', '19 × 19 Board': '19×19 棋盘',
    'Board Size': '棋盘尺寸', Coordinates: '坐标', 'Move Numbers': '手数', Numbering: '编号起始',
    None: '无', All: '全部', 'Last 10': '最近 10 手', 'Last 25': '最近 25 手', 'Last 50': '最近 50 手',
    'Custom…': '自定义…', 'From Game Start': '从对局开始', 'From Variation Start': '从变化开始',
    'Game Start': '对局开始', 'Variation Start': '变化开始',
    'Custom Board Size…': '自定义棋盘尺寸…', 'Show Coordinates': '显示坐标', 'Coordinates: A1': '坐标：A1',
    'Coordinates: 1–1': '坐标：1–1', 'Coordinates: 四4': '坐标：四4', 'Show Move Numbers': '显示手数',
    'No Move Numbers': '不显示手数', 'All Move Numbers': '显示全部手数', 'Last 10 Moves': '最近 10 手',
    'Last 25 Moves': '最近 25 手', 'Last 50 Moves': '最近 50 手', 'Custom Move Count…': '自定义手数范围…',
    'Move numbers: last N moves': '手数：显示最近 N 手',
    'Enter a whole number of moves from 1 to 999.': '请输入 1 到 999 之间的整数手数。',
    'Numbers From Game Start': '从对局开始编号', 'Numbers From Variation Start': '从变化开始编号',
    'Show Next Moves': '显示下一手', 'Show Sibling Variations': '显示同父变化',
    Theme: '主题', Classic: '经典', Flat: '平面', Dark: '暗色', Paper: '纸张',
    'Theme: Classic': '主题：经典', 'Theme: Flat': '主题：平面', 'Theme: Dark': '主题：暗色', 'Theme: Paper': '主题：纸张',
    'Responsive Layout': '自适应布局', 'Copy Position Link': '复制局面链接',
    'Zoom In': '放大', 'Zoom Out': '缩小', 'Reset Zoom': '重置缩放', 'Toggle Full Screen': '切换全屏',
    'Show Game Tree': '显示棋谱树', 'Reset Panel Layout': '重置面板布局', Done: '完成',
    'Preferences…': '首选项…', 'Set Up…': '设置…', 'Options — Set Up': '选项 — 设置',
    Board: '棋盘', Stones: '棋子', 'Markers & Numbers': '标记与手数', Other: '其他', Traverse: '浏览', 'Set Up categories': '设置分类',
    Brightness: '亮度', 'Show coordinates': '显示坐标', 'Coordinate style': '坐标样式', Surface: '表面',
    'Use stone texture': '使用棋子纹理', 'Focus marker': '焦点标记', 'Focus colour': '焦点颜色',
    Triangle: '三角形', Dot: '圆点', None: '无', Markup: '标记', 'Hide markers': '隐藏标记',
    Branching: '分支', 'Show next moves': '显示下一手', 'Show sibling variations': '显示同父变化',
    'Move numbers': '手数', Numbering: '编号方式', 'Label start character': '标签起始字符',
    Title: '标题', 'Show game result in title': '在标题显示对局结果', Sound: '声音',
    'Play sound on moves': '落子时播放声音', 'Auto-play interval': '自动播放间隔', Variations: '变化',
    'Visit variation branch first when traversing next': '前进时优先访问变化分支',
    'Default Komi': '默认贴目', 'New games': '新对局', 'White move first': '白方先行',
    'Play mode': '对局模式', 'Right-click board removes the current move': '右键移除当前着法',
    Documents: '文档', 'Open existing file as Read Only': '以只读方式打开现有文件',
    'Reset Defaults': '重置默认', OK: '确定',
    'Remember Last Board Size': '记住上次棋盘尺寸',
    'Autoplay Delay': '自动播放间隔',
    'Reset All Settings': '重置所有设置', 'Keyboard Shortcuts': '快捷键', 'About MultiGo Neo': '关于 MultiGo Neo',
    Info: '信息', Comment: '注释', 'Game Tree': '棋谱树', Message: '消息', Clear: '清除',
    Black: '黑方', 'Black rank': '黑方段位', 'Black team': '黑方队伍',
    White: '白方', 'White rank': '白方段位', 'White team': '白方队伍',
    Result: '结果', Komi: '贴目', Handicap: '让子', Rules: '规则', Date: '日期', Time: '时间',
    Event: '赛事', Place: '地点', Round: '轮次', 'Game name': '对局名称',
    User: '用户', Source: '来源', Copyright: '版权', Annotation: '备注',
    'Game comment': '对局注释',
    'Black player': '黑方棋手', 'e.g. 3d': '例：3段', 'White player': '白方棋手', 'e.g. 2k': '例：2级',
    'e.g. B+2.5': '例：B+2.5', 'Game name': '对局名称',
    Japanese: '日本规则', Chinese: '中国规则', AGA: '美国规则', Korean: '韩国规则', NZ: '新西兰规则', Other: '其他',
    Next: '下一手', Captures: '提子', Stones: '棋子', Cursor: '光标', Move: '手数', Turn: '轮次',
    EDIT: '编辑', 'Edit': '编辑', Coords: '坐标', Nums: '手数',
    'Root node': '根节点', Node: '节点', Untitled: '未命名', 'Custom board size': '自定义棋盘尺寸',
    'Custom Board Size': '自定义棋盘尺寸', 'Board size': '棋盘尺寸', 'Theme colour': '主题颜色',
    'Black stone': '黑子', 'White stone': '白子', 'Erase stone': '擦除棋子', Cross: '叉', Triangle: '三角',
    Square: '方块', Circle: '圆形', Line: '线段', Arrow: '箭头', Dim: '阴影', Label: '标签', Number: '数字',
    Red: '红色', Yellow: '黄色', Blue: '蓝色', Green: '绿色',
    'Black stone — click to place': '黑子 — 点击落子', 'White stone — click to place': '白子 — 点击落子',
    'Black stone — click to place, click again to remove': '黑子 — 点击放置，再次点击移除',
    'White stone — click to place, click again to remove': '白子 — 点击放置，再次点击移除',
    'Eraser — click a stone': '橡皮 — 点击棋子', 'Cross — click to toggle': '叉 — 点击切换',
    'Triangle — click to toggle': '三角 — 点击切换', 'Square — click to toggle': '方块 — 点击切换',
    'Circle — click to toggle': '圆形 — 点击切换', 'Line — click start, then end': '线段 — 点击起点，再点终点',
    'Arrow — click start, then end': '箭头 — 点击起点，再点终点', 'Dim — click two corners': '阴影 — 点击两个角',
    'Label — click a point': '标签 — 点击一个点', 'Number — click a point': '数字 — 点击一个点',
    'Stone tool — click to place': '棋子工具 — 点击落子',
    'click the second point (Esc cancels)': '点击第二个点（Esc 取消）',
    'New game (Ctrl+N)': '新建对局 (Ctrl+N)', 'Open SGF (Ctrl+O)': '打开 SGF (Ctrl+O)',
    'Save SGF (Ctrl+S)': '保存 SGF (Ctrl+S)', 'Undo (Ctrl+Z)': '撤销 (Ctrl+Z)',
    'Redo (Ctrl+Shift+Z)': '重做 (Ctrl+Shift+Z)', 'Root node (Home)': '根节点 (Home)',
    'Parent node (Up)': '父节点 (Up)', 'First child (Down)': '第一个子节点 (Down)',
    'End of variation (End)': '变化末端 (End)', 'Auto play (Space)': '自动播放 (Space)',
    'Pass (P)': '停一手 (P)', 'Edit mode (Ctrl+E)': '编辑模式 (Ctrl+E)',
    'Show coordinates': '显示坐标', 'Show move numbers': '显示手数', 'Board size': '棋盘尺寸',
    'Black stone (Ctrl+1)': '黑子 (Ctrl+1)', 'White stone (Ctrl+1 again toggles)': '白子 (Ctrl+1 再按切换)',
    'Cross (Ctrl+2)': '叉 (Ctrl+2)', 'Triangle (Ctrl+3)': '三角 (Ctrl+3)', 'Square (Ctrl+4)': '方块 (Ctrl+4)',
    'Circle (Ctrl+5)': '圆形 (Ctrl+5)', 'Line (Ctrl+6)': '线段 (Ctrl+6)', 'Arrow (Ctrl+7)': '箭头 (Ctrl+7)',
    'Dim area (Ctrl+Shift+D)': '阴影区域 (Ctrl+Shift+D)', 'Label (Ctrl+8)': '标签 (Ctrl+8)',
    'Number (Ctrl+9)': '数字 (Ctrl+9)', 'Switch player to move': '切换行棋方',
    'New game': '新建对局', 'Open SGF': '打开 SGF', 'Save SGF': '保存 SGF', Undo: '撤销', Redo: '重做',
    'Root node': '根节点', 'Parent node': '父节点', 'First child': '第一个子节点', 'End of variation': '变化末端',
    'Auto play': '自动播放', 'Edit mode': '编辑模式', Close: '关闭', Cancel: '取消', Apply: '应用',
    Save: '保存', Continue: '继续', Preferences: '首选项', General: '常规', 'Default board size': '默认棋盘尺寸',
    'Auto-play delay': '自动播放间隔', 'Board coordinates': '棋盘坐标', 'Move numbers': '手数',
    'Show A–T / 1–19': '显示 A–T / 1–19', 'Draw numbers on stones': '在棋子上显示手数',
    'Custom board size': '自定义棋盘尺寸', Size: '尺寸', 'Label text': '标签文本',
    'Write a comment for this node. Markdown is supported.': '为此节点写注释，支持 Markdown。',
    '9 × 9': '9×9', '13 × 13': '13×13', '19 × 19': '19×19',
    'Enter width*height, with each side an integer from 2 to 52. Example: 5*9 = five columns by nine rows.':
      '输入“宽*高”，每边为 2 到 52 的整数。例如：5*9 表示 5 列 × 9 行。',
    'Use width*height, for example 5*9.': '请使用“宽*高”格式，例如 5*9。',
    'Enter a board size such as 5*9.': '请输入棋盘尺寸，例如 5*9。',
    'Each side must be an integer from 2 to 52': '每边必须是 2 到 52 的整数',
  };
  const t = (value) => (settings.language === 'zh' ? (ZH[value] ?? value) : value);
  const languageAttributeCache = new WeakMap();

  function log(message, level = 'info') {
    const line = document.createElement('div');
    line.className = 'status-line';
    const time = document.createElement('span');
    time.className = 'status-time';
    time.textContent = timestamp();
    const dot = document.createElement('span');
    dot.className = `status-dot ${level}`;
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'status-text';
    text.textContent = String(message);
    line.title = String(message);
    line.append(time, dot, text);
    statuslog.append(line);
    while (statuslog.childElementCount > 120) statuslog.firstElementChild.remove();
    statuslog.scrollTop = statuslog.scrollHeight;
  }

  function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  // State ----------------------------------------------------------------
  let nextNodeId = 1;
  const getId = () => nextNodeId++;
  let tree = null;
  let nodeId = null;
  let mode = 'play';
  let selectedTool = 'stone_1';
  let lineColor = null;
  let dimColor = null;
  let pending = null;
  let activeTab = 'info';
  let commentNodeId = null;
  let variationClipboard = '';
  let readOnly = false;
  let cleanTree = null;
  let cleanNodeId = null;
  let undoStack = [];
  let redoStack = [];
  let autoPlayTimer = null;
  let filePath = null;
  let infoFocusSnapshot = null;
  let dirty = false;
  let cursor = null;
  let hover = null;
  let currentBoard = null;
  let lastBoardError = '';
  let portraitLayout = false;
  let responsiveFrame = 0;

  const startupParams = new URLSearchParams(window.location.search);
  const startupSgf = startupParams.get('sgf');
  const startupPath = startupParams.get('path') || '';
  let startupPathApplied = false;

  const currentNode = () => (tree && nodeId != null ? tree.get(nodeId) : null);

  function markClean() {
    cleanTree = tree;
    cleanNodeId = nodeId;
  }

  function rootProperty(prop, fallback = null) {
    if (!tree) return fallback;
    const value = tree.root.data[prop];
    return value && value.length && value[0] !== '' ? value[0] : fallback;
  }

  function gameSize() {
    const [width, height] = S.getGameInfo(tree).size;
    return { width, height: height || width };
  }

  function gameInfoForNewGame() {
    return {
      ...S.getGameInfo(tree),
      blackTeam: rootProperty('BT', ''),
      whiteTeam: rootProperty('WT', ''),
      time: rootProperty('TM', ''),
      place: rootProperty('PC', ''),
      round: rootProperty('RO', ''),
      user: rootProperty('US', ''),
      source: rootProperty('SO', ''),
      copyright: rootProperty('CP', ''),
      annotation: rootProperty('AN', ''),
    };
  }

  function rememberBoardSize(width, height) {
    if (settings.rememberBoardSize === false) return;
    settings.boardWidth = validBoardSide(width);
    settings.boardHeight = validBoardSide(height);
    saveSettings();
  }

  const playerToMove = () => S.getPlayer(tree, nodeId);
  const nodeMoveNumber = (id = nodeId) => S.getMoveNumber(tree, id);

  // Tree lifecycle -------------------------------------------------------
  function createRoot(width, height) {
    return {
      id: getId(),
      data: {
        GM: ['1'], FF: ['4'], CA: ['UTF-8'], AP: ['MultiGo Neo:1.0'],
        SZ: [width === height ? String(width) : `${width}:${height}`],
        KM: [String(Number.isFinite(settings.defaultKomi) ? settings.defaultKomi : 6.5)],
        RU: ['Japanese'], DT: [todayString()],
        ...(settings.whiteFirst ? { PL: ['W'] } : {}),
      },
      parentId: null,
      children: [],
    };
  }

  function startGame(size, options = {}) {
    stopAutoPlay();
    let width;
    let height;
    if (size && typeof size === 'object') {
      width = Number(size.width);
      height = Number(size.height);
    } else {
      width = Number(size);
      height = width;
    }
    width = clamp(Math.round(width) || settings.defaultSize, 2, 52);
    height = clamp(Math.round(height) || width, 2, 52);
    if (options.persistSize !== false) rememberBoardSize(width, height);
    const root = createRoot(width, height);
    const map = {
      blackName: 'PB', blackRank: 'BR', blackTeam: 'BT',
      whiteName: 'PW', whiteRank: 'WR', whiteTeam: 'WT',
      result: 'RE', komi: 'KM', handicap: 'HA', rules: 'RU', date: 'DT',
      time: 'TM', eventName: 'EV', place: 'PC', round: 'RO', gameComment: 'GC',
      gameName: 'GN', user: 'US', source: 'SO', copyright: 'CP', annotation: 'AN',
    };
    if (options.info) {
      for (const [key, prop] of Object.entries(map)) {
        const value = options.info[key];
        if (value != null && value !== '') root.data[prop] = [String(value)];
      }
    }
    tree = new S.GameTree({ root, getId, merger: S.nodeMerger });
    nodeId = root.id;
    currentBoard = null;
    undoStack = [];
    redoStack = [];
    mode = 'play';
    selectedTool = 'stone_1';
    lineColor = null;
    dimColor = null;
    pending = null;
    filePath = options.filePath ?? null;
    dirty = Boolean(options.dirty);
    cursor = null;
    hover = null;
    commentNodeId = null;
    S.clearBoardCache();
    refreshBoard();
    syncInfoForm();
    syncSizeSelect();
    setTab('info');
    renderAll();
    resizeBoard();
    updateTitle();
    if (!dirty) markClean();
  }

  function refreshBoard() {
    if (!tree) return;
    try {
      currentBoard = S.getBoard(tree, nodeId);
      lastBoardError = '';
    } catch (error) {
      currentBoard = null;
      if (lastBoardError !== error.message) {
        lastBoardError = error.message;
        log(`Could not build the board: ${error.message}`, 'error');
      }
    }
  }

  // Mutations and undo ---------------------------------------------------
  function mutateTree(mutator, { message = null, select = null, undoable = true } = {}) {
    if (readOnly) { log('Read Only: the game tree is locked.', 'warn'); return false; }
    const previousTree = tree;
    const previousNode = nodeId;
    let nextTree;
    try {
      nextTree = tree.mutate(mutator);
    } catch (error) {
      log(`Could not update the game tree: ${error.message}`, 'error');
      return false;
    }
    if (!nextTree || nextTree === previousTree) return false;
    if (undoable) {
      undoStack.push({ tree: previousTree, nodeId: previousNode });
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }
    tree = nextTree;
    if (select != null) nodeId = typeof select === 'function' ? select(tree) : select;
    if (!tree.get(nodeId)) nodeId = tree.root.id;
    dirty = true;
    S.clearBoardCache();
    refreshBoard();
    renderAll();
    if (message) log(message);
    return true;
  }

  function undo() {
    if (readOnly) { log('Read Only: undo is disabled.', 'warn'); return; }
    if (!undoStack.length) { log('Nothing to undo.', 'warn'); return; }
    stopAutoPlay();
    redoStack.push({ tree, nodeId });
    const snapshot = undoStack.pop();
    tree = snapshot.tree;
    nodeId = snapshot.nodeId;
    pending = null;
    dirty = true;
    S.clearBoardCache();
    refreshBoard();
    renderAll();
    syncInfoForm();
    log('Undo.');
  }

  function redo() {
    if (readOnly) { log('Read Only: redo is disabled.', 'warn'); return; }
    if (!redoStack.length) { log('Nothing to redo.', 'warn'); return; }
    stopAutoPlay();
    undoStack.push({ tree, nodeId });
    const snapshot = redoStack.pop();
    tree = snapshot.tree;
    nodeId = snapshot.nodeId;
    pending = null;
    dirty = true;
    S.clearBoardCache();
    refreshBoard();
    renderAll();
    syncInfoForm();
    log('Redo.');
  }

  // Navigation -----------------------------------------------------------
  function selectNode(id, { stop = true } = {}) {
    if (!tree || !tree.get(id) || id === nodeId) return;
    if (stop) stopAutoPlay();
    nodeId = id;
    pending = null;
    cursor = null;
    hover = null;
    refreshBoard();
    renderAll();
    logNodeProperties(tree.get(id));
  }

  function goToParent() {
    const node = currentNode();
    if (!node || node.parentId == null) { log('Already at the root.', 'warn'); return; }
    selectNode(node.parentId);
  }

  function preferredChild(node) {
    if (!node || node.children.length === 0) return null;
    return settings.preferVariationChild ? node.children[node.children.length - 1] : node.children[0];
  }

  function goToChild() {
    const node = currentNode();
    const child = preferredChild(node);
    if (!child) { log('No continuation from this node.', 'warn'); return; }
    selectNode(child.id);
  }

  function goToSibling(direction) {
    const node = currentNode();
    if (!node || node.parentId == null) return;
    const parent = tree.get(node.parentId);
    const index = parent.children.findIndex((child) => child.id === node.id);
    const next = parent.children[index + direction];
    if (next) selectNode(next.id);
  }

  function goToBeginning() { selectNode(tree.root.id); }

  function goToEnd() {
    let node = tree.root;
    while (node.children.length) node = preferredChild(node);
    selectNode(node.id);
  }

  // Position-path DSL (see src/path-spec.js) ------------------------------
  function applyPositionPath(spec) {
    if (!tree || !window.MultiGoPath) return false;
    const tokens = window.MultiGoPath.parse(spec);
    if (!tokens.length) { log('The position path is empty.', 'warn'); return false; }
    const target = window.MultiGoPath.resolve(spec, tree, tree.root.id);
    if (target == null) { log('Could not resolve the position path.', 'warn'); return false; }
    selectNode(target);
    log(`Position path applied: ${spec}.`);
    return true;
  }

  function maybeApplyStartupPath() {
    if (!startupPath || startupPathApplied || !tree || tree.getHeight() <= 1) return false;
    startupPathApplied = true;
    return applyPositionPath(startupPath);
  }

  async function copyPositionLink() {
    if (!tree) return;
    const spec = window.MultiGoPath ? window.MultiGoPath.build(tree, nodeId) : '';
    const sgf = S.sgf.stringify([tree.root], { linebreak: '', indent: '' });
    const base = window.location.href.split(/[?#]/)[0];
    const url = `${base}?sgf=${encodeURIComponent(sgf)}&path=${encodeURIComponent(spec)}`;
    try {
      await navigator.clipboard.writeText(url);
      log('Position link copied to the clipboard.', 'success');
    } catch {
      log('Clipboard write was blocked by the browser.', 'warn');
    }
  }

  function stopAutoPlay() {
    if (!autoPlayTimer) return;
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
    updateToolbar();
    syncMenuState();
  }

  function toggleAutoPlay() {
    if (autoPlayTimer) { stopAutoPlay(); log('Auto-play paused.'); return; }
    let node = currentNode();
    if (!node) return;
    if (!node.children.length) {
      nodeId = tree.root.id;
      refreshBoard();
      renderAll();
      node = currentNode();
    }
    if (!node || !node.children.length) { log('There are no further moves.', 'warn'); return; }
    autoPlayTimer = setInterval(() => {
      const current = currentNode();
      const next = preferredChild(current);
      if (next) {
        nodeId = next.id;
        pending = null;
        cursor = null;
        refreshBoard();
        renderAll();
      } else {
        stopAutoPlay();
        log('Reached the end of the variation.');
      }
    }, settings.autoPlayDelay);
    updateToolbar();
    syncMenuState();
    log(`Auto-play started at ${settings.autoPlayDelay} ms per move.`);
  }

  // Play/edit ------------------------------------------------------------
  function findChildMove(prop, value) {
    const node = currentNode();
    return node ? node.children.find((child) => child.data[prop] && child.data[prop][0] === value) : null;
  }

  let moveAudioContext = null;

  function playMoveSound(pass = false) {
    if (!settings.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      moveAudioContext ||= new AudioContextClass();
      const oscillator = moveAudioContext.createOscillator();
      const gain = moveAudioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = pass ? 330 : 660;
      gain.gain.setValueAtTime(0.0001, moveAudioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, moveAudioContext.currentTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, moveAudioContext.currentTime + 0.055);
      oscillator.connect(gain).connect(moveAudioContext.destination);
      oscillator.start();
      oscillator.stop(moveAudioContext.currentTime + 0.06);
    } catch { /* sound is best-effort */ }
  }

  function playAt(x, y) {
    if (!currentBoard) return;
    if (mode === 'edit') { editAt(x, y); return; }
    const sign = playerToMove();
    const analysis = currentBoard.analyzeMove(sign, [x, y]);
    if (analysis.overwrite) { log('That point is already occupied.', 'warn'); return; }
    if (analysis.suicide) { log('Suicide is not allowed.', 'warn'); return; }
    if (analysis.ko) { log('Ko: that recapture is not allowed yet.', 'warn'); return; }

    const prop = sign > 0 ? 'B' : 'W';
    const value = sgfPoint(x, y);
    const existing = findChildMove(prop, value);
    if (existing) { selectNode(existing.id); return; }

    let selectedId = null;
    const ok = mutateTree(
      (draft) => { selectedId = draft.appendNode(nodeId, { [prop]: [value] }); },
      { select: () => selectedId },
    );
    if (ok) {
      cursor = { x, y };
      hover = null;
      playMoveSound();
      renderStatus();
      logNodeProperties(currentNode());
    }
  }

  function passTurn() {
    if (mode === 'edit') { log('Pass is only available in play mode.', 'warn'); return; }
    const sign = playerToMove();
    const prop = sign > 0 ? 'B' : 'W';
    const existing = findChildMove(prop, '');
    if (existing) { selectNode(existing.id); return; }
    let selectedId = null;
    const ok = mutateTree(
      (draft) => { selectedId = draft.appendNode(nodeId, { [prop]: [''] }); },
      { select: () => selectedId },
    );
    if (ok) {
      playMoveSound(true);
      logNodeProperties(currentNode());
    }
  }

  // Markup ---------------------------------------------------------------
  const MARK_PROPS = ['CR', 'MA', 'SQ', 'TR'];
  const MARK_TYPE = { cross: 'MA', triangle: 'TR', square: 'SQ', circle: 'CR' };

  function expandValues(values) {
    if (!values) return [];
    const result = [];
    for (const value of values) {
      try {
        for (const vertex of S.sgf.parseCompressedVertices(value)) {
          result.push(sgfPoint(vertex[0], vertex[1]));
        }
      } catch { /* ignore malformed */ }
    }
    return [...new Set(result)];
  }

  function writeList(draft, id, prop, values) {
    if (values.length) draft.updateProperty(id, prop, [...new Set(values)]);
    else draft.removeProperty(id, prop);
  }

  function removePointFromProperty(draft, id, prop, point) {
    const data = tree.get(id).data[prop];
    if (!data) return;
    writeList(draft, id, prop, expandValues(data).filter((value) => value !== point));
  }

  const LOG_PROPERTY_ORDER = [
    'B', 'W', 'AB', 'AW', 'AE', 'PL', 'CR', 'SQ', 'TR', 'MA', 'SL', 'LB',
    'AR', 'LN', 'DD', 'SBKDD',
  ];
  const LOG_PROPERTY_EXCLUDED = new Set([
    'GM', 'FF', 'CA', 'AP', 'SZ', 'ST',
    'PB', 'BR', 'BT', 'PW', 'WR', 'WT', 'HA', 'KM', 'RU', 'TM', 'OT',
    'DT', 'EV', 'GN', 'PC', 'RO', 'GC', 'ON', 'RE', 'AN', 'CP', 'SO', 'US',
    'C',
  ]);

  function sgfPropertyText(prop, values) {
    const list = Array.isArray(values) ? values : [];
    return `${prop}${list.length
      ? list.map((value) => `[${value ?? ''}]`).join('')
      : '[]'}`;
  }

  function logNodeProperties(node) {
    if (!node || !node.data) return;
    const properties = Object.keys(node.data)
      .filter((prop) => !LOG_PROPERTY_EXCLUDED.has(prop) && Array.isArray(node.data[prop]))
      .sort((a, b) => {
        const ai = LOG_PROPERTY_ORDER.indexOf(a);
        const bi = LOG_PROPERTY_ORDER.indexOf(b);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      });
    for (const prop of properties) {
      if (!node.data[prop].length) continue;
      log(`${nodeMoveNumber(node.id)}. ${sgfPropertyText(prop, node.data[prop])}`);
    }
  }

  function logNodeProperty(prop) {
    const node = currentNode();
    if (!node) return;
    const values = node.data?.[prop] || [];
    if (prop === 'SBKDD' && !values.length) return;
    log(`${nodeMoveNumber()}. ${sgfPropertyText(prop, values)}`);
  }

  function setSetupStone(x, y, sign) {
    const point = sgfPoint(x, y);
    const node = currentNode();
    if (!node) return;
    const data = node.data;
    const existing = currentBoard?.get([x, y]) ?? 0;
    // Same colour again removes the stone, matching BesoGo's setup tools.
    const remove = sign === 0 || (sign > 0 && existing > 0) || (sign < 0 && existing < 0);
    if (sign === 0 && !existing) return;
    const ab = expandValues(data.AB).filter((value) => value !== point);
    const aw = expandValues(data.AW).filter((value) => value !== point);
    const ae = expandValues(data.AE).filter((value) => value !== point);
    if (remove) ae.push(point);
    else if (sign > 0) ab.push(point);
    else aw.push(point);

    const changed = mutateTree((draft) => {
      writeList(draft, nodeId, 'AB', ab);
      writeList(draft, nodeId, 'AW', aw);
      writeList(draft, nodeId, 'AE', ae);
    }, { message: null });
    if (changed) {
      cursor = { x, y };
      renderStatus();
      logNodeProperty(remove ? 'AE' : sign > 0 ? 'AB' : 'AW');
    }
  }

  function setMarkAt(x, y, tool) {
    const point = sgfPoint(x, y);
    const prop = MARK_TYPE[tool];
    if (!prop) return;
    const node = currentNode();
    const has = expandValues(node.data[prop]).includes(point);
    const changed = mutateTree((draft) => {
      if (has) {
        removePointFromProperty(draft, nodeId, prop, point);
      } else {
        for (const markProp of MARK_PROPS) removePointFromProperty(draft, nodeId, markProp, point);
        removePointFromProperty(draft, nodeId, 'LB', point);
        const points = expandValues(tree.get(nodeId).data[prop]);
        points.push(point);
        writeList(draft, nodeId, prop, points);
      }
    }, { message: null });
    if (changed) {
      cursor = { x, y };
      renderStatus();
      logNodeProperty(prop);
    }
  }

  function setLabelAt(x, y, text) {
    const point = sgfPoint(x, y);
    const trimmed = String(text || '').slice(0, 12);
    const node = currentNode();
    const existing = (node.data.LB || []).filter((value) => {
      const sep = value.indexOf(':');
      return sep <= 0 || value.slice(0, sep) !== point;
    });
    if (!trimmed) {
      const changed = mutateTree((draft) => removePointFromProperty(draft, nodeId, 'LB', point), { message: null });
      if (changed) logNodeProperty('LB');
      return;
    }
    const next = [...existing, `${point}:${trimmed}`];
    const changed = mutateTree((draft) => {
      for (const markProp of MARK_PROPS) removePointFromProperty(draft, nodeId, markProp, point);
      draft.updateProperty(nodeId, 'LB', next);
    }, { message: null });
    if (changed) {
      cursor = { x, y };
      logNodeProperty('LB');
    }
  }

  function nextNumberLabel() {
    const node = currentNode();
    let max = 0;
    for (const value of node.data.LB || []) {
      const sep = value.indexOf(':');
      if (sep < 0) continue;
      const label = value.slice(sep + 1);
      if (/^\d+$/.test(label)) max = Math.max(max, Number(label));
    }
    return String(max + 1);
  }

  function addLine(x1, y1, x2, y2, tool) {
    if (x1 === x2 && y1 === y2) return;
    const prop = tool === 'arrow' ? 'AR' : 'LN';
    const value = S.formatLineValue(sgfPoint(x1, y1), sgfPoint(x2, y2), lineColor);
    const node = currentNode();
    const values = [...(node.data[prop] || [])];
    const index = values.indexOf(value);
    if (index >= 0) values.splice(index, 1);
    else values.push(value);
    const changed = mutateTree((draft) => writeList(draft, nodeId, prop, values), { message: null });
    if (changed) logNodeProperty(prop);
  }

  function addDim(x1, y1, x2, y2) {
    const ranges = [...(currentBoard?.dimmedRanges || [])];
    const colors = { ...(currentBoard?.dimmedColors || {}) };
    const range = S.toDimRange([x1, y1], [x2, y2]);
    const result = S.applyDimRectangle(ranges, colors, range, dimColor);
    const sbkdd = Object.entries(result.colors).map(([key, color]) => `${color}:${key}`);
    const changed = mutateTree((draft) => {
      writeList(draft, nodeId, 'DD', result.ranges.length ? result.ranges : ['']);
      writeList(draft, nodeId, 'SBKDD', sbkdd);
    }, { message: null });
    if (changed) {
      logNodeProperty('DD');
      logNodeProperty('SBKDD');
    }
  }

  function eraseAt(x, y) {
    const point = sgfPoint(x, y);
    const node = currentNode();
    if (!node) return;
    for (const prop of MARK_PROPS) {
      if (expandValues(node.data[prop]).includes(point)) {
        const changed = mutateTree((draft) => removePointFromProperty(draft, nodeId, prop, point), { message: null });
        if (changed) logNodeProperty(prop);
        return;
      }
    }
    if ((node.data.LB || []).some((value) => value.startsWith(`${point}:`))) {
      const changed = mutateTree((draft) => removePointFromProperty(draft, nodeId, 'LB', point), { message: null });
      if (changed) logNodeProperty('LB');
      return;
    }
    for (const prop of ['AR', 'LN']) {
      const values = node.data[prop] || [];
      const index = values.findIndex((value) => S.parseLineValue(value).points.includes(point));
      if (index >= 0) {
        const changed = mutateTree(
          (draft) => writeList(draft, nodeId, prop, values.filter((_, i) => i !== index)),
          { message: null },
        );
        if (changed) logNodeProperty(prop);
        return;
      }
    }
    const ranges = [...(currentBoard?.dimmedRanges || [])];
    const index = S.findDimRangeAt(ranges, [x, y]);
    if (index >= 0) {
      const range = ranges[index];
      const colors = { ...(currentBoard?.dimmedColors || {}) };
      ranges.splice(index, 1);
      delete colors[range];
      const sbkdd = Object.entries(colors).map(([key, color]) => `${color}:${key}`);
      const changed = mutateTree((draft) => {
        writeList(draft, nodeId, 'DD', ranges.length ? ranges : ['']);
        writeList(draft, nodeId, 'SBKDD', sbkdd);
      }, { message: null });
      if (changed) {
        logNodeProperty('DD');
        logNodeProperty('SBKDD');
      }
      return;
    }
    if (currentBoard && currentBoard.get([x, y]) !== 0) { setSetupStone(x, y, 0); return; }
    log('Nothing to erase at that point.', 'warn');
  }

  function editAt(x, y) {
    if (pending) {
      if (pending.x === x && pending.y === y) { pending = null; updateToolbar(); scheduleBoardDraw(); return; }
      if (pending.tool === 'line' || pending.tool === 'arrow') addLine(pending.x, pending.y, x, y, pending.tool);
      else if (pending.tool === 'dim') addDim(pending.x, pending.y, x, y);
      pending = null;
      cursor = { x, y };
      updateToolbar();
      renderAll();
      return;
    }
    switch (selectedTool) {
      case 'stone_1': setSetupStone(x, y, 1); break;
      case 'stone_-1': setSetupStone(x, y, -1); break;
      case 'erase': setSetupStone(x, y, 0); break;
      case 'line':
      case 'arrow':
      case 'dim':
        pending = { tool: selectedTool, x, y };
        updateToolbar();
        scheduleBoardDraw();
        break;
      case 'label': {
        const targetId = nodeId;
        askText(labelAtPoint(x, y), 'Label').then((text) => { if (text != null && nodeId === targetId) setLabelAt(x, y, text); });
        break;
      }
      case 'number': setLabelAt(x, y, nextNumberLabel()); break;
      case 'cross':
      case 'triangle':
      case 'square':
      case 'circle': setMarkAt(x, y, selectedTool); break;
      default: break;
    }
  }

  // Board drawing --------------------------------------------------------
  const boardView = { cssWidth: 0, cssHeight: 0, margin: 0, spacing: 0, dpr: 1, cols: 13, rows: 13, originX: 0, originY: 0 };
  const BOARD_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
  let boardFrame = 0;

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function boardStarPoints(width, height) {
    if (width < 7 || height < 7) return [];
    const edgeX = width >= 13 ? 3 : 2;
    const edgeY = height >= 13 ? 3 : 2;
    const xs = [edgeX, width - 1 - edgeX];
    const ys = [edgeY, height - 1 - edgeY];
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    const points = new Map();
    const add = (x, y) => {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      points.set(`${x},${y}`, { x, y });
    };
    for (const x of xs) for (const y of ys) add(x, y);
    if (Number.isInteger(centerX) && Number.isInteger(centerY)) add(centerX, centerY);
    if (width >= 19 || height >= 19) {
      if (Number.isInteger(centerY)) for (const x of xs) add(x, centerY);
      if (Number.isInteger(centerX)) for (const y of ys) add(centerX, y);
    }
    return [...points.values()];
  }

  function resizeBoard() {
    const rect = paneBoard.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 60) return;
    const cols = currentBoard?.width || gameSize().width;
    const rows = currentBoard?.height || gameSize().height;
    const fitWidth = Math.max(60, rect.width - 28);
    const fitHeight = Math.max(60, rect.height - 28);
    const zoom = settings.zoom || 1;
    const margin = Math.max(19, Math.round(Math.min(fitWidth, fitHeight) * 0.055)) * zoom;
    const spacing = Math.max(
      4,
      Math.min(
        (fitWidth - margin * 2) / Math.max(1, cols - 1),
        (fitHeight - margin * 2) / Math.max(1, rows - 1),
      ) * zoom,
    );
    const cssWidth = Math.max(80, Math.round((cols - 1) * spacing + margin * 2));
    const cssHeight = Math.max(80, Math.round((rows - 1) * spacing + margin * 2));
    paneBoard.classList.toggle('is-zoomed', zoom > 1.001);
    const dpr = Math.max(1, Math.min(3, devicePixelRatio || 1));
    boardView.cssWidth = cssWidth;
    boardView.cssHeight = cssHeight;
    boardView.dpr = dpr;
    boardView.cols = cols;
    boardView.rows = rows;
    boardView.margin = margin;
    boardView.spacing = spacing;
    boardView.originX = margin;
    boardView.originY = margin;
    boardCanvas.style.width = `${cssWidth}px`;
    boardCanvas.style.height = `${cssHeight}px`;
    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(cssHeight * dpr);
    if (boardCanvas.width !== backingWidth || boardCanvas.height !== backingHeight) {
      boardCanvas.width = backingWidth;
      boardCanvas.height = backingHeight;
    }
    boardContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
  }

  function scheduleBoardDraw() {
    if (boardFrame) return;
    boardFrame = requestAnimationFrame(() => { boardFrame = 0; drawBoard(); });
  }

  const pointPosition = (x, y) => ({
    x: boardView.originX + x * boardView.spacing,
    y: boardView.originY + y * boardView.spacing,
  });

  function pointFromEvent(event) {
    if (!boardView.cssWidth || !boardView.cssHeight) return null;
    const rect = boardCanvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const gx = Math.round((px - boardView.originX) / boardView.spacing);
    const gy = Math.round((py - boardView.originY) / boardView.spacing);
    if (gx < 0 || gy < 0 || gx >= boardView.cols || gy >= boardView.rows) return null;
    if (Math.abs(px - (boardView.originX + gx * boardView.spacing)) > boardView.spacing * 0.52) return null;
    if (Math.abs(py - (boardView.originY + gy * boardView.spacing)) > boardView.spacing * 0.52) return null;
    return { x: gx, y: gy };
  }

  function markerColor(x, y) {
    const stone = currentBoard?.signMap[y]?.[x] ?? 0;
    if (stone > 0) return 'rgba(255,255,255,.92)';
    if (stone < 0) return 'rgba(0,0,0,.86)';
    return 'rgba(24,24,24,.9)';
  }

  // Stable per-intersection noise: stones keep the same texture across redraws.
  function hashPoint(x, y) {
    let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function rand01(seed, salt) {
    let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b) >>> 0;
    value ^= value >>> 13;
    return (value >>> 0) / 4294967296;
  }

  function drawStoneTexture(x, y, sign, px, py, radius) {
    const context = boardContext;
    const seed = hashPoint(x, y);
    context.save();
    context.shadowColor = 'transparent';
    context.beginPath();
    context.arc(px, py, radius * 0.97, 0, Math.PI * 2);
    context.clip();
    if (sign > 0) {
      // Slate: a few faint mineral flecks plus one soft streak.
      const flecks = 3 + (seed % 3);
      for (let i = 0; i < flecks; i += 1) {
        const angle = rand01(seed, i * 3) * Math.PI * 2;
        const distance = radius * (0.18 + rand01(seed, i * 3 + 1) * 0.62);
        const size = radius * (0.022 + rand01(seed, i * 3 + 2) * 0.045);
        context.fillStyle = `rgba(196, 201, 206, ${0.03 + rand01(seed, i + 9) * 0.045})`;
        context.beginPath();
        context.arc(px + Math.cos(angle) * distance, py + Math.sin(angle) * distance, size, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      context.lineWidth = Math.max(1, radius * 0.03);
      const offset = (rand01(seed, 21) - 0.5) * radius * 0.45;
      context.beginPath();
      context.arc(px, py + offset, radius * 0.6, Math.PI * 1.05, Math.PI * 1.5);
      context.stroke();
    } else {
      // Shell: two or three fine concentric arcs plus a tiny highlight.
      const arcs = 2 + (seed % 2);
      for (let i = 0; i < arcs; i += 1) {
        context.strokeStyle = `rgba(150, 140, 122, ${0.045 + rand01(seed, i + 4) * 0.04})`;
        context.lineWidth = Math.max(0.6, radius * 0.018);
        context.beginPath();
        context.arc(
          px - radius * 0.08, py - radius * 0.12,
          radius * (0.4 + i * 0.17),
          Math.PI * 1.02, Math.PI * 1.62,
        );
        context.stroke();
      }
      const fleckAngle = rand01(seed, 31) * Math.PI * 2;
      context.fillStyle = 'rgba(255, 255, 255, 0.32)';
      context.beginPath();
      context.arc(
        px + Math.cos(fleckAngle) * radius * 0.42,
        py + Math.sin(fleckAngle) * radius * 0.42,
        Math.max(0.8, radius * 0.035), 0, Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  }

  function drawStone(x, y, sign, radius, alpha = 1, detail = true) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    const seed = hashPoint(x, y);
    const ghost = alpha < 0.8;
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = ghost ? 'rgba(0,0,0,.12)' : 'rgba(0,0,0,.34)';
    context.shadowBlur = ghost ? Math.max(1, radius * 0.1) : Math.max(2, radius * 0.3);
    context.shadowOffsetY = ghost ? Math.max(0.5, radius * 0.03) : Math.max(1, radius * 0.08);
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    if (sign > 0) {
      const jitterX = 0.26 + rand01(seed, 1) * 0.14;
      const jitterY = 0.30 + rand01(seed, 2) * 0.14;
      const gradient = context.createRadialGradient(
        px - radius * jitterX, py - radius * jitterY, radius * 0.12,
        px, py, radius * 1.1,
      );
      gradient.addColorStop(0, palette.blackHi);
      gradient.addColorStop(0.36, palette.blackMid);
      gradient.addColorStop(1, palette.blackLow);
      context.fillStyle = gradient;
      context.fill();
      if (detail && alpha > 0.95 && radius > 8 && settings.stoneTexture !== false) drawStoneTexture(x, y, sign, px, py, radius);
    } else {
      const gradient = context.createRadialGradient(
        px - radius * 0.32, py - radius * 0.36, radius * 0.15,
        px, py, radius * 1.05,
      );
      gradient.addColorStop(0, palette.whiteHi);
      gradient.addColorStop(0.65, palette.whiteMid);
      gradient.addColorStop(1, palette.whiteLow);
      context.fillStyle = gradient;
      context.fill();
      if (detail && alpha > 0.95 && radius > 8 && settings.stoneTexture !== false) drawStoneTexture(x, y, sign, px, py, radius);
      context.shadowColor = 'transparent';
      context.lineWidth = Math.max(0.7, radius * 0.055);
      context.strokeStyle = palette.whiteEdge;
      context.stroke();
    }
    context.restore();
  }

  function drawArrowhead(x1, y1, x2, y2, color) {
    const context = boardContext;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.max(6, boardView.spacing * 0.3);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = GAME_MARK_ARROW_WIDTH;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - length * Math.cos(angle - Math.PI / 6), y2 - length * Math.sin(angle - Math.PI / 6));
    context.moveTo(x2, y2);
    context.lineTo(x2 - length * Math.cos(angle + Math.PI / 6), y2 - length * Math.sin(angle + Math.PI / 6));
    context.stroke();
    context.restore();
  }

  function drawMarker(x, y, marker) {
    if (!marker || marker.type === 'point') return;
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    const radius = boardView.spacing * 0.27;
    context.save();
    context.strokeStyle = markerColor(x, y);
    context.fillStyle = markerColor(x, y);
    context.lineWidth = 1.7;
    if (marker.type === 'circle') {
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.stroke();
    } else if (marker.type === 'square') {
      context.strokeRect(px - radius, py - radius, radius * 2, radius * 2);
    } else if (marker.type === 'triangle') {
      context.beginPath();
      context.moveTo(px, py - radius * 1.12);
      context.lineTo(px + radius, py + radius * 0.78);
      context.lineTo(px - radius, py + radius * 0.78);
      context.closePath();
      context.stroke();
    } else if (marker.type === 'cross') {
      const arm = radius * 0.92;
      context.beginPath();
      context.moveTo(px - arm, py - arm);
      context.lineTo(px + arm, py + arm);
      context.moveTo(px + arm, py - arm);
      context.lineTo(px - arm, py + arm);
      context.stroke();
    } else if (marker.type === 'label') {
      context.font = `600 ${Math.max(9, Math.round(boardView.spacing * 0.42))}px ${BOARD_FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(marker.label ?? ''), px, py);
    }
    context.restore();
  }

  function drawPlus(x, y, color, radius, alpha = 1) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    const arm = radius * 0.54;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, radius * 0.17);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(px - arm, py);
    context.lineTo(px + arm, py);
    context.moveTo(px, py - arm);
    context.lineTo(px, py + arm);
    context.stroke();
    context.restore();
  }

  function drawCross(x, y, color, radius, alpha = 1) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    const arm = radius * 0.52;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.8, radius * 0.15);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(px - arm, py - arm);
    context.lineTo(px + arm, py + arm);
    context.moveTo(px + arm, py - arm);
    context.lineTo(px - arm, py + arm);
    context.stroke();
    context.restore();
  }

  function drawVariationBadge(hint, radius, alpha = 1) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(hint.x, hint.y);
    // MultiGo shows variation alternatives as blue letters at the move points.
    const ink = 'rgba(43, 95, 217, 0.96)';
    const halo = 'rgba(255, 255, 255, 0.96)';
    context.save();
    context.globalAlpha = alpha;
    context.font = `700 ${Math.max(10, Math.round(radius * 0.78))}px ${BOARD_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = Math.max(2.2, radius * 0.18);
    context.strokeStyle = halo;
    context.strokeText(hint.letter, px, py);
    context.fillStyle = ink;
    context.fillText(hint.letter, px, py);
    context.restore();
  }

  function labelAtPoint(x, y) {
    const node = currentNode();
    if (!node) return settings.labelStartChar || 'A';
    const point = `${sgfPoint(x, y)}:`;
    const existing = (node.data.LB || []).find((value) => value.startsWith(point));
    return existing ? existing.slice(point.length) || settings.labelStartChar : (settings.labelStartChar || 'A');
  }

  function hoverLabelText() {
    return hover ? labelAtPoint(hover.x, hover.y) : (settings.labelStartChar || 'A');
  }

  function drawHoverMark(x, y, type, radius, label = null) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    const color = markerColor(x, y);
    const size = radius * 0.27;
    if (!currentBoard.get([x, y])) {
      context.save();
      context.globalAlpha = 0.7;
      context.fillStyle = palette.backer;
      context.beginPath();
      context.arc(px, py, radius * 0.72, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.save();
    context.globalAlpha = 0.6;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.7;
    if (type === 'circle') {
      context.beginPath();
      context.arc(px, py, size, 0, Math.PI * 2);
      context.stroke();
    } else if (type === 'square') {
      context.strokeRect(px - size, py - size, size * 2, size * 2);
    } else if (type === 'triangle') {
      context.beginPath();
      context.moveTo(px, py - size * 1.12);
      context.lineTo(px + size, py + size * 0.78);
      context.lineTo(px - size, py + size * 0.78);
      context.closePath();
      context.stroke();
    } else if (type === 'cross') {
      const arm = size * 0.92;
      context.beginPath();
      context.moveTo(px - arm, py - arm);
      context.lineTo(px + arm, py + arm);
      context.moveTo(px + arm, py - arm);
      context.lineTo(px - arm, py + arm);
      context.stroke();
    } else if (type === 'label') {
      context.font = `600 ${Math.max(9, Math.round(boardView.spacing * 0.42))}px ${BOARD_FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(label ?? ''), px, py);
    }
    context.restore();
  }

  function drawHover(stoneRadius) {
    const context = boardContext;
    if (!hover) return;
    const { x, y } = hover;
    const existing = currentBoard.get([x, y]);

    if (pending) {
      const start = pointPosition(pending.x, pending.y);
      const end = pointPosition(x, y);
      if (pending.tool === 'dim') {
        const x1 = Math.min(start.x, end.x) - boardView.spacing * 0.5;
        const y1 = Math.min(start.y, end.y) - boardView.spacing * 0.5;
        context.fillStyle = dimCss(dimColor);
        context.fillRect(x1, y1, Math.abs(start.x - end.x) + boardView.spacing, Math.abs(start.y - end.y) + boardView.spacing);
      } else {
        context.save();
        context.strokeStyle = lineColor ? colorCss[lineColor] : palette.line;
        context.lineWidth = 1.5;
        context.setLineDash([4, 3]);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.restore();
      }
      return;
    }

    if (mode !== 'edit') {
      if (!existing) drawStone(x, y, playerToMove(), stoneRadius, 0.38, false);
      return;
    }

    switch (selectedTool) {
      case 'stone_1':
      case 'stone_-1': {
        const sign = selectedTool === 'stone_1' ? 1 : -1;
        if (existing === sign) drawCross(x, y, palette.variant, stoneRadius, 0.72);
        else {
          drawStone(x, y, sign, stoneRadius * 0.94, existing ? 0.3 : 0.38, false);
          drawPlus(x, y, palette.variant, stoneRadius * 0.8, 0.85);
        }
        break;
      }
      case 'erase':
        if (existing) drawCross(x, y, palette.variant, stoneRadius, 0.8);
        break;
      case 'cross':
      case 'triangle':
      case 'square':
      case 'circle':
        drawHoverMark(x, y, selectedTool, stoneRadius);
        break;
      case 'number':
        drawHoverMark(x, y, 'label', stoneRadius, nextNumberLabel());
        break;
      case 'label':
        drawHoverMark(x, y, 'label', stoneRadius, hoverLabelText());
        break;
      default:
        break;
    }
  }

  function dimCss(color) {
    if (color === 'red') return 'rgba(217,43,43,.25)';
    if (color === 'yellow') return 'rgba(230,184,0,.25)';
    if (color === 'blue') return 'rgba(47,111,237,.24)';
    if (color === 'green') return 'rgba(26,127,55,.24)';
    if (color === 'black') return 'rgba(0,0,0,.38)';
    if (color === 'white') return 'rgba(255,255,255,.32)';
    return 'rgba(0,0,0,.28)';
  }

  function buildMoveNumberMap(cols) {
    const path = S.getPath(tree, nodeId);
    let start = 0;
    if (settings.moveNumbersMode === 'variation') {
      for (let i = 1; i < path.length; i += 1) {
        const parent = path[i].parentId != null ? tree.get(path[i].parentId) : null;
        if (parent && parent.children.length > 1) start = i;
      }
    }
    const numbers = new Map();
    let count = 0;
    for (let i = start; i < path.length; i += 1) {
      const item = path[i];
      if (!item.data.B && !item.data.W) continue;
      count += 1;
      const value = (item.data.B || item.data.W)[0];
      if (!value) continue;
      const [x, y] = S.sgf.parseVertex(value);
      if (x >= 0 && y >= 0) numbers.set(y * cols + x, count);
    }
    numbers.total = count;
    return numbers;
  }

  function shouldShowMoveNumber(number, total) {
    const limit = settings.moveNumberLimit;
    if (limit < 0) return false;
    if (limit === 0) return true;
    return number > total - limit;
  }

  function collectVariationHints() {
    const node = currentNode();
    const hints = [];
    const seen = new Set();
    const cols = currentBoard?.width || gameSize().width;
    const rows = currentBoard?.height || gameSize().height;
    const add = (entry, alpha, dim = false) => {
      const value = (entry.data.B || entry.data.W)?.[0];
      if (!value) return;
      const [x, y] = S.sgf.parseVertex(value);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      hints.push({ x, y, sign: entry.data.B ? 1 : -1, alpha, dim });
    };
    if (settings.showNextMoves && node?.children.length) {
      add(preferredChild(node), 0.55);
    }
    if (settings.showSiblings && node?.children.length) {
      // Variations at the current position are the children of this node:
      // they are sibling alternatives to one another, labelled A, B, C...
      for (const child of node.children) add(child, 0.9);
    }
    hints.forEach((hint, index) => { hint.letter = String.fromCharCode(65 + (index % 26)); });

    const move = node?.data?.B || node?.data?.W;
    let lastPoint = null;
    if (move && move[0] !== '') {
      const [x, y] = S.sgf.parseVertex(move[0]);
      if (x >= 0 && y >= 0 && x < cols && y < rows) lastPoint = { x, y };
    }
    return {
      hints,
      lastPoint,
      overlayActive: Boolean(settings.showNextMoves || settings.showSiblings),
    };
  }

  function drawBoard() {
    const { cssWidth, cssHeight, spacing } = boardView;
    if (!cssWidth || !cssHeight || !currentBoard) return;
    const context = boardContext;
    const cols = currentBoard.width;
    const rows = currentBoard.height;
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.save();
    context.strokeStyle = palette.edge;
    context.lineWidth = 1;
    roundRect(context, 0.5, 0.5, cssWidth - 1, cssHeight - 1, 4);
    context.stroke();
    context.restore();

    context.strokeStyle = palette.line;
    context.lineWidth = palette.lineWidth;
    const gridWidth = (cols - 1) * spacing;
    const gridHeight = (rows - 1) * spacing;
    for (let i = 0; i < cols; i += 1) {
      const x = boardView.originX + i * spacing;
      context.beginPath();
      context.moveTo(x, boardView.originY);
      context.lineTo(x, boardView.originY + gridHeight);
      context.stroke();
    }
    for (let i = 0; i < rows; i += 1) {
      const y = boardView.originY + i * spacing;
      context.beginPath();
      context.moveTo(boardView.originX, y);
      context.lineTo(boardView.originX + gridWidth, y);
      context.stroke();
    }

    context.fillStyle = palette.star;
    for (const star of boardStarPoints(cols, rows)) {
      const { x: px, y: py } = pointPosition(star.x, star.y);
      context.beginPath();
      context.arc(px, py, Math.max(1.6, spacing * 0.075), 0, Math.PI * 2);
      context.fill();
    }

    if (settings.coords) {
      const fontSize = Math.max(8, Math.min(12, Math.round(Math.min(cssWidth, cssHeight) * 0.0155)));
      context.font = `500 ${fontSize}px ${BOARD_FONT}`;
      context.fillStyle = palette.label;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const topY = boardView.originY - boardView.margin * 0.5;
      const bottomY = boardView.originY + (rows - 1) * spacing + boardView.margin * 0.5;
      const leftX = boardView.originX - boardView.margin * 0.5;
      const rightX = boardView.originX + (cols - 1) * spacing + boardView.margin * 0.5;
      if (settings.coordinatesStyle === '1-1') {
        for (let x = 0; x < cols; x += 1) {
          context.fillText(String(x + 1), boardView.originX + x * spacing, topY);
          context.fillText(String(x + 1), boardView.originX + x * spacing, bottomY);
        }
        for (let y = 0; y < rows; y += 1) {
          context.fillText(String(y + 1), leftX, boardView.originY + y * spacing);
          context.fillText(String(y + 1), rightX, boardView.originY + y * spacing);
        }
      } else if (settings.coordinatesStyle === 'CJK') {
        for (let x = 0; x < cols; x += 1) {
          context.fillText(String(x + 1), boardView.originX + x * spacing, topY);
          context.fillText(String(x + 1), boardView.originX + x * spacing, bottomY);
        }
        for (let y = 0; y < rows; y += 1) {
          context.fillText(numberToCJK(y + 1), leftX, boardView.originY + y * spacing);
          context.fillText(numberToCJK(y + 1), rightX, boardView.originY + y * spacing);
        }
      } else {
        for (let x = 0; x < cols; x += 1) {
          context.fillText(columnLabel(x), boardView.originX + x * spacing, topY);
          context.fillText(columnLabel(x), boardView.originX + x * spacing, bottomY);
        }
        for (let y = 0; y < rows; y += 1) {
          context.fillText(String(rows - y), leftX, boardView.originY + y * spacing);
          context.fillText(String(rows - y), rightX, boardView.originY + y * spacing);
        }
      }
    }

    const stoneRadius = spacing * 0.465;
    const numberMap = buildMoveNumberMap(cols);
    const totalMoves = numberMap.total || 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const sign = currentBoard.signMap[y]?.[x] ?? 0;
        if (!sign) continue;
        drawStone(x, y, sign, stoneRadius);
      }
    }

    for (const range of currentBoard.dimmedRanges || []) {
      let vertices = [];
      try { vertices = S.sgf.parseCompressedVertices(range); } catch { continue; }
      if (!vertices.length) continue;
      const xs = vertices.map((v) => v[0]);
      const ys = vertices.map((v) => v[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const { x: x1, y: y1 } = pointPosition(minX, minY);
      const { x: x2, y: y2 } = pointPosition(maxX, maxY);
      context.fillStyle = dimCss((currentBoard.dimmedColors || {})[range]);
      context.fillRect(x1 - spacing * 0.5, y1 - spacing * 0.5, x2 - x1 + spacing, y2 - y1 + spacing);
    }

    for (const line of currentBoard.lines || []) {
      const [x1, y1] = line.v1;
      const [x2, y2] = line.v2;
      const p1 = pointPosition(x1, y1);
      const p2 = pointPosition(x2, y2);
      const color = line.color ? colorCss[line.color] : 'rgba(20,20,20,.92)';
      context.save();
      context.strokeStyle = color;
      context.lineWidth = line.type === 'arrow' ? GAME_MARK_ARROW_WIDTH : GAME_MARK_LINE_WIDTH;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.stroke();
      if (line.type === 'arrow') drawArrowhead(p1.x, p1.y, p2.x, p2.y, color);
      context.restore();
    }

    if (!settings.hideMarkers) {
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const marker = currentBoard.markers?.[y]?.[x];
          if (marker) drawMarker(x, y, marker);
        }
      }
    }

    const { hints, lastPoint } = collectVariationHints();

    for (const hint of hints) {
      if (lastPoint && hint.x === lastPoint.x && hint.y === lastPoint.y) continue;
      drawVariationBadge(hint, stoneRadius, 1);
    }

    if (lastPoint && settings.focusMarker !== 'none') {
      const { x: px, y: py } = pointPosition(lastPoint.x, lastPoint.y);
      const isTriangle = settings.focusMarker !== 'dot';
      const offset = isTriangle ? stoneRadius * 0.55 : 0;
      const size = Math.max(3.5, stoneRadius * 0.4);
      const cx = px + offset;
      const cy = py - offset;
      const markerColor = colorCss[settings.focusColor] || palette.variant;
      context.beginPath();
      if (isTriangle) {
        context.moveTo(cx, cy - size * 0.8);
        context.lineTo(cx - size * 0.72, cy + size * 0.55);
        context.lineTo(cx + size * 0.72, cy + size * 0.55);
        context.closePath();
      } else {
        context.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
      }
      context.fillStyle = markerColor;
      context.fill();
      context.strokeStyle = palette.halo;
      context.lineWidth = 1;
      context.stroke();
    }

    drawHover(stoneRadius);

    if (settings.moveNumberLimit >= 0) {
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const sign = currentBoard.signMap[y]?.[x];
          const number = numberMap.get(y * cols + x);
          if (!sign || !number || stoneRadius < 10) continue;
          if (!shouldShowMoveNumber(number, totalMoves)) continue;
          const { x: px, y: py } = pointPosition(x, y);
          context.save();
          context.fillStyle = sign > 0 ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.82)';
          context.font = `600 ${Math.round(stoneRadius * 0.72)}px ${BOARD_FONT}`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(String(number), px, py);
          context.restore();
        }
      }
    }
  }

  // Tree panel -----------------------------------------------------------
  function moveIsPass(node, dims = gameSize()) {
    const move = node?.data?.B || node?.data?.W;
    if (!move || move[0] == null) return false;
    if (move[0] === '') return true;
    try {
      const [x, y] = S.sgf.parseVertex(move[0]);
      return x < 0 || y < 0 || x >= dims.width || y >= dims.height;
    } catch {
      return false;
    }
  }

  function nodeLabel(node, dims) {
    if (node.parentId == null) return 'Start';
    if (node.data.B || node.data.W) {
      if (moveIsPass(node, dims)) return 'pass';
      const value = (node.data.B || node.data.W)[0];
      const [x, y] = S.sgf.parseVertex(value);
      return x >= 0 ? coordLabel(x, y, dims.width, dims.height) : '?';
    }
    return 'setup';
  }

  function renderTree() {
    gameTree.replaceChildren();
    if (!tree) return;
    const dims = gameSize();
    const [, positions] = S.getMatrixDict(tree);
    const nodes = [...tree.listNodes()];
    const pathIds = new Set(S.getPath(tree, nodeId).map((node) => node.id));
    const cell = 24;
    const padding = 12;
    const maxX = Math.max(0, ...Object.values(positions).map(([x]) => x));
    const maxY = Math.max(0, ...Object.values(positions).map(([, y]) => y));
    const width = padding * 2 + maxX * cell + 20;
    const height = padding * 2 + maxY * cell + 20;

    const canvas = document.createElement('div');
    canvas.className = 'tree-canvas';
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'tree-links');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    for (const node of nodes) {
      if (node.parentId == null) continue;
      const from = positions[node.id];
      const to = positions[node.parentId];
      if (!from || !to) continue;
      const line = document.createElementNS(svgNs, 'line');
      line.setAttribute('x1', String(padding + from[0] * cell + 10));
      line.setAttribute('y1', String(padding + from[1] * cell + 10));
      line.setAttribute('x2', String(padding + to[0] * cell + 10));
      line.setAttribute('y2', String(padding + to[1] * cell + 10));
      line.setAttribute('class', pathIds.has(node.id) && pathIds.has(node.parentId) ? 'tree-link is-path' : 'tree-link');
      svg.append(line);
    }
    canvas.append(svg);

    let branches = 0;
    for (const node of nodes) {
      if (node.children.length > 1) branches += 1;
      const position = positions[node.id];
      if (!position) continue;
      const [x, y] = position;
      const isMove = Boolean(node.data.B || node.data.W);
      const moveNumber = node.data.B || node.data.W ? S.getMoveNumber(tree, node.id) : null;
      const isPass = isMove && moveIsPass(node, dims);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tree-node';
      button.dataset.nodeId = String(node.id);
      button.style.left = `${padding + x * cell}px`;
      button.style.top = `${padding + y * cell}px`;
      if (node.parentId == null) button.classList.add('is-root');
      else if (node.data.B) button.classList.add('is-black');
      else if (node.data.W) button.classList.add('is-white');
      else button.classList.add('is-edit');
      if (node.id === nodeId) {
        button.classList.add('is-current');
        button.setAttribute('aria-current', 'true');
      }
      if (node.data.C?.[0]) button.classList.add('has-comment');
      if (isPass) button.classList.add('is-pass');
      button.textContent = node.parentId == null ? 'S' : isMove ? (isPass ? 'p' : String(moveNumber)) : '·';
      button.title = `${nodeLabel(node, dims)}${node.data.C?.[0] ? ` — ${node.data.C[0]}` : ''}`;
      button.setAttribute('role', 'treeitem');
      button.setAttribute('aria-label', `Node ${S.getMoveNumber(tree, node.id)}: ${nodeLabel(node, dims)}`);
      canvas.append(button);
    }

    gameTree.append(canvas);
    treeMeta.textContent = settings.language === 'zh'
      ? `${nodes.length} 个节点 · ${branches} 个变化`
      : `${nodes.length} nodes · ${branches} variation${branches === 1 ? '' : 's'}`;
    const current = gameTree.querySelector('.tree-node.is-current');
    if (current) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  gameTree.addEventListener('click', (event) => {
    const node = event.target.closest('.tree-node');
    if (node) selectNode(Number(node.dataset.nodeId));
  });

  // Status / info / comments --------------------------------------------
  function boardStoneCounts() {
    let black = 0;
    let white = 0;
    if (currentBoard) {
      for (const row of currentBoard.signMap) {
        for (const sign of row) {
          if (sign > 0) black += 1;
          else if (sign < 0) white += 1;
        }
      }
    }
    return { black, white };
  }

  function renderStatus() {
    if (!currentBoard) return;
    const signs = boardStoneCounts();
    statusNext.textContent = `${t('Next')}: ${t(signName(playerToMove()))}`;
    statusCaptures.textContent = `${t('Captures')}: B ${currentBoard.getCaptures(1)} · W ${currentBoard.getCaptures(-1)}`;
    statusStones.textContent = `${t('Stones')}: B ${signs.black} · W ${signs.white}`;
    statusCursor.textContent = cursor ? `${t('Cursor')}: ${coordLabel(cursor.x, cursor.y)}` : `${t('Cursor')}: —`;
    statusMove.textContent = `${t('Move')} ${nodeMoveNumber()}`;
  }

  function updateTitle() {
    const name = filePath ? basename(filePath) : t('Untitled');
    const result = settings.showResultInTitle ? rootProperty('RE', '') : '';
    const suffix = `${result ? ` — ${result}` : ''}${dirty ? ' •' : ''}${readOnly ? ' — Read Only' : ''}`;
    document.title = `${name}${suffix} — MultiGo Neo`;
    fileLabel.textContent = `${name}${suffix}`;
  }

  function syncSizeSelect() {
    const { width, height } = gameSize();
    const value = width === height ? String(width) : `${width}:${height}`;
    if (![...boardSizeSelect.options].some((option) => option.value === value)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = width === height ? `${width}×${width}` : `${width}×${height}`;
      boardSizeSelect.append(option);
    }
    boardSizeSelect.value = value;
    syncMenuSelects();
  }

  function syncInfoForm() {
    const info = S.getGameInfo(tree);
    infoFields.black.value = info.blackName || '';
    infoFields.blackRank.value = info.blackRank || '';
    infoFields.blackTeam.value = rootProperty('BT', '');
    infoFields.white.value = info.whiteName || '';
    infoFields.whiteRank.value = info.whiteRank || '';
    infoFields.whiteTeam.value = rootProperty('WT', '');
    infoFields.result.value = info.result || '';
    infoFields.komi.value = info.komi == null ? '' : String(info.komi);
    infoFields.handicap.value = info.handicap == null ? '' : String(info.handicap);
    infoFields.date.value = info.date || '';
    infoFields.time.value = rootProperty('TM', '');
    infoFields.event.value = info.eventName || '';
    infoFields.gameName.value = info.gameName || '';
    infoFields.comment.value = info.gameComment || '';
    infoFields.place.value = rootProperty('PC', '');
    infoFields.round.value = rootProperty('RO', '');
    infoFields.user.value = rootProperty('US', '');
    infoFields.source.value = rootProperty('SO', '');
    infoFields.copyright.value = rootProperty('CP', '');
    infoFields.annotation.value = rootProperty('AN', '');
    const rules = rootProperty('RU', 'Japanese');
    if (![...infoFields.rules.options].some((option) => option.value === rules)) {
      const option = document.createElement('option');
      option.value = rules;
      option.textContent = rules;
      infoFields.rules.append(option);
    }
    infoFields.rules.value = rules;
  }

  function renderCommentPreview(text) {
    commentPreview.replaceChildren();
    if (!text.trim()) {
      const empty = document.createElement('div');
      empty.className = 'comment-empty';
      empty.textContent = 'No comment on this node.';
      commentPreview.append(empty);
      return;
    }
    commentPreview.innerHTML = markdownToHtml(text);
  }

  function renderComment() {
    const node = currentNode();
    if (!node) return;
    const text = node.data.C?.[0] || '';
    commentTitle.textContent = node.parentId == null ? t('Root node') : `${t('Node')} ${nodeMoveNumber()}: ${nodeLabel(node, gameSize())}`;
    commentInput.hidden = readOnly;
    commentInput.disabled = readOnly;
    commentPreview.hidden = !readOnly;
    if (commentNodeId !== node.id || document.activeElement !== commentInput) {
      commentInput.value = text;
      commentNodeId = node.id;
    }
    renderCommentPreview(text);
  }

  function setTab(tab) {
    activeTab = tab;
    const isInfo = tab === 'info';
    tabInfo.classList.toggle('is-active', isInfo);
    tabComment.classList.toggle('is-active', !isInfo);
    tabInfo.setAttribute('aria-selected', String(isInfo));
    tabComment.setAttribute('aria-selected', String(!isInfo));
    panelInfo.hidden = !isInfo;
    panelComment.hidden = isInfo;
    if (isInfo) syncInfoForm();
    else renderComment();
  }

  // Toolbar and menus ----------------------------------------------------
  function updateToolbar() {
    const node = currentNode();
    const hasParent = Boolean(node && node.parentId != null);
    const hasChild = Boolean(node && node.children.length);
    const autoPlaying = Boolean(autoPlayTimer);
    const edit = mode === 'edit';
    toolUndo.disabled = readOnly || undoStack.length === 0;
    toolRedo.disabled = readOnly || redoStack.length === 0;
    toolFirst.disabled = !hasParent;
    toolPrev.disabled = !hasParent;
    toolNext.disabled = !hasChild;
    toolLast.disabled = !hasChild;
    toolAutoPlay.disabled = !hasChild;
    toolAutoPlay.setAttribute('aria-pressed', String(autoPlaying));
    const autoIcon = toolAutoPlay.querySelector('use');
    if (autoIcon) autoIcon.setAttribute('href', autoPlaying ? '#i-pause' : '#i-autoplay');
    toolPass.disabled = readOnly || edit;
    toolEdit.disabled = readOnly;
    toolEdit.setAttribute('aria-pressed', String(edit && !readOnly));
    editbar.hidden = readOnly || !edit;
    toolTurn.textContent = `${t('Turn')}: ${t(signName(playerToMove()))}`;
    toolTurn.disabled = readOnly || !edit;
    toggleCoords.setAttribute('aria-pressed', String(settings.coords));
    toggleNumbers.setAttribute('aria-pressed', String(settings.moveNumberLimit >= 0));
    for (const button of editTools) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === selectedTool));
    }
    const showColors = ['line', 'arrow', 'dim'].includes(selectedTool);
    colorStrip.hidden = !showColors;
    const activeColor = selectedTool === 'dim' ? dimColor : lineColor;
    for (const button of colorButtons) {
      button.setAttribute('aria-pressed', String((button.dataset.color || null) === activeColor));
    }
    const hints = {
      'stone_1': 'Black stone — click to place, click again to remove',
      'stone_-1': 'White stone — click to place, click again to remove',
      erase: 'Eraser — click a stone', cross: 'Cross — click to toggle',
      triangle: 'Triangle — click to toggle', square: 'Square — click to toggle',
      circle: 'Circle — click to toggle', line: 'Line — click start, then end',
      arrow: 'Arrow — click start, then end', dim: 'Dim — click two corners',
      label: 'Label — click a point', number: 'Number — click a point',
    };
    editbarHint.textContent = pending
      ? `${t(pending.tool)}: ${t('click the second point (Esc cancels)')}`
      : t(hints[selectedTool] || '');
  }

  function setMenuItemChecked(action, checked) {
    for (const item of $$(`.menu-item[data-action="${action}"]`)) item.setAttribute('aria-checked', String(Boolean(checked)));
  }

  function setMenuItemDisabled(action, disabled) {
    for (const item of $$(`.menu-item[data-action="${action}"]`)) item.disabled = Boolean(disabled);
  }

  function syncMenuSelects() {
    if (!tree) return;
    const dims = gameSize();
    const presetSquare = dims.width === dims.height && [9, 13, 19].includes(dims.width);
    const sizeSelect = $('#view-board-size');
    if (sizeSelect) {
      const custom = sizeSelect.querySelector('option[value="custom"]');
      if (custom) custom.textContent = presetSquare ? 'Custom…' : `Custom (${dims.width}×${dims.height})…`;
      sizeSelect.value = presetSquare ? String(dims.width) : 'custom';
    }
    const coordsSelect = $('#view-coords');
    if (coordsSelect) coordsSelect.value = settings.coords ? settings.coordinatesStyle : 'none';
    const numbersSelect = $('#view-numbers');
    if (numbersSelect) {
      const limit = settings.moveNumberLimit;
      let value = 'custom';
      if (limit < 0) value = 'none';
      else if (limit === 0) value = 'all';
      else if ([10, 25, 50].includes(limit)) value = String(limit);
      const custom = numbersSelect.querySelector('option[value="custom"]');
      if (custom) {
        custom.textContent = limit > 0 && ![10, 25, 50].includes(limit)
          ? `Custom (${limit})…`
          : 'Custom…';
      }
      numbersSelect.value = value;
    }
    const numberingSelect = $('#view-numbering');
    if (numberingSelect) numberingSelect.value = settings.moveNumbersMode;
    const languageSelect = $('#options-language');
    if (languageSelect) languageSelect.value = settings.language;
    const themeSelect = $('#options-theme');
    if (themeSelect) themeSelect.value = settings.theme;
    const delaySelect = $('#options-delay');
    if (delaySelect) delaySelect.value = String(settings.autoPlayDelay);
  }

  function syncMenuState() {
    const node = currentNode();
    const hasParent = Boolean(node && node.parentId != null);
    const hasChild = Boolean(node && node.children.length);
    setMenuItemChecked('toggle-next-moves', settings.showNextMoves);
    setMenuItemChecked('toggle-siblings', settings.showSiblings);
    setMenuItemChecked('toggle-auto-layout', settings.autoLayout !== false);
    setMenuItemChecked('toggle-tree', settings.showTree);
    setMenuItemChecked('toggle-remember-size', settings.rememberBoardSize !== false);
    setMenuItemChecked('toggle-edit', mode === 'edit');
    setMenuItemChecked('toggle-readonly', readOnly);
    setMenuItemChecked('toggle-autoplay', Boolean(autoPlayTimer));
    autoplayLabel.textContent = t(autoPlayTimer ? 'Pause Auto Play' : 'Auto Play');
    setMenuItemDisabled('undo', undoStack.length === 0);
    setMenuItemDisabled('redo', redoStack.length === 0);
    setMenuItemDisabled('first', !hasParent);
    setMenuItemDisabled('prev', !hasParent);
    setMenuItemDisabled('next', !hasChild);
    setMenuItemDisabled('last', !hasChild);
    setMenuItemDisabled('toggle-autoplay', !hasChild);
    setMenuItemDisabled('delete-node', !hasParent);
    setMenuItemDisabled('cut-variation', !hasParent);
    setMenuItemDisabled('make-main', !hasParent);
    setMenuItemDisabled('shift-left', !hasParent);
    setMenuItemDisabled('shift-right', !hasParent);
    setMenuItemDisabled('remove-siblings', !hasParent);
    setMenuItemDisabled('pass', mode === 'edit');
    const readOnlyOnly = [
      'new-game', 'save-sgf', 'save-sgf-as', 'toggle-edit',
      'paste-variation', 'duplicate-node', 'insert-node', 'flatten-variation',
      'clear-markup', 'paste-sgf', 'toggle-turn',
      'size-9', 'size-13', 'size-19', 'size-custom',
    ];
    for (const action of readOnlyOnly) setMenuItemDisabled(action, readOnly);
    if (readOnly) {
      for (const action of ['undo', 'redo', 'delete-node', 'cut-variation', 'make-main', 'shift-left', 'shift-right', 'remove-siblings', 'pass']) {
        setMenuItemDisabled(action, true);
      }
    }
    syncMenuSelects();
  }

  function renderAll() {
    if (!tree) return;
    if (boardView.cols !== (currentBoard?.width || boardView.cols) || boardView.rows !== (currentBoard?.height || boardView.rows)) {
      resizeBoard();
    } else {
      scheduleBoardDraw();
    }
    renderTree();
    renderStatus();
    updateToolbar();
    syncMenuState();
    updateTitle();
    if (activeTab === 'comment') renderComment();
  }

  // Safe Markdown subset -------------------------------------------------
  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inlineMarkdown(value) {
    let text = escapeHtml(value);
    const links = [];
    text = text.replace(/\b(https?:\/\/[^\s<]+)/g, (match) => {
      const token = `\u0001${links.length}\u0001`;
      links.push(match);
      return token;
    });
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    text = text.replace(/\u0001(\d+)\u0001/g, (_, index) => {
      const url = links[Number(index)] || '';
      return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`;
    });
    return text.replace(/\n/g, '<br>');
  }

  function markdownToHtml(text) {
    return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('#')) {
        const level = Math.min(3, trimmed.match(/^#+/)[0].length);
        return `<h${level}>${inlineMarkdown(trimmed.replace(/^#+\s*/, ''))}</h${level}>`;
      }
      if (trimmed.startsWith('>')) return `<blockquote>${inlineMarkdown(trimmed.replace(/^>\s?/gm, ''))}</blockquote>`;
      if (/^(?:[-*]|\d+\.)\s/m.test(trimmed)) {
        const items = trimmed.split(/\n/).map((line) => line.replace(/^(?:[-*]|\d+\.)\s*/, ''));
        return `<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`;
      }
      return `<p>${inlineMarkdown(trimmed)}</p>`;
    }).join('');
  }

  // Dialogs --------------------------------------------------------------
  function askConfirm(message, okLabel = 'Continue') {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        confirmDialog.close();
        resolve(value);
      };
      confirmMessage.textContent = message;
      confirmOk.textContent = okLabel;
      confirmOk.onclick = () => settle(true);
      confirmCancel.onclick = () => settle(false);
      confirmCancelIcon.onclick = () => settle(false);
      confirmDialog.oncancel = (event) => { event.preventDefault(); settle(false); };
      confirmDialog.onclose = () => settle(false);
      if (!confirmDialog.open) confirmDialog.showModal();
      confirmOk.focus();
    });
  }

  function askText(initial, title) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        labelDialog.close();
        resolve(value);
      };
      $('#label-title').textContent = t(title);
      labelInput.value = initial;
      labelOk.onclick = () => settle(labelInput.value);
      labelCancel.onclick = () => settle(null);
      labelCancelIcon.onclick = () => settle(null);
      labelDialog.oncancel = (event) => { event.preventDefault(); settle(null); };
      labelDialog.onclose = () => settle(null);
      if (!labelDialog.open) labelDialog.showModal();
      labelInput.focus();
      labelInput.select();
    });
  }

  labelInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    labelOk.click();
  });

  function validateCustomSize(text) {
    const value = String(text ?? '').trim();
    if (!value) return { error: t('Enter a board size such as 5*9.') };
    const match = value.match(/^(\d{1,2})\s*[*xX×]\s*(\d{1,2})$/);
    if (!match) return { error: t('Use width*height, for example 5*9.') };
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 2 || width > 52 || height < 2 || height > 52) {
      return { error: `${t('Each side must be an integer from 2 to 52')} (${width}*${height}).` };
    }
    return { width, height };
  }

  function askCustomSize(initial) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value, closeDialog = true) => {
        if (settled) return;
        settled = true;
        if (closeDialog && customSizeDialog.open) customSizeDialog.close();
        resolve(value);
      };
      const submit = () => {
        const result = validateCustomSize(customSizeInput.value);
        if (result.error) {
          customSizeError.textContent = result.error;
          customSizeError.hidden = false;
          customSizeInput.focus();
          customSizeInput.select();
          return;
        }
        finish(result);
      };
      customSizeInput.value = initial;
      customSizeError.textContent = '';
      customSizeError.hidden = true;
      customSizeApply.onclick = submit;
      customSizeInput.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submit();
      };
      customSizeDialog.oncancel = (event) => { event.preventDefault(); finish(null); };
      customSizeDialog.onclose = () => finish(null, false);
      if (!customSizeDialog.open) customSizeDialog.showModal();
      customSizeInput.focus();
      customSizeInput.select();
    });
  }

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
  [aboutDialog, shortcutsDialog, setupDialog, labelDialog, customSizeDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  });

  // File actions ---------------------------------------------------------
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function defaultSgfName() {
    const info = S.getGameInfo(tree);
    const black = (info.blackName || '').trim();
    const white = (info.whiteName || '').trim();
    let name = 'game';
    if (black && white) name = `${black} vs ${white}`;
    else if (black || white) name = black || white;
    return `${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.sgf`;
  }

  async function newGame() {
    if (readOnly) { log('Read Only: new games are disabled.', 'warn'); return; }
    if (dirty) {
      if (!(await askConfirm('Start a new game? Unsaved changes will be lost.', 'New game'))) return;
    }
    startGame(gameSize());
    log(`New ${gameSize().width}×${gameSize().height} game.`);
  }

  async function openSgf() {
    if (dirty && !(await askConfirm('Open another game? Unsaved changes will be lost.', 'Open'))) return;
    if (isElectron) {
      const result = await desktop.openGame();
      if (!result || result.canceled) { log('Open canceled.', 'warn'); return; }
      if (applySgfText(result.content, result.filePath)) {
        rememberRecent(result.filePath, result.content);
      }
    } else {
      sgfFileInput.value = '';
      sgfFileInput.click();
    }
  }

  async function openRecent(index) {
    const entry = recentFiles[index];
    if (!entry) return;
    if (dirty && !(await askConfirm('Open another game? Unsaved changes will be lost.', 'Open'))) return;
    try {
      if (isElectron) {
        if (!entry.path) { log('That recent file has no path.', 'warn'); return; }
        if (typeof desktop.openRecent !== 'function') {
          log('Reopening recent files is not available in this build.', 'warn');
          return;
        }
        const result = await desktop.openRecent(entry.path);
        if (!result || result.canceled) { log('Open canceled.', 'warn'); return; }
        if (applySgfText(result.content, result.filePath)) {
          rememberRecent(result.filePath, result.content);
        }
      } else if (entry.content) {
        if (applySgfText(entry.content, entry.name)) rememberRecent(entry.name, entry.content);
      } else {
        log('That recent file was too large to cache; use Open SGF.', 'warn');
      }
    } catch (error) {
      log(`Could not open the recent file: ${error.message}`, 'error');
    }
  }

  sgfFileInput.addEventListener('change', async () => {
    const file = sgfFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (applySgfText(text, file.name)) rememberRecent(file.name, text);
    } catch (error) { log(`Could not read the file: ${error.message}`, 'error'); }
  });

  async function saveSgf(saveAs = false) {
    if (readOnly) { log('Read Only: saving is disabled.', 'warn'); return; }
    let content;
    try { content = S.sgf.stringify([tree.root], { linebreak: '\n', indent: '  ' }); }
    catch (error) { log(`Could not build the SGF: ${error.message}`, 'error'); return; }
    if (isElectron) {
      const result = await desktop.saveGame({
        content, filePath: saveAs ? null : filePath, saveAs, suggestedName: defaultSgfName(),
      });
      if (!result || result.canceled) { log('Save canceled.', 'warn'); return; }
      filePath = result.filePath;
      dirty = false;
      markClean();
      updateTitle();
      log(`Saved ${basename(filePath)}.`, 'success');
      rememberRecent(filePath, content);
    } else {
      const name = defaultSgfName();
      downloadText(content, name);
      filePath = name;
      dirty = false;
      markClean();
      updateTitle();
      log(`Downloaded ${name}.`, 'success');
      rememberRecent(name, content);
    }
  }

  function applySgfText(text, source) {
    let roots;
    try { roots = S.sgf.parse(text, { getId }); }
    catch (error) { log(`Could not parse ${source}: ${error.message}`, 'error'); return false; }
    if (!roots.length) { log('The SGF contains no games.', 'error'); return false; }
    if (roots.length > 1) log('Only the first game in the SGF collection was loaded.', 'warn');
    stopAutoPlay();
    try { tree = new S.GameTree({ root: roots[0], getId, merger: S.nodeMerger }); }
    catch (error) { log(`Could not build the game tree: ${error.message}`, 'error'); return false; }
    nodeId = tree.root.id;
    S.clearBoardCache();
    currentBoard = null;
    refreshBoard();
    undoStack = [];
    redoStack = [];
    pending = null;
    cursor = null;
    hover = null;
    mode = 'play';
    selectedTool = 'stone_1';
    filePath = source === 'the clipboard' ? null : source;
    dirty = source === 'the clipboard';
    commentNodeId = null;
    markClean();
    syncSizeSelect();
    syncInfoForm();
    setTab('info');
    renderAll();
    resizeBoard();
    updateTitle();
    const { width, height } = gameSize();
    rememberBoardSize(width, height);
    if (settings.openReadOnly && source !== 'the clipboard') {
      readOnly = true;
      applyReadOnlyUI();
    }
    if (rootProperty('GM', '1') !== '1') log('This SGF is not marked as a Go game (GM != 1).', 'warn');
    log(`Loaded ${basename(source)} — ${tree.getHeight()} nodes.`, 'success');
    maybeApplyStartupPath();
    return true;
  }

  async function copySgf() {
    try {
      await navigator.clipboard.writeText(S.sgf.stringify([tree.root], { linebreak: '\n', indent: '  ' }));
      log('SGF copied to the clipboard.', 'success');
    } catch { log('Clipboard write was blocked by the browser.', 'warn'); }
  }

  async function pasteSgf() {
    if (readOnly) { log('Read Only: loading from the clipboard is disabled.', 'warn'); return; }
    if (dirty && !(await askConfirm('Replace the current game with the clipboard SGF?', 'Load'))) return;
    try { applySgfText(await navigator.clipboard.readText(), 'the clipboard'); }
    catch { log('Clipboard read was blocked by the browser.', 'warn'); }
  }

  async function quitApp() {
    if (dirty && !(await askConfirm('Quit without saving the current game?', 'Quit'))) return;
    if (!isElectron) { log('Quit is only available in the desktop build.', 'warn'); return; }
    log('Closing MultiGo Neo…');
    await desktop.quit();
  }

  // Tree operations ------------------------------------------------------
  function deleteNode() {
    const node = currentNode();
    if (!node || node.parentId == null) { log('The root node cannot be deleted.', 'warn'); return; }
    const parentId = node.parentId;
    mutateTree((draft) => draft.removeNode(node.id), { select: parentId, message: 'Node deleted.' });
  }

  function makeMainVariation() {
    const node = currentNode();
    if (!node || node.parentId == null) return;
    mutateTree((draft) => draft.shiftNode(node.id, 'main'), { message: 'Variation made main.' });
  }

  function shiftVariation(direction) {
    const node = currentNode();
    if (!node || node.parentId == null) return;
    mutateTree((draft) => draft.shiftNode(node.id, direction), { message: `Variation shifted ${direction}.` });
  }

  function removeOtherVariations() {
    const node = currentNode();
    if (!node || node.parentId == null) return;
    const parent = tree.get(node.parentId);
    const siblings = parent.children.filter((child) => child.id !== node.id);
    if (!siblings.length) { log('There are no other variations here.', 'warn'); return; }
    mutateTree((draft) => { for (const sibling of siblings) draft.removeNode(sibling.id); }, { message: 'Other variations removed.' });
  }

  function clearNodeMarkup() {
    const props = ['CR', 'MA', 'SQ', 'TR', 'LB', 'L', 'AR', 'LN', 'DD', 'SBKDD', 'BM', 'TE', 'DO', 'IT'];
    const node = currentNode();
    const present = props.filter((prop) => (node?.data?.[prop] || []).length);
    const changed = mutateTree(
      (draft) => { for (const prop of props) draft.removeProperty(nodeId, prop); },
      { message: null },
    );
    if (!changed) return;
    if (present.length) {
      for (const prop of present) logNodeProperty(prop);
    } else {
      log('Markup cleared on this node.');
    }
  }

  const ROOT_ONLY_PROPERTIES = new Set([
    'GM', 'FF', 'CA', 'AP', 'SZ', 'PB', 'BR', 'PW', 'WR', 'RE', 'KM', 'HA',
    'RU', 'DT', 'EV', 'PC', 'GN', 'GC',
  ]);

  function variationData(data) {
    const clean = {};
    for (const [property, value] of Object.entries(data || {})) {
      if (ROOT_ONLY_PROPERTIES.has(property)) continue;
      clean[property] = Array.isArray(value) ? [...value] : value;
    }
    return clean;
  }

  function variationSgf(node) {
    return S.sgf.stringify([node], { linebreak: '\n', indent: '  ' });
  }

  async function copyVariation() {
    const node = currentNode();
    if (!node) return;
    const text = variationSgf(node);
    variationClipboard = text;
    try {
      await navigator.clipboard.writeText(text);
      log('Current variation copied to the clipboard.', 'success');
    } catch {
      log('Current variation copied to the internal clipboard.', 'warn');
    }
  }

  async function cutVariation() {
    if (readOnly) { log('Read Only: cutting is disabled.', 'warn'); return; }
    const node = currentNode();
    if (!node || node.parentId == null) { log('The root node cannot be cut.', 'warn'); return; }
    const parentId = node.parentId;
    await copyVariation();
    mutateTree((draft) => draft.removeNode(node.id), { select: parentId, message: 'Node cut to the variation clipboard.' });
  }

  async function pasteVariation() {
    if (readOnly) { log('Read Only: pasting is disabled.', 'warn'); return; }
    let text = variationClipboard;
    if (!text && navigator.clipboard?.readText) {
      try { text = await navigator.clipboard.readText(); } catch { /* internal clipboard only */ }
    }
    if (!text) { log('The variation clipboard is empty.', 'warn'); return; }
    let roots;
    try { roots = S.sgf.parse(text, { getId }); }
    catch (error) { log(`Could not parse the variation: ${error.message}`, 'error'); return; }
    if (!roots.length) { log('The variation clipboard contains no game tree.', 'warn'); return; }
    let newRootId = null;
    mutateTree((draft) => {
      const append = (parentId, source) => {
        const created = draft.appendNode(parentId, variationData(source.data));
        if (newRootId == null) newRootId = created;
        for (const child of source.children) append(created, child);
        return created;
      };
      append(nodeId, roots[0]);
    }, { select: () => newRootId, message: 'Variation pasted as a child.' });
  }

  function duplicateNode() {
    const node = currentNode();
    if (!node) return;
    let newId = null;
    mutateTree((draft) => {
      newId = draft.appendNode(nodeId, variationData(node.data));
    }, { select: () => newId, message: 'Node duplicated.' });
  }

  function insertEmptyNode() {
    let newId = null;
    mutateTree((draft) => {
      newId = draft.appendNode(nodeId, {});
    }, { select: () => newId, message: 'Empty node inserted.' });
  }

  function flattenVariation() {
    const path = S.getPath(tree, nodeId);
    const removals = [];
    for (const item of path) {
      if (item.parentId == null) continue;
      const parent = tree.get(item.parentId);
      for (const sibling of parent.children) {
        if (sibling.id !== item.id) removals.push(sibling.id);
      }
    }
    if (!removals.length) { log('There are no sibling variations to flatten.', 'warn'); return; }
    mutateTree((draft) => {
      for (const id of removals) if (tree.get(id)) draft.removeNode(id);
    }, { message: 'Current variation flattened.' });
  }

  function focusComment() {
    setTab('comment');
    if (!readOnly) commentInput.focus();
  }

  function focusGameInfo() {
    setTab('info');
    if (!infoFocusSnapshot) infoFocusSnapshot = { ...layout };
    const height = rightColumn.clientHeight;
    if (height > 0) {
      // Give Game Info the largest practical share while keeping the tree and log at their
      // 48 px minima and leaving the two splitter rows visible. The right column also gets
      // the widest allowed board split (82%).
      const panelChrome = 96 + horizontalSplitter.offsetHeight + messageSplitter.offsetHeight;
      const infoPercent = clamp(
        ((height - panelChrome) / height) * 100,
        LAYOUT_LIMITS.topPct[0],
        LAYOUT_LIMITS.topPct[1],
      );
      const messagePercent = clamp(
        (48 / height) * 100,
        LAYOUT_LIMITS.messagePct[0],
        LAYOUT_LIMITS.messagePct[1],
      );
      applyLayout({
        leftPct: LAYOUT_LIMITS.leftPct[0],
        topPct: infoPercent,
        messagePct: messagePercent,
      }, { persist: false });
    } else {
      applyLayout({ leftPct: LAYOUT_LIMITS.leftPct[0], topPct: 85, messagePct: 5 }, { persist: false });
    }
    infoDone.hidden = false;
    log('Info panel expanded for editing.');
    requestAnimationFrame(() => infoFields.black.focus());
  }

  function restoreInfoPanel() {
    const previous = infoFocusSnapshot;
    infoFocusSnapshot = null;
    infoDone.hidden = true;
    if (previous) applyLayout(previous, { persist: false });
    log('Info panel restored.');
  }

  function applyReadOnlyUI() {
    document.body.classList.toggle('is-readonly', readOnly);
    statusReadonly.hidden = !readOnly;
    boardSizeSelect.disabled = readOnly;
    const viewSizeSelect = $('#view-board-size');
    if (viewSizeSelect) viewSizeSelect.disabled = readOnly;
    for (const element of Object.values(infoFields)) element.disabled = readOnly;
    commentInput.disabled = readOnly;
    if (readOnly) {
      mode = 'play';
      selectedTool = 'stone_1';
      lineColor = null;
      dimColor = null;
      pending = null;
      commentNodeId = null;
    }
    updateToolbar();
    syncMenuState();
    renderComment();
    updateTitle();
    scheduleBoardDraw();
  }

  async function toggleReadOnly() {
    if (!readOnly && dirty) {
      if (!(await askConfirm('Discard unsaved changes and enable Read Only?', 'Read Only'))) return;
      if (cleanTree) {
        tree = cleanTree;
        nodeId = cleanNodeId != null && tree.get(cleanNodeId) ? cleanNodeId : tree.root.id;
        undoStack = [];
        redoStack = [];
        pending = null;
        commentNodeId = null;
        dirty = false;
        S.clearBoardCache();
        refreshBoard();
        syncInfoForm();
        syncSizeSelect();
        renderAll();
        resizeBoard();
      }
    }
    readOnly = !readOnly;
    if (readOnly) {
      mode = 'play';
      selectedTool = 'stone_1';
      pending = null;
    }
    applyReadOnlyUI();
    log(readOnly ? 'Read Only enabled — viewing and tree navigation only.' : 'Read Only disabled.');
  }

  function toggleEditMode() {
    if (readOnly) { log('Read Only: editing is disabled.', 'warn'); return; }
    mode = mode === 'edit' ? 'play' : 'edit';
    pending = null;
    if (mode === 'edit') selectedTool = 'stone_1';
    renderAll();
    requestAnimationFrame(resizeBoard);
    log(mode === 'edit' ? 'Edit mode.' : 'Play mode.');
  }

  function toggleTurn() {
    const sign = playerToMove();
    const value = sign > 0 ? 'W' : 'B';
    const changed = mutateTree((draft) => draft.updateProperty(nodeId, 'PL', [value]), { message: null });
    if (changed) logNodeProperty('PL');
  }

  function selectTool(tool) {
    if (readOnly) { log('Read Only: edit tools are disabled.', 'warn'); return; }
    if (mode !== 'edit') { mode = 'edit'; editbar.hidden = false; }
    selectedTool = tool;
    pending = null;
    renderAll();
    requestAnimationFrame(resizeBoard);
    scheduleBoardDraw();
  }

  function selectColor(color) {
    if (selectedTool === 'dim') dimColor = color;
    else lineColor = color;
    updateToolbar();
    scheduleBoardDraw();
  }

  // Menus ----------------------------------------------------------------
  const menuEls = $$('.menu');
  let activeMenu = null;
  const menuItems = (menu) => $$('.menu-item:not(:disabled)', menu);

  function setMenuOpen(menu, open) {
    const trigger = $('.menu-trigger', menu);
    const popup = $('.menu-popup', menu);
    trigger.setAttribute('aria-expanded', String(open));
    popup.hidden = !open;
    if (open) {
      if (activeMenu && activeMenu !== menu) setMenuOpen(activeMenu, false);
      activeMenu = menu;
    } else if (activeMenu === menu) activeMenu = null;
  }

  function openMenu(menu, { focus = null } = {}) {
    setMenuOpen(menu, true);
    if (focus) {
      const items = menuItems(menu);
      (focus === 'last' ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
    } else {
      $('.menu-trigger', menu).focus({ preventScroll: true });
    }
  }

  function closeMenus({ restoreFocus = false } = {}) {
    if (!activeMenu) return;
    const menu = activeMenu;
    setMenuOpen(menu, false);
    if (restoreFocus) $('.menu-trigger', menu).focus({ preventScroll: true });
  }

  function moveMenuFocus(menu, direction) {
    const index = menuEls.indexOf(menu);
    $('.menu-trigger', menuEls[(index + direction + menuEls.length) % menuEls.length]).focus({ preventScroll: true });
  }

  function runAction(action) {
    try {
      const result = action();
      if (result && typeof result.catch === 'function') result.catch((error) => log(`Action failed: ${error.message}`, 'error'));
    } catch (error) {
      log(`Action failed: ${error.message}`, 'error');
    }
  }

  menuEls.forEach((menu) => {
    const trigger = $('.menu-trigger', menu);
    const popup = $('.menu-popup', menu);
    trigger.addEventListener('click', () => { if (activeMenu === menu) closeMenus({ restoreFocus: true }); else openMenu(menu); });
    trigger.addEventListener('pointerenter', () => { if (activeMenu && activeMenu !== menu) openMenu(menu); });
    trigger.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu(menu, { focus: 'first' }); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); openMenu(menu, { focus: 'last' }); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); moveMenuFocus(menu, -1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); moveMenuFocus(menu, 1); }
    });
    popup.addEventListener('keydown', (event) => {
      const items = menuItems(menu);
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus({ preventScroll: true }); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus({ preventScroll: true }); }
      else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus({ preventScroll: true }); }
      else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus({ preventScroll: true }); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); openMenu(menuEls[(menuEls.indexOf(menu) + 1) % menuEls.length], { focus: 'first' }); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); openMenu(menuEls[(menuEls.indexOf(menu) - 1 + menuEls.length) % menuEls.length], { focus: 'first' }); }
      else if (event.key === 'Escape') { event.preventDefault(); closeMenus({ restoreFocus: true }); }
      else if (event.key === 'Tab') closeMenus();
    });
    popup.addEventListener('click', (event) => {
      const item = event.target.closest('.menu-item');
      if (!item || item.disabled) return;
      if (item.dataset.recentIndex != null) {
        closeMenus();
        runAction(() => openRecent(Number(item.dataset.recentIndex)));
        return;
      }
      const action = menuActions[item.dataset.action];
      closeMenus();
      if (action) runAction(action);
    });
  });

  document.addEventListener('pointerdown', (event) => { if (activeMenu && !activeMenu.contains(event.target)) closeMenus(); }, true);
  window.addEventListener('blur', () => closeMenus());

  const menuSelectHandlers = {
    size: async (value) => {
      closeMenus();
      if (value === 'custom') { promptCustomSize(); return; }
      await changeBoardSize(Number(value), Number(value));
      syncMenuSelects();
    },
    coords: (value) => {
      closeMenus();
      if (value === 'none') {
        if (!settings.coords) return;
        settings.coords = false;
        saveSettings();
        updateToolbar();
        syncMenuState();
        scheduleBoardDraw();
        log('Coordinates hidden.');
      } else {
        setCoordinatesStyle(value);
      }
    },
    numbers: (value) => {
      closeMenus();
      if (value === 'none') setMoveNumberLimit(-1);
      else if (value === 'all') setMoveNumberLimit(0);
      else if (value === 'custom') promptMoveNumberLimit();
      else setMoveNumberLimit(Number(value));
    },
    numbering: (value) => { closeMenus(); setMoveNumbersMode(value); },
    language: (value) => { closeMenus(); setLanguage(value); },
    theme: (value) => { closeMenus(); setTheme(value); },
    delay: (value) => { closeMenus(); setAutoplayDelay(Number(value)); },
  };

  for (const select of $$('[data-menu-select]')) {
    select.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') closeMenus();
    });
    select.addEventListener('change', () => {
      const handler = menuSelectHandlers[select.dataset.menuSelect];
      if (!handler) return;
      try {
        const result = handler(select.value);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => log(`Menu option failed: ${error.message}`, 'error'));
        }
      } catch (error) {
        log(`Menu option failed: ${error.message}`, 'error');
      }
      syncMenuSelects();
    });
  }

  const menuActions = {
    'new-game': newGame, 'open-sgf': openSgf,
    'save-sgf': () => saveSgf(false), 'save-sgf-as': () => saveSgf(true),
    quit: quitApp, undo, redo, 'toggle-edit': toggleEditMode, 'toggle-readonly': toggleReadOnly,
    'delete-node': deleteNode, 'make-main': makeMainVariation,
    'cut-variation': cutVariation, 'copy-variation': copyVariation, 'paste-variation': pasteVariation,
    'duplicate-node': duplicateNode, 'insert-node': insertEmptyNode,
    'flatten-variation': flattenVariation, 'focus-comment': focusComment,
    'shift-left': () => shiftVariation('left'), 'shift-right': () => shiftVariation('right'),
    'remove-siblings': removeOtherVariations, 'clear-markup': clearNodeMarkup,
    'focus-info': focusGameInfo,
    pass: passTurn, 'toggle-autoplay': toggleAutoPlay,
    first: goToBeginning, prev: goToParent, next: goToChild, last: goToEnd,
    'toggle-coords': toggleCoordinates, 'toggle-numbers': toggleMoveNumbers,
    'toggle-next-moves': () => toggleSettingFlag('showNextMoves', (on) => `Next moves ${on ? 'shown' : 'hidden'}.`),
    'toggle-siblings': () => toggleSettingFlag('showSiblings', (on) => `Sibling variations ${on ? 'shown' : 'hidden'}.`),
    'toggle-auto-layout': toggleAutoLayout,
    'copy-position-link': copyPositionLink,
    'zoom-in': () => setZoom(settings.zoom * 1.15),
    'zoom-out': () => setZoom(settings.zoom / 1.15),
    'zoom-reset': () => setZoom(1),
    'toggle-fullscreen': toggleFullScreen,
    'toggle-tree': toggleTree,
    'toggle-remember-size': toggleRememberBoardSize,
    'reset-settings': resetAllSettings,
    'reset-layout': resetLayout, 'copy-sgf': copySgf, 'paste-sgf': pasteSgf,
    'clear-recents': clearRecentFiles,
    'clear-messages': clearMessages, 'toggle-turn': toggleTurn,
    preferences: openSetup, shortcuts: showShortcuts, about: showAbout,
  };

  // Game info / preferences / help --------------------------------------
  const INFO_BINDINGS = {
    black: 'PB', blackRank: 'BR', blackTeam: 'BT',
    white: 'PW', whiteRank: 'WR', whiteTeam: 'WT',
    result: 'RE', komi: 'KM', handicap: 'HA', rules: 'RU',
    date: 'DT', time: 'TM', event: 'EV', place: 'PC', round: 'RO',
    gameName: 'GN', user: 'US', source: 'SO', copyright: 'CP',
    comment: 'GC', annotation: 'AN',
  };

  function setRootProperty(prop, value) {
    mutateTree((draft) => {
      if (value == null || value === '') draft.removeProperty(tree.root.id, prop);
      else draft.updateProperty(tree.root.id, prop, [String(value)]);
    }, { message: 'Game info updated.' });
  }

  for (const [key, element] of Object.entries(infoFields)) {
    if (!element) continue;
    element.addEventListener('change', () => setRootProperty(INFO_BINDINGS[key], element.value));
  }
  $('#game-info').addEventListener('submit', (event) => event.preventDefault());

  commentInput.addEventListener('input', () => renderCommentPreview(commentInput.value));
  commentInput.addEventListener('change', () => {
    const value = commentInput.value;
    const node = currentNode();
    if (!node) return;
    if ((node.data.C?.[0] || '') === value) return;
    mutateTree((draft) => {
      if (value.trim()) draft.updateProperty(nodeId, 'C', [value]);
      else draft.removeProperty(nodeId, 'C');
    }, { message: 'Comment updated.' });
    commentNodeId = nodeId;
    renderComment();
  });
  tabInfo.addEventListener('click', () => setTab('info'));
  tabComment.addEventListener('click', () => setTab('comment'));
  infoDone.addEventListener('click', restoreInfoPanel);

  function toggleCoordinates() {
    settings.coords = !settings.coords;
    saveSettings();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    log(`Coordinates ${settings.coords ? 'shown' : 'hidden'}.`);
  }

  function toggleMoveNumbers() {
    settings.moveNumberLimit = settings.moveNumberLimit < 0 ? 0 : -1;
    saveSettings();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    log(`Move numbers ${settings.moveNumberLimit >= 0 ? 'shown' : 'hidden'}.`);
  }

  function promptMoveNumberLimit() {
    const current = settings.moveNumberLimit > 0 ? settings.moveNumberLimit : 25;
    askText(String(current), 'Move numbers: last N moves').then((text) => {
      if (text == null) return;
      const value = Number(text);
      if (!Number.isInteger(value) || value < 1 || value > 999) {
        log('Enter a whole number of moves from 1 to 999.', 'warn');
        return;
      }
      setMoveNumberLimit(value);
    });
  }

  function setCoordinatesStyle(style) {
    settings.coords = true;
    settings.coordinatesStyle = style;
    saveSettings();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    log(`Coordinate style: ${style}.`);
  }

  function setMoveNumbersMode(mode) {
    if (settings.moveNumberLimit < 0) settings.moveNumberLimit = 0;
    settings.moveNumbersMode = mode;
    saveSettings();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    log(`Move numbers: ${mode === 'variation' ? 'variation start' : 'game start'}.`);
  }

  function setMoveNumberLimit(limit) {
    settings.moveNumberLimit = limit;
    saveSettings();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    log(limit < 0 ? 'Move numbers hidden.' : limit === 0 ? 'Showing all move numbers.' : `Showing the last ${limit} move numbers.`);
  }

  function toggleSettingFlag(key, message) {
    settings[key] = !settings[key];
    saveSettings();
    syncMenuState();
    scheduleBoardDraw();
    log(message(settings[key]));
  }

  function setZoom(value) {
    settings.zoom = clamp(value, 0.5, 2);
    saveSettings();
    paneBoard.classList.toggle('is-zoomed', settings.zoom > 1.001);
    resizeBoard();
    log(`Board zoom: ${Math.round(settings.zoom * 100)}%.`);
  }

  function setLanguage(language) {
    settings.language = language === 'zh' ? 'zh' : 'en';
    saveSettings();
    applyLanguage();
    log(settings.language === 'zh' ? '界面语言：简体中文' : 'Language: English');
  }

  function toggleRememberBoardSize() {
    settings.rememberBoardSize = settings.rememberBoardSize === false;
    if (settings.rememberBoardSize) {
      const { width, height } = gameSize();
      rememberBoardSize(width, height);
    } else {
      settings.boardWidth = null;
      settings.boardHeight = null;
      saveSettings();
    }
    syncMenuState();
    log(settings.rememberBoardSize ? 'Board size will be remembered.' : 'Board size will not be remembered.');
  }

  function setAutoplayDelay(delay) {
    settings.autoPlayDelay = clamp(Number(delay) || 1000, 200, 5000);
    saveSettings();
    syncMenuState();
    if (autoPlayTimer) {
      stopAutoPlay();
      toggleAutoPlay();
    }
    log(`Auto-play delay: ${settings.autoPlayDelay} ms.`);
  }

  async function resetAllSettings() {
    if (!(await askConfirm('Reset all settings and the panel layout?', 'Reset settings'))) return;
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LAYOUT_KEY);
    location.reload();
  }

  async function toggleFullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      log(`Full screen unavailable: ${error.message}`, 'warn');
    }
  }

  function applyLanguage() {
    const language = settings.language === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    const excluded = '#statuslog, #game-tree, #comment-preview, #comment-input, #file-label, #tree-meta, #comment-title, #tool-turn, #editbar-hint, #autoplay-label, #status-next, #status-captures, #status-stones, #status-cursor, #status-move, #about-runtime, #about-board, #about-game, #confirm-message, #custom-size-error, #label-title';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(excluded)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.__enText) node.__enText = node.nodeValue;
      const trimmed = node.__enText.trim();
      node.nodeValue = node.__enText.replace(trimmed, t(trimmed));
    }
    for (const element of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
      if (element.closest('#statuslog, #game-tree, #board')) continue;
      let cache = languageAttributeCache.get(element);
      if (!cache) {
        cache = {};
        languageAttributeCache.set(element, cache);
      }
      for (const attribute of ['title', 'placeholder', 'aria-label']) {
        if (!element.hasAttribute(attribute)) continue;
        if (!(attribute in cache)) cache[attribute] = element.getAttribute(attribute);
        element.setAttribute(attribute, t(cache[attribute]));
      }
    }
    if (tree) {
      updateToolbar();
      syncMenuState();
      renderStatus();
      renderTree();
      renderComment();
      updateTitle();
    }
  }

  function setTheme(theme, { persist = true, silent = false } = {}) {
    const next = THEMES.includes(theme) ? theme : 'classic';
    settings.theme = next;
    for (const name of THEMES) document.documentElement.classList.toggle(`theme-${name}`, name === next);
    document.documentElement.dataset.boardTheme = next;
    refreshPalette();
    scheduleBoardDraw();
    if (tree) syncMenuState();
    if (persist) saveSettings();
    if (!silent) log(`Board theme: ${next}.`);
  }

  function applyBoardAppearance() {
    boardCanvas.style.filter = Math.abs(settings.boardBrightness - 1) < 0.001
      ? ''
      : `brightness(${settings.boardBrightness})`;
  }

  function toggleAutoLayout() {
    settings.autoLayout = settings.autoLayout === false;
    saveSettings();
    updateResponsiveLayout();
    syncMenuState();
    log(settings.autoLayout ? 'Responsive layout enabled.' : 'Responsive layout disabled.');
  }

  function sizePortraitBoard() {
    const height = clamp(
      Math.round(workspace.clientHeight * 0.58),
      220,
      Math.max(220, workspace.clientHeight - 280),
    );
    document.documentElement.style.setProperty('--portrait-board-height', `${height}px`);
    paneBoard.style.height = `${height}px`;
  }

  function updateResponsiveLayout() {
    if (!tree) return;
    const shouldPortrait = settings.autoLayout !== false && workspace.clientWidth > 0 && workspace.clientWidth < 1120;
    if (shouldPortrait === portraitLayout) {
      if (shouldPortrait) {
        sizePortraitBoard();
        scheduleBoardDraw();
      }
      return;
    }
    portraitLayout = shouldPortrait;
    workspace.classList.toggle('is-portrait', shouldPortrait);
    if (shouldPortrait) {
      verticalSplitter.hidden = true;
      paneBoard.style.flex = '0 0 auto';
      sizePortraitBoard();
    } else {
      verticalSplitter.hidden = false;
      paneBoard.style.height = '';
      document.documentElement.style.removeProperty('--portrait-board-height');
      applyLayout(layout, { persist: false });
    }
    requestAnimationFrame(resizeBoard);
  }

  function scheduleResponsiveLayout() {
    if (responsiveFrame) return;
    responsiveFrame = requestAnimationFrame(() => {
      responsiveFrame = 0;
      updateResponsiveLayout();
    });
  }

  function applyViewState() {
    if (!tree) return;
    paneMoves.hidden = !settings.showTree;
    horizontalSplitter.hidden = !settings.showTree;
    paneMessage.hidden = false;
    messageSplitter.hidden = false;
    paneInfo.style.flex = settings.showTree ? `0 0 ${layout.topPct}%` : '1 1 auto';
    paneMessage.style.flex = `0 0 ${layout.messagePct}%`;
    paneBoard.classList.toggle('is-zoomed', settings.zoom > 1.001);
    resizeBoard();
  }

  function toggleTree() {
    settings.showTree = !settings.showTree;
    saveSettings();
    syncMenuState();
    applyViewState();
    log(`Game tree ${settings.showTree ? 'shown' : 'hidden'}.`);
  }

  function clearMessages() { statuslog.replaceChildren(); log('Messages cleared.'); }
  clearMessageButton.addEventListener('click', clearMessages);

  function resetLayout() {
    infoFocusSnapshot = null;
    if (infoDone) infoDone.hidden = true;
    applyLayout({ ...DEFAULT_LAYOUT });
    applyViewState();
    log('Panel layout reset.');
  }

  function setSetupTab(tab) {
    for (const button of setupTabs) button.classList.toggle('is-active', button.dataset.setupTab === tab);
    for (const panel of setupPanels) panel.hidden = panel.dataset.setupPanel !== tab;
  }

  function syncSetupBrightness() {
    setupBrightnessValue.textContent = `${setupBrightness.value}%`;
  }

  function openSetup() {
    setupTheme.value = settings.theme;
    setupBrightness.value = String(Math.round(settings.boardBrightness * 100));
    syncSetupBrightness();
    setupCoords.checked = settings.coords;
    setupCoordStyle.value = settings.coordinatesStyle;
    setupDefaultSize.value = String(settings.defaultSize);
    setupStoneTexture.checked = settings.stoneTexture !== false;
    setupFocusMarker.value = settings.focusMarker;
    setupFocusColor.value = settings.focusColor;
    setupHideMarkers.checked = settings.hideMarkers;
    setupNextMoves.checked = settings.showNextMoves;
    setupSiblings.checked = settings.showSiblings;
    const limit = settings.moveNumberLimit;
    setupNumbers.value = limit < 0 ? 'none' : limit === 0 ? 'all' : [10, 25, 50].includes(limit) ? String(limit) : 'all';
    setupNumbering.value = settings.moveNumbersMode;
    setupLabelChar.value = settings.labelStartChar;
    setupResultTitle.checked = settings.showResultInTitle;
    setupSound.checked = settings.soundEnabled;
    setupDelay.value = String(settings.autoPlayDelay);
    setupPreferVariation.checked = settings.preferVariationChild;
    setupKomi.value = String(settings.defaultKomi);
    setupWhiteFirst.checked = settings.whiteFirst;
    setupRightClickUndo.checked = settings.rightClickUndo;
    setupOpenReadOnly.checked = settings.openReadOnly;
    setSetupTab('board');
    if (!setupDialog.open) setupDialog.showModal();
  }

  function applySetup() {
    const theme = setupTheme.value;
    const brightness = clamp(Number(setupBrightness.value) / 100 || 1, 0.5, 1.5);
    const limitValue = setupNumbers.value;
    const limit = limitValue === 'none' ? -1 : limitValue === 'all' ? 0 : Number(limitValue);
    const komi = Number(setupKomi.value);
    const defaultSize = [9, 13, 19].includes(Number(setupDefaultSize.value)) ? Number(setupDefaultSize.value) : 13;
    const previousDefaultSize = settings.defaultSize;
    Object.assign(settings, {
      coords: setupCoords.checked,
      coordinatesStyle: setupCoordStyle.value,
      theme,
      boardBrightness: brightness,
      stoneTexture: setupStoneTexture.checked,
      focusMarker: setupFocusMarker.value,
      focusColor: setupFocusColor.value,
      hideMarkers: setupHideMarkers.checked,
      showNextMoves: setupNextMoves.checked,
      showSiblings: setupSiblings.checked,
      moveNumberLimit: Number.isFinite(limit) ? limit : -1,
      moveNumbersMode: setupNumbering.value,
      labelStartChar: (setupLabelChar.value || 'A').slice(0, 1).toUpperCase() || 'A',
      showResultInTitle: setupResultTitle.checked,
      soundEnabled: setupSound.checked,
      autoPlayDelay: clamp(Number(setupDelay.value) || 1000, 200, 5000),
      preferVariationChild: setupPreferVariation.checked,
      defaultKomi: Number.isFinite(komi) ? komi : 6.5,
      whiteFirst: setupWhiteFirst.checked,
      rightClickUndo: setupRightClickUndo.checked,
      openReadOnly: setupOpenReadOnly.checked,
    });
    settings.defaultSize = defaultSize;
    if (defaultSize !== previousDefaultSize) {
      settings.boardWidth = defaultSize;
      settings.boardHeight = defaultSize;
    }
    saveSettings();
    setTheme(theme, { persist: false, silent: true });
    applyBoardAppearance();
    setupDialog.close();
    renderAll();
    syncMenuSelects();
    updateTitle();
    scheduleBoardDraw();
    log('Set Up options applied.');
  }

  function resetSetupDefaults() {
    setupTheme.value = DEFAULT_SETTINGS.theme;
    setupBrightness.value = String(DEFAULT_SETTINGS.boardBrightness * 100);
    syncSetupBrightness();
    setupCoords.checked = DEFAULT_SETTINGS.coords;
    setupCoordStyle.value = DEFAULT_SETTINGS.coordinatesStyle;
    setupDefaultSize.value = String(DEFAULT_SETTINGS.defaultSize);
    setupStoneTexture.checked = DEFAULT_SETTINGS.stoneTexture;
    setupFocusMarker.value = DEFAULT_SETTINGS.focusMarker;
    setupFocusColor.value = DEFAULT_SETTINGS.focusColor;
    setupHideMarkers.checked = DEFAULT_SETTINGS.hideMarkers;
    setupNextMoves.checked = DEFAULT_SETTINGS.showNextMoves;
    setupSiblings.checked = DEFAULT_SETTINGS.showSiblings;
    setupNumbers.value = 'none';
    setupNumbering.value = DEFAULT_SETTINGS.moveNumbersMode;
    setupLabelChar.value = DEFAULT_SETTINGS.labelStartChar;
    setupResultTitle.checked = DEFAULT_SETTINGS.showResultInTitle;
    setupSound.checked = DEFAULT_SETTINGS.soundEnabled;
    setupDelay.value = String(DEFAULT_SETTINGS.autoPlayDelay);
    setupPreferVariation.checked = DEFAULT_SETTINGS.preferVariationChild;
    setupKomi.value = String(DEFAULT_SETTINGS.defaultKomi);
    setupWhiteFirst.checked = DEFAULT_SETTINGS.whiteFirst;
    setupRightClickUndo.checked = DEFAULT_SETTINGS.rightClickUndo;
    setupOpenReadOnly.checked = DEFAULT_SETTINGS.openReadOnly;
  }

  for (const button of setupTabs) button.addEventListener('click', () => setSetupTab(button.dataset.setupTab));
  setupBrightness.addEventListener('input', syncSetupBrightness);
  $('#setup-ok').addEventListener('click', applySetup);
  $('#setup-reset').addEventListener('click', resetSetupDefaults);

  function runtimeSummary() {
    if (isElectron) return `Electron ${desktop.versions?.electron ?? '?'} · Chromium ${desktop.versions?.chrome ?? '?'} · ${desktop.platform}`;
    const match = navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/([\d.]+)/);
    const name = match ? match[1].replace('Edg', 'Edge') : 'Browser';
    return `${name}${match ? ` ${match[2]}` : ''} · browser preview`;
  }

  function showAbout() {
    aboutRuntime.textContent = runtimeSummary();
    aboutBoard.textContent = `${gameSize().width}×${gameSize().height} · ${tree.getHeight()} nodes`;
    aboutGame.textContent = `${rootProperty('PB', 'Black')} vs ${rootProperty('PW', 'White')}`;
    if (!aboutDialog.open) aboutDialog.showModal();
  }

  function showShortcuts() { if (!shortcutsDialog.open) shortcutsDialog.showModal(); }

  // Board input ----------------------------------------------------------
  function updateCursor(point) {
    cursor = point;
    statusCursor.textContent = point ? `${t('Cursor')}: ${coordLabel(point.x, point.y)}` : `${t('Cursor')}: —`;
  }

  boardCanvas.addEventListener('pointermove', (event) => {
    const point = pointFromEvent(event);
    const same = (point && hover && point.x === hover.x && point.y === hover.y) || (!point && !hover);
    if (same) return;
    hover = point;
    updateCursor(point);
    scheduleBoardDraw();
  });

  boardCanvas.addEventListener('pointerleave', () => {
    if (!hover) return;
    hover = null;
    updateCursor(null);
    scheduleBoardDraw();
  });

  boardCanvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      if (mode === 'edit') {
        const point = pointFromEvent(event);
        if (point) { event.preventDefault(); eraseAt(point.x, point.y); }
      } else if (settings.rightClickUndo && !readOnly) {
        const node = currentNode();
        if (node && node.parentId != null) {
          event.preventDefault();
          deleteNode();
        }
      }
      return;
    }
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    if (mode === 'edit') editAt(point.x, point.y);
    else playAt(point.x, point.y);
  });
  boardCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // Toolbar / shortcuts --------------------------------------------------
  for (const button of $$('.tool[data-action]')) {
    button.addEventListener('click', () => {
      const action = menuActions[button.dataset.action];
      if (action) runAction(action);
    });
  }
  for (const button of editTools) {
    button.addEventListener('click', () => selectTool(button.dataset.tool));
  }
  for (const button of colorButtons) {
    button.addEventListener('click', () => selectColor(button.dataset.color || null));
  }

  boardSizeSelect.addEventListener('change', () => {
    const value = boardSizeSelect.value;
    if (value === 'custom') {
      promptCustomSize();
      return;
    }
    const parts = value.split(':').map(Number);
    const width = parts[0];
    const height = parts[1] || width;
    changeBoardSize(width, height);
  });

  function promptCustomSize() {
    const current = gameSize();
    askCustomSize(`${current.width}*${current.height}`).then((parsed) => {
      if (!parsed) { syncSizeSelect(); return; }
      changeBoardSize(parsed.width, parsed.height);
    });
  }

  function changeBoardSize(width, height) {
    if (readOnly) { log('Read Only: board size cannot be changed.', 'warn'); syncSizeSelect(); return; }
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2 || w > 52 || h > 52) {
      log('Board dimensions must each be between 2 and 52.', 'warn');
      syncSizeSelect();
      return;
    }
    if (w === gameSize().width && h === gameSize().height) { syncSizeSelect(); return; }
    askConfirm(`Start a new ${w}×${h} game? The current game will be closed.`, 'Change board').then((confirmed) => {
      if (!confirmed) { syncSizeSelect(); return; }
      startGame({ width: w, height: h }, { info: gameInfoForNewGame() });
      log(`New ${w}×${h} game.`);
    });
  }

  function updateAcceleratorLabels() {
    for (const kbd of $$('kbd[data-accel]')) {
      const value = kbd.dataset.accel;
      kbd.textContent = isMac ? value.replace(/Ctrl/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥').replace(/\+/g, '') : value;
    }
  }

  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'F1') { event.preventDefault(); showShortcuts(); return; }
    if (event.key === 'F11') { event.preventDefault(); runAction(toggleFullScreen); return; }
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
    if (activeMenu) {
      if (event.key === 'Escape') { event.preventDefault(); closeMenus({ restoreFocus: true }); }
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const key = event.key.toLowerCase();
      const menu = menuEls.find((candidate) => $('.menu-trigger', candidate).dataset.key === key);
      if (menu) { event.preventDefault(); openMenu(menu, { focus: 'first' }); return; }
    }
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (modifier && event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'c') { event.preventDefault(); runAction(copyVariation); }
      else if (key === 'x') { event.preventDefault(); runAction(cutVariation); }
      else if (key === 'v') { event.preventDefault(); runAction(pasteVariation); }
      else if (key === 'd') { event.preventDefault(); runAction(duplicateNode); }
      else if (key === 'n') { event.preventDefault(); runAction(insertEmptyNode); }
      else if (key === 'f') { event.preventDefault(); runAction(flattenVariation); }
      return;
    }
    if (modifier && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'n') { event.preventDefault(); runAction(newGame); }
      else if (key === 'o') { event.preventDefault(); runAction(openSgf); }
      else if (key === 's') { event.preventDefault(); runAction(() => saveSgf(event.shiftKey)); }
      else if (key === 'q') { event.preventDefault(); runAction(quitApp); }
      else if (key === 'z') { event.preventDefault(); runAction(event.shiftKey ? redo : undo); }
      else if (key === 'y') { event.preventDefault(); runAction(redo); }
      else if (key === 'e') { event.preventDefault(); runAction(toggleEditMode); }
      else if (key === 'p' && event.shiftKey) { event.preventDefault(); runAction(toggleTurn); }
      else if (key === 'd' && event.shiftKey) { event.preventDefault(); runAction(() => selectTool('dim')); }
      else if (key === 'c' && event.shiftKey) { event.preventDefault(); runAction(copySgf); }
      else if (key === 'v' && event.shiftKey) { event.preventDefault(); runAction(pasteSgf); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); runAction(deleteNode); }
      else if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        const tools = ['stone_1', 'cross', 'triangle', 'square', 'circle', 'line', 'arrow', 'label', 'number'];
        runAction(() => selectTool(tools[Number(key) - 1]));
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button')) return;
    switch (event.key) {
      case 'ArrowUp': case 'PageUp': event.preventDefault(); goToParent(); break;
      case 'ArrowDown': case 'PageDown': event.preventDefault(); goToChild(); break;
      case 'ArrowLeft': event.preventDefault(); goToSibling(-1); break;
      case 'ArrowRight': event.preventDefault(); goToSibling(1); break;
      case 'Home': event.preventDefault(); goToBeginning(); break;
      case 'End': event.preventDefault(); goToEnd(); break;
      case 'p': case 'P': event.preventDefault(); runAction(passTurn); break;
      case ' ': event.preventDefault(); runAction(toggleAutoPlay); break;
      case 'Escape':
        if (pending) { pending = null; updateToolbar(); scheduleBoardDraw(); }
        else if (mode === 'edit') runAction(toggleEditMode);
        break;
      default: break;
    }
  });

  // Layout ---------------------------------------------------------------
  const LAYOUT_KEY = 'figdesk.layout.v3';
  const DEFAULT_LAYOUT = Object.freeze({ leftPct: 72.5694, topPct: 41, messagePct: 20 });
  const LAYOUT_LIMITS = Object.freeze({ leftPct: [18, 82], topPct: [3, 92], messagePct: [3, 92] });
  const PIXEL_MINIMUMS = Object.freeze({ left: [320, 260], top: [48, 48], message: [48, 48] });
  let layout = { ...DEFAULT_LAYOUT };
  let layoutRestored = false;

  function normalizeLayout(value) {
    if (!value || typeof value !== 'object') return null;
    const leftPct = Number(value.leftPct);
    const topPct = Number(value.topPct);
    const messagePct = Number(value.messagePct ?? DEFAULT_LAYOUT.messagePct);
    if (!Number.isFinite(leftPct) || !Number.isFinite(topPct) || !Number.isFinite(messagePct)) return null;
    if (leftPct <= 0 || leftPct >= 100 || topPct <= 0 || topPct >= 100 || messagePct <= 0 || messagePct >= 100) return null;
    return {
      leftPct: clamp(leftPct, LAYOUT_LIMITS.leftPct[0], LAYOUT_LIMITS.leftPct[1]),
      topPct: clamp(topPct, LAYOUT_LIMITS.topPct[0], LAYOUT_LIMITS.topPct[1]),
      messagePct: clamp(messagePct, LAYOUT_LIMITS.messagePct[0], LAYOUT_LIMITS.messagePct[1]),
    };
  }

  function readLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return { layout: { ...DEFAULT_LAYOUT }, restored: false, invalid: false };
      const stored = normalizeLayout(JSON.parse(raw));
      if (!stored) return { layout: { ...DEFAULT_LAYOUT }, restored: false, invalid: true };
      return { layout: stored, restored: true, invalid: false };
    } catch {
      return { layout: { ...DEFAULT_LAYOUT }, restored: false, invalid: true };
    }
  }

  function persistLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* session only */ }
  }

  function applyLayout(next, { persist = true } = {}) {
    layout = { leftPct: next.leftPct, topPct: next.topPct, messagePct: next.messagePct };
    paneBoard.style.flex = portraitLayout ? '0 0 auto' : `0 0 ${layout.leftPct}%`;
    paneInfo.style.flex = `0 0 ${layout.topPct}%`;
    paneMessage.style.flex = `0 0 ${layout.messagePct}%`;
    verticalSplitter.setAttribute('aria-valuenow', layout.leftPct.toFixed(1));
    horizontalSplitter.setAttribute('aria-valuenow', layout.topPct.toFixed(1));
    messageSplitter.setAttribute('aria-valuenow', layout.messagePct.toFixed(1));
    if (persist) persistLayout();
    if (tree) applyViewState();
    else scheduleBoardDraw();
  }

  function setupSplitter({
    splitter,
    pane,
    container,
    axis,
    layoutKey = axis === 'v' ? 'leftPct' : 'topPct',
    limits = axis === 'v' ? LAYOUT_LIMITS.leftPct : LAYOUT_LIMITS.topPct,
    minimums = axis === 'v' ? PIXEL_MINIMUMS.left : PIXEL_MINIMUMS.top,
    invert = false,
    maxSize = null,
  }) {
    const property = axis === 'v' ? 'width' : 'height';
    const resizeClass = axis === 'v' ? 'is-resizing-v' : 'is-resizing-h';
    const coordinate = (event) => (axis === 'v' ? event.clientX : event.clientY);
    const containerSize = () => (axis === 'v' ? container.clientWidth : container.clientHeight);
    let drag = null;

    splitter.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      closeMenus();
      drag = { pointerId: event.pointerId, startCoordinate: coordinate(event), startSize: pane.getBoundingClientRect()[property], moved: false };
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('is-active');
      document.body.classList.add('is-resizing', resizeClass);
    });

    splitter.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const delta = (coordinate(event) - drag.startCoordinate) * (invert ? -1 : 1);
      if (Math.abs(delta) >= 1) drag.moved = true;
      const maximum = maxSize
        ? Math.max(minimums[0], maxSize())
        : Math.max(minimums[0], containerSize() - minimums[1] - 1);
      pane.style.flex = `0 0 ${clamp(drag.startSize + delta, minimums[0], maximum)}px`;
    });

    const finish = (event, canceled) => {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      const state = drag;
      drag = null;
      document.body.classList.remove('is-resizing', 'is-resizing-v', 'is-resizing-h');
      splitter.classList.remove('is-active');
      if (splitter.hasPointerCapture(state.pointerId)) splitter.releasePointerCapture(state.pointerId);
      if (!state.moved || canceled) { applyLayout(layout, { persist: false }); return; }
      const percentage = clamp((pane.getBoundingClientRect()[property] / containerSize()) * 100, limits[0], limits[1]);
      applyLayout({ ...layout, [layoutKey]: Math.round(percentage * 100) / 100 });
      resizeBoard();
    };
    splitter.addEventListener('pointerup', (event) => finish(event, false));
    splitter.addEventListener('pointercancel', (event) => finish(event, true));
    splitter.addEventListener('lostpointercapture', (event) => finish(event, true));
    splitter.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 5 : 1;
      let next = layout[layoutKey];
      if (invert) {
        if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next -= step;
        else if (['ArrowRight', 'ArrowUp'].includes(event.key)) next += step;
        else if (event.key === 'Home') next = limits[0];
        else if (event.key === 'End') next = limits[1];
        else if (event.key === 'Enter') next = DEFAULT_LAYOUT[layoutKey];
        else return;
      } else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next -= step;
      else if (['ArrowRight', 'ArrowDown'].includes(event.key)) next += step;
      else if (event.key === 'Home') next = limits[0];
      else if (event.key === 'End') next = limits[1];
      else if (event.key === 'Enter') next = DEFAULT_LAYOUT[layoutKey];
      else return;
      event.preventDefault();
      event.stopPropagation();
      const maximumPercent = maxSize
        ? (Math.max(minimums[0], maxSize()) / containerSize()) * 100
        : limits[1];
      applyLayout({ ...layout, [layoutKey]: clamp(next, Math.min(limits[0], maximumPercent), Math.min(limits[1], maximumPercent)) });
      resizeBoard();
    });
  }

  // Boot -----------------------------------------------------------------
  function boot() {
    updateAcceleratorLabels();
    setTheme(settings.theme, { persist: false, silent: true });
    applyBoardAppearance();
    const stored = readLayout();
    layoutRestored = stored.restored;
    applyLayout(stored.layout);
    const splitterStackHeight = () => horizontalSplitter.offsetHeight + messageSplitter.offsetHeight;
    const treeMinimum = () => (settings.showTree ? 48 : 0);
    setupSplitter({ splitter: verticalSplitter, pane: paneBoard, container: workspace, axis: 'v' });
    setupSplitter({
      splitter: horizontalSplitter,
      pane: paneInfo,
      container: rightColumn,
      axis: 'h',
      maxSize: () => rightColumn.clientHeight - paneMessage.getBoundingClientRect().height - splitterStackHeight() - treeMinimum(),
    });
    setupSplitter({
      splitter: messageSplitter,
      pane: paneMessage,
      container: rightColumn,
      axis: 'h',
      layoutKey: 'messagePct',
      limits: LAYOUT_LIMITS.messagePct,
      minimums: PIXEL_MINIMUMS.message,
      invert: true,
      maxSize: () => rightColumn.clientHeight - paneInfo.getBoundingClientRect().height - splitterStackHeight() - treeMinimum(),
    });
    new ResizeObserver(() => resizeBoard()).observe(paneBoard);
    new ResizeObserver(() => scheduleResponsiveLayout()).observe(workspace);
    window.addEventListener('resize', scheduleResponsiveLayout);
    const initialSize = settings.rememberBoardSize !== false && settings.boardWidth && settings.boardHeight
      ? { width: settings.boardWidth, height: settings.boardHeight }
      : settings.defaultSize;
    startGame(initialSize, { persistSize: false });
    applyViewState();
    applyLanguage();
    renderRecentFiles();
    if (startupSgf) {
      applySgfText(startupSgf, 'the link');
      filePath = null;
      dirty = false;
      updateTitle();
    }
    if (startupPath && !startupPathApplied) {
      if (!maybeApplyStartupPath()) log('The position link will apply once a game is loaded.', 'warn');
    }
    updateResponsiveLayout();
    log('MultiGo Neo ready — play moves, or press Ctrl+E to edit.');
    log(`${gameSize().width}×${gameSize().height} board · ${runtimeSummary()} · ${layoutRestored ? 'layout restored' : 'default layout'}.`);
    if (stored.invalid) log('The saved panel layout could not be read.', 'warn');
    renderAll();
    resizeBoard();
  }

  if (new URLSearchParams(window.location.search).has('test')) {
    window.__figdesk = {
      get tree() { return tree; },
      get nodeId() { return nodeId; },
      get mode() { return mode; },
      get dirty() { return dirty; },
      readOnly: () => readOnly,
      settings: () => ({ ...settings }),
      recent: () => recentFiles.map(({ name, path, content }) => ({ name, path, hasContent: Boolean(content) })),
      addRecent: (name, text) => rememberRecent(name, text),
      openRecent: (index) => openRecent(index),
      clearRecent: () => clearRecentFiles(),
      lineWidths: () => ({ arrow: GAME_MARK_ARROW_WIDTH, line: GAME_MARK_LINE_WIDTH }),
      overlay: () => {
        const info = collectVariationHints();
        return {
          active: info.overlayActive,
          last: info.lastPoint,
          hints: info.hints.map(({ x, y, letter, alpha, dim, sign }) => ({ x, y, letter, alpha, dim, sign })),
        };
      },
      hover: () => (hover ? { ...hover } : null),
      positionLink: () => {
        const spec = window.MultiGoPath ? window.MultiGoPath.build(tree, nodeId) : '';
        const sgf = S.sgf.stringify([tree.root], { linebreak: '', indent: '' });
        return `${window.location.href.split(/[?#]/)[0]}?sgf=${encodeURIComponent(sgf)}&path=${encodeURIComponent(spec)}`;
      },
      gameSize,
      boardView,
      pointFor: (x, y) => {
        const rect = boardCanvas.getBoundingClientRect();
        const point = pointPosition(x, y);
        return { x: rect.left + point.x, y: rect.top + point.y };
      },
      snapshot: () => ({
        width: gameSize().width, height: gameSize().height,
        nodes: [...tree.listNodes()].length, depth: tree.getHeight(),
        nodeId, moveNumber: nodeMoveNumber(), mode, dirty, filePath,
        pending: pending ? { ...pending } : null, selectedTool,
      }),
      nodeData: () => JSON.parse(JSON.stringify(currentNode()?.data ?? {})),
      rootId: () => tree.root.id,
      childCount: () => currentNode()?.children.length ?? 0,
      sgfText: () => S.sgf.stringify([tree.root], { linebreak: '\n', indent: '  ' }),
      setTab,
      playAt, passTurn, selectNode, toggleEditMode, selectTool, startGame, applySgfText,
    };
  }

  boot();
})();
