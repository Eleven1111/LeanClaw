import { describe, expect, it } from 'vitest'
import { normalizePdfText, parseSharedStrings, parseWorksheetXml } from '../src/runtime/document-files'

describe('PDF 文本规范化', () => {
  it('移除 PDFKit 产生的 NUL 并规范换行', () => {
    expect(normalizePdfText('委\0托\r\n\r\n书\0')).toBe('委托\n\n书')
  })
})

describe('XLSX OOXML 解析', () => {
  it('解析 shared strings 与工作表为 Markdown 表格', () => {
    const shared = parseSharedStrings('<?xml version="1.0"?><sst><si><t>姓名</t></si><si><t>张三</t></si><si><t>备注 &amp; 状态</t></si></sst>')
    expect(shared).toEqual(['姓名', '张三', '备注 & 状态'])
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>'
    expect(parseWorksheetXml(sheet, shared)).toBe('| 姓名 | 备注 & 状态 |\n| --- | --- |\n| 张三 | 42 |')
  })

  it('处理空单元格、inlineStr 与公式缓存值', () => {
    const sheet = '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>标题</t></is></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'
    expect(parseWorksheetXml(sheet, [])).toContain('| 标题 |  | 2 |')
  })
})
