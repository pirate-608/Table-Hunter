// content.js - 在页面中运行的核心提取脚本

// 将表格展开为规则二维数组，正确处理colspan/rowspan
function expandTable(table) {
  const trs = table.querySelectorAll('tr');
  const grid = [];

  trs.forEach((tr, rowIdx) => {
    if (!grid[rowIdx]) grid[rowIdx] = [];
    const cells = tr.querySelectorAll('td, th');

    cells.forEach(cell => {
      const colspan = parseInt(cell.getAttribute('colspan')) || 1;
      const rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
      const text = cell.innerText.trim();

      // 找当前行第一个空位
      let colIdx = 0;
      while (grid[rowIdx][colIdx] !== undefined) colIdx++;

      // 填充所有被合并覆盖的位置
      for (let r = 0; r < rowspan; r++) {
        for (let c = 0; c < colspan; c++) {
          if (!grid[rowIdx + r]) grid[rowIdx + r] = [];
          grid[rowIdx + r][colIdx + c] = text;
        }
      }
    });
  });

  return grid;
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action);

  switch (request.action) {
    case 'detectTables':
      sendResponse(detectTables());
      break;

    case 'exportTable':
      const result = exportTableData(request.tableIndex, request.format);
      sendResponse(result);
      break;

    case 'highlightTable':
      highlightTable(request.tableIndex);
      sendResponse({ ok: true });
      break;

    case 'unhighlightTable':
      unhighlightTable();
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: '未知操作' });
  }

  return true; // 保持消息通道开放
});

// 检测页面中的所有表格
function detectTables() {
  const tables = document.querySelectorAll('table');

  return Array.from(tables).map((table, index) => {
    // 展开合并单元格后计算准确的行列数
    const grid = expandTable(table);
    const rows = grid.length;
    const cols = grid.reduce((max, row) => Math.max(max, row.length), 0);

    // 获取预览数据（前3行），基于展开后的数据
    const preview = grid.slice(0, 3).map(row =>
      row.map(cell => (cell || '').substring(0, 15))
    );

    // 获取表格标识
    const caption = table.caption ? table.caption.textContent.trim() : '';
    const id = table.id ? `#${table.id}` : '';
    const className = table.className ? `.${table.className.split(' ')[0]}` : '';
    const name = caption || id || className || `表格 ${index + 1}`;

    return {
      index,
      name,
      rows,
      cols,
      preview,
      hasThead: table.querySelector('thead') !== null,
      hasTbody: table.querySelector('tbody') !== null
    };
  }).filter(t => t.rows > 0 && t.cols > 0); // 过滤空表格
}

// 导出表格数据
function exportTableData(tableIndex, format) {
  const tables = document.querySelectorAll('table');
  const table = tables[tableIndex];

  if (!table) {
    return { error: '表格不存在' };
  }

  try {
    let data, ext;

    switch (format) {
      case 'csv':
        data = toCSV(table);
        ext = 'csv';
        break;
      case 'json':
        data = toJSON(table);
        ext = 'json';
        break;
      case 'markdown':
        data = toMarkdown(table);
        ext = 'md';
        break;
      case 'html':
        data = toHTML(table);
        ext = 'html';
        break;
      case 'excel':
        data = toExcel(table);
        ext = 'xls';
        break;
      default:
        return { error: '不支持的格式' };
    }

    return { data, ext };

  } catch (error) {
    return { error: error.message };
  }
}

// CSV转换
function toCSV(table) {
  const grid = expandTable(table);
  return grid.map(row =>
    row.map(cell => {
      let text = (cell || '').replace(/\s+/g, ' ').replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    }).join(',')
  ).join('\n');
}

// JSON转换
function toJSON(table) {
  const grid = expandTable(table);
  if (grid.length === 0) return '[]';

  // 第一行作为表头
  const headers = grid[0].map((h, i) => (h || '').trim() || `列${i + 1}`);

  const data = grid.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = (row[i] || '').trim();
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));

  return JSON.stringify(data, null, 2);
}

// Markdown转换
function toMarkdown(table) {
  const grid = expandTable(table);
  if (grid.length === 0) return '';
  const md = [];

  grid.forEach((row, i) => {
    const rowText = row.map(cell => (cell || '').replace(/\|/g, '\\|')).join(' | ');
    if (i === 0) {
      md.push(`| ${rowText} |`);
      md.push(`|${row.map(() => ' --- ').join('|')}|`);
    } else {
      md.push(`| ${rowText} |`);
    }
  });

  return md.join('\n');
}

// HTML转换
function toHTML(table) {
  return table.outerHTML;
}

// Excel转换（HTML格式，但改扩展名）
function toExcel(table) {
  const clone = table.cloneNode(true);
  clone.removeAttribute('style');
  clone.removeAttribute('class');

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Table</title>
    <style>
        table { border-collapse: collapse; }
        td, th { border: 1px solid #999; padding: 8px; }
    </style>
</head>
<body>
    ${clone.outerHTML}
</body>
</html>`;
}

// 高亮表格
function highlightTable(tableIndex) {
  unhighlightTable();
  const tables = document.querySelectorAll('table');
  const table = tables[tableIndex];
  if (!table) return;

  const overlay = document.createElement('div');
  overlay.id = '__table_hunter_highlight__';
  const rect = table.getBoundingClientRect();
  Object.assign(overlay.style, {
    position: 'absolute',
    top: (window.scrollY + rect.top - 4) + 'px',
    left: (window.scrollX + rect.left - 4) + 'px',
    width: (rect.width + 8) + 'px',
    height: (rect.height + 8) + 'px',
    border: '3px solid #2563eb',
    borderRadius: '6px',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'opacity 0.2s'
  });
  document.body.appendChild(overlay);
  table.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 取消高亮
function unhighlightTable() {
  const existing = document.getElementById('__table_hunter_highlight__');
  if (existing) existing.remove();
}

console.log('✅ 表格导出工具内容脚本已加载');