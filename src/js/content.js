// content.js - 在页面中运行的核心提取脚本

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action);
  
  switch(request.action) {
    case 'detectTables':
      sendResponse(detectTables());
      break;
      
    case 'exportTable':
      const result = exportTableData(request.tableIndex, request.format);
      sendResponse(result);
      break;
      
    default:
      sendResponse({error: '未知操作'});
  }
  
  return true; // 保持消息通道开放
});

// 检测页面中的所有表格
function detectTables() {
  const tables = document.querySelectorAll('table');
  
  return Array.from(tables).map((table, index) => {
    // 获取表格基本信息
    const rows = table.rows.length;
    const cols = table.rows[0]?.cells.length || 0;
    
    // 获取预览数据（前3行）
    const preview = [];
    const previewRows = Array.from(table.querySelectorAll('tr')).slice(0, 3);
    previewRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
        cell.innerText.trim().substring(0, 15)
      );
      preview.push(cells);
    });
    
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
    return {error: '表格不存在'};
  }
  
  try {
    let data, ext;
    
    switch(format) {
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
        return {error: '不支持的格式'};
    }
    
    return {data, ext};
    
  } catch (error) {
    return {error: error.message};
  }
}

// CSV转换
function toCSV(table) {
  const rows = table.querySelectorAll('tr');
  return Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td, th');
    return Array.from(cells).map(cell => {
      let text = cell.innerText.trim()
        .replace(/\s+/g, ' ')
        .replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    }).join(',');
  }).join('\n');
}

// JSON转换
function toJSON(table) {
  // 获取表头
  const thead = table.querySelector('thead');
  let headers = [];
  
  if (thead) {
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
      headers = Array.from(headerRow.querySelectorAll('th, td')).map(th => 
        th.innerText.trim() || '未命名'
      );
    }
  } else {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      headers = Array.from(firstRow.querySelectorAll('th, td')).map((cell, i) => 
        cell.innerText.trim() || `列${i + 1}`
      );
    }
  }
  
  // 获取数据行
  const rows = table.querySelectorAll('tr');
  const startIndex = thead ? 0 : 1; // 如果没有thead，跳过第一行
  
  const data = Array.from(rows).slice(startIndex).map(row => {
    const obj = {};
    const cells = row.querySelectorAll('td');
    cells.forEach((cell, i) => {
      if (i < headers.length) {
        obj[headers[i]] = cell.innerText.trim();
      } else {
        obj[`额外列${i + 1}`] = cell.innerText.trim();
      }
    });
    return obj;
  }).filter(row => Object.keys(row).length > 0);
  
  return JSON.stringify(data, null, 2);
}

// Markdown转换
function toMarkdown(table) {
  const rows = table.querySelectorAll('tr');
  const md = [];
  
  rows.forEach((row, i) => {
    const cells = row.querySelectorAll('td, th');
    const rowText = Array.from(cells)
      .map(cell => cell.innerText.trim().replace(/\|/g, '\\|'))
      .join(' | ');
    
    if (i === 0) {
      md.push(`| ${rowText} |`);
      md.push(`|${Array.from(cells).map(() => ' --- ').join('|')}|`);
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

console.log('✅ 表格导出工具内容脚本已加载');