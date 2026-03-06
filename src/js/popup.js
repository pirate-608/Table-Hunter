// popup.js - 简化版

// 状态管理
let tables = [];
let selectedTableIndex = -1;
let currentFormat = 'csv';

// DOM元素
const mainContent = document.getElementById('mainContent');
const tableCount = document.getElementById('tableCount');
const refreshBtn = document.getElementById('refreshBtn');

// 初始化
document.addEventListener('DOMContentLoaded', loadTables);

// popup关闭时取消高亮
window.addEventListener('unload', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'unhighlightTable' });
  } catch (e) { }
});

// 刷新按钮
refreshBtn.addEventListener('click', loadTables);

// 加载表格
async function loadTables() {
  showLoading();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 确保content script已注入
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/content.js']
    });

    // 向content.js发送消息
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectTables' });

    tables = response || [];
    tableCount.textContent = tables.length;

    if (tables.length === 0) {
      showEmptyState();
    } else {
      renderSelector();
      if (tables.length > 0) {
        selectTable(0);
      }
    }

  } catch (error) {
    console.error('加载失败:', error);
    showError('无法连接到页面，请刷新后重试');
  }
}

// 工具函数：加载模板
async function loadTemplate(path) {
  const res = await fetch(path);
  return await res.text();
}

// 显示加载状态
async function showLoading() {
  mainContent.innerHTML = await loadTemplate('templates/loading.html');
}

// 显示空状态
async function showEmptyState() {
  mainContent.innerHTML = await loadTemplate('templates/empty.html');
}

// 显示错误
async function showError(message) {
  let tpl = await loadTemplate('templates/error.html');
  tpl = tpl.replace('{{message}}', message);
  mainContent.innerHTML = tpl;
}

// 导出表格
async function exportTable(action) {
  if (selectedTableIndex === -1) {
    updateStatus('❌ 请先选择一个表格', true);
    return;
  }

  const format = currentFormat;
  const filename = document.getElementById('filenameInput').value.trim() || 'exported_table';

  updateStatus('⏳ 正在导出...', true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 向content.js发送导出请求
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'exportTable',
      tableIndex: selectedTableIndex,
      format: format
    });

    if (result.error) {
      updateStatus(`❌ ${result.error}`, true);
      return;
    }

    if (action === 'download') {
      // 根据导出格式设置MIME type
      let mimeType = 'text/plain;charset=utf-8';
      switch (result.ext) {
        case 'csv':
          mimeType = 'text/csv;charset=utf-8';
          break;
        case 'json':
          mimeType = 'application/json;charset=utf-8';
          break;
        case 'md':
          mimeType = 'text/markdown;charset=utf-8';
          break;
        case 'html':
          mimeType = 'text/html;charset=utf-8';
          break;
        case 'xls':
          mimeType = 'application/vnd.ms-excel';
          break;
      }
      const blob = new Blob([result.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

      await chrome.downloads.download({
        url: url,
        filename: `${filename}_${timestamp}.${result.ext}`,
        conflictAction: 'uniquify'
      });

      URL.revokeObjectURL(url);
      updateStatus(`✅ 已导出为 ${format.toUpperCase()} 格式`);
    } else {
      await navigator.clipboard.writeText(result.data);
      updateStatus(`✅ 已复制到剪贴板 (${format.toUpperCase()})`);
    }

  } catch (error) {
    updateStatus(`❌ 导出失败: ${error.message}`, true);
  }
}

// 渲染表格选择器
async function renderSelector() {
  let tpl = await loadTemplate('templates/selector.html');
  // 动态插入option
  const options = tables.map(t => `\n<option value="${t.index}">${t.name} (${t.rows}行 × ${t.cols}列)</option>`).join('');
  tpl = tpl.replace('<!-- 动态插入option -->', options);
  mainContent.innerHTML = tpl;

  // 绑定事件
  const tableSelect = document.getElementById('tableSelect');
  const formatBtns = document.querySelectorAll('.format-btn');
  const filenameInput = document.getElementById('filenameInput');
  const exportBtn = document.getElementById('exportBtn');
  const copyBtn = document.getElementById('copyBtn');
  const previewBtn = document.getElementById('previewBtn');
  const statsBtn = document.getElementById('statsBtn');

  // 表格选择变化
  tableSelect.addEventListener('change', (e) => {
    selectTable(parseInt(e.target.value));
  });

  // 格式切换
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.format;
    });
  });

  // 导出文件
  exportBtn.addEventListener('click', () => {
    exportTable('download');
  });

  // 复制到剪贴板
  copyBtn.addEventListener('click', () => {
    exportTable('copy');
  });

  // 预览
  previewBtn.addEventListener('click', () => {
    previewData();
  });

  // 统计信息
  statsBtn.addEventListener('click', () => {
    showTableStats();
  });

  // 默认选中第一个表格
  selectTable(parseInt(tableSelect.value));
}

