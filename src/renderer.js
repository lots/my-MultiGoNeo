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
  const colorCss = { black: '#111', white: '#f5f5f5', red: '#d92b2b', yellow: '#e6b800', blue: '#2f6fed', green: '#1a7f37' };
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
  const fileLabel = $('#file-label');
  const treeMeta = $('#tree-meta');
  const gameTree = $('#game-tree');
  const infoFields = {
    black: $('#info-black'), blackRank: $('#info-black-rank'),
    white: $('#info-white'), whiteRank: $('#info-white-rank'),
    result: $('#info-result'), komi: $('#info-komi'),
    handicap: $('#info-handicap'), rules: $('#info-rules'),
    date: $('#info-date'), event: $('#info-event'),
    place: $('#info-place'), gameName: $('#info-game-name'),
    comment: $('#info-comment'),
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
  const preferencesDialog = $('#preferences-dialog');
  const prefSize = $('#pref-size');
  const prefDelay = $('#pref-delay');
  const prefCoords = $('#pref-coords');
  const prefNumbers = $('#pref-numbers');
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
    colorizeMoves: false,
    showNextMoves: false,
    showSiblings: false,
    zoom: 1,
    showTree: true,
    language: 'en',
    rememberBoardSize: true,
    boardWidth: null,
    boardHeight: null,
    autoPlayDelay: 1000,
    defaultSize: 13,
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
        coordinatesStyle: parsed.coordinatesStyle === '1-1' ? '1-1' : 'A1',
        moveNumbersMode: parsed.moveNumbersMode === 'variation' ? 'variation' : 'start',
        colorizeMoves: parsed.colorizeMoves === true,
        showNextMoves: parsed.showNextMoves === true,
        showSiblings: parsed.showSiblings === true,
        zoom: clamp(Number(parsed.zoom) || 1, 0.5, 2),
        showTree: parsed.showTree !== false,
        language: parsed.language === 'zh' ? 'zh' : 'en',
        rememberBoardSize: parsed.rememberBoardSize !== false,
        boardWidth: validBoardSide(parsed.boardWidth),
        boardHeight: validBoardSide(parsed.boardHeight),
        autoPlayDelay: clamp(Number(parsed.autoPlayDelay) || 1000, 200, 5000),
        defaultSize: [9, 13, 19].includes(Number(parsed.defaultSize)) ? Number(parsed.defaultSize) : 13,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  })();

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* session only */ }
  }

  const ZH = {
    File: '文件', Edit: '编辑', Advanced: '高级', Play: '对局', View: '视图', Tools: '工具', Options: '选项', Help: '帮助',
    'New Game': '新建对局', 'Open SGF…': '打开 SGF…', 'Save SGF': '保存 SGF', 'Save SGF As…': '另存为 SGF…', Quit: '退出',
    Undo: '撤销', Redo: '重做', 'Edit Mode': '编辑模式', 'Delete Node': '删除节点',
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
    'Custom Board Size…': '自定义棋盘尺寸…', 'Show Coordinates': '显示坐标', 'Coordinates: A1': '坐标：A1',
    'Coordinates: 1–1': '坐标：1–1', 'Show Move Numbers': '显示手数',
    'No Move Numbers': '不显示手数', 'All Move Numbers': '显示全部手数', 'Last 10 Moves': '最近 10 手',
    'Last 25 Moves': '最近 25 手', 'Last 50 Moves': '最近 50 手', 'Custom Move Count…': '自定义手数范围…',
    'Move numbers: last N moves': '手数：显示最近 N 手',
    'Enter a whole number of moves from 1 to 999.': '请输入 1 到 999 之间的整数手数。',
    'Numbers From Game Start': '从对局开始编号', 'Numbers From Variation Start': '从变化开始编号',
    'Colorize Moves': '手数着色', 'Show Next Moves': '显示下一手', 'Show Sibling Variations': '显示同父变化',
    'Zoom In': '放大', 'Zoom Out': '缩小', 'Reset Zoom': '重置缩放', 'Toggle Full Screen': '切换全屏',
    'Show Game Tree': '显示棋谱树', 'Reset Panel Layout': '重置面板布局',
    'Preferences…': '首选项…', Language: '语言', English: 'English', '简体中文': '简体中文',
    'Remember Last Board Size': '记住上次棋盘尺寸',
    'Autoplay Delay: 0.5 seconds': '自动播放间隔：0.5 秒', 'Autoplay Delay: 1 second': '自动播放间隔：1 秒',
    'Autoplay Delay: 2 seconds': '自动播放间隔：2 秒', 'Autoplay Delay: 3 seconds': '自动播放间隔：3 秒',
    'Reset All Settings': '重置所有设置', 'Keyboard Shortcuts': '快捷键', 'About MultiGo Neo': '关于 MultiGo Neo',
    Info: '信息', Comment: '注释', 'Game Tree': '棋谱树', Message: '消息', Clear: '清除',
    Black: '黑方', 'Black rank': '黑方段位', White: '白方', 'White rank': '白方段位',
    Result: '结果', Komi: '贴目', Handicap: '让子', Rules: '规则', Date: '日期', Event: '赛事',
    Place: '地点', 'Game name': '对局名称', 'Game comment': '对局注释',
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
  let undoStack = [];
  let redoStack = [];
  let autoPlayTimer = null;
  let filePath = null;
  let dirty = false;
  let cursor = null;
  let hover = null;
  let currentBoard = null;
  let lastBoardError = '';

  const currentNode = () => (tree && nodeId != null ? tree.get(nodeId) : null);

  function rootProperty(prop, fallback = null) {
    if (!tree) return fallback;
    const value = tree.root.data[prop];
    return value && value.length && value[0] !== '' ? value[0] : fallback;
  }

  function gameSize() {
    const [width, height] = S.getGameInfo(tree).size;
    return { width, height: height || width };
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
        KM: ['6.5'], RU: ['Japanese'], DT: [todayString()],
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
      blackName: 'PB', blackRank: 'BR', whiteName: 'PW', whiteRank: 'WR',
      result: 'RE', komi: 'KM', handicap: 'HA', rules: 'RU', date: 'DT',
      eventName: 'EV', gameComment: 'GC', gameName: 'GN',
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
  }

  function goToParent() {
    const node = currentNode();
    if (!node || node.parentId == null) { log('Already at the root.', 'warn'); return; }
    selectNode(node.parentId);
  }

  function goToChild() {
    const node = currentNode();
    if (!node || node.children.length === 0) { log('No continuation from this node.', 'warn'); return; }
    selectNode(node.children[0].id);
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
    while (node.children.length) node = node.children[0];
    selectNode(node.id);
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
      if (current && current.children.length) {
        nodeId = current.children[0].id;
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
      renderStatus();
      log(`${signName(sign)} ${coordLabel(x, y)}.`);
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
    if (ok) log(`${signName(sign)} passes.`);
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

  function setSetupStone(x, y, sign) {
    const point = sgfPoint(x, y);
    const node = currentNode();
    if (!node) return;
    const data = node.data;
    const ab = expandValues(data.AB).filter((value) => value !== point);
    const aw = expandValues(data.AW).filter((value) => value !== point);
    const ae = expandValues(data.AE).filter((value) => value !== point);
    const hasStone = currentBoard?.get([x, y]) !== 0;
    if (sign === 0 && !hasStone) return;
    if (sign > 0) ab.push(point);
    else if (sign < 0) aw.push(point);
    else if (hasStone) ae.push(point);

    const changed = mutateTree((draft) => {
      writeList(draft, nodeId, 'AB', ab);
      writeList(draft, nodeId, 'AW', aw);
      writeList(draft, nodeId, 'AE', ae);
    }, { message: sign === 0 ? `Removed stone at ${coordLabel(x, y)}.` : `${signName(sign)} stone at ${coordLabel(x, y)}.` });
    if (changed) { cursor = { x, y }; renderStatus(); }
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
    }, { message: `${has ? 'Removed' : 'Added'} ${tool} at ${coordLabel(x, y)}.` });
    if (changed) { cursor = { x, y }; renderStatus(); }
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
      mutateTree((draft) => removePointFromProperty(draft, nodeId, 'LB', point), { message: 'Label removed.' });
      return;
    }
    const next = [...existing, `${point}:${trimmed}`];
    mutateTree((draft) => {
      for (const markProp of MARK_PROPS) removePointFromProperty(draft, nodeId, markProp, point);
      draft.updateProperty(nodeId, 'LB', next);
    }, { message: `Label ${trimmed} at ${coordLabel(x, y)}.` });
    cursor = { x, y };
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
    mutateTree((draft) => writeList(draft, nodeId, prop, values), { message: index >= 0 ? 'Line removed.' : `${tool === 'arrow' ? 'Arrow' : 'Line'} added.` });
  }

  function addDim(x1, y1, x2, y2) {
    const ranges = [...(currentBoard?.dimmedRanges || [])];
    const colors = { ...(currentBoard?.dimmedColors || {}) };
    const range = S.toDimRange([x1, y1], [x2, y2]);
    const result = S.applyDimRectangle(ranges, colors, range, dimColor);
    const sbkdd = Object.entries(result.colors).map(([key, color]) => `${color}:${key}`);
    mutateTree((draft) => {
      writeList(draft, nodeId, 'DD', result.ranges.length ? result.ranges : ['']);
      writeList(draft, nodeId, 'SBKDD', sbkdd);
    }, { message: 'Dim area updated.' });
  }

  function eraseAt(x, y) {
    const point = sgfPoint(x, y);
    const node = currentNode();
    if (!node) return;
    for (const prop of MARK_PROPS) {
      if (expandValues(node.data[prop]).includes(point)) {
        mutateTree((draft) => removePointFromProperty(draft, nodeId, prop, point), { message: 'Mark erased.' });
        return;
      }
    }
    if ((node.data.LB || []).some((value) => value.startsWith(`${point}:`))) {
      mutateTree((draft) => removePointFromProperty(draft, nodeId, 'LB', point), { message: 'Label erased.' });
      return;
    }
    for (const prop of ['AR', 'LN']) {
      const values = node.data[prop] || [];
      const index = values.findIndex((value) => S.parseLineValue(value).points.includes(point));
      if (index >= 0) {
        mutateTree((draft) => writeList(draft, nodeId, prop, values.filter((_, i) => i !== index)), { message: 'Line erased.' });
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
      mutateTree((draft) => {
        writeList(draft, nodeId, 'DD', ranges.length ? ranges : ['']);
        writeList(draft, nodeId, 'SBKDD', sbkdd);
      }, { message: 'Dim area erased.' });
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
        askText('', 'Label').then((text) => { if (text != null && nodeId === targetId) setLabelAt(x, y, text); });
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

  function drawStone(x, y, sign, radius, alpha = 1) {
    const context = boardContext;
    const { x: px, y: py } = pointPosition(x, y);
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = 'rgba(0,0,0,.34)';
    context.shadowBlur = Math.max(2, radius * 0.3);
    context.shadowOffsetY = Math.max(1, radius * 0.08);
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    if (sign > 0) {
      const gradient = context.createRadialGradient(px - radius * 0.34, py - radius * 0.38, radius * 0.12, px, py, radius * 1.1);
      gradient.addColorStop(0, '#6f6f6f');
      gradient.addColorStop(0.36, '#292929');
      gradient.addColorStop(1, '#000');
      context.fillStyle = gradient;
      context.fill();
    } else {
      const gradient = context.createRadialGradient(px - radius * 0.32, py - radius * 0.36, radius * 0.15, px, py, radius * 1.05);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.65, '#f2f2f2');
      gradient.addColorStop(1, '#c9c9c9');
      context.fillStyle = gradient;
      context.fill();
      context.shadowColor = 'transparent';
      context.lineWidth = Math.max(0.7, radius * 0.055);
      context.strokeStyle = 'rgba(0,0,0,.28)';
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

  function drawBoard() {
    const { cssWidth, cssHeight, spacing } = boardView;
    if (!cssWidth || !cssHeight || !currentBoard) return;
    const context = boardContext;
    const cols = currentBoard.width;
    const rows = currentBoard.height;
    context.clearRect(0, 0, cssWidth, cssHeight);
    const wood = context.createLinearGradient(0, 0, cssWidth, cssHeight);
    wood.addColorStop(0, '#e3bd7d');
    wood.addColorStop(0.48, '#d7a760');
    wood.addColorStop(1, '#c6934c');
    roundRect(context, 0.5, 0.5, cssWidth - 1, cssHeight - 1, 5);
    context.fillStyle = wood;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(91,56,17,.45)';
    context.stroke();

    context.save();
    roundRect(context, 1, 1, cssWidth - 2, cssHeight - 2, 4);
    context.clip();
    for (let line = 0; line < 58; line += 1) {
      const offset = (line * 47) % Math.max(1, Math.round(cssHeight - boardView.margin * 2));
      const y = boardView.margin + offset;
      context.beginPath();
      context.strokeStyle = `rgba(112,67,21,${0.018 + (line % 4) * 0.006})`;
      context.lineWidth = 0.8 + (line % 3) * 0.35;
      for (let x = 0; x <= cssWidth; x += 16) {
        const wave = Math.sin((x + line * 29) * 0.021) * 3.2 + Math.sin((x + line * 7) * 0.047) * 1.2;
        if (x === 0) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }
    context.restore();

    context.strokeStyle = 'rgba(38,22,5,.86)';
    context.lineWidth = 1;
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

    context.fillStyle = 'rgba(37,22,5,.8)';
    for (const star of boardStarPoints(cols, rows)) {
      const { x: px, y: py } = pointPosition(star.x, star.y);
      context.beginPath();
      context.arc(px, py, Math.max(1.6, spacing * 0.075), 0, Math.PI * 2);
      context.fill();
    }

    if (settings.coords) {
      const fontSize = Math.max(8, Math.min(12, Math.round(Math.min(cssWidth, cssHeight) * 0.0155)));
      context.font = `500 ${fontSize}px ${BOARD_FONT}`;
      context.fillStyle = 'rgba(61,39,13,.8)';
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
        if (settings.colorizeMoves) {
          const number = numberMap.get(y * cols + x);
          if (number) {
            const { x: px, y: py } = pointPosition(x, y);
            context.save();
            context.strokeStyle = `hsl(${(number * 47) % 360}, 74%, 46%)`;
            context.lineWidth = Math.max(1.5, stoneRadius * 0.12);
            context.beginPath();
            context.arc(px, py, stoneRadius * 1.02, 0, Math.PI * 2);
            context.stroke();
            context.restore();
          }
        }
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

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const marker = currentBoard.markers?.[y]?.[x];
        if (marker) drawMarker(x, y, marker);
      }
    }

    const hintNode = currentNode();
    const drawHint = (entry, alpha) => {
      const value = (entry.data.B || entry.data.W)?.[0];
      if (!value) return;
      const [x, y] = S.sgf.parseVertex(value);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      drawStone(x, y, entry.data.B ? 1 : -1, stoneRadius * 0.82, alpha);
    };
    if (settings.showNextMoves && hintNode) {
      for (const child of hintNode.children) drawHint(child, 0.34);
    }
    if (settings.showSiblings && hintNode?.parentId != null) {
      const parent = tree.get(hintNode.parentId);
      for (const sibling of parent.children) {
        if (sibling.id !== nodeId) drawHint(sibling, 0.2);
      }
    }

    const node = currentNode();
    const move = node?.data?.B || node?.data?.W;
    if (move && move[0] !== '') {
      const [x, y] = S.sgf.parseVertex(move[0]);
      if (x >= 0 && y >= 0) {
        const { x: px, y: py } = pointPosition(x, y);
        const offset = stoneRadius * 0.55;
        const size = Math.max(3.5, stoneRadius * 0.4);
        const cx = px + offset;
        const cy = py - offset;
        context.beginPath();
        context.moveTo(cx, cy - size * 0.8);
        context.lineTo(cx - size * 0.72, cy + size * 0.55);
        context.lineTo(cx + size * 0.72, cy + size * 0.55);
        context.closePath();
        context.fillStyle = '#d92b2b';
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,.9)';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    if (pending && hover) {
      const start = pointPosition(pending.x, pending.y);
      const end = pointPosition(hover.x, hover.y);
      if (pending.tool === 'dim') {
        const x1 = Math.min(start.x, end.x) - spacing * 0.5;
        const y1 = Math.min(start.y, end.y) - spacing * 0.5;
        context.fillStyle = dimCss(dimColor);
        context.fillRect(x1, y1, Math.abs(start.x - end.x) + spacing, Math.abs(start.y - end.y) + spacing);
      } else {
        context.save();
        context.strokeStyle = lineColor ? colorCss[lineColor] : '#222';
        context.lineWidth = 1.5;
        context.setLineDash([4, 3]);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.restore();
      }
    } else if (hover) {
      if (mode === 'edit') {
        if (selectedTool === 'stone_1' || selectedTool === 'stone_-1') {
          if (currentBoard.get([hover.x, hover.y]) === 0) {
            drawStone(hover.x, hover.y, selectedTool === 'stone_1' ? 1 : -1, stoneRadius, 0.38);
          }
        } else if (selectedTool === 'erase' && currentBoard.get([hover.x, hover.y]) !== 0) {
          const { x: px, y: py } = pointPosition(hover.x, hover.y);
          context.save();
          context.strokeStyle = 'rgba(190,30,30,.85)';
          context.lineWidth = 2.2;
          const arm = stoneRadius * 0.55;
          context.beginPath();
          context.moveTo(px - arm, py - arm);
          context.lineTo(px + arm, py + arm);
          context.moveTo(px + arm, py - arm);
          context.lineTo(px - arm, py + arm);
          context.stroke();
          context.restore();
        }
      } else if (currentBoard.get([hover.x, hover.y]) === 0) {
        drawStone(hover.x, hover.y, playerToMove(), stoneRadius, 0.38);
      }
    }

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
  function nodeLabel(node, dims) {
    if (node.parentId == null) return 'Start';
    if (node.data.B || node.data.W) {
      const value = (node.data.B || node.data.W)[0];
      if (value === '') return 'pass';
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
      button.textContent = node.parentId == null ? 'S' : isMove ? String(moveNumber) : '·';
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
    document.title = `${name}${dirty ? ' •' : ''} — MultiGo Neo`;
    fileLabel.textContent = `${name}${dirty ? ' •' : ''}`;
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
  }

  function syncInfoForm() {
    const info = S.getGameInfo(tree);
    infoFields.black.value = info.blackName || '';
    infoFields.blackRank.value = info.blackRank || '';
    infoFields.white.value = info.whiteName || '';
    infoFields.whiteRank.value = info.whiteRank || '';
    infoFields.result.value = info.result || '';
    infoFields.komi.value = info.komi == null ? '' : String(info.komi);
    infoFields.handicap.value = info.handicap == null ? '' : String(info.handicap);
    infoFields.date.value = info.date || '';
    infoFields.event.value = info.eventName || '';
    infoFields.gameName.value = info.gameName || '';
    infoFields.comment.value = info.gameComment || '';
    infoFields.place.value = rootProperty('PC', '');
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
    if (commentNodeId !== node.id || document.activeElement !== commentInput) {
      commentInput.value = text;
      commentNodeId = node.id;
    }
    renderCommentPreview(commentInput.value);
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
    toolUndo.disabled = undoStack.length === 0;
    toolRedo.disabled = redoStack.length === 0;
    toolFirst.disabled = !hasParent;
    toolPrev.disabled = !hasParent;
    toolNext.disabled = !hasChild;
    toolLast.disabled = !hasChild;
    toolAutoPlay.disabled = !hasChild;
    toolAutoPlay.setAttribute('aria-pressed', String(autoPlaying));
    const autoIcon = toolAutoPlay.querySelector('use');
    if (autoIcon) autoIcon.setAttribute('href', autoPlaying ? '#i-pause' : '#i-autoplay');
    toolPass.disabled = edit;
    toolEdit.setAttribute('aria-pressed', String(edit));
    editbar.hidden = !edit;
    toolTurn.textContent = `${t('Turn')}: ${t(signName(playerToMove()))}`;
    toolTurn.disabled = !edit;
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
      'stone_1': 'Black stone — click to place', 'stone_-1': 'White stone — click to place',
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

  function syncMenuState() {
    const node = currentNode();
    const hasParent = Boolean(node && node.parentId != null);
    const hasChild = Boolean(node && node.children.length);
    const dims = gameSize();
    const presetSquare = dims.width === dims.height && [9, 13, 19].includes(dims.width);
    setMenuItemChecked('toggle-coords', settings.coords);
    setMenuItemChecked('coords-a1', settings.coords && settings.coordinatesStyle === 'A1');
    setMenuItemChecked('coords-11', settings.coords && settings.coordinatesStyle === '1-1');
    setMenuItemChecked('numbers-start', settings.moveNumberLimit >= 0 && settings.moveNumbersMode === 'start');
    setMenuItemChecked('numbers-variation', settings.moveNumberLimit >= 0 && settings.moveNumbersMode === 'variation');
    for (const item of $$('.menu-item[data-number-limit]')) {
      const limit = Number(item.dataset.numberLimit);
      const checked = limit === -1 ? settings.moveNumberLimit < 0 : settings.moveNumberLimit === limit;
      item.setAttribute('aria-checked', String(checked));
    }
    setMenuItemChecked('numbers-custom', settings.moveNumberLimit > 0 && ![10, 25, 50].includes(settings.moveNumberLimit));
    setMenuItemChecked('toggle-colorize', settings.colorizeMoves);
    setMenuItemChecked('toggle-next-moves', settings.showNextMoves);
    setMenuItemChecked('toggle-siblings', settings.showSiblings);
    setMenuItemChecked('toggle-tree', settings.showTree);
    setMenuItemChecked('language-en', settings.language !== 'zh');
    setMenuItemChecked('language-zh', settings.language === 'zh');
    setMenuItemChecked('toggle-remember-size', settings.rememberBoardSize !== false);
    for (const item of $$('.menu-item[data-delay]')) {
      item.setAttribute('aria-checked', String(Number(item.dataset.delay) === Number(settings.autoPlayDelay)));
    }
    setMenuItemChecked('toggle-edit', mode === 'edit');
    setMenuItemChecked('toggle-autoplay', Boolean(autoPlayTimer));
    autoplayLabel.textContent = t(autoPlayTimer ? 'Pause Auto Play' : 'Auto Play');
    for (const item of $$('.menu-item[data-size]')) {
      const value = item.dataset.size;
      const checked = value === 'custom'
        ? !presetSquare
        : dims.width === Number(value) && dims.height === Number(value);
      item.setAttribute('aria-checked', String(checked));
    }
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
  [aboutDialog, shortcutsDialog, preferencesDialog, labelDialog, customSizeDialog].forEach((dialog) => {
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
      applySgfText(result.content, result.filePath);
    } else {
      sgfFileInput.value = '';
      sgfFileInput.click();
    }
  }

  sgfFileInput.addEventListener('change', async () => {
    const file = sgfFileInput.files?.[0];
    if (!file) return;
    try { applySgfText(await file.text(), file.name); }
    catch (error) { log(`Could not read the file: ${error.message}`, 'error'); }
  });

  async function saveSgf(saveAs = false) {
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
      updateTitle();
      log(`Saved ${basename(filePath)}.`, 'success');
    } else {
      const name = defaultSgfName();
      downloadText(content, name);
      filePath = name;
      dirty = false;
      updateTitle();
      log(`Downloaded ${name}.`, 'success');
    }
  }

  function applySgfText(text, source) {
    let roots;
    try { roots = S.sgf.parse(text, { getId }); }
    catch (error) { log(`Could not parse ${source}: ${error.message}`, 'error'); return; }
    if (!roots.length) { log('The SGF contains no games.', 'error'); return; }
    if (roots.length > 1) log('Only the first game in the SGF collection was loaded.', 'warn');
    stopAutoPlay();
    try { tree = new S.GameTree({ root: roots[0], getId, merger: S.nodeMerger }); }
    catch (error) { log(`Could not build the game tree: ${error.message}`, 'error'); return; }
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
    syncSizeSelect();
    syncInfoForm();
    setTab('info');
    renderAll();
    resizeBoard();
    updateTitle();
    const { width, height } = gameSize();
    rememberBoardSize(width, height);
    if (rootProperty('GM', '1') !== '1') log('This SGF is not marked as a Go game (GM != 1).', 'warn');
    log(`Loaded ${basename(source)} — ${tree.getHeight()} nodes.`, 'success');
  }

  async function copySgf() {
    try {
      await navigator.clipboard.writeText(S.sgf.stringify([tree.root], { linebreak: '\n', indent: '  ' }));
      log('SGF copied to the clipboard.', 'success');
    } catch { log('Clipboard write was blocked by the browser.', 'warn'); }
  }

  async function pasteSgf() {
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
    mutateTree((draft) => { for (const prop of props) draft.removeProperty(nodeId, prop); }, { message: 'Markup cleared on this node.' });
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
    const node = currentNode();
    if (!node || node.parentId == null) { log('The root node cannot be cut.', 'warn'); return; }
    const parentId = node.parentId;
    await copyVariation();
    mutateTree((draft) => draft.removeNode(node.id), { select: parentId, message: 'Node cut to the variation clipboard.' });
  }

  async function pasteVariation() {
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
    commentInput.focus();
  }

  function toggleEditMode() {
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
    mutateTree((draft) => draft.updateProperty(nodeId, 'PL', [value]), { message: `Next player: ${value === 'B' ? 'Black' : 'White'}.` });
  }

  function selectTool(tool) {
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
      const action = menuActions[item.dataset.action];
      closeMenus();
      if (action) runAction(action);
    });
  });

  document.addEventListener('pointerdown', (event) => { if (activeMenu && !activeMenu.contains(event.target)) closeMenus(); }, true);
  window.addEventListener('blur', () => closeMenus());

  const menuActions = {
    'new-game': newGame, 'open-sgf': openSgf,
    'save-sgf': () => saveSgf(false), 'save-sgf-as': () => saveSgf(true),
    quit: quitApp, undo, redo, 'toggle-edit': toggleEditMode,
    'delete-node': deleteNode, 'make-main': makeMainVariation,
    'cut-variation': cutVariation, 'copy-variation': copyVariation, 'paste-variation': pasteVariation,
    'duplicate-node': duplicateNode, 'insert-node': insertEmptyNode,
    'flatten-variation': flattenVariation, 'focus-comment': focusComment,
    'shift-left': () => shiftVariation('left'), 'shift-right': () => shiftVariation('right'),
    'remove-siblings': removeOtherVariations, 'clear-markup': clearNodeMarkup,
    'focus-info': () => { setTab('info'); infoFields.black.focus(); },
    pass: passTurn, 'toggle-autoplay': toggleAutoPlay,
    first: goToBeginning, prev: goToParent, next: goToChild, last: goToEnd,
    'toggle-coords': toggleCoordinates, 'toggle-numbers': toggleMoveNumbers,
    'coords-a1': () => setCoordinatesStyle('A1'), 'coords-11': () => setCoordinatesStyle('1-1'),
    'numbers-start': () => setMoveNumbersMode('start'), 'numbers-variation': () => setMoveNumbersMode('variation'),
    'numbers-none': () => setMoveNumberLimit(-1), 'numbers-all': () => setMoveNumberLimit(0),
    'numbers-10': () => setMoveNumberLimit(10), 'numbers-25': () => setMoveNumberLimit(25),
    'numbers-50': () => setMoveNumberLimit(50), 'numbers-custom': promptMoveNumberLimit,
    'toggle-colorize': () => toggleSettingFlag('colorizeMoves', (on) => `Move colorization ${on ? 'enabled' : 'disabled'}.`),
    'toggle-next-moves': () => toggleSettingFlag('showNextMoves', (on) => `Next moves ${on ? 'shown' : 'hidden'}.`),
    'toggle-siblings': () => toggleSettingFlag('showSiblings', (on) => `Sibling variations ${on ? 'shown' : 'hidden'}.`),
    'zoom-in': () => setZoom(settings.zoom * 1.15),
    'zoom-out': () => setZoom(settings.zoom / 1.15),
    'zoom-reset': () => setZoom(1),
    'toggle-fullscreen': toggleFullScreen,
    'toggle-tree': toggleTree,
    'language-en': () => setLanguage('en'), 'language-zh': () => setLanguage('zh'),
    'toggle-remember-size': toggleRememberBoardSize,
    'delay-500': () => setAutoplayDelay(500), 'delay-1000': () => setAutoplayDelay(1000),
    'delay-2000': () => setAutoplayDelay(2000), 'delay-3000': () => setAutoplayDelay(3000),
    'reset-settings': resetAllSettings,
    'reset-layout': resetLayout, 'copy-sgf': copySgf, 'paste-sgf': pasteSgf,
    'clear-messages': clearMessages, 'toggle-turn': toggleTurn,
    preferences: showPreferences, shortcuts: showShortcuts, about: showAbout,
    'size-9': () => changeBoardSize(9, 9), 'size-13': () => changeBoardSize(13, 13),
    'size-19': () => changeBoardSize(19, 19), 'size-custom': promptCustomSize,
  };

  // Game info / preferences / help --------------------------------------
  const INFO_BINDINGS = {
    black: 'PB', blackRank: 'BR', white: 'PW', whiteRank: 'WR',
    result: 'RE', komi: 'KM', handicap: 'HA', rules: 'RU',
    date: 'DT', event: 'EV', place: 'PC', gameName: 'GN', comment: 'GC',
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
    applyLayout({ ...DEFAULT_LAYOUT });
    applyViewState();
    log('Panel layout reset.');
  }

  function showPreferences() {
    prefSize.value = String(settings.defaultSize);
    prefDelay.value = String(settings.autoPlayDelay);
    prefCoords.checked = settings.coords;
    prefNumbers.checked = settings.moveNumberLimit >= 0;
    if (!preferencesDialog.open) preferencesDialog.showModal();
  }

  $('#pref-save').addEventListener('click', () => {
    settings.defaultSize = Number(prefSize.value) || 13;
    settings.boardWidth = settings.defaultSize;
    settings.boardHeight = settings.defaultSize;
    settings.autoPlayDelay = clamp(Number(prefDelay.value) || 1000, 200, 5000);
    settings.coords = prefCoords.checked;
    settings.moveNumberLimit = prefNumbers.checked ? 0 : -1;
    saveSettings();
    preferencesDialog.close();
    updateToolbar();
    syncMenuState();
    scheduleBoardDraw();
    paneBoard.classList.toggle('is-zoomed', settings.zoom > 1.001);
    if (autoPlayTimer) { stopAutoPlay(); toggleAutoPlay(); }
    log('Preferences saved.', 'success');
  });

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
      if (mode !== 'edit') return;
      const point = pointFromEvent(event);
      if (point) { event.preventDefault(); eraseAt(point.x, point.y); }
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
      startGame({ width: w, height: h }, { info: S.getGameInfo(tree) });
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
    paneBoard.style.flex = `0 0 ${layout.leftPct}%`;
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
    const initialSize = settings.rememberBoardSize !== false && settings.boardWidth && settings.boardHeight
      ? { width: settings.boardWidth, height: settings.boardHeight }
      : settings.defaultSize;
    startGame(initialSize, { persistSize: false });
    applyViewState();
    applyLanguage();
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
      settings: () => ({ ...settings }),
      lineWidths: () => ({ arrow: GAME_MARK_ARROW_WIDTH, line: GAME_MARK_LINE_WIDTH }),
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