// 选择表格
async function selectTable(index) {
  selectedTableIndex = index;
  const table = tables[index];
  if (!table) return;

  renderPreview(table);
  updateStatus(`已选择: ${table.name} (${table.rows}行 × ${table.cols}列)`);

  // 高亮页面上对应的表格
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'highlightTable', tableIndex: index });
  } catch (e) { }
}

// 渲染预览
async function renderPreview(table) {
  let tpl = await loadTemplate('templates/preview.html');
  const stats = `${table.rows}行 × ${table.cols}列${table.hasThead ? ' | 含表头' : ''}`;
  tpl = tpl.replace('{{stats}}', stats);
  let previewRows = '';
  if (table.preview && table.preview.length > 0) {
    table.preview.forEach(row => {
      previewRows += '<div class="preview-row">';
      row.forEach(cell => {
        previewRows += `<span style="min-width: 60px;">${cell || '—'}</span>`;
      });
      previewRows += '</div>';
    });
    if (table.rows > 3) {
      previewRows += `<div style="color: #94a3b8; margin-top: 6px;">⋯ 还有 ${table.rows - 3} 行</div>`;
    }
  } else {
    previewRows = '<div class="preview-content" style="color: #94a3b8;">无预览数据</div>';
  }
  tpl = tpl.replace('<!-- 动态插入预览数据 -->', previewRows);
  const previewSection = document.getElementById('previewSection');
  if (previewSection) previewSection.innerHTML = tpl;
}

// 预览数据
async function previewData() {
  if (selectedTableIndex === -1) {
    updateStatus('❌ 请先选择一个表格', true);
    return;
  }
  const format = currentFormat;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'exportTable',
      tableIndex: selectedTableIndex,
      format: format
    });
    if (result.error) {
      updateStatus(`❌ ${result.error}`, true);
      return;
    }
    // 加载新窗口模板
    let tpl = await loadTemplate('templates/preview-window.html');
    tpl = tpl.replace(/{{format}}/g, format.toUpperCase());
    tpl = tpl.replace('{{stats}}', `${tables[selectedTableIndex].rows}行 × ${tables[selectedTableIndex].cols}列`);
    tpl = tpl.replace('{{data}}', result.data.replace(/</g, '&lt;'));
    const previewWindow = window.open('', '_blank', 'width=900,height=700');
    previewWindow.document.write(tpl);
  } catch (error) {
    updateStatus(`❌ 预览失败: ${error.message}`, true);
  }
}

// 显示表格统计
async function showTableStats() {
  if (selectedTableIndex === -1) {
    updateStatus('❌ 请先选择一个表格', true);
    return;
  }

  const table = tables[selectedTableIndex];

  const stats = {
    '📊 表格名称': table.name,
    '📏 总行数': table.rows,
    '📐 总列数': table.cols,
    '🔢 单元格总数': table.rows * table.cols,
    '🎯 包含表头': table.hasThead ? '✓' : '✗',
    '📦 包含表体': table.hasTbody ? '✓' : '✗'
  };

  let statsText = '';
  for (const [key, value] of Object.entries(stats)) {
    statsText += `${key}: ${value}\n`;
  }

  alert(statsText);
}

// 更新状态信息
function updateStatus(message, isTemp = false) {
  const statusEl = document.getElementById('statusMessage');
  if (statusEl) {
    statusEl.innerHTML = message;
    if (isTemp) {
      setTimeout(() => {
        if (selectedTableIndex !== -1) {
          const table = tables[selectedTableIndex];
          statusEl.innerHTML = `已选择: ${table.name} (${table.rows}行 × ${table.cols}列)`;
        } else {
          statusEl.innerHTML = '选择表格开始导出';
        }
      }, 3000);
    }
  }
}